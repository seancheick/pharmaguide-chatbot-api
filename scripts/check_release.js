#!/usr/bin/env node
/**
 * CI release gate — run before deploy to catch regressions.
 * Usage: node scripts/check_release.js [--date YYYY-MM-DD]
 *
 * Exit code 0 = all checks pass, 1 = failures found.
 */

const { runAllChecks, hashGoldenTraces } = require("../src/infra/releaseGuard");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Parse optional --date flag
let asOfDate = new Date().toISOString();
const dateIdx = process.argv.indexOf("--date");
if (dateIdx !== -1 && process.argv[dateIdx + 1]) {
  asOfDate = process.argv[dateIdx + 1];
}

console.log("╔══════════════════════════════════════════════╗");
console.log("║        PharmaGuide Release Gate Check        ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`  Date: ${asOfDate}`);
console.log(`  Golden traces hash: ${hashGoldenTraces()}`);
console.log("");

const { passed, failed, total, results } = runAllChecks({ asOfDate });

for (const result of results) {
  const icon = result.valid ? "✓" : "✗";
  console.log(`  ${icon}  ${result.name}`);
  if (!result.valid) {
    for (const issue of result.issues) {
      console.log(`     → ${issue}`);
    }
  }
}

console.log("");
console.log(`  Result: ${passed}/${total} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\n  ⚠  Release blocked — fix issues above before deploying.");
  process.exit(1);
}

// ── Unit-test suite ─────────────────────────────────────────────
// Release guard runs golden-trace + metadata checks above. Now run
// the deterministic unit-test suite for routing, KB injection,
// validator, and the wellness-query battery. Any test failure
// blocks release.
//
// llm-behavior.test.js is INTENTIONALLY excluded — it makes live
// LLM calls and is non-deterministic at this layer (rate limits,
// model variance). It can be run separately via
//   node --test test/llm-behavior.test.js
// against a freshly-keyed provider as an integration check.
console.log("");
console.log("  Running deterministic unit-test suite...");
console.log("");
const testRoot = path.join(__dirname, "..", "test");
const fs = require("node:fs");
const SKIP_TESTS = new Set([
  // Live LLM integration — depends on rate-limit budget + valid key.
  // Run it manually with `node --test test/llm-behavior.test.js`
  // before promoting big LLM-behavioral changes.
  "llm-behavior.test.js",
]);
const testFiles = fs
  .readdirSync(testRoot)
  .filter((f) => f.endsWith(".test.js") && !SKIP_TESTS.has(f))
  .map((f) => path.join(testRoot, f));

// The suite must behave the same on a developer machine, in CI and in a Vercel build, where the
// real provider keys exist. Without this, tests that reach the LLM chain or the rate limiter would
// spend the production Gemini quota and write test traffic into the production Redis.
const SECRET_ENV = [
  "GEMINI_API_KEY", "GROQ_API_KEY",
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "PG_PROXY_SECRET", "PG_REQUIRE_PROXY_SECRET",
  "ANALYTICS_ENABLED", "ANALYTICS_SALT", "RATE_LIMIT_SALT",
  // Behaviour switches: tests that need a mode set it themselves. PG_PROMPT_MODE=selective in the
  // Vercel build made the golden cache trace (seeded under the full prompt's hash) fail the build.
  "PG_PROMPT_MODE",
];
const testEnv = { ...process.env };
for (const name of SECRET_ENV) delete testEnv[name];

const testRun = spawnSync(
  process.execPath,
  ["--test", ...testFiles],
  { stdio: "inherit", env: testEnv }
);
if (testRun.status !== 0) {
  console.log("\n  ⚠  Release blocked — unit-test suite failed.");
  process.exit(1);
}

console.log("\n  Release checks passed.");
