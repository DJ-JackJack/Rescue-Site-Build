#!/usr/bin/env node
// Checks the published site from the outside: every page in the sitemap loads, link previews point at
// the right address and their images load, preview mode is on or off everywhere at once, the edit page
// stays hidden from search engines, and missing pages get the 404 page.
//   node tools/check-site.mjs https://example.com/
// .github/workflows/check-site.yml runs it after every deploy. On launch day it also checks HTTPS,
// the www address and the redirect from the old github.io address (see docs/launch-checklist.md).
const site = new URL(process.argv[2] || process.env.SITE_URL || "https://dj-jackjack.github.io/Rescue-Site-Build/");
if (!site.pathname.endsWith("/")) site.pathname += "/";
const OLD = "https://dj-jackjack.github.io/Rescue-Site-Build/";
const custom = !site.hostname.endsWith(".github.io");

const results = [];
const check = (ok, what, detail = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`); };
async function get(url, opts = {}) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, { redirect: "follow", ...opts, headers: { "user-agent": "TheTerr0rTwins-site-check", ...opts.headers } }); }
    catch (e) { if (i >= 3) return { ok: false, status: 0, url, text: async () => "", error: e }; await new Promise(ok => setTimeout(ok, 2000 * i)); }
  }
}
const attr = (html, re) => (html.match(re) || [])[1] || "";

// the homepage decides which mode the site is in
const homeRes = await get(site.href);
const home = await homeRes.text();
check(homeRes.status === 200, "homepage loads", `${homeRes.status} ${site.href}`);
const preview = /<meta name="robots" content="noindex/.test(home);
console.log(`  mode: ${preview ? "preview (hidden from search engines)" : "launched"}`);

const sitemapRes = await get(new URL("sitemap.xml", site));
const urls = [...(await sitemapRes.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, "&"));
check(sitemapRes.status === 200 && urls.length > 0, "sitemap lists the pages", `${urls.length} pages`);
check(urls.every(u => u.startsWith(site.href)), "sitemap uses this address", urls.find(u => !u.startsWith(site.href)) || site.origin);

const images = new Set();
for (const u of urls) {
  const r = await get(u), html = await r.text();
  const canon = attr(html, /<link rel="canonical" href="([^"]+)"/), og = attr(html, /<meta property="og:url" content="([^"]+)"/);
  const img = attr(html, /<meta property="og:image" content="([^"]+)"/).replace(/&amp;/g, "&");
  const problems = [];
  if (r.status !== 200) problems.push(`status ${r.status}`);
  if (canon !== u || og !== u) problems.push(`preview address ${canon || "missing"}`);
  if (!img.startsWith(site.href)) problems.push(`share image ${img || "missing"}`);
  if (/\{\{[^}]*\}\}/.test(html)) problems.push("unfilled placeholder");
  if (/<meta name="robots" content="noindex/.test(html) !== preview) problems.push("preview mode differs from the homepage");
  if (/class="preview"/.test(html) !== preview) problems.push("preview banner differs from the homepage");
  if (img) images.add(img);
  check(!problems.length, `page ${new URL(u).pathname}`, problems.join(", "));
}
for (const img of images) {
  const r = await get(img);
  check(r.status === 200 && /^image\//.test(r.headers?.get?.("content-type") || ""), `share image ${new URL(img).pathname.split("/").pop()}`, String(r.status));
}

const robots = await (await get(new URL("robots.txt", site))).text();
if (preview) check(/Disallow: \/\s*$/m.test(robots), "robots.txt keeps search engines out (preview)");
else check(!/Disallow: \/\s*$/m.test(robots) && robots.includes(`Sitemap: ${site.href}sitemap.xml`) && robots.includes(`Disallow: ${site.pathname}edit/`), "robots.txt lets search engines in, lists the sitemap, skips /edit/");

const edit = await get(new URL("edit/", site)), editHtml = await edit.text();
check(edit.status === 200 && /<meta name="robots" content="noindex/.test(editHtml), "edit page loads and is hidden from search engines");
const missing = await get(new URL(`no-such-page-${Date.now()}/`, site));
check(missing.status === 404 && (await missing.text()).includes("<title>Page not found · TheTerr0rTw!ns</title>"), "a missing page shows the site's 404 page", String(missing.status));

let c = null;
try { c = JSON.parse(attr(home, /window\.SITE=(\{.*?\});<\/script>/)); } catch {}
const live = c && await get(`${c.supabaseUrl}/rest/v1/goals?select=id&limit=1`, { headers: { apikey: c.supabaseKey } });
check(live?.status === 200, "live content database answers", !c ? "settings not found on the homepage" : live.status === 540 ? "paused: resume it in Supabase" : String(live.status));

if (custom) {
  const plain = await get(`http://${site.host}${site.pathname}`, { redirect: "manual" });
  check([301, 302, 307, 308].includes(plain.status) && (plain.headers.get("location") || "").startsWith(`https://${site.host}`), "http:// sends visitors to https://", `${plain.status} ${plain.headers?.get?.("location") || ""}`);
  const other = site.hostname.startsWith("www.") ? site.hostname.slice(4) : "www." + site.hostname;
  const alt = await get(`https://${other}/`);
  check(alt.status === 200 && new URL(alt.url).hostname === site.hostname, `${other} leads to ${site.hostname}`, `${alt.status} ${alt.url}`);
  const old = await get(OLD + "about/");
  check(old.status === 200 && new URL(old.url).hostname === site.hostname, "the old github.io address leads to the new one", `${old.status} ${old.url}`);
}

const bad = results.filter(ok => !ok).length;
console.log(bad ? `\n${bad} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(bad ? 1 : 0);
