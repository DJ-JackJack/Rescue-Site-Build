// Opens the public pages in Chromium against the fake Supabase in fake-supabase.mjs and checks what each live part
// shows: who's visible (and who must not be), the numbers, links (only real http(s) ones), the forms, the fan art
// form, wording saved on the edit page, visitor counts, and that nothing from the database ever runs as code.
// Build the site first, as described in edit.test.mjs, then:
//   node tests/site.test.mjs
// Prints PASS or FAIL for each check, and exits 1 if any failed.
import { fakeSupabase, setup, newPage, ok, report, wait, overflow, pwned, errors, fixture, SB } from "./fake-supabase.mjs";

const { B, browser, close } = await setup(8795);
const text = (p, sel) => p.locator(sel).first().innerText();
const flat = s => s.replace(/\s+/g, " ").trim();
const noBadLinks = p => p.evaluate(() => ![...document.querySelectorAll("a[href], img[src]")].some(e => /^\s*javascript:/i.test(e.getAttribute("href") || e.getAttribute("src") || "")));
async function open(path, opts) {
  const { ctx, p, sb } = await newPage(browser, opts);
  await p.goto(B + path); await wait(p, 900);
  return { ctx, p, sb };
}
async function clean(p, what) {
  ok(!(await pwned(p)) && await noBadLinks(p), `${what}: nothing from the data runs as code, and no javascript: links`);
  ok(!p.errs.length && !(await overflow(p)), `${what}: no errors, and it fits a phone` + errors(p));
}

// ---------- home ----------
{
  const { ctx, p } = await open("");
  const goal = flat(await text(p, "[data-goals]"));
  ok(/Hay for the herds<img/.test(goal) && /Willow Woods Equine Sanctuary/.test(goal), "home: the featured goal, its name as plain text");
  ok(/Round bales 35 of 70/.test(goal) && /Square bales 50 of 200/.test(goal) && /Updated 2 days ago/.test(goal), "home: the goal's lines and how fresh the numbers are");
  ok((await p.locator('[data-goals] a[href="https://example.org/give"]').count()) === 1 && /never handles money/.test(goal), "home: Give goes to the sanctuary's own page, and says the site never handles money");
  const names = await p.$$eval("[data-wall] .pet b", bs => bs.map(b => b.textContent));
  ok(names.length > 0 && names.length <= 8, "home: the newest animals, 8 at most (" + names.length + ")");
  ok(!names.some(n => /Hidden Hank|No Consent|Quiet Pup|Ghost|Old Blue/.test(n)), "home: no hidden animals, none without an OK, none from a rescue that hasn't said yes, no dog unchecked for 4 weeks, nobody in memory");
  const stat = flat(await text(p, "[data-statblock]"));
  ok(/5 of 6/.test(stat), "home: the 'home within 3 months' number once 5 dogs count: " + stat.slice(0, 80));
  await clean(p, "home");
  await ctx.close();
}

// ---------- Happy Tails, and an animal's journey ----------
{
  const { ctx, p } = await open("animals/");
  const names = await p.$$eval("[data-wall] .pet b", bs => bs.map(b => b.textContent));
  ok(names.length === 8 && names.includes("Shadow" + '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>'), "Happy Tales: the 8 animals visitors may see, names as plain text");
  ok(!names.some(n => /Ebay|Clover|Duke/.test(n)), "Happy Tails leaves out the Story Spotlight horses");
  const counts = flat(await text(p, "[data-counts]"));
  ok(/4 adopted/.test(counts) && /1 in foster/.test(counts) && /1 still looking/.test(counts) && /1 in memory/.test(counts) && /1 placed or released/.test(counts), "the counts: " + counts);
  ok((await p.locator(".pet img").count()) >= 1 && !(await p.locator('.pet img[src^="javascript"]').count()), "photos show, and a javascript: photo is dropped");
  const filters = await p.$$eval("button[data-f]", bs => bs.filter(b => !b.hidden).map(b => b.dataset.f));
  ok(filters.includes("all") && filters.includes("adopted") && !filters.includes("sanctuary"), "filter buttons only for outcomes there are: " + filters.join(","));
  await p.click('button[data-f="adopted"]'); await wait(p, 200);
  ok((await p.locator("[data-wall] .pet").count()) === 4, "the Adopted filter shows the 4 adopted");
  await p.click('button[data-f="all"]'); await wait(p, 200);
  await p.click('.pet:has-text("Rocket")'); await wait(p, 400);
  ok(await p.locator("#journey[open]").isVisible() && (await text(p, "#jname")) === "Rocket", "tapping an animal opens their story");
  ok((await p.locator("#jstory p").count()) === 2 && /trust\.<img/.test(await text(p, "#jstory")), "their story, in paragraphs, as plain text");
  const notes = await p.$$eval("#jnotes li p", ps => ps.map(x => x.textContent));
  ok(notes.length === 2 && /beach/.test(notes[0]), "updates, newest first");
  await p.click(".jclose"); await wait(p, 200);
  ok(!(await p.locator("#journey[open]").count()), "and it closes");
  await p.click('.pet:has-text("Juniper")'); await wait(p, 400);
  ok(/Featured/.test(await text(p, "#jsteps")) && /Home 10 days after the video/.test(await text(p, "#jsteps")), "with no journey written, the steps come from the dates");
  await p.click(".jclose"); await wait(p, 200);
  await p.click('.pet:has-text("Old Blue")'); await wait(p, 400);
  const steps = flat(await text(p, "#jsteps"));
  ok(/Adopted/.test(steps) && /In memory/.test(steps) && /Forever loved/.test(steps), "someone who has passed away: their journey ends quietly, in memory: " + steps);
  await clean(p, "Happy Tails");
  await ctx.close();
}

// ---------- shelter goals ----------
{
  const { ctx, p } = await open("shelter-goals/");
  const active = flat(await text(p, '[data-goals="active"]')), met = flat(await text(p, '[data-goals="met"]'));
  ok(/Hay for the herds/.test(active) && /Crates for transport/.test(active) && !/Secret goal/.test(active), "active goals, but not one from a rescue that hasn't said yes");
  ok(/An update is coming from Harbor City Animal Shelter/.test(active), "numbers older than 2 weeks aren't shown as current");
  ok(/Donation link coming soon/.test(active), "a goal without a donation link says one is coming");
  ok(/Winter blankets/.test(met) && /Met /.test(met), "met goals, with when");
  await clean(p, "shelter goals");
  await ctx.close();
}

// ---------- rescues ----------
{
  const { ctx, p } = await open("rescues/");
  const cards = await p.$$eval(".rescue h3", hs => hs.map(h => h.textContent));
  ok(cards.length === 2 && !cards.includes("Quiet Rescue"), "a card per rescue that's said yes: " + cards.join(", "));
  const harbor = p.locator(".rescue", { hasText: "Harbor City" });
  ok(/home\.<img/.test(await harbor.innerText()), "a rescue's mission shows as plain text");
  ok((await harbor.locator('a[href="https://example.org/wish"]').count()) === 1 && !(await harbor.innerText()).includes("Bad link"), "their extra links show, and a javascript: one is left out");
  ok(/Rocket/.test(await harbor.locator(".minis").innerText()) && (await harbor.locator('a[href="https://example.org/rocket"]').count()) === 1, "their dogs, with the live listing for one still looking");
  ok(/Adoption Day/.test(await harbor.innerText()) && !(await harbor.locator(".events a").count()), "their upcoming events, with no javascript: link");
  ok((await p.locator('.rescue a[href="/willow-woods/"]').count()) === 1, "Willow Woods links to its own page");
  await clean(p, "rescues");
  await ctx.close();
}

// ---------- Willow Woods ----------
{
  const { ctx, p } = await open("willow-woods/");
  const herds = await p.$$eval("[data-horses] .herd", hs => hs.map(h => h.querySelector("h3").textContent + ": " + [...h.querySelectorAll(".pet b")].map(b => b.textContent).join(",")));
  ok(herds.join(" | ") === "Herd One: Ebay,Clover | More horses: Duke", "the horses by herd, in order: " + herds.join(" | "));
  ok(/Sound Bath<img/.test(await text(p, "[data-events]")) && (await p.locator('[data-events] a[href="https://example.org/sound"]').count()) === 1, "its events, as plain text, with their link");
  ok(/Hay for the herds/.test(await text(p, "[data-goals]")), "its goal");
  const collabs = flat(await text(p, "[data-collabs]"));
  ok(/Happening now.*Barn makeover.*Since/.test(collabs) && /Coming up.*Spring open house/.test(collabs), "working together: what's happening now and coming up");
  ok((await p.locator('[data-partner-links] a[href="https://example.org/hay"]').count()) === 1, "its extra links");
  await clean(p, "Willow Woods");
  await ctx.close();
}

// ---------- stories: the spotlight ----------
{
  const { ctx, p } = await open("stories/");
  ok(/At Willow Woods Equine Sanctuary/.test(await text(p, "[data-spotlight]")) && /Ebay/.test(await text(p, "[data-spotlight]")), "the Story Spotlight groups animals by where they live");
  await clean(p, "stories");
  await ctx.close();
}

// ---------- Sniffari ----------
{
  const { ctx, p } = await open("sniffari/");
  ok((await p.locator("[data-sniffari] .sn").count()) === 2 && /Bay Humane<img/.test(await text(p, "[data-sniffari]")), "the day-out programs, names as plain text");
  ok((await p.locator('[data-sniffari] a[href="https://example.org/paws"]').count()) === 1 && (await p.locator("[data-sniffari] .sn").nth(1).locator("a.btn").count()) === 0, "a sign-up button only for a real link");
  ok(/Bay Humane/.test(await text(p, "[data-sleepovers]")), "programs with sleepovers get their own list");
  ok(/Rocket's day out/.test(await text(p, "[data-videos]")) && /TikTok/.test(await text(p, "[data-videos]")), "day-out videos, with where they were posted");
  ok(/Shore Cafe/.test(await text(p, "[data-places]")), "dog-friendly places");
  ok(/Beach day/.test(await text(p, "[data-adventures]")), "day outs");
  await clean(p, "Sniffari");
  await ctx.close();
}

// ---------- foster ----------
{
  const { ctx, p } = await open("foster/");
  ok((await p.locator("[data-fosters] .sn").count()) === 2, "the foster programs");
  ok(/1 of the 2 programs listed here are free to foster/.test(await text(p, "[data-foster-free]")), "how many are free");
  await clean(p, "foster");
  await ctx.close();
}

// ---------- help: by city, then by kind of help ----------
{
  const { ctx, p } = await open("help/");
  const cities = await p.$$eval("[data-cities] .city", cs => cs.map(c => c.id));
  ok(cities.join(",") === "virginia-beach,chesapeake", "a section for each city with a listing: " + cities.join(","));
  const city = flat(await p.locator("#chesapeake").innerText());
  ok(/Pet Pantry/.test(city) && /Free food<img/.test(city) && /Low Cost Vet/.test(city) && !/Hidden Clinic/.test(city), "a city's listings, as plain text, without hidden ones");
  ok((await p.locator('#chesapeake a[href="tel:5555550100"]').count()) === 1 && (await p.locator('#chesapeake a[href="mailto:vet@example.org"]').count()) === 1, "phone numbers and emails can be tapped");
  ok(/Call first/.test(city), "a listing's caution shows");
  ok(await p.locator("[data-city-nav]").isVisible() && (await p.locator("[data-city-nav] .placebtns a").count()) === 2, "buttons to jump to each city");
  await clean(p, "help");
  await ctx.close();
}

// ---------- Twin Squawk ----------
{
  const { ctx, p } = await open("twin-squawk/");
  const titles = await p.$$eval("[data-articles] .sqcard b", bs => bs.map(b => b.textContent));
  ok(titles.join("|") === "Rocket goes to the beach", "only posts that are live: not a scheduled one, not a draft");
  await p.click(".sqcard"); await wait(p, 500);
  ok(await p.locator("#article[open]").isVisible() && (await text(p, "#sqname")) === "Rocket goes to the beach" && (await text(p, "#article .sqhead")) === "The waves", "a post opens in the reader, with its headings");
  ok(/right in\. <img/.test(await p.locator("#article").innerText()), "its words are plain text");
  await clean(p, "Twin Squawk");
  await ctx.close();
}
{
  const { ctx, p } = await open("twin-squawk/#rocket-goes-to-the-beach");
  ok(await p.locator("#article[open]").isVisible(), "a link to a post opens it");
  await ctx.close();
}
{
  const { ctx, p } = await open("twin-squawk/brand-new-post/");
  ok(p.url().endsWith("/twin-squawk/#brand-new-post"), "a post's own page that isn't built yet opens it on the Twin Squawk page instead: " + p.url());
  await ctx.close();
}

// ---------- supporters and fan art ----------
{
  const { ctx, p } = await open("supporters/");
  const names = await p.$$eval("[data-supporters] li b", bs => bs.map(b => b.textContent));
  ok(names.join("|") === "Alex|Sam" + '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>', "supporters' names A to Z, as plain text, without hidden ones");
  ok(/Alliance Hero/i.test(await text(p, "[data-supporters]")), "with their tier");
  await clean(p, "supporters");
  await ctx.close();
}
{
  const { ctx, p, sb } = await open("fan-art/");
  ok((await p.locator("[data-fanart] li.fa").count()) === 2, "the fan art gallery");
  ok((await p.locator('[data-fanart] a[href="https://example.org/mia"][rel~="nofollow"][rel~="ugc"]').count()) === 1, "an artist's credit links to their page");
  ok(/by Anon/.test(await text(p, "[data-fanart]")) && (await p.locator("[data-fanart] li.fa").nth(1).locator("a").count()) === 0, "a javascript: credit link isn't a link");
  // the form
  const form = p.locator("[data-fanart-form]");
  await form.locator('[name="credit"]').fill("Jo"); await form.locator('[name="email"]').fill("jo@example.com");
  for (const n of ["made", "ok", "age"]) await form.locator(`[name="${n}"]`).check();
  await form.locator('[type="submit"]').click(); await wait(p, 400);
  ok(await form.locator('[name="image"]').evaluate(i => !i.validity.valid) && !sb.log.some(l => l.fanart), "sending without art is stopped: the art is required");
  await form.locator('[name="image"]').setInputFiles(fixture("photo-with-location.jpg")); await wait(p, 1200);
  ok(await form.locator(".fa-preview").isVisible(), "a preview of the art shows");
  await form.locator('[type="submit"]').click(); await wait(p, 1200);
  const sent = sb.log.find(l => l.fanart);
  ok(sent && sent.fanart.credit === "Jo" && sent.fanart.email === "jo@example.com" && sent.fanart.made === "yes", "the art goes to the inbox with the credit, email and the boxes ticked");
  ok(sent && sent.image.jpeg && !sent.image.exif && !sent.image.gps, "the picture is redrawn first: no camera or location data");
  ok(/Thank you! Your art reached/.test(await form.locator(".formmsg").innerText()), "and says thank you");
  await clean(p, "fan art");
  await ctx.close();
}
{
  const { ctx, p, sb } = await open("fan-art/", { sb: fakeSupabase({ fanartReply: { status: 429, body: { error: "slow" } } }) });
  const form = p.locator("[data-fanart-form]");
  await form.locator('[name="credit"]').fill("Jo"); await form.locator('[name="email"]').fill("jo@example.com");
  for (const n of ["made", "ok", "age"]) await form.locator(`[name="${n}"]`).check();
  await form.locator('[name="image"]').setInputFiles(fixture("small.jpg")); await wait(p, 600);
  await form.locator('[type="submit"]').click(); await wait(p, 800);
  ok(/a lot of art from this email today/.test(await form.locator(".formmsg").innerText()), "too much art from one email is told to try tomorrow");
  await ctx.close();
}

// ---------- Send a Photo: photos for the Matching game ----------
{
  const { ctx, p, sb } = await open("send-a-photo/");
  const items = await p.$$eval("[data-gamephoto-wishlist] li b", bs => bs.map(b => b.textContent));
  ok(items.length === 2 && items[0].startsWith("The Whale Eye<img") && items[1] === "The Skin Ripple", "Send a Photo lists the pairs asked for that have no photo, hidden ones too, as plain text: " + items.join(" | "));
  ok(!items.some(t => /Head Tilt|Play Bow/.test(t)), "but not pairs nobody asked for, or that already have a photo");
  ok(!(await p.locator("[data-gamephoto-wishlist-empty]").isVisible()), "the 'nothing needed' line hides");
  const opts = await p.$$eval("select[data-gamephoto-pairs] option", os => os.map(o => o.value));
  ok(opts.join(",") === "mp1,mp2,other", "the form offers the same list, plus Something else: " + opts.join(","));
  await p.click('[data-pick="mp2"]'); await wait(p, 300);
  ok((await p.inputValue("select[data-gamephoto-pairs]")) === "mp2", "I have one of these picks it in the form");
  const form = p.locator("form[data-gamephoto-form]");
  await form.locator('[name="email"]').fill("pet@example.com");
  for (const n of ["mine", "ok", "age"]) await form.locator(`[name="${n}"]`).check();
  await form.locator('[type="submit"]').click(); await wait(p, 300);
  ok(await form.locator('[name="image"]').evaluate(i => !i.validity.valid) && !sb.log.some(l => l.gamephoto), "sending without a photo is stopped: the photo is required");
  await form.locator('[name="image"]').setInputFiles(fixture("photo-with-location.jpg")); await wait(p, 1200);
  ok(await form.locator(".fa-preview").isVisible(), "a preview of the photo shows");
  await form.locator('[name="note"]').fill("Her back twitched when I petted her"); await form.locator('[name="credit"]').fill("Sam");
  await form.locator('[type="submit"]').click(); await wait(p, 1200);
  const sent = sb.log.find(l => l.gamephoto);
  ok(sent && sent.gamephoto.pair === "mp2" && sent.gamephoto.email === "pet@example.com" && ["mine", "ok", "age"].every(k => sent.gamephoto[k] === "yes") && sent.gamephoto.note.startsWith("Her back"), "the photo goes to the private inbox with what it shows, the note and the boxes ticked");
  ok(sent && sent.image.jpeg && !sent.image.exif && !sent.image.gps, "the photo is redrawn first: no camera or location data");
  ok(/Thank you! Your photo reached/.test(await form.locator(".formmsg").innerText()) && sb.D.game_photo_submissions.length === 2, "and says thank you");
  ok(!sb.writes().length, "sending a photo changes nothing on the site");
  await clean(p, "Send a Photo");
  await ctx.close();
}
{
  const sb = fakeSupabase(); sb.D.match_pairs.forEach(x => { x.wanted = false; });
  const { ctx, p } = await open("send-a-photo/", { sb });
  ok(await p.locator("[data-gamephoto-wishlist-empty]").isVisible() && !(await p.locator("[data-gamephoto-wishlist]").isVisible()), "with nothing asked for, the page says so");
  ok((await p.$$eval("select[data-gamephoto-pairs] option", os => os.map(o => o.value))).join() === "other", "and the form still takes something else");
  await ctx.close();
}
{
  const { ctx, p } = await open("send-a-photo/", { sb: fakeSupabase({ gamePhotoReply: { status: 429, body: { error: "slow" } } }) });
  const form = p.locator("form[data-gamephoto-form]");
  await form.locator('[name="email"]').fill("pet@example.com");
  for (const n of ["mine", "ok", "age"]) await form.locator(`[name="${n}"]`).check();
  await form.locator('[name="image"]').setInputFiles(fixture("small.jpg")); await wait(p, 600);
  await form.locator('[type="submit"]').click(); await wait(p, 800);
  ok(/a lot of photos from this email today/.test(await form.locator(".formmsg").innerText()) && await form.locator('[type="submit"]').isEnabled(), "too many photos from one email is told to try tomorrow");
  await ctx.close();
}
{
  const { ctx, p } = await open("animal-guardian-alliance/");
  ok((await p.locator('#games a[href="/send-a-photo/"]').count()) === 1, "the games section links to Send a Photo");
  await ctx.close();
}

// ---------- the message forms ----------
{
  const { ctx, p, sb } = await open("help/");
  const form = p.locator('form[data-form="footer"]:has(input[name="topic"][value="help"])');
  await form.locator('[name="name"]').fill("Pat"); await form.locator('[name="email"]').fill("pat@example.com"); await form.locator('[name="body"]').fill("My dog needs food");
  await form.locator('[type="submit"]').click(); await wait(p, 700);
  const s = sb.log.find(l => l.submit)?.submit;
  ok(s && s.p_topic === "help" && s.p_email === "pat@example.com" && s.p_body === "My dog needs food" && s.p_page === "/help/", "the help form sends to the inbox, with the page it came from");
  ok(/will see this/.test(await form.locator(".formmsg").innerText()) && (await form.locator('[name="body"]').inputValue()) === "", "it says thanks and clears");
  await form.locator('[name="email"]').fill("bot@example.com"); await form.locator('[name="website"]').evaluate(i => { i.value = "spam"; });
  await form.locator('[type="submit"]').click(); await wait(p, 500);
  ok(sb.log.filter(l => l.submit).length === 1, "a bot filling the hidden box gets thanks, but nothing is sent");
  await ctx.close();
}
{
  const { ctx, p, sb } = await open("partner/");
  const form = p.locator('form[data-form="partner"]');
  await form.locator('[name="email"]').fill("dir@example.org");
  const boxes = form.locator('[name="want"]');
  if (await boxes.count()) { await boxes.nth(0).check(); await boxes.nth(1).check(); }
  const required = form.locator("input[required]:not([type=email]):not([type=checkbox]), textarea[required]");
  for (let i = 0; i < await required.count(); i++) await required.nth(i).fill("Test");
  await form.locator('[type="submit"]').click(); await wait(p, 700);
  const s = sb.log.find(l => l.submit)?.submit;
  ok(s && s.p_topic === "partner" && Array.isArray(s.p_details.want) && s.p_details.want.length === 2, "the partner form sends what they're interested in, as a list");
  await ctx.close();
}
for (const [why, body, says] of [["too many", "slow down", /a lot of messages/], ["a bad email", "bad email", /doesn't look right/], ["the server failing", "boom", /Couldn't send right now/]]) {
  const { ctx, p } = await open("ask/", { sb: fakeSupabase({ submitReply: { status: 400, body: { message: body } } }) });
  const form = p.locator('form[data-form="request"]');
  await form.locator('[name="email"]').fill("x@example.com");
  await form.locator('[name="kind"]').first().check();
  const required = form.locator("textarea[required], input[required]:not([type=email]):not([type=checkbox]):not([type=radio])");
  for (let i = 0; i < await required.count(); i++) await required.nth(i).fill("Test");
  await form.locator('[type="submit"]').click(); await wait(p, 600);
  ok(says.test(await form.locator(".formmsg").innerText()) && await form.locator('[type="submit"]').isEnabled(), `a form answer for ${why} says so, and the button works again`);
  await ctx.close();
}

// ---------- wording saved on the edit page ----------
{
  const sb = fakeSupabase();
  const { ctx, p } = await open("", { sb });
  const key = await p.$eval("p[data-text], [data-t]", el => el.dataset.text || el.dataset.t);
  await ctx.close();
  sb.D.site_text.push({ key, body: "Brand new words " + '<img src=x onerror="window.__pwned=1">', updated_at: new Date().toISOString() });
  const again = await open("", { sb });
  const shown = await again.p.$eval(`[data-text="${key}"], [data-t="${key}"]`, el => el.textContent);
  ok(shown.startsWith("Brand new words <img"), "wording saved since the build shows straight away, as plain text: " + key);
  ok(!(await pwned(again.p)), "saved wording never runs as code");
  await again.ctx.close();
}

// ---------- when Supabase can't be reached ----------
{
  const { ctx, p } = await newPage(browser);
  await ctx.unroute(SB + "/**");
  await ctx.route(SB + "/**", r => r.fulfill({ status: 500, body: "down", headers: { "access-control-allow-origin": "*" } }));
  await p.goto(B + "animals/"); await wait(p, 2000);
  ok(/couldn't load right now/.test(await text(p, "[data-wall]")), "Happy Tales says it couldn't load, and invents nothing");
  await p.goto(B + "shelter-goals/"); await wait(p, 2000);
  ok(/couldn't load right now/.test(await text(p, '[data-goals="active"]')), "so do the shelter goals");
  ok(!p.errs.length, "and nothing breaks" + errors(p));
  await ctx.close();
}

// ---------- visitor counts ----------
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const human = "Object.defineProperty(navigator, 'webdriver', { get: () => false })";
{
  const { ctx, p, sb } = await open("?from=TikTok", { init: human, ctxOpts: { userAgent: PHONE_UA } });
  const c = sb.log.find(l => l.count)?.count;
  ok(c && c.p_path === "/" && c.p_source === "tiktok", "a visit is counted with its page and where it came from: " + JSON.stringify(c));
  ok(!p.url().includes("from="), "and the ?from= tag is taken off the address");
  await ctx.close();
}
{
  const { ctx, sb } = await open("happy-tails", { init: human, ctxOpts: { userAgent: PHONE_UA } });
  const c = sb.log.find(l => l.count)?.count;
  ok(c && c.p_path === "/404" && c.p_missed === "/happy-tails", "a page that isn't there counts the address that was tried");
  await ctx.close();
}
{
  const { ctx, sb } = await open("", { init: human + "; localStorage.setItem('tt-no-count', '1')", ctxOpts: { userAgent: PHONE_UA } });
  ok(!sb.log.some(l => l.count), "a device set not to count isn't counted");
  await ctx.close();
}
{
  const { ctx, sb } = await open("");
  ok(!sb.log.some(l => l.count), "a robot (a browser run by a program) isn't counted");
  await ctx.close();
}

// ---------- signed-in editors see an Edit button on the site ----------
{
  const { ctx, p } = await open("animals/");
  ok(!(await p.locator("[data-editfab]").count()), "visitors don't see an Edit button");
  await ctx.close();
}
{
  const { ctx, p } = await open("animals/", { session: true, init: "localStorage.setItem('tt-editor-session', '{}')" });
  ok(await p.locator("[data-editfab]").isVisible(), "a signed-in editor gets an Edit button");
  await p.click("[data-editfab]"); await wait(p, 200);
  ok(await p.locator("#editmenu").isVisible() && (await p.locator('#editmenu a[href="/edit/#/animals"]').count()) === 1, "its menu links to this page's lists in the editor");
  await p.click("[data-pens]"); await wait(p, 400);
  ok((await p.locator("[data-edit] .pen, .pen").count()) > 0 || /Done editing/.test(await text(p, "[data-editfab]")), "Edit things on this page puts a pencil on each animal");
  await ctx.close();
}

// ---------- the menu ----------
{
  const { ctx, p } = await open("about/");
  await p.click(".menubtn"); await wait(p, 200);
  ok(await p.locator("#menu.open").isVisible() && (await p.getAttribute(".menubtn", "aria-expanded")) === "true", "the menu button opens the menu");
  await p.keyboard.press("Escape"); await wait(p, 200);
  ok(!(await p.locator("#menu.open").count()), "Escape closes it");
  await ctx.close();
}

await close();
process.exit(report("site"));
