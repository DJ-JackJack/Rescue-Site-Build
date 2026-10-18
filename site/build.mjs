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
    .replace("{{preview}}", PREVIEW ? '<div class="preview" role="note"><b>PREVIEW</b> · This site isn\'t launched yet.</div>' : "")
    .replace("{{config}}", `<script>window.SITE=${JSON.stringify(CONFIG)};</script>`)
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
}

// the edit page (/edit/): its own page, not linked from the site, never indexed
{
  textDefaults.sort((a, b) => (b.page === "/") - (a.page === "/")); // homepage first, then page order
  const cfg = JSON.stringify({ ...CONFIG, textDefaults }).replace(/</g, "\\u003c");
  let html = fill(fs.readFileSync(path.join(SRC, "edit.html"), "utf8")).replace("{{config}}", () => cfg);
  const left = html.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`edit.html: unfilled placeholder ${left[0]}`);
  fs.mkdirSync(path.join(OUT, "edit"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "edit", "index.html"), html);
  built.push("/edit/ (private)");
}

// the planning questionnaire keeps working at /questionnaire/
fs.cpSync(path.join(ROOT, "questionnaire"), path.join(OUT, "questionnaire"), { recursive: true });
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
if (!PREVIEW) fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\nDisallow: /questionnaire/\nDisallow: /edit/\n");
else fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`built ${built.length} pages into _site/ (base ${BASE}${PREVIEW ? ", preview" : ", launched"})`);
for (const b of built) console.log("  " + b);
