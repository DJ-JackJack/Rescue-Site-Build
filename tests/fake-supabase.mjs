// A stand-in for Supabase for the browser tests: sign-in, the database (with the same "who can see what" rules as the
// real one), photo storage, the fan art inbox and the Edge Functions. Every write is logged, so a test can check what
// was sent. Also the shared bits the test files use: a browser, a page with the fake attached, and PASS/FAIL lines.
import { createRequire } from "node:module";
import fs from "node:fs";
import { start } from "./serve.mjs";
const { chromium } = createRequire(import.meta.url)("playwright"); // installed globally, or with npm i playwright

export const SB = JSON.parse(fs.readFileSync(new URL("../site/supabase.json", import.meta.url))).url;
export const XSS = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
export const TODAY = new Date().toLocaleDateString("en-CA");
export const ago = n => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA");
export const fixture = name => new URL(`./fixtures/${name}`, import.meta.url).pathname;
const iso = ms => new Date(ms).toISOString();

// rows only signed-in editors can read
const PRIVATE = ["messages", "content_history", "page_views", "visit_sources", "missed_pages", "push_subscriptions", "fanart_submissions", "game_photo_submissions"];
// tables whose deletes land in Recently deleted (content_history), as the keep_history trigger does
const HISTORY = ["animals", "goals", "goal_bars", "events", "collabs", "partners", "sniffari_programs", "foster_programs", "adventures", "videos", "places",
  "page_photos", "help_resources", "articles", "fanart", "supporters", "messages", "game_situations", "match_pairs", "game_questions", "game_art"];

// A made-up world: a shelter, the horse sanctuary, a rescue that hasn't said yes yet, animals in every state, and
// something with script in it nearly everywhere, which must only ever show as text.
export function seed() {
  const P = (id, slug, name, kind, more = {}) => ({ id, slug, name, kind, published: true, feature_ok: true, sort: 10, mission: null, website_url: null, adopt_url: null, donate_url: null, links: [], ...more });
  const A = (id, name, more) => ({ id, name, species: "dog", status: "adopted", partner_id: "p1", checked_on: null, published: true, people_ok: true, photo_url: null, photo_frame: null,
    sort: 100, herd: null, note: null, listing_url: null, featured_on: null, adopted_on: null, passed_on: null, transport: false, journey: [], story: null, updates: [], section: "helped",
    created_at: iso(Date.now() - 864e5), updated_at: "2026-10-16T00:00:00Z", publish_at: null, ...more });
  return {
    partners: [
      P("p1", "harbor-shelter", "Harbor City Animal Shelter", "shelter", { mission: "Every pet deserves a home." + XSS, adopt_url: "https://example.org/adopt", donate_url: "javascript:alert(1)", website_url: "https://example.org", links: [{ label: "Wish list", url: "https://example.org/wish" }, { label: "Bad link", url: "javascript:alert(3)" }] }),
      P("p2", "willow-woods", "Willow Woods Equine Sanctuary", "sanctuary", { links: [{ label: "Hay fund", url: "https://example.org/hay" }] }),
      P("p3", "quiet-rescue", "Quiet Rescue", "rescue", { feature_ok: false }),
    ],
    animals: [
      // five dogs featured long enough ago to count, four of them home within 90 days: the home page's stat shows
      A("a1", "Biscuit", { featured_on: ago(200), adopted_on: ago(170), photo_url: "assets/photos/dog-tyce.jpg" }),
      A("a2", "Pepper", { featured_on: ago(180), adopted_on: ago(160) }),
      A("a3", "Moose", { featured_on: ago(150), adopted_on: ago(100) }),
      A("a4", "Juniper", { featured_on: ago(120), adopted_on: ago(110), note: "Loves car rides" }),
      A("a5", "Rocket", { status: "looking", featured_on: ago(100), checked_on: ago(3), listing_url: "https://example.org/rocket", story: "Rocket came in as a stray.\n\nHe's learning to trust." + XSS,
        updates: [{ date: ago(5), text: "Went to a day out and loved the beach" }, { date: ago(30), text: "First bath " + XSS }], journey: [] }),
      A("a6", "Shadow" + XSS, { status: "foster", checked_on: ago(1), species: "cat", partner_id: "p1", featured_on: ago(20) }),
      A("a7", "Ghost", { status: "looking", checked_on: ago(40) }), // not checked in 28 days: hidden from visitors
      A("a8", "Hidden Hank", { published: false }),
      A("a9", "No Consent", { people_ok: false }),
      A("a10", "Quiet Pup", { partner_id: "p3" }), // their rescue hasn't said yes: hidden too
      A("a11", "Ebay", { species: "horse", status: "sanctuary", partner_id: "p2", herd: "Herd One", sort: 1, section: "spotlight" }),
      A("a12", "Clover", { species: "horse", status: "sanctuary", partner_id: "p2", herd: "Herd One", sort: 2, section: "spotlight" }),
      A("a13", "Duke", { species: "horse", status: "sanctuary", partner_id: "p2", herd: null, section: "spotlight" }),
      A("a14", "Old Blue", { status: "passed", passed_on: ago(60), featured_on: ago(400), adopted_on: ago(380), note: "Forever loved" }),
      A("a15", "Bad Photo", { status: "placed", photo_url: "javascript:alert(1)", species: "bird", partner_id: null }),
    ],
    goals: [
      { id: "g1", partner_id: "p2", title: "Hay for the herds" + XSS, why: "Two herds to feed this winter", price_note: "$9 a bale", donate_url: "https://example.org/give", photo_url: null, photo_frame: null, status: "active", featured: true, figures_updated_at: ago(2), met_on: null, sort: 1, published: true, publish_at: null, updated_at: "2026-10-16T00:00:00Z" },
      { id: "g2", partner_id: "p1", title: "Crates for transport", why: null, price_note: null, donate_url: null, photo_url: null, photo_frame: null, status: "active", featured: false, figures_updated_at: ago(30), met_on: null, sort: 2, published: true, publish_at: null, updated_at: "2026-10-16T00:00:00Z" },
      { id: "g3", partner_id: "p1", title: "Winter blankets", why: null, price_note: null, donate_url: null, photo_url: null, photo_frame: null, status: "met", featured: false, figures_updated_at: ago(60), met_on: ago(45), sort: 3, published: true, publish_at: null, updated_at: "2026-10-16T00:00:00Z" },
      { id: "g4", partner_id: "p3", title: "Secret goal", why: null, price_note: null, donate_url: null, photo_url: null, photo_frame: null, status: "active", featured: false, figures_updated_at: null, met_on: null, sort: 4, published: true, publish_at: null, updated_at: "2026-10-16T00:00:00Z" },
    ],
    goal_bars: [
      { id: "b1", goal_id: "g1", label: "Round bales", target: 70, current: 35, sort: 1 },
      { id: "b2", goal_id: "g1", label: "Square bales", target: 200, current: 50, sort: 2 },
      { id: "b3", goal_id: "g2", label: "Crates", target: 10, current: 4, sort: 1 },
    ],
    events: [
      { id: "e1", partner_id: "p2", title: "Sound Bath" + XSS, starts_on: ago(-10), time_text: "1 to 3 PM", place: "The barn", link_url: "https://example.org/sound", published: true, publish_at: null },
      { id: "e2", partner_id: "p1", title: "Adoption Day", starts_on: ago(-20), time_text: null, place: null, link_url: "javascript:alert(1)", published: true, publish_at: null },
    ],
    collabs: [
      { id: "c1", partner_id: "p2", title: "Barn makeover", kind: "Fundraiser", starts_on: ago(30), ends_on: null, ongoing: true, description: "Fixing the roof", link_url: null, photo_url: null, photo_frame: null, sort: 100, published: true, publish_at: null },
      { id: "c2", partner_id: "p2", title: "Spring open house", kind: "Event", starts_on: ago(-40), ends_on: null, ongoing: false, description: null, link_url: "https://example.org/open", photo_url: null, photo_frame: null, sort: 100, published: true, publish_at: null },
    ],
    sniffari_programs: [
      { id: "s1", shelter_name: "Harbor City Animal Shelter", program_name: "Paws Out", city: "Harbor City", address: "1 Shelter Way", signup_url: "https://example.org/paws", links: [], facts: ["Free", "2 hours"], tags: ["free", "kids"], checked_on: ago(10), published: true, sort: 1, publish_at: null },
      { id: "s2", shelter_name: "Bay Humane" + XSS, program_name: "Sleepover Club", city: null, address: null, signup_url: "javascript:alert(1)", links: [], facts: [], tags: ["sleepover"], checked_on: ago(200), published: true, sort: 2, publish_at: null },
    ],
    foster_programs: [
      { id: "f1", shelter_name: "Harbor City Animal Shelter", program_name: "Foster Heroes", city: "Harbor City", facts: ["Supplies covered"], tags: ["free", "dogs"], signup_url: "https://example.org/foster", links: [], checked_on: ago(5), published: true, sort: 1, publish_at: null },
      { id: "f2", shelter_name: "Bay Humane", program_name: null, city: null, facts: [], tags: ["cats"], signup_url: null, links: [], checked_on: null, published: true, sort: 2, publish_at: null },
    ],
    adventures: [
      { id: "ad1", title: "Beach day", went_on: ago(12), dogs: "Rocket", story: "Rocket saw the ocean for the first time.", videos: [{ url: "https://www.tiktok.com/@x/video/1", label: "The video" }], photos: [], frames: {}, businesses: [{ name: "Shore Cafe", url: "https://example.org/cafe" }], sort: 100, partner_id: "p1", published: true, publish_at: null, created_at: iso(Date.now() - 864e5 * 12) },
    ],
    videos: [{ id: "v1", title: "Rocket's day out", url: "https://www.tiktok.com/@x/video/2", posted_on: ago(12), note: "Sunny" + XSS, photo_url: null, photo_frame: null, sort: 100, published: true, publish_at: null, created_at: iso(Date.now()) }],
    places: [{ id: "pl1", name: "Shore Cafe", area: "The boardwalk", why: "Water bowls out front", link_url: "https://example.org/cafe", photo_url: null, photo_frame: null, sort: 100, published: true, publish_at: null }],
    help_resources: [
      { id: "h1", category: "food", name: "Pet Pantry", kind: "Food bank", description: "Free food" + XSS, best_for: null, caution: null, link_url: "https://example.org/pantry", more_url: null, more_label: null, phone: "(555) 555-0100", email: null, area: "Harbor City", cities: ["chesapeake"], checked_on: TODAY, published: true, sort: 1, publish_at: null },
      { id: "h2", category: "vet", name: "Hidden Clinic", kind: null, description: null, best_for: null, caution: null, link_url: "javascript:alert(2)", more_url: null, more_label: null, phone: null, email: null, area: null, cities: [], checked_on: null, published: false, sort: 1, publish_at: null },
      { id: "h3", category: "vet", name: "Low Cost Vet", kind: null, description: "Sliding scale", best_for: null, caution: "Call first", link_url: "https://example.org/vet", more_url: null, more_label: null, phone: null, email: "vet@example.org", area: null, cities: ["virginia-beach", "chesapeake"], checked_on: ago(300), published: true, sort: 2, publish_at: null },
    ],
    page_photos: [],
    articles: [
      { id: "sq1", slug: "rocket-goes-to-the-beach", title: "Rocket goes to the beach", summary: "A first look at the ocean.", body: "He was shy at first.\n\n## The waves\nThen he ran right in. " + XSS, photo_url: "assets/photos/dog-tyce.jpg", photo_frame: null, photo_alt: "Rocket on the sand", photos: [], videos: [], links: [], published: true, publish_at: null, created_at: iso(Date.now() - 3 * 864e5), updated_at: "2026-10-28T00:00:00Z" },
      { id: "sq2", slug: "coming-soon", title: "A post for later", summary: "Not yet", body: "Later.", photo_url: null, photo_frame: null, photo_alt: null, photos: [], videos: [], links: [], published: true, publish_at: iso(Date.now() + 2 * 864e5), created_at: iso(Date.now() - 864e5), updated_at: "2026-10-28T00:00:00Z" },
      { id: "sq3", slug: "a-draft", title: "A draft", summary: null, body: "Not yet.", photo_url: null, photo_frame: null, photo_alt: null, photos: [], videos: [], links: [], published: false, publish_at: null, created_at: iso(Date.now()), updated_at: "2026-10-28T00:00:00Z" },
    ],
    supporters: [
      { id: "su1", name: "Sam" + XSS, tier: "Alliance Hero", sort: 100, published: true, publish_at: null },
      { id: "su2", name: "Alex", tier: null, sort: 100, published: true, publish_at: null },
      { id: "su3", name: "Hidden Fan", tier: null, sort: 100, published: false, publish_at: null },
    ],
    fanart: [
      { id: "fa1", title: "Rocket in crayon" + XSS, credit: "Mia, age 8", credit_url: "https://example.org/mia", photo_url: "assets/photos/dog-tyce.jpg", photo_alt: "A crayon dog", w: 800, h: 600, sort: 100, published: true, publish_at: null, created_at: iso(Date.now()) },
      { id: "fa2", title: null, credit: "Anon", credit_url: "javascript:alert(1)", photo_url: "assets/photos/dog-tyce.jpg", photo_alt: null, w: 600, h: 800, sort: 100, published: true, publish_at: null, created_at: iso(Date.now()) },
    ],
    fanart_submissions: [
      { id: "fs1", image_path: "f1.jpg", w: 64, h: 48, title: "My drawing" + XSS, credit: "Jo" + XSS, credit_url: "https://example.org/jo", note: "For the twins!", email: "jo@example.com", created_at: iso(Date.now() - 3600e3), notified_at: null },
    ],
    game_situations: [], game_questions: [], game_art: [],
    // Matching pairs: two the Send a Photo page asks for (one hidden), one it doesn't, and one that already has a photo
    match_pairs: [
      { id: "mp1", level: 2, title: "The Whale Eye" + XSS, species: "Dog", tile: "A dog showing the whites of his eyes", cue: null, question: "What do you do?", choices: ["Step back", "Pet him"], answer: 1, reward: "Safe choice!", photo_url: null, photo_frame: null, photo_credit: "Hidden Helper", wanted: true, published: false, publish_at: null, sort: 140 },
      { id: "mp2", level: 3, title: "The Skin Ripple", species: "Cat", tile: "A cat whose back twitches when petted", cue: null, question: "What is she saying?", choices: ["Stop, please", "More!"], answer: 1, reward: "Yes!", photo_url: null, photo_frame: null, wanted: true, published: true, publish_at: null, sort: 280 },
      { id: "mp3", level: 1, title: "The Head Tilt", species: "Dog", tile: "A dog tilting his head", cue: null, question: "What is he doing?", choices: ["Listening", "Sleeping"], answer: 1, reward: "Yes!", photo_url: null, photo_frame: null, wanted: false, published: false, publish_at: null, sort: 90 },
      { id: "mp4", level: 1, title: "The Play Bow", species: "Dog", tile: "A dog in a play bow", cue: "Bottom up", question: "What is he asking?", choices: ["Play!", "Go away"], answer: 1, reward: "Yes!", photo_url: "assets/games/pair-01-play-bow.jpg", photo_frame: null, photo_credit: "Jamie" + XSS, wanted: true, published: true, publish_at: null, sort: 10 },
    ],
    game_photo_submissions: [
      { id: "gp1", image_path: "g1.jpg", w: 64, h: 48, pair_id: "mp1", pair_title: "The Whale Eye" + XSS, note: "She'd just heard thunder " + XSS, credit: "Robin" + XSS, email: "robin@example.com", created_at: iso(Date.now() - 7200e3), notified_at: null },
    ],
    messages: [
      { id: "m1", topic: "help", name: "Pat" + XSS, email: "pat@example.com", body: "Line one\nLine two " + XSS, details: { want: ["features", XSS], link: "https://example.org/x" }, page: "/help/", handled: false, created_at: iso(Date.now()) },
      { id: "m2", topic: "partner", name: null, email: "director@example.org", body: null, details: {}, page: "/partner/", handled: true, created_at: "2026-10-01T15:00:00Z" },
    ],
    site_text: [{ key: "p.about.lede", body: "Hello " + XSS + "\nsecond line", updated_at: "2026-10-17T00:00:00Z" }],
    content_history: [
      { id: 1, at: iso(Date.now() - 3600e3), tx: 100, tbl: "goals", op: "delete", row_key: "g9", data: { id: "g9", partner_id: "p2", title: "Old hay goal", status: "active", published: true, sort: 5 }, by_email: "editor@example.com", restored_at: null },
      { id: 2, at: iso(Date.now() - 3600e3), tx: 100, tbl: "goal_bars", op: "delete", row_key: "b9", data: { id: "b9", goal_id: "g9", label: "Bales", target: 5, current: null, sort: 1 }, by_email: "editor@example.com", restored_at: null },
      { id: 3, at: iso(Date.now() - 2 * 864e5), tx: 101, tbl: "messages", op: "delete", row_key: "m9", data: { id: "m9", topic: "other", name: "Lee" + XSS, email: "lee@example.com", handled: false }, by_email: null, restored_at: null },
      { id: 4, at: iso(Date.now()), tx: 102, tbl: "animals", op: "update", row_key: "a1", data: { id: "a1", name: "Biscuit" }, by_email: "editor@example.com", restored_at: null },
    ],
    page_views: [{ day: TODAY, path: "/", views: 5 }, { day: TODAY, path: "/about/", views: 2 }, { day: ago(3), path: "/animals/", views: 4 }, { day: ago(40), path: "/", views: 7 }, { day: ago(2), path: "/404", views: 1 }],
    missed_pages: [{ day: TODAY, path: "/happy-tails", views: 2 }, { day: ago(2), path: "/stories/<b>x</b>", views: 1 }, { day: ago(40), path: "/old-link", views: 3 }],
    visit_sources: [{ day: ago(40), source: "qr-card", visits: 4 }, { day: TODAY, source: "l.meta.ai", visits: 1 }, { day: TODAY, source: "meta-ai", visits: 2 }, { day: TODAY, source: "tiktok", visits: 3 }, { day: ago(1), source: "direct", visits: 2 }],
    push_subscriptions: [],
  };
}

// a PostgREST-style filter: eq, neq, is, gt, gte, lt, lte, in.(a,b), cs.{a}, and not.<any of those>
function matches(x, expr) {
  if (expr.startsWith("not.")) return !matches(x, expr.slice(4));
  const [op, ...rest] = expr.split("."), val = rest.join(".");
  const v = x === undefined ? null : x;
  switch (op) {
    case "eq": return String(v) === val;
    case "neq": return String(v) !== val;
    case "is": return val === "null" ? v === null : String(v) === val;
    case "gt": return v !== null && v > val;
    case "gte": return v !== null && v >= val;
    case "lt": return v !== null && v < val;
    case "lte": return v !== null && v <= val;
    case "in": return val.replace(/^\(|\)$/g, "").split(",").map(s => s.replace(/^"|"$/g, "")).includes(String(v));
    case "cs": return Array.isArray(v) && val.replace(/^\{|\}$/g, "").split(",").every(s => v.includes(s));
    default: return true;
  }
}
const SKIP = ["select", "order", "limit", "offset", "on_conflict"];
const filtered = (rows, params) => rows.filter(r => params.every(([k, v]) => SKIP.includes(k) || matches(r[k], v)));
function ordered(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map(s => { const [col, ...o] = s.split("."); return { col, desc: o.includes("desc"), nullsFirst: o.includes("nullsfirst") }; });
  return [...rows].sort((a, b) => {
    for (const { col, desc, nullsFirst } of keys) {
      const x = a[col] ?? null, y = b[col] ?? null;
      if (x === y) continue;
      if (x === null) return nullsFirst ? -1 : 1;
      if (y === null) return nullsFirst ? 1 : -1;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

// opts.editor: whether the signed-in account is on the editor list (default yes). opts.expiresIn: how long a sign-in
// lasts, in seconds. opts.submitReply / opts.fanartReply: {status, body} the forms' functions answer with instead.
export function fakeSupabase(opts = {}) {
  const D = seed(), log = [], tokens = new Set(), refresh = new Map(), files = {}, inbox = { "f1.jpg": fs.readFileSync(fixture("small.jpg")) };
  const inboxes = { "fanart-inbox": inbox, "game-photo-inbox": { "g1.jpg": fs.readFileSync(fixture("small.jpg")) } };
  // the parts of a form a page sent as multipart/form-data: its fields, and the image
  const multipart = req => {
    const buf = req.postDataBuffer() || Buffer.alloc(0), ct = req.headers()["content-type"] || "", fields = {};
    const boundary = (ct.match(/boundary=(.+)$/) || [])[1];
    let image = null;
    if (boundary) for (const part of buf.toString("latin1").split("--" + boundary)) {
      const mm = part.match(/name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: ([^\r]+)\r\n)?\r\n([\s\S]*)\r\n$/);
      if (!mm) continue;
      if (mm[2]) image = Buffer.from(mm[3], "latin1"); else fields[mm[1]] = Buffer.from(mm[3], "latin1").toString("utf8");
    }
    return { fields, image, about: image && { bytes: image.length, jpeg: image[0] === 0xff && image[1] === 0xd8, exif: image.includes(Buffer.from("Exif")), gps: image.includes(Buffer.from("SecretPhone")) } };
  };
  const wishlist = () => D.match_pairs.filter(p => p.wanted && !p.photo_url).sort((a, b) => a.level - b.level || a.sort - b.sort).map(p => ({ id: p.id, title: p.title, species: p.species, tile: p.tile }));
  let n = 0, tx = 200;
  D.storage = [];
  const newSession = email => { n++; const t = "tok" + n, r = "r" + n; tokens.add(t); refresh.set(r, email); return { access_token: t, refresh_token: r, expires_in: opts.expiresIn ?? 3600, user: { email } }; };
  const visible = (table, r) => {
    const partnerOk = id => { const p = D.partners.find(x => x.id === id); return !!p && p.published !== false && p.feature_ok !== false; };
    if (r.published === false || (r.publish_at && new Date(r.publish_at) > Date.now())) return false;
    if (table === "partners") return r.feature_ok !== false;
    if (table === "goals" || table === "events") return partnerOk(r.partner_id);
    if (table === "animals") return r.people_ok !== false && (r.status !== "looking" || (r.checked_on && r.checked_on >= ago(28))) && (!r.partner_id || partnerOk(r.partner_id));
    return true;
  };
  const embed = (row, sel) => {
    const out = { ...row };
    if (/partner:partners/.test(sel)) { const p = D.partners.find(x => x.id === row.partner_id); out.partner = p ? { id: p.id, name: p.name, slug: p.slug } : null; }
    if (/bars:goal_bars/.test(sel)) out.bars = D.goal_bars.filter(b => b.goal_id === row.id);
    return out;
  };
  const remember = (table, gone, email) => {
    if (!HISTORY.includes(table) || !gone.length) return;
    const t = ++tx;
    for (const r of gone) {
      D.content_history.push({ id: D.content_history.length + 1000, at: new Date().toISOString(), tx: t, tbl: table, op: "delete", row_key: String(r.id), data: { ...r }, by_email: email, restored_at: null });
      if (table === "goals") { // its lines go with it
        const bars = D.goal_bars.filter(b => b.goal_id === r.id);
        D.goal_bars = D.goal_bars.filter(b => b.goal_id !== r.id);
        for (const b of bars) D.content_history.push({ id: D.content_history.length + 1000, at: new Date().toISOString(), tx: t, tbl: "goal_bars", op: "delete", row_key: b.id, data: { ...b }, by_email: email, restored_at: null });
      }
    }
  };
  return {
    D, log, files, inbox,
    session(email = "editor@example.com") { const s = newSession(email); return { access: s.access_token, refresh: s.refresh_token, exp: Date.now() + 3600e3, email }; },
    signOutEveryone() { tokens.clear(); refresh.clear(); },
    writes: () => log.filter(l => l.method && l.method !== "GET"),
    async handle(route) {
      const req = route.request(), u = new URL(req.url()), m = req.method();
      const cors = { "access-control-allow-origin": "*" };
      const json = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      const empty = (status = 204) => route.fulfill({ status, headers: cors });
      if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      const auth = (req.headers().authorization || "").replace("Bearer ", "");
      const signedIn = tokens.has(auth), admin = signedIn && (opts.editor ?? true);
      const email = signedIn ? "editor@example.com" : null;
      const body = () => { try { return JSON.parse(req.postData() || "null"); } catch { return null; } };

      // ---------- sign-in ----------
      if (u.pathname === "/auth/v1/token") {
        const b = body() || {}, grant = u.searchParams.get("grant_type");
        log.push({ auth: grant });
        if (grant === "password") {
          if (b.password !== "right-pass") return json(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
          return json(200, newSession(b.email));
        }
        if (!refresh.has(b.refresh_token)) return json(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        const who = refresh.get(b.refresh_token); refresh.delete(b.refresh_token);
        return json(200, newSession(who));
      }
      if (u.pathname === "/auth/v1/logout") { tokens.delete(auth); log.push({ logout: true }); return empty(); }

      // ---------- photos ----------
      if (u.pathname === "/storage/v1/object/list/photos" && m === "POST") {
        if (!admin) return json(401, {});
        const prefix = (body() || {}).prefix || "";
        const here = D.storage.filter(f => !prefix || f.name.startsWith(prefix + "/")).map(f => ({ ...f, rest: prefix ? f.name.slice(prefix.length + 1) : f.name }));
        const folders = [...new Set(here.filter(f => f.rest.includes("/")).map(f => f.rest.split("/")[0]))].map(name => ({ name, id: null }));
        return json(200, [...folders, ...here.filter(f => !f.rest.includes("/")).map(f => ({ name: f.rest, id: "f-" + f.name, created_at: f.created_at, updated_at: f.created_at }))]);
      }
      if (u.pathname === "/storage/v1/object/photos" && m === "DELETE") {
        if (!admin) return json(401, {});
        const gone = (body() || {}).prefixes || [];
        log.push({ photosDeleted: gone });
        D.storage = D.storage.filter(f => !gone.includes(f.name));
        return json(200, gone.map(name => ({ name })));
      }
      if (u.pathname.startsWith("/storage/v1/object/photos/") && m === "POST") {
        if (!signedIn) return json(401, { message: "Unauthorized" });
        const path = decodeURIComponent(u.pathname.slice("/storage/v1/object/photos/".length)), buf = req.postDataBuffer() || Buffer.alloc(0);
        log.push({ upload: path, type: req.headers()["content-type"], bytes: buf.length, jpeg: buf[0] === 0xff && buf[1] === 0xd8, png: buf.slice(1, 4).toString() === "PNG", exif: buf.includes(Buffer.from("Exif")), gps: buf.includes(Buffer.from("SecretPhone")) });
        files[path] = buf;
        D.storage.push({ name: path, created_at: new Date().toISOString() });
        return json(200, { Key: "photos/" + path });
      }
      if (u.pathname.startsWith("/storage/v1/object/public/photos/")) {
        const buf = files[decodeURIComponent(u.pathname.slice("/storage/v1/object/public/photos/".length))];
        return buf ? route.fulfill({ status: 200, contentType: "image/jpeg", body: buf, headers: cors }) : json(404, {});
      }
      // ---------- the fan art inbox (private) ----------
      const inboxGet = u.pathname.match(/^\/storage\/v1\/object\/authenticated\/(fanart-inbox|game-photo-inbox)\/(.+)$/);
      if (inboxGet && m === "GET") {
        if (!signedIn) return json(401, {});
        const buf = inboxes[inboxGet[1]][decodeURIComponent(inboxGet[2])];
        return buf ? route.fulfill({ status: 200, contentType: "image/jpeg", body: buf, headers: cors }) : json(404, {});
      }
      const inboxDel = u.pathname.match(/^\/storage\/v1\/object\/(fanart-inbox|game-photo-inbox)$/);
      if (inboxDel && m === "DELETE") {
        if (!admin) return json(401, {});
        const gone = (body() || {}).prefixes || [];
        log.push({ inboxDeleted: gone, bucket: inboxDel[1] });
        for (const g of gone) delete inboxes[inboxDel[1]][g];
        return json(200, gone.map(name => ({ name })));
      }

      // ---------- Edge Functions ----------
      if (u.pathname === "/functions/v1/notify-message") {
        const b = body() || {};
        log.push({ notify: b, signedIn });
        if (b.action === "key") return json(200, { key: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM" });
        if (b.action === "test") return signedIn ? json(200, { sent: 1 }) : json(401, { error: "You've been signed out. Please sign in again." });
        return json(200, { sent: 0 });
      }
      if (u.pathname === "/functions/v1/submit-game-photo") {
        const { fields, image, about } = multipart(req);
        log.push({ gamephoto: fields, image: about });
        if (opts.gamePhotoReply) return json(opts.gamePhotoReply.status, opts.gamePhotoReply.body);
        if (fields.website) return json(200, { ok: true });
        const pair = fields.pair && fields.pair !== "other" ? wishlist().find(p => p.id === fields.pair) : null;
        if (fields.pair && fields.pair !== "other" && !pair) return json(400, { error: "pair" });
        const path = `g${D.game_photo_submissions.length + 10}.jpg`;
        inboxes["game-photo-inbox"][path] = image;
        D.game_photo_submissions.push({ id: "gp" + (D.game_photo_submissions.length + 10), image_path: path, w: Number(fields.w), h: Number(fields.h), pair_id: pair?.id || null, pair_title: pair?.title || null, note: fields.note || null, credit: fields.credit || null, email: fields.email, created_at: new Date().toISOString(), notified_at: null });
        return json(200, { ok: true });
      }
      if (u.pathname === "/functions/v1/submit-fanart") {
        const buf = req.postDataBuffer() || Buffer.alloc(0), ct = req.headers()["content-type"] || "", fields = {};
        const boundary = (ct.match(/boundary=(.+)$/) || [])[1];
        let image = null;
        if (boundary) for (const part of buf.toString("latin1").split("--" + boundary)) {
          const mm = part.match(/name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: ([^\r]+)\r\n)?\r\n([\s\S]*)\r\n$/);
          if (!mm) continue;
          if (mm[2]) image = Buffer.from(mm[3], "latin1"); else fields[mm[1]] = Buffer.from(mm[3], "latin1").toString("utf8");
        }
        log.push({ fanart: fields, image: image && { bytes: image.length, jpeg: image[0] === 0xff && image[1] === 0xd8, exif: image.includes(Buffer.from("Exif")), gps: image.includes(Buffer.from("SecretPhone")) } });
        if (opts.fanartReply) return json(opts.fanartReply.status, opts.fanartReply.body);
        if (fields.website) return json(200, { ok: true });
        const path = `f${D.fanart_submissions.length + 1}.jpg`;
        inbox[path] = image;
        D.fanart_submissions.push({ id: "fs" + (D.fanart_submissions.length + 1), image_path: path, w: Number(fields.w), h: Number(fields.h), title: fields.title || null, credit: fields.credit, credit_url: fields.link || null, note: fields.note || null, email: fields.email, created_at: new Date().toISOString(), notified_at: null });
        return json(200, { ok: true });
      }

      if (!u.pathname.startsWith("/rest/v1/")) return route.abort();
      const table = u.pathname.slice(9);

      // ---------- database functions ----------
      if (table === "rpc/count_view") { log.push({ count: body(), signedIn }); return empty(); }
      if (table === "rpc/submit_message") {
        const b = body();
        log.push({ submit: b });
        if (opts.submitReply) return json(opts.submitReply.status, opts.submitReply.body);
        D.messages.push({ id: "m" + (D.messages.length + 10), topic: b.p_topic, name: b.p_name, email: b.p_email, body: b.p_body, details: b.p_details, page: b.p_page, handled: false, created_at: new Date().toISOString() });
        return empty();
      }
      if (table === "rpc/is_admin") return json(200, admin);
      if (table === "rpc/game_photo_wishlist") { log.push({ wishlist: true }); return json(200, wishlist()); }
      if (table.startsWith("rpc/") && !admin) return json(auth && !signedIn ? 401 : 403, { code: "42501", message: "not allowed" });
      if (table === "rpc/visitor_summary") {
        const days = body().p_days, from = ago(days - 1);
        const sum = (rows, k, v) => Object.entries(rows.filter(r => r.day >= from).reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + r[v]), a), {})).sort((a, b) => b[1] - a[1]);
        log.push({ summary: days });
        return json(200, { from, days: sum(D.page_views, "day", "views").sort((a, b) => a[0].localeCompare(b[0])), pages: sum(D.page_views, "path", "views"), sources: sum(D.visit_sources, "source", "visits"), missed: sum(D.missed_pages, "path", "views") });
      }
      if (table === "rpc/clear_visitor_counts") { D.page_views = []; D.visit_sources = []; D.missed_pages = []; log.push({ cleared: true }); return empty(); }
      if (table === "rpc/restore_deleted") {
        const id = body().p_id, e = D.content_history.find(h => h.id === id && h.op === "delete" && !h.restored_at);
        if (!e) return json(400, { code: "P0001", message: "That one was already restored or is too old." });
        const group = D.content_history.filter(h => h.tx === e.tx && h.op === "delete" && !h.restored_at);
        for (const g of group) { (D[g.tbl] ||= []).push({ ...g.data }); g.restored_at = new Date().toISOString(); }
        log.push({ restored: group.map(g => g.row_key) });
        return json(200, group.length);
      }
      if (table.startsWith("rpc/")) return json(404, { message: "no such function" });

      // ---------- tables ----------
      if (auth && !signedIn) return json(401, { message: "JWT expired" });
      const rows = D[table];
      if (!rows) return json(404, { message: "no table " + table });
      const params = [...u.searchParams], sel = u.searchParams.get("select") || "*";
      if (m === "GET") {
        log.push({ read: table, query: u.search, admin });
        let out = filtered(rows, params);
        if (!admin) out = PRIVATE.includes(table) ? [] : out.filter(r => visible(table, r));
        out = ordered(out, u.searchParams.get("order"));
        if (u.searchParams.get("limit")) out = out.slice(0, Number(u.searchParams.get("limit")));
        return json(200, out.map(r => embed(r, sel)));
      }
      if (!admin) return json(signedIn ? 403 : 401, { code: "42501", message: "permission denied for table " + table });
      const b = body();
      log.push({ method: m, table, query: u.search, body: b });
      if (m === "PATCH") {
        const hit = filtered(rows, params);
        hit.forEach(r => Object.assign(r, b, "updated_at" in r ? { updated_at: new Date().toISOString() } : {}));
        return json(200, hit.map(r => embed(r, sel)));
      }
      if (m === "DELETE") {
        const hit = filtered(rows, params);
        D[table] = rows.filter(r => !hit.includes(r));
        if (table !== "content_history") remember(table, hit, email);
        return json(200, hit.map(r => ({ id: r.id })));
      }
      if (m === "POST") {
        const list = [].concat(b);
        if (table === "site_text" || table === "push_subscriptions") {
          const key = table === "site_text" ? "key" : "endpoint";
          for (const one of list) { const ex = rows.find(r => r[key] === one[key]); if (ex) Object.assign(ex, one, { updated_at: new Date().toISOString() }); else rows.push({ ...one, updated_at: new Date().toISOString() }); }
          return empty(201);
        }
        const added = list.map(one => { const row = { id: table.slice(0, 2) + "new" + (rows.length + 1), created_at: new Date().toISOString(), ...one }; rows.push(row); return row; });
        return json(201, added);
      }
      return json(405, {});
    },
  };
}

// ---------- shared test plumbing ----------
export const results = [];
export const ok = (cond, msg) => { results.push((cond ? "PASS " : "FAIL ") + msg); return !!cond; };
export function report(name) {
  console.log(results.join("\n"));
  const failed = results.filter(r => r.startsWith("FAIL")).length;
  console.log(`${name}: ${results.length - failed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}
export const wait = (p, ms = 350) => p.waitForTimeout(ms);
// Wider than the screen? On a phone, a page that's too wide makes the browser zoom out, so the layout's own width
// (innerWidth) grows too: compare with the screen's width instead.
export const overflow = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth) > screen.width + 1);
export const pwned = p => p.evaluate(() => !!window.__pwned);
export const errors = p => (p.errs.length ? ": " + p.errs.join(" | ") : "");

// the built site, served at the root, and a browser
export async function setup(port) {
  const server = await start(port), browser = await chromium.launch();
  return { B: `http://127.0.0.1:${port}/`, browser, close: async () => { await browser.close(); server.close(); } };
}
// A fresh phone (or computer, phone: false) with its own fake Supabase. session: start signed in.
// ctxOpts: more browser settings, like a userAgent.
export async function newPage(browser, { sb = fakeSupabase(), phone = true, session = false, init, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 900 } }), ...ctxOpts });
  await ctx.route(SB + "/**", r => sb.handle(r));
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  if (session) await ctx.addInitScript(s => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("tt-editor-session", s); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(sb.session()));
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.errs = []; p.dialogs = [];
  p.on("pageerror", e => p.errs.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) p.errs.push("console: " + m.text()); });
  p.on("dialog", d => { p.dialogs.push(d.message()); d.accept(); });
  return { ctx, p, sb };
}
