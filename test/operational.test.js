/**
 * Operational upgrades tests — release guard, circuit breaker, response linter,
 * claim bundles, safety monitoring.
 * Run: node test/operational.test.js
 */

const {
  loadRelease, hashGoldenTraces, checkClaimsGovernance,
  checkAnalyticsForbiddenKeys, checkPolicyVersion, checkClaimsCount, runAllChecks,
} = require("../src/infra/releaseGuard");

const {
  getState, allowRequest, recordSuccess, recordFailure, getStats, reset,
  FAILURE_THRESHOLD, SUCCESS_THRESHOLD,
} = require("../src/infra/circuitBreaker");

const {
  validateResponse, lintResponse, PROHIBITED_PHRASES, WORD_COUNT_BANDS,
} = require("../src/postprocess/safetyValidator");

const {
  APPROVED_CLAIMS, getClaimById, getClaimBundle, validateRelatedClaims,
} = require("../src/config/approvedClaims");

const {
  getSafetySnapshot, _resetAnalytics, _pushEvent, DEFAULT_THRESHOLDS,
} = require("../src/infra/analytics");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

function section(title) { console.log(`\n── ${title} ──`); }

const emptyEntities = { meds: [], supplements: [], populations: [], symptoms: [], intents: [], unknowns: [] };

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Release Guard (~12 tests)
// ═══════════════════════════════════════════════════════════════
section("Release Guard — manifest loading");

assert("loadRelease returns object", (() => {
  const r = loadRelease();
  return r && typeof r === "object" && r.policy_version;
})());

assert("manifest has required fields", (() => {
  const r = loadRelease();
  return r.release_version && r.policy_version && r.claims_version &&
    r.model_ids && r.test_suites && r.forbidden_analytics_keys && r.claims_count;
})());

assert("hashGoldenTraces returns 16-char hex", /^[0-9a-f]{16}$/.test(hashGoldenTraces()));
assert("hashGoldenTraces is deterministic", hashGoldenTraces() === hashGoldenTraces());

section("Release Guard — checks");

assert("checkPolicyVersion passes", checkPolicyVersion().valid);

assert("checkClaimsGovernance passes (current date)", (() => {
  // Use review_date so claims aren't expired
  return checkClaimsGovernance("2026-03-03").valid;
})());

assert("checkClaimsGovernance detects expired claims", (() => {
  // Far future date — some claims will be past review cycle
  const result = checkClaimsGovernance("2028-01-01");
  return !result.valid && result.issues.length > 0;
})());

assert("checkAnalyticsForbiddenKeys passes", checkAnalyticsForbiddenKeys().valid);

assert("checkClaimsCount passes", checkClaimsCount().valid);

assert("runAllChecks returns summary", (() => {
  const result = runAllChecks({ asOfDate: "2026-03-03" });
  return result.passed > 0 && result.total > 0 && result.results.length > 0;
})());

assert("runAllChecks all pass with current date", (() => {
  const result = runAllChecks({ asOfDate: "2026-03-03" });
  return result.failed === 0;
})());

assert("runAllChecks detects expired claims in future", (() => {
  const result = runAllChecks({ asOfDate: "2028-01-01" });
  return result.failed > 0;
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Circuit Breaker (~15 tests)
// ═══════════════════════════════════════════════════════════════
section("Circuit Breaker — initial state");

reset();
assert("initial state is CLOSED", getState() === "CLOSED");
assert("requests allowed when CLOSED", allowRequest().allowed === true);

section("Circuit Breaker — failure threshold");

reset();
for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
  recordFailure();
}
assert("still CLOSED before threshold", getState() === "CLOSED");
assert("requests still allowed", allowRequest().allowed);

recordFailure();
assert("OPEN after threshold failures", getState() === "OPEN");
assert("requests blocked when OPEN", allowRequest().allowed === false);

section("Circuit Breaker — recovery");

reset();
for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
assert("circuit is OPEN", getState() === "OPEN");

// Simulate time passing (hack: manipulate via getStats)
// We can't easily time-travel, so test HALF_OPEN transition via manual probe
// Instead, test that reset() works
reset();
assert("reset restores CLOSED", getState() === "CLOSED");

section("Circuit Breaker — success resets failure count");

reset();
recordFailure();
recordFailure();
recordSuccess();
assert("success resets failure count", getStats().failure_count === 0);

// Now need threshold failures again to open
for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
assert("opens again after fresh threshold", getState() === "OPEN");

section("Circuit Breaker — stats");

reset();
recordFailure();
recordFailure();
const stats = getStats();
assert("stats has state", stats.state === "CLOSED");
assert("stats has failure_count", stats.failure_count === 2);
assert("stats has last_failure_time", stats.last_failure_time !== null);

reset();
assert("stats after reset", getStats().failure_count === 0 && getStats().state === "CLOSED");

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Response Linter (~20 tests)
// ═══════════════════════════════════════════════════════════════
section("Response Linter — word count");

assert("normal gate reply is clean", (() => {
  const reply = "Magnesium glycinate is a well-absorbed form. It may support sleep and relaxation when taken at standard doses. Your pharmacist can help confirm it fits with your current medications.";
  return lintResponse(reply, "gate", emptyEntities).clean;
})());

assert("very short reply flags word_count_low", (() => {
  const reply = "Yes.";
  const result = lintResponse(reply, "gate", emptyEntities);
  return result.warnings.some(w => w.rule === "word_count_low");
})());

assert("very long reply flags word_count_high", (() => {
  const reply = ("This is a test sentence. ").repeat(120);
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "word_count_high");
})());

section("Response Linter — prohibited jargon");

assert("bioavailability flagged", (() => {
  const reply = "The bioavailability of magnesium glycinate is higher than oxide. Take 200mg daily for best absorption and relaxation support.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon" && w.detail.includes("bioavailability"));
})());

assert("pharmacokinetic flagged", (() => {
  const reply = "The pharmacokinetic profile of this supplement shows rapid absorption. Consider taking it with food for better results and reduced stomach discomfort.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon");
})());

assert("half-life flagged", (() => {
  const reply = "This medication has a half-life of approximately 12 hours. That means it stays in your system for about a day after you take it.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon");
})());

assert("serum level flagged", (() => {
  const reply = "Your serum level of vitamin D determines the dose needed. Ask your doctor about checking this value before starting supplementation.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon");
})());

assert("hepatic flagged", (() => {
  const reply = "This supplement undergoes hepatic metabolism and may interact with other liver-processed medications. Check with your pharmacist about potential combinations.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon");
})());

assert("cytochrome p450 flagged", (() => {
  const reply = "Grapefruit inhibits cytochrome p450 enzymes that process many medications. Avoid grapefruit within 24 hours of taking your statin medication.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "prohibited_jargon");
})());

assert("clean reply has no jargon flags", (() => {
  const reply = "Magnesium glycinate is generally well-tolerated. A common dose is 200-400mg daily. Take it in the evening if using for sleep support.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return !result.warnings.some(w => w.rule === "prohibited_jargon");
})());

section("Response Linter — interaction severity context");

assert("interaction gate reply without bold severity marker flags", (() => {
  const entities = { ...emptyEntities, intents: ["interaction_check"] };
  const reply = "These two items may interact with each other. Please check with your pharmacist before combining them together.";
  const result = lintResponse(reply, "gate", entities);
  return result.warnings.some(w => w.rule === "missing_severity_context");
})());

assert("interaction gate reply WITH bold severity marker is clean", (() => {
  const entities = { ...emptyEntities, intents: ["interaction_check"] };
  const reply = "**Important risk warning**: Combining these two items raises significant safety concerns. Please discuss with your pharmacist before combining.";
  const result = lintResponse(reply, "gate", entities);
  return !result.warnings.some(w => w.rule === "missing_severity_context");
})());

assert("non-interaction reply doesn't need severity marker", (() => {
  const reply = "Magnesium glycinate is a form of magnesium bound to glycine. It may support relaxation and is generally well-tolerated at standard doses.";
  const result = lintResponse(reply, "gate", emptyEntities);
  return !result.warnings.some(w => w.rule === "missing_severity_context");
})());

section("Response Linter — coherence");

assert("lowercase start flagged", (() => {
  const reply = "magnesium is a mineral that supports muscle relaxation and sleep. Consider taking it in the evening for best results.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return result.warnings.some(w => w.rule === "starts_lowercase");
})());

assert("uppercase start is clean", (() => {
  const reply = "Magnesium is a mineral that supports muscle relaxation and sleep. Consider taking it in the evening for best results.";
  const result = lintResponse(reply, "llm", emptyEntities);
  return !result.warnings.some(w => w.rule === "starts_lowercase");
})());

assert("bullet point start is clean", (() => {
  const reply = "• Magnesium glycinate is well-absorbed\n• Take 200-400mg daily\n• Evening dosing may support sleep quality";
  const result = lintResponse(reply, "gate", emptyEntities);
  return !result.warnings.some(w => w.rule === "starts_lowercase");
})());

section("Response Linter — doesn't break existing validator");

assert("validateResponse still works normally", (() => {
  const result = validateResponse("Magnesium is safe. Take 200mg daily.", "llm", emptyEntities, null);
  return result.safe;
})());

assert("validateResponse still catches diagnosing", (() => {
  const result = validateResponse("You have a magnesium deficiency disorder.", "llm", emptyEntities, null);
  return !result.safe && result.violations.some(v => v.rule === "no_diagnosing");
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Claim Bundles (~10 tests)
// ═══════════════════════════════════════════════════════════════
section("Claim Bundles");

assert("getClaimBundle returns primary + related", (() => {
  const bundle = getClaimBundle("serotonin-syndrome-clinical");
  return bundle && bundle.primary.id === "serotonin-syndrome-clinical" &&
    bundle.related.length > 0 &&
    bundle.related.some(r => r.id === "ssri-discontinuation-syndrome");
})());

assert("getClaimBundle for retinol has 3 related", (() => {
  const bundle = getClaimBundle("retinol-teratogenicity");
  return bundle && bundle.related.length === 3;
})());

assert("getClaimBundle returns null for unknown claim", getClaimBundle("nonexistent") === null);

assert("getClaimBundle for claim without related_claims", (() => {
  const bundle = getClaimBundle("hepatotoxicity-stacking");
  return bundle && bundle.related.length === 0;
})());

assert("nsaid-anticoagulant links to anticoagulant-supplement + triple-whammy", (() => {
  const bundle = getClaimBundle("nsaid-anticoagulant-bleeding");
  return bundle.related.length === 2 &&
    bundle.related.some(r => r.id === "anticoagulant-supplement-interaction") &&
    bundle.related.some(r => r.id === "triple-whammy-aki");
})());

assert("triple-whammy links to 3 related claims", (() => {
  const bundle = getClaimBundle("triple-whammy-aki");
  return bundle.related.length === 3;
})());

assert("validateRelatedClaims passes (all refs valid)", validateRelatedClaims().valid);

assert("bidirectional: serotonin ↔ discontinuation", (() => {
  const a = getClaimBundle("serotonin-syndrome-clinical");
  const b = getClaimBundle("ssri-discontinuation-syndrome");
  return a.related.some(r => r.id === "ssri-discontinuation-syndrome") &&
    b.related.some(r => r.id === "serotonin-syndrome-clinical");
})());

assert("claim bundle primary has all governance fields", (() => {
  const bundle = getClaimBundle("serotonin-syndrome-clinical");
  const p = bundle.primary;
  return p.domain && p.claim && p.confidence && p.review_date && p.status && p.tags;
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Safety Monitoring (~10 tests)
// ═══════════════════════════════════════════════════════════════
section("Safety Monitoring — getSafetySnapshot");

_resetAnalytics();

assert("empty state: no alerts", (() => {
  const snap = getSafetySnapshot();
  return !snap.has_alerts && snap.total_events === 0;
})());

// Push events to trigger thresholds
for (let i = 0; i < 12; i++) {
  _pushEvent({ route: "system:emergency", severity: "red", validator_violations: [], is_retry: false, source: "gate" });
}
for (let i = 0; i < 25; i++) {
  _pushEvent({ route: "system:off-topic", severity: "green", validator_violations: [], is_retry: false, source: "gate" });
}

assert("emergency spike detected", (() => {
  const snap = getSafetySnapshot();
  return snap.has_alerts && snap.alerts.some(a => a.rule === "emergency_spike");
})());

assert("jailbreak spike detected", (() => {
  const snap = getSafetySnapshot();
  return snap.alerts.some(a => a.rule === "jailbreak_spike");
})());

assert("emergency count accurate", getSafetySnapshot().emergency_count === 12);
assert("jailbreak count accurate", getSafetySnapshot().jailbreak_count === 25);

_resetAnalytics();

// Push events with high validator violation rate
for (let i = 0; i < 5; i++) {
  _pushEvent({ route: "llm", severity: "green", validator_violations: ["no_diagnosing"], is_retry: false, source: "llm" });
}
for (let i = 0; i < 5; i++) {
  _pushEvent({ route: "llm", severity: "green", validator_violations: [], is_retry: false, source: "llm" });
}

assert("violation rate = 50%", getSafetySnapshot().violation_rate === 50);

assert("validator_catch_rate_high alert triggered", (() => {
  const snap = getSafetySnapshot();
  return snap.alerts.some(a => a.rule === "validator_catch_rate_high");
})());

assert("violations_by_rule tracks rule counts", (() => {
  const snap = getSafetySnapshot();
  return snap.violations_by_rule.no_diagnosing === 5;
})());

_resetAnalytics();

// High retry rate
for (let i = 0; i < 10; i++) {
  _pushEvent({ route: "llm", severity: "green", validator_violations: [], is_retry: true, source: "llm" });
}
for (let i = 0; i < 10; i++) {
  _pushEvent({ route: "llm", severity: "green", validator_violations: [], is_retry: false, source: "llm" });
}

assert("retry rate = 50%", getSafetySnapshot().retry_rate === 50);
assert("retry_rate_high alert triggered", (() => {
  const snap = getSafetySnapshot();
  return snap.alerts.some(a => a.rule === "retry_rate_high");
})());

section("Safety Monitoring — custom thresholds");

_resetAnalytics();
for (let i = 0; i < 3; i++) {
  _pushEvent({ route: "system:emergency", severity: "red", validator_violations: [], is_retry: false, source: "gate" });
}

assert("no alert with high threshold", (() => {
  const snap = getSafetySnapshot({ emergency_max: 100 });
  return !snap.has_alerts;
})());

assert("alert with low threshold", (() => {
  const snap = getSafetySnapshot({ emergency_max: 2 });
  return snap.has_alerts;
})());

section("Safety Monitoring — severity + source distribution");

_resetAnalytics();
_pushEvent({ route: "llm", severity: "red", validator_violations: [], is_retry: false, source: "llm" });
_pushEvent({ route: "llm", severity: "yellow", validator_violations: [], is_retry: false, source: "gate" });
_pushEvent({ route: "llm", severity: "green", validator_violations: [], is_retry: false, source: "cache" });

assert("severity counts correct", (() => {
  const snap = getSafetySnapshot();
  return snap.severity_counts.red === 1 && snap.severity_counts.yellow === 1 && snap.severity_counts.green === 1;
})());

assert("source counts correct", (() => {
  const snap = getSafetySnapshot();
  return snap.source_counts.llm === 1 && snap.source_counts.gate === 1 && snap.source_counts.cache === 1;
})());

// ═══════════════════════════════════════════════════════════════
// Final tally
// ═══════════════════════════════════════════════════════════════
_resetAnalytics();
reset();

console.log(`\n${"═".repeat(50)}`);
console.log(`Operational tests: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log("All operational tests passed!");
