#!/usr/bin/env node
/**
 * Claims governance report — run periodically to track claim health.
 * Usage: node scripts/claims_report.js [--date YYYY-MM-DD]
 *
 * Reports:
 * 1. Claims expiring in 30/60/90 days
 * 2. Claims missing review owner (no approved_by)
 * 3. Bundle reference graph
 * 4. Coverage validation
 */

const {
  APPROVED_CLAIMS, getClaimsDueForReview, validateClaimCoverage,
  validateGovernanceFields, getClaimBundle, validateRelatedClaims,
} = require("../src/config/approvedClaims");

// Parse optional --date flag
let asOfDate = new Date();
const dateIdx = process.argv.indexOf("--date");
if (dateIdx !== -1 && process.argv[dateIdx + 1]) {
  asOfDate = new Date(process.argv[dateIdx + 1]);
}

console.log("╔══════════════════════════════════════════════╗");
console.log("║        PharmaGuide Claims Report             ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`  As of: ${asOfDate.toISOString().slice(0, 10)}`);
console.log(`  Total claims: ${Object.keys(APPROVED_CLAIMS).length}`);
console.log("");

// ── 1. Expiring claims ──
console.log("── Expiring Claims ──");

const windows = [30, 60, 90];
for (const days of windows) {
  const futureDate = new Date(asOfDate);
  futureDate.setDate(futureDate.getDate() + days);
  const expiring = getClaimsDueForReview(futureDate.toISOString());

  if (expiring.length > 0) {
    console.log(`\n  Within ${days} days (${expiring.length}):`);
    for (const claim of expiring) {
      const reviewed = new Date(claim.review_date);
      const nextReview = new Date(reviewed);
      nextReview.setMonth(nextReview.getMonth() + claim.review_cycle_months);
      console.log(`    • ${claim.id} (next review: ${nextReview.toISOString().slice(0, 10)}, cycle: ${claim.review_cycle_months}mo)`);
    }
  } else {
    console.log(`\n  Within ${days} days: none`);
  }
}

// ── 2. Claims status ──
console.log("\n── Claims by Status ──");
const statuses = { active: 0, under_review: 0, deprecated: 0 };
for (const [, claim] of Object.entries(APPROVED_CLAIMS)) {
  statuses[claim.status] = (statuses[claim.status] || 0) + 1;
}
for (const [status, count] of Object.entries(statuses)) {
  if (count > 0) console.log(`  ${status}: ${count}`);
}

// ── 3. Claims by confidence ──
console.log("\n── Claims by Confidence ──");
const confidences = {};
for (const [, claim] of Object.entries(APPROVED_CLAIMS)) {
  confidences[claim.confidence] = (confidences[claim.confidence] || 0) + 1;
}
for (const [conf, count] of Object.entries(confidences)) {
  console.log(`  ${conf}: ${count}`);
}

// ── 4. Bundle reference graph ──
console.log("\n── Bundle Reference Graph ──");
let bundledCount = 0;
let orphanCount = 0;

for (const [id, claim] of Object.entries(APPROVED_CLAIMS)) {
  const related = claim.related_claims || [];
  if (related.length > 0) {
    bundledCount++;
    console.log(`  ${id} → [${related.join(", ")}]`);
  } else {
    orphanCount++;
  }
}
console.log(`\n  Bundled: ${bundledCount}, Standalone: ${orphanCount}`);

// ── 5. Validation ──
console.log("\n── Validation ──");

const govResult = validateGovernanceFields();
console.log(`  Governance fields: ${govResult.valid ? "✓ valid" : "✗ issues found"}`);
if (!govResult.valid) {
  for (const issue of govResult.issues) console.log(`    → ${issue}`);
}

const coverageResult = validateClaimCoverage();
console.log(`  Policy coverage: ${coverageResult.valid ? "✓ all refs valid" : "✗ issues found"}`);
if (!coverageResult.valid) {
  for (const issue of coverageResult.issues) console.log(`    → ${issue}`);
}

const relatedResult = validateRelatedClaims();
console.log(`  Related claims: ${relatedResult.valid ? "✓ all refs valid" : "✗ issues found"}`);
if (!relatedResult.valid) {
  for (const issue of relatedResult.issues) console.log(`    → ${issue}`);
}

// ── 6. Shortest review cycles (highest governance burden) ──
console.log("\n── Shortest Review Cycles ──");
const sorted = Object.entries(APPROVED_CLAIMS)
  .sort((a, b) => a[1].review_cycle_months - b[1].review_cycle_months)
  .slice(0, 5);
for (const [id, claim] of sorted) {
  console.log(`  ${claim.review_cycle_months}mo — ${id} (${claim.domain})`);
}

console.log("\n  Report complete.");
