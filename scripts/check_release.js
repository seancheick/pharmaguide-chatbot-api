#!/usr/bin/env node
/**
 * CI release gate — run before deploy to catch regressions.
 * Usage: node scripts/check_release.js [--date YYYY-MM-DD]
 *
 * Exit code 0 = all checks pass, 1 = failures found.
 */

const { runAllChecks, hashGoldenTraces } = require("../src/infra/releaseGuard");

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
} else {
  console.log("\n  Release checks passed.");
}
