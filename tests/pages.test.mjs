// Opens every page of the built site on a phone-sized screen against a fake Supabase (empty tables), and checks each
// one loads without script errors and fits the screen. Build first as described in games.test.mjs, then:
//   node tests/pages.test.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { start } from "./serve.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = 8793, B = `http://127.0.0.1:${PORT}`;
const SB = JSON.parse(fs.readFileSync(new URL("../site/supabase.json", import.meta.url))).url;
const sitemap = fs.readFileSync(new URL("../_site/sitemap.xml", import.meta.url), "utf8");
const paths = [...sitemap.matchAll(/<loc>[^<]*?(\/[^<]*)<\/loc>/g)].map(m => new URL(m[1], B).pathname);
const server = await start(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(SB + "/**", r => r.fulfill({ status: r.request().method() === "GET" ? 200 : 204, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: r.request().method() === "GET" ? "[]" : "" }));
await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
const results = [];
for (const path of [...new Set(paths)]) {
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  const res = await p.goto(B + path);
  await p.waitForTimeout(500);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  results.push((res.ok() && !errs.length && !wide ? "PASS " : "FAIL ") + path + (errs.length ? " " + errs.join(" | ") : "") + (wide ? " (wider than the screen)" : ""));
  await p.close();
}
await browser.close();
server.close();
console.log(results.join("\n"));
const failed = results.filter(r => r.startsWith("FAIL")).length;
console.log(`${failed} failed of ${results.length}`);
process.exit(failed ? 1 : 0);
