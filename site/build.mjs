#!/usr/bin/env node
// Builds the public site into _site/. No dependencies: run `node site/build.mjs`.
//
// Each file in site/pages/ starts with a one-line JSON header in an HTML comment:
//   <!--{"title":"Shelter Goals","description":"...","nav":"goals","path":"shelter-goals/"}-->
// The rest of the file is the page body. site/layout.html wraps it with the header,
// menu and footer. In any file, {{base}} becomes the site's root URL and
// {{asset:name}} becomes a cache-busted link to site/assets/name, and {{owner}} / {{owner_first}}
// become her published name (see OWNER below).
//
// site/edit.html is the private edit page, written to /edit/. It gets the same {{base}}/{{asset:}} filling,
// plus {{config}}: the public settings and the built-in wording of every data-text block.
//
// Settings (environment variables):
//   SITE_BASE      root path the site is served from. "/Rescue-Site-Build/" on GitHub Pages
//                  today, "/" once a custom domain is set. Default "/".
//   SITE_URL       the site's full address, for link previews and the sitemap. The deploy workflow passes
//                  GitHub Pages' address, which follows a custom domain once one is set.
//   SITE_PREVIEW   "1" (default) = not launched: hidden from search engines, shows a preview banner.
//                  "0" = launched.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SRC, "..");
const OUT = path.join(ROOT, "_site");
const BASE = ("/" + (process.env.SITE_BASE || "/").replace(/^\/+|\/+$/g, "") + "/").replace("//", "/");
const PREVIEW = process.env.SITE_PREVIEW !== "0";
const SITE_URL = (process.env.SITE_URL || "https://dj-jackjack.github.io" + BASE).replace(/\/+$/, "") + "/";

// The name she publishes under (a pen name). Change it here and every page follows.
const OWNER = { full: "Taea Whelan", first: "Taea" };

// Public on purpose: the publishable key can only read published rows and call submit_message.
const CONFIG = {
  base: BASE,
  ownerFirst: OWNER.first,
  supabaseUrl: "https://yysfgsdwlddeilktumza.supabase.co",
  supabaseKey: "sb_publishable_UtnxK1yVdvtQhj9pP608jA_mW9ZL5Ty",
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// assets, with a short content hash for cache-busting
const assetDir = path.join(SRC, "assets");
const hashes = {};
fs.cpSync(assetDir, path.join(OUT, "assets"), { recursive: true });
for (const f of fs.readdirSync(assetDir, { recursive: true })) {
  const p = path.join(assetDir, f);
  if (fs.statSync(p).isFile()) hashes[f.split(path.sep).join("/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 8);
}

function fill(html) {
  return html
    .replace(/\{\{asset:([^}]+)\}\}/g, (_, name) => {
      if (!hashes[name]) throw new Error(`missing asset: ${name}`);
      return `${BASE}assets/${name}?v=${hashes[name]}`;
    })
    .replace(/\{\{base\}\}/g, BASE)
    .replace(/\{\{owner\}\}/g, OWNER.full)
    .replace(/\{\{owner_first\}\}/g, OWNER.first);
}

// Wording marked data-text="key" data-label="..." can be changed from the edit page. The page's own words
// are the default, handed to the edit page as plain text ("## " starts a heading, a blank line a paragraph).
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const textDefaults = [];
function collectText(html, page) {
  for (const m of html.matchAll(/<(p|div)\b[^>]*\bdata-text="([^"]+)"[^>]*\bdata-label="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const [, tag, key, label, inner] = m;
    if (tag === "div" && /<div\b/.test(inner)) throw new Error(`${page}: data-text block "${key}" can't contain another <div>`);
    if (textDefaults.some(t => t.key === key)) throw new Error(`${page}: data-text key "${key}" is used twice`);
    const text = tag === "p" ? decode(inner)
      : [...inner.matchAll(/<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(([, t, s]) => (t === "h2" ? "## " : "") + decode(s)).join("\n\n");
    textDefaults.push({ key, label: decode(label), page, block: tag === "div", text });
  }
}

// Link previews (Facebook, texts, TikTok bio links): each page's title and description, and a share image
// from assets/share/ named after the page (willow-woods.jpg), or default.jpg.
const pageUrls = [], pageNames = []; // pageNames: for the edit page's Visitors screen
function social(meta) {
  const url = SITE_URL + (meta.path === "404" ? "" : meta.path || "");
  const name = (meta.path || "").replace(/\/$/, "");
  const img = hashes[`share/${name}.jpg`] ? `share/${name}.jpg` : "share/default.jpg";
  const title = meta.title === "Home" ? "TheTerr0rTw!ns" : `${meta.title} · TheTerr0rTw!ns`;
  return [
    meta.path === "404" ? "" : `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="TheTerr0rTw!ns">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(meta.description || "")}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(SITE_URL + "assets/" + img + "?v=" + hashes[img])}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Snapshots of animals from TheTerr0rTw!ns">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join("\n");
}

const layout = fs.readFileSync(path.join(SRC, "layout.html"), "utf8");
const pagesDir = path.join(SRC, "pages");
const built = [];
for (const file of fs.readdirSync(pagesDir).filter(f => f.endsWith(".html")).sort()) {
  const raw = fs.readFileSync(path.join(pagesDir, file), "utf8");
  const m = raw.match(/^<!--(\{.*?\})-->\n/);
  if (!m) throw new Error(`${file}: first line must be a <!--{json}--> header`);
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length);
  let html = layout
    .replace("{{title}}", esc(meta.title === "Home" ? "TheTerr0rTw!ns · Rescue, education and dog day outs" : `${meta.title} · TheTerr0rTw!ns`))
    .replace("{{description}}", esc(meta.description || ""))
    .replace("{{robots}}", PREVIEW ? '<meta name="robots" content="noindex, nofollow">' : "")
    .replace("{{social}}", () => social(meta))
    .replace("{{preview}}", PREVIEW ? '<div class="preview" role="note"><b>PREVIEW</b> · This site isn\'t launched yet.</div>' : "")
    .replace("{{config}}", `<script>window.SITE=${JSON.stringify({ ...CONFIG, page: "/" + (meta.path === "404" ? "404" : meta.path || "") })};</script>`)
    .replace("{{bodyclass}}", esc(meta.bodyclass || ""))
    .replace("{{content}}", () => body);
  if (meta.nav) html = html.replaceAll(`data-nav="${meta.nav}"`, `data-nav="${meta.nav}" aria-current="page"`);
  html = fill(html);
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`${file}: unfilled placeholder ${left[0]}`);
  collectText(html, "/" + (meta.path === "404" ? "404.html" : meta.path || ""));
  const outFile = meta.path === "404" ? path.join(OUT, "404.html") : path.join(OUT, meta.path || "", "index.html");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  built.push("/" + (meta.path === "404" ? "404.html" : meta.path || ""));
  if (meta.path !== "404") { pageUrls.push(SITE_URL + (meta.path || "")); pageNames.push({ path: "/" + (meta.path || ""), title: fill(meta.title) }); }
}

// the edit page (/edit/): its own page, not linked from the site, never indexed
{
  textDefaults.sort((a, b) => (b.page === "/") - (a.page === "/")); // homepage first, then page order
  const cfg = JSON.stringify({ ...CONFIG, siteUrl: SITE_URL, pages: pageNames, textDefaults }).replace(/</g, "\\u003c");
  let html = fill(fs.readFileSync(path.join(SRC, "edit.html"), "utf8")).replace("{{config}}", () => cfg);
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`edit.html: unfilled placeholder ${left[0]}`);
  fs.mkdirSync(path.join(OUT, "edit"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "edit", "index.html"), html);
  const sw = fill(fs.readFileSync(path.join(SRC, "edit-sw.js"), "utf8")); // notifications; must sit in /edit/ to look after it
  if (/\{\{[^}]*\}\}/.test(sw)) throw new Error("edit-sw.js: unfilled placeholder");
  fs.writeFileSync(path.join(OUT, "edit", "sw.js"), sw);
  fs.writeFileSync(path.join(OUT, "edit", "manifest.webmanifest"), JSON.stringify({
    name: "TheTerr0rTw!ns site editor", short_name: "Site editor", start_url: "./", scope: "./", display: "standalone",
    background_color: "#FBF8FF", theme_color: "#352262",
    icons: [192, 512].map(s => ({ src: `${BASE}assets/icon-${s}.png?v=${hashes[`icon-${s}.png`]}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" })),
  }, null, 2));
  built.push("/edit/ (private)");
}

// questionnaire/ (the planning questionnaire) is no longer published; tools/render-answers.mjs still reads it.
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
fs.cpSync(path.join(SRC, "root"), OUT, { recursive: true }); // favicon.ico for the domain root
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
if (!PREVIEW) fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: ${BASE}edit/\nSitemap: ${SITE_URL}sitemap.xml\n`);
else fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`built ${built.length} pages into _site/ (base ${BASE}${PREVIEW ? ", preview" : ", launched"})`);
for (const b of built) console.log("  " + b);
