// notify-message: phone notifications for the site's editors when someone sends a message through the site.
// - The database calls it after every new message (trigger messages_notify, through pg_net). It trusts nothing
//   in the call: it asks the database which messages haven't been announced yet (push_claim) and announces
//   each one once, so an extra or forged call can't repeat or invent anything.
// - The edit page calls it for the public key ({"action":"key"}) and, signed in, to send a test
//   ({"action":"test","endpoint":...}).
// - Every 5 minutes, if something scheduled has gone live, the database's announce-scheduled job calls it with
//   {"action":"live"}. Again it trusts nothing in the call: it asks the database (live_claim) what has gone live and
//   not been announced yet, and announces each one once.
// - Its VAPID keys are made here on first use and kept in push_state, which only the server can read.
// - Each notification is encrypted for the device it goes to. It says the topic and who it's from, never the message.
// Deployed with verify_jwt off: it checks callers itself, as above.
import { makeVapidKeys, sendPush } from "./webpush.js";

const API = Deno.env.get("SUPABASE_URL")!;
const json = (s?: string) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
const SECRET: string = json(Deno.env.get("SUPABASE_SECRET_KEYS")).default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE: string = json(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")).default || Deno.env.get("SUPABASE_ANON_KEY")!;
const CONTACT = "https://dj-jackjack.github.io/Rescue-Site-Build/"; // who push services can contact about these notifications
const BRAND = "TheTerr0rTw!ns ·"; // starts every title, so it's clear the notification is about the site
const TOPICS: Record<string, string> = { partner: "Partnership", help: "Help keeping a pet", dog: "About a dog", sniffari: "Day-out program", request: "Video request or question", other: "Something else" };
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/; // nowhere else
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// New secret keys go on the apikey header only; the legacy service_role key is a JWT and goes on both.
const keyHeaders = (k: string): Record<string, string> => (k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}/rest/v1/${path}`, { ...init, headers: { ...keyHeaders(SECRET), "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

type Vapid = { publicKey: string; privateJwk: JsonWebKey };
type Sub = { endpoint: string; p256dh: string; auth: string };
let vapidKeys: Vapid | null = null;
async function vapid(): Promise<Vapid> {
  if (vapidKeys) return vapidKeys;
  let [s] = await db("push_state?id=eq.1&select=vapid_public,vapid_private");
  if (!s?.vapid_public) {
    const k = await makeVapidKeys();
    await db("push_state?id=eq.1&vapid_public=is.null", { method: "PATCH", body: JSON.stringify({ vapid_public: k.publicKey, vapid_private: k.privateJwk }) });
    [s] = await db("push_state?id=eq.1&select=vapid_public,vapid_private"); // if two calls raced, both use the one that was saved
  }
  return (vapidKeys = { publicKey: s.vapid_public, privateJwk: s.vapid_private });
}

async function deliver(subs: Sub[], data: Record<string, unknown>, topic = "messages") {
  const keys = await vapid();
  let sent = 0;
  await Promise.all(subs.map(async s => {
    let host = "";
    try { host = new URL(s.endpoint).hostname; } catch { /* not a URL */ }
    if (!PUSH_HOSTS.test(host)) return console.error("skipped a device with an unknown push service", host);
    try {
      const { status, text } = await sendPush(s, data, keys, CONTACT, topic);
      if (status === 404 || status === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      else if (status >= 400) console.error("push refused", status, host, text.slice(0, 300));
      else sent++;
    } catch (e) { console.error("push error", host, String(e)); }
  }));
  return sent;
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
async function announceNew() {
  const { messages = [], unhandled = 0 } = (await db("rpc/push_claim", { method: "POST", body: "{}" })) || {};
  if (!messages.length) return { sent: 0, messages: 0 };
  const last = messages[messages.length - 1];
  const what = `${TOPICS[last.topic] || "Message"}, ${last.name ? `from ${short(String(last.name), 60)}` : "no name given"}`;
  const data = messages.length === 1
    ? { title: `${BRAND} New message`, body: what }
    : { title: `${BRAND} ${messages.length} new messages`, body: `Latest: ${what}` };
  const subs: Sub[] = await db("push_subscriptions?select=endpoint,p256dh,auth");
  return { sent: await deliver(subs, { ...data, count: unhandled, url: "./#/messages" }), messages: messages.length };
}

// Things that were scheduled and have now gone live on the site.
async function announceLive() {
  const { items = [] } = (await db("rpc/live_claim", { method: "POST", body: "{}" })) || {};
  if (!items.length) return { sent: 0, items: 0 };
  const name = (i: { what?: string; title?: string }) => `${i.what || "Post"}: ${short(String(i.title || ""), 80)}`;
  const data = items.length === 1
    ? { title: `${BRAND} Now live on the site`, body: name(items[0]) }
    : { title: `${BRAND} ${items.length} things went live`, body: items.slice(0, 3).map(name).join(" · ") + (items.length > 3 ? ` and ${items.length - 3} more` : "") };
  const subs: Sub[] = await db("push_subscriptions?select=endpoint,p256dh,auth");
  return { sent: await deliver(subs, { ...data, url: "./#/scheduled" }, "live"), items: items.length };
}

async function sendTest(req: Request, endpoint: string) {
  const u = await fetch(`${API}/auth/v1/user`, { headers: { apikey: PUBLISHABLE, Authorization: req.headers.get("authorization") || "" } });
  if (!u.ok) return reply(401, { error: "You've been signed out. Please sign in again." });
  const email = String((await u.json()).email || "").toLowerCase();
  if (!email || !(await db(`admins?select=email&email=eq.${encodeURIComponent(email)}`)).length) return reply(403, { error: "This account isn't on the editor list." });
  const subs: Sub[] = await db(`push_subscriptions?select=endpoint,p256dh,auth&endpoint=eq.${encodeURIComponent(endpoint)}`);
  if (!subs.length) return reply(404, { error: "This device isn't signed up for notifications. Turn them on first." });
  const sent = await deliver(subs, { title: `${BRAND} Notifications are on ✓`, body: "New messages from the site will show up like this.", url: "./#/messages" });
  return sent ? reply(200, { sent }) : reply(502, { error: "The test didn't go through. Try turning notifications off and on again." });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const body = json((await req.text()).slice(0, 4000));
  try {
    if (body.action === "key") return reply(200, { key: (await vapid()).publicKey });
    if (body.action === "test") return await sendTest(req, String(body.endpoint || ""));
    if (body.action === "live") return reply(200, await announceLive());
    return reply(200, await announceNew());
  } catch (e) {
    console.error(String(e));
    return reply(500, { error: "The notification service had a problem. Please try again." });
  }
});
