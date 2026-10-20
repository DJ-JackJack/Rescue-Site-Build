#!/usr/bin/env node
// Saves a copy of the site's public content, and the photos uploaded from the edit page, into a folder:
//   node tools/backup-content.mjs backup
// The database's address and publishable key come from site/supabase.json (SUPABASE_URL and SUPABASE_KEY override them).
// .github/workflows/backup.yml runs it every week and keeps each copy for 90 days on the Actions tab.
// It uses the public key, so it copies only what visitors can already see. Hidden rows and messages stay in
// the database, where "Recently deleted" (content_history) keeps 90 days of copies of anything changed.
import fs from "node:fs";
import path from "node:path";

const SUPABASE = JSON.parse(fs.readFileSync(new URL("../site/supabase.json", import.meta.url), "utf8"));
const API = (process.env.SUPABASE_URL || SUPABASE.url).replace(/\/+$/, ""), KEY = process.env.SUPABASE_KEY || SUPABASE.key;
const OUT = path.resolve(process.argv[2] || "backup");
const TABLES = ["partners", "goals", "goal_bars", "animals", "events", "sniffari_programs", "videos", "places", "help_resources", "site_text"];

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { apikey: KEY } });
      if (r.ok) return r;
      if (r.status === 540) throw Object.assign(new Error("The Supabase project is paused. Open the Supabase dashboard and choose Resume project."), { fatal: true });
      if (r.status < 500 || i >= tries) throw Object.assign(new Error(`${r.status} from ${url}`), { fatal: true });
    } catch (e) { if (e.fatal || i >= tries) throw e; }
    await new Promise(ok => setTimeout(ok, 2000 * i));
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "photos"), { recursive: true });
const counts = {}, photos = new Set();
for (const t of TABLES) {
  const rows = await (await get(`${API}/rest/v1/${t}?select=*`)).json();
  fs.writeFileSync(path.join(OUT, `${t}.json`), JSON.stringify(rows, null, 2) + "\n");
  counts[t] = rows.length;
  for (const r of rows) if (typeof r.photo_url === "string" && r.photo_url.startsWith(`${API}/storage/v1/object/public/photos/`)) photos.add(r.photo_url);
}
// Photos in assets/photos/ are in the repo already; these are the ones uploaded from the edit page.
let saved = 0;
const missing = [];
for (const u of photos) {
  const rel = decodeURIComponent(u.slice(`${API}/storage/v1/object/public/photos/`.length));
  if (rel.split("/").some(p => p === ".." || p === "")) continue;
  try {
    const buf = Buffer.from(await (await get(u)).arrayBuffer());
    fs.mkdirSync(path.dirname(path.join(OUT, "photos", rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, "photos", rel), buf);
    saved++;
  } catch (e) { if (/paused/.test(e.message)) throw e; missing.push(rel); }
}
const summary = { saved_at: new Date().toISOString(), source: API, rows: counts, photos: saved, missing_photos: missing };
fs.writeFileSync(path.join(OUT, "README.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (missing.length) console.log(`::warning::${missing.length} photo(s) couldn't be downloaded: ${missing.join(", ")}`);
