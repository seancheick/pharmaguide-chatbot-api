/**
 * Synthetic load + chaos testing harness.
 * Proves circuit breaker, cache, and validator behavior under stress.
 * No real LLM calls — uses deterministic fake responses.
 *
 * Run: node test/load.test.js
 */

const { reset, allowRequest, recordSuccess, recordFailure, getState, getStats, FAILURE_THRESHOLD } = require("../src/infra/circuitBreaker");
const { buildCacheKey, isCacheable, getCachedResponse, setCachedResponse, getCacheStats, clearCache } = require("../src/infra/responseCache");
const { validateResponse } = require("../src/postprocess/safetyValidator");
const { getDegradedResponse } = require("../src/infra/gracefulDegradation");
const { normalizeText } = require("../src/core/normalize");
const { extractEntities } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const { ROUTE_REPLY_MAP } = require("../src/gates/replies");
const { tryDSLGate } = require("../src/gates/gateEngine");
const crypto = require("crypto");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

function section(title) { console.log(`\n── ${title} ──`); }

const emptyEntities = { meds: [], supplements: [], populations: [], symptoms: [], intents: [], unknowns: [] };

// ── Fake LLM responses (realistic length) ──
const FAKE_LLM_RESPONSES = [
  "Magnesium glycinate is one of the most bioavailable forms of magnesium. A typical dose is 200-400mg elemental magnesium daily. Taking it in the evening may support sleep quality. It's generally well-tolerated, though some people experience mild GI effects at higher doses.",
  "Vitamin D3 is best taken with a meal containing fat for optimal absorption. Most adults can safely take 1,000-2,000 IU daily without monitoring. Higher doses (5,000+ IU) should be guided by blood levels. It pairs well with vitamin K2 for bone health support.",
  "Creatine monohydrate is one of the most studied supplements. A typical maintenance dose is 3-5g daily. It supports muscle performance and may have cognitive benefits. Stay well-hydrated when supplementing. It's generally safe for healthy adults.",
  "Zinc and iron compete for absorption when taken together. Space them at least 2 hours apart. Take iron on an empty stomach if tolerated, or with vitamin C to enhance absorption. Take zinc with food to reduce nausea.",
  "Fish oil at 1-2g EPA+DHA daily supports cardiovascular health. Look for third-party tested brands to avoid heavy metal contamination. Take with meals to reduce fishy burps. Store in the fridge to prevent oxidation.",
];

// ── Fake error generator ──
let errorInjectionRate = 0;
let requestCount = 0;

function fakeLLMCall() {
  requestCount++;
  if (errorInjectionRate > 0 && Math.random() < errorInjectionRate) {
    throw new Error("LLM_TIMEOUT");
  }
  return FAKE_LLM_RESPONSES[requestCount % FAKE_LLM_RESPONSES.length];
}

// ── Test messages (mix of gate + LLM path) ──
const GATE_MESSAGES = [
  "Can I take 5-htp with sertraline?",
  "I'm on warfarin, is turmeric safe?",
  "Can I take ibuprofen with my blood thinner?",
  "Is iodine safe with levothyroxine?",
  "I take lithium, can I use naproxen?",
  "Is niacin safe with my statin?",
];

const LLM_MESSAGES = [
  "What is magnesium glycinate good for?",
  "When should I take vitamin D?",
  "Is creatine safe?",
  "How much fish oil should I take?",
  "What's the difference between zinc forms?",
];

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Circuit breaker under load (~8 tests)
// ═══════════════════════════════════════════════════════════════
section("Circuit Breaker — sustained failure");

reset();
clearCache();

// Simulate 200 requests with 100% failure rate
let openedAt = -1;
let closedAt = -1;
const stateLog = [];

for (let i = 0; i < 200; i++) {
  const circuit = allowRequest();
  stateLog.push({ i, state: getState(), allowed: circuit.allowed });

  if (circuit.allowed) {
    recordFailure();
    if (openedAt === -1 && getState() === "OPEN") openedAt = i;
  }
}

assert("circuit opens after threshold failures", openedAt === FAILURE_THRESHOLD - 1);
assert("most requests blocked after opening", stateLog.filter(s => !s.allowed).length > 150);

section("Circuit Breaker — recovery after failures");

reset();

// 4 failures (just below threshold), then success
for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) recordFailure();
assert("still CLOSED before threshold", getState() === "CLOSED");
recordSuccess();
assert("success resets to clean state", getStats().failure_count === 0);

// Now 5 failures to open, then reset (simulating cooldown)
for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
assert("opens at threshold", getState() === "OPEN");
reset(); // simulate cooldown expiry
assert("resets to CLOSED", getState() === "CLOSED");

section("Circuit Breaker — mixed success/failure pattern");

reset();
const pattern = [true, true, false, true, true, false, true, false, false, false]; // t=success, f=failure

for (const success of pattern) {
  if (success) recordSuccess();
  else recordFailure();
}
// Last 3 are failures but total consecutive failures should be 3 (success resets count)
assert("mixed pattern: still CLOSED (3 consec failures < threshold)", getState() === "CLOSED");

// Now add 2 more failures to reach threshold
recordFailure();
recordFailure();
assert("opens after reaching threshold from mixed pattern", getState() === "OPEN");

section("Circuit Breaker — degraded replies pass validator");

reset();
const degradedResponses = ["llm_timeout", "llm_error", "service_unavailable"];
for (const mode of degradedResponses) {
  const reply = getDegradedResponse(mode);
  const validation = validateResponse(reply, "system:degraded", emptyEntities, null);
  assert(`degraded "${mode}" passes validator`, validation.safe);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Cache under load (~8 tests)
// ═══════════════════════════════════════════════════════════════
section("Cache — repeated generic queries");

clearCache();

const systemPromptHash = crypto.createHash("sha256").update("test-prompt").digest("hex").slice(0, 12);
const modelId = "llama-3.3-70b-versatile";

// First pass: all misses
for (let i = 0; i < LLM_MESSAGES.length; i++) {
  const key = buildCacheKey(LLM_MESSAGES[i], systemPromptHash, modelId);
  const cached = getCachedResponse(key);
  assert(`first pass msg ${i}: cache miss`, cached === null);
  // Store response
  if (isCacheable(LLM_MESSAGES[i], emptyEntities, false, { safe: true, violations: [] }, "llm", { risk_flags: [] })) {
    setCachedResponse(key, FAKE_LLM_RESPONSES[i]);
  }
}

// Second pass: all hits
for (let i = 0; i < LLM_MESSAGES.length; i++) {
  const key = buildCacheKey(LLM_MESSAGES[i], systemPromptHash, modelId);
  const cached = getCachedResponse(key);
  assert(`second pass msg ${i}: cache hit`, cached !== null);
}

const stats = getCacheStats();
assert("cache hit rate after 2 passes = 50%", stats.hit_rate === 50);
assert("cache size = 5", stats.size === 5);

section("Cache — exclusion rules under load");

clearCache();

// Personalized queries should never cache
const personalizedMessages = [
  { msg: "I'm pregnant, is magnesium safe?", entities: { ...emptyEntities, populations: ["pregnancy"] } },
  { msg: "My doctor said to take 500mg daily", entities: emptyEntities },
  { msg: "I take sertraline, fluoxetine, and magnesium", entities: { ...emptyEntities, meds: ["sertraline", "fluoxetine"], supplements: ["magnesium"] } },
];

for (const { msg, entities } of personalizedMessages) {
  const cacheable = isCacheable(msg, entities, false, { safe: true, violations: [] }, "llm", { risk_flags: [] });
  assert(`"${msg.slice(0, 30)}..." not cacheable`, !cacheable);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Gate pipeline under load (~6 tests)
// ═══════════════════════════════════════════════════════════════
section("Gate pipeline — 200 gate requests");

let gatePassCount = 0;
let gateFailCount = 0;

for (let i = 0; i < 200; i++) {
  const msg = GATE_MESSAGES[i % GATE_MESSAGES.length];
  const normalizedMsg = normalizeText(msg);
  const entities = extractEntities(msg, msg);
  const scores = scoreRisks(entities, normalizedMsg, msg);
  const route = routeByRisk(scores, entities, msg, msg, false);

  if (route !== "llm") {
    // Try DSL gate first
    const dslResult = tryDSLGate(route);
    let reply;
    if (dslResult.matched) {
      reply = dslResult.reply;
    } else {
      const replyFn = ROUTE_REPLY_MAP[route];
      reply = replyFn(msg, msg, entities);
    }
    const validation = validateResponse(reply, route, entities, null);
    if (validation.safe) gatePassCount++;
    else gateFailCount++;
  }
}

assert("200 gate requests: all pass validator", gateFailCount === 0);
assert("200 gate requests: all produced replies", gatePassCount === 200);

section("Gate pipeline — DSL gates produce valid replies");

const dslRoutes = [
  "system:potassium-acei",
  "system:iodine-thyroid",
  "system:niacin-statin",
  "system:nsaid-anticoagulant",
  "system:triple-whammy",
  "system:lithium-nsaid",
];

for (const route of dslRoutes) {
  const result = tryDSLGate(route);
  assert(`DSL "${route}" matches`, result.matched);
  const validation = validateResponse(result.reply, route, emptyEntities, null);
  assert(`DSL "${route}" passes validator`, validation.safe);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Combined stress scenario (~5 tests)
// ═══════════════════════════════════════════════════════════════
section("Combined stress — mixed gate + LLM + errors");

reset();
clearCache();

let gateCount = 0;
let cacheHits = 0;
let llmCount = 0;
let degradedCount = 0;

// 200 mixed requests
for (let i = 0; i < 200; i++) {
  const isGateReq = i % 3 === 0;
  const msg = isGateReq
    ? GATE_MESSAGES[i % GATE_MESSAGES.length]
    : LLM_MESSAGES[i % LLM_MESSAGES.length];

  const normalizedMsg = normalizeText(msg);
  const entities = extractEntities(msg, msg);
  const scores = scoreRisks(entities, normalizedMsg, msg);
  const route = routeByRisk(scores, entities, msg, msg, false);

  if (route !== "llm") {
    gateCount++;
  } else {
    // Check circuit
    const circuit = allowRequest();
    if (!circuit.allowed) {
      degradedCount++;
      continue;
    }

    // Check cache
    const key = buildCacheKey(msg, systemPromptHash, modelId);
    const cached = getCachedResponse(key);
    if (cached) {
      cacheHits++;
      continue;
    }

    // Simulate LLM call with 10% error rate
    try {
      if (Math.random() < 0.1) {
        recordFailure();
        throw new Error("LLM_TIMEOUT");
      }
      recordSuccess();
      const reply = FAKE_LLM_RESPONSES[i % FAKE_LLM_RESPONSES.length];
      if (isCacheable(msg, entities, false, { safe: true, violations: [] }, "llm", { risk_flags: [] })) {
        setCachedResponse(key, reply);
      }
      llmCount++;
    } catch (e) {
      degradedCount++;
    }
  }
}

assert("mixed load: gate requests processed", gateCount > 0);
assert("mixed load: some cache hits", cacheHits > 0);
assert("mixed load: some LLM calls succeeded", llmCount > 0);
assert("mixed load: total adds up", gateCount + cacheHits + llmCount + degradedCount === 200);

section("Combined stress — high error rate triggers circuit");

reset();
clearCache();

let circuitOpened = false;
for (let i = 0; i < 50; i++) {
  const circuit = allowRequest();
  if (!circuit.allowed) {
    circuitOpened = true;
    break;
  }
  recordFailure(); // 100% failure
}

assert("circuit opens under sustained failure", circuitOpened);

// ═══════════════════════════════════════════════════════════════
// Final tally
// ═══════════════════════════════════════════════════════════════
reset();
clearCache();

console.log(`\n${"═".repeat(50)}`);
console.log(`Load tests: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log("All load tests passed!");
