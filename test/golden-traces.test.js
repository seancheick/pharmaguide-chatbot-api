/**
 * Golden Traces / Snapshot Tests
 * Validates that specific inputs produce exact expected routes AND reply content, through the real
 * handler (api/chat.js) with the model stubbed: the test used to carry its own copy of the request flow,
 * which had drifted (an older off-topic regex, a severity calculation production never ran).
 * These are "contract tests" — if a trace breaks, it means behavior changed.
 *
 * Run: node test/golden-traces.test.js
 */

const { extractEntities } = require("../src/core/entities");
const { sanitizeHistory, getConversationContext } = require("../src/core/history");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── Full pipeline helper ──
process.env.NODE_ENV = "development"; // gate responses then carry _entities / _validation for the assertions
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || "test-key-for-mocking";
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "PG_PROXY_SECRET", "PG_REQUIRE_PROXY_SECRET"]) delete process.env[k];
// One delegating stub, installed before api/chat.js loads (it captures callWithFallback on first require):
// the route traces swap in a stand-in model; the API traces below use the real provider chain.
const providerRouter = require("../src/infra/providerRouter");
const realCallWithFallback = providerRouter.callWithFallback;
let llm = realCallWithFallback;
providerRouter.callWithFallback = (...args) => llm(...args);
const chatHandler = require("../api/chat");
const groqClient = require("../src/infra/groqClient");
const circuitBreaker = require("../src/infra/circuitBreaker");
const responseCache = require("../src/infra/responseCache");
const crypto = require("crypto");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
let traceIp = 1;

// ── Full pipeline helper: the real handler (api/chat.js), never a copy of its logic ──
// The model is a stand-in here: a trace checks what the handler decides (route, deterministic reply,
// validator verdict), not model wording. Entities come from the extractor itself.
async function trace(message, history = []) {
  llm = async () => ({ text: "[model answer]", provider: "stub", modelId: "stub-llm", usage: {}, degraded: false });
  const out = {};
  try {
    await chatHandler({ method: "POST", headers: { "x-forwarded-for": `10.88.${traceIp >> 8}.${traceIp++ & 255}` }, socket: {}, body: { message, history } },
      { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  } finally {
    llm = realCallWithFallback;
    responseCache.clearCache();
  }
  const j = out.json || {};
  const route = j.model === "stub-llm" ? "llm" : j.model;
  const entities = j._entities || extractEntities(message, getConversationContext(message, sanitizeHistory(history)));
  return { route, reply: route === "llm" ? null : j.reply, entities, scores: j._scores || null, validation: j._validation || null };
}

async function runTraceTests() {

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  PharmaGuide Golden Traces");
console.log("═══════════════════════════════════════════════════════════════");

// ═══════════════════════════════════════════════════════════════
section("Trace 1: Emergency — overdose");

const t1 = await trace("I think I took too many pills and I'm feeling dizzy");
assert("T1: route is emergency", t1.route === "system:emergency");
assert("T1: reply contains 911", t1.reply.includes("911"));
assert("T1: reply contains Poison Control", t1.reply.includes("Poison Control") || t1.reply.includes("1-800-222-1222"));

// ═══════════════════════════════════════════════════════════════
section("Trace 2: Emergency — suicidal ideation");

const t2 = await trace("I want to kill myself");
assert("T2: route is emergency", t2.route === "system:emergency");
assert("T2: reply contains 988", t2.reply.includes("988"));

// ═══════════════════════════════════════════════════════════════
section("Trace 3: Serotonin risk — SSRI + 5-HTP");

const t3 = await trace("I take Zoloft 50mg. Can I add 5-HTP for mood?");
assert("T3: route is serotonin-risk", t3.route === "system:serotonin-risk");
assert("T3: reply mentions serotonin", t3.reply.toLowerCase().includes("serotonin"));
assert("T3: reply mentions prescriber", t3.reply.toLowerCase().includes("prescriber"));
assert("T3: entities include 5-htp", t3.entities.supplements.some(s => /5.?htp/i.test(s)));
assert("T3: validation passes", t3.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 4: Bleeding risk — warfarin + turmeric");

const t4 = await trace("I'm on warfarin for AFib. Is turmeric safe to take?");
assert("T4: route is blood-thinner-risk", t4.route === "system:blood-thinner-risk");
assert("T4: reply mentions bleeding", t4.reply.toLowerCase().includes("bleed"));
assert("T4: reply mentions prescriber", t4.reply.toLowerCase().includes("prescriber"));
assert("T4: validation passes", t4.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 5: Pregnancy + retinol");

const t5 = await trace("I'm 8 weeks pregnant. I've been taking a vitamin A supplement with retinol.");
assert("T5: route is pregnancy-retinol", t5.route === "system:pregnancy-retinol");
assert("T5: reply mentions retinol or vitamin A", t5.reply.toLowerCase().includes("retinol") || t5.reply.toLowerCase().includes("vitamin a"));
assert("T5: reply mentions label checking or prenatal", /label|prenatal|check/i.test(t5.reply));
assert("T5: populations include pregnancy", t5.entities.populations.includes("pregnancy"));
assert("T5: validation passes", t5.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 6: Supplement stacking — prenatal + standalone D");

const t6 = await trace("I take a prenatal vitamin and also vitamin D3 5000 IU separately.");
assert("T6: route is stacking-risk", t6.route === "system:stacking-risk");
assert("T6: reply mentions stacking or overlap", /stack|overlap|double|exceed/i.test(t6.reply));
assert("T6: validation passes", t6.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 7: SSRI discontinuation");

const t7 = await trace("I stopped my Lexapro last week. Can St. John's Wort replace it?");
assert("T7: route is ssri-discontinuation", t7.route === "system:ssri-discontinuation");
assert("T7: reply warns about stopping SSRI", /stop|discontinu|taper/i.test(t7.reply));
assert("T7: reply mentions prescriber", t7.reply.toLowerCase().includes("prescriber"));
assert("T7: validation passes", t7.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 8: Greeting → welcome");

const t8 = await trace("Hello!");
assert("T8: route is welcome", t8.route === "system:welcome");
assert("T8: reply is welcoming", /welcome|hi|hello|help/i.test(t8.reply));

// ═══════════════════════════════════════════════════════════════
section("Trace 9: Off-topic — no medical intent");

const t9 = await trace("What's the weather like today?");
assert("T9: route is off-topic", t9.route === "system:off-topic");
assert("T9: reply redirects to supplements/medications", /supplement|medication|interact/i.test(t9.reply));

// ═══════════════════════════════════════════════════════════════
section("Trace 10: Clean LLM route — simple supplement question");

const t10 = await trace("What is magnesium glycinate good for?");
assert("T10: route is llm", t10.route === "llm");
assert("T10: entities include magnesium", t10.entities.supplements.some(s => /magnesium/i.test(s)));

// ═══════════════════════════════════════════════════════════════
section("Trace 11: Multi-turn serotonin — context carryover");

const t11 = await trace("Can I add 5-HTP?", [
  { role: "user", content: "I take sertraline 100mg daily" },
  { role: "assistant", content: "What supplement are you considering?" },
]);
assert("T11: route is serotonin-risk", t11.route === "system:serotonin-risk");

// ═══════════════════════════════════════════════════════════════
section("Trace 12: Potassium + ACEi");

const t12 = await trace("I take lisinopril 10mg. Can I take a potassium supplement?");
assert("T12: route is potassium-acei", t12.route === "system:potassium-acei");
assert("T12: reply mentions hyperkalemia or potassium risk", /hyperkalemia|potassium|dangerous/i.test(t12.reply));
assert("T12: validation passes", t12.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 13: Iodine + thyroid");

const t13 = await trace("I have Hashimoto's. Should I take a kelp supplement for iodine?");
assert("T13: route is iodine-thyroid", t13.route === "system:iodine-thyroid");
assert("T13: reply mentions thyroid", t13.reply.toLowerCase().includes("thyroid"));
assert("T13: validation passes", t13.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 14: Niacin + statin");

const t14 = await trace("I'm on atorvastatin. Can I take high-dose niacin for cholesterol?");
assert("T14: route is niacin-statin", t14.route === "system:niacin-statin");
assert("T14: reply mentions muscle or myopathy or rhabdomyolysis", /muscle|myopathy|rhabdomyolysis/i.test(t14.reply));
assert("T14: validation passes", t14.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 15: Renal + magnesium");

const t15 = await trace("I have stage 3 CKD. Is magnesium supplement safe for me?");
assert("T15: route is renal-magnesium", t15.route === "system:renal-magnesium");
assert("T15: reply mentions kidney or renal", /kidney|renal/i.test(t15.reply));
assert("T15: validation passes", t15.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 16: Isotretinoin + vitamin A");

const t16 = await trace("I'm on Accutane. Can I take a vitamin A supplement?");
assert("T16: route is isotretinoin-vita", t16.route === "system:isotretinoin-vita");
assert("T16: reply mentions vitamin A toxicity", /vitamin a|toxicity|hypervitaminosis/i.test(t16.reply));
assert("T16: validation passes", t16.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 17: Hepatotoxic — kava + liver concern");

const t17 = await trace("Can I take kava and also green tea extract for weight loss? Any liver concern?");
assert("T17: route is liver-toxicity", t17.route === "system:liver-toxicity");
assert("T17: reply mentions liver", t17.reply.toLowerCase().includes("liver"));
assert("T17: validation passes", t17.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 18: Symptom triage");

const t18 = await trace("I started taking zinc 100mg and now I feel nauseous and dizzy");
assert("T18: route is symptom-triage", t18.route === "system:symptom-triage");
assert("T18: reply mentions stopping or contacting prescriber", /stop|prescriber|pharmacist|doctor/i.test(t18.reply));
assert("T18: validation passes", t18.validation.safe);

}

// ═══════════════════════════════════════════════════════════════
// API-Level Pipeline Traces (Mocking chat.js dependencies)
// ═══════════════════════════════════════════════════════════════
// Set dummy API key so groq client initializes for mocking

async function runApiTrace(message, mockSetup, uniqueIp = "127.0.0.1") {
  const req = {
    method: "POST",
    headers: { "x-forwarded-for": uniqueIp },
    body: { message, history: [] }
  };
  
  let statusCode = 200;
  let jsonResponse = null;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => { jsonResponse = data; return res; },
    setHeader: () => res,
    getHeader: () => null,
    end: () => res
  };

  // Setup Mocks
  const groq = groqClient.groq;
  const originalCreate = groq?.chat?.completions?.create;
  circuitBreaker.reset();
  responseCache.clearCache();

  if (mockSetup) mockSetup();

  await chatHandler(req, res);

  // Restore
  if (groq && originalCreate) groq.chat.completions.create = originalCreate;
  circuitBreaker.reset();
  responseCache.clearCache();

  return { status: statusCode, body: jsonResponse };
}

async function runApiTests() {
  section("Trace 19: API Cache Hit");
  
  const t19 = await runApiTrace("what is vitamin d", () => {
    const sysHash = crypto.createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);
    const key = responseCache.buildCacheKey("what is vitamin d", sysHash, "multi-provider");
    // Ensure cache is populated
    responseCache.setCachedResponse(key, "This is a cached response about Vitamin D.");
    // Make sure LLM throws so if cache misses, test fails loudly
    const groq = groqClient.groq;
    if (groq) groq.chat.completions.create = async () => { throw new Error("Should not hit LLM"); };
  }, "10.0.0.19");

  assert("T19: status is 200", t19.status === 200);
  assert("T19: reply matches cache", t19.body?.reply === "This is a cached response about Vitamin D.");
  assert("T19: model returned for cache hit", t19.body?.model === "cache");


  section("Trace 20: API LLM Timeout -> Graceful Degradation");

  const t20 = await runApiTrace("what is ashwagandha", () => {
    // LLM Timeout simulation — mock groq to throw (gemini won't be available without key)
    const groq = groqClient.groq;
    if (groq) {
      groq.chat.completions.create = async () => {
        throw { status: 500, message: "timeout" };
      };
    }
  }, "10.0.0.20");

  // With multi-provider fallback: all providers fail → degraded response (200) or error (500)
  assert("T20: status is 200 degraded or 500 error", t20.status === 200 || t20.status === 500);
  if (t20.status === 200) {
    assert("T20: degraded reply present", t20.body?.reply?.length > 0);
  } else {
    assert("T20: error message present", t20.body?.error?.length > 0);
  }


  section("Trace 21: API Circuit Breaker Open -> Blocked LLM");

  const t21 = await runApiTrace("what is magnesium", () => {
    // Force groq circuit open (gemini won't be available without key → all blocked → degraded)
    for (let i = 0; i < circuitBreaker.FAILURE_THRESHOLD; i++) circuitBreaker.recordFailure();
    const groq = groqClient.groq;
    if (groq) groq.chat.completions.create = async () => { throw new Error("Should not hit LLM - Circuit Open"); };
  }, "10.0.0.21");

  assert("T21: status is 200", t21.status === 200);
  assert("T21: model is system:degraded", t21.body?.model === "system:degraded");


  section("Trace 22: API Validator Violation -> Safe Fallback (LLM generated bad response)");

  const t22 = await runApiTrace("what is magnesium", () => {
    // Mock groq to return a prescribing statement (gemini not available → falls to groq)
    const groq = groqClient.groq;
    if (groq) {
      groq.chat.completions.create = async () => {
        return {
          choices: [{
            message: {
              content: "I recommend you take 50 mg daily for 2 weeks."
            }
          }],
          usage: {},
        };
      };
    }
  }, "10.0.0.22");

  assert("T22: status is 200", t22.status === 200);
  assert("T22: reply fell back to safe fallback or contains safe disclaimer", t22.body?.reply?.includes("I want to make sure I give you accurate"));

  // ═══════════════════════════════════════════════════════════════
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  if (fail > 0) {
    console.log(`  ${fail} FAILED out of ${total}`);
    for (const f of failures) console.log(`    • ${f}`);
    process.exit(1);
  } else {
    console.log(`  ALL TESTS PASSED: ${pass}/${total}`);
  }
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

runTraceTests().then(runApiTests).catch(e => {
  console.error(e);
  process.exit(1);
});
