/* TheTerr0rTw!ns site editor (/edit/).
   - Signs in with email and password through Supabase Auth (its REST API, no libraries) and keeps the
     session on this device, refreshing it before it runs out.
   - Reads and writes the same tables as the public site. The database decides who may edit
     (public.admins and row-level security); this page only makes it easy.
   - Everything from the database is shown as text, never as HTML: messages come from the public.
   - Photos are resized and saved as a new JPEG in the browser before upload, which leaves hidden
     data like GPS location behind. */
(() => {
if (window.top !== window.self) { document.body.textContent = ""; return; } // never inside someone else's page

const CFG = JSON.parse(document.getElementById("config").textContent);
const API = CFG.supabaseUrl, KEY = CFG.supabaseKey;
const app = document.getElementById("app");
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const photoUrl = u => { try { return u ? safeUrl(new URL(u, new URL(CFG.base || "/", location.href)).href) : ""; } catch { return ""; } };
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const daysAgo = d => (d ? Math.round((new Date(today()) - new Date(d)) / 864e5) : null);
const nice = d => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const slugify = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "item";
const label = (opts, v) => (opts.find(o => o[0] === v) || [, v || ""])[1];
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/* ---------- toast ---------- */
const toastEl = $("#toast");
let toastT;
function toast(msg, bad) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.className = "toast"; }, bad ? 6000 : 2600);
}

/* ---------- signing in ---------- */
class SignedOut extends Error {}
const SKEY = "tt-editor-session";
let session = null, editorCheck = null;
try { session = JSON.parse(localStorage.getItem(SKEY)); } catch {}
function keep(j) {
  session = j ? { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: j.user?.email || session?.email || "" } : null;
  try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch {}
}
async function authCall(path, body) {
  let r;
  try { r = await fetch(`${API}/auth/v1/${path}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Can't reach the sign-in service. Check your connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.msg || j.message || "Something went wrong."), { status: r.status, code: j.error_code || j.error || "" });
  return j;
}
let refreshing = null;
async function token() {
  if (!session) throw new SignedOut();
  if (Date.now() < session.exp - 60e3) return session.access;
  refreshing ??= authCall("token?grant_type=refresh_token", { refresh_token: session.refresh }).then(keep).finally(() => { refreshing = null; });
  try { await refreshing; }
  catch (e) { if (e.status) { keep(null); throw new SignedOut(); } throw e; } // offline: keep the session for later
  return session.access;
}

/* ---------- database ---------- */
function friendly(j, status) {
  const m = (j && (j.message || j.hint)) || "";
  if (j?.code === "42501" || status === 403) return "This account isn't allowed to make that change.";
  if (j?.code === "23505") return "That one already exists.";
  if (j?.code === "23503") return "It belonged to something that's been deleted too. Restore that first.";
  if (j?.code === "P0001" && m) return m;
  if (/animals_check/.test(m)) return "The adoption date can't be before the video date.";
  if (j?.code === "23514") return "One of the answers isn't allowed. Check the form and try again.";
  if (j?.code === "23502") return "Something required is missing.";
  if (j?.code === "22007" || j?.code === "22008") return "One of the dates isn't a real date.";
  return m ? `That didn't save: ${m}` : "That didn't save. Please try again.";
}
async function db(method, path, body, prefer) {
  const headers = { apikey: KEY, Authorization: `Bearer ${await token()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  let r;
  try { r = await fetch(`${API}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error("Can't reach the database. Check your connection and try again."); }
  if (r.status === 401) { keep(null); throw new SignedOut(); }
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw Object.assign(new Error(friendly(j, r.status)), { code: j?.code });
  return j;
}
const NOT_SAVED = "That change wasn't saved. This account may not be on the editor list.";
const api = {
  list: (t, q) => db("GET", `${t}?${q}`),
  add: async (t, row) => (await db("POST", `${t}?select=*`, row, "return=representation"))[0],
  save: async (t, id, patch) => {
    const r = await db("PATCH", `${t}?id=eq.${encodeURIComponent(id)}&select=*`, patch, "return=representation");
    if (!r?.length) throw new Error(NOT_SAVED);
    return r[0];
  },
  drop: async (t, id) => {
    const r = await db("DELETE", `${t}?id=eq.${encodeURIComponent(id)}&select=id`, undefined, "return=representation");
    if (!r?.length) throw new Error(NOT_SAVED);
  },
};
const amEditor = () => (editorCheck ??= db("POST", "rpc/is_admin", {}).catch(e => { editorCheck = null; throw e; }));

/* ---------- photos ---------- */
async function shrink(file) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file isn't a photo.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error("This photo can't be opened here. Try a JPEG or PNG, or a screenshot of it."); }
    const MAX = 1600, s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    // A new JPEG drawn from the canvas carries only the pixels: no GPS, camera or date data.
    return await new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("This photo couldn't be prepared."))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
async function upload(file, folder, name) {
  const blob = await shrink(file);
  const path = `${folder}/${Date.now().toString(36)}-${slugify(name)}.jpg`;
  let r;
  try {
    r = await fetch(`${API}/storage/v1/object/photos/${path}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, "Content-Type": "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" },
      body: blob,
    });
  } catch { throw new Error("The photo didn't upload. Check your connection and try again."); }
  if (r.status === 401) { keep(null); throw new SignedOut(); }
  if (!r.ok) throw new Error("The photo didn't upload. " + ((await r.json().catch(() => ({}))).message || ""));
  return `${API}/storage/v1/object/public/photos/${path}`;
}

/* ---------- photos nothing uses any more ----------
   A photo file stays online at its address until it's deleted, even after it's replaced or removed on the edit page.
   So once a day, and after a save that changes a photo, files nothing points to are deleted: not shown on the site,
   not on a hidden item, and not on anything waiting in Recently deleted. Files from the last 2 days are left alone,
   in case they were just added to a form that hasn't been saved yet. */
const PHOTOS = `${API}/storage/v1/object/public/photos/`;
async function storage(method, path, body) {
  const r = await fetch(`${API}/storage/v1/object/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 401) { keep(null); throw new SignedOut(); }
  if (!r.ok) throw new Error(`photos ${method} ${r.status}`);
  return r.json();
}
const listPhotos = prefix => storage("POST", "list/photos", { prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
async function tidyPhotos() {
  const top = await listPhotos(""), files = top.filter(f => f.id);
  for (const folder of top.filter(f => !f.id)) files.push(...(await listPhotos(folder.name)).filter(f => f.id).map(f => ({ ...f, name: `${folder.name}/${f.name}` })));
  const used = new Set(), note = u => { if (typeof u === "string" && u.startsWith(PHOTOS)) used.add(decodeURIComponent(u.slice(PHOTOS.length).split("?")[0])); };
  const [rows, days, deleted] = await Promise.all([
    Promise.all(["animals", "goals", "collabs", "places", "videos"].map(t => api.list(t, "select=photo_url&photo_url=not.is.null"))),
    api.list("adventures", "select=photos"),
    api.list("content_history", "select=data&op=eq.delete&restored_at=is.null"),
  ]);
  rows.flat().forEach(r => note(r.photo_url));
  days.forEach(r => (r.photos || []).forEach(note));
  deleted.forEach(h => { note(h.data?.photo_url); (Array.isArray(h.data?.photos) ? h.data.photos : []).forEach(note); });
  const before = Date.now() - 2 * 864e5;
  const unused = files.filter(f => !used.has(f.name) && new Date(f.created_at).getTime() < before).map(f => f.name);
  if (unused.length) await storage("DELETE", "photos", { prefixes: unused });
  return unused.length;
}
// at most once a day per device, and never in the way: a problem here only shows in the browser's console
function tidyPhotosNow(force) {
  let last = "";
  try { last = localStorage.getItem("tt-photo-tidy") || ""; } catch {}
  if (!force && last === today()) return;
  try { localStorage.setItem("tt-photo-tidy", today()); } catch {}
  tidyPhotos().catch(e => { if (!(e instanceof SignedOut)) console.warn("tidying photos:", e.message); });
}

/* ---------- what can be edited ---------- */
const STATUS = [["looking", "Still looking"], ["foster", "In foster"], ["adopted", "Adopted"], ["sanctuary", "In sanctuary"], ["placed", "Placed or released"],
  ["unknown", "Unknown (lost contact)"]];
const SPECIES = [["dog", "Dog"], ["cat", "Cat"], ["horse", "Horse"], ["bird", "Bird"], ["other", "Other"]];
const SHOWN_ON = [["helped", "Animals We've Helped"], ["spotlight", "Animal Story Spotlight"]];
const EMOJI = { dog: "🐶", cat: "🐱", horse: "🐴", bird: "🐦", other: "🐾" };
const KINDS = [["rescue", "Rescue"], ["shelter", "Shelter"], ["sanctuary", "Sanctuary"]];
const TAGS = [["free", "Free"], ["half", "Half-day option"], ["kids", "Kids welcome"], ["first", "Good for first-timers"], ["sleepover", "Sleepovers"]];
const FOSTER_TAGS = [["free", "Free to foster"], ["dogs", "Dogs"], ["cats", "Cats"], ["kittens", "Kittens"], ["puppies", "Puppies"], ["medical", "Medical"],
  ["short", "Short stays"], ["sleepover", "Sleepovers"], ["adopt", "Foster to adopt"]];
const LINK_COLS = [{ key: "label", label: "What it says", max: 80, ph: "Amazon wish list", need: true }, { key: "url", label: "Link", url: true, need: true }];
// whether a collaboration is coming up, happening now or done, from its dates (the site works it out the same way)
const collabWhen = c => { const now = today(); return c.starts_on > now ? "soon" : c.ongoing || (c.ends_on || c.starts_on) >= now ? "now" : "past"; };
const WHEN = [["soon", "Coming up"], ["now", "Happening now"], ["past", "Done"]];
const HELPCATS = [["food", "Food and supplies"], ["vet", "Vet bills"], ["behavior", "Behavior help"], ["housing", "Housing and pet deposits"], ["rehoming", "Rehoming without a shelter"], ["birds", "Bird care"], ["financing", "Credit cards and loans"], ["abuse", "Reporting animal abuse"],
  ["rescues", "Small local rescues"], ["tnr", "Spay, neuter and community cats"], ["breedhousing", "Breed-friendly apartments"],
  ["wildlife", "Wild animal help: who to call"], ["wildgroups", "Wildlife groups and sanctuaries"],
  ["crisis", "Crisis lines (Caring for Yourself)"], ["dv", "Abuse at home (Caring for Yourself)"], ["mental", "Mental health (Caring for Yourself)"], ["grief", "Grieving a pet (Caring for Yourself)"]];
const TOPICS = { partner: "Partnership", help: "Help keeping a pet", dog: "About a dog", sniffari: "Day-out program", request: "Video request or question", other: "Something else" };
const RANK = { looking: 0, foster: 1, adopted: 2, sanctuary: 3, placed: 4, unknown: 5 };
const stale = (d, days) => d === null || d === undefined || daysAgo(d) >= days;
const platform = u => {
  let host = "";
  try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
  return /(^|\.)tiktok\.com$/.test(host) ? "TikTok" : /(^|\.)instagram\.com$/.test(host) ? "Instagram" : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? "YouTube"
    : /(^|\.)(facebook\.com|fb\.watch)$/.test(host) ? "Facebook" : host;
};

const SHOW = { name: "published", type: "toggle", label: "Show on the site", help: "Turn this off to hide it without losing anything.", dflt: true };
const SORT = { name: "sort", type: "number", label: "Order", help: "Lower numbers show first.", dflt: 100 };

const SECTIONS = {
  animals: {
    table: "animals", title: "Animals", one: "animal", icon: "🐾",
    intro: "Everyone on Animals We've Helped (Happy Tails), the Animal Story Spotlight, the rescue cards and the Willow Woods herds.",
    query: "select=*,partner:partners(name)&order=name.asc",
    titleOf: r => r.name,
    filters: [["all", "All"], ["looking", "Still looking"], ["foster", "In foster"], ["adopted", "Adopted"], ["sanctuary", "In sanctuary"], ["unknown", "Unknown"], ["spotlight", "Spotlight"], ["hidden", "Hidden"]],
    tokens: r => [r.status, r.section === "spotlight" ? "spotlight" : "", r.published ? "" : "hidden"],
    order: (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || a.name.localeCompare(b.name),
    row: r => ({ title: r.name, sub: [label(STATUS, r.status), r.partner?.name, r.section === "spotlight" && "Story Spotlight"].filter(Boolean).join(" · "), photo: r.photo_url, emoji: EMOJI[r.species],
      flags: [!r.published && "Hidden", r.status === "looking" && r.published && stale(r.checked_on, 21) && "!Needs a check"] }),
    fields: [
      { name: "name", type: "text", label: "Name", required: true, max: 120 },
      { name: "species", type: "choice", label: "What kind of animal?", options: SPECIES, dflt: "dog",
        onPick: (v, el) => { if (v === "horse") el.section.value = el.status.value === "looking" ? "helped" : "spotlight"; } }, // horses aren't up for adoption unless they're still looking
      { name: "status", type: "choice", label: "Where are they now?", options: STATUS, dflt: "looking",
        onPick: (v, el) => {
          if (v === "adopted" && !el.adopted_on.value) el.adopted_on.value = today();
          if (v === "looking" && !el.checked_on.value) el.checked_on.value = today();
          if (el.species.value === "horse") el.section.value = v === "looking" ? "helped" : "spotlight";
        } },
      { name: "section", type: "choice", label: "Which part of the site?", options: SHOWN_ON, dflt: "helped",
        help: "Animals We've Helped is for animals you featured to find a home. Animal Story Spotlight is for animals already in a forever home or a sanctuary, like the Willow Woods horses. Pick the other one and save to move them." },
      { name: "partner_id", type: "partner", label: "Rescue or shelter" },
      { name: "photo_url", type: "photo", label: "Photo", folder: "animals" },
      { name: "note", type: "textarea", rows: 2, max: 200, label: "Short note", help: "Shown under their name. Keep it to a line." },
      { name: "story", type: "textarea", rows: 8, max: 6000, label: "Their story", help: "Shown when people tap them on Happy Tails. Leave a blank line between paragraphs." },
      { name: "journey", type: "journey", label: "Their journey", help: "The steps people see when they tap this animal on Happy Tails, in order, like each visit until they leave the shelter. Leave it empty and the site uses the video and adoption dates." },
      { name: "updates", type: "updates", label: "Updates and notes", help: "Dated news, like how they're doing in their new home. The newest shows first." },
      { name: "listing_url", type: "url", label: "Link to their adoption listing", when: v => ["looking", "foster"].includes(v.status) },
      { name: "checked_on", type: "date", label: "Last checked that they're still available", today: "Checked today", dflt: today,
        help: "A dog who's still looking hides from the site 4 weeks after this date, so the site never shows a dog who's already gone.", when: v => v.status === "looking" },
      { name: "featured_on", type: "date", label: "Date of your video about them", help: "Used for the “home within 3 months” numbers." },
      { name: "adopted_on", type: "date", label: "Adoption date", when: v => v.status === "adopted" },
      { name: "herd", type: "text", label: "Herd", max: 60, list: "herds", help: "Groups the horses on the Willow Woods page, like “Herd One”.", when: v => v.species === "horse" },
      { ...SORT, label: "Order in the herd", help: "1 shows first.", when: v => v.species === "horse" },
      { name: "transport", type: "toggle", label: "Transport run", help: "Like the puppy relay. Doesn't count in the adoption numbers." },
      { name: "people_ok", type: "toggle", label: "Everyone shown or named has OK'd it", dflt: true, help: "If this is off, the animal stays hidden." },
      SHOW,
    ],
  },
  goals: {
    table: "goals", title: "Shelter goals", one: "goal", icon: "🌾",
    intro: "Each goal belongs to a shelter, with their own numbers. Donations always go to their page.",
    query: "select=*,partner:partners(name),bars:goal_bars(*)&order=sort.asc",
    titleOf: r => r.title,
    row: r => ({ title: r.title, photo: r.photo_url, emoji: "🌾",
      sub: [r.partner?.name, r.status === "met" ? `Met ${nice(r.met_on)}` : r.figures_updated_at ? `Numbers from ${nice(r.figures_updated_at)}` : "No numbers yet"].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.featured && r.status === "active" && "On the homepage"] }),
    fields: [
      { name: "partner_id", type: "partner", label: "Whose goal is it?", required: true },
      { name: "title", type: "text", label: "Goal name", required: true, max: 120 },
      { name: "why", type: "textarea", rows: 3, max: 500, label: "Why it matters" },
      { name: "price_note", type: "text", label: "Price note", max: 120, help: "Like “About $100 buys one round bale”." },
      { name: "bars", type: "bars", label: "What they need", help: "Numbers come from the shelter. Saving new “so far” numbers updates the date shown on the site." },
      { name: "donate_url", type: "url", label: "The shelter's donation page", help: "Until there's a link, the goal says “Donation link coming soon”." },
      { name: "photo_url", type: "photo", label: "Photo", folder: "goals" },
      { name: "status", type: "choice", label: "Status", options: [["active", "Active"], ["met", "Goal met 🎉"]], dflt: "active",
        onPick: (v, el) => { if (v === "met" && !el.met_on.value) el.met_on.value = today(); } },
      { name: "met_on", type: "date", label: "Date it was met", when: v => v.status === "met" },
      { name: "featured", type: "toggle", label: "Show on the homepage", help: "The homepage shows one goal: the first active one with this on.", when: v => v.status === "active" },
      SHOW, SORT,
    ],
    prepare(vals, row, patch) {
      const before = row?.bars || [], num = x => (x === null || x === undefined ? null : Number(x));
      const moved = vals.bars.some(b => { const o = before.find(x => x.id === b.id); return b.current !== null && (!o || num(o.current) !== b.current); })
        || before.some(o => o.current !== null && !vals.bars.some(b => b.id === o.id));
      if (moved) patch.figures_updated_at = today();
    },
    async afterSave(saved, vals, row) {
      const before = row?.bars || [], num = x => (x === null || x === undefined ? null : Number(x));
      for (const o of before) if (!vals.bars.some(b => b.id === o.id)) await api.drop("goal_bars", o.id);
      for (const b of vals.bars) {
        const data = { label: b.label, target: b.target, current: b.current, sort: b.sort };
        const o = b.id && before.find(x => x.id === b.id);
        if (!o) await api.add("goal_bars", { ...data, goal_id: saved.id });
        else if (o.label !== b.label || num(o.target) !== b.target || num(o.current) !== b.current || o.sort !== b.sort) await api.save("goal_bars", o.id, data);
      }
    },
  },
  events: {
    table: "events", title: "Events", one: "event", icon: "📅",
    intro: "Events disappear from the site by themselves the day after they happen.",
    query: "select=*,partner:partners(name)&order=starts_on.desc",
    titleOf: r => r.title,
    row: r => ({ title: r.title, emoji: "📅", sub: [nice(r.starts_on), r.time_text, r.partner?.name].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.starts_on < today() && "Past"] }),
    fields: [
      { name: "title", type: "text", label: "What's happening", required: true, max: 150 },
      { name: "starts_on", type: "date", label: "Date", required: true },
      { name: "time_text", type: "text", label: "Time", max: 60, help: "Like “1 to 3 PM”." },
      { name: "place", type: "text", label: "Where", max: 150, help: "Public places only, like “At Willow Woods”. Never a home address." },
      { name: "link_url", type: "url", label: "Link for details or tickets" },
      { name: "partner_id", type: "partner", label: "Whose event is it?" },
      SHOW,
    ],
  },
  collabs: {
    table: "collabs", title: "Collaborations", one: "collaboration", icon: "🎨",
    intro: "What you've done, are doing and have planned with each rescue, like portraits or shelter treats. Shown on their card on the Rescues page, sorted into coming up, happening now and done by the dates.",
    query: "select=*,partner:partners(name)&order=starts_on.desc",
    titleOf: r => r.title,
    filters: [["all", "All"], ...WHEN],
    tokens: r => [collabWhen(r), r.published ? "" : "hidden"],
    row: r => ({ title: r.title, emoji: "🎨", photo: r.photo_url, sub: [r.partner?.name, label(WHEN, collabWhen(r)), nice(r.starts_on)].filter(Boolean).join(" · "), flags: [!r.published && "Hidden"] }),
    fields: [
      { name: "partner_id", type: "partner", label: "Which rescue or shelter?", required: true },
      { name: "title", type: "text", label: "What it is", required: true, max: 200, help: "Like “Holiday portraits of the adoptable dogs”." },
      { name: "kind", type: "text", label: "Kind", max: 60, suggest: ["Portraits", "Shelter treats", "Video series", "Event coverage", "Fundraiser", "Supply drive", "Coloring pages"] },
      { name: "starts_on", type: "date", label: "Starts", required: true },
      { name: "ongoing", type: "toggle", label: "Still going, with no end date yet" },
      { name: "ends_on", type: "date", label: "Ends", after: "starts_on", help: "Leave it empty for a one-day thing.", when: v => !v.ongoing },
      { name: "description", type: "textarea", rows: 4, max: 1000, label: "About it" },
      { name: "link_url", type: "url", label: "Link", help: "Like the video, the photos, or where to sign up." },
      { name: "photo_url", type: "photo", label: "Photo", folder: "collabs" },
      SHOW, { ...SORT, help: "Lower numbers show first in each group." },
    ],
    prepare(vals, row, patch) { if (vals.ongoing && vals.ends_on) patch.ends_on = null; },
  },
  partners: {
    table: "partners", title: "Rescues & shelters", one: "rescue or shelter", icon: "🏡",
    intro: "An organization shows on the site once both switches are on: they've said yes, and “Show on the site”.",
    query: "select=*&order=sort.asc,name.asc",
    titleOf: r => r.name,
    noDelete: "Rescues can't be deleted here, because their goals would go with them. Turn off “Show on the site” to hide one.",
    row: r => ({ title: r.name, emoji: "🏡", sub: label(KINDS, r.kind), flags: [!(r.published && r.feature_ok) && "Hidden"] }),
    fields: [
      { name: "name", type: "text", label: "Full proper name", required: true, max: 150, help: "Their full official name, like “Virginia Beach Animal Care and Adoption Center”." },
      { name: "kind", type: "choice", label: "Type", options: KINDS, dflt: "rescue" },
      { name: "website_url", type: "url", label: "Their website" },
      { name: "adopt_url", type: "url", label: "Their adopt or foster page" },
      { name: "donate_url", type: "url", label: "Their donation page", help: "Donations always go straight to them." },
      { name: "mission", type: "textarea", rows: 3, max: 600, label: "Their mission", help: "Only in their own words, with their permission." },
      { name: "links", type: "rows", label: "More links", cols: LINK_COLS, add: "+ Add a link",
        help: "Shown on their card under “More from them”, like how they prefer donations, a wish list, or a program to highlight." },
      { name: "feature_ok", type: "toggle", label: "They've said yes to being featured", help: "Filming their animals, always with their consent, counts.", dflt: false },
      SHOW, SORT,
    ],
    beforeAdd: r => ({ ...r, slug: slugify(r.name) }),
  },
  sniffari: {
    table: "sniffari_programs", title: "Day-out programs", one: "day-out program", icon: "🦮",
    intro: "Shelter day-out programs listed on Rescues on Sniffari.",
    query: "select=*&order=sort.asc",
    titleOf: r => r.program_name || r.shelter_name,
    row: r => ({ title: r.program_name || r.shelter_name, emoji: "🦮", sub: [r.shelter_name, r.city].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.published && stale(r.checked_on, 90) && "!Check the details"] }),
    fields: [
      { name: "shelter_name", type: "text", label: "Shelter's full name", required: true, max: 150 },
      { name: "program_name", type: "text", label: "Program name", max: 120 },
      { name: "city", type: "text", label: "City", max: 60 },
      { name: "address", type: "text", label: "Shelter's public address", max: 160, help: "Public buildings only." },
      { name: "signup_url", type: "url", label: "Sign-up page" },
      { name: "links", type: "rows", label: "More links", cols: LINK_COLS, add: "+ Add a link", help: "Shown under the sign-up button, like a Friends group's page." },
      { name: "facts", type: "lines", label: "Quick facts", rows: 4, help: "One per line, like “Saturdays 9 AM to 1 PM” or “Ages 18+”." },
      { name: "tags", type: "tags", label: "Filters it shows under", options: TAGS,
        help: "“Sleepovers” is for programs where a dog can stay the night or a weekend. It also lists the program in the page's Sleepovers part, which stays hidden until a program has it." },
      { name: "checked_on", type: "date", label: "Details last checked", today: "Checked today", dflt: today },
      SHOW, SORT,
    ],
  },
  fosters: {
    table: "foster_programs", title: "Foster programs", one: "foster program", icon: "🏠",
    intro: "The shelters' and rescues' foster programs, listed on the Foster page. The page counts how many are free to foster.",
    query: "select=*&order=sort.asc,shelter_name.asc",
    titleOf: r => r.program_name || r.shelter_name,
    filters: [["all", "All"], ...FOSTER_TAGS.slice(0, 3), ["hidden", "Hidden"]],
    tokens: r => [...(r.tags || []), r.published ? "" : "hidden"],
    row: r => ({ title: r.program_name || r.shelter_name, emoji: "🏠", sub: [r.program_name && r.shelter_name, r.city].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.published && stale(r.checked_on, 90) && "!Check the details"] }),
    fields: [
      { name: "shelter_name", type: "text", label: "Shelter or rescue's full name", required: true, max: 150 },
      { name: "program_name", type: "text", label: "Program name", max: 120, help: "Like “Foster Program” or “Bottle Baby Fosters”." },
      { name: "city", type: "text", label: "City", max: 60 },
      { name: "signup_url", type: "url", label: "Their foster page", help: "Where people apply." },
      { name: "facts", type: "lines", label: "Quick facts", rows: 4, help: "One per line, like “Food, supplies and vet care provided” or “Ages 21+”." },
      { name: "tags", type: "tags", label: "Filters it shows under", options: FOSTER_TAGS, help: "“Free to foster” means the shelter covers the animal's care. The page counts these." },
      { name: "links", type: "rows", label: "More links", cols: LINK_COLS, add: "+ Add a link", help: "Like their foster handbook or an info session." },
      { name: "checked_on", type: "date", label: "Details last checked", today: "Checked today", dflt: today },
      SHOW, SORT,
    ],
  },
  adventures: {
    table: "adventures", title: "Our day outs", one: "day out", icon: "🦮",
    intro: "The day outs you go on, shown on Rescues on Sniffari: your write-up, videos, a photo gallery and the places you went. That part of the page stays hidden until there's one to show.",
    query: "select=*,partner:partners(name)&order=sort.asc,went_on.desc.nullslast",
    titleOf: r => r.title,
    row: r => ({ title: r.title, emoji: "🦮", photo: r.photos?.[0], sub: [r.went_on && nice(r.went_on), r.dogs].filter(Boolean).join(" · "), flags: [!r.published && "Hidden"] }),
    fields: [
      { name: "title", type: "text", label: "Title", required: true, max: 200, help: "Like “Tyce's first beach day”." },
      { name: "went_on", type: "date", label: "The day you went" },
      { name: "dogs", type: "text", label: "The dogs who went", max: 200, help: "Like “Tyce and Zazu”." },
      { name: "partner_id", type: "partner", label: "Which shelter are they from?" },
      { name: "story", type: "textarea", rows: 8, max: 6000, label: "What you did", help: "Your write-up of the day. Leave a blank line between paragraphs." },
      { name: "videos", type: "rows", label: "Videos", add: "+ Add a video", bad: "Each video needs a link starting with https://",
        cols: [{ key: "title", label: "Title", max: 200, ph: "Beach day, part 1" }, { key: "url", label: "Link", url: true, need: true }],
        help: "YouTube videos play right on the page. Others, like TikTok, open where they were posted. Tap Share, then Copy link." },
      { name: "photos", type: "gallery", label: "Photos", folder: "day-outs", max: 40, help: "The first photo is the cover. Never photos of a home, or anything showing where someone lives." },
      { name: "businesses", type: "rows", label: "Places you went", add: "+ Add a place", bad: "Each place needs a name, and links need to start with https://",
        cols: [{ key: "name", label: "Name", max: 120, ph: "The Dog Bakery", need: true }, { key: "url", label: "Their website", url: true }],
        help: "Businesses and public places only, with a link to their website." },
      SHOW, { ...SORT, help: "Lower numbers show first. Day outs with the same number show newest first." },
    ],
  },
  videos: {
    table: "videos", title: "Day-out videos", one: "day-out video", icon: "🎬",
    intro: "Videos of the dogs' day outs, shown on Rescues on Sniffari. That part of the page stays hidden until there's a video to show.",
    query: "select=*&order=sort.asc,posted_on.desc.nullslast,created_at.desc",
    titleOf: r => r.title,
    row: r => ({ title: r.title, emoji: "🎬", photo: r.photo_url, sub: [r.posted_on && nice(r.posted_on), platform(r.url)].filter(Boolean).join(" · "), flags: [!r.published && "Hidden"] }),
    fields: [
      { name: "title", type: "text", label: "Title", required: true, max: 200, help: "Like “Biscuit's first beach day”." },
      { name: "url", type: "url", label: "Link to the video", required: true, help: "From TikTok, Instagram, YouTube or Facebook: tap Share, then Copy link.", check: [/^https:\/\//, "Video links need to start with https://"] },
      { name: "posted_on", type: "date", label: "Date posted" },
      { name: "note", type: "textarea", rows: 2, max: 300, label: "Short note", help: "Shown under the title." },
      { name: "photo_url", type: "photo", label: "Cover photo", folder: "videos" },
      SHOW, { ...SORT, help: "Lower numbers show first. Videos with the same number show newest first." },
    ],
  },
  places: {
    table: "places", title: "Dog-friendly places", one: "dog-friendly place", icon: "📍",
    intro: "Your picks for places to take a dog, and why, shown on Rescues on Sniffari. That part of the page stays hidden until there's a place to show.",
    query: "select=*&order=sort.asc,name.asc",
    titleOf: r => r.name,
    row: r => ({ title: r.name, emoji: "📍", photo: r.photo_url, sub: r.area || "", flags: [!r.published && "Hidden"] }),
    fields: [
      { name: "name", type: "text", label: "Name", required: true, max: 200 },
      { name: "area", type: "text", label: "Where", max: 100, help: "A city, or the public place itself. Never a private address." },
      { name: "why", type: "textarea", rows: 5, max: 1000, label: "Why you pick it" },
      { name: "link_url", type: "url", label: "Their website" },
      { name: "photo_url", type: "photo", label: "Photo", folder: "places" },
      SHOW, SORT,
    ],
  },
  help: {
    table: "help_resources", title: "Local help list", one: "help listing", icon: "🤝",
    intro: "Shown on the “Help keeping your pet” page under each kind of help. Wild animal help shows there and on the Wildlife page. Credit cards and loans, small rescues, spay and neuter help, and breed-friendly apartments each get their own section, which stays hidden until one is showing. Help for people (crisis lines, abuse at home, mental health, grieving a pet) shows on Caring for Yourself.",
    query: "select=*&order=category.asc,sort.asc,name.asc",
    titleOf: r => r.name,
    filters: [["all", "All"], ...HELPCATS],
    tokens: r => [r.category, r.published ? "" : "hidden"],
    row: r => ({ title: r.name, emoji: "🤝", sub: [label(HELPCATS, r.category), r.area].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.published && stale(r.checked_on, 180) && "!Check it's still running"] }),
    fields: [
      { name: "category", type: "choice", label: "What kind of help?", options: HELPCATS, dflt: "food" },
      { name: "kind", type: "text", label: "What kind it is", max: 40, suggest: ["Credit card", "Loan", "Payment plan", "Line of credit", "Dogs", "Cats", "Dogs and cats", "Cats and kittens", "Community cats"],
        help: "Shown as a label above the name. For credit cards and loans, so nobody mistakes them for free help, like “Credit card”. For rescues and apartments, the animals they take, like “Cats” or “Dogs and cats”.",
        when: v => ["financing", "rescues", "tnr", "breedhousing"].includes(v.category) },
      { name: "name", type: "text", label: "Name", required: true, max: 200 },
      { name: "description", type: "textarea", rows: 3, max: 600, label: "What they offer" },
      { name: "best_for", type: "textarea", rows: 2, max: 300, label: "Best used for", help: "Shown as “Best for: …”, like “Big vet bills you can pay off before the promo ends”.", when: v => v.category === "financing" },
      { name: "caution", type: "textarea", rows: 2, max: 400, label: "Caution", help: "Shown in a box with the listing, like “This is a credit card, not financial assistance.”" },
      { name: "link_url", type: "url", label: "Website" },
      { name: "more_url", type: "url", label: "Second link", help: "Optional, like their free resource library." },
      { name: "more_label", type: "text", label: "What the second link says", max: 80, help: "Like “Free pet care library”.", when: v => !!v.more_url },
      { name: "phone", type: "text", label: "Phone", max: 40, inputmode: "tel", help: "Extra words are fine, like “(757) 427-0071, option 1”. The call button uses the first number." },
      { name: "email", type: "text", label: "Email", max: 120, inputmode: "email", check: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "That doesn't look like an email address."] },
      { name: "area", type: "text", label: "Area", max: 100, help: "A city, “All of Hampton Roads”, or a public building's address. Never a private home, and never a wildlife rehab or release site." },
      { name: "checked_on", type: "date", label: "Last checked it's still running", today: "Checked today", dflt: today },
      SHOW, SORT,
    ],
  },
};

/* ---------- screens ---------- */
let dirty = false;
function render(html) {
  app.innerHTML = html;
  const hd = $("h1", app);
  if (hd) { hd.tabIndex = -1; hd.focus({ preventScroll: true }); }
  scrollTo(0, 0);
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

const decode = s => { try { return decodeURIComponent(s); } catch { return ""; } };
async function route() {
  const [sec, id] = location.hash.replace(/^#\/?/, "").split("/").map(decode);
  dirty = false;
  $("#signout").hidden = !session;
  if (!session) return showSignIn();
  try {
    if (!(await amEditor())) return showNotEditor();
    if (!sec) return await showHome();
    if (sec === "messages") return await showMessages(id || "new");
    if (sec === "text") return await showText(id);
    if (sec === "deleted") return await showDeleted();
    if (sec === "visitors") return await showVisitors(id || "7");
    if (!SECTIONS[sec]) return go("#/");
    return id ? await showForm(sec, id) : await showList(sec);
  } catch (e) {
    if (e instanceof SignedOut) return showSignIn("You've been signed out. Please sign in again.");
    render(`<h1>Something went wrong</h1><p class="note bad">${h(e.message)}</p><div class="btns"><a class="btn royal" href="#/">Back to the start</a></div>`);
  }
}

function showSignIn(msg) {
  $("#signout").hidden = true;
  render(`<div class="card signin">
    <h1>Sign in to edit the site</h1>
    <form class="form" id="signin" novalidate>
      <label>Email<input type="email" name="email" autocomplete="username" inputmode="email" required></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn royal" type="submit">Sign in</button>
      <p class="formmsg err-msg" role="alert">${h(msg || "")}</p>
    </form>
    <p class="small">Forgot your password? It can be reset in the Supabase dashboard, under Authentication → Users.</p>
  </div>`);
  const f = $("#signin");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const email = f.elements.email.value.trim(), password = f.elements.password.value, out = $(".formmsg", f), btn = $("button", f);
    if (!email || !password) { out.textContent = "Please enter your email and password."; return; }
    btn.disabled = true; btn.textContent = "Signing in…"; out.textContent = "";
    try {
      keep(await authCall("token?grant_type=password", { email, password }));
      editorCheck = null;
      go("#/");
    } catch (err) {
      out.textContent = err.code === "email_not_confirmed" ? "This account hasn't been confirmed yet. Confirm it in Supabase under Authentication → Users."
        : err.status === 400 || err.code === "invalid_credentials" ? "That email and password don't match. Please try again."
        : err.status === 429 ? "Too many tries. Please wait a minute and try again." : err.message;
      btn.disabled = false; btn.textContent = "Sign in";
    }
  });
}

function showNotEditor() {
  render(`<div class="card"><h1>Not on the editor list yet</h1>
    <p>You're signed in as <b>${h(session?.email)}</b>, but this account isn't on the editor list. Ask whoever set up the site to add it.</p>
    <div class="btns"><button class="btn royal" type="button" data-act="signout">Sign out</button></div></div>`);
}

async function showHome() {
  const [msgs, animals, goals, progs, help, events, week, videos, places, collabs, fosters, advs] = await Promise.all([
    api.list("messages", "select=id&handled=is.false"),
    api.list("animals", "select=id,name,status,published,checked_on"),
    api.list("goals", "select=id,title,status,published,figures_updated_at,bars:goal_bars(id)"),
    api.list("sniffari_programs", "select=id,program_name,shelter_name,published,checked_on"),
    api.list("help_resources", "select=id,name,published,checked_on"),
    api.list("events", `select=id&starts_on=gte.${today()}`),
    db("POST", "rpc/visitor_summary", { p_days: 7 }).catch(e => { if (e instanceof SignedOut) throw e; return null; }),
    api.list("videos", "select=id"),
    api.list("places", "select=id"),
    api.list("collabs", "select=id"),
    api.list("foster_programs", "select=id,program_name,shelter_name,published,checked_on"),
    api.list("adventures", "select=id"),
  ]);
  const todo = [];
  if (msgs.length) todo.push(`<li><b>${plural(msgs.length, "new message")}</b><div class="btns"><a class="btn royal sm" href="#/messages">Read ${msgs.length === 1 ? "it" : "them"}</a></div></li>`);
  for (const a of animals.filter(a => a.status === "looking" && a.published && stale(a.checked_on, 21)).sort((x, y) => (x.checked_on || "").localeCompare(y.checked_on || ""))) {
    const d = daysAgo(a.checked_on);
    todo.push(`<li><b>${h(a.name)}: still available?</b><small>${d === null ? "Never checked." : d >= 28 ? `Hidden from the site until re-checked. Last checked ${h(nice(a.checked_on))}.` : `Last checked ${h(nice(a.checked_on))}. Hides itself after 4 weeks.`}</small>
      <div class="btns"><button class="btn royal sm" type="button" data-act="checked" data-t="animals" data-id="${h(a.id)}">Still available</button><button class="btn ghost sm" type="button" data-act="adopted" data-id="${h(a.id)}">Adopted!</button><a class="btn ghost sm" href="#/animals/${h(a.id)}">Open</a></div></li>`);
  }
  for (const g of goals.filter(g => g.status === "active" && g.published && g.bars.length && stale(g.figures_updated_at, 12))) {
    todo.push(`<li><b>${h(g.title)}: new numbers?</b><small>${g.figures_updated_at ? `The numbers are from ${h(nice(g.figures_updated_at))}. After 14 days the site says an update is coming.` : "No numbers from the shelter yet."}</small>
      <div class="btns"><a class="btn royal sm" href="#/goals/${h(g.id)}">Update numbers</a></div></li>`);
  }
  for (const p of progs.filter(p => p.published && stale(p.checked_on, 90))) {
    todo.push(`<li><b>${h(p.program_name || p.shelter_name)}: details still right?</b><small>${p.checked_on ? `Last checked ${h(nice(p.checked_on))}.` : "Never checked."}</small>
      <div class="btns"><button class="btn royal sm" type="button" data-act="checked" data-t="sniffari_programs" data-id="${h(p.id)}">Still right</button><a class="btn ghost sm" href="#/sniffari/${h(p.id)}">Open</a></div></li>`);
  }
  for (const p of fosters.filter(p => p.published && stale(p.checked_on, 90))) {
    todo.push(`<li><b>${h(p.program_name || p.shelter_name)}: details still right?</b><small>${p.checked_on ? `Last checked ${h(nice(p.checked_on))}.` : "Never checked."}</small>
      <div class="btns"><button class="btn royal sm" type="button" data-act="checked" data-t="foster_programs" data-id="${h(p.id)}">Still right</button><a class="btn ghost sm" href="#/fosters/${h(p.id)}">Open</a></div></li>`);
  }
  for (const r of help.filter(r => r.published && stale(r.checked_on, 180))) {
    todo.push(`<li><b>${h(r.name)}: still running?</b><small>${r.checked_on ? `Last checked ${h(nice(r.checked_on))}.` : "Never checked."}</small>
      <div class="btns"><button class="btn royal sm" type="button" data-act="checked" data-t="help_resources" data-id="${h(r.id)}">Still running</button><a class="btn ghost sm" href="#/help/${h(r.id)}">Open</a></div></li>`);
  }
  const tiles = [
    ["messages", "✉️", "Messages", msgs.length ? `${msgs.length} new` : "None new"],
    ["animals", "🐾", "Animals", plural(animals.length, "animal")],
    ["goals", "🌾", "Shelter goals", plural(goals.filter(g => g.status === "active").length, "active goal")],
    ["events", "📅", "Events", plural(events.length, "coming up", "coming up")],
    ["partners", "🏡", "Rescues & shelters", ""],
    ["collabs", "🎨", "Collaborations", plural(collabs.length, "collaboration")],
    ["sniffari", "🦮", "Day-out programs", plural(progs.length, "program")],
    ["fosters", "🏠", "Foster programs", plural(fosters.length, "program")],
    ["adventures", "🦮", "Our day outs", plural(advs.length, "day out")],
    ["videos", "🎬", "Day-out videos", plural(videos.length, "video")],
    ["places", "📍", "Dog-friendly places", plural(places.length, "place")],
    ["help", "🤝", "Local help list", plural(help.length, "listing")],
    ["text", "✏️", "Page wording", ""],
    ["visitors", "📈", "Visitors", week ? plural(week.days.reduce((a, d) => a + d[1], 0), "view") + " this week" : ""],
    ["deleted", "🗑️", "Recently deleted", ""],
  ];
  badge(msgs.length);
  recheckSub();
  tidyPhotosNow();
  render(`<h1>Hi! What needs updating?</h1>
    <h2 class="sub">Needs attention</h2>
    ${todo.length ? `<ul class="todo">${todo.join("")}</ul>` : `<p class="allgood">All caught up ✓</p>`}
    <h2 class="sub">Everything</h2>
    <div class="tiles">${tiles.map(([k, ic, t, s]) => `<a class="tile" href="#/${k}"><span class="ic" aria-hidden="true">${ic}</span><b>${t}</b>${s ? `<small>${h(s)}</small>` : ""}</a>`).join("")}</div>
    <p class="small foot">Signed in as ${h(session?.email)}. Changes show on the site straight away.</p>`);
}

function rowHTML(S, key, r) {
  const v = S.row(r), pic = photoUrl(v.photo);
  const flags = v.flags.filter(Boolean).map(f => f.startsWith("!") ? `<span class="flag warn">${h(f.slice(1))}</span>` : `<span class="flag">${h(f)}</span>`).join("");
  return `<li data-s="${h((v.title + " " + v.sub).toLowerCase())}" data-tok="${h((S.tokens ? S.tokens(r) : []).join(" "))}">
    <a class="row" href="#/${key}/${h(r.id)}"><span class="thumb" aria-hidden="true">${v.emoji || ""}${pic ? `<img src="${h(pic)}" alt="" loading="lazy">` : ""}</span>
    <span class="rt"><b>${h(v.title)}</b><small>${h(v.sub)}</small>${flags ? `<span class="flags">${flags}</span>` : ""}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
}

async function showList(key) {
  const S = SECTIONS[key];
  let rows = await api.list(S.table, S.query);
  if (S.order) rows = rows.sort(S.order);
  let filter = "all";
  try { filter = sessionStorage.getItem("f:" + key) || "all"; } catch {}
  render(`<a class="back" href="#/">‹ Start</a>
    <div class="lhead"><h1>${h(S.title)}</h1><a class="btn royal" href="#/${key}/new">+ Add ${h(S.one)}</a></div>
    ${S.intro ? `<p class="lede">${h(S.intro)}</p>` : ""}
    ${S.filters ? `<div class="fchips" role="group" aria-label="Show">${S.filters.map(([v, l]) => `<button type="button" data-filter="${h(v)}" aria-pressed="${v === filter}">${h(l)}</button>`).join("")}</div>` : ""}
    ${rows.length > 6 ? `<label class="sr" for="find">Search</label><input class="search" id="find" type="search" placeholder="Search ${h(S.title.toLowerCase())}" autocomplete="off">` : ""}
    ${rows.length ? `<ul class="rows">${rows.map(r => rowHTML(S, key, r)).join("")}</ul>` : `<p class="allgood">Nothing here yet. Tap “Add ${h(S.one)}” to start.</p>`}
    <p class="small none" hidden>No matches.</p>`);
  const apply = () => {
    const term = ($("#find")?.value || "").trim().toLowerCase();
    let shown = 0;
    $$(".rows li", app).forEach(li => {
      const ok = (!term || li.dataset.s.includes(term)) && (filter === "all" || li.dataset.tok.split(" ").includes(filter));
      li.hidden = !ok; if (ok) shown++;
    });
    $(".none", app).hidden = !!shown || !rows.length;
  };
  $("#find")?.addEventListener("input", apply);
  $$("[data-filter]", app).forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    try { sessionStorage.setItem("f:" + key, filter); } catch {}
    $$("[data-filter]", app).forEach(x => x.setAttribute("aria-pressed", x === b));
    apply();
  }));
  apply();
}

/* ---------- forms ---------- */
const fid = n => "f-" + n;
const barRow = b => `<div class="bar-row" data-id="${h(b.id || "")}">
  <label>What<input name="bar_label" value="${h(b.label || "")}" maxlength="80" placeholder="Round bales" autocomplete="off"></label>
  <label>Goal<input name="bar_target" type="number" inputmode="decimal" min="1" step="any" value="${h(b.target ?? "")}"></label>
  <label>So far<input name="bar_current" type="number" inputmode="decimal" min="0" step="any" value="${h(b.current ?? "")}" placeholder="–"></label>
  <button type="button" class="xbtn" data-bar-remove aria-label="Remove this line">✕</button></div>`;

// Keys in the order the database keeps them (jsonb sorts keys), so an unchanged journey compares equal.
const stepRow = s => `<div class="step-row">
  <label>What happened<input name="j_label" value="${h(s.label || "")}" maxlength="80" placeholder="Went to a foster home" autocomplete="off"></label>
  <label>When<input name="j_date" type="date" value="${h(s.date || "")}"></label>
  <label class="wide">Details<textarea name="j_detail" rows="2" maxlength="500" placeholder="Learning to love car rides">${h(s.detail || "")}</textarea></label>
  <div class="step-btns"><button type="button" class="xbtn" data-step-up aria-label="Move this step up">↑</button><button type="button" class="xbtn" data-step-down aria-label="Move this step down">↓</button><button type="button" class="xbtn" data-step-remove aria-label="Remove this step">✕</button></div></div>`;

// Newest first, like the site shows them. Keys in the database's order (date, text), as with the journey.
const noteRow = n => `<div class="step-row note-row">
  <label>Date<input name="u_date" type="date" value="${h(n.date || "")}"></label>
  <label class="wide">Update or note<textarea name="u_text" rows="3" maxlength="1000" placeholder="Went on a day out to the beach and loved the waves">${h(n.text || "")}</textarea></label>
  <div class="step-btns"><button type="button" class="xbtn" data-note-remove aria-label="Remove this update">✕</button></div></div>`;

// A short list of small records, like extra links: f.cols = [{ key, label, url?, max?, ph?, need? }].
// Keys go in the order the database keeps them (jsonb sorts keys by length), so an unchanged list compares equal.
const jsonbOrder = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)));
const rowsRow = (f, r) => `<div class="step-row rows-row">
  ${f.cols.map(c => `<label>${h(c.label)}<input name="r_${f.name}_${c.key}"${c.url ? ' type="url" inputmode="url" placeholder="https://"' : ` type="text"${c.ph ? ` placeholder="${h(c.ph)}"` : ""}`} maxlength="${c.max || 300}" value="${h(r[c.key] || "")}" autocomplete="off"></label>`).join("")}
  <div class="step-btns"><button type="button" class="xbtn" data-row-up aria-label="Move up">↑</button><button type="button" class="xbtn" data-row-down aria-label="Move down">↓</button><button type="button" class="xbtn" data-row-remove aria-label="Remove">✕</button></div></div>`;

// one photo in a gallery: the first one is the cover
const galItem = u => `<li class="gal-item" data-url="${h(u)}"><img src="${h(photoUrl(u))}" alt="">
  <span class="gal-btns"><button type="button" class="xbtn" data-gal-left aria-label="Move this photo earlier">‹</button><button type="button" class="xbtn" data-gal-right aria-label="Move this photo later">›</button><button type="button" class="xbtn" data-gal-remove aria-label="Remove this photo">✕</button></span></li>`;

function fieldHTML(f, v, ctx) {
  const id = fid(f.name), help = f.help ? `<p class="hint" id="${id}-h">${h(f.help)}</p>` : "";
  const desc = f.help ? ` aria-describedby="${id}-h"` : "", req = f.required ? " required" : "", max = f.max ? ` maxlength="${f.max}"` : "";
  const lab = `<label for="${id}">${h(f.label)}</label>`;
  const wrap = inner => `<div class="field" data-f="${f.name}">${inner}${help}<p class="err" hidden></p></div>`;
  switch (f.type) {
    case "text": case "url": case "number":
      return wrap(lab + `<input id="${id}" name="${f.name}" type="${f.type === "url" ? "url" : f.type === "number" ? "number" : "text"}"${f.type === "url" ? ' inputmode="url" placeholder="https://"' : ""}${f.type === "number" ? ' inputmode="numeric" step="1"' : ""}${f.inputmode ? ` inputmode="${f.inputmode}"` : ""}${f.list ? ` list="${f.list}"` : f.suggest ? ` list="${id}-l"` : ""} value="${h(v ?? "")}"${req}${max}${desc} autocomplete="off">`
        + (f.suggest ? `<datalist id="${id}-l">${f.suggest.map(x => `<option value="${h(x)}">`).join("")}</datalist>` : ""));
    case "textarea":
      return wrap(lab + `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}"${req}${max}${desc}>${h(v ?? "")}</textarea>`);
    case "lines":
      return wrap(lab + `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}"${desc}>${h((v || []).join("\n"))}</textarea>`);
    case "date":
      return wrap(lab + `<div class="inrow"><input id="${id}" name="${f.name}" type="date" value="${h(v ?? "")}"${req}${desc}>${f.today ? `<button type="button" class="btn ghost sm" data-today="${f.name}">${h(f.today)}</button>` : ""}</div>`);
    case "partner":
      return wrap(lab + `<select id="${id}" name="${f.name}"${req}${desc}>${f.required ? (v ? "" : '<option value="">Pick one…</option>') : '<option value="">None</option>'}${ctx.partners.map(p => `<option value="${h(p.id)}"${p.id === v ? " selected" : ""}>${h(p.name)}${p.published && p.feature_ok ? "" : " (hidden)"}</option>`).join("")}</select>`);
    case "choice":
      return wrap(`<fieldset class="choice"${desc}><legend>${h(f.label)}</legend><div class="opts">${f.options.map(([val, l]) => `<label class="opt"><input type="radio" name="${f.name}" value="${h(val)}"${val === v ? " checked" : ""}><span>${h(l)}</span></label>`).join("")}</div></fieldset>`);
    case "tags":
      return wrap(`<fieldset class="checks-f"${desc}><legend>${h(f.label)}</legend><div class="checks">${f.options.map(([val, l]) => `<label><input type="checkbox" name="${f.name}" value="${h(val)}"${(v || []).includes(val) ? " checked" : ""}> ${h(l)}</label>`).join("")}</div></fieldset>`);
    case "toggle":
      return `<div class="field" data-f="${f.name}"><label class="switch"><input type="checkbox" name="${f.name}" role="switch"${v ? " checked" : ""}><span class="track" aria-hidden="true"></span><span class="lbl">${h(f.label)}${f.help ? `<small>${h(f.help)}</small>` : ""}</span></label></div>`;
    case "photo": {
      const pic = photoUrl(v);
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="photo-field">
        <div class="pf-pic">${pic ? `<img src="${h(pic)}" alt="Current photo">` : `<span>No photo yet</span>`}</div>
        <div class="pf-side"><label class="btn ghost sm pick">${pic ? "Change photo" : "Choose a photo"}<input type="file" accept="image/*" class="sr" data-photo="${f.name}"></label>
        <button type="button" class="btn ghost sm" data-photo-remove="${f.name}"${pic ? "" : " hidden"}>Remove photo</button>
        <p class="hint">Photos are shrunk, and hidden data like location is removed, before they upload.</p></div>
        <input type="hidden" name="${f.name}" value="${h(v ?? "")}"></div>`);
    }
    case "journey":
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="steps-ed">${(v || []).map(stepRow).join("")}</div>
        <div class="btns"><button type="button" class="btn ghost sm" data-step-add>+ Add a step</button><button type="button" class="btn ghost sm" data-step-fill>Fill in from the dates</button></div>`);
    case "updates":
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="notes-ed">${(v || []).map(noteRow).join("")}</div>
        <button type="button" class="btn ghost sm" data-note-add>+ Add an update</button>`);
    case "gallery":
      return wrap(`<span class="flabel">${h(f.label)}</span><ul class="gal-ed" data-gallery="${f.name}">${(v || []).map(galItem).join("")}</ul>
        <label class="btn ghost sm pick">+ Add photos<input type="file" accept="image/*" multiple class="sr" data-gallery-add="${f.name}"></label>
        <p class="hint gal-status" aria-live="polite"></p>`);
    case "rows":
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="rows-ed" data-rows-of="${f.name}">${(v || []).map(r => rowsRow(f, r)).join("")}</div>
        <button type="button" class="btn ghost sm" data-row-add="${f.name}">${h(f.add || "+ Add one")}</button>`);
    case "bars":
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="bars">${[...(v || [])].sort((a, b) => a.sort - b.sort).map(barRow).join("")}</div><button type="button" class="btn ghost sm" data-bar-add>+ Add a line</button>`);
  }
  return "";
}

const num = s => (s === "" || s === null || s === undefined ? null : Number(s));
// an email address typed into a link box turns into "https://name@gmail.com", which only opens gmail.com
const emailish = u => { try { return !!new URL(u).username; } catch { return false; } };
function cleanUrl(s) {
  s = String(s || "").trim();
  // a share sheet often pastes the page's title in front of the link: keep just the link
  if (/\s/.test(s) && /https?:\/\/\S/i.test(s)) s = s.match(/https?:\/\/\S+/i)[0];
  if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && /\.[a-z]{2,}/i.test(s)) s = "https://" + s; // "vbspca.com" is fine too
  return s;
}
function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    switch (f.type) {
      case "toggle": out[f.name] = !!el?.checked; break;
      case "choice": out[f.name] = $(`input[name="${f.name}"]:checked`, form)?.value ?? null; break;
      case "tags": out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map(i => i.value); break;
      case "lines": out[f.name] = el.value.split("\n").map(s => s.trim()).filter(Boolean); break;
      case "number": out[f.name] = el.value === "" ? (f.dflt ?? null) : Math.round(Number(el.value)); break;
      case "url": out[f.name] = cleanUrl(el.value) || null; break;
      case "gallery": out[f.name] = $$(`[data-gallery="${f.name}"] .gal-item`, form).map(li => li.dataset.url); break;
      case "rows": // empty rows are dropped
        out[f.name] = $$(`[data-rows-of="${f.name}"] .rows-row`, form)
          .map(r => jsonbOrder(Object.fromEntries(f.cols.map(c => { const x = $(`[name="r_${f.name}_${c.key}"]`, r).value; return [c.key, c.url ? cleanUrl(x) : x.trim()]; }))))
          .filter(o => Object.values(o).some(Boolean));
        break;
      case "journey": // empty rows are dropped
        out[f.name] = $$(".steps-ed .step-row", form).map(r => ({ date: $("[name=j_date]", r).value || null, label: $("[name=j_label]", r).value.trim(), detail: $("[name=j_detail]", r).value.trim() || null }))
          .filter(s => s.label || s.detail || s.date);
        break;
      case "updates": // empty rows are dropped; newest first, undated last, as on the site
        out[f.name] = $$(".note-row", form).map(r => ({ date: $("[name=u_date]", r).value || null, text: $("[name=u_text]", r).value.trim() }))
          .filter(n => n.text || n.date).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        break;
      case "bars":
        out[f.name] = $$(".bar-row", form).map((r, i) => ({ id: r.dataset.id || null, label: $("[name=bar_label]", r).value.trim(), target: num($("[name=bar_target]", r).value), current: num($("[name=bar_current]", r).value), sort: i + 1 }));
        break;
      default: out[f.name] = (el?.value ?? "").trim() || null;
    }
  }
  return out;
}
function validate(form, fields, vals) {
  let first = null;
  for (const f of fields) {
    const box = $(`[data-f="${f.name}"]`, form), err = box && $(".err", box);
    if (!err) continue;
    const v = vals[f.name];
    let msg = "";
    if (!box.hidden) {
      if (f.required && (v === null || v === "")) msg = "Please fill this in.";
      else if (f.type === "url" && v && emailish(v)) msg = "That's an email address, not a web link. Put it in the Email box.";
      else if (f.type === "url" && v && !safeUrl(v)) msg = "That doesn't look like a web link. It should start with https://";
      else if (f.check && v && !f.check[0].test(v)) msg = f.check[1];
      else if (f.after && v && vals[f.after] && v < vals[f.after]) msg = "This can't be before the start date.";
      else if (f.type === "journey") {
        $$(".step-row", box).forEach(r => r.classList.toggle("bad", !$("[name=j_label]", r).value.trim() && !!($("[name=j_detail]", r).value.trim() || $("[name=j_date]", r).value)));
        if (v.some(s => !s.label)) msg = "Each step needs a “What happened”.";
      }
      else if (f.type === "updates") {
        $$(".note-row", box).forEach(r => r.classList.toggle("bad", !$("[name=u_text]", r).value.trim() && !!$("[name=u_date]", r).value));
        if (v.some(n => !n.text)) msg = "Each update needs some words.";
      }
      else if (f.type === "rows") {
        const bad = o => f.cols.some(c => (c.need && !o[c.key]) || (c.url && o[c.key] && (!safeUrl(o[c.key]) || emailish(o[c.key]))));
        const rows = $$(".rows-row", box).filter(r => f.cols.some(c => $(`[name="r_${f.name}_${c.key}"]`, r).value.trim()));
        v.forEach((o, i) => rows[i]?.classList.toggle("bad", bad(o)));
        if (v.some(bad)) msg = f.bad || "Each one needs a name and a web link starting with https://";
      }
      else if (f.type === "bars") {
        const rows = $$(".bar-row", box);
        v.forEach((b, i) => rows[i].classList.toggle("bad", !b.label || !(b.target > 0) || (b.current !== null && !(b.current >= 0))));
        if (v.some(b => !b.label || !(b.target > 0))) msg = "Each line needs a name and a goal number above 0.";
        else if (v.some(b => b.current !== null && !(b.current >= 0))) msg = "“So far” numbers can't be below 0.";
      }
    }
    err.textContent = msg;
    err.hidden = !msg;
    box.classList.toggle("bad", !!msg);
    if (msg && !first) first = box;
  }
  return first;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function showForm(key, id) {
  const S = SECTIONS[key], isNew = id === "new";
  const [found, partners, herds] = await Promise.all([
    isNew ? [null] : api.list(S.table, `${S.query.replace(/&order=[^&]*/, "")}&id=eq.${encodeURIComponent(id)}`),
    S.fields.some(f => f.type === "partner") ? api.list("partners", "select=id,name,published,feature_ok&order=name.asc") : [],
    key === "animals" ? api.list("animals", "select=herd&herd=not.is.null") : [],
  ]);
  const row = found[0];
  if (!isNew && !row) {
    render(`<a class="back" href="#/${key}">‹ ${h(S.title)}</a><h1>Not found</h1><p class="note">That one wasn't found. It may have been deleted.</p>`);
    return;
  }
  const vals = row || Object.fromEntries(S.fields.map(f => [f.name, typeof f.dflt === "function" ? f.dflt() : f.dflt ?? (f.type === "toggle" ? false : ["tags", "lines", "bars", "journey", "updates", "rows", "gallery"].includes(f.type) ? [] : null)]));
  const ctx = { partners };
  render(`<a class="back" href="#/${key}">‹ ${h(S.title)}</a>
    <h1>${isNew ? `Add ${h(S.one)}` : h(S.titleOf(row))}</h1>
    ${!isNew && row.updated_at ? `<p class="small">Last changed ${h(nice(row.updated_at.slice(0, 10)))}</p>` : ""}
    <form class="form eform" novalidate>
      ${S.fields.map(f => fieldHTML(f, vals[f.name], ctx)).join("")}
      ${herds.length ? `<datalist id="herds">${[...new Set(herds.map(x => x.herd))].map(x => `<option value="${h(x)}">`).join("")}</datalist>` : ""}
      <p class="formmsg err-msg" role="alert"></p>
      <div class="savebar"><button class="btn royal" type="submit">${isNew ? "Add" : "Save changes"}</button><a class="btn ghost" href="#/${key}">Cancel</a></div>
    </form>
    ${isNew ? "" : S.noDelete ? `<p class="small danger">${h(S.noDelete)}</p>` : `<div class="danger"><button class="linkbtn" type="button" data-act="delete">Delete this ${h(S.one)}</button></div>`}`);

  const form = $(".eform", app);
  const refresh = () => {
    const v = readForm(form, S.fields);
    for (const f of S.fields) if (f.when) $(`[data-f="${f.name}"]`, form).hidden = !f.when(v);
  };
  refresh();
  form.addEventListener("input", () => { dirty = true; refresh(); });
  form.addEventListener("change", e => {
    dirty = true;
    const f = S.fields.find(x => x.name === e.target.name && x.onPick);
    if (f && e.target.checked) f.onPick(e.target.value, form.elements);
    refresh();
  });
  form.addEventListener("click", async e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.today) { form.elements[t.dataset.today].value = today(); dirty = true; return; }
    if (t.hasAttribute("data-bar-add")) { $(".bars", form).insertAdjacentHTML("beforeend", barRow({})); $(".bars .bar-row:last-child input", form).focus(); dirty = true; return; }
    if (t.hasAttribute("data-bar-remove")) { t.closest(".bar-row").remove(); dirty = true; return; }
    if (t.dataset.rowAdd) {
      const f = S.fields.find(x => x.name === t.dataset.rowAdd), list = $(`[data-rows-of="${f.name}"]`, form);
      list.insertAdjacentHTML("beforeend", rowsRow(f, {})); $(".rows-row:last-child input", list).focus(); dirty = true; return;
    }
    if (t.hasAttribute("data-row-remove")) { t.closest(".rows-row").remove(); dirty = true; return; }
    if (t.hasAttribute("data-gal-remove")) { t.closest(".gal-item").remove(); dirty = true; return; }
    if (t.hasAttribute("data-gal-left") || t.hasAttribute("data-gal-right")) {
      const li = t.closest(".gal-item"), left = t.hasAttribute("data-gal-left"), other = left ? li.previousElementSibling : li.nextElementSibling;
      if (other) { left ? other.before(li) : other.after(li); t.focus(); dirty = true; }
      return;
    }
    if (t.hasAttribute("data-step-add")) { $(".steps-ed", form).insertAdjacentHTML("beforeend", stepRow({})); $(".steps-ed .step-row:last-child input", form).focus(); dirty = true; return; }
    if (t.hasAttribute("data-step-remove")) { t.closest(".step-row").remove(); dirty = true; return; }
    if (t.hasAttribute("data-note-add")) { $(".notes-ed", form).insertAdjacentHTML("afterbegin", noteRow({ date: today() })); $(".notes-ed .note-row:first-child textarea", form).focus(); dirty = true; return; }
    if (t.hasAttribute("data-note-remove")) { t.closest(".note-row").remove(); dirty = true; return; }
    if (t.hasAttribute("data-step-up") || t.hasAttribute("data-step-down") || t.hasAttribute("data-row-up") || t.hasAttribute("data-row-down")) {
      const r = t.closest(".step-row"), up = t.hasAttribute("data-step-up") || t.hasAttribute("data-row-up"), other = up ? r.previousElementSibling : r.nextElementSibling;
      if (other) { up ? other.before(r) : other.after(r); t.focus(); dirty = true; }
      return;
    }
    if (t.hasAttribute("data-step-fill")) {
      // a starting point from the dates on the form; they can be edited or removed after
      const el = form.elements, status = $('input[name="status"]:checked', form)?.value;
      const who = el.partner_id?.value ? el.partner_id.selectedOptions[0].text.replace(/ \(hidden\)$/, "") : "";
      const steps = [];
      if (el.featured_on?.value) steps.push({ label: "Featured", detail: "Video posted", date: el.featured_on.value });
      if (status === "adopted") steps.push({ label: "Adopted", detail: who ? `Through ${who}` : "", date: el.adopted_on?.value || "" });
      else if (status) steps.push({ label: status === "unknown" ? "Lost contact" : label(STATUS, status), detail: who ? `${{ looking: "With", foster: "With", sanctuary: "At", unknown: "Last known with" }[status] || "Through"} ${who}` : "" });
      if (!steps.length) { toast("Add the video date or a status first."); return; }
      $(".steps-ed", form).insertAdjacentHTML("beforeend", steps.map(stepRow).join(""));
      dirty = true;
      return;
    }
    if (t.dataset.photoRemove) {
      const name = t.dataset.photoRemove;
      form.elements[name].value = "";
      $(".pf-pic", form).innerHTML = "<span>No photo yet</span>";
      $(".pick", form).firstChild.textContent = "Choose a photo";
      t.hidden = true; dirty = true;
    }
  });
  $$("[data-photo]", form).forEach(inp => inp.addEventListener("change", async () => {
    const file = inp.files[0];
    if (!file) return;
    const f = S.fields.find(x => x.name === inp.dataset.photo), pic = $(".pf-pic", form);
    pic.innerHTML = "<span>Getting the photo ready…</span>";
    try {
      const url = await upload(file, f.folder, form.elements.name?.value || form.elements.title?.value || f.folder);
      form.elements[f.name].value = url;
      pic.innerHTML = `<img src="${h(url)}" alt="New photo">`;
      $(".pick", form).firstChild.textContent = "Change photo";
      $("[data-photo-remove]", form).hidden = false;
      dirty = true;
      toast("Photo added. Tap Save to keep it.");
    } catch (err) {
      const cur = photoUrl(form.elements[f.name].value);
      pic.innerHTML = cur ? `<img src="${h(cur)}" alt="Current photo">` : "<span>No photo yet</span>";
      if (err instanceof SignedOut) return route();
      toast(err.message, true);
    } finally { inp.value = ""; }
  }));

  // several photos at once, one after another, each shrunk and cleaned like any photo
  $$("[data-gallery-add]", form).forEach(inp => inp.addEventListener("change", async () => {
    const f = S.fields.find(x => x.name === inp.dataset.galleryAdd), list = $(`[data-gallery="${f.name}"]`, form), status = $(".gal-status", list.parentElement);
    const files = [...inp.files], room = (f.max || 40) - $$(".gal-item", list).length;
    if (files.length > room) toast(room > 0 ? `Only ${room} more photo${room === 1 ? "" : "s"} fit, so the rest were skipped.` : `That's the most photos one can have (${f.max || 40}).`, true);
    let done = 0;
    try {
      for (const file of files.slice(0, Math.max(room, 0))) {
        status.textContent = `Adding photo ${done + 1} of ${Math.min(files.length, room)}…`;
        const url = await upload(file, f.folder, form.elements.title?.value || f.folder);
        list.insertAdjacentHTML("beforeend", galItem(url));
        done++; dirty = true;
      }
      if (done) toast(`${done === 1 ? "Photo" : done + " photos"} added. Tap Save to keep ${done === 1 ? "it" : "them"}.`);
    } catch (err) {
      if (err instanceof SignedOut) return route();
      toast(err.message, true);
    } finally { inp.value = ""; status.textContent = ""; }
  }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const v = readForm(form, S.fields), out = $(".formmsg", form), btn = $(".savebar .btn", form);
    const bad = validate(form, S.fields, v);
    if (bad) { out.textContent = "Please fix the highlighted fields."; bad.scrollIntoView({ block: "center" }); $("input,textarea,select", bad)?.focus({ preventScroll: true }); return; }
    const patch = {};
    for (const f of S.fields) if (f.type !== "bars" && (isNew || !same(v[f.name], row[f.name]))) patch[f.name] = v[f.name];
    S.prepare?.(v, row, patch);
    btn.disabled = true; btn.textContent = "Saving…"; out.textContent = "";
    try {
      let saved = row;
      if (isNew) {
        const data = S.beforeAdd ? S.beforeAdd(patch) : patch;
        try { saved = await api.add(S.table, data); }
        catch (err) { if (err.code !== "23505" || !data.slug) throw err; saved = await api.add(S.table, { ...data, slug: data.slug + "-" + Date.now().toString(36).slice(-4) }); }
      } else if (Object.keys(patch).length) saved = await api.save(S.table, row.id, patch);
      await S.afterSave?.(saved, v, row);
      if (!isNew && S.fields.some(f => (f.type === "photo" || f.type === "gallery") && f.name in patch)) tidyPhotosNow(true); // a replaced or removed photo goes
      dirty = false;
      toast(isNew ? "Added ✓" : "Saved ✓");
      go(`#/${key}`);
    } catch (err) {
      if (err instanceof SignedOut) return route();
      out.textContent = err.message;
      btn.disabled = false; btn.textContent = isNew ? "Add" : "Save changes";
    }
  });

  $('[data-act="delete"]', app)?.addEventListener("click", async () => {
    if (!confirm(`Delete “${S.titleOf(row)}”?\n\nYou can bring it back from Recently deleted for 90 days. To just hide it, turn off “Show on the site” instead.`)) return;
    try { await api.drop(S.table, row.id); dirty = false; toast("Deleted"); go(`#/${key}`); }
    catch (err) { if (err instanceof SignedOut) return route(); toast(err.message, true); }
  });
}

/* ---------- messages ---------- */
const DETAIL = { shelter: "Shelter or rescue", want: "Interested in", program: "Program", city: "City", link: "Link", dog: "Dog", rescue: "Rescue",
  kind: "Asking for", video: "Video", answer: "Answer", mention: "OK to say their name in a video" };
// the partner form's checkboxes, in words
const WANT = { features: "Adoption features", goal: "A shelter goal", sniffari: "A Sniffari listing", events: "Event coverage", series: "A video series", coloring: "Coloring pages" };
const detailHTML = (k, x) => {
  if (k === "want") x = [].concat(x).map(w => WANT[w] || w);
  const text = Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : String(x);
  return (k === "link" || k === "video") && safeUrl(text) ? `<a href="${h(safeUrl(text))}" target="_blank" rel="noopener">${h(text)}</a>` : h(text);
};
const when = ts => {
  const d = new Date(ts), days = Math.round((new Date(today()) - new Date(d.toLocaleDateString("en-CA"))) / 864e5);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return days === 0 ? `Today, ${t}` : days === 1 ? `Yesterday, ${t}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
async function showMessages(view) {
  const rows = await api.list("messages", "select=*&order=created_at.desc&limit=300");
  const list = rows.filter(m => view === "all" || (view === "done" ? m.handled : !m.handled));
  const tabs = [["new", `New (${rows.filter(m => !m.handled).length})`], ["done", "Done"], ["all", "All"]];
  render(`<a class="back" href="#/">‹ Start</a><h1>Messages</h1>
    <p class="lede">Everything sent through the forms on the site.</p>
    <div id="pushbox"></div>
    <div class="fchips" role="group" aria-label="Show">${tabs.map(([v, l]) => `<a href="#/messages/${v}" aria-current="${v === view}">${h(l)}</a>`).join("")}</div>
    ${list.length ? `<ul class="msgs">${list.map(m => {
      const mail = encodeURIComponent(m.email).replace(/%40/g, "@");
      const det = Object.entries(m.details || {}).filter(([, x]) => x !== null && x !== "" && !(Array.isArray(x) && !x.length));
      return `<li class="msg${m.handled ? " done" : ""}">
        <div class="mtop"><span class="chip c-topic">${h(TOPICS[m.topic] || m.topic)}</span><time datetime="${h(m.created_at)}">${h(when(m.created_at))}</time></div>
        <h2>${h(m.name || "No name given")}</h2>
        <p class="memail">${h(m.email)}</p>
        ${m.body ? `<p class="mbody">${h(m.body)}</p>` : ""}
        ${det.length ? `<dl class="mdet">${det.map(([k, x]) => `<dt>${h(DETAIL[k] || k)}</dt><dd>${detailHTML(k, x)}</dd>`).join("")}</dl>` : ""}
        ${m.page ? `<p class="small">Sent from ${h(m.page)}</p>` : ""}
        <div class="btns"><a class="btn royal sm" href="mailto:${h(mail)}?subject=${encodeURIComponent("Re: your message to TheTerr0rTw!ns")}">Reply by email</a>
          ${m.handled ? `<button class="btn ghost sm" type="button" data-act="msg-undo" data-id="${h(m.id)}">Move back to new</button>` : `<button class="btn ghost sm" type="button" data-act="msg-done" data-id="${h(m.id)}">Mark done</button>`}
          <button class="linkbtn" type="button" data-act="msg-delete" data-id="${h(m.id)}">Delete</button></div></li>`;
    }).join("")}</ul>` : `<p class="allgood">${view === "new" ? "No new messages ✓" : "Nothing here."}</p>`}`);
  badge(rows.filter(m => !m.handled).length);
  showPushBox();
}

/* ---------- notifications ---------- */
// Phone notifications for new messages (Web Push). This device signs up with its browser's push service, the
// sign-up is saved in push_subscriptions, and the notify-message function sends to it when a message comes in.
// sw.js (next to this page) shows them. iPhones and iPads need the editor added to the Home Screen first.
const NOTIFY = `${API}/functions/v1/notify-message`;
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const apple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const onHomeScreen = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? "iPhone" : apple() ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Computer"; };
async function notifyCall(body, signedIn) {
  let r;
  try { r = await fetch(NOTIFY, { method: "POST", headers: { "Content-Type": "application/json", ...(signedIn ? { Authorization: `Bearer ${await token()}` } : {}) }, body: JSON.stringify(body) }); }
  catch { throw new Error("Can't reach the notification service. Check your connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "The notification service had a problem. Please try again.");
  return j;
}
const swReady = canPush() ? navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => null) : Promise.resolve(null);
async function currentSub() { const reg = await swReady; return (await reg?.pushManager.getSubscription()) || null; }
async function keepSub(sub) {
  const j = sub.toJSON();
  await db("POST", "push_subscriptions?on_conflict=endpoint", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email: (session?.email || "").toLowerCase(), device: deviceName() }, "resolution=merge-duplicates,return=minimal");
}
let pushKey = null;
async function turnOnPush() {
  // asked straight away, while the tap still counts: phones only show the question in answer to a tap
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked for this site. Allow them in your phone's settings, then try again." : "Notifications weren't allowed. Tap Turn on again and choose Allow.");
  const reg = await swReady;
  if (!reg) throw new Error("This browser can't set up notifications here.");
  pushKey ??= (await notifyCall({ action: "key" })).key;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
  await keepSub(sub);
}
async function turnOffPush() {
  const sub = await currentSub();
  if (!sub) return;
  await db("DELETE", `push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, undefined, "return=minimal");
  await sub.unsubscribe();
}
async function showPushBox() {
  const box = $("#pushbox", app);
  if (!box) return;
  const card = (title, text, buttons = "") => { box.innerHTML = `<div class="card pushbox"><h2>${title}</h2><p class="small">${text}</p>${buttons ? `<div class="btns">${buttons}</div>` : ""}</div>`; };
  if (!canPush()) {
    return apple() && !onHomeScreen()
      ? card("🔔 Get notified about new messages", "On iPhone and iPad, first add the editor to your Home Screen: tap <b>Share</b>, then <b>Add to Home Screen</b>. Open the editor from that icon, come back here and turn notifications on.")
      : card("🔔 Notifications", "This browser can't show notifications. Try Chrome, or Safari with the editor added to the Home Screen.");
  }
  if (Notification.permission === "denied") return card("🔔 Notifications are blocked", "This phone or computer has blocked notifications for this site. Allow them in its settings (under this browser, or the Site editor app), then come back here.");
  const sub = await currentSub().catch(() => null);
  if (sub && Notification.permission === "granted") {
    return card("🔔 Notifications are on", "This device gets a notification when someone sends a message. It shows the topic and their name, never the message itself.",
      `<button class="btn ghost sm" type="button" data-act="push-test">Send a test</button><button class="linkbtn" type="button" data-act="push-off">Turn off on this device</button>`);
  }
  card("🔔 Get notified about new messages", "Get a notification on this device whenever someone sends a message. It shows the topic and their name, never the message itself. Turn it on for each phone or computer you want them on.",
    `<button class="btn royal sm" type="button" data-act="push-on">Turn on notifications</button>`);
  if (!pushKey) notifyCall({ action: "key" }).then(j => { pushKey = j.key; }).catch(() => {}); // ready before the tap
}
// The number of new messages on the app icon, where the phone supports it.
const badge = n => { try { (n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.())?.catch?.(() => {}); } catch {} };
navigator.serviceWorker?.addEventListener("message", e => { if (e.data?.go === "#/messages") go("#/messages"); });
let subChecked = false; // once per visit, make sure this device's sign-up is still saved
const recheckSub = () => { if (subChecked || !canPush()) return; subChecked = true; currentSub().then(s => s && Notification.permission === "granted" && keepSub(s)).catch(() => {}); };

/* ---------- page wording ---------- */
// Every piece of wording on the site, listed by the build (CFG.textDefaults, see site/wording.mjs): page text,
// photo descriptions and form hints, page titles and descriptions, longer blocks, and the phrases site.js writes
// (js.*). Saved wording lives in site_text by key; an empty body means "use the original words".
const WORDS = CFG.textDefaults || [], AREAS = CFG.areas || [];
const PHRASE_GROUPS = {
  goal: "Shelter goals", status: "Animal labels", count: "Animal counts", animal: "Happy Tails", stat: "The adoption number",
  journey: "An animal's journey (the pop-up)", rescue: "Rescues", horse: "Willow Woods horses", event: "Events",
  spotlight: "Animal Story Spotlight", collab: "Collaborations", program: "Day-out programs", foster: "Foster programs", adventure: "Our day outs", video: "Day-out videos", place: "Dog-friendly places", help: "Local help list",
  form: "Contact forms", failed: "When part of a page can't load",
};
const clip = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const areaTitle = scope => AREAS.find(a => a.scope === scope)?.title || scope;
const drafts = new Map(); // key → words typed but not saved yet

function wordItem(w, saved, showArea) {
  const cur = drafts.get(w.key) ?? saved[w.key]?.body ?? w.text, changed = !!saved[w.key];
  const id = "w-" + w.key.replace(/[^a-z0-9-]/gi, "-");
  const rows = w.multi ? 10 : Math.min(8, Math.max(1, Math.ceil(cur.length / 34)));
  const where = [w.label || w.kind, w.ctx && `under “${clip(w.ctx, 50)}”`].filter(Boolean).join(", ");
  return `<div class="witem${changed ? " changed" : ""}" data-key="${h(w.key)}">
    <label class="wlab" for="${id}">${showArea ? `<b>${h(areaTitle(w.scope))}</b>` : ""}<span>${h(where)}</span>${changed ? `<span class="flag">Changed</span>` : ""}</label>
    <textarea id="${id}" rows="${rows}" maxlength="6000" spellcheck="true">${h(cur)}</textarea>
    ${w.part ? `<p class="hint">Part of: “${h(clip(w.part, 200))}”</p>` : ""}
    ${/\{\w+\}/.test(w.text) ? `<p class="hint">Words in {curly brackets} are filled in by the site. Keep them where they should go.</p>` : ""}
    ${w.multi ? `<p class="hint">A blank line starts a new paragraph. Start a line with ## to make it a heading.</p>` : ""}
    ${changed ? `<p class="small worig">Original: “${h(clip(w.text, 200))}” <button class="linkbtn plain" type="button" data-orig="${h(w.key)}">Use the original</button></p>` : ""}
  </div>`;
}

async function showText(scope) {
  const rows = await api.list("site_text", "select=key,body,updated_at");
  const saved = Object.fromEntries(rows.filter(r => r.body && r.body.trim()).map(r => [r.key, { ...r, body: r.body.trim() }]));
  const area = scope && AREAS.find(a => a.scope === scope);
  if (scope && !area) return go("#/text");
  drafts.clear();
  const known = new Set(WORDS.map(w => w.key));
  const saveBar = `<div class="savebar wsave" hidden><button class="btn royal" type="button" data-act="w-save">Save changes</button></div>`;
  if (!area) {
    const orphans = Object.keys(saved).filter(k => !known.has(k));
    render(`<div id="wscreen"><a class="back" href="#/">‹ Start</a><h1>Page wording</h1>
      <p class="lede">Change any wording on the site. Pick a page, or search for the words you want to change.</p>
      <label class="sr" for="wfind">Search all the wording</label><input class="search" id="wfind" type="search" placeholder="Search all the wording" autocomplete="off">
      <div id="wresults" class="wlist"></div>
      <ul class="rows warea">${AREAS.map(a => {
        const all = WORDS.filter(w => w.scope === a.scope), c = all.filter(w => saved[w.key]).length;
        return `<li><a class="row" href="#/text/${h(a.scope)}"><span class="rt"><b>${h(a.title)}</b><small>${plural(all.length, "piece")} of wording${c ? ` · ${c} changed` : ""}</small></span><span class="chev" aria-hidden="true">›</span></a></li>`;
      }).join("")}</ul>
      <p class="small">Animals, shelter goals, rescues, events, day-out programs and the help list are changed in their own sections on the start screen.</p>
      ${orphans.length ? `<div class="card worphans"><h2>Saved wording that's no longer on the site</h2>
        <p class="small">The words these replaced have since been changed on the site itself, so they don't show anywhere. Clear them, or copy the words to where they belong now.</p>
        <ul>${orphans.map(k => `<li><span>“${h(clip(saved[k].body, 140))}”</span> <button class="linkbtn" type="button" data-act="w-clear" data-key="${h(k)}">Clear</button></li>`).join("")}</ul></div>` : ""}
      ${saveBar}</div>`);
    const box = $("#wresults"), find = $("#wfind");
    let timer;
    find.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = find.value.trim().toLowerCase();
        if (q.length < 2) { box.innerHTML = ""; return; }
        const hits = WORDS.filter(w => (drafts.get(w.key) ?? saved[w.key]?.body ?? w.text).toLowerCase().includes(q) || w.text.toLowerCase().includes(q));
        box.innerHTML = hits.length
          ? hits.slice(0, 40).map(w => wordItem(w, saved, true)).join("") + (hits.length > 40 ? `<p class="small">${hits.length - 40} more. Type a few more words to narrow it down.</p>` : "")
          : `<p class="allgood">No wording matches “${h(find.value.trim())}”.</p>`;
      }, 150);
    });
  } else {
    let items = WORDS.filter(w => w.scope === scope);
    const changedCount = items.filter(w => saved[w.key]).length;
    let filter = "all";
    try { filter = sessionStorage.getItem("wf") === "changed" && changedCount ? "changed" : "all"; } catch {}
    const lede = scope === "js" ? "Words the site writes as pages load: labels, counts, empty lists and form replies."
      : scope === "all" ? "The menu, footer and contact form. They're the same on every page." : "Everything on this page, from top to bottom.";
    const list = () => {
      const shown = filter === "changed" ? items.filter(w => saved[w.key]) : items;
      let group = "";
      return shown.map(w => {
        if (scope !== "js") return wordItem(w, saved);
        const g = w.key.split(".")[1], head = g !== group ? `<h2 class="sub">${h(PHRASE_GROUPS[g] || g)}</h2>` : "";
        group = g;
        return head + wordItem(w, saved);
      }).join("");
    };
    render(`<div id="wscreen"><a class="back" href="#/text">‹ Page wording</a>
      <div class="lhead"><h1>${h(area.title)}</h1>${area.path ? `<a class="btn ghost sm" href="${h(CFG.base + area.path.replace(/^\//, ""))}" target="_blank" rel="noopener">See the page <span class="ext" aria-hidden="true">↗</span></a>` : ""}</div>
      <p class="lede">${h(lede)} Change what you like, then tap <b>Save changes</b>. To go back to the original words, empty the box.</p>
      ${changedCount ? `<div class="fchips" role="group" aria-label="Show"><button type="button" data-wf="all" aria-pressed="${filter === "all"}">Everything</button><button type="button" data-wf="changed" aria-pressed="${filter === "changed"}">Changed (${changedCount})</button></div>` : ""}
      <div class="wlist" id="wlist">${list()}</div>
      ${saveBar}</div>`);
    $$("[data-wf]", app).forEach(b => b.addEventListener("click", () => {
      filter = b.dataset.wf;
      try { sessionStorage.setItem("wf", filter); } catch {}
      $$("[data-wf]", app).forEach(x => x.setAttribute("aria-pressed", x === b));
      $("#wlist").innerHTML = list();
    }));
  }
  // typing, "use the original", saving (listeners on this screen's own element, so they go when it does)
  const root = $("#wscreen"), bar = $(".wsave", root);
  const pending = () => {
    const out = [];
    for (const [key, v] of drafts) {
      const w = WORDS.find(x => x.key === key);
      if (!w) continue;
      const body = !v.trim() || v.trim() === w.text.trim() ? "" : v.trim();
      if (body !== (saved[key]?.body || "")) out.push({ key, body });
    }
    return out;
  };
  const update = () => {
    const n = pending().length;
    dirty = n > 0;
    bar.hidden = !n;
    $("button", bar).textContent = n === 1 ? "Save 1 change" : `Save ${n} changes`;
  };
  root.addEventListener("input", e => {
    const item = e.target.closest(".witem");
    if (item && e.target.tagName === "TEXTAREA") { drafts.set(item.dataset.key, e.target.value); update(); }
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-orig]");
    if (!b) return;
    const w = WORDS.find(x => x.key === b.dataset.orig), ta = $("textarea", b.closest(".witem"));
    ta.value = w.text; drafts.set(w.key, w.text); update(); ta.focus();
  });
  bar.querySelector("button").addEventListener("click", async () => {
    const out = pending();
    if (!out.length) return;
    const btn = bar.querySelector("button");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await db("POST", "site_text?on_conflict=key", out, "resolution=merge-duplicates,return=minimal");
      dirty = false;
      toast(out.length === 1 ? "Saved ✓ It's on the site now." : `Saved ${out.length} changes ✓ They're on the site now.`);
      showText(scope);
    } catch (err) {
      if (err instanceof SignedOut) return route();
      toast(err.message, true);
      btn.disabled = false; update();
    }
  });
}

/* ---------- recently deleted ---------- */
// Every delete keeps a copy for 90 days (public.content_history). Restore puts back the row and anything
// deleted with it, like a goal's lines.
const KIND = {
  animals: ["Animal", r => r.name], goals: ["Shelter goal", r => r.title], goal_bars: ["Line on a shelter goal", r => r.label],
  events: ["Event", r => r.title], collabs: ["Collaboration", r => r.title], partners: ["Rescue or shelter", r => r.name], sniffari_programs: ["Day-out program", r => r.program_name || r.shelter_name],
  foster_programs: ["Foster program", r => r.program_name || r.shelter_name], adventures: ["Day out", r => r.title],
  videos: ["Day-out video", r => r.title], places: ["Dog-friendly place", r => r.name],
  help_resources: ["Help listing", r => r.name], messages: ["Message", r => (r.name ? `From ${r.name}` : `From ${r.email}`)],
};
async function showDeleted() {
  const rows = await api.list("content_history", "select=id,at,tx,tbl,row_key,data,by_email&op=eq.delete&restored_at=is.null&order=at.desc&limit=300");
  const groups = new Map();
  for (const r of rows.filter(r => KIND[r.tbl])) { if (!groups.has(r.tx)) groups.set(r.tx, []); groups.get(r.tx).push(r); }
  const order = Object.keys(KIND), items = [...groups.values()].map(g => g.sort((a, b) => order.indexOf(a.tbl) - order.indexOf(b.tbl)));
  render(`<a class="back" href="#/">‹ Start</a><h1>Recently deleted</h1>
    <p class="lede">Anything deleted in the last 90 days. Restore puts it back just as it was.</p>
    ${items.length ? `<ul class="msgs">${items.map(([m, ...rest]) => {
      const [kind, name] = KIND[m.tbl];
      const extra = !rest.length ? "" : rest.every(x => x.tbl === "goal_bars") ? ` with its ${rest.length === 1 ? "line" : plural(rest.length, "line")}` : ` and ${plural(rest.length, "other thing")}`;
      return `<li class="msg del"><div class="mtop"><span class="chip c-topic">${h(kind)}</span><time datetime="${h(m.at)}">${h(when(m.at))}</time></div>
        <h2>${h(name(m.data) || "Untitled")}</h2>
        <p class="small">Deleted${extra}${m.by_email ? ` by ${h(m.by_email)}` : ""}</p>
        <div class="btns"><button class="btn royal sm" type="button" data-act="restore" data-id="${h(m.id)}">Restore</button>
          <button class="linkbtn" type="button" data-act="forget" data-keys="${h([m, ...rest].map(x => x.row_key).join(","))}">Remove for good</button></div></li>`;
    }).join("")}</ul>` : `<p class="allgood">Nothing deleted lately ✓</p>`}`);
}

/* ---------- visitors ---------- */
// Counts kept by the site itself (public.page_views, public.visit_sources): a page, a day and a number.
// No cookies, and nothing about who visited.
const SOURCES = { tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", google: "Google", bing: "Bing", duckduckgo: "DuckDuckGo",
  x: "X (Twitter)", reddit: "Reddit", pinterest: "Pinterest", linktree: "Linktree", direct: "Direct (typed in, bookmarks, some apps)" };
const RANGES = [["7", "7 days"], ["30", "30 days"], ["365", "12 months"]];
const NOCOUNT = "tt-no-count";
function barList(rows, name) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return `<ul class="vlist">${rows.map(([k, n]) => `<li><span class="vname">${h(name(k))}</span><b>${n.toLocaleString("en-US")}</b><i data-w="${Math.round(n / max * 100)}"></i></li>`).join("")}</ul>`;
}
async function showVisitors(range) {
  if (!RANGES.some(r => r[0] === range)) range = "7";
  const days = Number(range), s = await db("POST", "rpc/visitor_summary", { p_days: days });
  const views = s.days.reduce((a, d) => a + d[1], 0), visits = s.sources.reduce((a, d) => a + d[1], 0);
  const by = Object.fromEntries(s.days), bars = [];
  const start = new Date(s.from + "T00:00:00"), end = new Date(today() + "T00:00:00");
  if (days <= 31) {
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) bars.push([d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), by[d.toLocaleDateString("en-CA")] || 0]);
  } else {
    const months = {};
    for (const [d, n] of s.days) months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + n;
    for (const d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1))
      bars.push([d.toLocaleDateString("en-US", { month: "short" }), months[d.toLocaleDateString("en-CA").slice(0, 7)] || 0]);
  }
  const max = Math.max(1, ...bars.map(b => b[1]));
  const pageName = p => (CFG.pages || []).find(x => x.path === p)?.title || (p === "/404" ? "Page not found" : p);
  let off = false;
  try { off = localStorage.getItem(NOCOUNT) === "1"; } catch {}
  render(`<a class="back" href="#/">‹ Start</a><h1>Visitors</h1>
    <p class="lede">How often each page is viewed and where visitors come from. No cookies, and nothing about who visited is kept.</p>
    <div class="fchips" role="group" aria-label="Show">${RANGES.map(([v, l]) => `<a href="#/visitors/${v}" aria-current="${v === range}">${h(l)}</a>`).join("")}</div>
    <div class="vstats"><p><b>${views.toLocaleString("en-US")}</b> page ${views === 1 ? "view" : "views"}</p><p><b>${visits.toLocaleString("en-US")}</b> ${visits === 1 ? "visit" : "visits"}</p></div>
    <div class="card vcard">
      <div class="vchart" role="img" aria-label="${h(`Page views per ${days <= 31 ? "day" : "month"}: ${bars.map(([l, n]) => `${l}, ${n}`).join("; ")}`)}">${bars.map(([l, n]) => `<span title="${h(l)}: ${n}" data-h="${Math.round(n / max * 100)}"></span>`).join("")}</div>
      <div class="vaxis" aria-hidden="true"><span>${h(bars[0]?.[0] || "")}</span><span>${h(bars.at(-1)?.[0] || "")}</span></div>
    </div>
    <h2 class="sub">Pages</h2>
    ${s.pages.length ? barList(s.pages, pageName) : `<p class="allgood">No views yet.</p>`}
    <h2 class="sub">Where visits came from</h2>
    ${s.sources.length ? barList(s.sources, k => SOURCES[k] || k) : `<p class="allgood">No visits yet.</p>`}
    <p class="hint vtip">Visits from inside the TikTok and Instagram apps often show as Direct. To count them, add <b>?from=tiktok</b> to the link in your bio, like <b>${h((CFG.siteUrl || "") + "?from=tiktok")}</b> (or ?from=instagram, ?from=youtube).</p>
    <div class="card vdev">
      <h2>This phone or computer</h2>
      <p class="small">Visits from a device that's signed in here never count. ${off ? "This one is also skipped when signed out." : "When signed out, this one counts like any visitor."}</p>
      <div class="btns"><button class="btn ghost sm" type="button" data-act="nocount">${off ? "Count it again when signed out" : "Also skip it when signed out"}</button>
        <button class="linkbtn" type="button" data-act="clear-counts">Start the counts fresh</button></div>
    </div>`);
  // the page's security policy allows no inline styles, so sizes are set here
  $$(".vchart span", app).forEach(el => { el.style.height = Math.max(Number(el.dataset.h), 1) + "%"; });
  $$(".vlist i", app).forEach(el => { el.style.width = el.dataset.w + "%"; });
}

/* ---------- one-tap actions ---------- */
app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b || !["checked", "adopted", "msg-done", "msg-undo", "msg-delete", "restore", "forget", "nocount", "clear-counts", "push-on", "push-off", "push-test", "w-clear", "signout"].includes(b.dataset.act)) return;
  const id = b.dataset.id;
  try {
    switch (b.dataset.act) {
      case "signout": return signOut();
      case "checked": await api.save(b.dataset.t, id, { checked_on: today() }); toast("Marked as checked today ✓"); break;
      case "adopted": await api.save("animals", id, { status: "adopted", adopted_on: today() }); toast("Marked adopted 🎉"); break;
      case "msg-done": await api.save("messages", id, { handled: true }); toast("Marked done ✓"); break;
      case "msg-undo": await api.save("messages", id, { handled: false }); toast("Moved back to new"); break;
      case "msg-delete":
        if (!confirm("Delete this message?\n\nYou can bring it back from Recently deleted for 90 days.")) return;
        await api.drop("messages", id); toast("Deleted"); break;
      case "restore": await db("POST", "rpc/restore_deleted", { p_id: Number(id) }); toast("Restored ✓"); break;
      case "forget": {
        if (!confirm("Remove this for good?\n\nIt can't be brought back after this.")) return;
        const r = await db("DELETE", `content_history?row_key=in.(${b.dataset.keys})&select=id`, undefined, "return=representation");
        if (!r?.length) throw new Error(NOT_SAVED);
        toast("Removed for good"); break;
      }
      case "push-on": b.disabled = true; await turnOnPush(); toast("Notifications are on ✓"); break;
      case "push-off": await turnOffPush(); toast("Notifications are off on this device"); break;
      case "push-test": {
        const sub = await currentSub();
        if (!sub) throw new Error("This device isn't signed up for notifications. Turn them on first.");
        await notifyCall({ action: "test", endpoint: sub.endpoint }, true); toast("Test sent. It should show up in a few seconds."); return;
      }
      case "w-clear":
        if (!confirm("Clear this saved wording? It isn't showing anywhere on the site.")) return;
        await db("POST", "site_text?on_conflict=key", { key: b.dataset.key, body: "" }, "resolution=merge-duplicates,return=minimal");
        toast("Cleared"); break;
      case "nocount":
        try { localStorage.getItem(NOCOUNT) === "1" ? localStorage.removeItem(NOCOUNT) : localStorage.setItem(NOCOUNT, "1"); } catch {}
        break;
      case "clear-counts":
        if (!confirm("Clear all the visitor counts and start from zero?\n\nUse this on launch day, so visits during the preview don't count.")) return;
        await db("POST", "rpc/clear_visitor_counts", {}); toast("Counts cleared"); break;
    }
    route();
  } catch (err) { b.disabled = false; if (err instanceof SignedOut) return route(); toast(err.message, true); }
});

/* ---------- start ---------- */
// The page's security policy blocks inline handlers, so photos that fail to load are removed here
// (the emoji placeholder underneath shows instead).
document.addEventListener("error", e => { if (e.target.tagName === "IMG" && e.target.closest(".thumb")) e.target.remove(); }, true);
async function signOut() {
  try { if (session) await fetch(`${API}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${session.access}` } }); } catch {}
  keep(null); editorCheck = null;
  go("#/");
}
$("#signout").addEventListener("click", signOut);
document.addEventListener("click", e => {
  const a = e.target.closest('a[href^="#"]');
  if (a && dirty && !confirm("Leave without saving your changes?")) e.preventDefault();
});
addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
addEventListener("hashchange", route);
route();
})();
