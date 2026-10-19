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

/* ---------- what can be edited ---------- */
const STATUS = [["looking", "Still looking"], ["foster", "In foster"], ["adopted", "Adopted"], ["sanctuary", "In sanctuary"], ["placed", "Placed or released"]];
const SPECIES = [["dog", "Dog"], ["cat", "Cat"], ["horse", "Horse"], ["bird", "Bird"], ["other", "Other"]];
const EMOJI = { dog: "🐶", cat: "🐱", horse: "🐴", bird: "🐦", other: "🐾" };
const KINDS = [["rescue", "Rescue"], ["shelter", "Shelter"], ["sanctuary", "Sanctuary"]];
const TAGS = [["free", "Free"], ["half", "Half-day option"], ["kids", "Kids welcome"], ["first", "Good for first-timers"]];
const HELPCATS = [["food", "Food and supplies"], ["vet", "Vet bills"], ["behavior", "Behavior help"], ["housing", "Housing and pet deposits"], ["rehoming", "Rehoming without a shelter"], ["birds", "Bird care"], ["wildlife", "Wild animal help (Wildlife page)"]];
const TOPICS = { partner: "Partnership", help: "Help keeping a pet", dog: "About a dog", sniffari: "Day-out program", other: "Something else" };
const RANK = { looking: 0, foster: 1, adopted: 2, sanctuary: 3, placed: 4 };
const stale = (d, days) => d === null || d === undefined || daysAgo(d) >= days;

const SHOW = { name: "published", type: "toggle", label: "Show on the site", help: "Turn this off to hide it without losing anything.", dflt: true };
const SORT = { name: "sort", type: "number", label: "Order", help: "Lower numbers show first.", dflt: 100 };

const SECTIONS = {
  animals: {
    table: "animals", title: "Animals", one: "animal", icon: "🐾",
    intro: "Everyone on Happy Tails, the rescue cards and the Willow Woods herds.",
    query: "select=*,partner:partners(name)&order=name.asc",
    titleOf: r => r.name,
    filters: [["all", "All"], ["looking", "Still looking"], ["foster", "In foster"], ["adopted", "Adopted"], ["sanctuary", "In sanctuary"], ["hidden", "Hidden"]],
    tokens: r => [r.status, r.published ? "" : "hidden"],
    order: (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || a.name.localeCompare(b.name),
    row: r => ({ title: r.name, sub: [label(STATUS, r.status), r.partner?.name].filter(Boolean).join(" · "), photo: r.photo_url, emoji: EMOJI[r.species],
      flags: [!r.published && "Hidden", r.status === "looking" && r.published && stale(r.checked_on, 21) && "!Needs a check"] }),
    fields: [
      { name: "name", type: "text", label: "Name", required: true, max: 120 },
      { name: "species", type: "choice", label: "What kind of animal?", options: SPECIES, dflt: "dog" },
      { name: "status", type: "choice", label: "Where are they now?", options: STATUS, dflt: "looking",
        onPick: (v, el) => { if (v === "adopted" && !el.adopted_on.value) el.adopted_on.value = today(); if (v === "looking" && !el.checked_on.value) el.checked_on.value = today(); } },
      { name: "partner_id", type: "partner", label: "Rescue or shelter" },
      { name: "photo_url", type: "photo", label: "Photo", folder: "animals" },
      { name: "note", type: "textarea", rows: 2, max: 200, label: "Short note", help: "Shown under their name. Keep it to a line." },
      { name: "journey", type: "journey", label: "Their journey", help: "The steps people see when they tap this animal on Happy Tails, in order. Leave it empty and the site uses the video and adoption dates." },
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
      { name: "facts", type: "lines", label: "Quick facts", rows: 4, help: "One per line, like “Saturdays 9 AM to 1 PM” or “Ages 18+”." },
      { name: "tags", type: "tags", label: "Filters it shows under", options: TAGS },
      { name: "checked_on", type: "date", label: "Details last checked", today: "Checked today", dflt: today },
      SHOW, SORT,
    ],
  },
  help: {
    table: "help_resources", title: "Local help list", one: "help listing", icon: "🤝",
    intro: "Shown on the “Help keeping your pet” page under each kind of help. Wild animal help shows on the Wildlife page.",
    query: "select=*&order=category.asc,sort.asc,name.asc",
    titleOf: r => r.name,
    filters: [["all", "All"], ...HELPCATS],
    tokens: r => [r.category, r.published ? "" : "hidden"],
    row: r => ({ title: r.name, emoji: "🤝", sub: [label(HELPCATS, r.category), r.area].filter(Boolean).join(" · "),
      flags: [!r.published && "Hidden", r.published && stale(r.checked_on, 180) && "!Check it's still running"] }),
    fields: [
      { name: "category", type: "choice", label: "What kind of help?", options: HELPCATS, dflt: "food" },
      { name: "name", type: "text", label: "Name", required: true, max: 200 },
      { name: "description", type: "textarea", rows: 3, max: 600, label: "What they offer" },
      { name: "link_url", type: "url", label: "Website" },
      { name: "phone", type: "text", label: "Phone", max: 40, inputmode: "tel" },
      { name: "area", type: "text", label: "Area", max: 100, help: "A city, or “All of Hampton Roads”. Never a private address." },
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
    if (sec === "text") return await showText();
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
  const [msgs, animals, goals, progs, help, events, week] = await Promise.all([
    api.list("messages", "select=id&handled=is.false"),
    api.list("animals", "select=id,name,status,published,checked_on"),
    api.list("goals", "select=id,title,status,published,figures_updated_at,bars:goal_bars(id)"),
    api.list("sniffari_programs", "select=id,program_name,shelter_name,published,checked_on"),
    api.list("help_resources", "select=id,name,published,checked_on"),
    api.list("events", `select=id&starts_on=gte.${today()}`),
    db("POST", "rpc/visitor_summary", { p_days: 7 }).catch(e => { if (e instanceof SignedOut) throw e; return null; }),
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
    ["sniffari", "🦮", "Day-out programs", plural(progs.length, "program")],
    ["help", "🤝", "Local help list", plural(help.length, "listing")],
    ["text", "✏️", "Page wording", ""],
    ["visitors", "📈", "Visitors", week ? plural(week.days.reduce((a, d) => a + d[1], 0), "view") + " this week" : ""],
    ["deleted", "🗑️", "Recently deleted", ""],
  ];
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
  <label class="wide">Details<input name="j_detail" value="${h(s.detail || "")}" maxlength="200" placeholder="Learning to love car rides" autocomplete="off"></label>
  <div class="step-btns"><button type="button" class="xbtn" data-step-up aria-label="Move this step up">↑</button><button type="button" class="xbtn" data-step-down aria-label="Move this step down">↓</button><button type="button" class="xbtn" data-step-remove aria-label="Remove this step">✕</button></div></div>`;

function fieldHTML(f, v, ctx) {
  const id = fid(f.name), help = f.help ? `<p class="hint" id="${id}-h">${h(f.help)}</p>` : "";
  const desc = f.help ? ` aria-describedby="${id}-h"` : "", req = f.required ? " required" : "", max = f.max ? ` maxlength="${f.max}"` : "";
  const lab = `<label for="${id}">${h(f.label)}</label>`;
  const wrap = inner => `<div class="field" data-f="${f.name}">${inner}${help}<p class="err" hidden></p></div>`;
  switch (f.type) {
    case "text": case "url": case "number":
      return wrap(lab + `<input id="${id}" name="${f.name}" type="${f.type === "url" ? "url" : f.type === "number" ? "number" : "text"}"${f.type === "url" ? ' inputmode="url" placeholder="https://"' : ""}${f.type === "number" ? ' inputmode="numeric" step="1"' : ""}${f.inputmode ? ` inputmode="${f.inputmode}"` : ""}${f.list ? ` list="${f.list}"` : ""} value="${h(v ?? "")}"${req}${max}${desc} autocomplete="off">`);
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
    case "bars":
      return wrap(`<span class="flabel">${h(f.label)}</span><div class="bars">${[...(v || [])].sort((a, b) => a.sort - b.sort).map(barRow).join("")}</div><button type="button" class="btn ghost sm" data-bar-add>+ Add a line</button>`);
  }
  return "";
}

const num = s => (s === "" || s === null || s === undefined ? null : Number(s));
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
      case "url": {
        let s = el.value.trim();
        if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && /\.[a-z]{2,}/i.test(s)) s = "https://" + s; // "vbspca.com" is fine too
        out[f.name] = s || null;
        break;
      }
      case "journey": // empty rows are dropped
        out[f.name] = $$(".step-row", form).map(r => ({ date: $("[name=j_date]", r).value || null, label: $("[name=j_label]", r).value.trim(), detail: $("[name=j_detail]", r).value.trim() || null }))
          .filter(s => s.label || s.detail || s.date);
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
      else if (f.type === "url" && v && !safeUrl(v)) msg = "That doesn't look like a web link. It should start with https://";
      else if (f.type === "journey") {
        $$(".step-row", box).forEach(r => r.classList.toggle("bad", !$("[name=j_label]", r).value.trim() && !!($("[name=j_detail]", r).value.trim() || $("[name=j_date]", r).value)));
        if (v.some(s => !s.label)) msg = "Each step needs a “What happened”.";
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
  const vals = row || Object.fromEntries(S.fields.map(f => [f.name, typeof f.dflt === "function" ? f.dflt() : f.dflt ?? (f.type === "toggle" ? false : f.type === "tags" || f.type === "lines" || f.type === "bars" || f.type === "journey" ? [] : null)]));
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
    if (t.hasAttribute("data-step-add")) { $(".steps-ed", form).insertAdjacentHTML("beforeend", stepRow({})); $(".steps-ed .step-row:last-child input", form).focus(); dirty = true; return; }
    if (t.hasAttribute("data-step-remove")) { t.closest(".step-row").remove(); dirty = true; return; }
    if (t.hasAttribute("data-step-up") || t.hasAttribute("data-step-down")) {
      const r = t.closest(".step-row"), up = t.hasAttribute("data-step-up"), other = up ? r.previousElementSibling : r.nextElementSibling;
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
      else if (status) steps.push({ label: label(STATUS, status), detail: who ? `${{ looking: "With", foster: "With", sanctuary: "At" }[status] || "Through"} ${who}` : "" });
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
const DETAIL = { shelter: "Shelter or rescue", want: "Interested in", program: "Program", city: "City", link: "Link", dog: "Dog", rescue: "Rescue" };
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
    <div class="fchips" role="group" aria-label="Show">${tabs.map(([v, l]) => `<a href="#/messages/${v}" aria-current="${v === view}">${h(l)}</a>`).join("")}</div>
    ${list.length ? `<ul class="msgs">${list.map(m => {
      const mail = encodeURIComponent(m.email).replace(/%40/g, "@");
      const det = Object.entries(m.details || {}).filter(([, x]) => x !== null && x !== "" && !(Array.isArray(x) && !x.length));
      return `<li class="msg${m.handled ? " done" : ""}">
        <div class="mtop"><span class="chip c-topic">${h(TOPICS[m.topic] || m.topic)}</span><time datetime="${h(m.created_at)}">${h(when(m.created_at))}</time></div>
        <h2>${h(m.name || "No name given")}</h2>
        <p class="memail">${h(m.email)}</p>
        ${m.body ? `<p class="mbody">${h(m.body)}</p>` : ""}
        ${det.length ? `<dl class="mdet">${det.map(([k, x]) => `<dt>${h(DETAIL[k] || k)}</dt><dd>${h(Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : x)}</dd>`).join("")}</dl>` : ""}
        ${m.page ? `<p class="small">Sent from ${h(m.page)}</p>` : ""}
        <div class="btns"><a class="btn royal sm" href="mailto:${h(mail)}?subject=${encodeURIComponent("Re: your message to TheTerr0rTw!ns")}">Reply by email</a>
          ${m.handled ? `<button class="btn ghost sm" type="button" data-act="msg-undo" data-id="${h(m.id)}">Move back to new</button>` : `<button class="btn ghost sm" type="button" data-act="msg-done" data-id="${h(m.id)}">Mark done</button>`}
          <button class="linkbtn" type="button" data-act="msg-delete" data-id="${h(m.id)}">Delete</button></div></li>`;
    }).join("")}</ul>` : `<p class="allgood">${view === "new" ? "No new messages ✓" : "Nothing here."}</p>`}`);
}

/* ---------- page wording ---------- */
async function showText() {
  const rows = await api.list("site_text", "select=*");
  const by = Object.fromEntries(rows.map(r => [r.key, r]));
  const items = CFG.textDefaults || [];
  render(`<a class="back" href="#/">‹ Start</a><h1>Page wording</h1>
    <p class="lede">Change these words, then tap Save. The page shows the new words straight away.</p>
    ${items.map(t => {
      const mine = by[t.key]?.body?.trim();
      return `<form class="card textform" data-key="${h(t.key)}" novalidate>
        <h2>${h(t.label)}</h2>
        <p class="small">On <a href="${h(CFG.base + t.page.replace(/^\//, ""))}" target="_blank" rel="noopener">${h(t.page)}</a> · ${mine ? `changed ${h(nice(by[t.key].updated_at.slice(0, 10)))}` : "the page's own words"}</p>
        <label class="sr" for="t-${h(t.key)}">${h(t.label)}</label>
        <textarea id="t-${h(t.key)}" name="body" rows="${t.block ? 12 : 4}" maxlength="6000">${h(mine || t.text)}</textarea>
        ${t.block ? `<p class="hint">A blank line starts a new paragraph. Start a line with ## to make it a heading.</p>` : ""}
        <div class="btns"><button class="btn royal sm" type="submit">Save</button>${mine ? `<button class="btn ghost sm" type="button" data-act="text-reset">Go back to the original words</button>` : ""}</div>
      </form>`;
    }).join("")}`);
  const saveText = async (key, body) => {
    await db("POST", "site_text?on_conflict=key", { key, body }, "resolution=merge-duplicates,return=minimal");
  };
  $$(".textform", app).forEach(f => {
    const t = items.find(x => x.key === f.dataset.key);
    f.addEventListener("input", () => { dirty = true; });
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const body = f.elements.body.value.trim();
      try { await saveText(t.key, body === t.text.trim() ? "" : body); dirty = false; toast("Saved ✓"); showText(); }
      catch (err) { if (err instanceof SignedOut) return route(); toast(err.message, true); }
    });
    $('[data-act="text-reset"]', f)?.addEventListener("click", async () => {
      if (!confirm("Put back the page's original words?")) return;
      try { await saveText(t.key, ""); dirty = false; toast("Original words are back ✓"); showText(); }
      catch (err) { if (err instanceof SignedOut) return route(); toast(err.message, true); }
    });
  });
}

/* ---------- recently deleted ---------- */
// Every delete keeps a copy for 90 days (public.content_history). Restore puts back the row and anything
// deleted with it, like a goal's lines.
const KIND = {
  animals: ["Animal", r => r.name], goals: ["Shelter goal", r => r.title], goal_bars: ["Line on a shelter goal", r => r.label],
  events: ["Event", r => r.title], partners: ["Rescue or shelter", r => r.name], sniffari_programs: ["Day-out program", r => r.program_name || r.shelter_name],
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
  if (!b || !["checked", "adopted", "msg-done", "msg-undo", "msg-delete", "restore", "forget", "nocount", "clear-counts", "signout"].includes(b.dataset.act)) return;
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
      case "nocount":
        try { localStorage.getItem(NOCOUNT) === "1" ? localStorage.removeItem(NOCOUNT) : localStorage.setItem(NOCOUNT, "1"); } catch {}
        break;
      case "clear-counts":
        if (!confirm("Clear all the visitor counts and start from zero?\n\nUse this on launch day, so visits during the preview don't count.")) return;
        await db("POST", "rpc/clear_visitor_counts", {}); toast("Counts cleared"); break;
    }
    route();
  } catch (err) { if (err instanceof SignedOut) return route(); toast(err.message, true); }
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
