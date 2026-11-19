// Runs every test, one after another: the build first (it leaves _site built the way the others need), then the
// pages, the public site, the edit page and the games. Prints each file's summary line, and the failures.
//   node tests/run-all.mjs            (add --verbose to see every PASS line too)
import { spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname), verbose = process.argv.includes("--verbose");
const files = ["build.test.mjs", "pages.test.mjs", "site.test.mjs", "edit.test.mjs", "games.test.mjs"];
let bad = 0;
for (const f of files) {
  const t = Date.now(), r = spawnSync(process.execPath, [path.join(here, f)], { encoding: "utf8", maxBuffer: 64 << 20 });
  const lines = (r.stdout + r.stderr).trim().split("\n");
  if (verbose) console.log(lines.join("\n"));
  else for (const l of lines.filter(l => /^FAIL|Error|error:/.test(l))) console.log("  " + l);
  console.log(`${r.status === 0 ? "✓" : "✗"} ${f}: ${lines.at(-1)} (${Math.round((Date.now() - t) / 1000)}s)`);
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n${bad} of ${files.length} test files had failures.` : `\nAll ${files.length} test files passed.`);
process.exit(bad ? 1 : 0);
