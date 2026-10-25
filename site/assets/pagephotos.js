/* Photos added to the pages from the edit page (the page_photos table), and photos already on a page that have
   been changed or hidden. The build (site/build.mjs, through site/photospots.mjs) puts the saved ones into each page,
   and site.js puts in anything saved since. Both write the same HTML from here, so an up-to-date page is left alone.
   Only https photo links are used, and every word from the database is escaped. */
(function () {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safe = u => { try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password ? x.href : ""; } catch { return ""; } };
  const LAYOUTS = ["full", "banner", "left", "right", "small", "row"];
  const pics = row => (Array.isArray(row.photos) ? row.photos : []).filter(p => p && safe(p.url));
  const size = p => (p.w > 0 && p.h > 0 ? ` width="${Math.round(p.w)}" height="${Math.round(p.h)}"` : "");
  const img = p => `<img src="${esc(safe(p.url))}" alt="${esc(p.alt || "")}"${size(p)} loading="lazy" decoding="async">`;

  // One spot's photo (or row of photos), or "" if there's nothing to show. A row's photos open larger when tapped.
  function figure(row) {
    const list = pics(row);
    if (!list.length || !LAYOUTS.includes(row.layout)) return "";
    const inner = row.layout === "row"
      ? `<ul>${list.map((p, i) => `<li><button type="button" data-pp-open="${i}">${img(p)}</button></li>`).join("")}</ul>`
      : img(list[0]);
    return `<figure class="pp pp-${row.layout}" data-pp="${esc(row.id)}">${inner}${row.caption ? `<figcaption>${esc(row.caption)}</figcaption>` : ""}</figure>`;
  }

  // A photo beside the text (layout "left" or "right") sits in two columns with the part of the page it's attached to:
  // the part just below its spot (with the text under it, when that part is a heading or a small label above one),
  // or for a spot at the end of a section or box, the part just above. On phones the two stack.
  const side = row => (row.layout === "left" || row.layout === "right");
  const sideOpen = row => `<div class="pp-side pp-side-${row.layout}" data-pp-side="${esc(row.id)}">`;
  const TEXT_OPEN = `<div class="pp-side-text">`;
  // whether a part of the page is a heading or small label, which goes beside the photo with the text under it
  const leadIn = (tag, cls) => /^h[1-4]$/i.test(tag) || /(^|\s)eyebrow(\s|$)/.test(cls || "");

  // A photo already on the page, changed: its new picture, or null to hide it.
  const swap = row => { const p = pics(row)[0]; return p ? { src: safe(p.url), alt: String(p.alt || ""), w: p.w > 0 ? Math.round(p.w) : 0, h: p.h > 0 ? Math.round(p.h) : 0 } : null; };

  // Rows (already in order) sorted out by where they go: spots → [rows], and photos-to-change → row.
  function plan(rows) {
    const spots = new Map(), swaps = new Map();
    for (const r of rows) {
      if (r.layout === "swap") { if (!swaps.has(r.spot)) swaps.set(r.spot, r); continue; }
      if (!spots.has(r.spot)) spots.set(r.spot, []);
      spots.get(r.spot).push(r);
    }
    return { spots, swaps };
  }

  // What's saved for a page, in short, so site.js can tell whether the built page already has it.
  const stamp = rows => rows.map(r => `${r.id}@${r.updated_at}`).sort().join(" ");

  const api = { figure, swap, plan, stamp, safe, side, sideOpen, TEXT_OPEN, leadIn };
  if (typeof module === "object" && module.exports) module.exports = api; else window.PagePhotos = api;
})();
