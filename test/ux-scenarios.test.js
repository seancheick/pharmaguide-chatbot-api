/**
 * UX Scenario Tests — Traces 20 developer-submitted prompts + hard edge cases
 * through the gate architecture to verify correct routing.
 *
 * Run: node test/ux-scenarios.test.js
 */

const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(__dirname + "/../api/chat.js", "utf-8");

function extractFunction(name) {
  const funcStart = src.indexOf(`function ${name}(`);
  if (funcStart === -1) throw new Error(`Function ${name} not found`);
  let braceCount = 0, started = false, i = funcStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") { braceCount++; started = true; }
    if (src[i] === "}") { braceCount--; }
    if (started && braceCount === 0) break;
  }
  return src.slice(funcStart, i + 1);
}

const funcNames = [
  "normalizeText", "getConversationContext", "isEmergency", "isGreeting",
  "isThanks", "isGoodbye", "intentScore", "mentionsHighRiskSerotonergic",
  "mentionsAntidepressant", "isComplexStack", "mentionsSerotonergicSymptoms",
  "mentionsAnticoagulantRiskSupplement", "mentionsBloodThinner",
  "mentionsNonEmergencySymptom", "mentionsSupplementOrDose",
  "mentionsHighDoseVitaminD", "mentionsHeartSymptoms", "mentionsDeficiency",
  "mentionsPregnancyContext", "mentionsRetinolRisk",
  "mentionsPregnancyLimitedEvidence", "detectsIsotretinoinVitA",
  "mentionsPrenatalOrMulti", "mentionsStandaloneFatSoluble",
  "detectsLiverToxicityStack", "detectsCharcoalMed",
  "detectsGrapefruitInteraction", "detectsSSRIDiscontinuation",
  "detectsPotassiumACEi", "detectsIodineThyroid", "detectsNiacinStatin",
  "needsMedicationClarifier", "mentionsMineralSpacingTrigger",
];

let evalBlock = "";
for (const fn of funcNames) evalBlock += extractFunction(fn) + "\n\n";
const ctx = vm.createContext({});
vm.runInContext(evalBlock, ctx);
const f = {};
for (const fn of funcNames) f[fn] = vm.runInContext(fn, ctx);

// ─── Simulate handler gate routing ───
function routeMessage(message, history = []) {
  const safeHistory = history.slice(-10);
  const hasConversation = safeHistory.length > 0;
  const convoContext = f.getConversationContext(message, safeHistory);

  if (f.isEmergency(message)) return "system:emergency";
  if (!hasConversation && f.isGreeting(message)) return "system:welcome";
  if (f.isThanks(message)) return "system:thanks";
  if (f.isGoodbye(message)) return "system:goodbye";
  const isMetaQuestion = /\b(you.?re ai|are you ai|how do i know|can i trust|are you accurate|who built|who made|how does this work|what are you)\b/.test(f.normalizeText(message));
  if (!hasConversation && !isMetaQuestion && f.intentScore(message) < 2) return "system:off-topic";

  // SSRI discontinuation checked BEFORE serotonergic risk
  if (f.detectsSSRIDiscontinuation(convoContext)) return "system:ssri-discontinuation";

  if (f.mentionsHighRiskSerotonergic(convoContext) && f.mentionsAntidepressant(convoContext)) {
    if (f.mentionsSerotonergicSymptoms(message)) return "system:serotonin-urgent";
    if (f.mentionsHighRiskSerotonergic(message)) return "system:serotonin-risk";
  }

  if (f.mentionsAnticoagulantRiskSupplement(message) && f.mentionsBloodThinner(convoContext)) return "system:blood-thinner-risk";

  if (f.mentionsNonEmergencySymptom(message) && f.mentionsSupplementOrDose(convoContext)) {
    if (f.mentionsHighDoseVitaminD(convoContext) && f.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";
    return "system:symptom-triage";
  }
  if (f.mentionsHighDoseVitaminD(message) && f.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";

  if (f.mentionsPregnancyContext(convoContext) && f.mentionsRetinolRisk(message)) return "system:pregnancy-retinol";
  if (f.mentionsPregnancyContext(convoContext) && f.mentionsPregnancyLimitedEvidence(message)) return "system:pregnancy-limited";
  if (f.detectsIsotretinoinVitA(convoContext)) return "system:isotretinoin-vita";
  if (f.mentionsPrenatalOrMulti(convoContext) && f.mentionsStandaloneFatSoluble(message)) return "system:stacking-risk";
  if (f.detectsLiverToxicityStack(convoContext)) return "system:liver-toxicity";
  if (f.detectsCharcoalMed(convoContext)) return "system:charcoal-med";
  if (f.detectsGrapefruitInteraction(convoContext)) return "system:grapefruit-cyp3a4";
  if (f.detectsPotassiumACEi(convoContext)) return "system:potassium-acei";
  if (f.detectsIodineThyroid(convoContext)) return "system:iodine-thyroid";
  if (f.detectsNiacinStatin(convoContext)) return "system:niacin-statin";
  if (!hasConversation && f.needsMedicationClarifier(message)) return "system:clarifier";

  return "llm";
}

let pass = 0, fail = 0, total = 0;
const issues = [];

function expectRoute(label, message, expectedRoute, history) {
  total++;
  const actual = routeMessage(message, history);
  if (actual === expectedRoute) {
    pass++;
    console.log(`  PASS  ${label} → ${actual}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} → got '${actual}', expected '${expectedRoute}'`);
    issues.push({ label, actual, expected: expectedRoute, message });
  }
}

// ═══════════════════════════════════════════════════════════════
// 20 UX SCENARIOS
// ═══════════════════════════════════════════════════════════════

console.log("\n=== UX Scenario 1: Casual + Vague User ===");
expectRoute("#1 vague meds",
  "I take some antidepressant and ADHD med and a bunch of natural stuff from Amazon. Am I good?",
  "system:clarifier"); // Should ask for medication names — currently might not match

console.log("\n=== UX Scenario 2: Mild Panic Tone ===");
expectRoute("#2 heart feels weird after supplements",
  "My heart feels weird after I took my supplements. Should I go to the ER?",
  "system:symptom-triage");

console.log("\n=== UX Scenario 3: Doesn't Know Drug Name ===");
expectRoute("#3 yellow pill starts with S",
  "I take that yellow pill for anxiety… starts with S? And magnesium. Is that bad?",
  "system:clarifier"); // Should clarify which medication

console.log("\n=== UX Scenario 4: Brand-Only User ===");
expectRoute("#4 unknown brand + birth control",
  "Is Happy Hormone Booster Pro Max Ultra safe with birth control?",
  "system:clarifier"); // Should ask for ingredient list

console.log("\n=== UX Scenario 5: TikTok Influence (berberine + metformin) ===");
expectRoute("#5 berberine + metformin",
  "TikTok says berberine is natural Ozempic. I take metformin. Should I switch?",
  "llm"); // LLM with clinical knowledge (berberine + metformin in system prompt)

console.log("\n=== UX Scenario 6: Chatty User ===");
expectRoute("#6 chatty unstructured",
  "Okay so like I take this, this, and this but not every day lol and sometimes I forget but mostly in the morning except when I work out.",
  "llm"); // No specific vague med refs — LLM asks for structure

console.log("\n=== UX Scenario 7: Oversharing User ===");
expectRoute("#7 oversharing",
  "I'm depressed, stressed, gaining weight, can't sleep, hormones are crazy, I take everything honestly.",
  "llm"); // LLM should break into categories — too complex for a gate

console.log("\n=== UX Scenario 8: Caregiver for Elderly ===");
expectRoute("#8 caregiver elderly",
  "My mom is 68 and on a lot of meds. I don't know all of them. Can I just send you a picture?",
  "system:clarifier"); // Should clarify what meds

console.log("\n=== UX Scenario 9: Dose Confusion (10k vitamin D) ===");
expectRoute("#9 vitamin D 10000 daily",
  "I take 10,000 vitamin D daily. That's fine right? I saw someone take 50,000.",
  "llm"); // Not high-dose trigger (that's 50k), LLM handles with system prompt knowledge

console.log("\n=== UX Scenario 10: Alcohol + Xanax ===");
expectRoute("#10 Xanax + wine",
  "I take Xanax sometimes. Can I drink wine tonight?",
  "llm"); // LLM with clinical knowledge (alcohol + benzos = 🔴)

console.log("\n=== UX Scenario 11: Microdose Psilocybin + SSRI ===");
expectRoute("#11 psilocybin + SSRI",
  "I microdose psilocybin and take SSRI. Safe?",
  "system:serotonin-risk"); // Psilocybin is serotonergic — should trigger gate 5

console.log("\n=== UX Scenario 12: Biohacker Overload ===");
expectRoute("#12 longevity stack",
  "I take NAD+, NMN, resveratrol, quercetin, metformin, rapamycin, and creatine. Rate my stack.",
  "llm"); // LLM handles — no specific dangerous combo for a gate

console.log("\n=== UX Scenario 13: 'Am I Dying?' User ===");
expectRoute("#13 magnesium + feel funny",
  "I took magnesium and now I feel funny. Is this dangerous?",
  "system:symptom-triage");

console.log("\n=== UX Scenario 14: Parent Asking About Child ===");
expectRoute("#14 child ADHD",
  "My 7-year-old won't focus. Can I give him what I take for ADHD?",
  "llm"); // LLM with system prompt (Children → no dosing, advise pediatrician)

console.log("\n=== UX Scenario 15: Stopping Antidepressant ===");
expectRoute("#15 stop antidepressant for ashwagandha",
  "I don't want to take my antidepressant anymore. Can I just switch to ashwagandha?",
  "system:ssri-discontinuation"); // Intent to stop + switch → should fire gate 17

console.log("\n=== UX Scenario 16: Early Pregnancy Uncertainty ===");
expectRoute("#16 might be pregnant + melatonin",
  "I might be pregnant. Is it okay that I took melatonin last night?",
  "system:pregnancy-limited");

console.log("\n=== UX Scenario 17: User Tests You ===");
expectRoute("#17 trust question",
  "You're AI. How do I know you're right?",
  "llm"); // Should NOT be off-topic — it's a meta question about the tool

console.log("\n=== UX Scenario 18: Partial Stack Entry ===");
expectRoute("#18 Zoloft + fish oil + unknown energy",
  "I take Zoloft, fish oil, and something for energy. That's it.",
  "system:clarifier"); // "something for energy" is vague — needs clarification

console.log("\n=== UX Scenario 19: Timing Optimization ===");
expectRoute("#19 timing question",
  "When should I take all this stuff? Morning? Night? With food?",
  "llm"); // Needs history context — LLM handles

console.log("\n=== UX Scenario 20: Anxiety Spiral ===");
expectRoute("#20 anxiety spiral",
  "I googled and now I think everything I take is toxic.",
  "llm"); // Should NOT be off-topic — it's about their supplements

// ═══════════════════════════════════════════════════════════════
// HARD UX EDGE CASES
// ═══════════════════════════════════════════════════════════════

console.log("\n=== Hard UX Edge Cases ===");

expectRoute("ALL CAPS",
  "CAN I TAKE MAGNESIUM WITH ZOLOFT",
  "llm"); // normalizeText lowercases — should be on-topic, route to LLM (no serotonergic suppl)

expectRoute("slang: blood thinner thingy",
  "I take a blood thinner thingy and want turmeric",
  "system:blood-thinner-risk");

expectRoute("misspelled: sertaline (missing r)",
  "I take sertaline and 5-HTP, is that ok?",
  "system:serotonin-risk"); // Needs misspelling tolerance

expectRoute("misspelled: xanex",
  "can I drink alcohol with xanex",
  "llm"); // Falls to LLM — acceptable since no gate for benzos+alcohol

expectRoute("mg vs mcg confusion",
  "I take 5000mg of vitamin D",
  "llm"); // LLM should catch the unit error

expectRoute("emoji only message",
  "😵‍💫 after supplements",
  "llm"); // normalizeText strips emoji → "after supplements" → very short, has 'supplement'

expectRoute("angry tone",
  "Why didn't my doctor tell me this about magnesium and thyroid meds?",
  "llm"); // On-topic question with specific meds, LLM handles

expectRoute("illegal substances: cannabis + meds",
  "I smoke weed daily and take sertraline. Any interaction?",
  "llm"); // LLM handles — cannabis isn't in serotonergic gate

expectRoute("exact dosage request",
  "How many mg of ashwagandha should I take exactly?",
  "llm"); // LLM with system prompt handles (typical ranges + "start low")

expectRoute("fast answer request",
  "Quick: magnesium glycinate safe with lisinopril? Yes or no.",
  "llm"); // On-topic, LLM handles

expectRoute("repeated question style 1",
  "is ashwagandha safe",
  "llm");

expectRoute("repeated question style 2",
  "what about ashwagandha safety",
  "llm");

expectRoute("repeated question style 3",
  "ashwagandha — safe or not?",
  "llm");

// Context-aware UX scenarios
console.log("\n=== Context-Aware UX Follow-ups ===");

expectRoute("#6 chatty → then follow-up with names",
  "ok so its Zoloft, fish oil, and rhodiola",
  "system:serotonin-risk",
  [
    { role: "user", content: "Okay so like I take this, this, and this but not every day" },
    { role: "assistant", content: "I need the specific names of what you're taking." }
  ]); // Now provides Zoloft + rhodiola → serotonergic risk fires

expectRoute("#8 caregiver follow-up with med list",
  "she takes metformin, lisinopril, aspirin, and wants to add ginkgo",
  "system:blood-thinner-risk",
  [
    { role: "user", content: "My mom is 68 and on a lot of meds" },
    { role: "assistant", content: "Which medications is she on?" }
  ]);

expectRoute("#15 stop antidepressant follow-up",
  "I stopped it last week. Can I use 5-HTP now?",
  "system:ssri-discontinuation",
  [
    { role: "user", content: "I don't want to take my antidepressant anymore" },
    { role: "assistant", content: "Which antidepressant and how long have you been on it?" }
  ]);

// ── SUMMARY ──
console.log("\n" + "═".repeat(55));
console.log(`Results: ${pass}/${total} passed, ${fail} failed`);
console.log("═".repeat(55));

if (issues.length > 0) {
  console.log("\n📋 GAPS TO FIX:");
  for (const { label, actual, expected, message } of issues) {
    console.log(`\n  ${label}`);
    console.log(`  Message: "${message.slice(0, 80)}..."`);
    console.log(`  Got: ${actual}`);
    console.log(`  Expected: ${expected}`);
  }
}

console.log("");
if (fail > 0) process.exit(1);
