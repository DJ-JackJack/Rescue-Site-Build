// Drives the edit page (/edit/) in Chromium against the fake Supabase in fake-supabase.mjs: signing in and out, the
// start screen, lists and forms, photos, messages, wording, scheduling, fan art, recently deleted and visitors.
// Build the site first, with test data and the root as its base:
//   SITE_TEXT_FILE=tests/fixtures/no-wording.json PAGE_PHOTOS_FILE=tests/fixtures/none.json \
//     ARTICLES_FILE=tests/fixtures/none.json SITE_BASE=/ node site/build.mjs
//   node tests/edit.test.mjs
// Prints PASS or FAIL for each check, and exits 1 if any failed.
import { fakeSupabase, setup, newPage, ok, report, wait, overflow, pwned, errors, fixture, TODAY } from "./fake-supabase.mjs";

const { B, browser, close } = await setup(8794);
const E = B + "edit/";
const toast = p => p.locator("#toast").innerText();
const h1 = p => p.locator("#app h1").first().innerText();
const writes = (sb, table, method) => sb.writes().filter(w => w.table === table && (!method || w.method === method));
async function signIn(p, password = "right-pass") {
  await p.goto(E); await wait(p, 300);
  await p.fill('#signin [name="email"]', "editor@example.com");
  await p.fill('#signin [name="password"]', password);
  await p.click("#signin button"); await wait(p, 700);
}

// ---------- signing in ----------
{
  const { ctx, p, sb } = await newPage(browser);
  await p.goto(E); await wait(p, 400);
  ok(await p.locator("#signin").isVisible() && (await h1(p)) === "Sign in to edit the site", "signed out, the edit page asks to sign in");
  ok(!(await p.locator("#signout").isVisible()), "no Sign out button before signing in");
  await p.click("#signin button"); await wait(p, 100);
  ok((await p.locator("#signin .formmsg").innerText()) === "Please enter your email and password.", "an empty sign-in asks for the email and password");
  await signIn(p, "wrong-pass");
  ok(/don't match/.test(await p.locator("#signin .formmsg").innerText()), "a wrong password says the email and password don't match");
  ok(await p.locator("#signin button").isEnabled() && (await p.locator("#signin button").innerText()) === "Sign in", "after a failed try, the button works again");
  await signIn(p);
  ok((await h1(p)) === "Hi! What needs updating?", "the right password opens the start screen");
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem("tt-editor-session")));
  ok(kept && kept.access && kept.refresh && kept.email === "editor@example.com", "the sign-in is kept on this device");
  ok(/Signed in as editor@example\.com/.test(await p.locator(".foot").innerText()), "the start screen says who's signed in");
  await p.reload(); await wait(p, 700);
  ok((await h1(p)) === "Hi! What needs updating?", "a reload stays signed in");
  ok(!(await overflow(p)) && !p.errs.length && !(await pwned(p)), "the start screen fits a phone, with no errors and nothing run from the data" + errors(p));
  await p.click("#signout"); await wait(p, 500);
  ok((await h1(p)) === "Sign in to edit the site" && sb.log.some(l => l.logout), "Sign out signs out on the server and goes back to the sign-in");
  ok((await p.evaluate(() => localStorage.getItem("tt-editor-session"))) === null, "signing out forgets the sign-in on this device");
  await ctx.close();
}

// ---------- an account that isn't on the editor list ----------
{
  const { ctx, p } = await newPage(browser, { sb: fakeSupabase({ editor: false }) });
  await signIn(p);
  ok((await h1(p)) === "Not on the editor list yet" && /editor@example\.com/.test(await p.locator("#app").innerText()), "an account that isn't an editor is told so, by email");
  await p.click('[data-act="signout"]'); await wait(p, 500);
  ok((await h1(p)) === "Sign in to edit the site", "and can sign out from there");
  await ctx.close();
}

// ---------- an old sign-in is refreshed; a revoked one asks to sign in again ----------
{
  const sb = fakeSupabase(), s = sb.session();
  const { ctx, p } = await newPage(browser, { sb, init: `localStorage.setItem("tt-editor-session", ${JSON.stringify(JSON.stringify({ ...s, exp: Date.now() - 1000 }))})` });
  await p.goto(E); await wait(p, 800);
  ok((await h1(p)) === "Hi! What needs updating?" && sb.log.some(l => l.auth === "refresh_token"), "an expired sign-in is renewed quietly, without asking for the password");
  await ctx.close();
}
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/animals/a1"); await wait(p, 700);
  sb.signOutEveryone();
  await p.fill('[name="note"]', "Changed"); await p.click(".savebar .btn"); await wait(p, 600);
  ok((await h1(p)) === "Sign in to edit the site", "a sign-in that's been ended elsewhere goes back to the sign-in");
  ok(!writes(sb, "animals").length, "and nothing was saved");
  await ctx.close();
}

// ---------- the start screen: what needs attention, and the tiles ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E); await wait(p, 800);
  const todo = (await p.locator(".todo").innerText()).replace(/\s+/g, " ");
  ok(/1 new message/.test(todo), "needs attention: the new message");
  ok(/1 new piece of fan art/.test(todo), "needs attention: fan art waiting for a look");
  ok(/Ghost: still available\?/.test(todo) && /Hidden from the site until re-checked/.test(todo), "needs attention: a dog not checked in 4 weeks, hidden until re-checked");
  ok(!/Rocket: still available/.test(todo), "a dog checked 3 days ago doesn't need checking");
  ok(/Crates for transport: new numbers\?/.test(todo) && !/Hay for the herds/.test(todo), "needs attention: a goal with old numbers (not one with new ones)");
  ok(/Sleepover Club: details still right\?/.test(todo) && /Foster Heroes/.test(todo) === false, "needs attention: a program not checked in 3 months");
  ok(/Bay Humane: details still right\?/.test(todo) && /Never checked/.test(todo), "needs attention: a foster program never checked");
  ok(/Low Cost Vet: still running\?/.test(todo) && !/Pet Pantry: still running/.test(todo), "needs attention: a help listing not checked in 6 months");
  const tiles = await p.$$eval(".tile", ts => Object.fromEntries(ts.map(t => [t.getAttribute("href"), t.innerText.replace(/\s+/g, " ").trim()])));
  ok(/1 new/.test(tiles["#/messages"]) && /15 animals/.test(tiles["#/animals"]) && /3 active goals/.test(tiles["#/goals"]), "tiles count what's in each: messages, animals, active goals " + [tiles["#/messages"], tiles["#/animals"], tiles["#/goals"]].join(" / "));
  ok(/1 waiting/.test(tiles["#/fanart"]) && /3 names/.test(tiles["#/supporters"]), "the fan art tile says what's waiting; supporters counts names");
  ok(/12 views this week/.test(tiles["#/visitors"]), "the visitors tile has this week's views: " + tiles["#/visitors"]);
  ok(Object.keys(tiles).length >= 20, "a tile for every section and screen (" + Object.keys(tiles).length + ")");
  // one tap: still available
  await p.click('.todo [data-act="checked"][data-id="a7"]'); await wait(p, 700);
  ok(sb.D.animals.find(a => a.id === "a7").checked_on === TODAY && (await toast(p)).includes("checked today"), "Still available marks the dog checked today");
  ok(!/Ghost: still available/.test(await p.locator("#app").innerText()), "and it leaves the list");
  await p.click('.todo [data-act="checked"][data-t="help_resources"]'); await wait(p, 700);
  ok(sb.D.help_resources.find(r => r.id === "h3").checked_on === TODAY, "Still running marks the help listing checked today");
  ok(!(await pwned(p)) && !p.errs.length, "start screen: no errors" + errors(p));
  await ctx.close();
}

// ---------- a list: search, the escaped names, opening one ----------
{
  const { ctx, p } = await newPage(browser, { session: true });
  await p.goto(E + "#/animals"); await wait(p, 700);
  ok((await h1(p)) === "Animals" && (await p.locator(".rows li[data-s]").count()) === 15, "the animals list shows all 15, hidden ones too");
  ok((await p.locator(".rows").innerText()).includes("Shadow<img"), "a name with code in it shows as plain text");
  await p.fill("#find", "bisc"); await wait(p, 150);
  ok((await p.locator(".rows li[data-s]:visible").count()) === 1, "search narrows the list as you type");
  await p.fill("#find", "zzzz"); await wait(p, 150);
  ok(await p.locator(".none").isVisible(), "a search with no matches says so");
  await p.fill("#find", ""); await p.click('.rows a[href="#/animals/a8"]'); await wait(p, 600);
  ok((await h1(p)) === "Hidden Hank" && !(await p.locator('[name="published"]').isChecked()), "opening one shows its form, with Show on the site off for a hidden one");
  await p.goto(E + "#/animals/nope"); await wait(p, 600);
  ok((await h1(p)) === "Not found", "an address for something that isn't there says Not found");
  await p.goto(E + "#/nonsense"); await wait(p, 600);
  ok((await h1(p)) === "Hi! What needs updating?", "an unknown screen goes back to the start");
  ok(!(await pwned(p)) && !p.errs.length, "lists: no errors" + errors(p));
  await ctx.close();
}

// ---------- a form: changing, checking, adding, deleting ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/animals/a4"); await wait(p, 700);
  ok((await p.inputValue('[name="note"]')) === "Loves car rides", "the form is filled in from what's saved");
  ok(await p.locator('[data-f="adopted_on"]').isVisible() && !(await p.locator('[data-f="checked_on"]').isVisible()), "fields that only fit some animals show only then (adoption date for an adopted dog)");
  await p.check('[name="status"][value="looking"]'); await wait(p, 100);
  ok(await p.locator('[data-f="checked_on"]').isVisible() && !(await p.locator('[data-f="adopted_on"]').isVisible()), "switching to Still looking shows the checked date instead");
  ok((await p.inputValue('[name="checked_on"]')) === TODAY, "and fills it in with today");
  await p.check('[name="status"][value="adopted"]');
  await p.fill('[name="note"]', "Loves car rides and naps");
  await p.click(".savebar .btn"); await wait(p, 700);
  const patch = writes(sb, "animals", "PATCH")[0];
  ok(patch && patch.body.note === "Loves car rides and naps" && !("name" in patch.body), "Save sends only what changed: " + JSON.stringify(patch?.body));
  ok((await toast(p)) === "Saved ✓" && (await h1(p)) === "Animals", "then says Saved and goes back to the list");

  // a required field left empty
  await p.goto(E + "#/animals/new"); await wait(p, 600);
  ok((await h1(p)) === "Add animal" && (await p.locator('[name="published"]').isChecked()) && (await p.locator('[name="people_ok"]').isChecked()), "a new animal starts shown, with the OK box on");
  await p.click(".savebar .btn"); await wait(p, 200);
  ok((await p.locator(".eform .formmsg").innerText()) === "Please fix the highlighted fields." && !writes(sb, "animals", "POST").length, "a missing name stops the save, and says what to fix");
  await p.fill('[name="name"]', "Waffles");
  await p.fill('[name="listing_url"]', "someone@gmail.com");
  await p.click(".savebar .btn"); await wait(p, 200);
  ok(!writes(sb, "animals", "POST").length, "an email typed in a link box isn't saved as a link");
  await p.fill('[name="listing_url"]', "https://example.org/waffles");
  await p.click(".savebar .btn"); await wait(p, 700);
  const added = writes(sb, "animals", "POST")[0];
  ok(added && added.body.name === "Waffles" && added.body.status === "looking" && added.body.listing_url === "https://example.org/waffles", "Add saves the new animal: " + JSON.stringify(added?.body).slice(0, 160));
  ok((await toast(p)) === "Added ✓" && sb.D.animals.some(a => a.name === "Waffles"), "and says Added");

  // deleting, then bringing it back
  await p.goto(E + "#/animals/a2"); await wait(p, 600);
  await p.click('[data-act="delete"]'); await wait(p, 700);
  ok(/Delete “Pepper”\?/.test(p.dialogs.at(-1)) && /Recently deleted/.test(p.dialogs.at(-1)), "Delete asks first, and says it can be brought back");
  ok(!sb.D.animals.some(a => a.id === "a2") && (await toast(p)) === "Deleted", "then deletes it");
  await p.goto(E + "#/deleted"); await wait(p, 600);
  const item = p.locator(".msg.del", { hasText: "Pepper" });
  ok(await item.isVisible() && /animal/i.test(await item.innerText()), "it's in Recently deleted");
  await item.locator('[data-act="restore"]').click(); await wait(p, 700);
  ok(sb.D.animals.some(a => a.id === "a2") && (await toast(p)) === "Restored ✓", "Restore brings it back");
  ok(!(await pwned(p)) && !p.errs.length, "forms: no errors" + errors(p));
  await ctx.close();
}

// ---------- photos: shrunk, location removed, framed ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/animals/a3"); await wait(p, 600);
  await p.setInputFiles('[data-photo="photo_url"]', fixture("photo-with-location.jpg")); await wait(p, 1500);
  const up = sb.log.find(l => l.upload);
  ok(up && up.upload.startsWith("animals/") && up.jpeg && up.type === "image/jpeg", "a photo uploads as a JPEG to the animals folder: " + up?.upload);
  ok(up && !up.exif && !up.gps, "with the camera and location data removed");
  const dims = await p.evaluate(async () => { const i = document.querySelector(".pf-pic img"); await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
  ok(dims[0] === 1600 && dims[1] === 1200, "and shrunk to 1600 across: " + dims.join("x"));
  ok(await p.locator('[data-frame-btn="photo_url"]').isVisible() && await p.locator('[data-photo-remove="photo_url"]').isVisible(), "Move or zoom and Remove photo show once there's a photo");
  await p.click(".savebar .btn"); await wait(p, 700);
  const saved = writes(sb, "animals", "PATCH")[0];
  ok(saved && saved.body.photo_url.includes("/storage/v1/object/public/photos/animals/"), "saving keeps the photo's new address");
  await p.goto(E + "#/animals/a3"); await wait(p, 600);
  await p.setInputFiles('[data-photo="photo_url"]', fixture("not-a-photo.txt")); await wait(p, 500);
  ok(/isn't a photo/.test(await toast(p)), "a file that isn't a photo is turned away");
  await p.goto(E + "#/gameart/new"); await wait(p, 600);
  await p.setInputFiles('[data-photo="photo_url"]', fixture("see-through.png")); await wait(p, 1000);
  const png = sb.log.filter(l => l.upload).at(-1);
  ok(png && png.png && png.type === "image/png", "game art keeps its see-through background (stays a PNG)");
  ok(!p.errs.length, "photos: no errors" + errors(p));
  await ctx.close();
}

// ---------- framing a photo: Move or zoom ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/animals/a1"); await wait(p, 700);
  await p.click('[data-frame-btn="photo_url"]'); await wait(p, 500);
  ok(await p.locator("dialog.framer[open]").isVisible(), "Move or zoom opens the framer");
  await p.click('.framer [data-zoom="1"]'); await p.click('.framer [data-zoom="1"]');
  await p.focus(".fr-stage"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowDown");
  await p.click('.framer button[value="done"]'); await wait(p, 300);
  const fr = JSON.parse((await p.inputValue('[name="photo_frame"]')) || "null");
  ok(fr && fr.z > 1 && (fr.x !== 50 || fr.y !== 50), "zooming and moving it is kept: " + JSON.stringify(fr));
  await p.click(".savebar .btn"); await wait(p, 700);
  const saved = writes(sb, "animals", "PATCH")[0];
  ok(saved && saved.body.photo_frame && saved.body.photo_frame.z === fr.z && !("photo_url" in saved.body), "Save keeps the framing, and leaves the photo itself alone");
  await p.goto(E + "#/animals/a1"); await wait(p, 600);
  await p.click('[data-frame-btn="photo_url"]'); await wait(p, 400);
  await p.click('.framer [data-zoom="1"]'); await p.click('.framer button[value="cancel"]'); await wait(p, 300);
  ok(JSON.parse(await p.inputValue('[name="photo_frame"]')).z === fr.z, "Cancel leaves the framing as it was");
  ok(!p.errs.length, "framer: no errors" + errors(p));
  await ctx.close();
}

// ---------- adding a photo to a page, from the page itself ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(B + "supporters/"); await wait(p, 900);
  await p.click("[data-editfab]"); await p.click("[data-ppmode]"); await wait(p, 400);
  const adds = p.locator("a.ppadd");
  ok((await adds.count()) > 0, "Photos on this page puts an Add a photo here button at each spot (" + (await adds.count()) + ")");
  const href = await adds.first().getAttribute("href");
  ok(/\/edit\/#\/photos\/new\?page=supporters&spot=(before|after)%3Ab\.supporters\./.test(href) && /back=%2Fsupporters%2F/.test(href), "each one opens the editor for that spot, coming back to the page after");
  await adds.first().click(); await wait(p, 900);
  ok((await h1(p)) === "Add photo" && /Back to Supporters/.test(await p.locator(".back").innerText()), "the photo form knows the page it came from");
  await p.setInputFiles('[data-gallery-add="photos"]', fixture("photo-with-location.jpg")); await wait(p, 1500);
  ok((await p.locator(".gal-item").count()) === 1, "a photo goes into the photo list");
  await p.fill('.gal-item [name="g_alt"]', "Supporters at the beach");
  await p.click(".savebar .btn"); await wait(p, 1500);
  const add = writes(sb, "page_photos", "POST")[0];
  ok(add && add.body.page === "supporters" && /^(before|after):b\.supporters\./.test(add.body.spot) && add.body.photos?.[0]?.alt === "Supporters at the beach" && add.body.photos[0].w === 1600, "Add saves the photo to that spot, with its description and size: " + JSON.stringify(add?.body).slice(0, 200));
  ok(p.url().endsWith("/supporters/"), "and goes back to the page");
  await wait(p, 600);
  ok((await p.locator("figure[data-pp] img").count()) === 1, "where the new photo shows straight away");
  ok(!p.errs.length, "photos on a page: no errors" + errors(p));
  await ctx.close();
}

// ---------- shelter goals: the lines and their numbers ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/goals/g1"); await wait(p, 700);
  ok((await p.locator(".bar-row").count()) === 2, "a goal's form shows its lines");
  await p.locator('.bar-row [name="bar_current"]').first().fill("40");
  await p.click("[data-bar-add]");
  await p.locator('.bar-row [name="bar_label"]').last().fill("Grain");
  await p.locator('.bar-row [name="bar_target"]').last().fill("12");
  await p.click(".savebar .btn"); await wait(p, 900);
  const g = writes(sb, "goals", "PATCH")[0];
  ok(g && g.body.figures_updated_at === TODAY, "new numbers update the goal's date");
  ok(writes(sb, "goal_bars", "PATCH").some(w => w.body.current === 40) && writes(sb, "goal_bars", "POST").some(w => w.body.label === "Grain" && w.body.goal_id === "g1"), "the changed line is saved and the new line added to the goal");
  ok(!p.errs.length, "goals: no errors" + errors(p));
  await ctx.close();
}

// ---------- photos sent for the games: look, download, delete, but never publish ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E); await wait(p, 800);
  ok(/1 photo sent for the games/.test(await p.locator(".todo").innerText()), "needs attention: a photo sent for the games");
  await p.goto(E + "#/pairs"); await wait(p, 900);
  const waiting = p.locator(".fa-wait li");
  ok((await waiting.count()) === 1 && /The Whale Eye<img/.test(await waiting.innerText()), "Matching shows the photo waiting, its pair's name as plain text");
  ok(((await p.locator(".fa-wait img").getAttribute("src")) || "").startsWith("blob:"), "its thumbnail loads privately");
  ok((await p.locator('.lhead a[href="#/pairs/new"]').count()) === 1, "pairs can still be added");
  await p.click('[data-filter="wanted"]'); await wait(p, 200);
  ok((await p.locator(".rows li[data-s]:visible").count()) === 2, "Asking for photos shows the pairs listed on Send a Photo");
  await p.click('[data-filter="all"]');
  await p.goto(E + "#/gamephoto/gp1"); await wait(p, 900);
  ok(/For The Whale Eye<img/.test(await h1(p)) && ((await p.locator(".fa-big img").getAttribute("src")) || "").startsWith("blob:"), "a sent photo opens, loaded privately");
  const det = await p.locator(".mdet").innerText();
  ok(/thunder <img/.test(det) && /robin@example\.com/.test(det), "with their note (as plain text) and email");
  const dl = p.locator("a[download]");
  ok((await dl.count()) === 1 && ((await dl.getAttribute("href")) || "").startsWith("blob:"), "Download the photo saves the private copy");
  ok(!/approve|publish|show it/i.test(await p.locator("#app").innerText()) && !(await p.locator("#app form, #app [type=submit]").count()), "there is no way to approve or publish it from here");
  ok((await p.locator('a[href="#/pairs/mp1"]').count()) === 1, "Open the pair goes to the pair it's for");
  await p.locator('[data-act="gp-delete"]').scrollIntoViewIfNeeded(); await wait(p, 600);
  await p.click('[data-act="gp-delete"]'); await wait(p, 800);
  ok(/Delete this photo\?/.test(p.dialogs.at(-1)) && !sb.D.game_photo_submissions.length && sb.log.some(l => l.bucket === "game-photo-inbox" && l.inboxDeleted?.includes("g1.jpg")), "Delete asks, then removes the photo and their email for good");
  ok(!sb.writes().some(w => w.table !== "game_photo_submissions") && !sb.log.some(l => l.upload), "nothing was copied to the site or to a pair");
  await p.goto(E + "#/gamephoto/gp1"); await wait(p, 700);
  ok((await h1(p)) === "Not found", "a deleted one is gone");
  await p.goto(E + "#/pairs/mp3"); await wait(p, 700);
  await p.click('label.switch:has([name="wanted"])'); await wait(p, 100);
  ok(await p.locator('[name="wanted"]').isChecked(), "the Ask for photos of this switch turns on");
  await p.click(".savebar .btn"); await wait(p, 700);
  ok(writes(sb, "match_pairs", "PATCH").some(w => w.body.wanted === true), "Ask for photos of this saves");
  ok(!(await pwned(p)) && !p.errs.length, "game photos: no errors" + errors(p));
  await ctx.close();
}

// ---------- the order arrows ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/supporters"); await wait(p, 700);
  ok((await p.locator(".rows li.movable").count()) === 3, "lists in the site's order have ↑ ↓ arrows");
  await p.locator('.rows [data-move="1"]').first().click(); await wait(p, 700);
  ok(writes(sb, "supporters", "PATCH").length >= 2 && (await toast(p)) === "Moved ✓", "an arrow renumbers the order and saves it");
  await ctx.close();
}

// ---------- messages ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/messages"); await wait(p, 700);
  const msg = p.locator(".msg").first();
  ok((await p.locator(".msg").count()) === 1 && /Pat<img/.test(await msg.innerText()), "New shows the new message, its name as plain text");
  ok(/Line one\nLine two/.test(await msg.locator(".mbody").innerText()), "line breaks in a message are kept");
  ok(/Interested in/.test(await msg.innerText()) && /Adoption features/.test(await msg.innerText()), "the partner form's choices are shown in words");
  ok((await msg.locator('a[href^="mailto:pat@example.com"]').count()) === 1, "Reply by email opens an email to them");
  await msg.locator('[data-act="msg-done"]').click(); await wait(p, 700);
  ok(sb.D.messages.find(m => m.id === "m1").handled === true && /No new messages/.test(await p.locator("#app").innerText()), "Mark done moves it out of New");
  await p.goto(E + "#/messages/done"); await wait(p, 600);
  ok((await p.locator(".msg").count()) === 2, "Done shows the handled ones");
  await p.locator('.msg [data-act="msg-delete"]').first().click(); await wait(p, 700);
  ok(/Delete this message\?/.test(p.dialogs.at(-1)) && sb.D.messages.length === 1, "Delete asks, then deletes the message");
  ok(!(await pwned(p)) && !p.errs.length, "messages: no errors" + errors(p));
  await ctx.close();
}

// ---------- wording ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/text"); await wait(p, 700);
  ok((await h1(p)) === "Wording" && (await p.locator(".warea li").count()) >= 15, "Wording lists the pages to change");
  ok(await p.locator(".worphans").isVisible() && /Hello <img/.test(await p.locator(".worphans").innerText()), "saved wording that's no longer used is listed, as plain text");
  await p.fill("#wfind", "Hampton Roads"); await wait(p, 600);
  ok((await p.locator("#wresults .witem").count()) > 0, "search finds wording anywhere on the site");
  await p.locator(".warea a").first().click(); await wait(p, 600);
  const first = p.locator(".witem").first(), key = await first.getAttribute("data-key");
  await first.locator("textarea").fill("New words for the test");
  ok(await p.locator(".wsave").isVisible() && (await p.locator(".wsave button").innerText()) === "Save 1 change", "a change shows a Save 1 change button");
  await p.click(".wsave button"); await wait(p, 700);
  const w = sb.writes().find(x => x.table === "site_text");
  ok(w && /on_conflict=key/.test(w.query) && w.body[0].key === key && w.body[0].body === "New words for the test", "saving sends the changed wording by its key");
  ok(/Saved/.test(await toast(p)), "and says it's on the site now");
  await p.goto(E + "#/text"); await wait(p, 600);
  await p.click('.worphans [data-act="w-clear"]'); await wait(p, 700);
  ok(sb.D.site_text.find(r => r.key === "p.about.lede").body === "", "Clear empties saved wording that's no longer used");
  ok(!(await pwned(p)) && !p.errs.length, "wording: no errors" + errors(p));
  await ctx.close();
}

// ---------- scheduled ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/scheduled"); await wait(p, 800);
  ok(/A post for later/.test(await p.locator(".sched").innerText()), "Scheduled lists what's set to go live");
  await p.click('.sched [data-act="live-now"]'); await wait(p, 700);
  ok(sb.D.articles.find(a => a.id === "sq2").publish_at === null, "Put it on now clears its time, so it shows now");
  await p.goto(E + "#/squawk/new?plan=1"); await wait(p, 700);
  ok((await h1(p)) === "Plan post" && await p.locator('[name="publish_at_how"][value="at"]').isChecked(), "Plan a post starts with a time to go live");
  ok(!p.errs.length, "scheduled: no errors" + errors(p));
  await ctx.close();
}

// ---------- fan art: approving and declining ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/fanart"); await wait(p, 900);
  ok(/Jo<img/.test(await p.locator("#app").innerText()), "the fan art list shows art waiting, the name as plain text");
  await p.goto(E + "#/fanart-review/fs1"); await wait(p, 900);
  ok(/My drawing<img/.test(await h1(p)) && (await p.locator(".fa-big img").getAttribute("src")).startsWith("blob:"), "the review shows their art, loaded privately");
  ok((await p.inputValue('#fa-review [name="credit"]')) === "Jo" + '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>', "the credit is filled in as they asked");
  await p.click('#fa-review [type="submit"]'); await wait(p, 300);
  ok(/fix the highlighted/.test(await p.locator("#fa-review .formmsg").innerText()), "approving needs a description of the art first");
  await p.fill('#fa-review [name="photo_alt"]', "A dog drawn in marker");
  await p.fill('#fa-review [name="credit"]', "Jo");
  await p.click('#fa-review [type="submit"]'); await wait(p, 1500);
  const added = writes(sb, "fanart", "POST")[0];
  ok(added && added.body.published === true && added.body.credit === "Jo" && added.body.photo_url.includes("/photos/fanart/"), "Approve puts it on the Fan Art page, with a fresh public copy");
  ok(sb.log.some(l => l.inboxDeleted?.includes("f1.jpg")) && !sb.D.fanart_submissions.length, "and clears the private copy and their email");
  await ctx.close();
}
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/fanart-review/fs1"); await wait(p, 900);
  await p.click('#fa-review [data-act="decline"]'); await wait(p, 900);
  ok(/Decline this art\?/.test(p.dialogs.at(-1)) && !sb.D.fanart_submissions.length && !writes(sb, "fanart", "POST").length, "Decline asks, then deletes it without showing it");
  await ctx.close();
}

// ---------- recently deleted ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/deleted"); await wait(p, 700);
  const txt = await p.locator("#app").innerText();
  ok(/Old hay goal/.test(txt) && /with its line/.test(txt), "a deleted goal shows with its line, as one item");
  ok(/Lee<img/.test(txt) && !/Biscuit/.test(txt), "a deleted message shows (as plain text); changes that weren't deletes don't");
  await p.locator(".msg", { hasText: "Old hay goal" }).locator('[data-act="restore"]').click(); await wait(p, 700);
  ok(sb.D.goals.some(g => g.id === "g9") && sb.D.goal_bars.some(b => b.id === "b9"), "Restore brings back the goal and its line together");
  await p.locator(".msg", { hasText: "Lee" }).locator('[data-act="forget"]').click(); await wait(p, 700);
  ok(sb.writes().some(w => w.table === "content_history" && w.method === "DELETE" && /row_key=in\.\(m9\)/.test(w.query)), "Remove for good deletes it from the history");
  ok(!(await pwned(p)) && !p.errs.length, "recently deleted: no errors" + errors(p));
  await ctx.close();
}

// ---------- visitors ----------
{
  const { ctx, p, sb } = await newPage(browser, { session: true });
  await p.goto(E + "#/visitors"); await wait(p, 800);
  const stats = (await p.locator(".vstats").innerText()).replace(/\s+/g, " ");
  ok(/12 page views/.test(stats) && /8 visits/.test(stats), "the last 7 days: 12 page views, 8 visits: " + stats);
  const src = await p.locator(".vlist").last().innerText();
  ok(/Meta AI\s*3/.test(src) && /TikTok\s*3/.test(src) && /Direct/.test(src), "sources are named, and the same source under two names is added together");
  ok((await p.locator(".vlist").nth(1).innerText()).includes("/stories/<b>x</b>"), "addresses that weren't found show as plain text");
  ok((await p.locator(".vchart span").count()) === 7, "a bar for each of the 7 days");
  await p.click('a[href="#/visitors/365"]'); await wait(p, 700);
  ok(/19 page views/.test((await p.locator(".vstats").innerText()).replace(/\s+/g, " ")), "12 months includes older views");
  await p.click('[data-act="clear-counts"]'); await wait(p, 700);
  ok(/Clear all the visitor counts/.test(p.dialogs.at(-1)) && sb.log.some(l => l.cleared) && /^0 page views/.test((await p.locator(".vstats").innerText()).replace(/\s+/g, " ")), "Start the counts fresh clears them, after asking");
  ok(!(await pwned(p)) && !p.errs.length, "visitors: no errors" + errors(p));
  await ctx.close();
}

// ---------- settings ----------
{
  const { ctx, p } = await newPage(browser, { session: true });
  await p.goto(E + "#/settings"); await wait(p, 700);
  ok((await h1(p)) === "Settings" && /editor@example\.com/.test(await p.locator("#app").innerText()), "Settings shows the account");
  await p.click('[data-act="nocount"]'); await wait(p, 400);
  ok((await p.evaluate(() => localStorage.getItem("tt-no-count"))) === "1" && /Count it again/.test(await p.locator('[data-act="nocount"]').innerText()), "this device can be left out of the visitor counts");
  ok(!p.errs.length, "settings: no errors" + errors(p));
  await ctx.close();
}

// ---------- every section's list and new form open cleanly, on a phone and a computer ----------
for (const phone of [true, false]) {
  const { ctx, p } = await newPage(browser, { session: true, phone });
  await p.goto(E); await wait(p, 700);
  const keys = await p.$$eval(".tile", ts => ts.map(t => t.getAttribute("href").slice(2)));
  const bad = [];
  for (const k of keys) {
    await p.goto(E + "#/" + k); await wait(p, 500);
    if (p.errs.length || await overflow(p)) bad.push(k + (p.errs.length ? " " + p.errs.join(" | ") : " (too wide)"));
    p.errs.length = 0;
    if (await p.locator(`.lhead a[href="#/${k}/new"]`).count()) { // its + Add button
      await p.goto(E + `#/${k}/new`); await wait(p, 500);
      if (p.errs.length || await overflow(p) || !(await p.locator(".eform").count())) bad.push(k + "/new" + (p.errs.length ? " " + p.errs.join(" | ") : ""));
      p.errs.length = 0;
    }
  }
  ok(keys.length >= 20 && !bad.length, `every screen opens with no errors and fits the ${phone ? "phone" : "computer"} (${keys.length} screens)` + (bad.length ? ": " + bad.join(", ") : ""));
  ok(!(await pwned(p)), "nothing from the data ran as code on any screen");
  await ctx.close();
}

await close();
process.exit(report("edit page"));
