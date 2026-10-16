/* TheTerr0rTw!ns site script.
   - Menu, forms (to the write-only submit_message function) and the hanging photo wall.
   - Live content (goals, animals, rescues, Sniffari programs) read from Supabase with the public key,
     which can only see published rows. Everything from the database is escaped before it is shown,
     and only http(s) links are used.
   - Every live section has an honest fallback: nothing is invented when data is missing. */
(() => {
const S = window.SITE || {};
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const asDate = s => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")) : null);
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const monthYear = s => asDate(s)?.toLocaleDateString("en-US", { month: "short", year: "numeric" }) || "";

/* ---------- menu ---------- */
const menu = $("#menu"), menubtn = $(".menubtn");
if (menu && menubtn) {
  menubtn.addEventListener("click", () => { const o = menu.classList.toggle("open"); menubtn.setAttribute("aria-expanded", o); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("open")) { menu.classList.remove("open"); menubtn.setAttribute("aria-expanded", "false"); menubtn.focus(); }
  });
}

/* ---------- Supabase reads ---------- */
async function q(table, params) {
  const r = await fetch(`${S.supabaseUrl}/rest/v1/${table}?${params}`, { headers: { apikey: S.supabaseKey } });
  if (!r.ok) throw new Error(`${table}: ${r.status}`);
  return r.json();
}
const cache = {};
const once = (key, fn) => (cache[key] ??= fn());
const getGoals = () => once("goals", () => q("goals", "select=id,title,why,price_note,donate_url,status,featured,figures_updated_at,met_on,sort,partner:partners(name,slug),bars:goal_bars(label,target,current,sort)&order=sort.asc"));
const getAnimals = () => once("animals", () => q("animals", "select=id,name,species,status,featured_on,adopted_on,transport,note,listing_url,checked_on,photo_url,journey,created_at,partner:partners(name,slug)&order=featured_on.desc.nullslast,created_at.desc"));
const getPartners = () => once("partners", () => q("partners", "select=id,slug,name,kind,mission,website_url,adopt_url,donate_url,sort&order=sort.asc"));
const getSniffari = () => once("sniffari", () => q("sniffari_programs", "select=id,shelter_name,program_name,city,signup_url,facts,tags,checked_on,sort&order=sort.asc"));

function failed(el, what) {
  el.innerHTML = `<p class="empty">${h(what)} couldn't load right now. Please try again in a little while.</p>`;
}

/* ---------- shelter goals ---------- */
function goalHTML(g, { heading = "h3", showAllLink = false } = {}) {
  const partner = g.partner?.name || "the shelter";
  const bars = (g.bars || []).sort((a, b) => a.sort - b.sort);
  const reported = bars.some(b => b.current !== null && b.current !== undefined);
  const ago = g.figures_updated_at ? daysBetween(asDate(g.figures_updated_at), today()) : null;
  const stale = ago !== null && ago > 14;
  let progress;
  if (!bars.length) progress = "";
  else if (!reported || stale) {
    const goalText = bars.map(b => `${Number(b.target).toLocaleString()} ${h(b.label.toLowerCase())}`).join(" and ");
    progress = `<p class="empty">Goal: ${goalText}. ${stale ? "An update is coming" : "Progress figures are coming soon"} from ${h(partner)}.</p>`;
  } else {
    progress = bars.map(b => {
      const cur = Number(b.current || 0), tgt = Number(b.target), pct = Math.min(100, Math.round(cur / tgt * 100));
      return `<div class="bar"><div class="lab"><span>${h(b.label)}</span><span>${cur.toLocaleString()} of ${tgt.toLocaleString()}</span></div><div class="track" role="img" aria-label="${cur} of ${tgt} ${h(b.label)}"><div class="fill" style="width:${pct}%"></div></div></div>`;
    }).join("");
  }
  const when = g.status === "met" ? `Met ${h(monthYear(g.met_on))}` : ago === null ? "" : stale ? "" : `Updated ${ago === 0 ? "today" : ago === 1 ? "yesterday" : ago + " days ago"}`;
  const donate = safeUrl(g.donate_url);
  const give = g.status === "met" ? "" : donate
    ? `<a class="btn light" href="${h(donate)}" target="_blank" rel="noopener">Give on ${h(partner)}'s page <span class="ext" aria-hidden="true">↗</span></a>`
    : '<p class="note" style="margin-top:0">Donation link coming soon.</p>';
  return `<div class="goal feature">
    <p class="who">${showAllLink ? "Shelter goal · " : ""}${h(partner)}</p>
    <${heading}>${h(g.title)}</${heading}>
    ${g.why ? `<p class="why">${h(g.why)}</p>` : ""}
    ${g.price_note ? `<span class="price">${h(g.price_note)}</span>` : ""}
    ${progress}
    <div class="meta">${reported ? `<span>Figures from ${h(partner)}</span>` : ""}${when ? `<span>${when}</span>` : ""}</div>
    <div class="btns">${give}${showAllLink ? `<a class="btn onDark" href="${S.base}shelter-goals/">All shelter goals</a>` : ""}</div>
    ${g.status === "met" ? "" : `<p class="note">Your gift goes straight to ${h(partner)}. This site never handles money.</p>`}
  </div>`;
}
async function renderGoals(el) {
  const mode = el.dataset.goals;
  try {
    let goals = await getGoals();
    if (mode === "featured") goals = goals.filter(g => g.featured && g.status === "active").slice(0, 1);
    else if (mode === "active") goals = goals.filter(g => g.status === "active");
    else if (mode === "met") goals = goals.filter(g => g.status === "met");
    else if (mode.startsWith("partner:")) goals = goals.filter(g => g.partner?.slug === mode.slice(8) && g.status === "active");
    if (!goals.length) {
      const wrap = el.closest("[data-hide-empty]");
      if (wrap) { wrap.hidden = true; return; }
      el.innerHTML = `<p class="empty">No active goals right now.</p>`;
      return;
    }
    el.innerHTML = goals.map(g => goalHTML(g, { heading: el.dataset.heading || "h3", showAllLink: mode === "featured" })).join("");
  } catch { failed(el, "Shelter goals"); }
}

/* ---------- animals: counts, stat, walls, journey ---------- */
const EMOJI = { dog: "🐶", cat: "🐱", horse: "🐴", bird: "🐦", other: "🐾" };
const STATUS = { adopted: ["c-adopted", "Adopted"], placed: ["c-placed", "Placed"], sanctuary: ["c-sanct", "In sanctuary"], looking: ["c-wait", "Still looking"] };
const BG = ["g1", "g2", "g3", "g4", "g5", "g6"];
const daysToHome = a => (a.status === "adopted" && a.featured_on && a.adopted_on) ? daysBetween(asDate(a.featured_on), asDate(a.adopted_on)) : null;

function stats(animals) {
  // Every dog featured at least 90 days ago counts. "Home" means adopted. Transport runs don't count.
  const dogs = animals.filter(a => a.species === "dog" && !a.transport && a.featured_on);
  const cutoff = today() - 90 * DAY;
  const counted = dogs.filter(a => asDate(a.featured_on) <= cutoff);
  const fast = counted.filter(a => { const d = daysToHome(a); return d !== null && d <= 90; });
  const days = dogs.map(daysToHome).filter(d => d !== null).sort((a, b) => a - b);
  return { counted: counted.length, fast: fast.length, dogs: dogs.length, median: days.length ? days[Math.floor(days.length / 2)] : null };
}
const MIN_FOR_STAT = 5; // below this, show tae's own words, not a number

async function renderStats() {
  const blocks = $$("[data-statblock]");
  if (!blocks.length) return;
  let st = null;
  try { st = stats(await getAnimals()); } catch {}
  blocks.forEach(b => {
    const ready = st && st.counted >= MIN_FOR_STAT;
    $$("[data-when=ready]", b).forEach(x => x.hidden = !ready);
    $$("[data-when=waiting]", b).forEach(x => x.hidden = !!ready);
    if (!ready) return;
    $$("[data-stat]", b).forEach(x => {
      const k = x.dataset.stat;
      x.textContent = k === "ratio" ? `${st.fast} of ${st.counted}` : k === "median" ? (st.median === null ? "n/a" : `${st.median} days`) : k === "dogs" ? String(st.dogs) : x.textContent;
    });
  });
}

function petHTML(a, i) {
  const [cls, label] = STATUS[a.status] || STATUS.placed;
  const d = daysToHome(a);
  const sub = a.note || (d !== null ? `Home in ${d} days` : a.status === "looking" ? "Still looking" : "");
  const photo = safeUrl(a.photo_url);
  const pic = photo ? `<img src="${h(photo)}" alt="" loading="lazy">` : EMOJI[a.species] || "🐾";
  return `<li><button class="pet" type="button" data-id="${h(a.id)}"><span class="ph ${BG[i % 6]}" aria-hidden="true">${pic}</span><span class="bd"><b>${h(a.name)}</b><span class="chip ${cls}">${label}</span>${sub ? `<small>${h(sub)}</small>` : ""}</span></button></li>`;
}
function countsHTML(animals) {
  const c = s => animals.filter(a => a.status === s).length;
  return [["adopted", "adopted"], ["placed", "placed or released"], ["sanctuary", "in sanctuary"], ["looking", "still looking"]]
    .map(([s, l]) => `<div class="count"><b>${c(s)}</b><span>${l}</span></div>`).join("");
}
let ANIMALS = [];
async function renderAnimals() {
  const walls = $$("[data-wall]"), counts = $$("[data-counts]");
  if (!walls.length && !counts.length) return;
  try { ANIMALS = await getAnimals(); }
  catch { walls.forEach(w => failed(w, "The proof wall")); return; }
  counts.forEach(c => c.innerHTML = countsHTML(ANIMALS));
  walls.forEach(w => {
    const limit = Number(w.dataset.wall) || Infinity;
    const draw = filter => {
      const list = ANIMALS.filter(a => filter === "all" || a.status === filter).slice(0, limit);
      w.innerHTML = list.length ? list.map(petHTML).join("") : `<li class="empty">More animals are being added from tae's records.</li>`;
      const live = $(w.dataset.live || "#none"); if (live) live.textContent = `Showing ${list.length} animals`;
    };
    draw("all");
    const group = $(w.dataset.filters || "#none");
    if (group) $$("button", group).forEach(b => b.addEventListener("click", () => {
      $$("button", group).forEach(x => x.setAttribute("aria-pressed", x === b));
      draw(b.dataset.f);
    }));
  });
}
const dlg = $("#journey");
document.addEventListener("click", e => {
  const b = e.target.closest(".pet"); if (!b || !dlg) return;
  const a = ANIMALS.find(x => x.id === b.dataset.id); if (!a) return;
  $("#jname").textContent = a.name;
  const [cls, label] = STATUS[a.status] || STATUS.placed;
  const chip = $("#jchip"); chip.className = "chip " + cls; chip.textContent = label;
  const pic = $("#jpic"); pic.className = "ph " + BG[0]; pic.textContent = EMOJI[a.species] || "🐾";
  let steps = Array.isArray(a.journey) ? a.journey.filter(s => s && s.label) : [];
  if (!steps.length) {
    if (a.featured_on) steps.push({ label: "Featured", detail: `Video posted ${monthYear(a.featured_on)}` });
    const d = daysToHome(a);
    if (d !== null) steps.push({ label: "Adopted", detail: `Home ${d} days after the video` });
    else if (a.status !== "adopted") steps.push({ label, detail: a.note || "" });
  }
  $("#jsteps").innerHTML = steps.length
    ? steps.map(s => `<li><b>${h(s.label)}</b><span>${h([s.detail, s.date ? monthYear(s.date) : ""].filter(Boolean).join(" · "))}</span></li>`).join("")
    : `<li><b>Their story is being written up</b><span>Check back soon.</span></li>`;
  dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
});
if (dlg) {
  $(".jclose", dlg).addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
}

/* ---------- rescues and their featured dogs ---------- */
async function renderRescues(el) {
  try {
    const [partners, animals] = await Promise.all([getPartners(), getAnimals()]);
    const list = partners.filter(p => p.kind !== "sanctuary");
    if (!list.length) {
      el.innerHTML = `<p class="empty">More rescues are on the way. Each one appears here once they've said yes to being featured.</p>`;
      return;
    }
    el.innerHTML = list.map(p => {
      // dogs still looking come first, then the most recent adoptions
      const dogs = animals.filter(a => a.partner?.slug === p.slug && (a.status === "looking" || a.status === "adopted"))
        .sort((x, y) => (x.status === "looking" ? 0 : 1) - (y.status === "looking" ? 0 : 1)).slice(0, 6);
      const adopt = safeUrl(p.adopt_url), donate = safeUrl(p.donate_url);
      return `<div class="rescue"><div class="top"><div class="logo" aria-hidden="true">${h(p.name.slice(0, 1))}</div><div><h3>${h(p.name)}</h3></div></div>
        <div class="bd">${p.mission ? `<p>${h(p.mission)}</p>` : ""}
        ${dogs.length ? `<div class="minis">${dogs.map((a, i) => {
          const live = safeUrl(a.listing_url), d = daysToHome(a);
          return `<div class="mini"><div class="ph ${BG[i % 6]}" aria-hidden="true">${EMOJI[a.species] || "🐾"}</div><b>${h(a.name)}</b><span class="chip ${STATUS[a.status][0]}"${a.status === "looking" ? ' style="background:var(--wash)"' : ""}>${STATUS[a.status][1]}</span>
            ${a.status === "looking" && a.checked_on ? `<small>Checked ${h(new Date(a.checked_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</small>` : d !== null ? `<small>Home in ${d} days</small>` : ""}
            ${a.status === "looking" && live ? `<a href="${h(live)}" target="_blank" rel="noopener">Live listing ↗</a>` : ""}</div>`;
        }).join("")}</div>` : ""}
        <div class="btns">${adopt ? `<a class="btn ocean" href="${h(adopt)}" target="_blank" rel="noopener">Adopt or foster from ${h(p.name)} <span class="ext" aria-hidden="true">↗</span></a>` : ""}${donate ? `<a class="btn ghost" href="${h(donate)}" target="_blank" rel="noopener">Donate on their page <span class="ext" aria-hidden="true">↗</span></a>` : ""}</div>
        </div></div>`;
    }).join("");
  } catch { failed(el, "Rescues"); }
}

/* horses at a partner (Willow Woods page) */
async function renderHorses(el) {
  try {
    const horses = (await getAnimals()).filter(a => a.partner?.slug === el.dataset.horses && a.species === "horse");
    el.innerHTML = horses.length
      ? `<ul class="wall">${horses.map(petHTML).join("")}</ul>`
      : `<p class="empty">Horse histories are being added.</p>`;
  } catch { failed(el, "The horses"); }
}

/* ---------- Sniffari programs ---------- */
async function renderSniffari(el) {
  const group = $(el.dataset.filters || "#none"), live = $(el.dataset.live || "#none");
  let programs;
  try { programs = await getSniffari(); } catch { failed(el, "Day-out programs"); return; }
  const draw = f => {
    const list = programs.filter(p => f === "all" || (p.tags || []).includes(f));
    el.innerHTML = list.length ? list.map(p => {
      const url = safeUrl(p.signup_url);
      return `<article class="sn"><h3>${h(p.shelter_name)}</h3>${p.program_name || p.city ? `<span class="prog">${h([p.program_name, p.city].filter(Boolean).join(" · "))}</span>` : ""}
        ${(p.facts || []).length ? `<div class="facts">${p.facts.map(t => `<span>${h(t)}</span>`).join("")}</div>` : ""}
        ${p.checked_on ? `<p class="small">Details checked ${h(new Date(p.checked_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</p>` : ""}
        ${url ? `<div class="btns"><a class="btn ocean" href="${h(url)}" target="_blank" rel="noopener">Sign up on their page <span class="ext" aria-hidden="true">↗</span></a></div>` : ""}</article>`;
    }).join("") : `<p class="empty">${programs.length ? "No programs match that yet." : "The first programs are being confirmed with the shelters. Run one? Use the form below."}</p>`;
    if (live) live.textContent = `Showing ${list.length} programs`;
  };
  draw("all");
  if (group) {
    if (!programs.length) group.hidden = true;
    $$("button", group).forEach(b => b.addEventListener("click", () => { $$("button", group).forEach(x => x.setAttribute("aria-pressed", x === b)); draw(b.dataset.s); }));
  }
}

/* ---------- forms: everything goes to the write-only inbox ---------- */
const TOPIC = { partner: "partner", sniffari: "sniffari" };
$$("form[data-form]").forEach(form => form.addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $(".formmsg", form), btn = $("button[type=submit]", form);
  const fd = new FormData(form);
  if (fd.get("website")) { form.reset(); msg.className = "formmsg ok"; msg.textContent = "Thanks! Your message is on its way."; return; } // bot trap
  const topic = TOPIC[form.dataset.form] || fd.get("topic") || "other";
  const details = {};
  for (const [k, v] of fd.entries()) if (!["topic", "name", "email", "body", "website"].includes(k) && v) details[k] = details[k] ? [].concat(details[k], v) : v;
  btn.disabled = true; msg.className = "formmsg"; msg.textContent = "Sending…";
  try {
    const r = await fetch(`${S.supabaseUrl}/rest/v1/rpc/submit_message`, {
      method: "POST", headers: { apikey: S.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_topic: topic, p_email: fd.get("email"), p_name: fd.get("name") || null, p_body: fd.get("body") || null, p_details: details, p_page: location.pathname.slice(0, 200) }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(/slow down/.test(t) ? "slow" : /bad email/.test(t) ? "email" : "fail");
    }
    form.reset();
    msg.className = "formmsg ok";
    msg.innerHTML = topic === "help"
      ? `Thanks, tae will see this. While you wait, the <a href="${S.base}help/">help page</a> has local resources sorted by need.`
      : "Thanks! Your message reached tae. Replies can take a week or two.";
  } catch (err) {
    msg.className = "formmsg err";
    msg.textContent = err.message === "slow" ? "That's a lot of messages from this email in the last hour. Please try again later."
      : err.message === "email" ? "That email address doesn't look right. Please check it."
      : "Couldn't send right now. Please try again, or message tae on YouTube or TikTok.";
  } finally { btn.disabled = false; }
}));

/* ---------- hanging photo wall (homepage navigation) ---------- */
/* Each layout lists which photo (by its place in the HTML list) hangs on each strand, top to bottom.
   Rows read left to right in list order, so the reading order matches what's on screen. */
const HW_NARROW = { n: 3, map: [[0, 3, 6], [1, 4, 7], [2, 5, 8]],
  rot: [[-4, 3.5, -2], [5, -2.5, 4], [-2.5, 4.5, -3.5]], drop: [[0.14, 1.30, 2.46], [0.34, 1.50, 2.66], [0.04, 1.20, 2.36]] };
const HW_WIDE = { n: 5, map: [[0, 5], [1, 6], [2, 7], [3, 8], [4]],
  rot: [[-4, 3], [5, -2.5], [-2.5, 4.5], [3.5, -4], [-3]], drop: [[0.14, 1.36], [0.40, 1.62], [0.22, 1.44], [0.48, 1.70], [0.08]] };
const hw = $("#hangwall");
if (hw) {
  const hwsvg = $("#hwsvg"), hangs = $$("#hwlist .hang"), NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  hangs.forEach(li => {
    const a = $(".snap", li), label = a.textContent.trim(), d = li.dataset;
    const img = d.img ? `<img src="${h(S.base + d.img)}" alt="" onerror="this.remove()">` : "";
    a.innerHTML = `<span class="pic ${h(d.g)}" aria-hidden="true">${d.e}${img}</span><span class="lab">${h(label)}</span>`;
    li.insertAdjacentHTML("afterbegin", '<span class="clip" aria-hidden="true"></span>');
  });
  let lastW = 0;
  const layout = () => {
    const W = hw.clientWidth; if (!W) return; lastW = W;
    const L = W >= 760 ? HW_WIDE : HW_NARROW, n = L.n, colW = W / n;
    const pw = Math.min(colW * (n === 3 ? 0.72 : 0.74), n === 5 ? 132 : 150), cap = 48, ph = pw * 1.25 + cap + 5;
    const y0 = 16, sag = Math.min(W * 0.05, 44), cy = x => { const t = x / W; return y0 + 4 * sag * t * (1 - t); };
    hwsvg.innerHTML = "";
    let maxY = 0; const strands = [], pos = [];
    for (let i = 0; i < n; i++) {
      const x = colW * (i + 0.5), top = cy(x), tops = L.drop[i].map(d => top + d * ph + 10);
      strands.push({ x, top, end: tops[tops.length - 1] + ph * 0.5 });
      L.map[i].forEach((idx, j) => pos[idx] = { x, top: tops[j], r: L.rot[i][j], strand: i, j });
      maxY = Math.max(maxY, tops[tops.length - 1] + ph + pw * 0.12);
    }
    const H = maxY + 8; hw.style.height = H + "px"; hwsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const defs = svgEl("defs", {});
    defs.innerHTML =
      '<pattern id="twist" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="6" height="6" fill="#D8C6A8"/><rect width="2.6" height="6" fill="#C2AB88"/><rect x="2.6" width=".7" height="6" fill="#EADCC3"/></pattern>' +
      '<linearGradient id="ropeShade" x1="0" x2="1"><stop offset="0" stop-color="#5A4630" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#5A4630" stop-opacity=".32"/></linearGradient>' +
      '<radialGradient id="wood" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#F1E1C6"/><stop offset=".55" stop-color="#D9BE96"/><stop offset="1" stop-color="#B38F64"/></radialGradient>' +
      '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-color="#352262" flood-opacity=".28"/></filter>' +
      '<radialGradient id="glow"><stop offset="0" stop-color="#FFFDF2"/><stop offset=".35" stop-color="#FFF1B8" stop-opacity=".95"/><stop offset="1" stop-color="#FFE680" stop-opacity="0"/></radialGradient>';
    hwsvg.appendChild(defs);
    strands.forEach(s => {
      const rw = 3.4;
      hwsvg.appendChild(svgEl("rect", { x: s.x - rw / 2, y: s.top, width: rw, height: s.end - s.top, fill: "url(#twist)", filter: "url(#soft)" }));
      hwsvg.appendChild(svgEl("rect", { x: s.x - rw / 2, y: s.top, width: rw, height: s.end - s.top, fill: "url(#ropeShade)" }));
      hwsvg.appendChild(svgEl("ellipse", { cx: s.x, cy: s.top + 1, rx: 3.2, ry: 2.4, fill: "#C9B190" }));
    });
    hwsvg.appendChild(svgEl("path", { d: `M0 ${y0} Q ${W / 2} ${y0 + 2 * sag} ${W} ${y0}`, stroke: "url(#twist)", "stroke-width": 2.6, fill: "none", filter: "url(#soft)" }));
    const r = Math.max(4, Math.min(6.2, W / 90)), beads = svgEl("g", { filter: "url(#soft)" });
    for (let x = r + 6; x < W - r - 6; x += r * 2.12) beads.appendChild(svgEl("circle", { cx: x, cy: cy(x), r, fill: "url(#wood)" }));
    hwsvg.appendChild(beads);
    let d = ""; const pts = [];
    for (let x = 0; x <= W; x += 4) { const y = y0 + sag + ph * 0.62 + Math.sin(x / W * Math.PI * 2.2 + 0.6) * ph * 0.42 + x / W * ph * 0.35; d += (x ? "L" : "M") + x + " " + y.toFixed(1); pts.push([x, y]); }
    hwsvg.appendChild(svgEl("path", { d, stroke: "#CDB89A", "stroke-width": 1, fill: "none", opacity: .8 }));
    const step = Math.max(26, W / 14);
    pts.filter((p, k) => k % Math.round(step / 4) === 0).forEach((p, k) => {
      const g = svgEl("circle", { cx: p[0], cy: p[1], r: Math.max(9, pw * 0.09), fill: "url(#glow)", class: "light" });
      g.style.setProperty("--t", (1.1 + (k * 0.29) % 0.5).toFixed(2) + "s"); hwsvg.appendChild(g);
    });
    hangs.forEach((li, idx) => {
      const p = pos[idx]; if (!p) return; li.dataset.strand = p.strand;
      li.style.cssText = `left:${p.x - pw / 2 - 5}px;top:${p.top}px;width:${pw + 10}px;--r:${p.r}deg;--d:${(2.0 + ((p.strand * 3 + p.j * 5) % 4) * 0.15).toFixed(2)}s;animation-delay:-${((p.strand + p.j) * 0.4).toFixed(1)}s`;
      $(".lab", li).style.minHeight = cap + "px";
    });
  };
  hw.addEventListener("click", e => {
    const a = e.target.closest(".snap"); if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new-tab clicks work normally
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    const me = a.closest(".hang"), strand = me.dataset.strand;
    hangs.forEach(li => {
      if (li.dataset.strand !== strand) return;
      const self = li === me;
      li.classList.remove("swing"); void li.offsetWidth;
      li.style.setProperty("--amp", (self ? 16 : 6) + "deg");
      li.style.setProperty("--sd", (self ? 0.9 : 1.0) + "s");
      li.style.animationDelay = self ? "0s" : "0.06s";
      li.classList.add("swing");
    });
    setTimeout(() => { location.href = a.href; }, 320);
  });
  // coming back with the browser's Back button: clear the finished swing
  addEventListener("pageshow", () => hangs.forEach(li => li.classList.remove("swing")));
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (hw.clientWidth !== lastW) layout(); }, 120); });
  layout();
}

/* ---------- start ---------- */
$$("[data-goals]").forEach(renderGoals);
renderStats();
renderAnimals();
$$("[data-rescues]").forEach(renderRescues);
$$("[data-horses]").forEach(renderHorses);
$$("[data-sniffari]").forEach(renderSniffari);
})();
