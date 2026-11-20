// submit-game-photo: the Send a Photo page's form. It takes a photo of an animal and the sender's details, checks
// them, and keeps them for Taea to look at: the image in the private game-photo-inbox bucket, the details in
// game_photo_submissions, which only editors can read. Nothing sent here ever shows on the site by itself: the edit
// page can only look at a photo, download it or delete it. To use one, Taea draws her arrows on it and adds it to a
// Matching pair herself.
// - The sender's browser has already redrawn the photo as a JPEG, so it carries no location or camera data. This
//   checks that it is a JPEG of a sensible size, and that the boxes on the form were ticked.
// - Each email can send 5 a day, and everyone together 30 an hour (game_photo_room, checked again by game_photo_add).
// - Saving the row sends the editors a phone alert (the game_photo_notify trigger asks notify-message).
// Deployed with verify_jwt off: anyone can send a photo, and everything is checked here.

const API = Deno.env.get("SUPABASE_URL")!;
const json = (s?: string) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
const SECRET: string = json(Deno.env.get("SUPABASE_SECRET_KEYS")).default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const MAX_BYTES = 4 * 1024 * 1024; // the bucket's limit too
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// New secret keys go on the apikey header only; the legacy service_role key is a JWT and goes on both.
const keyHeaders = (k: string): Record<string, string> => (k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` });
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${API}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...keyHeaders(SECRET), "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : "");

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

    const email = str(form.get("email"), 200), credit = str(form.get("credit"), 80), note = str(form.get("note"), 1000);
    const pairIn = str(form.get("pair"), 40), pair = UUID.test(pairIn) ? pairIn : null;
    const w = Math.round(Number(form.get("w"))), h = Math.round(Number(form.get("h")));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return reply(400, { error: "email" });
    if (credit.length > 80 || note.length > 1000 || (pairIn && pairIn !== "other" && !pair)) return reply(400, { error: "fields" });
    if (!["mine", "ok", "age"].every(k => form.get(k) === "yes")) return reply(400, { error: "boxes" });
    const image = form.get("image");
    if (!(image instanceof File) || !(w >= 1 && w <= 4000 && h >= 1 && h <= 4000)) return reply(400, { error: "image" });
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return reply(400, { error: "image" });

    if (!(await rpc("game_photo_room", { p_email: email }))) return reply(429, { error: "slow" });

    const path = `${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${API}/storage/v1/object/game-photo-inbox/${path}`, {
      method: "POST", headers: { ...keyHeaders(SECRET), "Content-Type": "image/jpeg", "x-upsert": "false" }, body: bytes,
    });
    if (!up.ok) throw new Error(`storage: ${up.status} ${(await up.text()).slice(0, 200)}`);
    try {
      await rpc("game_photo_add", { p_image_path: path, p_w: w, p_h: h, p_email: email, p_pair: pair, p_note: note || null, p_credit: credit || null });
    } catch (e) {
      // the details didn't save, so the image goes too
      await fetch(`${API}/storage/v1/object/game-photo-inbox`, { method: "DELETE", headers: { ...keyHeaders(SECRET), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
      const why = String(e);
      if (/slow down/.test(why)) return reply(429, { error: "slow" });
      if (/bad email/.test(why)) return reply(400, { error: "email" });
      if (/bad pair/.test(why)) return reply(400, { error: "pair" });
      throw e;
    }
    return reply(200, { ok: true });
  } catch (e) {
    console.error(String(e));
    return reply(500, { error: "fail" });
  }
});
