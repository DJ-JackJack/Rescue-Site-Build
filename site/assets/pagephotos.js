/* Photos added to the pages from the edit page (the page_photos table), photos already on a page that have been
   changed or hidden, and the framing of every photo on the site (where it's centered and how far it's zoomed in).
   The build (site/build.mjs, through site/photospots.mjs) puts the saved page photos into each page and site.js puts in
   anything saved since; they and the edit page all frame photos from here, so they match.
   A photo's address is an https link, or a photo that came with the site ("assets/photos/…"). Every word from the
   database is escaped. */
(function () {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safe = u => { try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password ? x.href : ""; } catch { return ""; } };
  // an https link as it is; a photo that came with the site, under the site's base path
  const src = (u, base = "/") => (/^assets\/photos\/[\w.-]+$/.test(u || "") ? base + u : safe(u));
  const LAYOUTS = ["full", "banner", "left", "right", "small", "row"];
  const pics = row => (Array.isArray(row.photos) ? row.photos : []).filter(p => p && src(p.url));
  const size = p => (p.w > 0 && p.h > 0 ? ` width="${Math.round(p.w)}" height="${Math.round(p.h)}"` : "");

  /* Framing: {x, y, z}. x and y (0–100) are the point of the photo that stays put, measured from its left and top
     edges, and z (1–4) is how far it's zoomed in. The photo covers its frame (object-fit: cover) with that point lined
     up at the same place in the frame, then is enlarged around it. The same numbers work for any shape of frame, so a
     photo framed for a square card looks right in a wide one too. What shows is clipped to the photo's own box, so
     nothing around it has to hide the rest; --ppr is that box's corner radius, where it has one. */
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const frame = f => {
    if (!f || typeof f !== "object") return null;
    const x = num(f.x, 0, 100, 50), y = num(f.y, 0, 100, 50), z = num(f.z, 1, 4, 1);
    return x === 50 && y === 50 && z === 1 ? null : { x, y, z };
  };
  const r2 = v => Math.round(v * 100) / 100;
  function frameStyle(f) {
    f = frame(f);
    if (!f) return {};
    const at = `${r2(f.x)}% ${r2(f.y)}%`, st = { objectPosition: at };
    if (f.z > 1) {
      const k = 1 - 1 / f.z;
      Object.assign(st, { transform: `scale(${r2(f.z)})`, transformOrigin: at,
        clipPath: `inset(${r2(f.y * k)}% ${r2((100 - f.x) * k)}% ${r2((100 - f.y) * k)}% ${r2(f.x * k)}% round calc(var(--ppr, 0px) / ${r2(f.z)}))` });
    }
    return st;
  }
  const frameCSS = f => Object.entries(frameStyle(f)).map(([k, v]) => `${k.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}:${v}`).join(";");

  // Shapes a full width, small or beside-the-text photo can be cut to (width ÷ height); "original" is the photo's own.
  const SHAPES = { square: 1, wide: 16 / 9, tall: 4 / 5 }, RATIOS = { square: "1/1", wide: "16/9", tall: "4/5" };
  const shapeCSS = row => (["full", "small", "left", "right"].includes(row.layout) && RATIOS[row.shape] ? `aspect-ratio:${RATIOS[row.shape]};object-fit:cover;` : "");
  const img = (p, style, base) => `<img src="${esc(src(p.url, base))}" alt="${esc(p.alt || "")}"${size(p)}${style ? ` style="${esc(style)}"` : ""} loading="lazy" decoding="async">`;

  // One spot's photo (or row of photos), or "" if there's nothing to show. A row's photos open larger when tapped.
  function figure(row, base) {
    const list = pics(row);
    if (!list.length || !LAYOUTS.includes(row.layout)) return "";
    const inner = row.layout === "row"
      ? `<ul>${list.map((p, i) => `<li><button type="button" data-pp-open="${i}">${img(p, frameCSS(p), base)}</button></li>`).join("")}</ul>`
      : img(list[0], shapeCSS(row) + frameCSS(list[0]), base);
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

  // A photo already on the page, changed: its new picture and framing (the same photo, reframed, is fine too), or
  // null to hide it. It keeps the shape of the one it replaces, so the page around it doesn't move.
  const swap = (row, base) => { const p = pics(row)[0]; return p ? { url: p.url, src: src(p.url, base), alt: String(p.alt || ""), frame: frame(p) } : null; };
  // the style for a changed photo: cut to the old one's shape when it had its own size (width and height), then framed
  const swapCSS = (to, w, h) => (w > 0 && h > 0 ? `aspect-ratio:${w}/${h};object-fit:cover;` : "") + frameCSS(to.frame);

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

  const api = { figure, swap, swapCSS, plan, stamp, safe, src, side, sideOpen, TEXT_OPEN, leadIn, frame, frameStyle, frameCSS, SHAPES };
  if (typeof module === "object" && module.exports) module.exports = api; else window.PagePhotos = api;
})();
