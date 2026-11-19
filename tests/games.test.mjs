// Plays the Animal Guardian Alliance games in Chromium against a fake Supabase, on a phone-sized screen, and checks
// the edit page's game sections. Build the site first, with test data and the root as its base:
//   SITE_TEXT_FILE=tests/fixtures/no-wording.json PAGE_PHOTOS_FILE=tests/fixtures/none.json \
//     ARTICLES_FILE=tests/fixtures/none.json SITE_BASE=/ node site/build.mjs
//   node tests/games.test.mjs
// Prints PASS or FAIL for each check, and exits 1 if any failed.
import { createRequire } from "node:module";
import fs from "node:fs";
import { start } from "./serve.mjs";
const { chromium } = createRequire(import.meta.url)("playwright"); // installed globally, or with npm i playwright

const PORT = 8792, B = `http://127.0.0.1:${PORT}/`;
const SB = JSON.parse(fs.readFileSync(new URL("../site/supabase.json", import.meta.url))).url;
const XSS = '<img src=x onerror="window.__pwned=1">';
const results = [];
const ok = (cond, msg) => results.push((cond ? "PASS " : "FAIL ") + msg);

// what the games read: a small, made-up set, all shown
const DATA = () => ({
  game_situations: [
    ...["A dog sleeping in his bed.", "A cat hiding in a box.", "A dog eating his dinner.", "A puppy chewing a toy."].map((s, i) => ({ id: "s" + i, level: 1, species: i === 1 ? "cat" : "dog", situation: s, light: "red", why: "Why " + i, green_line: "Green nudge " + i, yellow_line: "Yellow nudge " + i, red_line: "Red praise " + i, sort: i })),
    { id: "s4", level: 1, species: "dog", situation: "A dog in a play bow.", light: "green", why: "Play bow", green_line: "Green praise", yellow_line: "Yellow nudge", red_line: "Red nudge", sort: 5 },
    { id: "s5", level: 1, species: "bunny", situation: "A bunny sniffing your hand." + XSS, light: "yellow", why: "Let her sniff", green_line: "G", yellow_line: "Yellow praise", red_line: "R", sort: 6 },
    { id: "s6", level: 2, species: "cat", situation: "A cat with flat ears.", light: "red", why: "Flat ears", green_line: "G", yellow_line: "Y", red_line: "R", sort: 1 },
  ],
  game_questions: [
    { id: "q1", level: 1, kind: "tf", question: "Dogs can eat chocolate.", choices: ["True", "False"], answer: 2, hint: null, why: "Chocolate makes dogs sick.", reward: null, sort: 1 },
    { id: "q2", level: 1, kind: "mc", question: "What should a dog's bowl have every day?" + XSS, choices: ["Water", "Juice", "Milk"], answer: 1, hint: "Think about what you drink.", why: null, reward: "Yes! Fresh water.", sort: 2 },
    { id: "q3", level: 1, kind: "mc", question: "A doctor for pets is a...", choices: ["Veterinarian", "Pilot"], answer: 1, hint: null, why: null, reward: null, sort: 3 },
    { id: "q4", level: 2, kind: "scenario", question: "A dog is tied up outside a shop. What do you do?", choices: ["Pet him", "Leave him be"], answer: 2, hint: "He might feel trapped.", why: null, reward: "Boss move!", sort: 1 },
    { id: "bad", level: 1, kind: "mc", question: "Broken: answer out of range", choices: ["A", "B"], answer: 5, sort: 9 },
  ],
  match_pairs: [
    { id: "p1", level: 1, title: "The Play Bow", tile: "A dog in a play bow", cue: "Bottom up, front down", question: "What is this dog asking?", choices: ["Leave me alone", "Let's play!"], answer: 2, reward: "Yes! A play bow invites play.", photo_url: "assets/games/pair-01-play-bow.jpg", photo_frame: null, sort: 1 },
    { id: "p2", level: 1, title: "The Slow Blink", tile: "A cat blinking slowly", cue: null, question: "What does a slow blink mean?", choices: ["Something in her eye", "She trusts you"], answer: 2, reward: "A kitty kiss!", photo_url: "assets/games/pair-02-slow-blink.jpg", photo_frame: null, sort: 2 },
    { id: "p3", level: 1, title: "The Tucked Tail" + XSS, tile: "A dog with a tucked tail", cue: "Tail tucked under", question: "What should you do?", choices: ["Hug him", "Give him space"], answer: 2, reward: "Space helps him feel brave.", photo_url: "assets/games/pair-05-tucked-tail.jpg", photo_frame: null, sort: 3 },
    { id: "p5", level: 2, title: "Raised Hackles", tile: "A dog with raised fur", cue: "Fur up along the back", question: "What does it mean?", choices: ["Big feelings", "Needs a haircut"], answer: 1, reward: "Like goosebumps!", photo_url: "assets/games/pair-06-happy-greeting.jpg", photo_frame: null, sort: 2 },
    { id: "p4", level: 2, title: "Whale Eye", tile: "A dog showing the whites of his eyes", cue: null, question: "What do you do?", choices: ["Step back", "Take the bone"], answer: 1, reward: "Safe choice!", photo_url: "assets/games/pair-04-puffed-up-tail.jpg", photo_frame: null, sort: 1 },
  ],
  game_art: [],
});

function fakeSupabase(data, log) {
  const tokens = new Set();
  return async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    const json = (status, body) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(body) });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const auth = (req.headers().authorization || "").replace("Bearer ", "");
    log.push({ m, path: u.pathname, body: req.postData() || null, auth: tokens.has(auth) });
    if (u.pathname === "/auth/v1/token") { tokens.add("tok1"); return json(200, { access_token: "tok1", refresh_token: "r1", expires_in: 3600, user: { email: "editor@example.com" } }); }
    if (u.pathname === "/rest/v1/rpc/count_view") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (u.pathname === "/rest/v1/rpc/is_admin") return json(200, tokens.has(auth));
    if (u.pathname === "/rest/v1/rpc/visitor_summary") return json(200, { from: "2026-11-01", days: [], pages: [], sources: [], missed: [] });
    if (u.pathname.startsWith("/storage/")) return json(200, []);
    if (u.pathname.startsWith("/functions/")) return json(200, {});
    if (!u.pathname.startsWith("/rest/v1/")) return route.abort();
    const table = u.pathname.slice(9), rows = data[table] || [];
    if (m === "GET") {
      let out = rows;
      for (const [k, v] of u.searchParams) if (v.startsWith("eq.") && !["select", "order"].includes(k)) out = out.filter(r => String(r[k]) === v.slice(3));
      if (u.searchParams.get("photo_url") === "not.is.null") out = out.filter(r => r.photo_url);
      return json(200, out);
    }
    if (!tokens.has(auth)) return json(403, { message: "permission denied" });
    const body = JSON.parse(req.postData() || "null");
    if (m === "POST") { const row = { id: "new" + rows.length, ...body }; (data[table] ||= []).push(row); return json(201, [row]); }
    if (m === "PATCH") { const id = (u.searchParams.get("id") || "").slice(3), r = rows.find(x => String(x.id) === id); Object.assign(r || {}, body); return json(200, r ? [r] : []); }
    return json(200, []);
  };
}

const server = await start(PORT);
const browser = await chromium.launch();
async function newPage({ random } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const data = DATA(), log = [];
  await ctx.route(SB + "/**", fakeSupabase(data, log));
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ctx.addInitScript(r => {
    window.__said = [];
    if (window.speechSynthesis) speechSynthesis.speak = u => window.__said.push(u.text);
    if (r !== null) Math.random = () => r; // a fixed "dice" where the test needs one
  }, random ?? null);
  const p = await ctx.newPage();
  p.errs = []; p.dialogs = [];
  p.on("pageerror", e => p.errs.push(e.message));
  p.on("console", msg => { if (msg.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(msg.text())) p.errs.push(msg.text()); });
  p.on("dialog", d => { p.dialogs.push(d.message()); d.accept(); });
  return { ctx, p, data, log };
}
const wait = (p, ms = 250) => p.waitForTimeout(ms);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem("tt-aga-games") || "null"));
const pwned = p => p.evaluate(() => !!window.__pwned);
// answers the question showing in the pop-up: right, or (wrong = true) the first wrong answer
async function answerPop(p, data, wrong = false) {
  const text = (await p.locator(".gpop .gq").first().innerText()).trim();
  const qn = [...data.game_questions].find(x => x.question === text);
  const i = wrong ? (qn.answer === 1 ? 2 : 1) : qn.answer;
  await p.click(`.gpop .gchoice[data-i="${i}"]`); await wait(p, 150);
  return qn;
}

// ---------- the Alliance page: who's playing and the four games ----------
{
  const { ctx, p, data, log } = await newPage();
  await p.goto(B + "animal-guardian-alliance/"); await wait(p, 600);
  ok(await p.locator("#games").isVisible() && (await p.locator(".gcardl").count()) === 4, "the Alliance page has a games section with four games");
  ok((await p.locator(".gcardl h3").allInnerTexts()).join("|") === "Go on Green|Baby Steps|Matching|Quizzes", "Go on Green, Baby Steps, Matching and Quizzes");
  ok(await p.locator(".gpet.add").isVisible() && (await p.locator(".gpet[data-player]").count()) === 0, "nobody's playing yet: a New player button");
  ok((await p.locator('.phead a[href="#games"]').count()) === 1, "the top of the page links to the games");
  ok(!(await overflow(p)) && !p.errs.length, "the page fits the phone, no errors" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));

  // ---------- Go on Green ----------
  await p.click('[data-play="gog"]'); await wait(p);
  ok(await p.locator(".gpets").isVisible() && (await p.locator(".gpets .gpet").count()) === 8, "playing with no player first asks the child to pick an animal (8 to choose from)");
  await p.click('.gpets [data-pet="fox"]'); await wait(p, 600);
  ok(await p.locator("dialog.gbox[open]").isVisible() && (await p.locator("#gtitle").innerText()) === "Go on Green" && (await p.locator(".gwho").innerText()) === "🦊", "the game opens full screen, with the fox as the player");
  ok((await p.locator(".glight").allInnerTexts()).map(s => s.replace(/\s+/g, " ").trim()).join("|") === "🟢 Go|🟡 Slow down|🔴 Stop", "three lights: Go, Slow down, Stop");
  await p.click("[data-read]"); await wait(p, 100);
  ok((await p.evaluate(() => window.__said)).some(s => /^A (dog|cat|bunny|puppy)/.test(s)), "Read it to me reads the situation aloud");
  let bones = 0, first = true;
  for (let n = 0; n < 6; n++) {
    if (await p.locator(".gbone").count()) {
      await p.click(".gbone", { force: true }); await wait(p);
      ok(await p.locator(".gpop .gkicker").innerText() === "BONE QUESTION" || /bone question/i.test(await p.locator(".gpop .gkicker").innerText()), "a bone pops up a question");
      if (bones === 0) { await answerPop(p, data, true); ok(await p.locator(".gpop .gchoice.notthis").count() === 1 && (await p.locator(".gpop [data-next]").count()) === 0, "a wrong bone answer gets one more try"); }
      await answerPop(p, data); await p.click(".gpop [data-next]"); await wait(p);
      bones++;
    }
    const text = (await p.locator(".gsit").innerText()).trim(), s = data.game_situations.find(x => x.situation === text);
    if (first) {
      const wrong = s.light === "red" ? "green" : "red";
      await p.click(`[data-light="${wrong}"]`); await wait(p, 100);
      ok((await p.locator(".gog .gfeed").innerText()) === s[wrong + "_line"] && await p.locator(`[data-light="${wrong}"]`).isDisabled(), "a wrong light says its gentle line, and that light is set aside");
      first = false;
    }
    await p.click(`[data-light="${s.light}"]`); await wait(p, 150);
    ok((await p.locator(".gog .gfeed").innerText()).startsWith(s[s.light + "_line"]), `the right light praises and explains (${n + 1})`);
    await p.click(".gog [data-next]"); await wait(p);
  }
  ok(!(await pwned(p)), "situations and questions show as text");
  const done = (await p.locator(".gdone").innerText()).replace(/\s+/g, " ");
  ok(/Round done!/.test(done) && /11 points/.test(done) && /5 of 6 on the first try/.test(done) && /On to Level 2!/.test(done) && /New badge: Go on Green, Level 1!/.test(done), "end of the round: 1 point for a second-try light, 2 for first tries; most right moves up a level, with a badge: " + done);
  let st = await saved(p), fox = st.players[0];
  ok(st.prog[fox.id].gog.level === 2 && st.prog[fox.id].gog.bones === bones && bones === 2 && st.prog[fox.id].badges.includes("gog-1") && st.prog[fox.id].gog.best[1] === 11, "kept on this device: level 2, 2 bones, the badge, the best score");
  await p.click(".gdone [data-back]"); await wait(p);
  ok(!(await p.locator("dialog.gbox[open]").count()) && (await p.locator(".gcardl").first().locator(".gstars .on").count()) === 1, "back on the page, Go on Green shows one star");

  // ---------- Matching ----------
  await p.click('[data-play="match"]'); await wait(p, 600);
  ok((await p.locator(".gflip").count()) === 6, "Matching: the level's 3 pairs as 6 cards, face down");
  const srcs = await p.$$eval(".gflip img", is => is.map(i => i.getAttribute("src")));
  const byPair = {}; srcs.forEach((s, i) => (byPair[s] ||= []).push(i));
  const [pa, pb] = Object.values(byPair);
  await p.click(`.gflip[data-i="${pa[0]}"]`); await p.click(`.gflip[data-i="${pb[0]}"]`); await wait(p, 1400);
  ok((await p.locator(".gflip.up").count()) === 0, "two cards that don't match turn back over, with no penalty");
  await p.click(`.gflip[data-i="${pa[0]}"]`); await p.click(`.gflip[data-i="${pa[1]}"]`); await wait(p, 300);
  const title = await p.locator(".gpop .gq").innerText(), pair = data.match_pairs.find(x => x.title === title);
  ok(pair && (await p.locator(".gpop .gpairimg").isVisible()) && (!pair.cue || (await p.locator(".gpop .gcue").innerText()).includes(pair.cue)), "a match shows the photo, what to notice and the question");
  await p.click(`.gpop .gchoice[data-i="${pair.answer === 1 ? 2 : 1}"]`); await wait(p, 150);
  ok((await p.locator(".gpop .gfeed").innerText()).startsWith("Here's what it means:") && (await p.locator(".gpop .gchoice.right").count()) === 1, "a wrong answer explains, gently");
  await p.click(".gpop [data-next]"); await wait(p, 200);
  ok((await p.locator(".gflip.up").count()) === 0, "then the pair turns back over to be found again");
  for (const ids of Object.values(byPair)) {
    await p.click(`.gflip[data-i="${ids[0]}"]`); await p.click(`.gflip[data-i="${ids[1]}"]`); await wait(p, 300);
    const t2 = await p.locator(".gpop .gq").innerText(), pr = data.match_pairs.find(x => x.title === t2);
    await p.click(`.gpop .gchoice[data-i="${pr.answer}"]`); await wait(p, 100);
    await p.click(".gpop [data-next]"); await wait(p, 200);
  }
  const mdone = (await p.locator(".gdone").innerText()).replace(/\s+/g, " ");
  ok(/8 points/.test(mdone) && /On to Level 2!/.test(mdone) && /New badge: Matching, Level 1!/.test(mdone), "matching every pair: 2 for a match and answer, 1 more first time; all of a level's pairs seen moves up: " + mdone);
  ok(!(await pwned(p)), "pair names show as text");
  await p.click(".gdone [data-again]"); await wait(p, 600);
  ok((await p.locator(".gflip").count()) === 4 && (await p.locator(".gstep").innerText()) === "Level 2", "the next round is Level 2's pairs");
  await p.click(".gclose"); await wait(p);

  // ---------- Quizzes ----------
  await p.click('[data-play="quiz"]'); await wait(p, 600);
  ok((await p.locator("[data-level]").allInnerTexts()).map(s => s.trim()).join("|") === "Level 1: Easy|Level 2: Medium", "Quizzes: one for each level that has questions");
  await p.click('[data-level="1"]'); await wait(p);
  ok((await p.locator(".gpop .gchoices.tf .gchoice").count()) === 2, "a true or false question has two big buttons");
  await answerPop(p, data, true);
  ok((await p.locator(".gpop .gfeed").innerText()).startsWith("Not quite"), "a wrong answer: another try");
  await answerPop(p, data);
  ok((await p.locator(".gpop .gfeed").innerText()) === "Chocolate makes dogs sick.", "the right answer explains why");
  await p.click(".gpop [data-next]"); await wait(p);
  for (let k = 0; k < 2; k++) { await answerPop(p, data); await p.click(".gpop [data-next]"); await wait(p); }
  const qdone = (await p.locator(".gdone").innerText()).replace(/\s+/g, " ");
  ok(/5 points/.test(qdone) && /New badge: Quizzes, Level 1!/.test(qdone) && !/Broken/.test(await p.content()), "the quiz: 2 points first try, 1 on the second; a broken question is left out: " + qdone);
  await p.click(".gdone [data-again]"); await wait(p);
  ok((await p.locator('[data-level="1"]').innerText()).includes("🏅"), "a finished quiz shows its medal");
  await p.click(".gmute"); await wait(p, 100);
  ok((await p.locator(".gmute").getAttribute("aria-pressed")) === "true" && (await saved(p)).muted === true, "the mute button is remembered");
  await p.click(".gclose"); await wait(p);

  // ---------- players and moving progress ----------
  await p.click(".ggrown summary");
  const code = await p.locator(".gcode input[readonly]").inputValue();
  ok(/^AGA1-[A-Za-z0-9_-]+$/.test(code), "a move code for the fox's progress");
  await p.click(".gpet.add"); await p.click('.gpets [data-pet="owl"]'); await wait(p);
  ok((await p.locator(".gpet[data-player]").count()) === 2 && (await p.locator(".gpet.on").innerText()).includes("Owl") && (await p.locator(".gstars .on").count()) === 0, "a second player, the owl, starts fresh");
  await p.click(".ggrown summary");
  await p.fill("[data-code]", "nonsense"); await p.click("[data-bring]"); await wait(p, 100);
  ok((await p.locator(".gmsg").innerText()).startsWith("That code doesn't look right"), "a bad code is turned away");
  await p.fill("[data-code]", code); await p.click("[data-bring]"); await wait(p, 100);
  st = await saved(p);
  const brought = st.players.find(x => x.id === st.current);
  ok(st.players.length === 3 && brought.pet !== "fox" && st.prog[brought.id].badges.length === 3 && st.prog[brought.id].gog.level === 2, "the code brings the fox's progress in as a new player (the fox is taken here, so a free animal)");
  await p.click(".ggrown summary"); await p.click("[data-remove]"); await wait(p, 100);
  ok(p.dialogs.some(d => d.startsWith("Remove")) && (await saved(p)).players.length === 2, "a player can be removed, after asking");
  const writes = log.filter(l => l.m !== "GET" && l.m !== "OPTIONS" && l.path !== "/rest/v1/rpc/count_view");
  ok(!writes.length && log.filter(l => l.path.startsWith("/rest/v1/game") || l.path.startsWith("/rest/v1/match")).every(l => l.m === "GET"), "the games only read; nothing about the child is sent " + JSON.stringify(writes));
  ok(!p.errs.length && !(await pwned(p)), "no errors" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
  await ctx.close();
}

// ---------- Baby Steps, with a dice that always says no until the fourth roll ----------
{
  const { ctx, p, data } = await newPage({ random: 0.9 });
  await p.goto(B + "animal-guardian-alliance/#play-bs"); await wait(p, 600);
  await p.click('.gpets [data-pet="frog"]'); await wait(p, 600);
  ok((await p.locator(".gcell").count()) === 54 && await p.locator(".gcell.me").getAttribute("data-i") === "0" && (await p.locator(".gcell.step").count()) === 2, "Baby Steps: a 6 by 9 board, the frog at the start, two squares to step to");
  const box = await p.locator(".ggrid").boundingBox();
  ok(box.width <= 390 && !(await p.evaluate(() => document.querySelector(".gbody").scrollWidth > document.querySelector(".gbody").clientWidth)), "the board fits the phone");
  const cells = async () => p.$$eval(".gcell", cs => cs.map(c => ({ i: Number(c.dataset.i), me: c.classList.contains("me"), label: c.getAttribute("aria-label") || "", ani: c.classList.contains("ani") })));
  const near = (a, b) => Math.abs(a % 6 - b % 6) + Math.abs(Math.floor(a / 6) - Math.floor(b / 6)) === 1;
  async function walkTo(goal) { // steps square by square to the nearest square that meets the goal, around animals, bones and the bowl
    const cs0 = await cells(), at0 = cs0.find(c => c.me).i;
    if (goal(at0, cs0)) return at0;
    const prev0 = new Map([[at0, null]]), todo0 = [at0], free = c => !c.ani && !c.label.startsWith("A ");
    let target = null;
    while (todo0.length && target === null) { const c = todo0.shift(); for (const d of cs0.filter(x => near(x.i, c) && !x.ani && !prev0.has(x.i))) { prev0.set(d.i, c); if (goal(d.i, cs0)) { target = d.i; break; } if (free(d)) todo0.push(d.i); } }
    if (target === null) return null;
    for (let guard = 0; guard < 80; guard++) {
      const cs = await cells(), at = cs.find(c => c.me).i;
      if (at === target) return at;
      const prev = new Map([[at, null]]), todo = [at];
      let end = null;
      while (todo.length && end === null) { const c = todo.shift(); for (const d of cs.filter(x => near(x.i, c) && !x.ani && !prev.has(x.i))) { prev.set(d.i, c); if (d.i === target) { end = d.i; break; } if (free(d)) todo.push(d.i); } }
      if (end === null) return null;
      let step = end; while (prev.get(step) !== at) step = prev.get(step);
      await p.click(`.gcell[data-i="${step}"]`); await wait(p, 150);
      if (await p.locator(".gpop .gq").count()) { await answerPop(p, data); await p.click(".gpop [data-next]"); await wait(p, 150); }
    }
    return null;
  }
  await walkTo((i, cs) => cs[i].label === "A bone");
  ok(/🦴 1/.test(await p.locator(".gscore").innerText()), "stepping on a bone asks a question; a right answer puts the bone in the supply");
  const now = await cells(), here = now.find(x => x.me).i, far = now.find(c => c.ani && !near(c.i, here));
  if (far) { await p.click(`.gcell[data-i="${far.i}"]`); await wait(p, 150); ok((await p.locator(".gtip").innerText()).startsWith("Take baby steps"), "an animal that's too far away: take baby steps first"); }
  const animalNear = (i, cs) => cs.some(c => c.ani && near(c.i, i));
  let which = null; // the same animal each time, so its no's add up
  const meetOne = async () => { const cs = await cells(), at = cs.find(c => c.me).i, a = cs.find(c => c.ani && near(c.i, at) && (which === null || c.i === which)); which = a.i; await p.click(`.gcell[data-i="${a.i}"]`); await wait(p, 1200); return a.i; };
  await walkTo(animalNear);
  await meetOne();
  ok(/says not right now/.test(await p.locator(".gpop h3").innerText()) && (await p.locator('.gpop [data-k="bone"]').count()) === 1, "the dice says no: offer a bone, walk away, or try to pet anyway");
  await p.click('.gpop [data-k="pet"]'); await wait(p, 150);
  ok(/said no, and that's okay/.test(await p.locator(".gpop h3").innerText()) && /When you say no, you want people to listen too/.test(await p.locator(".gpop").innerText()), "trying to pet anyway: a gentle line about how no feels");
  await p.click('.gpop [data-k="ok"]'); await wait(p, 150);
  ok(await p.locator(".gcell.me").getAttribute("data-i") === "0", "and back to the start");
  await walkTo(i => near(i, which));
  await meetOne();
  await p.click('.gpop [data-k="bone"]'); await wait(p, 1200);
  ok(/says not right now/.test(await p.locator(".gpop h3").innerText()) && !(await p.locator('.gpop [data-k="bone"]').count()), "offering the bone rolls again (still no, and the bone is used)");
  await p.click('.gpop [data-k="away"]'); await wait(p, 150);
  await meetOne();
  ok(/says yes!/.test(await p.locator(".gpop h3").innerText()), "never more than 3 no's in a row from the same animal: the fourth roll is a yes");
  await p.click('.gpop [data-k="pet"]'); await wait(p, 300);
  ok(/⭐ 5/.test(await p.locator(".gscore").innerText()) && /said yes: 1 of 3/.test(await p.locator(".gbs .gstep").innerText()), "petting a yes: 5 points, one friend of three");
  ok(!p.errs.length && !(await pwned(p)) && !(await overflow(p)), "Baby Steps: no errors" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
  await ctx.close();
}

// ---------- the edit page: the games' sections ----------
{
  const { ctx, p, data, log } = await newPage();
  await p.goto(B + "edit/"); await wait(p, 500);
  await p.fill("input[name=email]", "editor@example.com"); await p.fill("input[name=password]", "x"); await p.click("#signin button"); await wait(p, 700);
  const groups = await p.$$eval(".tgroup", g => g.map(x => x.querySelector("h2").innerText + ": " + [...x.querySelectorAll(".tile b")].map(b => b.innerText).join(", ")));
  ok(groups.includes("Animal Guardian Alliance games: Go on Green, Matching, Questions, Pictures"), "the start screen has the games: " + groups.join(" | "));
  await p.goto(B + "edit/#/situations"); await wait(p, 500);
  ok((await p.locator(".rows li[data-s]").count()) === 7, "Go on Green lists its situations");
  await p.goto(B + "edit/#/situations/new"); await wait(p, 400);
  await p.check('input[name=level][value="2"]'); await p.check('input[name=species][value="cat"]'); await p.check('input[name=light][value="yellow"]');
  await p.fill("textarea[name=situation]", "A cat watching you from a shelf.");
  await p.fill("textarea[name=yellow_line]", "You waited. That's kind.");
  await p.click(".savebar button"); await wait(p, 500);
  const post = log.find(l => l.m === "POST" && l.path === "/rest/v1/game_situations");
  const body = post && JSON.parse(post.body);
  ok(body && body.level === 2 && body.species === "cat" && body.light === "yellow" && body.situation === "A cat watching you from a shelf." && body.published === true, "a new situation saves with its level as a number " + (post && post.body));
  await p.goto(B + "edit/#/questions/new"); await wait(p, 400);
  await p.fill("textarea[name=question]", "Cats like slow blinks."); await p.fill("textarea[name=choices]", "True\nFalse"); await p.fill("input[name=answer]", "3");
  await p.click(".savebar button"); await wait(p, 300);
  ok(await p.locator('[data-f="answer"] .err').isVisible(), "a right answer that isn't one of the lines is caught");
  await p.fill("input[name=answer]", "1"); await p.click(".savebar button"); await wait(p, 500);
  const qpost = log.find(l => l.m === "POST" && l.path === "/rest/v1/game_questions");
  ok(qpost && JSON.parse(qpost.body).choices.join("|") === "True|False" && JSON.parse(qpost.body).answer === 1, "a question saves its answers as a list " + (qpost && qpost.body));
  await p.goto(B + "edit/#/pairs"); await wait(p, 500);
  ok((await p.locator(".rows li", { hasText: "Whale Eye" }).innerText()).toLowerCase().includes("needs “what to notice”"), "Matching pairs flag what's still missing");
  await p.goto(B + "edit/#/gameart/new"); await wait(p, 400);
  ok((await p.locator('input[name=kind][value="bowl"]').count()) === 1 && (await p.locator('[data-f="photo_url"]').innerText()).includes("see-through"), "Game pictures: dog, cat, bunny, bone or food bowl, with a see-through background");
  const cfg = await p.evaluate(() => JSON.parse(document.getElementById("config").textContent));
  ok((cfg.textDefaults || []).some(w => w.key === "js.games.gog" && w.text === "Go on Green"), "the games' words can be changed on the Wording screen");
  ok(!p.errs.length, "edit page: no errors" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
  await ctx.close();
}

await browser.close();
server.close();
console.log(results.join("\n"));
const failed = results.filter(r => r.startsWith("FAIL")).length;
console.log(`${failed} failed of ${results.length}`);
process.exit(failed ? 1 : 0);
