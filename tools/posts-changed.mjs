#!/usr/bin/env node
// Says whether the published site's Twin Squawk pages are out of date: a post went live, changed or came down since
// the site was last built. Compares the live posts (read with the public key, as visitors see them) with the stamp the
// build left at twin-squawk/stamp.txt.
//   node tools/posts-changed.mjs https://example.com/   → prints changed=true or changed=false (for $GITHUB_OUTPUT)
// .github/workflows/new-posts.yml runs it every 10 minutes and rebuilds the site when it says so. If the posts can't be
// read, it says false: there's no telling, and the next check tries again.
// The database's address and publishable key come from site/supabase.json (SUPABASE_URL and SUPABASE_KEY override them).
import fs from "node:fs";
import { livePosts, postsStamp } from "../site/posts.mjs";

const SUPABASE = JSON.parse(fs.readFileSync(new URL("../site/supabase.json", import.meta.url), "utf8"));
const API = (process.env.SUPABASE_URL || SUPABASE.url).replace(/\/+$/, ""), KEY = process.env.SUPABASE_KEY || SUPABASE.key;
const site = new URL(process.argv[2] || "https://dj-jackjack.github.io/Rescue-Site-Build/");
if (!site.pathname.endsWith("/")) site.pathname += "/";

let now;
try { now = postsStamp(await livePosts(API, KEY)); }
catch (e) { console.error(`The posts couldn't be read (${e.message}); trying again next time.`); console.log("changed=false"); process.exit(0); }
let built = "";
try {
  const r = await fetch(new URL(`twin-squawk/stamp.txt?t=${Date.now()}`, site), { signal: AbortSignal.timeout(15000) }); // ?t= skips the cached copy
  if (r.ok) built = (await r.text()).trim();
} catch (e) { console.error(`The site's stamp couldn't be read (${e.message}).`); }
console.error(now === built ? "The Twin Squawk pages are up to date." : `The Twin Squawk pages are out of date (built from ${built || "nothing yet"}, now ${now}).`);
console.log(`changed=${now !== built}`);
