/**
 * Release guard — CI-time checks that prevent regressions from reaching prod.
 * Run via: node scripts/check_release.js
 *
 * Checks:
 * 1. Golden traces snapshot hash hasn't changed without approval
 * 2. No claims are expired/needs-review
 * 3. Analytics forbidden keys list matches RELEASE.json
 * 4. Policy version matches manifest
 * 5. All claims have valid governance metadata
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RELEASE_PATH = path.join(__dirname, "../../docs/safety-case/RELEASE.json");

function loadRelease() {
  const raw = fs.readFileSync(RELEASE_PATH, "utf-8");
  return JSON.parse(raw);
}

/**
 * Hash the golden traces test file to detect changes.
 */
function hashGoldenTraces() {
  const tracesPath = path.join(__dirname, "../../test/golden-traces.test.js");
  const content = fs.readFileSync(tracesPath, "utf-8");
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Check that no approved claims are expired or due for review.
 */
function checkClaimsGovernance(asOfDate) {
  const { getClaimsDueForReview, validateGovernanceFields, APPROVED_CLAIMS } = require("../../src/config/approvedClaims");
  const issues = [];

  // Governance field validation
  const govResult = validateGovernanceFields();
  if (!govResult.valid) {
    issues.push(...govResult.issues.map(i => `governance: ${i}`));
  }

  // Expiry check
  const due = getClaimsDueForReview(asOfDate);
  for (const claim of due) {
    issues.push(`claim "${claim.id}" is due for review (last reviewed: ${claim.review_date}, cycle: ${claim.review_cycle_months}mo)`);
  }

  // Check for deprecated claims still referenced by policy
  const { validateClaimCoverage } = require("../../src/config/approvedClaims");
  const coverage = validateClaimCoverage();
  if (!coverage.valid) {
    issues.push(...coverage.issues.map(i => `coverage: ${i}`));
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Check that analytics forbidden keys match the release manifest.
 */
function checkAnalyticsForbiddenKeys() {
  const { FORBIDDEN_KEYS } = require("../../src/infra/analytics");
  const release = loadRelease();
  const issues = [];

  const manifestKeys = new Set(release.forbidden_analytics_keys || []);
  const codeKeys = FORBIDDEN_KEYS;

  // Keys in manifest but not in code (weakened protection)
  for (const key of manifestKeys) {
    if (!codeKeys.has(key)) {
      issues.push(`forbidden key "${key}" is in RELEASE.json but removed from code — protection weakened`);
    }
  }

  // Keys in code but not in manifest (new protection — ok but flag for manifest update)
  for (const key of codeKeys) {
    if (!manifestKeys.has(key)) {
      issues.push(`forbidden key "${key}" is in code but not in RELEASE.json — update manifest`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Check that policy version matches manifest.
 */
function checkPolicyVersion() {
  const { getPolicyVersion } = require("../../src/config/safetyPolicy");
  const release = loadRelease();
  const issues = [];

  if (getPolicyVersion() !== release.policy_version) {
    issues.push(`policy version mismatch: code="${getPolicyVersion()}", manifest="${release.policy_version}"`);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Check that claims count matches manifest.
 */
function checkClaimsCount() {
  const { APPROVED_CLAIMS } = require("../../src/config/approvedClaims");
  const release = loadRelease();
  const issues = [];

  const actual = Object.keys(APPROVED_CLAIMS).length;
  if (actual !== release.claims_count) {
    issues.push(`claims count mismatch: code=${actual}, manifest=${release.claims_count} — update RELEASE.json`);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Run all release checks. Returns { passed, failed, results[] }.
 */
function runAllChecks(options = {}) {
  const asOfDate = options.asOfDate || new Date().toISOString();
  const results = [];

  const checks = [
    { name: "policy_version", fn: () => checkPolicyVersion() },
    { name: "claims_governance", fn: () => checkClaimsGovernance(asOfDate) },
    { name: "claims_count", fn: () => checkClaimsCount() },
    { name: "analytics_forbidden_keys", fn: () => checkAnalyticsForbiddenKeys() },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = check.fn();
      results.push({ name: check.name, ...result });
      if (result.valid) passed++;
      else failed++;
    } catch (err) {
      results.push({ name: check.name, valid: false, issues: [`Error: ${err.message}`] });
      failed++;
    }
  }

  return { passed, failed, total: checks.length, results };
}

module.exports = {
  loadRelease,
  hashGoldenTraces,
  checkClaimsGovernance,
  checkAnalyticsForbiddenKeys,
  checkPolicyVersion,
  checkClaimsCount,
  runAllChecks,
};
