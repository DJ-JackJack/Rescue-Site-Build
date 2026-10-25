// Photo spots: the places on each page where a photo can be added from the edit page (Photos on the pages).
//
// markSpots(html, scope) runs on a page's own HTML, before its wording is keyed, and marks:
//   - data-b="b.help.1a2b3c4d" data-bs="b", "a" or "ba": a part of the page a photo can go just above (b) or, for the
//     last part of a section or box, just below (a). Between every part of a section; at the top and bottom of a box.
//     The key is a fingerprint of the part's own words, like a wording key: a photo stays with its part of the page
//     when other parts move, and if those words are rewritten in the code, the edit page says it needs a new spot.
//     (Taea's own wording changes don't count: they're applied after this, to the same keys.)
//   - data-pi="i.home.1a2b3c4d": a photo already on the page (a fingerprint of its file name), so it can be
//     changed or hidden.
// It returns the HTML and, for the edit page, every spot and photo with a description of where it is.
//
// bakePhotos(html, rows) runs after the wording and puts the saved photos in, through site/assets/pagephotos.js,
// which site.js uses for anything saved since the build.
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { parse, serialize, decode, esc, SKIP_TAGS, SKIP_ATTR } from "./wording.mjs";

const PP = createRequire(import.meta.url)("./assets/pagephotos.js");

const cls = el => ((el.attrs || "").match(/\sclass="([^"]*)"/) || [, ""])[1].split(/\s+/);
const has = (el, ...names) => cls(el).some(c => names.includes(c));
const filled = el => SKIP_ATTR.test(el.attrs || ""); // site.js writes what's inside it
const FLOW = el => has(el, "wrap", "prose"); // a photo can go between any two parts
const CARD = el => has(el, "box", "need", "urgent", "formcard"); // only at the top and bottom
const textOf = n => (n.text !== undefined ? n.text : n.children && !SKIP_TAGS.has(n.tag) ? n.children.map(textOf).join(" ") : "");
const words = n => decode(textOf(n).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const meaningful = s => /[\p{L}\p{N}]/u.test(s);
const clip = s => (s.length > 60 ? s.slice(0, 57).replace(/\s+\S*$/, "") + "…" : s);
const fingerprint = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
const attr = (el, name) => ((el.attrs || "").match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

// what a part of the page is, for the edit page, when it has no words of its own (lists the page fills in)
const FILLS = { help: "the help listings", rescues: "the list of rescues", goals: "the shelter goals", horses: "the horses", events: "the events",
  collabs: "the collaborations", sniffari: "the day-out programs", fosters: "the foster programs", videos: "the videos", places: "the dog-friendly places",
  adventures: "the day outs", spotlight: "the animal spotlight", wall: "the animals", counts: "the counts", sleepovers: "the sleepover programs",
  "partner-links": "the extra links", stat: "the numbers", goalgrid: "the shelter goals" };
const firstHeading = n => { for (const c of n.children || []) { if (!c.tag) continue; if (/^h[1-4]$/.test(c.tag) && !has(c, "sr")) return c; const d = firstHeading(c); if (d) return d; } return null; };
// a list the page fills in, in this part of the page
const fillName = el => {
  for (const [k, v] of Object.entries(FILLS)) if (new RegExp(`\\sdata-${k}\\b`).test(el.attrs || "") || has(el, k)) return v;
  for (const c of el.children || []) if (c.tag) { const f = fillName(c); if (f) return f; }
  return "";
};
const LEAF = /^(p|h[1-6]|a|li|b|span|small|label|button|figcaption|blockquote)$/;
function describe(el) {
  if (CARD(el)) return `the box ${boxName(el)}`;
  const label = attr(el, "aria-label");
  if (label) return `the “${clip(decode(label))}” links`;
  // a bigger part, like a row of boxes: by its first heading
  const hd = !LEAF.test(el.tag) && firstHeading(el);
  if (hd && meaningful(words(hd))) return `the part starting “${clip(words(hd))}”`;
  const fill = !LEAF.test(el.tag) && fillName(el);
  if (fill) return fill;
  const w = words(el);
  if (meaningful(w)) return `“${clip(w)}”`;
  if (el.tag === "img" || el.tag === "figure") return "the photo";
  if (el.tag === "ul" || el.tag === "ol") return "the list";
  if (el.tag === "form") return "the form";
  return "the next part of the page";
}
// a box's name: its heading, what the page fills it with, or its first words
function boxName(el) {
  const hd = firstHeading(el), fill = fillName(el), w = words(el);
  return hd && meaningful(words(hd)) ? `“${clip(words(hd))}”` : fill ? `with ${fill}` : meaningful(w) ? `“${clip(w)}”` : "";
}
const addAttrs = (el, more) => {
  el.attrs += more;
  el.start = el.start.replace(/\s*\/?>$/, m => more + m);
};

export function markSpots(html, scope) {
  const root = parse(html), spots = [], pics = [], seen = {}, marks = new Map();
  const keyOf = (prefix, seed) => {
    const base = `${prefix}.${scope}.${fingerprint(seed)}`;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base}-${seen[base]}`;
  };
  // a part's fingerprint: its words, or for a part with none, what it is
  const seedOf = el => {
    const w = words(el);
    if (meaningful(w)) return w;
    const imgs = [];
    const walk = n => { for (const c of n.children || []) if (c.tag) { if (c.tag === "img") imgs.push(attr(c, "src") || "", attr(c, "alt") || ""); walk(c); } };
    walk(el);
    return [el.tag, attr(el, "class"), attr(el, "id"), ...(el.attrs.match(/\sdata-[\w-]+/g) || []), ...imgs].join(" ");
  };
  let group = "Top of the page";
  const visit = el => {
    for (const c of el.children || []) {
      if (!c.tag || SKIP_TAGS.has(c.tag) || filled(c)) continue;
      // the part of the page each spot is in, for grouping them on the edit page: the section's first heading
      if (c.tag === "section") {
        const hd = firstHeading(c);
        group = hd && meaningful(words(hd)) ? clip(words(hd)) : "Further down the page";
      } else if (has(c, "phead", "hero")) group = "Top of the page";
      if (c.tag === "img" && /\/assets\/photos\//.test(attr(c, "src") || "")) {
        const file = attr(c, "src").split("/assets/photos/")[1].split("?")[0];
        const k = keyOf("i", file), alt = decode(attr(c, "alt") || "").trim();
        addAttrs(c, ` data-pi="${k}"`);
        pics.push({ k, l: alt ? `The photo “${clip(alt)}”` : `The photo ${file}`, src: "assets/photos/" + file, g: group });
      }
      if (FLOW(c) || CARD(c)) {
        const parts = c.children.filter(x => x.tag && !SKIP_TAGS.has(x.tag) && x.tag !== "noscript" && x.tag !== "br" && !has(x, "sr"));
        const card = CARD(c) && !FLOW(c), name = card ? boxName(c) : "";
        parts.forEach((p, i) => {
          // no spot between a small label (the eyebrow) and the heading under it
          const last = i === parts.length - 1, afterLabel = i > 0 && has(parts[i - 1], "eyebrow");
          const pos = (card ? (i === 0 ? "b" : "") : afterLabel ? "" : "b") + (last ? "a" : "");
          if (!pos) return;
          const k = keyOf("b", seedOf(p));
          addAttrs(p, ` data-b="${k}" data-bs="${pos}"`);
          marks.set(p, [...pos].map(s => ({ s, k: `${s === "b" ? "before" : "after"}:${k}`, g: group,
            l: card ? `In the box ${name}, at the ${s === "b" ? "top" : "bottom"}` : `${s === "b" ? "Above" : "Below"} ${describe(p)}` })));
        });
      }
      visit(c);
    }
  };
  visit(root);
  // the spots in the order they come on the page
  const inOrder = n => {
    for (const c of n.children || []) {
      if (!c.tag) continue;
      const m = marks.get(c) || [];
      for (const x of m.filter(x => x.s === "b")) spots.push({ k: x.k, l: x.l, g: x.g });
      inOrder(c);
      for (const x of m.filter(x => x.s === "a")) spots.push({ k: x.k, l: x.l, g: x.g });
    }
  };
  inOrder(root);
  return { html: serialize(root), spots, pics };
}

// Puts saved photos into a page that's already had its wording put in. rows: the page's published page_photos,
// in order. Photos already on the page that are changed keep what they were in data-pp-orig, so site.js can put
// them back if the change is undone before the next build.
export function bakePhotos(html, rows) {
  if (!rows.length) return html;
  const root = parse(html), byB = new Map(), byI = new Map(), parent = new Map();
  const walk = n => { for (const c of n.children || []) if (c.tag) { parent.set(c, n); const b = attr(c, "data-b"), i = attr(c, "data-pi"); if (b) byB.set(b, c); if (i) byI.set(i, c); walk(c); } };
  walk(root);
  const { spots, swaps } = PP.plan(rows);
  for (const [spot, list] of spots) {
    const [pos, k] = spot.split(":"), el = byB.get(k);
    if (!el) continue;
    let home = parent.get(el).children, at = home.indexOf(el) + (pos === "before" ? 0 : 1); // where the next photo goes
    for (const row of list) {
      const fig = PP.figure(row);
      if (!fig) continue;
      if (!PP.side(row)) { home.splice(at++, 0, { raw: fig }); continue; }
      const text = { tag: "div", start: PP.TEXT_OPEN, children: [], end: "</div>" };
      if (pos === "before") { // the part below the spot, with the text under it if it's a heading
        let end = at, last = null;
        do {
          while (end < home.length && !home[end].tag) end++;
          if (end >= home.length) break;
          last = home[end++];
        } while (PP.leadIn(last.tag, cls(last).join(" ")));
        text.children = home.splice(at, end - at);
        home.splice(at, 0, { tag: "div", start: PP.sideOpen(row), children: [{ raw: fig }, text], end: "</div>" });
        home = text.children; at = 0; // more photos at this spot go above the part, beside this one
      } else { // the part above the spot
        const from = Math.max(0, home.indexOf(el));
        text.children = home.splice(from, at - from);
        home.splice(from, 0, { tag: "div", start: PP.sideOpen(row), children: [text, { raw: fig }], end: "</div>" });
        at = from + 1;
      }
    }
  }
  for (const [k, row] of swaps) {
    const img = byI.get(k);
    if (!img) continue;
    const to = PP.swap(row);
    if (!to) { // hidden: the whole frame when the photo is all that's in it
      const box = parent.get(img), only = /^(figure|li)$/.test(box.tag) && box.children.filter(c => c.tag).length === 1 ? box : img;
      addAttrs(only, ` hidden data-pp-hid="${esc(row.id)}"`);
      continue;
    }
    const was = name => { const v = attr(img, name); return v === undefined ? undefined : decode(v); };
    const orig = { src: was("src"), alt: was("alt"), w: was("width"), h: was("height"), t: was("data-t-alt"), o: was("data-t-orig") };
    let a = img.attrs.replace(/\s(src|alt|width|height|data-t-alt|data-t-orig)="[^"]*"/g, "");
    a += ` src="${esc(to.src)}" alt="${esc(to.alt)}"${to.w && to.h ? ` width="${to.w}" height="${to.h}"` : ""} data-pp-swap="${esc(row.id)}" data-pp-orig="${esc(JSON.stringify(orig))}"`;
    img.start = img.start.replace(img.attrs, () => a);
    img.attrs = a;
  }
  return serialize(root);
}
