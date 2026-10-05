/**
 * The README's numbers are generated from the code (scripts/readme_metrics.js).
 * This fails, with the fix in the message, when someone adds a route, KB entry,
 * claim, rule or suite without regenerating them.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("README metrics match the code", () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, "../scripts/readme_metrics.js"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
