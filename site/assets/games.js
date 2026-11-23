/* The Animal Guardian Alliance games, on the Alliance page: Go on Green, Baby Steps, What Would You Do? (the scenario
   game), the level quizzes, and Matching, which is on the shelf for now: its card only shows once 2 pairs are on.
   - What they show comes from the database (game_situations, game_questions, game_scenarios, match_pairs, game_art,
     and checked_by for the "Checked by" credits), published rows only, read with the public key. Taea changes it on
     the edit page; nothing needs rebuilding.
   - Nothing about the child is sent anywhere. Players are an animal picture, never a name, and their scores, levels and
     badges are kept in this browser's storage on this device. A grown-up can copy a move code to carry a player to
     another device; the code holds only that progress.
   - Taea's rules: personal bests only (no leaderboards), no timers, no harsh wrong answers (gentle lines, another try,
     and the answer explained), confetti and soft sounds with a mute button, and a "Read it to me" button.
   Its words are its own t() phrases (keys starting js.games.), editable on the edit page like the site's other phrases. */
(() => {
const root = document.querySelector("[data-games]");
if (!root) return;
const S = window.SITE || {};
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !x.username && !x.password ? x.href : ""; } catch { return ""; } };
const photoUrl = u => { try { return u ? safeUrl(new URL(u, new URL(S.base || "/", location.href)).href) : ""; } catch { return ""; } };
const PHRASES = { ...(S.t || {}) };
const t = (key, text, vars = {}) => (PHRASES[key] || text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = list => list[Math.floor(Math.random() * list.length)];
const plural = (n, one, many) => (n === 1 ? one : many).replace("{n}", n);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEVELS = [1, 2, 3];

/* ---------- this device's players and their progress ---------- */
const KEY = "tt-aga-games";
const PETS = [["fox", "🦊", "Fox"], ["owl", "🦉", "Owl"], ["turtle", "🐢", "Turtle"], ["butterfly", "🦋", "Butterfly"],
  ["frog", "🐸", "Frog"], ["bee", "🐝", "Bee"], ["hedgehog", "🦔", "Hedgehog"], ["penguin", "🐧", "Penguin"]];
const petOf = id => PETS.find(p => p[0] === id) || PETS[0];
const PET_NAMES = () => ({ fox: t("js.games.pet-fox", "Fox"), owl: t("js.games.pet-owl", "Owl"), turtle: t("js.games.pet-turtle", "Turtle"),
  butterfly: t("js.games.pet-butterfly", "Butterfly"), frog: t("js.games.pet-frog", "Frog"), bee: t("js.games.pet-bee", "Bee"),
  hedgehog: t("js.games.pet-hedgehog", "Hedgehog"), penguin: t("js.games.pet-penguin", "Penguin") });
const petName = id => PET_NAMES()[petOf(id)[0]];
const fresh = () => ({ gog: { level: 1, best: {}, bones: 0 }, bs: { level: 1, best: {} }, sc: { level: 1, seen: [], best: {} }, match: { level: 1, seen: [], best: {} }, quiz: { best: {} }, badges: [] });
let saving = true;
let state = { v: 1, players: [], current: null, muted: false, prog: {} };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "null");
  if (s && Array.isArray(s.players)) state = { ...state, ...s, prog: s.prog || {} };
} catch { saving = false; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); saving = true; } catch { saving = false; } };
const player = () => state.players.find(p => p.id === state.current) || null;
// a player's progress, with anything missing filled in (for progress saved by an older version)
const prog = (id = state.current) => {
  const f = fresh(), p = state.prog[id] || {};
  return (state.prog[id] = { ...f, ...p, gog: { ...f.gog, ...p.gog }, bs: { ...f.bs, ...p.bs }, sc: { ...f.sc, ...p.sc }, match: { ...f.match, ...p.match }, quiz: { ...f.quiz, ...p.quiz }, badges: Array.isArray(p.badges) ? p.badges : [] });
};
function addPlayer(pet, from) {
  const id = Math.random().toString(36).slice(2, 10);
  state.players.push({ id, pet, made: new Date().toISOString().slice(0, 10) });
  state.prog[id] = from || fresh();
  state.current = id;
  save();
  return id;
}
const freePets = () => PETS.filter(p => !state.players.some(x => x.pet === p[0]));
// a best score kept per level; returns true when it's a new best
function best(game, level, score) {
  const b = prog()[game].best;
  if (score > (b[level] || 0)) { b[level] = score; save(); return true; }
  return false;
}
// a badge for finishing a level of a game; returns true the first time
function badge(id) {
  const p = prog();
  if (p.badges.includes(id)) return false;
  p.badges.push(id); save();
  return true;
}
// the move code: this player's progress (and their animal), nothing else
const toCode = id => "AGA1-" + btoa(unescape(encodeURIComponent(JSON.stringify({ pet: state.players.find(p => p.id === id)?.pet, prog: state.prog[id] })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromCode(code) {
  const m = String(code).trim().match(/^AGA1-([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(decodeURIComponent(escape(atob(b + "=".repeat((4 - (b.length % 4)) % 4)))));
    return d && typeof d.prog === "object" ? d : null;
  } catch { return null; }
}

/* ---------- what the games show ---------- */
async function q(table, params) {
  const r = await fetch(`${S.supabaseUrl}/rest/v1/${table}?${params}`, { headers: { apikey: S.supabaseKey } });
  if (!r.ok) throw new Error(`${table}: ${r.status}`);
  return r.json();
}
let loading = null, data = null;
const loadContent = () => (loading ??= Promise.all([
  q("game_situations", "select=id,level,species,situation,light,why,green_line,yellow_line,red_line,sort&order=level.asc,sort.asc"),
  q("game_questions", "select=id,level,kind,question,choices,answer,hint,why,reward,sort&order=level.asc,sort.asc"),
  q("match_pairs", "select=id,level,title,tile,cue,question,choices,answer,reward,photo_url,photo_frame,photo_credit,sort&photo_url=not.is.null&order=level.asc,sort.asc"),
  q("game_art", "select=id,kind,photo_url,photo_alt&order=sort.asc"),
  q("game_scenarios", "select=id,level,topic,scenario,question,choices,answer,hint,why,reward,sort&order=level.asc,sort.asc"),
  q("checked_by", "select=id,place,name,link_url,sort&order=sort.asc,name.asc").catch(() => []), // the credits never stop a game
]).then(([situations, questions, pairs, art, scenarios, checks]) => ({
  situations: situations.filter(s => s.situation && ["green", "yellow", "red"].includes(s.light)),
  questions: questions.filter(x => Array.isArray(x.choices) && x.choices.length >= 2 && x.answer >= 1 && x.answer <= x.choices.length),
  scenarios: scenarios.filter(x => x.scenario && Array.isArray(x.choices) && x.choices.length >= 2 && x.answer >= 1 && x.answer <= x.choices.length),
  checks: (Array.isArray(checks) ? checks : []).filter(c => c.name && c.place),
  pairs: pairs.filter(p => photoUrl(p.photo_url) && Array.isArray(p.choices) && p.choices.length >= 2 && p.answer >= 1 && p.answer <= p.choices.length),
  art: art.filter(a => photoUrl(a.photo_url)),
})).then(d => (data = d)).catch(e => { loading = null; throw e; }));

// Taea's pictures for an animal, a bone or a food bowl; until she adds some, a friendly emoji
const EMOJI = { dog: "🐶", cat: "🐱", bunny: "🐰", bone: "🦴", bowl: "🥣" };
const KIND_NAME = () => ({ dog: t("js.games.art-dog", "A dog"), cat: t("js.games.art-cat", "A cat"), bunny: t("js.games.art-bunny", "A bunny"),
  bone: t("js.games.art-bone", "A bone"), bowl: t("js.games.art-bowl", "A food bowl") });
function artHTML(kind, cls = "") {
  const mine = (data?.art || []).filter(a => a.kind === kind);
  const a = mine.length ? pick(mine) : null;
  const alt = a?.photo_alt || KIND_NAME()[kind] || "";
  return a ? `<img class="gart ${cls}" src="${h(photoUrl(a.photo_url))}" alt="${h(alt)}">`
    : `<span class="gart gemoji ${cls}" role="img" aria-label="${h(alt)}">${EMOJI[kind] || "🐾"}</span>`;
}

// Questions for the games that need one to go on (bones), and the quizzes: easy to hard, each once before any repeats.
const asked = new Set();
function nextQuestion(level) {
  const all = data.questions;
  const tiers = [level, ...LEVELS.filter(l => l < level).reverse(), ...LEVELS.filter(l => l > level)];
  for (const l of tiers) {
    const left = all.filter(x => x.level === l && !asked.has(x.id));
    if (left.length) { asked.add(left[0].id); return left[0]; }
  }
  for (const x of all) asked.delete(x.id); // every question has had its turn: start again
  return all.find(x => x.level === level) || all[0] || null;
}

/* ---------- sounds, confetti, reading aloud ---------- */
let audio = null;
function sound(kind) {
  if (state.muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes = { right: [660, 880], cheer: [523, 659, 784, 1047], tap: [520], roll: [392, 440, 494] }[kind] || [];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + i * 0.11;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      o.connect(g).connect(audio.destination); o.start(at); o.stop(at + 0.35);
    });
  } catch { /* no sound on this device */ }
}
function confetti() {
  const box = $(".gbox[open]") || document.body;
  if (reduced()) { box.insertAdjacentHTML("beforeend", `<div class="gsparkle" aria-hidden="true">✨🎉✨</div>`); setTimeout(() => $(".gsparkle", box)?.remove(), 1200); return; }
  const c = document.createElement("canvas");
  c.className = "gconfetti"; c.setAttribute("aria-hidden", "true");
  box.appendChild(c);
  const w = (c.width = box.clientWidth || innerWidth), ht = (c.height = box.clientHeight || innerHeight), g = c.getContext("2d");
  const colors = ["#7949DB", "#9BB8F8", "#58F1FD", "#ECB4F5", "#F9D5F7", "#2664E1"];
  const bits = Array.from({ length: 90 }, () => ({ x: Math.random() * w, y: -20 - Math.random() * ht * 0.4, s: 5 + Math.random() * 6, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, c: pick(colors) }));
  let frame = 0;
  (function draw() {
    g.clearRect(0, 0, w, ht);
    for (const b of bits) { b.x += b.vx; b.y += b.vy; b.r += 0.1; g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore(); }
    if (++frame < 110) requestAnimationFrame(draw); else c.remove();
  })();
}
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  speechSynthesis.speak(u);
}
const readBtn = () => (canSpeak ? `<button type="button" class="gread" data-read>🔈 ${h(t("js.games.read", "Read it to me"))}</button>` : "");
const stopSpeaking = () => { if (canSpeak) speechSynthesis.cancel(); };

/* ---------- the game window ---------- */
const GAMES = {
  gog: { icon: "🚦", name: () => t("js.games.gog", "Go on Green"), blurb: () => t("js.games.gog-blurb", "Read the animal, then choose: go, slow down, or stop.") },
  bs: { icon: "🐾", name: () => t("js.games.bs", "Baby Steps"), blurb: () => t("js.games.bs-blurb", "Collect bones, take baby steps, and wait for a yes before you pet.") },
  sc: { icon: "🧭", name: () => t("js.games.sc", "What Would You Do?"), blurb: () => t("js.games.sc-blurb", "Read what's happening, then pick the best thing to do. For ages 8 to 12.") },
  quiz: { icon: "❓", name: () => t("js.games.quiz", "Quizzes"), blurb: () => t("js.games.quiz-blurb", "Questions about caring for pets, from easy to hard.") },
  match: { icon: "🃏", name: () => t("js.games.match", "Matching"), blurb: () => t("js.games.match-blurb", "Find the pairs and learn what each animal is telling you.") },
};
document.body.insertAdjacentHTML("beforeend", `<dialog class="gbox" aria-labelledby="gtitle">
  <div class="ghead"><span class="gwho" aria-hidden="true"></span><h2 id="gtitle"></h2><span class="gscore" aria-live="polite"></span>
    <button type="button" class="gicon gmute"></button><button type="button" class="gicon gclose" aria-label="${h(t("js.games.close", "Close the game"))}">✕</button></div>
  <div class="gbody"></div><div class="glayer" hidden></div></dialog>`);
const box = document.body.lastElementChild, body = $(".gbody", box), layer = $(".glayer", box);
const muteLabel = () => { const b = $(".gmute", box); b.textContent = state.muted ? "🔇" : "🔊"; b.setAttribute("aria-label", state.muted ? t("js.games.unmute", "Turn sounds on") : t("js.games.mute", "Turn sounds off")); b.setAttribute("aria-pressed", String(state.muted)); };
$(".gmute", box).addEventListener("click", () => { state.muted = !state.muted; save(); muteLabel(); });
$(".gclose", box).addEventListener("click", () => box.close());
box.addEventListener("close", () => { stopSpeaking(); $$(".gconfetti, .gsparkle", box).forEach(x => x.remove()); layer.hidden = true; layer.innerHTML = ""; body.innerHTML = ""; drawLauncher(); history.replaceState(null, "", location.pathname + location.search + "#games"); });
box.addEventListener("click", e => { const r = e.target.closest("[data-read]"); if (r) speak(r.closest("[data-say]")?.dataset.say || ""); });
let score = 0;
const setScore = (n, extra = "") => { score = n; $(".gscore", box).innerHTML = `⭐ ${h(n)}${extra}`; };
function openGame(key) {
  const p = player();
  if (!p) return choosePet(() => openGame(key));
  $("#gtitle", box).textContent = GAMES[key].name();
  $(".gwho", box).textContent = petOf(p.pet)[1];
  muteLabel(); setScore(0);
  body.innerHTML = `<p class="gwait">${h(t("js.games.loading", "Getting the game ready…"))}</p>`;
  if (!box.open) box.showModal();
  history.replaceState(null, "", location.pathname + location.search + "#play-" + key);
  loadContent().then(() => ({ gog: playGoOnGreen, bs: playBabySteps, sc: playScenarios, match: playMatching, quiz: playQuizzes })[key]())
    .catch(() => { body.innerHTML = `<p class="gwait">${h(t("js.games.failed", "The game couldn't load. Check the connection and try again."))}</p>`; });
}
// a card that pops up over the game (a question, a dice roll, a choice); resolves with what the child picked
function popUp(html, { say = "" } = {}) {
  layer.innerHTML = `<div class="gpop" role="dialog" aria-modal="true" data-say="${h(say)}">${html}</div>`;
  layer.hidden = false;
  const first = $("button:not([disabled])", layer);
  first?.focus();
}
const closePop = () => { layer.hidden = true; layer.innerHTML = ""; stopSpeaking(); };

// One question, with tries (another go after a wrong answer, then the answer explained). Resolves { right, first }.
// scene: a situation shown (and read out) before the question, for What Would You Do?
function ask(qn, { tries = 2, title = t("js.games.question", "Question"), scene = "" } = {}) {
  return new Promise(done => {
    const letters = ["A", "B", "C", "D", "E"];
    const say = `${scene ? scene + " " : ""}${qn.question} ${qn.kind === "tf" ? "" : qn.choices.map((c, i) => `${letters[i]}: ${c}.`).join(" ")}`;
    popUp(`<p class="gkicker">${h(title)}</p>${scene ? `<p class="gscene">${h(scene)}</p>` : ""}<h3 class="gq">${h(qn.question)}</h3>${readBtn()}
      <div class="gchoices${qn.kind === "tf" ? " tf" : ""}">${qn.choices.map((c, i) => `<button type="button" class="gchoice" data-i="${i + 1}">${qn.kind === "tf" ? "" : `<b>${letters[i]}</b> `}${h(c)}</button>`).join("")}</div>
      <p class="gfeed" aria-live="polite"></p><div class="gbtns"></div>`, { say });
    let attempt = 0;
    layer.onclick = e => {
      const b = e.target.closest(".gchoice");
      if (!b || b.disabled) return;
      attempt++;
      const right = Number(b.dataset.i) === qn.answer, feed = $(".gfeed", layer), btns = $(".gbtns", layer);
      if (right) {
        b.classList.add("right"); $$(".gchoice", layer).forEach(x => { x.disabled = true; });
        feed.textContent = qn.reward || qn.why || t("js.games.right", "Yes! You got it.");
        sound("right");
      } else {
        b.classList.add("notthis"); b.disabled = true;
        if (attempt < tries) { feed.textContent = qn.hint || t("js.games.try-again", "Not quite. Have another look and try again."); return; }
        $$(".gchoice", layer).forEach(x => { x.disabled = true; if (Number(x.dataset.i) === qn.answer) x.classList.add("right"); });
        feed.textContent = `${t("js.games.answer-is", "The answer is: {answer}.", { answer: qn.choices[qn.answer - 1] })} ${qn.why || qn.reward || ""}`.trim();
      }
      btns.innerHTML = `<button type="button" class="btn royal" data-next>${h(t("js.games.next", "Next"))}</button>`;
      $("[data-next]", btns).focus();
      $("[data-next]", btns).onclick = () => { closePop(); layer.onclick = null; done({ right, first: right && attempt === 1 }); };
    };
  });
}
// "Well done" at the end of a round or board, with the best score and any new badge
function finish({ title, lines = [], badgeId, game, level, next }) {
  const newBest = best(game, level, score), newBadge = badgeId ? badge(badgeId) : false;
  if (newBadge || newBest) confetti();
  sound("cheer");
  body.innerHTML = `<div class="gdone"><p class="gbig" aria-hidden="true">${newBadge ? "🏅" : "🌟"}</p><h3>${h(title)}</h3>
    <p class="gpoints">${h(t("js.games.points", "{n} points", { n: score }))}${newBest ? ` · ${h(t("js.games.new-best", "a new personal best!"))}` : ` · ${h(t("js.games.your-best", "your best: {n}", { n: prog()[game].best[level] || 0 }))}`}</p>
    ${lines.map(l => `<p>${h(l)}</p>`).join("")}
    ${newBadge ? `<p class="gbadge">${h(t("js.games.badge", "New badge: {game}, Level {level}!", { game: GAMES[game].name(), level }))}</p>` : ""}
    <div class="gbtns"><button type="button" class="btn royal" data-again>${h(next || t("js.games.play-again", "Play again"))}</button><button type="button" class="btn ghost" data-back>${h(t("js.games.back", "Back to the games"))}</button></div></div>`;
  $("[data-back]", body).onclick = () => box.close();
  return new Promise(ok => { $("[data-again]", body).onclick = ok; $("[data-again]", body).focus(); });
}

/* ---------- Go on Green ----------
   A situation in words, with a picture of the animal, and three lights: green (go), yellow (slow down) and red (stop).
   Each light has its own line: praise for the right one, a gentle nudge for the others. 3 tries, then the answer is
   explained and the situation comes back later in the round. 1 point for the right light, 2 on the first try. Most
   right on the first try (4 of 6) moves up a level. Now and then a bone appears: tap it for a question, and a right
   answer (with one more try) puts the bone in the child's supply. */
const LIGHTS = [["green", "🟢", () => t("js.games.go", "Go")], ["yellow", "🟡", () => t("js.games.slow", "Slow down")], ["red", "🔴", () => t("js.games.stop", "Stop")]];
const ROUND = 6;
async function playGoOnGreen() {
  const g = prog().gog, level = Math.min(3, Math.max(1, g.level || 1)), all = data.situations;
  if (all.length < 3) { body.innerHTML = `<p class="gwait">${h(t("js.games.soon", "This game is coming soon."))}</p>`; return; }
  const here = shuffle(all.filter(s => s.level === level)), rest = shuffle(all.filter(s => s.level !== level));
  let queue = [...here, ...rest].slice(0, ROUND);
  while (queue.length < ROUND) queue.push(pick(all));
  const bonesAt = new Set(shuffle([...queue.keys()]).slice(0, 2)), back = new Set();
  let firstTry = 0, n = 0;
  setScore(0, ` · 🦴 ${g.bones}`);
  const scoreBar = () => setScore(score, ` · 🦴 ${g.bones}`);
  while (queue.length) {
    const s = queue.shift(), idx = n++, hasBone = bonesAt.has(idx);
    const result = await new Promise(resolve => {
      body.innerHTML = `<div class="gog" data-say="${h(s.situation)}">
        <div class="gscene">${artHTML(s.species, "gbigart")}<p class="gsit">${h(s.situation)}</p>${readBtn()}
          ${hasBone ? `<button type="button" class="gbone" aria-label="${h(t("js.games.bone-tap", "A bone! Tap it for a question"))}">${artHTML("bone")}</button>` : ""}</div>
        <div class="glights" role="group" aria-label="${h(t("js.games.lights", "Choose a light"))}">${LIGHTS.map(([k, dot, name]) => `<button type="button" class="glight l-${k}" data-light="${k}"><span aria-hidden="true">${dot}</span>${h(name())}</button>`).join("")}</div>
        <p class="gfeed" aria-live="polite"></p><div class="gbtns"></div>
        <p class="gstep">${h(t("js.games.of", "{n} of {total}", { n: Math.min(idx + 1, ROUND), total: ROUND }))} · ${h(t("js.games.level", "Level {n}", { n: level }))}</p></div>`;
      let tries = 0;
      const feed = $(".gfeed", body), btns = $(".gbtns", body);
      $(".gbone", body)?.addEventListener("click", async e => {
        e.currentTarget.remove();
        const qn = nextQuestion(level);
        if (!qn) return;
        const r = await ask(qn, { tries: 2, title: t("js.games.bone-question", "Bone question") });
        if (r.right) { g.bones++; save(); scoreBar(); }
      });
      $(".glights", body).addEventListener("click", e => {
        const b = e.target.closest("[data-light]");
        if (!b || b.disabled) return;
        tries++;
        const k = b.dataset.light, line = s[k + "_line"] || "";
        if (k === s.light) {
          $$("[data-light]", body).forEach(x => { x.disabled = true; });
          b.classList.add("right");
          const pts = tries === 1 ? 2 : 1;
          setScore(score + pts, ` · 🦴 ${g.bones}`);
          if (tries === 1) firstTry++;
          feed.textContent = [line, s.why].filter(Boolean).join(" ");
          sound("right"); confetti();
          btns.innerHTML = `<button type="button" class="btn royal" data-next>${h(t("js.games.next", "Next"))}</button>`;
          $("[data-next]", btns).onclick = () => resolve("right");
          $("[data-next]", btns).focus();
        } else if (tries < 3) {
          b.disabled = true; b.classList.add("notthis");
          feed.textContent = `${line || t("js.games.try-again", "Not quite. Have another look and try again.")}`;
        } else {
          $$("[data-light]", body).forEach(x => { x.disabled = true; if (x.dataset.light === s.light) x.classList.add("right"); });
          const name = LIGHTS.find(l => l[0] === s.light)[2]();
          feed.textContent = `${t("js.games.its-a", "This one is {light}.", { light: name })} ${s.why || ""}${back.has(s.id) ? "" : " " + t("js.games.again-later", "You'll see it again in a little while.")}`;
          btns.innerHTML = `<button type="button" class="btn royal" data-next>${h(t("js.games.next", "Next"))}</button>`;
          $("[data-next]", btns).onclick = () => resolve("missed");
          $("[data-next]", btns).focus();
        }
      });
    });
    if (result === "missed" && !back.has(s.id)) { back.add(s.id); queue.splice(Math.min(2, queue.length), 0, s); }
  }
  const moveUp = firstTry >= 4;
  let lines = [t("js.games.gog-first", "You got {n} of {total} on the first try.", { n: Math.min(firstTry, ROUND), total: ROUND })];
  if (moveUp && level < 3) { g.level = level + 1; lines.push(t("js.games.level-up", "On to Level {n}!", { n: level + 1 })); }
  else if (moveUp) lines.push(t("js.games.top-level", "You're reading animals like an expert. Keep practicing!"));
  else lines.push(t("js.games.practice", "Let's practice this level again. Every round, you get better at listening to animals."));
  save();
  await finish({ title: t("js.games.round-done", "Round done!"), lines, badgeId: moveUp ? `gog-${level}` : null, game: "gog", level });
  playGoOnGreen();
}

/* ---------- Baby Steps ----------
   A board of squares: the child's animal moves one square at a time. Bones hold a question: a right answer puts the
   bone in the child's supply, a wrong one and it's gone. The food bowl is a treat to collect. Next to an animal, tap it
   and the dice rolls: green, it says yes to pets (5 points); red, it says no. With a red animal: offer a bone or the
   bowl (another roll, 50/50), walk away, or try to pet anyway, which sends the child back to the start. Never more than 3
   reds in a row from the same animal. Pet every animal to finish the board; each level's board has more. */
const COLS = 6, ROWS = 9;
const BOARDS = { 1: { animals: ["dog", "cat", "dog"], bones: 4 }, 2: { animals: ["dog", "cat", "dog", "cat"], bones: 5 }, 3: { animals: ["dog", "cat", "dog", "cat", "bunny"], bones: 6 } };
const near = (a, b) => Math.abs(a % COLS - b % COLS) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) === 1;
function makeBoard(level) {
  for (;;) {
    const cells = Array(COLS * ROWS).fill(null), spots = shuffle([...cells.keys()].filter(i => i > COLS + 1 && !near(i, 0)));
    const plan = BOARDS[level];
    plan.animals.forEach((sp, k) => { cells[spots.pop()] = { type: "animal", species: sp, id: k, reds: 0, mood: null }; });
    for (let k = 0; k < plan.bones; k++) cells[spots.pop()] = { type: "bone" };
    cells[spots.pop()] = { type: "bowl" };
    // every square must be reachable from the start without walking through an animal
    const seen = new Set([0]), todo = [0];
    while (todo.length) { const c = todo.pop(); for (const d of [c - COLS, c + COLS, c % COLS ? c - 1 : -1, (c + 1) % COLS ? c + 1 : -1]) if (d >= 0 && d < cells.length && !seen.has(d) && cells[d]?.type !== "animal") { seen.add(d); todo.push(d); } }
    if (cells.every((c, i) => c?.type === "animal" || seen.has(i))) return cells;
  }
}
const ANIMAL_NAME = { dog: () => t("js.games.the-dog", "the dog"), cat: () => t("js.games.the-cat", "the cat"), bunny: () => t("js.games.the-bunny", "the bunny") };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
async function playBabySteps() {
  const b = prog().bs, level = Math.min(3, Math.max(1, b.level || 1));
  if (!data.questions.length) { body.innerHTML = `<p class="gwait">${h(t("js.games.soon", "This game is coming soon."))}</p>`; return; }
  const cells = makeBoard(level), pet = petOf(player().pet);
  let at = 0, bones = 0, bowls = 0, friends = 0, busy = false;
  const total = BOARDS[level].animals.length;
  setScore(0);
  const bar = () => setScore(score, ` · 🦴 ${bones}${bowls ? ` · ${EMOJI.bowl} ${bowls}` : ""}`);
  const say = t("js.games.bs-how", "Tap a square next to you to take a baby step. Collect bones by answering questions, then tap an animal next to you to ask if it wants pets.");
  const draw = () => {
    body.innerHTML = `<div class="gbs" data-say="${h(say)}"><p class="gtip">${h(say)} ${readBtn()}</p>
      <div class="ggrid" role="group" aria-label="${h(t("js.games.board", "The board"))}" style="--cols:${COLS}">${cells.map((c, i) => {
        const here = i === at, step = !here && near(i, at) && c?.type !== "animal";
        const label = here ? t("js.games.you", "You are here") : c?.type === "animal" ? (c.mood === "red" ? t("js.games.animal-red", "{animal}, saying not right now", { animal: ANIMAL_NAME[c.species]() }) : ANIMAL_NAME[c.species]())
          : c?.type === "bone" ? KIND_NAME().bone : c?.type === "bowl" ? KIND_NAME().bowl : step ? t("js.games.step-here", "Step here") : "";
        return `<button type="button" class="gcell${here ? " me" : ""}${step ? " step" : ""}${c?.type === "animal" ? " ani m-" + (c.mood || "none") : ""}" data-i="${i}"${label ? ` aria-label="${h(label)}"` : ""}${!step && !here && c?.type !== "animal" ? " tabindex=\"-1\"" : ""}>${here ? `<span class="gtoken" aria-hidden="true">${pet[1]}</span>` : c ? artHTML(c.type === "animal" ? c.species : c.type) : ""}</button>`;
      }).join("")}</div>
      <p class="gstep">${h(t("js.games.friends", "Animals who said yes: {n} of {total}", { n: friends, total }))} · ${h(t("js.games.level", "Level {n}", { n: level }))}</p></div>`;
    bar();
  };
  draw();
  await new Promise(won => {
    body.onclick = async e => {
      const cell = e.target.closest(".gcell");
      if (!cell || busy) return;
      const i = Number(cell.dataset.i), c = cells[i];
      if (c?.type === "animal") {
        if (!near(i, at)) { $(".gtip", body).textContent = t("js.games.get-closer", "Take baby steps until you're right next to it, then ask."); return; }
        busy = true;
        await meet(c);
        busy = false;
        if (c.done) { cells[i] = null; friends++; }
        draw();
        if (friends === total) { body.onclick = null; won(); }
        return;
      }
      if (!near(i, at)) return;
      sound("tap");
      at = i;
      if (c?.type === "bone") {
        busy = true; draw();
        const qn = nextQuestion(level);
        const r = qn ? await ask(qn, { tries: 1, title: t("js.games.bone-question", "Bone question") }) : { right: true };
        cells[i] = null;
        if (r.right) bones++;
        else $(".gtip", body).textContent = t("js.games.bone-gone", "That bone wandered off. There are more to find!");
        busy = false;
      } else if (c?.type === "bowl") {
        cells[i] = null; bowls++;
        sound("right");
      }
      draw();
    };
  });
  // a child meets an animal: the dice, then what they choose
  async function meet(c) {
    const name = ANIMAL_NAME[c.species](), Name = cap(name);
    const roll = async () => {
      popUp(`<p class="gkicker">${h(t("js.games.asking", "Asking {animal}…", { animal: name }))}</p><div class="gdice" aria-hidden="true">🎲</div>`);
      sound("roll");
      await new Promise(ok => setTimeout(ok, reduced() ? 150 : 900));
      c.mood = c.reds >= 3 || Math.random() < 0.5 ? "green" : "red"; // 50/50, and never more than 3 reds in a row
      c.reds = c.mood === "red" ? c.reds + 1 : 0;
    };
    await roll();
    for (;;) {
      if (c.mood === "green") {
        const ans = await choose(`${artHTML(c.species, "gbigart m-green")}<h3>${h(t("js.games.yes", "Loose and wiggly: {animal} says yes!", { animal: name }))}</h3>`,
          [["pet", t("js.games.pet", "Pet gently")]], t("js.games.yes-say", "{animal} says yes to pets.", { animal: Name }));
        if (ans === "pet") { c.done = true; setScore(score + 5); sound("cheer"); confetti(); }
        closePop(); return;
      }
      const opts = [];
      if (bones) opts.push(["bone", t("js.games.offer-bone", "Offer a bone ({n} left)", { n: bones })]);
      if (bowls) opts.push(["bowl", t("js.games.offer-bowl", "Offer the food bowl")]);
      opts.push(["away", t("js.games.walk-away", "Walk away for now")], ["pet", t("js.games.pet-anyway", "Try to pet anyway")]);
      const choice = await choose(`${artHTML(c.species, "gbigart m-red")}<h3>${h(t("js.games.no", "Ears back and turned away: {animal} says not right now.", { animal: name }))}</h3>
        ${!bones && !bowls ? `<p>${h(t("js.games.need-bone", "Find a bone or the food bowl, then come back and offer it."))}</p>` : ""}`, opts, t("js.games.no-say", "{animal} says not right now.", { animal: Name }));
      if (choice === "bone" || choice === "bowl") {
        if (choice === "bone") bones--; else bowls--;
        bar();
        await roll();
        continue;
      }
      if (choice === "pet") {
        await choose(`<h3>${h(t("js.games.back-start", "{animal} said no, and that's okay.", { animal: Name }))}</h3><p>${h(t("js.games.back-start-why", "When you say no, you want people to listen too. Let's go back to the start and try again, one baby step at a time."))}</p>`,
          [["ok", t("js.games.ok", "Okay")]]);
        at = 0;
      }
      closePop(); return;
    }
  }
  function choose(html, opts, say = "") {
    return new Promise(done => {
      popUp(`${html}${say ? readBtn() : ""}<div class="gbtns col">${opts.map(([k, l], i) => `<button type="button" class="btn ${i ? "ghost" : "royal"}" data-k="${k}">${h(l)}</button>`).join("")}</div>`, { say });
      layer.onclick = e => { const b = e.target.closest("[data-k]"); if (b) { layer.onclick = null; done(b.dataset.k); } };
    });
  }
  const up = level < 3;
  if (up) b.level = level + 1;
  save();
  await finish({ title: t("js.games.bs-done", "Every animal said yes!"), lines: [t("js.games.bs-done-why", "You waited for a yes every time. That's what an animal guardian does.")],
    badgeId: `bs-${level}`, game: "bs", level, next: up ? t("js.games.next-board", "Next board") : t("js.games.play-again", "Play again") });
  playBabySteps();
}

/* ---------- Matching ----------
   Cards face down; flip two at a time, no timer. A match asks what the animal is telling us: a right answer earns a
   point for the match, one for the answer and one more on the first try; a wrong one explains the answer, and the two
   cards turn back over to be found again. Rounds of 8 cards, then 10, then 12, and 12 from then on, with new pairs
   each time until every pair of the level has been seen; then a badge and the next level, and after Level 3, round
   again. */
const SIZES = [4, 5, 6];
async function playMatching(roundNo = 0) {
  const m = prog().match, pairs = data.pairs;
  if (pairs.length < 2) { body.innerHTML = `<p class="gwait">${h(t("js.games.soon", "This game is coming soon."))}</p>`; return; }
  let level = Math.min(3, Math.max(1, m.level || 1));
  const usable = LEVELS.filter(l => pairs.filter(p => p.level === l).length >= 2);
  if (usable.length && !usable.includes(level)) level = usable.find(l => l > level) || usable[0]; // skip a level with too few pairs yet
  const pool = usable.length ? pairs.filter(p => p.level === level) : pairs;
  const unseen = shuffle(pool.filter(p => !m.seen.includes(p.id))), seen = shuffle(pool.filter(p => m.seen.includes(p.id)));
  const size = Math.min(SIZES[Math.min(roundNo, SIZES.length - 1)], pool.length);
  const round = [...unseen, ...seen].slice(0, size);
  const cards = shuffle(round.flatMap(p => [p, p]));
  const tries = new Map(), done = new Set();
  let open = [], lock = false;
  if (roundNo === 0) setScore(0);
  const frame = p => { const css = window.PagePhotos?.frameCSS?.(p.photo_frame) || ""; return css ? ` style="${h(css)}"` : ""; };
  body.innerHTML = `<div class="gmatch"><p class="gtip">${h(t("js.games.match-how", "Flip two cards. If they match, answer what the animal is telling you."))}</p>
    <div class="gcards" style="--n:${cards.length}">${cards.map((p, i) => `<button type="button" class="gflip" data-i="${i}" aria-label="${h(t("js.games.card", "Card {n}, face down", { n: i + 1 }))}">
      <span class="gback" aria-hidden="true">🐾</span><span class="gface"><img src="${h(photoUrl(p.photo_url))}" alt="${h(p.tile || p.title)}"${frame(p)}></span></button>`).join("")}</div>
    <p class="gstep">${h(t("js.games.level", "Level {n}", { n: level }))}</p></div>`;
  const turn = (i, up) => { const el = $(`[data-i="${i}"]`, body); el.classList.toggle("up", up); el.setAttribute("aria-label", up ? cards[i].tile || cards[i].title : t("js.games.card", "Card {n}, face down", { n: i + 1 })); };
  await new Promise(roundDone => {
    body.onclick = async e => {
      const b = e.target.closest(".gflip");
      if (!b || lock) return;
      const i = Number(b.dataset.i);
      if (b.classList.contains("up") || open.includes(i)) return;
      sound("tap"); turn(i, true); open.push(i);
      if (open.length < 2) return;
      lock = true;
      const [a, c] = open; open = [];
      if (cards[a].id !== cards[c].id) { await new Promise(ok => setTimeout(ok, 1100)); turn(a, false); turn(c, false); lock = false; return; }
      const p = cards[a], n = (tries.get(p.id) || 0) + 1;
      tries.set(p.id, n);
      const qn = { kind: "mc", question: p.question || t("js.games.what-saying", "What is this animal telling you?"), choices: p.choices, answer: p.answer, reward: p.reward, why: null };
      const r = await askPair(p, qn);
      if (r) {
        setScore(score + 2 + (n === 1 ? 1 : 0));
        done.add(p.id);
        $$(`[data-i="${a}"], [data-i="${c}"]`, body).forEach(x => { x.classList.add("matched"); x.disabled = true; });
        if (!m.seen.includes(p.id)) { m.seen.push(p.id); save(); }
      } else { turn(a, false); turn(c, false); }
      lock = false;
      if (done.size === round.length) { body.onclick = null; roundDone(); }
    };
  });
  confetti();
  const levelDone = pool.every(p => m.seen.includes(p.id));
  const lines = [t("js.games.well-done", "Well done! You matched every pair.")];
  let next = roundNo + 1, badgeId = null;
  if (levelDone) {
    badgeId = `match-${level}`;
    m.seen = m.seen.filter(id => !pool.some(p => p.id === id));
    if (level < 3) { m.level = level + 1; lines.push(t("js.games.level-up", "On to Level {n}!", { n: level + 1 })); } else { m.level = 1; lines.push(t("js.games.all-seen", "You've seen every pair! Let's mix them up and play again.")); }
    next = 0;
  }
  save();
  await finish({ title: t("js.games.round-done", "Round done!"), lines, badgeId, game: "match", level, next: t("js.games.next-round", "Next round") });
  playMatching(next);
}
// the question on a match: the photo, what to notice, and the question. Resolves true for a right answer.
function askPair(p, qn) {
  return new Promise(done => {
    const letters = ["A", "B", "C", "D", "E"];
    const say = [p.title, p.cue ? t("js.games.notice", "What to notice:") + " " + p.cue : "", qn.question, qn.choices.map((c, i) => `${letters[i]}: ${c}.`).join(" ")].filter(Boolean).join(" ");
    popUp(`<p class="gkicker">${h(t("js.games.matched", "A match!"))}</p><img class="gpairimg" src="${h(photoUrl(p.photo_url))}" alt="${h(p.tile || p.title)}">
      <h3 class="gq">${h(p.title)}</h3>${p.photo_credit ? `<p class="gcredit">${h(t("js.games.photo-by", "Photo by {name}", { name: p.photo_credit }))}</p>` : ""}${p.cue ? `<p class="gcue"><b>${h(t("js.games.notice", "What to notice:"))}</b> ${h(p.cue)}</p>` : ""}
      <p class="gq2">${h(qn.question)}</p>${readBtn()}
      <div class="gchoices">${qn.choices.map((c, i) => `<button type="button" class="gchoice" data-i="${i + 1}"><b>${letters[i]}</b> ${h(c)}</button>`).join("")}</div>
      <p class="gfeed" aria-live="polite"></p><div class="gbtns"></div>`, { say });
    layer.onclick = e => {
      const b = e.target.closest(".gchoice");
      if (!b || b.disabled) return;
      const right = Number(b.dataset.i) === qn.answer, feed = $(".gfeed", layer);
      $$(".gchoice", layer).forEach(x => { x.disabled = true; if (Number(x.dataset.i) === qn.answer) x.classList.add("right"); });
      if (right) { sound("right"); feed.textContent = qn.reward || t("js.games.right", "Yes! You got it."); }
      else { b.classList.add("notthis"); feed.textContent = `${t("js.games.it-means", "Here's what it means: {answer}", { answer: qn.choices[qn.answer - 1] })} ${qn.reward || ""} ${t("js.games.find-again", "Find the pair again to have another go.")}`.trim(); }
      const btns = $(".gbtns", layer);
      btns.innerHTML = `<button type="button" class="btn royal" data-next>${h(right ? t("js.games.next", "Next") : t("js.games.ok", "Okay"))}</button>`;
      $("[data-next]", btns).focus();
      $("[data-next]", btns).onclick = () => { closePop(); layer.onclick = null; done(right); };
    };
  });
}

/* ---------- What Would You Do? ----------
   The scenario game, for ages 8 to 12: a situation in words (a pet, wildlife you find, basic first aid, staying aware)
   and the best thing to do. A second try after a wrong answer, then the answer, and why it's best, either way.
   2 points on the first try, 1 on the second. Rounds of 5, in Taea's order, new ones each round until every
   scenario of the level has been seen; then a badge and the next level, and after Level 3, round again. */
const TOPICS = () => ({ pets: ["🐾", t("js.games.topic-pets", "Pets")], wildlife: ["🦉", t("js.games.topic-wildlife", "Wildlife")],
  firstaid: ["🩹", t("js.games.topic-firstaid", "First aid")], aware: ["👀", t("js.games.topic-aware", "Staying aware")] });
const SC_ROUND = 5;
async function playScenarios() {
  const m = prog().sc, all = data.scenarios;
  if (all.length < 3) { body.innerHTML = `<p class="gwait">${h(t("js.games.soon", "This game is coming soon."))}</p>`; return; }
  const usable = LEVELS.filter(l => all.some(s => s.level === l));
  let level = Math.min(3, Math.max(1, m.level || 1));
  if (!usable.includes(level)) level = usable.find(l => l > level) || usable[0]; // skip a level with none yet
  const pool = all.filter(s => s.level === level);
  const round = [...pool.filter(s => !m.seen.includes(s.id)), ...shuffle(pool.filter(s => m.seen.includes(s.id)))].slice(0, SC_ROUND);
  setScore(0);
  for (let i = 0; i < round.length; i++) {
    const s = round[i], [icon, topic] = TOPICS()[s.topic] || TOPICS().pets;
    body.innerHTML = `<p class="gstep">${h(t("js.games.of", "{n} of {total}", { n: i + 1, total: round.length }))} · ${h(t("js.games.level", "Level {n}", { n: level }))}</p>`;
    // right: their well-done line and why; wrong twice: the answer and why
    const why = [s.reward, s.why].filter(Boolean).join(" ");
    const r = await ask({ kind: "mc", question: s.question || t("js.games.sc-question", "What would you do?"), choices: s.choices, answer: s.answer, hint: s.hint, reward: why || null, why: s.why || s.reward || null },
      { tries: 2, title: `${icon} ${topic}`, scene: s.scenario });
    if (r.right) setScore(score + (r.first ? 2 : 1));
    if (!m.seen.includes(s.id)) { m.seen.push(s.id); save(); }
  }
  const lines = [t("js.games.sc-done-why", "Knowing what to do, and why, is what keeps animals and people safe.")];
  let badgeId = null;
  if (pool.every(s => m.seen.includes(s.id))) {
    badgeId = `sc-${level}`;
    m.seen = m.seen.filter(id => !pool.some(s => s.id === id));
    if (level < 3) { m.level = level + 1; if (all.some(s => s.level > level)) lines.push(t("js.games.level-up", "On to Level {n}!", { n: level + 1 })); }
    else { m.level = 1; lines.push(t("js.games.sc-all-seen", "You've done every scenario! Let's go round again.")); }
  }
  save();
  await finish({ title: t("js.games.round-done", "Round done!"), lines, badgeId, game: "sc", level, next: t("js.games.next-round", "Next round") });
  playScenarios();
}

/* ---------- the level quizzes ----------
   The question bank for one level, in order (easy to hard), with a second try after a wrong answer. 2 points on the
   first try, 1 on the second. A badge for finishing each level. */
async function playQuizzes() {
  const qs = data.questions, levels = LEVELS.filter(l => qs.some(x => x.level === l)), p = prog();
  if (!levels.length) { body.innerHTML = `<p class="gwait">${h(t("js.games.soon", "This game is coming soon."))}</p>`; return; }
  body.innerHTML = `<div class="gquiz"><h3>${h(t("js.games.pick-quiz", "Pick a quiz"))}</h3><div class="gbtns col">${levels.map(l => `<button type="button" class="btn ${p.badges.includes("quiz-" + l) ? "ghost" : "royal"}" data-level="${l}">
    ${h(t("js.games.quiz-level", "Level {n}: {name}", { n: l, name: [t("js.games.easy", "Easy"), t("js.games.medium", "Medium"), t("js.games.hard", "Hard")][l - 1] }))}${p.badges.includes("quiz-" + l) ? " 🏅" : ""}</button>`).join("")}</div></div>`;
  const level = await new Promise(ok => { body.onclick = e => { const b = e.target.closest("[data-level]"); if (b) { body.onclick = null; ok(Number(b.dataset.level)); } }; });
  const list = qs.filter(x => x.level === level);
  setScore(0);
  for (let i = 0; i < list.length; i++) {
    body.innerHTML = `<p class="gstep">${h(t("js.games.of", "{n} of {total}", { n: i + 1, total: list.length }))} · ${h(t("js.games.level", "Level {n}", { n: level }))}</p>`;
    const r = await ask(list[i], { tries: 2, title: t("js.games.quiz-q", "Quiz question") });
    if (r.right) setScore(score + (r.first ? 2 : 1));
  }
  await finish({ title: t("js.games.quiz-done", "Quiz done!"), lines: [t("js.games.quiz-done-why", "Every question you answer makes you a better friend to animals.")], badgeId: `quiz-${level}`, game: "quiz", level });
  playQuizzes();
}

/* ---------- on the page: who's playing, the games, and the grown-ups' tools ---------- */
function choosePet(then) {
  const free = freePets();
  if (!free.length) return;
  root.querySelector(".gpets")?.remove();
  root.insertAdjacentHTML("afterbegin", `<div class="gpets box"><h3>${h(t("js.games.pick-pet", "Pick your animal"))}</h3><p class="small">${h(t("js.games.pick-pet-why", "This is you in the games. No names needed."))}</p>
    <div class="gpetrow">${free.map(([id, e]) => `<button type="button" class="gpet" data-pet="${id}"><span aria-hidden="true">${e}</span>${h(petName(id))}</button>`).join("")}</div>
    <button type="button" class="linkbtn" data-cancel>${h(t("js.games.cancel", "Cancel"))}</button></div>`);
  const el = $(".gpets", root);
  el.scrollIntoView({ block: "nearest" });
  $("button", el).focus();
  el.onclick = e => {
    if (e.target.closest("[data-cancel]")) { el.remove(); return; }
    const b = e.target.closest("[data-pet]");
    if (!b) return;
    addPlayer(b.dataset.pet);
    el.remove(); drawLauncher();
    then?.();
  };
}
// whether a game has enough switched on to play (until the content has loaded, it's assumed it does)
const ready = k => !data || (k === "gog" ? data.situations.length >= 3 : k === "sc" ? data.scenarios.length >= 3 : k === "match" ? data.pairs.length >= 2 : data.questions.length >= 1);
// Matching is on the shelf until Taea has the photos: its card only shows once 2 pairs are on (no "Coming soon")
const shown = k => k !== "match" || (!!data && data.pairs.length >= 2);
// "Checked by …": the people or businesses who checked a game for Taea, linked to them where there's a link
function checkedHTML(place) {
  const names = (data?.checks || []).filter(c => c.place === place).map(c => { const u = safeUrl(c.link_url || ""); return u ? `<a href="${h(u)}" rel="noopener" target="_blank">${h(c.name)}</a>` : h(c.name); });
  if (!names.length) return "";
  const and = h(t("js.games.and", "and")), list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
  return `<p class="gchecked"><span aria-hidden="true">✔</span> ${h(t("js.games.checked-by", "Checked by {names}")).replace("{names}", () => list)}</p>`;
}
function drawLauncher() {
  const p = player(), pg = p ? prog() : null;
  const stars = key => LEVELS.map(l => `<span class="${pg?.badges.includes(`${key}-${l}`) ? "on" : ""}" title="${h(t("js.games.level", "Level {n}", { n: l }))}">★</span>`).join("");
  root.innerHTML = `<div class="gplayers"><p class="glabel">${h(t("js.games.who", "Who's playing?"))}</p><div class="gpetrow">
    ${state.players.map(x => `<button type="button" class="gpet${x.id === state.current ? " on" : ""}" data-player="${h(x.id)}" aria-pressed="${x.id === state.current}"><span aria-hidden="true">${petOf(x.pet)[1]}</span>${h(petName(x.pet))}</button>`).join("")}
    ${freePets().length ? `<button type="button" class="gpet add" data-new><span aria-hidden="true">＋</span>${h(t("js.games.new-player", "New player"))}</button>` : ""}</div></div>
    <ul class="gcardsl">${Object.entries(GAMES).filter(([k]) => shown(k)).map(([k, g]) => `<li class="gcardl"><span class="gic" aria-hidden="true">${g.icon}</span><h3>${h(g.name())}</h3><p>${h(g.blurb())}</p>${checkedHTML(k)}
      ${p ? `<p class="gstars" aria-label="${h(t("js.games.badges-of", "Badges: {n} of 3", { n: LEVELS.filter(l => pg.badges.includes(`${k}-${l}`)).length }))}">${stars(k)}</p>` : ""}
      ${ready(k) ? `<button type="button" class="btn royal" data-play="${k}">${h(t("js.games.play", "Play"))}</button>` : `<span class="gsoon">${h(t("js.games.soon-card", "Coming soon"))}</span>`}</li>`).join("")}</ul>
    <details class="ggrown"><summary>${h(t("js.games.grownups", "For grown-ups: saving and moving progress"))}</summary>
      <p class="small">${h(t("js.games.saved-here", "Progress is saved in this browser, on this device only. Nothing about your child is sent to us. Clearing this browser's data erases it."))}</p>
      ${saving ? "" : `<p class="small"><b>${h(t("js.games.cant-save", "This browser isn't letting the games save, so progress lasts only until the page is closed."))}</b></p>`}
      ${p ? `<p class="small"><b>${h(t("js.games.move", "Move {pet} to another device:", { pet: petName(p.pet) }))}</b> ${h(t("js.games.move-how", "copy this code, then on the other device paste it below."))}</p>
        <div class="gcode"><input readonly value="${h(toCode(p.id))}" aria-label="${h(t("js.games.move-code", "Move code"))}"><button type="button" class="btn ghost sm" data-copy>${h(t("js.games.copy", "Copy"))}</button></div>` : ""}
      <label class="small">${h(t("js.games.bring", "Bring a player from another device: paste their code"))}<span class="gcode"><input data-code autocomplete="off"><button type="button" class="btn ghost sm" data-bring>${h(t("js.games.add", "Add"))}</button></span></label>
      <p class="small gmsg" aria-live="polite"></p>
      ${p ? `<p class="small"><button type="button" class="linkbtn" data-reset>${h(t("js.games.restart", "Start {pet} over", { pet: petName(p.pet) }))}</button> · <button type="button" class="linkbtn" data-remove>${h(t("js.games.remove", "Remove {pet}", { pet: petName(p.pet) }))}</button></p>` : ""}
    </details>`;
}
root.addEventListener("click", e => {
  const el = e.target.closest("button");
  if (!el || el.closest(".gpets")) return;
  const msg = $(".gmsg", root);
  if (el.dataset.player) { state.current = el.dataset.player; save(); drawLauncher(); return; }
  if ("new" in el.dataset) return choosePet();
  if (el.dataset.play) return openGame(el.dataset.play);
  if ("copy" in el.dataset) { const i = $(".gcode input[readonly]", root); i.select(); navigator.clipboard?.writeText(i.value).then(() => { msg.textContent = t("js.games.copied", "Copied."); }, () => {}); return; }
  if ("bring" in el.dataset) {
    const d = fromCode($("[data-code]", root).value);
    if (!d) { msg.textContent = t("js.games.bad-code", "That code doesn't look right. Copy the whole thing, starting with AGA1-."); return; }
    const pet = freePets().find(x => x[0] === d.pet)?.[0] || freePets()[0]?.[0];
    if (!pet) { msg.textContent = t("js.games.full", "There's no room for another player on this device."); return; }
    addPlayer(pet, { ...fresh(), ...d.prog }); drawLauncher();
    $(".gmsg", root).textContent = t("js.games.brought", "Added! Their progress is here now.");
    return;
  }
  const p = player();
  if ("reset" in el.dataset && p && confirm(t("js.games.restart-sure", "Start {pet} over? Their scores, levels and badges on this device are cleared.", { pet: petName(p.pet) }))) { state.prog[p.id] = fresh(); save(); drawLauncher(); return; }
  if ("remove" in el.dataset && p && confirm(t("js.games.remove-sure", "Remove {pet} and their progress from this device?", { pet: petName(p.pet) }))) {
    state.players = state.players.filter(x => x.id !== p.id); delete state.prog[p.id]; state.current = state.players[0]?.id || null; save(); drawLauncher();
  }
});
if (!player() && state.players.length) { state.current = state.players[0].id; save(); }
drawLauncher();
loadContent().then(() => { if (!box.open && !$(".gpets", root)) drawLauncher(); }, () => {}); // so a game with nothing to play yet says "Coming soon"
const asked0 = location.hash.match(/^#play-(gog|bs|sc|match|quiz)$/);
if (asked0) openGame(asked0[1]);
})();
