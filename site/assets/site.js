/* TheTerr0rTw!ns site script.
   - Menu, forms (to the write-only submit_message function) and the hanging photo wall.
   - Live content (goals, animals, rescues, Sniffari programs) read from Supabase with the public key,
     which can only see published rows. Everything from the database is escaped before it is shown,
     and only http(s) links are used.
   - Every live section has an honest fallback: nothing is invented when data is missing.
   - Wording saved on the edit page is put in as the page loads (see "wording" below). */
(() => {
const S = window.SITE || {};
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
// Photos can be full links or paths inside the site, like "assets/photos/dog-zazu.jpg".
const photoUrl = u => { try { return u ? safeUrl(new URL(u, new URL(S.base || "/", location.href)).href) : ""; } catch { return ""; } };
// A photo that fails to load removes itself, so the emoji underneath shows instead.
const photoTag = (u, cls = "") => { const p = photoUrl(u); return p ? `<img${cls ? ` class="${cls}"` : ""} src="${h(p)}" alt="" loading="lazy" onerror="this.remove()">` : ""; };
const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const asDate = s => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")) : null);
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const monthYear = s => asDate(s)?.toLocaleDateString("en-US", { month: "short", year: "numeric" }) || "";
const fullDate = s => asDate(s)?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) || "";

// Phrases this script writes itself (labels, empty lists, form replies). Each can be changed on the edit page
// (Page wording → Messages and labels); {names} in curly brackets are filled in here. Saved versions come built
// into the page (S.t), and anything saved since arrives with the rest of the wording below.
const PHRASES = { ...(S.t || {}) };
const t = (key, text, vars = {}) => (PHRASES[key] || text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/* ---------- menu ---------- */
const menu = $("#menu"), menubtn = $(".menubtn");
if (menu && menubtn) {
  menubtn.addEventListener("click", () => {
    const o = menu.classList.toggle("open"); menubtn.setAttribute("aria-expanded", o);
    if (o) menu.style.maxHeight = Math.max(200, innerHeight - menu.getBoundingClientRect().top) + "px"; // the space left below it, so the last link can always be reached
  });
  const close = () => { menu.classList.remove("open"); menubtn.setAttribute("aria-expanded", "false"); };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("open")) { close(); menubtn.focus(); }
  });
  // close it when a click or keyboard focus moves somewhere else on the page
  document.addEventListener("click", e => { if (menu.classList.contains("open") && !menu.contains(e.target) && !menubtn.contains(e.target)) close(); });
  menu.addEventListener("focusout", e => { if (e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== menubtn) close(); });
}

/* ---------- Supabase reads ---------- */
async function q(table, params) {
  const r = await fetch(`${S.supabaseUrl}/rest/v1/${table}?${params}`, { headers: { apikey: S.supabaseKey } });
  if (!r.ok) throw new Error(`${table}: ${r.status}`);
  return r.json();
}
const cache = {};
const once = (key, fn) => (cache[key] ??= fn());

/* ---------- wording saved on the edit page ----------
   Every text on the page has a key (data-t, data-t-alt, data-t-ph, data-text: see site/wording.mjs). The page is
   built with the wording saved at the time; anything saved or undone since is put right here. Saved text is
   plain: in a block, a blank line starts a new paragraph and a line starting with "## " is a heading. */
const blockHTML = (s, inline) => inline
  ? h(s.trim()).replace(/\n+/g, "<br>")
  : s.trim().split(/\n\s*\n/).map(b => b.startsWith("## ") ? `<h2 class="h2">${h(b.slice(3).trim())}</h2>` : `<p>${h(b.trim()).replace(/\n/g, "<br>")}</p>`).join("");
const wordingLoaded = q("site_text", "select=key,body").then(rows => {
  const by = {};
  for (const r of rows) if (r.body && r.body.trim()) by[r.key] = r.body.trim();
  $$("[data-text]").forEach(el => {
    const b = by[el.dataset.text] ?? el.dataset.textOrig; // a change, or the original back if it was undone
    if (b !== undefined && el.innerHTML !== blockHTML(b, el.tagName === "P")) el.innerHTML = blockHTML(b, el.tagName === "P");
  });
  $$("[data-t]").forEach(el => {
    const b = by[el.dataset.t] ?? el.dataset.tOrig;
    if (b !== undefined && !el.children.length && el.textContent.trim() !== b) el.textContent = b; // never over live content
  });
  $$("[data-t-alt]").forEach(el => { const b = by[el.dataset.tAlt] ?? el.dataset.tOrig; if (b !== undefined) el.alt = b; });
  $$("[data-t-ph]").forEach(el => { const b = by[el.dataset.tPh] ?? el.dataset.tOrig; if (b !== undefined) el.placeholder = b; });
  const title = by[`p.${S.scope}.title`] ?? S.titleOrig;
  if (title) document.title = title;
  for (const k of Object.keys(PHRASES)) if (!(k in by)) delete PHRASES[k];
  for (const k in by) if (k.startsWith("js.")) PHRASES[k] = by[k];
}).catch(() => {});
// The live sections wait for it (at most a moment), so their phrases are the latest too.
const wordingReady = Promise.race([wordingLoaded, new Promise(ok => setTimeout(ok, 1500))]);
const getGoals = () => once("goals", () => q("goals", "select=id,title,why,price_note,donate_url,photo_url,status,featured,figures_updated_at,met_on,sort,partner:partners(name,slug),bars:goal_bars(label,target,current,sort)&order=sort.asc"));
const getAnimals = () => once("animals", () => q("animals", "select=id,name,species,status,herd,sort,featured_on,adopted_on,transport,note,story,updates,section,listing_url,checked_on,photo_url,journey,created_at,partner:partners(name,slug)&order=featured_on.desc.nullslast,created_at.desc"));
const getPartners = () => once("partners", () => q("partners", "select=id,slug,name,kind,mission,website_url,adopt_url,donate_url,sort&order=sort.asc"));
const getSniffari = () => once("sniffari", () => q("sniffari_programs", "select=id,shelter_name,program_name,city,address,signup_url,facts,tags,checked_on,sort&order=sort.asc"));

function failed(el, message) {
  el.innerHTML = `<p class="empty">${h(message)}</p>`;
}

/* ---------- shelter goals ---------- */
function goalHTML(g, { heading = "h3", showAllLink = false } = {}) {
  const partner = g.partner?.name || t("js.goal.shelter", "the shelter");
  const bars = (g.bars || []).sort((a, b) => a.sort - b.sort);
  const reported = bars.some(b => b.current !== null && b.current !== undefined);
  const ago = g.figures_updated_at ? daysBetween(asDate(g.figures_updated_at), today()) : null;
  const stale = ago !== null && ago > 14;
  let progress;
  if (!bars.length) progress = "";
  else if (!reported || stale) {
    const goal = bars.map(b => `${Number(b.target).toLocaleString()} ${b.label.toLowerCase()}`).join(" and ");
    progress = `<p class="empty">${h(stale ? t("js.goal.update-coming", "Goal: {goal}. An update is coming from {shelter}.", { goal, shelter: partner })
      : t("js.goal.figures-coming", "Goal: {goal}. Progress figures are coming soon from {shelter}.", { goal, shelter: partner }))}</p>`;
  } else {
    progress = bars.map(b => {
      const cur = Number(b.current || 0), tgt = Number(b.target), pct = Math.min(100, Math.round(cur / tgt * 100));
      const of = t("js.goal.progress", "{now} of {goal}", { now: cur.toLocaleString(), goal: tgt.toLocaleString() });
      return `<div class="bar"><div class="lab"><span>${h(b.label)}</span><span>${h(of)}</span></div><div class="track" role="img" aria-label="${h(of)} ${h(b.label)}"><div class="fill" style="width:${pct}%"></div></div></div>`;
    }).join("");
  }
  const when = g.status === "met" ? t("js.goal.met", "Met {month}", { month: monthYear(g.met_on) })
    : ago === null || stale ? "" : ago === 0 ? t("js.goal.updated-today", "Updated today") : ago === 1 ? t("js.goal.updated-yesterday", "Updated yesterday")
    : t("js.goal.updated-days", "Updated {n} days ago", { n: ago });
  const donate = safeUrl(g.donate_url);
  const give = g.status === "met" ? "" : donate
    ? `<a class="btn light" href="${h(donate)}" target="_blank" rel="noopener">${h(t("js.goal.give", "Give on {shelter}'s page", { shelter: partner }))} <span class="ext" aria-hidden="true">↗</span></a>`
    : `<p class="note" style="margin-top:0">${h(t("js.goal.no-link", "Donation link coming soon."))}</p>`;
  const pic = photoTag(g.photo_url);
  return `<div class="goal feature">
    ${pic ? `<span class="gpic" aria-hidden="true">${pic}</span>` : ""}
    <p class="who">${showAllLink ? h(t("js.goal.label", "Shelter goal")) + " · " : ""}${h(partner)}</p>
    <${heading}>${h(g.title)}</${heading}>
    ${g.why ? `<p class="why">${h(g.why)}</p>` : ""}
    ${g.price_note ? `<span class="price">${h(g.price_note)}</span>` : ""}
    ${progress}
    <div class="meta">${reported ? `<span>${h(t("js.goal.figures-from", "Figures from {shelter}", { shelter: partner }))}</span>` : ""}${when ? `<span>${h(when)}</span>` : ""}</div>
    <div class="btns">${give}${showAllLink ? `<a class="btn onDark" href="${S.base}shelter-goals/">${h(t("js.goal.all", "All shelter goals"))}</a>` : ""}</div>
    ${g.status === "met" ? "" : `<p class="note">${h(t("js.goal.straight-to", "Your gift goes straight to {shelter}. This site never handles money.", { shelter: partner }))}</p>`}
  </div>`;
}
async function renderGoals(el) {
  const mode = el.dataset.goals;
  try {
    let goals = await getGoals();
    await wordingReady;
    if (mode === "featured") goals = goals.filter(g => g.featured && g.status === "active").slice(0, 1);
    else if (mode === "active") goals = goals.filter(g => g.status === "active");
    else if (mode === "met") goals = goals.filter(g => g.status === "met");
    else if (mode.startsWith("partner:")) goals = goals.filter(g => g.partner?.slug === mode.slice(8) && g.status === "active");
    if (!goals.length) {
      const wrap = el.closest("[data-hide-empty]");
      if (wrap) { wrap.hidden = true; return; }
      el.innerHTML = el.hasAttribute("data-empty") ? "" : `<p class="empty">${h(t("js.goal.none", "No active goals right now."))}</p>`;
      return;
    }
    el.innerHTML = goals.map(g => goalHTML(g, { heading: el.dataset.heading || "h3", showAllLink: mode === "featured" })).join("");
  } catch { failed(el, t("js.failed.goals", "Shelter goals couldn't load right now. Please try again in a little while.")); }
}

/* ---------- animals: counts, stat, walls, journey ---------- */
const EMOJI = { dog: "🐶", cat: "🐱", horse: "🐴", bird: "🐦", other: "🐾" };
const STATUS = { adopted: "c-adopted", placed: "c-placed", foster: "c-foster", sanctuary: "c-sanct", looking: "c-wait" };
const statusLabel = s => ({
  adopted: t("js.status.adopted", "Adopted"), foster: t("js.status.foster", "In foster"), sanctuary: t("js.status.sanctuary", "In sanctuary"),
  looking: t("js.status.looking", "Still looking"),
}[s] || t("js.status.placed", "Placed"));
const WHO = S.ownerFirst || "she";
const BG = ["g1", "g2", "g3", "g4", "g5", "g6"];
const daysToHome = a => (a.status === "adopted" && a.featured_on && a.adopted_on) ? daysBetween(asDate(a.featured_on), asDate(a.adopted_on)) : null;
// Animals We've Helped (Happy Tails, the counts and the adoption stat) or the Animal Story Spotlight page
const helped = a => (a.section || "helped") === "helped";

function stats(animals) {
  // Every dog featured at least 90 days ago counts. "Home" means adopted. Transport runs don't count.
  const dogs = animals.filter(a => helped(a) && a.species === "dog" && !a.transport && a.featured_on);
  const cutoff = today() - 90 * DAY;
  const counted = dogs.filter(a => asDate(a.featured_on) <= cutoff);
  const fast = counted.filter(a => { const d = daysToHome(a); return d !== null && d <= 90; });
  const days = counted.map(daysToHome).filter(d => d !== null).sort((a, b) => a - b); // same dogs as the ratio
  return { counted: counted.length, fast: fast.length, dogs: dogs.length, median: days.length ? days[Math.floor(days.length / 2)] : null };
}
const MIN_FOR_STAT = 5; // below this, show her own words, not a number

async function renderStats() {
  const blocks = $$("[data-statblock]");
  if (!blocks.length) return;
  let st = null;
  try { st = stats(await getAnimals()); } catch {}
  await wordingReady;
  blocks.forEach(b => {
    const ready = st && st.counted >= MIN_FOR_STAT;
    $$("[data-when=ready]", b).forEach(x => x.hidden = !ready);
    $$("[data-when=waiting]", b).forEach(x => x.hidden = !!ready);
    if (!ready) return;
    $$("[data-stat]", b).forEach(x => {
      const k = x.dataset.stat;
      x.textContent = k === "ratio" ? t("js.stat.ratio", "{fast} of {counted}", { fast: st.fast, counted: st.counted })
        : k === "median" ? (st.median === null ? t("js.stat.none", "n/a") : t("js.stat.days", "{n} days", { n: st.median })) : k === "dogs" ? String(st.dogs) : x.textContent;
    });
  });
}

function petHTML(a, i) {
  const cls = STATUS[a.status] || STATUS.placed, label = statusLabel(a.status);
  const d = daysToHome(a);
  const sub = a.note || (d !== null ? t("js.animal.home-in", "Home in {n} days", { n: d }) : "");
  const pic = (EMOJI[a.species] || "🐾") + photoTag(a.photo_url);
  return `<li><button class="pet" type="button" aria-haspopup="dialog" data-id="${h(a.id)}"><span class="ph ${BG[i % 6]}" aria-hidden="true">${pic}</span><span class="bd"><b>${h(a.name)}</b><span class="chip ${cls}">${h(label)}</span>${sub ? `<small>${h(sub)}</small>` : ""}</span></button></li>`;
}
function countsHTML(animals) {
  const c = s => animals.filter(a => a.status === s).length;
  return [["adopted", t("js.count.adopted", "adopted")], ["foster", t("js.count.foster", "in foster")], ["sanctuary", t("js.count.sanctuary", "in sanctuary")],
    ["placed", t("js.count.placed", "placed or released")], ["looking", t("js.count.looking", "still looking")]]
    .filter(([s]) => ["adopted", "foster", "looking"].includes(s) || c(s))
    .map(([s, l]) => `<div class="count"><b>${c(s)}</b><span>${h(l)}</span></div>`).join("");
}
let ANIMALS = []; // Animals We've Helped
async function renderAnimals() {
  const walls = $$("[data-wall]"), counts = $$("[data-counts]");
  if (!walls.length && !counts.length) return;
  try { ANIMALS = (await getAnimals()).filter(helped); }
  catch { await wordingReady; walls.forEach(w => failed(w, t("js.failed.animals", "Happy Tails couldn't load right now. Please try again in a little while."))); return; }
  await wordingReady;
  counts.forEach(c => c.innerHTML = countsHTML(ANIMALS));
  walls.forEach(w => {
    const limit = Number(w.dataset.wall) || Infinity;
    const draw = filter => {
      const list = ANIMALS.filter(a => filter === "all" || a.status === filter).slice(0, limit);
      w.innerHTML = list.length ? list.map(petHTML).join("") : `<li class="empty">${h(t("js.animal.none", "More animals are being added."))}</li>`;
      const live = $(w.dataset.live || "#none");
      if (live) live.textContent = list.length === 1 ? t("js.animal.showing-one", "Showing 1 animal") : t("js.animal.showing", "Showing {n} animals", { n: list.length });
    };
    draw("all");
    const group = $(w.dataset.filters || "#none");
    if (group) $$("button[data-f]", group).forEach(b => { if (b.dataset.f !== "all") b.hidden = !ANIMALS.some(a => a.status === b.dataset.f); });
    if (group) $$("button", group).forEach(b => b.addEventListener("click", () => {
      $$("button", group).forEach(x => x.setAttribute("aria-pressed", x === b));
      draw(b.dataset.f);
    }));
  });
}
const dlg = $("#journey");
document.addEventListener("click", async e => {
  const b = e.target.closest(".pet"); if (!b || !dlg) return;
  const a = (await getAnimals().catch(() => [])).find(x => x.id === b.dataset.id); if (!a) return;
  $("#jname").textContent = a.name;
  const cls = STATUS[a.status] || STATUS.placed, label = statusLabel(a.status);
  const chip = $("#jchip"); chip.className = "chip " + cls; chip.textContent = label;
  const pic = $("#jpic"); pic.className = "ph " + BG[0]; pic.innerHTML = (EMOJI[a.species] || "🐾") + photoTag(a.photo_url);
  let steps = Array.isArray(a.journey) ? a.journey.filter(s => s && s.label) : [];
  if (!steps.length) {
    if (a.featured_on) steps.push({ label: t("js.journey.featured", "Featured"), detail: t("js.journey.video", "Video posted {month}", { month: monthYear(a.featured_on) }) });
    const d = daysToHome(a);
    if (d !== null) steps.push({ label: t("js.journey.adopted", "Adopted"), detail: t("js.journey.home-after", "Home {n} days after the video", { n: d }) });
    else {
      const name = a.partner?.name;
      const via = !name ? "" : a.status === "looking" || a.status === "foster" ? t("js.journey.with", "With {name}", { name })
        : a.status === "sanctuary" ? t("js.journey.at", "At {name}", { name }) : t("js.journey.through", "Through {name}", { name });
      steps.push({ label, detail: [a.note, via].filter(Boolean).join(" · ") });
    }
  }
  // her story, the steps of their journey, then dated updates and notes, newest first
  const story = String(a.story || "").trim(), notes = (Array.isArray(a.updates) ? a.updates : []).filter(n => n && n.text)
    .sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  $("#jstory").innerHTML = story ? blockHTML(story) : "";
  $("#jstory").hidden = !story;
  $("#jsteps-h").hidden = !(story || notes.length); // a heading only when there's more than the steps
  $("#jsteps").innerHTML = steps.length
    ? steps.map(s => `<li><b>${h(s.label)}${s.date ? ` <time datetime="${h(s.date)}">${h(monthYear(s.date))}</time>` : ""}</b>${s.detail ? `<span>${h(s.detail)}</span>` : ""}</li>`).join("")
    : `<li><b>${h(t("js.journey.soon-title", "Their story is being written up"))}</b><span>${h(t("js.journey.soon", "Check back soon."))}</span></li>`;
  $("#jnotes").innerHTML = notes.map(n => `<li>${n.date ? `<time datetime="${h(n.date)}">${h(fullDate(n.date))}</time>` : ""}<p>${h(String(n.text).trim())}</p></li>`).join("");
  $("#jnotes-wrap").hidden = !notes.length;
  $(".jbody", dlg).scrollTop = 0;
  dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
});
if (dlg) {
  $(".jclose", dlg).addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
}

/* ---------- rescues and their featured dogs ---------- */
const OWN_PAGE = { "willow-woods": "willow-woods/" }; // partners with their own page on this site
async function renderRescues(el) {
  try {
    const [partners, animals] = await Promise.all([getPartners(), getAnimals()]);
    await wordingReady;
    const list = partners;
    if (!list.length) {
      el.innerHTML = `<p class="empty">${h(t("js.rescue.none", "More rescues are on the way. Each one appears here once they've said yes to being featured."))}</p>`;
      return;
    }
    el.innerHTML = list.map(p => {
      // dogs still looking come first, then the most recent adoptions
      const order = { looking: 0, foster: 1, adopted: 2 };
      const dogs = animals.filter(a => a.partner?.slug === p.slug && a.status in order)
        .sort((x, y) => order[x.status] - order[y.status]).slice(0, 8);
      const adopt = safeUrl(p.adopt_url), donate = safeUrl(p.donate_url);
      return `<div class="rescue"><div class="top"><div class="logo" aria-hidden="true">${h(p.name.slice(0, 1))}</div><div><h3>${h(p.name)}</h3></div></div>
        <div class="bd">${p.mission ? `<p>${h(p.mission)}</p>` : ""}
        ${dogs.length ? `<div class="minis">${dogs.map((a, i) => {
          const live = safeUrl(a.listing_url), d = daysToHome(a);
          return `<div class="mini"><div class="ph ${BG[i % 6]}" aria-hidden="true">${EMOJI[a.species] || "🐾"}${photoTag(a.photo_url)}</div><b>${h(a.name)}</b><span class="chip ${STATUS[a.status]}"${a.status === "looking" ? ' style="background:var(--wash)"' : ""}>${h(statusLabel(a.status))}</span>
            ${a.status === "looking" && a.checked_on ? `<small>${h(t("js.rescue.checked", "Checked {date}", { date: new Date(a.checked_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) }))}</small>` : d !== null ? `<small>${h(t("js.animal.home-in", "Home in {n} days", { n: d }))}</small>` : ""}
            ${a.status === "looking" && live ? `<a href="${h(live)}" target="_blank" rel="noopener">${h(t("js.rescue.listing", "Live listing"))} ↗</a>` : ""}</div>`;
        }).join("")}</div>` : ""}
        <div class="btns">${OWN_PAGE[p.slug] ? `<a class="btn royal" href="${S.base}${OWN_PAGE[p.slug]}">${h(t("js.rescue.horses", "Meet the horses"))}</a>` : ""}${safeUrl(p.website_url) ? `<a class="btn ghost" href="${h(safeUrl(p.website_url))}" rel="noopener">${h(t("js.rescue.site", "Visit their site"))} <span class="ext" aria-hidden="true">↗</span></a>` : ""}${adopt ? `<a class="btn ocean" href="${h(adopt)}" target="_blank" rel="noopener">${h(t("js.rescue.adopt", "Adopt or foster from {rescue}", { rescue: p.name }))} <span class="ext" aria-hidden="true">↗</span></a>` : ""}${donate ? `<a class="btn ghost" href="${h(donate)}" target="_blank" rel="noopener">${h(t("js.rescue.donate", "Donate on their page"))} <span class="ext" aria-hidden="true">↗</span></a>` : ""}</div>
        </div></div>`;
    }).join("");
  } catch { failed(el, t("js.failed.rescues", "Rescues couldn't load right now. Please try again in a little while.")); }
}

/* horses at a partner, grouped by herd (Willow Woods page) */
// animals grouped by herd (the "Herd" field), in each herd's order; rest names the group without a herd
function herdsHTML(animals, rest) {
  const herds = [...new Set(animals.map(a => a.herd || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  return `<div class="herds">${herds.map(herd => `<div class="herd"><h3>${h(herd || rest)}</h3>
    <ul class="wall" style="margin-top:12px">${animals.filter(a => (a.herd || "") === herd).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100)).map(petHTML).join("")}</ul></div>`).join("")}</div>`;
}
async function renderHorses(el) {
  try {
    const horses = (await getAnimals()).filter(a => a.partner?.slug === el.dataset.horses && a.species === "horse");
    await wordingReady;
    if (!horses.length) { el.innerHTML = `<p class="empty">${h(t("js.horse.none", "The horses are being added."))}</p>`; return; }
    el.innerHTML = herdsHTML(horses, t("js.horse.more", "More horses"));
  } catch { failed(el, t("js.failed.horses", "The horses couldn't load right now. Please try again in a little while.")); }
}

/* Animal Story Spotlight: animals in their forever homes and sanctuaries, by where they live */
async function renderSpotlight(el) {
  let list;
  try { list = (await getAnimals()).filter(a => !helped(a)); }
  catch { await wordingReady; failed(el, t("js.failed.spotlight", "The spotlight couldn't load right now. Please try again in a little while.")); return; }
  await wordingReady;
  if (!list.length) { el.innerHTML = `<p class="empty">${h(t("js.spotlight.none", "The first stories are on their way."))}</p>`; return; }
  const homes = [...new Set(list.map(a => a.partner?.slug || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  el.innerHTML = homes.map(slug => {
    const here = list.filter(a => (a.partner?.slug || "") === slug), name = here[0].partner?.name;
    const page = OWN_PAGE[slug] ? `<a class="more" href="${h(S.base + OWN_PAGE[slug])}">${h(t("js.spotlight.visit", "More about {name}", { name }))}</a>` : "";
    return `<div class="spot-home"><h2 class="h2">${h(name ? t("js.spotlight.at", "At {name}", { name }) : t("js.spotlight.more", "More stories"))}</h2>${page}
      ${herdsHTML(here, here.every(a => a.species === "horse") ? t("js.horse.more", "More horses") : t("js.spotlight.meet", "Meet them"))}</div>`;
  }).join("");
}

/* upcoming events for a partner (Willow Woods page) */
const getEvents = () => once("events", () => q("events", "select=id,title,starts_on,time_text,place,link_url,partner:partners(slug)&order=starts_on.asc"));
async function renderEvents(el) {
  try {
    const list = (await getEvents()).filter(e => !el.dataset.events || e.partner?.slug === el.dataset.events);
    await wordingReady;
    if (!list.length) { el.innerHTML = `<p class="empty">${h(t("js.event.none", "New events are shared here as they're announced."))}</p>`; return; }
    el.innerHTML = `<ul class="events">${list.map(e => {
      const d = asDate(e.starts_on), link = safeUrl(e.link_url);
      return `<li><span class="when"><b>${d.toLocaleDateString("en-US", { month: "short" })}</b>${d.getDate()}</span><span class="what"><b>${link ? `<a href="${h(link)}" rel="noopener">${h(e.title)}</a>` : h(e.title)}</b><span>${h([d.toLocaleDateString("en-US", { weekday: "long" }), e.time_text, e.place].filter(Boolean).join(" · "))}</span></span></li>`;
    }).join("")}</ul>`;
  } catch { failed(el, t("js.failed.events", "Events couldn't load right now. Please try again in a little while.")); }
}

/* ---------- Sniffari programs ---------- */
async function renderSniffari(el) {
  const group = $(el.dataset.filters || "#none"), live = $(el.dataset.live || "#none");
  let programs;
  try { programs = await getSniffari(); } catch { await wordingReady; failed(el, t("js.failed.programs", "Day-out programs couldn't load right now. Please try again in a little while.")); return; }
  await wordingReady;
  const draw = f => {
    const list = programs.filter(p => f === "all" || (p.tags || []).includes(f));
    el.innerHTML = list.length ? list.map(p => {
      const url = safeUrl(p.signup_url);
      return `<article class="sn"><h3>${h(p.shelter_name)}</h3>${p.program_name || p.city ? `<span class="prog">${h([p.program_name, p.city].filter(Boolean).join(" · "))}</span>` : ""}
        ${p.address ? `<p class="small">${h(p.address)}</p>` : ""}
        ${(p.facts || []).length ? `<div class="facts">${p.facts.map(f => `<span>${h(f)}</span>`).join("")}</div>` : ""}
        ${p.checked_on ? `<p class="small">${h(t("js.program.checked", "Details checked {date}", { date: new Date(p.checked_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }))}</p>` : ""}
        ${url ? `<div class="btns"><a class="btn ocean" href="${h(url)}" target="_blank" rel="noopener">${h(t("js.program.signup", "Sign up on their page"))} <span class="ext" aria-hidden="true">↗</span></a></div>` : ""}</article>`;
    }).join("") : `<p class="empty">${h(programs.length ? t("js.program.no-match", "No programs match that yet.") : t("js.program.none", "The first programs are being confirmed with the shelters. Run one? Use the form below."))}</p>`;
    if (live) live.textContent = list.length === 1 ? t("js.program.showing-one", "Showing 1 program") : t("js.program.showing", "Showing {n} programs", { n: list.length });
  };
  draw("all");
  if (group) {
    if (!programs.length) group.hidden = true;
    $$("button", group).forEach(b => { if (b.dataset.s !== "all" && !programs.some(p => (p.tags || []).includes(b.dataset.s))) b.hidden = true; });
    $$("button", group).forEach(b => b.addEventListener("click", () => { $$("button", group).forEach(x => x.setAttribute("aria-pressed", x === b)); draw(b.dataset.s); }));
  }
}

/* ---------- forms: everything goes to the write-only inbox ---------- */
const TOPIC = { partner: "partner", sniffari: "sniffari" };
$$("form[data-form]").forEach(form => form.addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $(".formmsg", form), btn = $("button[type=submit]", form);
  const fd = new FormData(form);
  const thanks = () => t("js.form.thanks", "Thanks! Your message reached {name}. Replies can take a week or two.", { name: WHO });
  if (fd.get("website")) { form.reset(); msg.className = "formmsg is-ok"; msg.textContent = thanks(); return; } // bot trap
  const topic = TOPIC[form.dataset.form] || fd.get("topic") || "other";
  const details = {};
  for (const [k, v] of fd.entries()) if (!["topic", "name", "email", "body", "website"].includes(k) && v) details[k] = details[k] ? [].concat(details[k], v) : v;
  btn.disabled = true; msg.className = "formmsg"; msg.textContent = t("js.form.sending", "Sending…");
  try {
    const r = await fetch(`${S.supabaseUrl}/rest/v1/rpc/submit_message`, {
      method: "POST", headers: { apikey: S.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_topic: topic, p_email: fd.get("email"), p_name: fd.get("name") || null, p_body: fd.get("body") || null, p_details: details, p_page: location.pathname.slice(0, 200) }),
    });
    if (!r.ok) {
      const why = await r.text();
      throw new Error(/slow down/.test(why) ? "slow" : /bad email/.test(why) ? "email" : "fail");
    }
    form.reset();
    msg.className = "formmsg is-ok";
    msg.textContent = topic === "help" ? t("js.form.thanks-help", "Thanks, {name} will see this. Replies can take a little while.", { name: WHO }) : thanks();
  } catch (err) {
    msg.className = "formmsg is-err";
    msg.textContent = err.message === "slow" ? t("js.form.slow", "That's a lot of messages from this email in the last hour. Please try again later.")
      : err.message === "email" ? t("js.form.email", "That email address doesn't look right. Please check it.")
      : t("js.form.failed", "Couldn't send right now. Please try again, or message {name} on TikTok or Instagram.", { name: WHO });
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
    // the label keeps the link's wording key, so saved wording still finds it
    const key = a.dataset.t ? ` data-t="${h(a.dataset.t)}"${a.dataset.tOrig ? ` data-t-orig="${h(a.dataset.tOrig)}"` : ""}` : "";
    a.removeAttribute("data-t"); a.removeAttribute("data-t-orig");
    a.innerHTML = `<span class="pic ${h(d.g)}" aria-hidden="true">${d.e}${img}</span><span class="lab"${key}>${h(label)}</span>`;
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
  let resizing; addEventListener("resize", () => { clearTimeout(resizing); resizing = setTimeout(() => { if (hw.clientWidth !== lastW) layout(); }, 120); });
  layout();
}

/* ---------- local help: under each need on the help page, and "who to call" on the Wildlife page ---------- */
async function renderHelp() {
  const boxes = $$("[data-help]");
  if (!boxes.length) return;
  let rows = [];
  try { rows = await q("help_resources", "select=category,name,description,caution,link_url,more_url,more_label,phone,email,area&order=sort.asc,name.asc"); } catch { return; }
  await wordingReady;
  boxes.forEach(box => {
    const list = rows.filter(r => r.category === box.dataset.help);
    if (!list.length) return;
    box.innerHTML = `<ul class="res">${list.map(r => {
      const link = safeUrl(r.link_url), more = safeUrl(r.more_url);
      // the call button dials the first number, so a phone like "(757) 427-0071, option 1" still works
      const tel = (String(r.phone || "").match(/\+?\d[\d\s().-]{5,}\d/) || [""])[0].replace(/[^\d+]/g, "");
      const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email || "") ? r.email : "";
      const reach = [r.area ? h(r.area) : "", r.phone ? (tel ? `<a href="tel:${h(tel)}">${h(r.phone)}</a>` : h(r.phone)) : "", email ? `<a href="mailto:${h(email)}">${h(email)}</a>` : ""].filter(Boolean);
      return `<li>${link ? `<a href="${h(link)}" target="_blank" rel="noopener">${h(r.name)} <span class="ext" aria-hidden="true">↗</span></a>` : `<b>${h(r.name)}</b>`}
        ${r.description ? `<span>${h(r.description)}</span>` : ""}
        ${r.caution ? `<span class="caution" role="note">${h(r.caution)}</span>` : ""}
        ${more ? `<a class="more" href="${h(more)}" target="_blank" rel="noopener">${h(r.more_label || t("js.help.more", "More from them"))} <span class="ext" aria-hidden="true">↗</span></a>` : ""}
        ${reach.length ? `<small>${reach.join(" · ")}</small>` : ""}</li>`;
    }).join("")}</ul>`;
    box.closest("[data-help-wrap]")?.removeAttribute("hidden"); // a section that only shows once it has listings
  });
}

/* ---------- Rescues on Sniffari: day-out videos and her dog-friendly places ----------
   Each part of the page stays hidden until it has something in it. Videos are links to where they were posted,
   not embeds, so no outside scripts or cookies load on the page. */
const platform = u => {
  let host = "";
  try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
  return /(^|\.)tiktok\.com$/.test(host) ? "TikTok" : /(^|\.)instagram\.com$/.test(host) ? "Instagram" : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? "YouTube"
    : /(^|\.)(facebook\.com|fb\.watch)$/.test(host) ? "Facebook" : "";
};
async function renderVideos(el) {
  let rows = [];
  try { rows = (await q("videos", "select=title,url,posted_on,note,photo_url&order=sort.asc,posted_on.desc.nullslast,created_at.desc")).filter(v => safeUrl(v.url)); } catch { return; }
  if (!rows.length) return;
  await wordingReady;
  el.innerHTML = rows.map((v, i) => {
    const where = platform(v.url), watch = where ? t("js.video.watch", "Watch on {site}", { site: where }) : t("js.video.watch-it", "Watch the video");
    return `<li><a class="vid" href="${h(safeUrl(v.url))}" target="_blank" rel="noopener"><span class="ph ${BG[i % 6]}" aria-hidden="true">🎬${photoTag(v.photo_url)}<span class="play">▶</span></span>
      <span class="bd"><b>${h(v.title)}</b>${v.note ? `<span>${h(v.note)}</span>` : ""}<small>${h([v.posted_on ? fullDate(v.posted_on) : "", watch].filter(Boolean).join(" · "))} <span aria-hidden="true">↗</span></small></span></a></li>`;
  }).join("");
  el.closest("[data-show-when-filled]")?.removeAttribute("hidden");
}
async function renderPlaces(el) {
  let rows = [];
  try { rows = await q("places", "select=name,area,why,link_url,photo_url&order=sort.asc,name.asc"); } catch { return; }
  if (!rows.length) return;
  await wordingReady;
  el.innerHTML = rows.map((p, i) => {
    const link = safeUrl(p.link_url);
    return `<li class="place"><span class="ph ${BG[(i + 2) % 6]}" aria-hidden="true">📍${photoTag(p.photo_url)}</span><div class="bd"><h3>${h(p.name)}</h3>
      ${p.area ? `<small>${h(p.area)}</small>` : ""}${p.why ? `<p>${h(p.why)}</p>` : ""}
      ${link ? `<a href="${h(link)}" target="_blank" rel="noopener">${h(t("js.place.website", "Their website"))} <span class="ext" aria-hidden="true">↗</span></a>` : ""}</div></li>`;
  }).join("");
  el.closest("[data-show-when-filled]")?.removeAttribute("hidden");
}

/* ---------- visitor counts ---------- */
// One count per page view, kept in the site's own database (count_view): just the page, the day and where
// the visit came from (TikTok, Google, ...). No cookies, and nothing about the visitor is stored or sent.
// Skipped for bots, and on devices signed in to the edit page or set not to count.
const SOURCE_OF = [[/(^|\.)tiktok\.com$/, "tiktok"], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"], [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"], [/(^|\.)google\.[a-z.]+$/, "google"], [/(^|\.)bing\.com$/, "bing"], [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "x"], [/(^|\.)reddit\.com$/, "reddit"], [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"], [/(^|\.)linktr\.ee$/, "linktree"]];
function countView() {
  try { if (localStorage.getItem("tt-editor-session") || localStorage.getItem("tt-no-count")) return; } catch {}
  if (!S.page || navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent)) return;
  // ?from=tiktok on a link (like the one in her bio) says where the visit came from; it's taken off the address after
  const url = new URL(location.href), tag = url.searchParams.get("from") || url.searchParams.get("utm_source");
  let source = tag ? tag.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 40) : "";
  if (tag !== null) {
    url.searchParams.delete("from"); url.searchParams.delete("utm_source");
    try { history.replaceState(history.state, "", url.pathname + url.search + url.hash); } catch {}
  }
  if (!source) {
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch {}
    if (ref === location.hostname.replace(/^www\./, "")) source = ""; // moving around the site: a page view, not a new visit
    else source = !ref ? "direct" : (SOURCE_OF.find(([re]) => re.test(ref)) || [, ref])[1];
  }
  fetch(`${S.supabaseUrl}/rest/v1/rpc/count_view`, {
    method: "POST", keepalive: true,
    headers: { apikey: S.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_path: S.page, p_source: source || null }),
  }).catch(() => {});
}

/* ---------- for signed-in editors: a shortcut to this page's wording ---------- */
try {
  if (localStorage.getItem("tt-editor-session") && S.scope)
    document.body.insertAdjacentHTML("beforeend", `<a class="editfab" href="${h(S.base)}edit/#/text/${h(S.scope)}">✏️ Edit this page's wording</a>`);
} catch {}

/* ---------- start ---------- */
renderHelp();
$$("[data-goals]").forEach(renderGoals);
renderStats();
renderAnimals();
$$("[data-rescues]").forEach(renderRescues);
$$("[data-horses]").forEach(renderHorses);
$$("[data-spotlight]").forEach(renderSpotlight);
$$("[data-events]").forEach(renderEvents);
$$("[data-sniffari]").forEach(renderSniffari);
$$("[data-videos]").forEach(renderVideos);
$$("[data-places]").forEach(renderPlaces);
countView();
})();
