// Checks what the build (site/build.mjs) bakes into the pages: wording saved on the edit page, photos added to the
// pages, a page of its own for each Twin Squawk post with its link preview, the sitemap, and preview mode versus
// launched. It builds _site several times, then once more as the other tests expect it, so run it first:
//   node tests/build.test.mjs
// Prints PASS or FAIL for each check, and exits 1 if any failed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ok, report, XSS } from "./fake-supabase.mjs";

const ROOT = new URL("..", import.meta.url).pathname, OUT = path.join(ROOT, "_site");
const FIX = name => path.join(ROOT, "tests", "fixtures", name);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-build-"));
const json = (name, data) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(data)); return f; };
const read = p => fs.readFileSync(path.join(OUT, p), "utf8");
const exists = p => fs.existsSync(path.join(OUT, p));
function build(env) {
  return execFileSync(process.execPath, [path.join(ROOT, "site", "build.mjs")], { cwd: ROOT, env: { ...process.env, SITE_BASE: "/", ...env }, encoding: "utf8" });
}
const plain = { SITE_TEXT_FILE: FIX("no-wording.json"), PAGE_PHOTOS_FILE: FIX("none.json"), ARTICLES_FILE: FIX("none.json") };

// ---------- a plain preview build: the pages' own words ----------
const out = build(plain);
const said = (out.match(/built \d+ pages into _site\/[^\n]*/) || [""])[0];
ok(/\(base \/, preview\)/.test(said), "the build runs and says how many pages: " + said);
const pages = read("sitemap.xml").match(/<loc>[^<]+<\/loc>/g).map(l => l.replace(/<\/?loc>/g, "").replace(/^https?:\/\/[^/]+/, ""));
ok(pages.length >= 20 && pages.includes("/") && pages.includes("/fan-art/") && pages.includes("/animal-guardian-alliance/"), `the sitemap lists every page (${pages.length})`);
ok(!pages.some(p => p.startsWith("/edit")), "the edit page isn't in the sitemap");
const home = read("index.html");
ok(/<meta name="robots" content="noindex, nofollow">/.test(home) && /PREVIEW/.test(home) && read("robots.txt").includes("Disallow: /"), "a preview build keeps search engines out and says PREVIEW");
const editHtml = read("edit/index.html");
ok(/noindex/.test(editHtml) && exists("edit/sw.js") && exists("edit/manifest.webmanifest"), "the edit page is built, hidden from search engines, with its app files");
// every page: the config can't be broken out of, and every file it points to is there
const missing = [], unsafe = [];
for (const p of pages) {
  const html = read(path.join(p, "index.html"));
  const cfg = (html.match(/<script>window\.SITE=(.*?);<\/script>/) || [])[1] || "";
  if (!cfg || cfg.includes("<")) unsafe.push(p);
  for (const [, ref] of html.matchAll(/(?:href|src)="(\/(?!\/)[^"#?]*)/g)) {
    const f = ref.endsWith("/") ? ref + "index.html" : ref;
    if (!exists(decodeURIComponent(f)) && !missing.includes(ref)) missing.push(ref);
  }
}
ok(!unsafe.length, "every page's settings are there, with no raw < in them" + (unsafe.length ? ": " + unsafe.join(", ") : ""));
ok(!missing.length, "every file a page links to is in the build" + (missing.length ? ": " + missing.slice(0, 10).join(", ") : ""));
const wordKey = (home.match(/data-text="([^"]+)"/) || [])[1];
const blockKey = (read("about/index.html").match(/<div[^>]*data-text="([^"]+)"/) || [])[1]; // a block of paragraphs
const spotKey = (read("supporters/index.html").match(/data-b="([^"]+)"/) || [])[1];
ok(!!wordKey && !!blockKey && !!spotKey, `found wording (${wordKey}, ${blockKey}) and a photo spot (${spotKey}) to build with`);

// ---------- a launched build, with saved wording, a photo on a page and two posts ----------
const wording = json("wording.json", {
  [wordKey]: "First paragraph " + XSS + "\nnext line",
  [blockKey]: "One paragraph\n\n## A new heading\n\nAnother paragraph",
  "js.goal.shelter": "the rescue " + XSS,
  "p.home.title": "A brand new title",
});
const photos = json("photos.json", [{ id: "pp1", page: "supporters", spot: "after:" + spotKey, layout: "full", shape: "original", caption: "A caption " + XSS,
  photos: [{ url: "assets/photos/dog-tyce.jpg", alt: "A dog " + XSS, w: 800, h: 600 }], updated_at: "2026-11-01T00:00:00Z" }]);
const posts = json("posts.json", [
  { id: "sq1", slug: "rocket-goes-to-the-beach", title: "Rocket goes to the beach " + XSS, summary: "A first look at the ocean.", body: "He was shy.", photo_url: "assets/photos/dog-tyce.jpg", photo_frame: null, photo_alt: "Rocket", photos: [], videos: [], links: [], publish_at: null, created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z" },
  { id: "sq2", slug: "no-photo-post", title: "No photo", summary: null, body: "Words only.", photo_url: null, photo_frame: null, photo_alt: null, photos: [], videos: [], links: [], publish_at: "2026-11-12T12:00:00Z", created_at: "2026-11-11T12:00:00Z", updated_at: "2026-11-12T12:00:00Z" },
  { id: "sq3", slug: "../escape", title: "Bad address", summary: null, body: "x", photo_url: null, photos: [], videos: [], links: [], publish_at: null, created_at: "2026-11-11T12:00:00Z" },
]);
build({ SITE_TEXT_FILE: wording, PAGE_PHOTOS_FILE: photos, ARTICLES_FILE: posts, SITE_PREVIEW: "0", SITE_URL: "https://example.org/" });
const h2 = read("index.html");
ok(!/noindex/.test(h2) && !/class="preview"/.test(h2), "a launched build has no PREVIEW banner and lets search engines in");
const robots = read("robots.txt");
ok(/Allow: \//.test(robots) && /Disallow: \/edit\//.test(robots) && /Sitemap: https:\/\/example\.org\/sitemap\.xml/.test(robots), "launched robots.txt: everything but the edit page, and where the sitemap is");
ok(h2.includes("First paragraph &lt;img src=x") && !h2.includes("First paragraph <img"), "saved wording is built into the page, escaped");
ok(h2.includes("First paragraph &lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt;&lt;script&gt;window.__pwned=1&lt;/script&gt;<br>next line"), "in a one-paragraph spot, a new line stays a line break");
ok(/<p>One paragraph<\/p><h2 class="h2">A new heading<\/h2><p>Another paragraph<\/p>/.test(read("about/index.html")), "in a block, blank lines make paragraphs and ## makes a heading");
ok(/<title>A brand new title<\/title>/.test(h2), "a saved page title is used");
const cfg = h2.match(/<script>window\.SITE=(.*?);<\/script>/)[1];
ok(cfg.includes("the rescue \\u003cimg") && !cfg.includes("<"), "saved script phrases are built in, with no raw < in the settings");
const sup = read("supporters/index.html");
ok(/<figure[^>]*data-pp="pp1"/.test(sup) && sup.includes('alt="A dog &lt;img') && sup.includes("A caption &lt;img") && !sup.includes("A caption <img"), "a photo added to a page is built in, its words escaped");
ok(exists("twin-squawk/rocket-goes-to-the-beach/index.html") && exists("twin-squawk/no-photo-post/index.html"), "each Twin Squawk post gets a page of its own");
ok(!fs.readdirSync(path.join(OUT, "twin-squawk")).some(f => /escape/.test(f)) && !exists("escape/index.html"), "a post with a bad address is skipped");
const post = read("twin-squawk/rocket-goes-to-the-beach/index.html");
ok(/<meta property="og:title" content="Rocket goes to the beach &lt;img/.test(post) && /og:url" content="https:\/\/example\.org\/twin-squawk\/rocket-goes-to-the-beach\/"/.test(post), "a post's page has its own link preview title and address, escaped");
ok(/og:image" content="https:\/\/example\.org\/[^"]+"/.test(post) && /A first look at the ocean\./.test(post), "with its photo and summary in the preview");
ok(/"post":"rocket-goes-to-the-beach"/.test(post), "and opens that post when it loads");
const map = read("sitemap.xml");
ok(map.includes("https://example.org/twin-squawk/rocket-goes-to-the-beach/") && map.includes("https://example.org/twin-squawk/no-photo-post/"), "the posts are in the sitemap");
ok(/^[0-9a-f]+/.test(read("twin-squawk/stamp.txt")), "the build notes which posts it built, so a new one triggers a rebuild");

// ---------- back to the build the other tests use ----------
build(plain);
ok(!exists("twin-squawk/rocket-goes-to-the-beach/index.html") && /PREVIEW/.test(read("index.html")), "rebuilt plain for the other tests");
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(report("build"));
