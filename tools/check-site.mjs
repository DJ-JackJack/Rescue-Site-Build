#!/usr/bin/env node
// Checks the published site from the outside: every page in the sitemap loads, link previews point at
// the right address and their images load, preview mode is on or off everywhere at once, the edit page
// stays hidden from search engines, and missing pages get the 404 page.
//   node tools/check-site.mjs https://example.com/
//   node tools/check-site.mjs https://example.com/ --dns     (only the domain's DNS records, while setting it up)
// .github/workflows/check-site.yml runs it after every deploy. On its own domain it also checks the DNS
// records, HTTPS, the www address and the redirect from the old github.io address (see docs/launch-checklist.md).
import dns from "node:dns/promises";
const args = process.argv.slice(2), dnsOnly = args.includes("--dns");
const site = new URL(args.find(a => !a.startsWith("--")) || process.env.SITE_URL || "https://dj-jackjack.github.io/Rescue-Site-Build/");
if (!site.pathname.endsWith("/")) site.pathname += "/";
if (site.protocol === "http:" && !/^(localhost|127\.)/.test(site.hostname)) site.protocol = "https:"; // GitHub says http:// until HTTPS is enforced
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
const done = () => {
  const bad = results.filter(ok => !ok).length;
  console.log(bad ? `\n${bad} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(bad ? 1 : 0);
};

// A domain of its own: the records GitHub Pages asks for (docs/launch-checklist.md, step 2).
const OWNER = "dj-jackjack";
const GITHUB_A = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
const GITHUB_AAAA = ["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"];
async function checkDns() {
  const r = new dns.Resolver();
  r.setServers(["8.8.8.8", "1.1.1.1"]); // public resolvers, so the answer is what the world sees now
  const ask = (name, type) => r.resolve(name, type).catch(e => (["ENODATA", "ENOTFOUND"].includes(e.code) ? [] : Promise.reject(e)));
  const apex = site.hostname.replace(/^www\./, ""), www = "www." + apex;
  const list = xs => xs.join(", ") || "none";
  const ns = await ask(apex, "NS").catch(() => []);
  console.log(`  ${apex} is run by: ${list(ns.map(n => n.toLowerCase()))}`);
  const a = (await ask(apex, "A")).sort(), aaaa = (await ask(apex, "AAAA")).map(x => x.toLowerCase()).sort();
  check(a.join() === GITHUB_A.join(), `${apex} A records are GitHub's four`, list(a));
  check(!aaaa.length || aaaa.join() === GITHUB_AAAA.join(), `${apex} AAAA records are GitHub's four (or there are none)`, list(aaaa));
  const cname = (await ask(www, "CNAME")).map(x => x.toLowerCase().replace(/\.$/, ""));
  check(cname.join() === `${OWNER}.github.io`, `${www} points at ${OWNER}.github.io`, list(cname));
  const caa = await ask(apex, "CAA");
  if (caa.length) check(caa.some(c => c.issue === "letsencrypt.org"), "CAA records allow GitHub's HTTPS certificate (letsencrypt.org)", list(caa.map(c => c.issue || c.issuewild || "")));
  const txt = (await ask(`_github-pages-challenge-${OWNER}.${apex}`, "TXT")).flat();
  console.log(`  GitHub's domain verification record: ${txt.length ? "found" : "not found (only needed until GitHub shows the domain as verified)"}`);
}
if (custom) await checkDns();
if (dnsOnly) done();

// the homepage decides which mode the site is in
const homeRes = await get(site.href);
const home = await homeRes.text();
check(homeRes.status === 200, "homepage loads", `${homeRes.status || homeRes.error?.cause?.code || homeRes.error?.message} ${site.href}`);
if (homeRes.status !== 200) {
  if (custom && !homeRes.status) console.log("  If Enforce HTTPS is still greyed out in the repo's Settings → Pages, GitHub is still making the certificate. Run this again in a while.");
  done();
}
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

done();
