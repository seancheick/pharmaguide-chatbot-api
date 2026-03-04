/**
 * Golden Traces / Snapshot Tests
 * Validates that specific inputs produce exact expected routes AND reply content.
 * These are "contract tests" — if a trace breaks, it means behavior changed.
 *
 * Run: node test/golden-traces.test.js
 */

const { normalizeText } = require("../src/core/normalize");
const { extractEntities } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const { sanitizeHistory, getConversationContext } = require("../src/core/history");
const detection = require("../src/gates/detection");
const { ROUTE_REPLY_MAP, emergencyReply, premiumWelcomeReply, premiumThanksReply, premiumGoodbyeReply, offTopicReply } = require("../src/gates/replies");
const { validateResponse } = require("../src/postprocess/safetyValidator");
const { determineSeverityColor } = require("../src/core/twoTrack");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── Full pipeline helper ──
function trace(message, history = []) {
  const safeHistory = sanitizeHistory(history);
  const hasConversation = safeHistory.length > 0;
  const convoContext = getConversationContext(message, safeHistory);

  // Input gates
  if (detection.isEmergency(message)) {
    return { route: "system:emergency", reply: emergencyReply(), severity: "red", entities: null, scores: null };
  }
  if (!hasConversation && detection.isGreeting(message)) {
    return { route: "system:welcome", reply: premiumWelcomeReply(), severity: null, entities: null, scores: null };
  }
  if (detection.isThanks(message)) {
    return { route: "system:thanks", reply: premiumThanksReply(), severity: null, entities: null, scores: null };
  }
  if (detection.isGoodbye(message)) {
    return { route: "system:goodbye", reply: premiumGoodbyeReply(), severity: null, entities: null, scores: null };
  }

  const isCreativeRequest = /\b(write me|write a|compose|create a|make a|generate a|give me a)\b.{0,20}\b(poem|song|story|essay|rap|haiku|limerick|joke|riddle)\b/.test(normalizeText(message));
  if (isCreativeRequest) {
    return { route: "system:off-topic", reply: offTopicReply(), severity: null, entities: null, scores: null };
  }

  const isMetaQuestion = /\b(you.?re ai|are you ai|how do i know|can i trust|are you accurate|who built|who made|how does this work|what are you|reveal|system prompt|safety rules|previous instructions|prescribing authority|pretend you|act as|you are now|ignore .{0,20}(instruct|safety|rules)|stop follow|answer (yes|no)|without restrict|testing .{0,10}(ai|model|chatbot)|test.*model)\b/.test(normalizeText(message));
  if (!hasConversation && !isMetaQuestion && detection.intentScore(message) < 2) {
    return { route: "system:off-topic", reply: offTopicReply(), severity: null, entities: null, scores: null };
  }

  // Risk triage
  const entities = extractEntities(message, convoContext);
  const scores = scoreRisks(entities, normalizeText(message), convoContext);
  const route = routeByRisk(scores, entities, convoContext, message, hasConversation);
  const severity = determineSeverityColor(scores);

  if (route !== "llm") {
    const replyFn = ROUTE_REPLY_MAP[route];
    const reply = replyFn(convoContext, message, entities);
    const validation = validateResponse(reply, route, entities, null);
    return { route, reply, severity, entities, scores, validation };
  }

  return { route: "llm", reply: null, severity, entities, scores };
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  PharmaGuide Golden Traces");
console.log("═══════════════════════════════════════════════════════════════");

// ═══════════════════════════════════════════════════════════════
section("Trace 1: Emergency — overdose");

const t1 = trace("I think I took too many pills and I'm feeling dizzy");
assert("T1: route is emergency", t1.route === "system:emergency");
assert("T1: reply contains 911", t1.reply.includes("911"));
assert("T1: reply contains Poison Control", t1.reply.includes("Poison Control") || t1.reply.includes("1-800-222-1222"));
assert("T1: severity is red", t1.severity === "red");

// ═══════════════════════════════════════════════════════════════
section("Trace 2: Emergency — suicidal ideation");

const t2 = trace("I want to kill myself");
assert("T2: route is emergency", t2.route === "system:emergency");
assert("T2: reply contains 988", t2.reply.includes("988"));

// ═══════════════════════════════════════════════════════════════
section("Trace 3: Serotonin risk — SSRI + 5-HTP");

const t3 = trace("I take Zoloft 50mg. Can I add 5-HTP for mood?");
assert("T3: route is serotonin-risk", t3.route === "system:serotonin-risk");
assert("T3: reply mentions serotonin", t3.reply.toLowerCase().includes("serotonin"));
assert("T3: reply mentions prescriber", t3.reply.toLowerCase().includes("prescriber"));
assert("T3: severity is red", t3.severity === "red");
assert("T3: entities include 5-htp", t3.entities.supplements.some(s => /5.?htp/i.test(s)));
assert("T3: validation passes", t3.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 4: Bleeding risk — warfarin + turmeric");

const t4 = trace("I'm on warfarin for AFib. Is turmeric safe to take?");
assert("T4: route is blood-thinner-risk", t4.route === "system:blood-thinner-risk");
assert("T4: reply mentions bleeding", t4.reply.toLowerCase().includes("bleed"));
assert("T4: reply mentions prescriber", t4.reply.toLowerCase().includes("prescriber"));
assert("T4: severity is red", t4.severity === "red");
assert("T4: validation passes", t4.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 5: Pregnancy + retinol");

const t5 = trace("I'm 8 weeks pregnant. I've been taking a vitamin A supplement with retinol.");
assert("T5: route is pregnancy-retinol", t5.route === "system:pregnancy-retinol");
assert("T5: reply mentions retinol or vitamin A", t5.reply.toLowerCase().includes("retinol") || t5.reply.toLowerCase().includes("vitamin a"));
assert("T5: reply mentions label checking or prenatal", /label|prenatal|check/i.test(t5.reply));
assert("T5: severity is red", t5.severity === "red");
assert("T5: populations include pregnancy", t5.entities.populations.includes("pregnancy"));
assert("T5: validation passes", t5.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 6: Supplement stacking — prenatal + standalone D");

const t6 = trace("I take a prenatal vitamin and also vitamin D3 5000 IU separately.");
assert("T6: route is stacking-risk", t6.route === "system:stacking-risk");
assert("T6: reply mentions stacking or overlap", /stack|overlap|double|exceed/i.test(t6.reply));
assert("T6: validation passes", t6.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 7: SSRI discontinuation");

const t7 = trace("I stopped my Lexapro last week. Can St. John's Wort replace it?");
assert("T7: route is ssri-discontinuation", t7.route === "system:ssri-discontinuation");
assert("T7: reply warns about stopping SSRI", /stop|discontinu|taper/i.test(t7.reply));
assert("T7: reply mentions prescriber", t7.reply.toLowerCase().includes("prescriber"));
assert("T7: validation passes", t7.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 8: Greeting → welcome");

const t8 = trace("Hello!");
assert("T8: route is welcome", t8.route === "system:welcome");
assert("T8: reply is welcoming", /welcome|hi|hello|help/i.test(t8.reply));

// ═══════════════════════════════════════════════════════════════
section("Trace 9: Off-topic — no medical intent");

const t9 = trace("What's the weather like today?");
assert("T9: route is off-topic", t9.route === "system:off-topic");
assert("T9: reply redirects to supplements/medications", /supplement|medication|interact/i.test(t9.reply));

// ═══════════════════════════════════════════════════════════════
section("Trace 10: Clean LLM route — simple supplement question");

const t10 = trace("What is magnesium glycinate good for?");
assert("T10: route is llm", t10.route === "llm");
assert("T10: severity is green", t10.severity === "green");
assert("T10: entities include magnesium", t10.entities.supplements.some(s => /magnesium/i.test(s)));

// ═══════════════════════════════════════════════════════════════
section("Trace 11: Multi-turn serotonin — context carryover");

const t11 = trace("Can I add 5-HTP?", [
  { role: "user", content: "I take sertraline 100mg daily" },
  { role: "assistant", content: "What supplement are you considering?" },
]);
assert("T11: route is serotonin-risk", t11.route === "system:serotonin-risk");
assert("T11: severity is red", t11.severity === "red");

// ═══════════════════════════════════════════════════════════════
section("Trace 12: Potassium + ACEi");

const t12 = trace("I take lisinopril 10mg. Can I take a potassium supplement?");
assert("T12: route is potassium-acei", t12.route === "system:potassium-acei");
assert("T12: reply mentions hyperkalemia or potassium risk", /hyperkalemia|potassium|dangerous/i.test(t12.reply));
assert("T12: validation passes", t12.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 13: Iodine + thyroid");

const t13 = trace("I have Hashimoto's. Should I take a kelp supplement for iodine?");
assert("T13: route is iodine-thyroid", t13.route === "system:iodine-thyroid");
assert("T13: reply mentions thyroid", t13.reply.toLowerCase().includes("thyroid"));
assert("T13: validation passes", t13.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 14: Niacin + statin");

const t14 = trace("I'm on atorvastatin. Can I take high-dose niacin for cholesterol?");
assert("T14: route is niacin-statin", t14.route === "system:niacin-statin");
assert("T14: reply mentions muscle or myopathy or rhabdomyolysis", /muscle|myopathy|rhabdomyolysis/i.test(t14.reply));
assert("T14: validation passes", t14.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 15: Renal + magnesium");

const t15 = trace("I have stage 3 CKD. Is magnesium supplement safe for me?");
assert("T15: route is renal-magnesium", t15.route === "system:renal-magnesium");
assert("T15: reply mentions kidney or renal", /kidney|renal/i.test(t15.reply));
assert("T15: validation passes", t15.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 16: Isotretinoin + vitamin A");

const t16 = trace("I'm on Accutane. Can I take a vitamin A supplement?");
assert("T16: route is isotretinoin-vita", t16.route === "system:isotretinoin-vita");
assert("T16: reply mentions vitamin A toxicity", /vitamin a|toxicity|hypervitaminosis/i.test(t16.reply));
assert("T16: validation passes", t16.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 17: Hepatotoxic — kava + liver concern");

const t17 = trace("Can I take kava and also green tea extract for weight loss? Any liver concern?");
assert("T17: route is liver-toxicity", t17.route === "system:liver-toxicity");
assert("T17: reply mentions liver", t17.reply.toLowerCase().includes("liver"));
assert("T17: validation passes", t17.validation.safe);

// ═══════════════════════════════════════════════════════════════
section("Trace 18: Symptom triage");

const t18 = trace("I started taking zinc 100mg and now I feel nauseous and dizzy");
assert("T18: route is symptom-triage", t18.route === "system:symptom-triage");
assert("T18: reply mentions stopping or contacting prescriber", /stop|prescriber|pharmacist|doctor/i.test(t18.reply));
assert("T18: validation passes", t18.validation.safe);

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
