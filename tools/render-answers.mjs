#!/usr/bin/env node
// Turns questionnaire answers pulled from Supabase into a readable transcript.
//
// Usage:
//   node tools/render-answers.mjs <rows.json> [out.md]
//
// <rows.json> is either the array of rows returned by
//   select device_id, created_at, updated_at, save_count, answers
//   from public.questionnaire_responses order by updated_at desc;
// or a single bare answers object. Without [out.md] the transcript prints to stdout.
//
// The question text and the transcript format are read straight out of
// questionnaire/index.html, so the output always matches the live form and the
// "Copy all my answers" button.
//
// Her answers are private and this repo is public: write output under responses/,
// which is git-ignored, and never commit it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "questionnaire/index.html"), "utf8");

function slice(from, to) {
  const i = html.indexOf(from), j = html.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error(`questionnaire/index.html changed: cannot find ${from}`);
  return html.slice(i, j);
}
const code =
  slice("const SECTIONS = [", 'const KEY="wpq.v1";') +
  slice("function val(id)", "\nfunction set(") +
  slice("function transcript(){", "\nfunction paint(){") +
  "\nthis.SECTIONS=SECTIONS; this.transcript=transcript;";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath) {
  console.error("usage: node tools/render-answers.mjs <rows.json> [out.md]");
  process.exit(1);
}
let rows = JSON.parse(readFileSync(inPath, "utf8"));
if (!Array.isArray(rows)) rows = [{ device_id: "(single)", answers: rows }];

function render(answers) {
  const ctx = { S: answers };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { text: ctx.transcript(), sections: ctx.SECTIONS };
}

function checks(S, sections) {
  const qs = sections.flatMap(s => s.items.filter(i => i.q));
  const has = q => Object.keys(S).some(k => k === `q${q}` || k.startsWith(`q${q}_`));
  const skipped = qs.filter(i => !has(i.q));
  const arr = k => (Array.isArray(S[k]) ? S[k] : []);
  const must = Object.keys(S).filter(k => k.startsWith("q26_") && S[k] === "Must have");
  const out = [];
  out.push(`Answered ${qs.length - skipped.length} of ${qs.length} questions.`);
  if (skipped.length) out.push(`Skipped: ${skipped.map(i => "Q" + i.q).join(", ")}.`);
  if (!has(1)) out.push("Q1 (the website in her own words) is empty. It is the most useful answer for design; worth asking about directly.");
  if (arr("q11").length > 3) out.push(`Q11 asked for up to three visitor actions; she picked ${arr("q11").length}. Ask which three matter most before choosing the main buttons.`);
  if (arr("q31").length > 3) out.push(`Q31 asked for up to three feeling words; she picked ${arr("q31").length}. Ask which three to lead with.`);
  if (S.q27 === "One long page you scroll down" && must.length > 6)
    out.push(`Q27 says one long page, but Q26 marks ${must.length} pages as Must have. Discuss whether some become sections of the one page.`);
  if (S.q24 === "Right on my website" && S.q47 === "Free options only for now")
    out.push("Q24 wants checkout on the site but Q47 says free options only. On-site stores usually carry a monthly or per-sale fee.");
  if (S.q45 === "Me" && S.q46 === "I would rather not touch it")
    out.push("Q45 says she will update the site, but Q46 says she would rather not touch tech. Platform choice should lean very simple, or Krys takes updates.");
  if (["Often (every week or so)", "Sometimes (about monthly)"].includes(S.q19))
    out.push(`Q19: featured animals change ${S.q19.toLowerCase().split(" (")[0]}. The site needs an easy way to add animals without editing code.`);
  const orgsToAsk = [1, 2, 3, 4, 5, 6].filter(i => S[`q17_org${i}_ok`] === "I need to ask them").map(i => S[`q17_org${i}_name`] || `organization ${i}`);
  if (orgsToAsk.length) out.push(`Q17: permission still needed before featuring ${orgsToAsk.join(", ")}.`);
  if (S.q21) out.push("Q21 lists agreements or permissions. Check the mockup against them, including any coloring book or partner contract terms.");
  if (S.q22) out.push("Q22 lists sensitive animal-work details. Treat these as hard rules for every page.");
  if (arr("q42").length) out.push(`Q42, keep off the site: ${arr("q42").join("; ")}${S.q42_other ? "; " + S.q42_other : ""}.`);
  return out;
}

const parts = [];
for (const r of rows) {
  const S = r.answers || {};
  const { text, sections } = render(S);
  const lines = text.split("\n");
  lines[1] = `Device ${r.device_id}` + (r.updated_at ? `, last saved ${r.updated_at}` : "") + (r.save_count ? `, ${r.save_count} saves` : "");
  parts.push(lines.join("\n") + "\n\n=== CHECKS FOR KRYS ===\n" + checks(S, sections).map(x => "- " + x).join("\n") + "\n");
}
if (rows.length > 1)
  parts.unshift(`NOTE: ${rows.length} devices saved answers. Each is shown separately below, newest first; a phone and a laptop do not share answers.\n`);
const result = parts.join("\n\n----------------------------------------\n\n");

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result);
  console.error(`wrote ${outPath}`);
} else {
  process.stdout.write(result);
}
