// submit-fanart: the Fan Art page's form. It takes a piece of art and the sender's details, checks them, and keeps
// them for Taea to look at: the image in the private fanart-inbox bucket, the details in fanart_submissions, which
// only editors can read. Nothing shows on the site until she approves it on the edit page.
// - The sender's browser has already redrawn the art as a JPEG, so it carries no location or camera data. This checks
//   that it is a JPEG of a sensible size, and that the boxes on the form were ticked.
// - Each email can send 5 a day, and everyone together 30 an hour (fanart_room, checked again by fanart_add).
// - Saving the row sends the editors a phone alert (the fanart_notify trigger asks notify-message).
// Deployed with verify_jwt off: anyone can send art, and everything is checked here.

const API = Deno.env.get("SUPABASE_URL")!;
const json = (s?: string) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
const SECRET: string = json(Deno.env.get("SUPABASE_SECRET_KEYS")).default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const MAX_BYTES = 4 * 1024 * 1024; // the bucket's limit too

// New secret keys go on the apikey header only; the legacy service_role key is a JWT and goes on both.
const keyHeaders = (k: string): Record<string, string> => (k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${API}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...keyHeaders(SECRET), "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : "");
const httpsLink = (s: string) => { try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password && s.length <= 500 ? u.href : null; } catch { return null; } };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  try {
    if (Number(req.headers.get("content-length") || 0) > MAX_BYTES + 64 * 1024) return reply(413, { error: "big" });
    const body = await req.arrayBuffer();
    if (body.byteLength > MAX_BYTES + 64 * 1024) return reply(413, { error: "big" });
    let form: FormData;
    try { form = await new Response(body, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData(); }
    catch { return reply(400, { error: "form" }); }

    if (str(form.get("website"), 200)) return reply(200, { ok: true }); // the bot trap: say thanks, keep nothing

    const email = str(form.get("email"), 200), credit = str(form.get("credit"), 80), title = str(form.get("title"), 120);
    const note = str(form.get("note"), 1000), linkIn = str(form.get("link"), 500);
    const link = linkIn ? httpsLink(linkIn) : null;
    const w = Math.round(Number(form.get("w"))), h = Math.round(Number(form.get("h")));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return reply(400, { error: "email" });
    if (!credit || credit.length > 80 || title.length > 120 || note.length > 1000) return reply(400, { error: "fields" });
    if (linkIn && !link) return reply(400, { error: "link" });
    if (!["made", "ok", "age"].every(k => form.get(k) === "yes")) return reply(400, { error: "boxes" });
    const image = form.get("image");
    if (!(image instanceof File) || !(w >= 1 && w <= 4000 && h >= 1 && h <= 4000)) return reply(400, { error: "image" });
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return reply(400, { error: "image" });

    if (!(await rpc("fanart_room", { p_email: email }))) return reply(429, { error: "slow" });

    const path = `${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${API}/storage/v1/object/fanart-inbox/${path}`, {
      method: "POST", headers: { ...keyHeaders(SECRET), "Content-Type": "image/jpeg", "x-upsert": "false" }, body: bytes,
    });
    if (!up.ok) throw new Error(`storage: ${up.status} ${(await up.text()).slice(0, 200)}`);
    try {
      await rpc("fanart_add", { p_image_path: path, p_w: w, p_h: h, p_credit: credit, p_email: email, p_title: title || null, p_credit_url: link, p_note: note || null });
    } catch (e) {
      // the details didn't save, so the image goes too
      await fetch(`${API}/storage/v1/object/fanart-inbox`, { method: "DELETE", headers: { ...keyHeaders(SECRET), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
      const why = String(e);
      if (/slow down/.test(why)) return reply(429, { error: "slow" });
      if (/bad email/.test(why)) return reply(400, { error: "email" });
      throw e;
    }
    return reply(200, { ok: true });
  } catch (e) {
    console.error(String(e));
    return reply(500, { error: "fail" });
  }
});
