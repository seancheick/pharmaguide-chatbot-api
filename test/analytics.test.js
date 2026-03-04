/**
 * Analytics engine tests — entity classifier, analytics events, cache, dashboard.
 * Run: node test/analytics.test.js
 */

const { classifyMed, classifySupp, classifyEntities } = require("../src/core/entityClassifier");
const {
  buildAnalyticsEvent, assertNoForbiddenKeys, bucketLatency,
  hashForRetry, hashMessage, checkRepeat,
  getTopDomains, getTopValidatorRules, getTopMissingFields,
  getUnknownItemRate, getLatencyDistribution, getLLMErrorRate,
  getRetryRate, getRepeatRate, getTopMedClasses, getTopSuppClasses,
  getGrowthSignals, getSnapshot,
  _resetAnalytics, _pushEvent, FORBIDDEN_KEYS,
} = require("../src/infra/analytics");
const {
  buildCacheKey, isCacheable, getCachedResponse, setCachedResponse,
  getCacheStats, clearCache,
} = require("../src/infra/responseCache");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── Helpers ──
const emptyEntities = { meds: [], supplements: [], populations: [], symptoms: [], intents: [], unknowns: [] };
const emptyScores = { risk_flags: [] };

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Entity Classifier (~12 tests)
// ═══════════════════════════════════════════════════════════════
section("Entity Classifier — Med classes");

assert("sertraline → SSRI", classifyMed("sertraline") === "SSRI");
assert("zoloft → SSRI", classifyMed("zoloft") === "SSRI");
assert("venlafaxine → SNRI", classifyMed("venlafaxine") === "SNRI");
assert("phenelzine → MAOI", classifyMed("phenelzine") === "MAOI");
assert("bupropion → atypical_AD", classifyMed("bupropion") === "atypical_AD");
assert("lithium → mood_stabilizer", classifyMed("lithium") === "mood_stabilizer");
assert("atorvastatin → statin", classifyMed("atorvastatin") === "statin");
assert("lipitor → statin", classifyMed("lipitor") === "statin");
assert("warfarin → anticoagulant", classifyMed("warfarin") === "anticoagulant");
assert("amlodipine → CCB (not statin)", classifyMed("amlodipine") === "CCB");
assert("spironolactone → MRA (not other)", classifyMed("spironolactone") === "MRA");
assert("metformin → diabetes", classifyMed("metformin") === "diabetes");
assert("unknown med → other_med", classifyMed("somethingRandom") === "other_med");
assert("brand norvasc → CCB", classifyMed("norvasc") === "CCB");
assert("gabapentin → anticonvulsant", classifyMed("gabapentin") === "anticonvulsant");
assert("prednisone → corticosteroid", classifyMed("prednisone") === "corticosteroid");

section("Entity Classifier — Supp classes");

assert("5-htp → serotonergic", classifySupp("5-htp") === "serotonergic");
assert("st john → serotonergic", classifySupp("st john") === "serotonergic");
assert("ashwagandha → adaptogen", classifySupp("ashwagandha") === "adaptogen");
assert("rhodiola → serotonergic", classifySupp("rhodiola") === "serotonergic");
assert("magnesium → mineral", classifySupp("magnesium") === "mineral");
assert("vitamin d → vitamin", classifySupp("vitamin d") === "vitamin");
assert("melatonin → sleep", classifySupp("melatonin") === "sleep");
assert("fish oil → omega", classifySupp("fish oil") === "omega");
assert("coq10 → antioxidant", classifySupp("coq10") === "antioxidant");
assert("valerian → herbal", classifySupp("valerian") === "herbal");
assert("phenylpiracetam → nootropic", classifySupp("phenylpiracetam") === "nootropic");
assert("unknown supp → other_supp", classifySupp("randomSupplement") === "other_supp");

section("Entity Classifier — classifyEntities aggregate");

assert("polypharmacy false with 3 items", (() => {
  const result = classifyEntities({ meds: ["sertraline", "metformin"], supplements: ["magnesium"] });
  return !result.has_polypharmacy && result.med_count === 2 && result.supp_count === 1;
})());

assert("polypharmacy true with 5 items", (() => {
  const result = classifyEntities({
    meds: ["sertraline", "metformin", "atorvastatin"],
    supplements: ["magnesium", "vitamin d"],
  });
  return result.has_polypharmacy && result.med_count === 3 && result.supp_count === 2;
})());

assert("med_classes deduped", (() => {
  const result = classifyEntities({ meds: ["sertraline", "fluoxetine"], supplements: [] });
  return result.med_classes.length === 1 && result.med_classes[0] === "SSRI";
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Analytics Event Builder (~10 tests)
// ═══════════════════════════════════════════════════════════════
section("Analytics Event — schema");

const baseParams = {
  route: "system:serotonin-risk",
  scores: { risk_flags: [{ domain: "serotonin", level: 2 }] },
  entities: { meds: ["sertraline"], supplements: ["5-htp"], populations: [], symptoms: [], intents: ["interaction_check"], unknowns: [] },
  message: "can I take 5-htp with sertraline",
  safeHistory: [],
  latencyMs: 120,
  validationResult: { safe: true, violations: [] },
  source: "gate",
  llmError: null,
  clientIP: "192.168.1.1",
  misspellingCount: 0,
  brandResolved: false,
  clarifierTriggered: false,
  unknownDosedCount: 0,
  missingFields: ["antidepressant_name"],
};

const event = buildAnalyticsEvent(baseParams);

assert("event has ts", typeof event.ts === "string" && event.ts.includes("T"));
assert("event has route", event.route === "system:serotonin-risk");
assert("event has severity red", event.severity === "red");
assert("event has domains_flagged", event.domains_flagged.includes("serotonin"));
assert("event has intents", event.intents.includes("interaction_check"));
assert("event has med_classes (no names)", event.med_classes.includes("SSRI") && !event.med_classes.includes("sertraline"));
assert("event has supp_classes (no names)", event.supp_classes.includes("serotonergic") && !event.supp_classes.includes("5-htp"));
assert("event has latency_bucket", event.latency_bucket === "0-200ms");
assert("event has policy_version", event.policy_version === "1.0.0");
assert("event has message_length", event.message_length === baseParams.message.length);
assert("event has missing_fields", event.missing_fields.includes("antidepressant_name"));
assert("event has turn_count 1", event.turn_count === 1);
assert("event has has_conversation false", event.has_conversation === false);

section("Analytics Event — NO prohibited fields");

assert("no 'message' key", !("message" in event));
assert("no 'meds' key", !("meds" in event));
assert("no 'supplements' key", !("supplements" in event));
assert("no 'ip' key", !("ip" in event));
assert("no 'raw_message' key", !("raw_message" in event));
assert("no 'entity_names' key", !("entity_names" in event));

section("Analytics Event — schema guard throws");

assert("assertNoForbiddenKeys throws on 'message'", (() => {
  try { assertNoForbiddenKeys({ message: "test" }); return false; }
  catch (e) { return e.message.includes("forbidden key"); }
})());

assert("assertNoForbiddenKeys throws on 'ip'", (() => {
  try { assertNoForbiddenKeys({ ip: "1.2.3.4" }); return false; }
  catch (e) { return e.message.includes("forbidden key"); }
})());

assert("assertNoForbiddenKeys ok on valid keys", (() => {
  try { assertNoForbiddenKeys({ route: "test", severity: "green" }); return true; }
  catch (e) { return false; }
})());

assert("assertNoForbiddenKeys throws on nested forbidden key", (() => {
  try { assertNoForbiddenKeys({ nested: { array: [{ message: "test" }] } }); return false; }
  catch (e) { return e.message.includes("forbidden key") && e.message.includes("message"); }
})());

section("Analytics Event — long string guard (PHI-leak canary)");

assert("throws on >80 char string without leaking value", (() => {
  const longString = "A".repeat(85);
  try {
    assertNoForbiddenKeys({ user_input_proxy: longString });
    return false; // Should not reach here
  } catch (e) {
    const msg = e.message;
    return msg.includes("exceeding maximum allowed length") &&
           msg.includes("80 characters") &&
           msg.includes("user_input_proxy") &&
           !msg.includes(longString); // Value must not be leaked!
  }
})());

assert("nested >80 char string throws safely", (() => {
  const longString = "B".repeat(100);
  try {
    assertNoForbiddenKeys({ deep: [{ field: longString }] });
    return false;
  } catch (e) {
    const msg = e.message;
    return msg.includes("deep[0].field") && msg.includes("length: 100") && !msg.includes(longString);
  }
})());

section("Analytics Event — latency bucketing");

assert("0ms → 0-200ms", bucketLatency(0) === "0-200ms");
assert("199ms → 0-200ms", bucketLatency(199) === "0-200ms");
assert("200ms → 200-500ms", bucketLatency(200) === "200-500ms");
assert("500ms → 500-1s", bucketLatency(500) === "500-1s");
assert("1000ms → 1-3s", bucketLatency(1000) === "1-3s");
assert("5000ms → 3s+", bucketLatency(5000) === "3s+");

section("Analytics Event — hashing");

assert("hashForRetry is 12 chars hex", /^[0-9a-f]{12}$/.test(hashForRetry("192.168.1.1")));
assert("hashForRetry deterministic", hashForRetry("1.2.3.4") === hashForRetry("1.2.3.4"));
assert("hashForRetry different for different IPs", hashForRetry("1.2.3.4") !== hashForRetry("5.6.7.8"));
assert("hashMessage is 12 chars hex", /^[0-9a-f]{12}$/.test(hashMessage("hello")));
assert("hashMessage deterministic", hashMessage("hello") === hashMessage("hello"));

section("Analytics Event — repeat detection");

assert("no repeat on empty history", checkRepeat(hashMessage("hello"), []) === false);
assert("repeat detected in history", (() => {
  const h = hashMessage("hello");
  const history = [{ role: "user", content: "hello" }];
  return checkRepeat(h, history) === true;
})());
assert("no repeat for different message", (() => {
  const h = hashMessage("goodbye");
  const history = [{ role: "user", content: "hello" }];
  return checkRepeat(h, history) === false;
})());

section("Analytics Event — validator violations captured");

assert("violations captured in event", (() => {
  const ev = buildAnalyticsEvent({
    ...baseParams,
    validationResult: { safe: false, violations: [{ rule: "no_diagnosing" }, { rule: "no_prescribing" }] },
  });
  return ev.validator_violations.includes("no_diagnosing") && ev.validator_violations.includes("no_prescribing");
})());

assert("empty violations when safe", (() => {
  const ev = buildAnalyticsEvent(baseParams);
  return ev.validator_violations.length === 0;
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Response Cache (~12 tests)
// ═══════════════════════════════════════════════════════════════
section("Response Cache — isCacheable");

clearCache();

assert("cacheable: simple LLM query", isCacheable(
  "what is magnesium glycinate", emptyEntities, false, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: gate route", !isCacheable(
  "test", emptyEntities, false, { safe: true, violations: [] }, "system:serotonin-risk", emptyScores
));

assert("not cacheable: pregnancy population", !isCacheable(
  "test", { ...emptyEntities, populations: ["pregnancy"] }, false, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: symptoms", !isCacheable(
  "test", { ...emptyEntities, symptoms: ["serotonergic_symptoms"] }, false, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: dose in message", !isCacheable(
  "should I take 500mg daily", emptyEntities, false, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: personal context", !isCacheable(
  "my doctor said to take this", emptyEntities, false, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: multi-turn", !isCacheable(
  "test", emptyEntities, true, { safe: true, violations: [] }, "llm", emptyScores
));

assert("not cacheable: validator violations", !isCacheable(
  "test", emptyEntities, false, { safe: false, violations: [{ rule: "test" }] }, "llm", emptyScores
));

assert("not cacheable: risk score >= 2", !isCacheable(
  "test", emptyEntities, false, { safe: true, violations: [] }, "llm",
  { risk_flags: [{ domain: "serotonin", level: 2 }] }
));

assert("not cacheable: 3+ entities", !isCacheable(
  "test",
  { ...emptyEntities, meds: ["a", "b"], supplements: ["c"] },
  false, { safe: true, violations: [] }, "llm", emptyScores
));

section("Response Cache — get/set/TTL/LRU");

clearCache();

assert("miss on empty cache", getCachedResponse("key1") === null);

setCachedResponse("key1", "reply1");
assert("hit after set", getCachedResponse("key1") === "reply1");

assert("cache stats accurate", (() => {
  const stats = getCacheStats();
  return stats.hits === 1 && stats.misses === 1 && stats.size === 1;
})());

clearCache();
assert("clear resets", getCacheStats().size === 0 && getCacheStats().hits === 0);

section("Response Cache — LRU eviction");

clearCache();
// Fill cache to max (200) to trigger eviction on next insert
for (let i = 0; i < 200; i++) {
  setCachedResponse(`lru-key-${i}`, `reply-${i}`);
}
assert("cache at max 200", getCacheStats().size === 200);

// Add one more — should evict one entry and stay at 200
setCachedResponse("lru-key-200", "reply-200");
assert("cache still 200 after eviction", getCacheStats().size === 200);
assert("new entry exists", getCachedResponse("lru-key-200") === "reply-200");
assert("one old entry was evicted", (() => {
  // At least one of the original 200 keys should be gone
  let evicted = 0;
  for (let i = 0; i < 200; i++) {
    if (getCachedResponse(`lru-key-${i}`) === null) evicted++;
  }
  return evicted >= 1;
})());

section("Response Cache — cache key determinism");

clearCache();
const key1 = buildCacheKey("what is magnesium", "hash1", "model1");
const key2 = buildCacheKey("what is magnesium", "hash1", "model1");
const key3 = buildCacheKey("what is magnesium", "hash2", "model1");
assert("same inputs → same key", key1 === key2);
assert("different prompt hash → different key", key1 !== key3);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Dashboard Helpers (~8 tests)
// ═══════════════════════════════════════════════════════════════
section("Dashboard Helpers");

_resetAnalytics();

assert("empty state: getSnapshot returns zeros", (() => {
  const snap = getSnapshot();
  return snap.total_events === 0 && snap.top_domains.length === 0;
})());

// Push test events
_pushEvent({
  domains_flagged: ["serotonin"], validator_violations: ["no_diagnosing"],
  missing_fields: ["antidepressant_name"], has_unknown_item: true,
  latency_bucket: "0-200ms", source: "gate", llm_error: null,
  is_retry: false, is_repeat: false, med_classes: ["SSRI"], supp_classes: ["serotonergic"],
});
_pushEvent({
  domains_flagged: ["serotonin"], validator_violations: [],
  missing_fields: ["antidepressant_name"], has_unknown_item: false,
  latency_bucket: "200-500ms", source: "llm", llm_error: null,
  is_retry: true, is_repeat: false, med_classes: ["SSRI"], supp_classes: ["mineral"],
});
_pushEvent({
  domains_flagged: ["bleeding"], validator_violations: ["no_prescribing"],
  missing_fields: [], has_unknown_item: false,
  latency_bucket: "0-200ms", source: "llm", llm_error: "timeout",
  is_retry: false, is_repeat: true, med_classes: ["anticoagulant"], supp_classes: [],
});

assert("getTopDomains returns serotonin first", (() => {
  const top = getTopDomains(5);
  return top[0].domain === "serotonin" && top[0].count === 2;
})());

assert("getTopValidatorRules returns rules", (() => {
  const top = getTopValidatorRules();
  return top.length === 2 && top.some(r => r.rule === "no_diagnosing");
})());

assert("getTopMissingFields returns antidepressant_name", (() => {
  const top = getTopMissingFields();
  return top[0].field === "antidepressant_name" && top[0].count === 2;
})());

assert("getUnknownItemRate = 33.3%", (() => {
  const r = getUnknownItemRate();
  return r.rate === 33.3 && r.total === 3;
})());

assert("getLatencyDistribution sums to 3", (() => {
  const dist = getLatencyDistribution();
  return dist["0-200ms"] === 2 && dist["200-500ms"] === 1;
})());

assert("getLLMErrorRate tracks timeout", (() => {
  const r = getLLMErrorRate();
  return r.errors.timeout === 1 && r.total === 2;
})());

assert("getRetryRate = 33.3%", getRetryRate().rate === 33.3);
assert("getRepeatRate = 33.3%", getRepeatRate().rate === 33.3);

assert("getTopMedClasses includes SSRI", (() => {
  const top = getTopMedClasses(5);
  return top[0].class === "SSRI" && top[0].count === 2;
})());

assert("getTopSuppClasses includes serotonergic", (() => {
  const top = getTopSuppClasses(5);
  return top.some(c => c.class === "serotonergic");
})());

section("Dashboard — growth signals");

_resetAnalytics();
// First half: 2 serotonin events
_pushEvent({ domains_flagged: ["serotonin"], validator_violations: [], missing_fields: [], has_unknown_item: false, latency_bucket: "0-200ms", source: "gate", llm_error: null, is_retry: false, is_repeat: false, med_classes: [], supp_classes: [] });
_pushEvent({ domains_flagged: ["serotonin"], validator_violations: [], missing_fields: [], has_unknown_item: false, latency_bucket: "0-200ms", source: "gate", llm_error: null, is_retry: false, is_repeat: false, med_classes: [], supp_classes: [] });
// Second half: 1 serotonin + 2 bleeding (serotonin declining, bleeding rising)
_pushEvent({ domains_flagged: ["serotonin"], validator_violations: [], missing_fields: [], has_unknown_item: false, latency_bucket: "0-200ms", source: "gate", llm_error: null, is_retry: false, is_repeat: false, med_classes: [], supp_classes: [] });
_pushEvent({ domains_flagged: ["bleeding"], validator_violations: [], missing_fields: [], has_unknown_item: false, latency_bucket: "0-200ms", source: "gate", llm_error: null, is_retry: false, is_repeat: false, med_classes: [], supp_classes: [] });

assert("growth signals detect rising", (() => {
  const signals = getGrowthSignals();
  return signals.rising.includes("bleeding");
})());

assert("growth signals detect declining", (() => {
  const signals = getGrowthSignals();
  return signals.declining.includes("serotonin");
})());

assert("getSnapshot returns all sections", (() => {
  const snap = getSnapshot();
  return snap.total_events > 0 && snap.growth_signals && snap.top_domains;
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Integration (~3 tests)
// ═══════════════════════════════════════════════════════════════
section("Integration — full pipeline");

_resetAnalytics();

assert("gate path produces valid analytics event", (() => {
  const ev = buildAnalyticsEvent({
    route: "system:serotonin-risk",
    scores: { risk_flags: [{ domain: "serotonin", level: 2 }] },
    entities: { meds: ["sertraline"], supplements: ["5-htp"], populations: [], symptoms: [], intents: ["interaction_check"], unknowns: [] },
    message: "can I take 5-htp with zoloft",
    safeHistory: [],
    latencyMs: 50,
    validationResult: { safe: true, violations: [] },
    source: "gate",
    llmError: null,
    clientIP: "10.0.0.1",
  });
  // Must have all required fields, no forbidden keys
  return ev.route === "system:serotonin-risk" && ev.source === "gate" &&
    ev.med_classes.includes("SSRI") && ev.supp_classes.includes("serotonergic") &&
    !("message" in ev) && !("meds" in ev);
})());

assert("LLM path event has source=llm", (() => {
  const ev = buildAnalyticsEvent({
    route: "llm",
    scores: { risk_flags: [] },
    entities: { meds: [], supplements: ["magnesium"], populations: [], symptoms: [], intents: ["timing"], unknowns: [] },
    message: "when should I take magnesium",
    safeHistory: [],
    latencyMs: 800,
    validationResult: { safe: true, violations: [] },
    source: "llm",
    llmError: null,
    clientIP: "10.0.0.2",
  });
  return ev.source === "llm" && ev.latency_bucket === "500-1s" && ev.supp_classes.includes("mineral");
})());

assert("degraded path captures llm_error", (() => {
  const ev = buildAnalyticsEvent({
    route: "llm",
    scores: { risk_flags: [] },
    entities: emptyEntities,
    message: "test",
    safeHistory: [],
    latencyMs: 8500,
    validationResult: { safe: true, violations: [] },
    source: "degraded",
    llmError: "timeout",
    clientIP: "10.0.0.3",
  });
  return ev.source === "degraded" && ev.llm_error === "timeout" && ev.latency_bucket === "3s+";
})());

// ═══════════════════════════════════════════════════════════════
// Final tally
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`Analytics tests: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log("All analytics tests passed!");
