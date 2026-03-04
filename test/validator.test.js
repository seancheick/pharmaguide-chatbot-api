/**
 * Post-response safety validator tests.
 * Run: node test/validator.test.js
 */

const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");

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
const pregEntities = { ...emptyEntities, populations: ["pregnancy"] };

// ═══════════════════════════════════════════════════════════════
section("Rule: No diagnosing language");

assert("safe: general info", validateResponse(
  "Magnesium glycinate is well-absorbed. Take 200-400mg daily.",
  "llm", emptyEntities, null
).safe);

assert("safe: 'could be' phrasing", validateResponse(
  "This could be related to your supplement — talk to your prescriber.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: 'you have diabetes'", !validateResponse(
  "You have diabetes based on what you described.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: 'you are diagnosed with'", !validateResponse(
  "You are diagnosed with hypothyroidism, so you need to adjust your dose.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: 'this confirms you have'", !validateResponse(
  "This confirms you have a deficiency. Take 5000 IU daily.",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: No stop-medication instructions");

assert("safe: stop supplement (serotonin-urgent)", validateResponse(
  "Stop the serotonergic supplement immediately.",
  "system:serotonin-urgent", emptyEntities, null
).safe);

assert("safe: 'do not start or stop' phrasing", validateResponse(
  "Do not start or stop any supplements without telling your prescriber.",
  "system:blood-thinner-risk", emptyEntities, null
).safe);

assert("unsafe: stop prescribed medication", !validateResponse(
  "Stop taking your prescribed antidepressant immediately.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: discontinue your medication", !validateResponse(
  "Discontinue your prescribed statin and try red yeast rice instead.",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: No pregnancy/child dosing");

assert("safe: pregnancy + upper limit info", validateResponse(
  "The upper limit is 3,000 mcg/day of preformed retinol.",
  "system:pregnancy-retinol", pregEntities, null
).safe);

assert("safe: no dosing in pregnancy context", validateResponse(
  "Limited safety data for melatonin during pregnancy. Ask your OB.",
  "system:pregnancy-limited", pregEntities, null
).safe);

assert("unsafe: specific dosing in pregnancy", !validateResponse(
  "You're pregnant — I recommend you take 400mg of magnesium daily.",
  "llm", pregEntities, null
).safe);

assert("unsafe: child dosing", !validateResponse(
  "For your child, try a dose of 50mg of zinc daily.",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: No prescribing language");

assert("safe: 'suggest asking your provider'", validateResponse(
  "Consider asking your provider about magnesium glycinate.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: 'I am prescribing'", !validateResponse(
  "I am prescribing you 200mg of magnesium daily for 30 days.",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: Response length");

assert("safe: normal length", validateResponse(
  "Take with food. 200-400mg daily is typical.",
  "llm", emptyEntities, null
).safe);

assert("unsafe: extremely long", !validateResponse(
  "A".repeat(5001),
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: No empty safety response");

assert("unsafe: empty safety response", !validateResponse(
  "",
  "system:serotonin-risk", emptyEntities, null
).safe);

assert("safe: empty LLM route (not a safety route)", validateResponse(
  "",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Rule: Multiple questions (egregious)");

assert("safe: single question", validateResponse(
  "This looks good. Which medication are you taking?",
  "llm", emptyEntities, null
).safe);

assert("safe: two questions (acceptable)", validateResponse(
  "That's helpful. Which medication?\n\nAnd what dose?",
  "llm", emptyEntities, null
).safe);

assert("unsafe: four+ real questions", !validateResponse(
  "Which medication are you taking? What dose? How long have you been on it? Do you have side effects?",
  "llm", emptyEntities, null
).safe);

// ═══════════════════════════════════════════════════════════════
section("Fallback response");

const result = validateResponse("You have diabetes.", "llm", emptyEntities, null);
assert("fallback provided when unsafe", result.fallback === SAFE_FALLBACK_REPLY);

const safeResult = validateResponse("Magnesium is fine.", "llm", emptyEntities, null);
assert("no fallback when safe", safeResult.fallback === null);

// ═══════════════════════════════════════════════════════════════
section("Gate replies pass validation");

const replies = require("../src/gates/replies");
const gateReplies = {
  emergency: replies.emergencyReply(),
  welcome: replies.premiumWelcomeReply(),
  thanks: replies.premiumThanksReply(),
  goodbye: replies.premiumGoodbyeReply(),
  offTopic: replies.offTopicReply(),
  serotonergicUrgent: replies.serotonergicUrgentReply(),
  ssriDiscontinuation: replies.ssriDiscontinuationReply(),
  symptomTriage: replies.symptomTriageReply(),
  pregnancyRetinol: replies.pregnancyRetinolReply(),
  isotretinoinVitA: replies.isotretinoinVitAReply(),
  supplementStacking: replies.supplementStackingReply(),
  potassiumACEi: replies.potassiumACEiReply(),
  iodineThyroid: replies.iodineThyroidReply(),
  niacinStatin: replies.niacinStatinReply(),
  renalMagnesium: replies.renalMagnesiumReply(),
};

for (const [name, reply] of Object.entries(gateReplies)) {
  const route = name === "serotonergicUrgent" ? "system:serotonin-urgent" : "system:" + name;
  const v = validateResponse(reply, route, emptyEntities, null);
  assert(`gate reply ${name} passes validator`, v.safe);
  if (!v.safe) console.log(`    violations:`, v.violations);
}

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
