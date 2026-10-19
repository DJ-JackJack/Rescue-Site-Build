#!/usr/bin/env node
// Points the domain at GitHub Pages through Porkbun's API, so nobody has to type the records by hand.
//   PORKBUN_API_KEY=... PORKBUN_SECRET_KEY=... node tools/setup-dns.mjs terrortwinsflock.com [--apply] [--verify CODE]
// Without --apply it only says what it would change. It adds GitHub's four A and four AAAA records for the
// domain, www pointing at dj-jackjack.github.io and (with --verify) GitHub's domain verification TXT record.
// It removes only records that would get in their way: other A, AAAA, ALIAS or CNAME records on the domain or
// www, and Porkbun's parking records (the * wildcard). Email (MX, SPF) and anything else is left alone.
// .github/workflows/setup-dns.yml runs it with the keys kept as repository secrets.
const API = (process.env.PORKBUN_API || "https://api.porkbun.com/api/json/v3").replace(/\/+$/, "");
const KEYS = { apikey: process.env.PORKBUN_API_KEY, secretapikey: process.env.PORKBUN_SECRET_KEY };
const args = process.argv.slice(2);
const vi = args.indexOf("--verify"), code = vi >= 0 ? String(args.splice(vi, 2)[1] || "").trim() : "";
const apply = args.includes("--apply"), domain = (args.find(a => !a.startsWith("--")) || "").toLowerCase();
const OWNER = "dj-jackjack";
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) { console.error("Give the domain, like terrortwinsflock.com."); process.exit(1); }
if (!KEYS.apikey || !KEYS.secretapikey) { console.error("The Porkbun keys are missing. Add PORKBUN_API_KEY and PORKBUN_SECRET_KEY as repository secrets."); process.exit(1); }
if (code && !/^[A-Za-z0-9_-]{6,100}$/.test(code)) { console.error("That verification code doesn't look right. Copy just the code GitHub shows."); process.exit(1); }

async function call(path, body = {}) {
  const r = await fetch(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...KEYS, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (j.status !== "SUCCESS") {
    const msg = j.message || `HTTP ${r.status}`;
    const hint = /api access/i.test(msg) ? " Turn on API Access for the domain at Porkbun (Domain Management → the domain → Details)." : /invalid api key/i.test(msg) ? " Check the two secrets were pasted whole." : "";
    throw new Error(`Porkbun said: ${msg}.${hint}`);
  }
  return j;
}

const want = [
  ...["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"].map(ip => ({ sub: "", type: "A", content: ip })),
  ...["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"].map(ip => ({ sub: "", type: "AAAA", content: ip })),
  { sub: "www", type: "CNAME", content: `${OWNER}.github.io` },
  ...(code ? [{ sub: `_github-pages-challenge-${OWNER}`, type: "TXT", content: code }] : []),
];
const sub = name => (name.toLowerCase() === domain ? "" : name.toLowerCase().replace(new RegExp(`\\.${domain.replace(/\./g, "\\.")}$`), ""));
const norm = s => String(s).toLowerCase().replace(/\.$/, "");
const show = r => `${r.type} ${r.sub || "(root)"} → ${r.content}`;

await call("ping");
const have = (await call(`dns/retrieve/${domain}`)).records.map(r => ({ id: r.id, sub: sub(r.name), type: r.type, content: r.content }));
console.log(`Records on ${domain} now:`);
for (const r of have) console.log(`  ${show(r)}`);

const matches = (a, b) => a.sub === b.sub && a.type === b.type && norm(a.content) === norm(b.content);
const inTheWay = r => !want.some(w => matches(r, w)) && (
  (["", "www"].includes(r.sub) && ["A", "AAAA", "ALIAS", "CNAME"].includes(r.type)) ||
  (r.sub === "*" && ["A", "AAAA", "ALIAS", "CNAME"].includes(r.type)) ||
  (code && r.sub === `_github-pages-challenge-${OWNER}` && r.type === "TXT"));
const remove = have.filter(inTheWay), add = want.filter(w => !have.some(r => matches(r, w)));

console.log(`\n${apply ? "Changes:" : "Would change (nothing is changed without Apply):"}`);
if (!remove.length && !add.length) console.log("  nothing: the records are already right");
for (const r of remove) console.log(`  remove ${show(r)}`);
for (const w of add) console.log(`  add    ${show(w)}`);
if (!code) console.log("  (no verification code given, so GitHub's TXT record is left as it is)");
if (!apply) process.exit(0);

for (const r of remove) await call(`dns/delete/${domain}/${r.id}`);
for (const w of add) await call(`dns/create/${domain}`, { name: w.sub, type: w.type, content: w.content, ttl: "600" });
const after = (await call(`dns/retrieve/${domain}`)).records.map(r => ({ sub: sub(r.name), type: r.type, content: r.content }));
const missing = want.filter(w => !after.some(r => matches(r, w)));
console.log(`\nRecords on ${domain} after:`);
for (const r of after) console.log(`  ${show(r)}`);
if (missing.length) { console.error(`\nStill missing: ${missing.map(show).join("; ")}`); process.exit(1); }
console.log("\nDone. Every record GitHub Pages needs is in place.");
