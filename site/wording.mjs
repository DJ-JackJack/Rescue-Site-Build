// Editable wording. Every piece of text on the pages gets a key at build time, so the edit page can change it
// (Page wording) and the change can be built into the page:
//   - an element holding nothing but text gets data-t="key" (a heading, a paragraph, a button...);
//   - text that shares an element with other tags (a sentence with a link or a book title in it) is wrapped in
//     <x-t data-t="key">, which no style touches;
//   - photo descriptions (alt) and form hints (placeholder) get data-t-alt / data-t-ph.
// Keys are "w." (text) or "a." (attribute), the page's name ("all" for the shared header and footer), and a short
// fingerprint of the words: a saved change follows the words, not their position, so it can't land on the wrong
// element if the page around it changes. If the original words themselves change, the saved change stops
// applying (the edit page lists it under "no longer on the site").
// Some text is written by site.js as the page loads (counts, lists, form replies); it's skipped here, and its
// wording is edited through site.js's own t() phrases.
import crypto from "node:crypto";

const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const RAW = new Set(["script", "style", "textarea", "title"]);
const SKIP_TAGS = new Set(["head", "svg", "script", "style", "textarea", "title", "template"]);
// attributes or ids whose content site.js writes itself
const SKIP_ATTR = /\sdata-(?:text|stat|goals|wall|rescues|horses|events|sniffari|videos|places|spotlight|counts|collabs|partner-links|sleepovers|fosters|foster-free|adventures)\b|\saria-hidden="true"|\sclass="formmsg\b|\sid="(?:wall-count|sniff-count|jname|jsteps|jchip|jpic|jstory|jnotes|hwsvg|apic|aname|ameta|abody|alight)"/;
const INLINE = new Set("a b strong em i u span small mark q cite abbr time sub sup".split(" "));
// elements that hold a sentence (rather than a section of the page)
const SENTENCE = new Set("p h1 h2 h3 h4 li dt dd label button a small span b strong em i figcaption summary legend blockquote td th q".split(" "));
const KIND = {
  h1: "Main heading", h2: "Heading", h3: "Heading", h4: "Heading", p: "Paragraph", li: "List item", a: "Link",
  button: "Button", label: "Form label", option: "Menu choice", small: "Small print", dt: "Label", dd: "Text",
  figcaption: "Caption", summary: "Heading you tap to open", legend: "Form heading", b: "Bold text", strong: "Bold text",
};

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…", middot: "·" };
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
// (braces too, so saved wording can never look like one of the build's {{placeholders}})
export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\{/g, "&#123;");
const words = s => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const meaningful = s => /[\p{L}\p{N}]/u.test(s) && !/^\{\{[^}]*\}\}$/.test(s.trim());

// A small HTML reader for the site's own hand-written pages: elements, text, comments, kept exactly as written
// (serialize(parse(x)) === x, which the build checks for every page).
export function parse(src) {
  const root = { tag: "#root", children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1]) { // closing tag: close up to the matching element
      const name = m[1].toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== name) i--;
      if (i > 0) { stack[i].end = m[0]; stack.length = i; } else top.children.push({ raw: m[0] });
    } else if (m[2]) {
      const tag = m[2].toLowerCase(), el = { tag, attrs: m[3], start: m[0], children: [], end: "" };
      top.children.push(el);
      if (RAW.has(tag)) { // keep the content exactly, up to its closing tag
        const close = new RegExp(`</${tag}\\s*>`, "ig");
        close.lastIndex = re.lastIndex;
        const c = close.exec(src);
        const stop = c ? c.index : src.length;
        if (stop > re.lastIndex) el.children.push({ raw: src.slice(re.lastIndex, stop) });
        el.end = c ? c[0] : "";
        re.lastIndex = c ? close.lastIndex : src.length;
      } else if (!VOID.has(tag) && !m[3].trim().endsWith("/")) stack.push(el);
    } else if (m[0].startsWith("<!") || m[0] === "<") top.children.push({ raw: m[0] });
    else top.children.push({ text: m[0] });
  }
  return root;
}
export const serialize = n => n.raw ?? n.text ?? (n.tag === "#root" ? "" : n.start) + n.children.map(serialize).join("") + (n.tag === "#root" ? "" : n.end);

const fingerprint = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
const plainText = n => (n.text !== undefined ? n.text : n.children ? n.children.map(plainText).join("") : "");
// the words a reader takes as one sentence (a dropdown's choices aren't part of its label's sentence)
const meaningfulText = n => (n.text !== undefined ? (meaningful(n.text) ? n.text : " ") : n.tag === "select" ? " " : n.children ? n.children.map(meaningfulText).join("") : "");

// Where saved wording is built in, the original goes in data-t-orig, so the page can put it back straight away
// if the change is undone before the next build.
// Adds keys to one page's HTML (or the shared layout, scope "all"), puts saved wording in, and lists every item
// for the edit page: { key, scope, kind, text, ctx?, part? }.
export function annotate(html, scope, saved = {}, items = []) {
  const root = parse(html);
  const seen = {};
  let heading = "";
  const keyOf = (prefix, text) => {
    const base = `${prefix}.${scope}.${fingerprint(text)}`;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base}-${seen[base]}`;
  };
  const attrItem = (el, attr, short, kind) => {
    const am = el.attrs.match(new RegExp(`\\s${attr}="([^"]*)"`));
    if (!am || !meaningful(decode(am[1]))) return;
    const text = decode(am[1]).replace(/\s+/g, " ").trim(), key = keyOf("a", text);
    items.push({ key, scope, kind, text, ctx: heading || undefined });
    let attrs = el.attrs.replace(am[0], saved[key] ? ` ${attr}="${esc(saved[key].trim())}"` : am[0]);
    attrs += ` data-t-${short}="${key}"` + (saved[key] ? ` data-t-orig="${esc(text)}"` : "");
    el.start = el.start.replace(el.attrs, () => attrs);
    el.attrs = attrs;
  };
  // partOf: the whole sentence, when this element is a few styled words inside a longer one
  const walk = (el, inSr, partOf) => {
    const block = el.attrs && el.attrs.match(/\sdata-text="([^"]+)"/);
    if (block) { items.push({ key: block[1], scope, block: true }); return; } // a longer block: the build fills in the rest
    if (SKIP_TAGS.has(el.tag) || (el.attrs && SKIP_ATTR.test(el.attrs))) return;
    if (el.attrs !== undefined) {
      if (el.tag === "img") attrItem(el, "alt", "alt", "Photo description (read aloud to people who can't see it)");
      if (el.tag === "input" || el.tag === "textarea") attrItem(el, "placeholder", "ph", "Hint inside a form box");
    }
    // text only some people get: read aloud to screen reader users, or shown when JavaScript is off
    const sr = inSr || (el.tag === "noscript" ? "noscript" : /\sclass="(?:[^"]*\s)?sr(?:\s[^"]*)?"/.test(el.attrs || "") ? "sr" : "");
    const texts = el.children.filter(c => c.text !== undefined && meaningful(c.text));
    const onlyText = texts.length === 1 && el.children.every(c => c.text !== undefined || (c.raw && c.raw.startsWith("<!--")));
    if (onlyText && el.tag !== "#root") {
      const node = texts[0], text = words(node.text), key = keyOf("w", text);
      if (/^h[1-4]$/.test(el.tag)) heading = text;
      const part = partOf && partOf !== text ? partOf : undefined;
      let kind = part ? "Part of a sentence" : KIND[el.tag] || "Text";
      if (!part && el.tag === "a" && /\sclass="[^"]*\bbtn\b/.test(el.attrs)) kind = "Button";
      if (sr) kind += sr === "noscript" ? " (only shown when JavaScript is off)" : " (read aloud, not shown)";
      items.push({ key, scope, kind, text, part, ctx: heading && heading !== text && heading !== part ? heading : undefined });
      el.start = el.start.replace(/>$/, ` data-t="${key}"${saved[key] ? ` data-t-orig="${esc(text)}"` : ""}>`);
      if (saved[key]) for (const c of el.children) if (c === node) { c.text = esc(saved[key].trim()); }
      return;
    }
    const whole = words(plainText(el)), wholeWords = words(meaningfulText(el));
    if (/^h[1-4]$/.test(el.tag)) heading = whole;
    // a sentence with styled words in it has words of its own between them ("live in <em>harmony</em>"),
    // unlike a title and description side by side (<b>We talk</b><span>Tell me…</span>)
    const sentence = SENTENCE.has(el.tag) && texts.length > 0;
    for (const c of el.children) {
      if (c.children) { walk(c, sr, sentence && INLINE.has(c.tag) && wholeWords !== words(meaningfulText(c)) ? whole : undefined); continue; }
      if (c.text === undefined || !meaningful(c.text)) continue;
      const lead = c.text.match(/^\s*/)[0], trail = c.text.match(/\s*$/)[0], core = c.text.slice(lead.length, c.text.length - trail.length);
      const text = words(core), key = keyOf("w", text);
      // the only words here (a form label beside its box, a link beside its arrow) or part of a longer sentence
      const alone = wholeWords === text || !SENTENCE.has(el.tag);
      let kind = alone ? KIND[el.tag] || "Text" : "Part of a sentence";
      if (alone && el.tag === "a" && /\sclass="[^"]*\bbtn\b/.test(el.attrs)) kind = "Button";
      if (sr) kind += sr === "noscript" ? " (only shown when JavaScript is off)" : " (read aloud, not shown)";
      items.push({ key, scope, kind, text, part: alone ? undefined : whole, ctx: heading && heading !== whole ? heading : undefined });
      c.text = saved[key] ? `${lead}<x-t data-t="${key}" data-t-orig="${esc(text)}">${esc(saved[key].trim())}</x-t>${trail}` : `${lead}<x-t data-t="${key}">${core}</x-t>${trail}`;
    }
  };
  walk(root, "", undefined);
  return serialize(root);
}

// Longer blocks marked data-text="key" (several paragraphs, "## " headings): the same plain format site.js reads.
export const blockHTML = (s, inline) => inline
  ? esc(s.trim()).replace(/\n+/g, "<br>")
  : s.trim().split(/\n\s*\n/).map(b => b.startsWith("## ") ? `<h2 class="h2">${esc(b.slice(3).trim())}</h2>` : `<p>${esc(b.trim()).replace(/\n/g, "<br>")}</p>`).join("");

// The phrases site.js writes itself, from its t("js.key", "Default words {name}") calls.
export function scriptPhrases(src) {
  const calls = [...src.matchAll(/\bt\(\s*"(js\.[a-z0-9_.-]+)",\s*"((?:[^"\\]|\\.)*)"/g)];
  const count = (src.match(/\bt\(\s*"js\./g) || []).length;
  if (calls.length !== count) throw new Error(`site.js: ${count - calls.length} t("js...") call(s) don't follow the t("js.key", "text") form`);
  const out = new Map();
  for (const [, key, raw] of calls) {
    const text = JSON.parse(`"${raw}"`);
    if (out.has(key) && out.get(key) !== text) throw new Error(`site.js: t("${key}") has two different texts`);
    out.set(key, text);
  }
  return out;
}
