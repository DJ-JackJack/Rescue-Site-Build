#!/usr/bin/env node
// Builds the public site into _site/. No dependencies: run `node site/build.mjs`.
//
// Each file in site/pages/ starts with a one-line JSON header in an HTML comment:
//   <!--{"title":"Shelter Goals","description":"...","nav":"goals","path":"shelter-goals/"}-->
// The rest of the file is the page body. site/layout.html wraps it with the header,
// menu and footer. In any file, {{base}} becomes the site's root URL and
// {{asset:name}} becomes a cache-busted link to site/assets/name, and {{owner}} / {{owner_first}}
// become her published name (see OWNER below). {{patreon}} and {{if:patreon}}: see LINKS below.
//
// site/edit.html is the private edit page, written to /edit/. It gets the same {{base}}/{{asset:}} filling,
// plus {{config}}: the public settings and every piece of wording on the site, for its Page wording screen.
//
// Wording: every text on the pages gets a key (site/wording.mjs), and wording saved from the edit page (the
// site_text table) is built into the pages, so link previews and search engines see it and nothing flickers.
// site.js also applies anything saved since the last build; the deploy workflow rebuilds nightly to catch up.
//
// Settings (environment variables):
//   SITE_BASE      root path the site is served from. "/Rescue-Site-Build/" on GitHub Pages
//                  today, "/" once a custom domain is set. Default "/".
//   SITE_URL       the site's full address, for link previews and the sitemap. The deploy workflow passes
//                  GitHub Pages' address, which follows a custom domain once one is set.
//   SITE_PREVIEW   "1" (default) = not launched: hidden from search engines, shows a preview banner.
//                  "0" = launched.
//   SITE_TEXT_FILE a JSON file of saved wording ({"key": "words"}) to build with instead of reading site_text,
//                  for tests ({} builds the pages' own words).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { annotate, blockHTML, esc as escText, scriptPhrases } from "./wording.mjs";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SRC, "..");
const OUT = path.join(ROOT, "_site");
const BASE = ("/" + (process.env.SITE_BASE || "/").replace(/^\/+|\/+$/g, "") + "/").replace("//", "/");
const PREVIEW = process.env.SITE_PREVIEW !== "0";
// GitHub gives the address as http:// until "Enforce HTTPS" is ticked; the site is always meant to be https://.
const SITE_URL = (process.env.SITE_URL || "https://dj-jackjack.github.io" + BASE).replace(/\/+$/, "").replace(/^http:\/\/(?!localhost|127\.)/, "https://") + "/";

// The name she publishes under (a pen name). Change it here and every page follows.
const OWNER = { full: "Taea Whelan", first: "Taea" };
// Her pages elsewhere, used in links on the site. {{patreon}} is the address; anything marked {{if:patreon}} stays
// hidden while it's empty, so the Patreon buttons appear on their own once it's filled in.
const LINKS = { patreon: "https://www.patreon.com/TerrorTwyns" };

// The database's address and publishable key, kept in site/supabase.json for the build, the backup and the
// keep-awake job. Public on purpose: the publishable key can only read published rows and call submit_message.
const SUPABASE = JSON.parse(fs.readFileSync(path.join(SRC, "supabase.json"), "utf8"));
const CONFIG = {
  base: BASE,
  ownerFirst: OWNER.first,
  supabaseUrl: SUPABASE.url,
  supabaseKey: SUPABASE.key,
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Wording saved from the edit page. If it can't be read, the pages are built with their own words, and
// site.js still puts the saved wording in when the page loads.
async function savedWording() {
  let rows;
  if (process.env.SITE_TEXT_FILE) rows = Object.entries(JSON.parse(fs.readFileSync(process.env.SITE_TEXT_FILE, "utf8"))).map(([key, body]) => ({ key, body }));
  else {
    try {
      const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/site_text?select=key,body`, { headers: { apikey: CONFIG.supabaseKey }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
      rows = await r.json();
    } catch (e) {
      console.warn(`! saved wording not loaded (${e.message}); building with the pages' own words`);
      rows = [];
    }
  }
  return Object.fromEntries(rows.filter(r => typeof r.body === "string" && r.body.trim()).map(r => [r.key, r.body.trim()]));
}
const saved = await savedWording();

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
    .replace(/\{\{owner_first\}\}/g, OWNER.first)
    .replace(/\{\{if:(\w+)\}\}/g, (_, k) => (LINKS[k] ? "" : "hidden"))
    .replace(/\{\{(patreon)\}\}/g, (_, k) => esc(LINKS[k] || "#"));
}

// Wording marked data-text="key" data-label="..." can be changed from the edit page. The page's own words
// are the default, handed to the edit page as plain text ("## " starts a heading, a blank line a paragraph).
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Returns the HTML with any saved wording built in, and fills in the block's entry in items.
const blockKeys = new Set();
function collectText(html, page, items) {
  return html.replace(/(<(p|div)\b[^>]*\bdata-text="([^"]+)"[^>]*\bdata-label="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (all, open, tag, key, label, inner, close) => {
    if (tag === "div" && /<div\b/.test(inner)) throw new Error(`${page}: data-text block "${key}" can't contain another <div>`);
    if (blockKeys.has(key)) throw new Error(`${page}: data-text key "${key}" is used twice`);
    blockKeys.add(key);
    const text = tag === "p" ? decode(inner)
      : [...inner.matchAll(/<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(([, t, s]) => (t === "h2" ? "## " : "") + decode(s)).join("\n\n");
    const item = items.find(i => i.key === key);
    if (!item) throw new Error(`${page}: data-text block "${key}" wasn't found in the page's wording`);
    Object.assign(item, { kind: tag === "div" ? "A few paragraphs" : "Paragraph", label: decode(label), multi: tag === "div", text });
    return saved[key] ? open.replace(/>$/, ` data-text-orig="${escText(text)}">`) + blockHTML(saved[key], tag === "p") + close : all;
  });
}

// Link previews (Facebook, texts, TikTok bio links): each page's title and description, and a share image
// from assets/share/ named after the page (willow-woods.jpg), or default.jpg.
const pageUrls = [], pageNames = []; // pageNames: for the edit page's Visitors screen
function social(meta, title, description) {
  const url = SITE_URL + (meta.path === "404" ? "" : meta.path || "");
  const name = (meta.path || "").replace(/\/$/, "");
  const img = hashes[`share/${name}.jpg`] ? `share/${name}.jpg` : "share/default.jpg";
  return [
    meta.path === "404" ? "" : `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:site_name" content="TheTerr0rTw!ns">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escText(title)}">`,
    `<meta property="og:description" content="${escText(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(SITE_URL + "assets/" + img + "?v=" + hashes[img])}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Snapshots of animals from TheTerr0rTw!ns">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join("\n");
}

// The phrases site.js writes as pages load (labels, empty lists, form replies), from its t("js.key", "...") calls.
// Saved versions go to every page in window.SITE.t, so they're right from the start.
const phrases = scriptPhrases(fs.readFileSync(path.join(SRC, "assets", "site.js"), "utf8"));
const scriptItems = [...phrases].map(([key, text]) => ({ key, scope: "js", kind: "Written by the site as the page loads", text }));
const scriptSaved = Object.fromEntries([...phrases.keys()].filter(k => saved[k]).map(k => [k, saved[k]]));

// The shared header, menu, footer and contact form are one set of wording for every page ("all").
const layoutItems = [];
const layout = annotate(fill(fs.readFileSync(path.join(SRC, "layout.html"), "utf8")), "all", saved, layoutItems);
const pagesDir = path.join(SRC, "pages");
const built = [], pageItems = [], areas = [];
for (const file of fs.readdirSync(pagesDir).filter(f => f.endsWith(".html")).sort()) {
  const raw = fs.readFileSync(path.join(pagesDir, file), "utf8");
  const m = raw.match(/^<!--(\{.*?\})-->\n/);
  if (!m) throw new Error(`${file}: first line must be a <!--{json}--> header`);
  const meta = JSON.parse(m[1]);
  const scope = meta.path === "404" ? "404" : (meta.path || "").replace(/\/$/, "") || "home";
  const page = "/" + (meta.path === "404" ? "404.html" : meta.path || "");
  // title and description, for the browser tab, search results and link previews
  const tab = meta.title === "Home" ? "TheTerr0rTw!ns · Rescue, education and dog day outs" : `${fill(meta.title)} · TheTerr0rTw!ns`;
  const items = [
    { key: `p.${scope}.title`, scope, kind: "Page title (browser tab, Google and link previews)", text: tab },
    { key: `p.${scope}.description`, scope, kind: "Page description (Google and link previews)", text: fill(meta.description || "") },
  ];
  const title = saved[items[0].key] || tab, description = saved[items[1].key] || items[1].text;
  const preview = saved[items[0].key] || (meta.title === "Home" ? "TheTerr0rTw!ns" : tab);
  const body = annotate(fill(raw.slice(m[0].length)), scope, saved, items);
  const site = JSON.stringify({ ...CONFIG, page: "/" + (meta.path === "404" ? "404" : meta.path || ""), scope, t: scriptSaved, ...(saved[items[0].key] ? { titleOrig: tab } : {}) }).replace(/</g, "\\u003c");
  let html = layout
    .replace("{{title}}", escText(title))
    .replace("{{description}}", escText(description))
    .replace("{{robots}}", PREVIEW ? '<meta name="robots" content="noindex, nofollow">' : "")
    .replace("{{social}}", () => social(meta, preview, description))
    .replace("{{preview}}", PREVIEW ? '<div class="preview" role="note"><b>PREVIEW</b> · This site isn\'t launched yet.</div>' : "")
    .replace("{{config}}", () => `<script>window.SITE=${site};</script>`)
    .replace("{{bodyclass}}", esc(meta.bodyclass || ""))
    .replace("{{content}}", () => body);
  if (meta.nav) html = html.replaceAll(`data-nav="${meta.nav}"`, `data-nav="${meta.nav}" aria-current="page"`);
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`${file}: unfilled placeholder ${left[0]}`);
  html = collectText(html, page, items);
  pageItems.push(...items);
  areas.push({ scope, title: meta.title === "Home" ? "Home" : fill(meta.title), path: meta.path === "404" ? null : "/" + (meta.path || "") });
  const outFile = meta.path === "404" ? path.join(OUT, "404.html") : path.join(OUT, meta.path || "", "index.html");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  built.push("/" + (meta.path === "404" ? "404.html" : meta.path || ""));
  if (meta.path !== "404") { pageUrls.push(SITE_URL + (meta.path || "")); pageNames.push({ path: "/" + (meta.path || ""), title: fill(meta.title) }); }
}

// the edit page (/edit/): its own page, not linked from the site, never indexed
{
  // every piece of wording, page by page (homepage first, the page-not-found page last), then the shared parts
  const order = a => (a.scope === "home" ? -1 : a.scope === "404" ? 1 : 0);
  areas.sort((a, b) => order(a) - order(b));
  areas.push({ scope: "all", title: "On every page (menu, footer and contact form)", path: "/" }, { scope: "js", title: "Messages and labels the site writes", path: null });
  const textDefaults = areas.flatMap(a => (a.scope === "all" ? layoutItems : a.scope === "js" ? scriptItems : pageItems.filter(i => i.scope === a.scope)));
  const cfg = JSON.stringify({ ...CONFIG, siteUrl: SITE_URL, pages: pageNames, areas, textDefaults }).replace(/</g, "\\u003c");
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

fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
fs.cpSync(path.join(SRC, "root"), OUT, { recursive: true }); // favicon.ico for the domain root
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
if (!PREVIEW) fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: ${BASE}edit/\nSitemap: ${SITE_URL}sitemap.xml\n`);
else fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`built ${built.length} pages into _site/ (base ${BASE}${PREVIEW ? ", preview" : ", launched"})`);
for (const b of built) console.log("  " + b);
