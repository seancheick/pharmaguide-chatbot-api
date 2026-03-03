/**
 * Edge-case unit tests for PharmaGuide gate detection functions.
 * Runs without a server — extracts and tests regex logic directly.
 *
 * Run:  node test/edge-cases.test.js
 */

// ─── Extract functions from chat.js source ───
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(__dirname + "/../api/chat.js", "utf-8");

// Build a sandbox that stubs out require() and module.exports
const sandbox = {
  require: (name) => {
    // Stub all external modules
    if (name === "groq-sdk") return function Groq() {};
    if (name === "@upstash/redis") return { Redis: function () {} };
    if (name === "@upstash/ratelimit") return { Ratelimit: function () { this.slidingWindow = () => {}; } };
    return {};
  },
  module: { exports: null },
  exports: {},
  process: { env: {} },
  console: { log: () => {}, error: () => {} },
  Date,
  Math,
  Set,
  Map,
  Array,
  String,
  RegExp,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Error,
  TypeError,
};

// We need to extract functions. Since they're top-level `function` declarations,
// we can eval the source up to `module.exports` and pull the functions out.
// Simpler approach: extract the helper function source blocks and eval them.

function extractFunction(name) {
  // Match "function name(...) {" and find the balanced closing brace
  const funcStart = src.indexOf(`function ${name}(`);
  if (funcStart === -1) throw new Error(`Function ${name} not found in source`);

  let braceCount = 0;
  let started = false;
  let i = funcStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") { braceCount++; started = true; }
    if (src[i] === "}") { braceCount--; }
    if (started && braceCount === 0) break;
  }
  return src.slice(funcStart, i + 1);
}

// Extract all needed functions
const funcNames = [
  "normalizeText",
  "getConversationContext",
  "isEmergency",
  "isGreeting",
  "isThanks",
  "isGoodbye",
  "intentScore",
  "mentionsHighRiskSerotonergic",
  "mentionsAntidepressant",
  "isComplexStack",
  "mentionsSerotonergicSymptoms",
  "mentionsAnticoagulantRiskSupplement",
  "mentionsBloodThinner",
  "mentionsNonEmergencySymptom",
  "mentionsSupplementOrDose",
  "mentionsHighDoseVitaminD",
  "mentionsHeartSymptoms",
  "mentionsDeficiency",
  "mentionsPregnancyContext",
  "mentionsRetinolRisk",
  "mentionsPregnancyLimitedEvidence",
  "detectsIsotretinoinVitA",
  "mentionsPrenatalOrMulti",
  "mentionsStandaloneFatSoluble",
  "detectsLiverToxicityStack",
  "detectsCharcoalMed",
  "detectsGrapefruitInteraction",
  "detectsSSRIDiscontinuation",
  "detectsPotassiumACEi",
  "detectsIodineThyroid",
  "detectsNiacinStatin",
  "needsMedicationClarifier",
  "mentionsMineralSpacingTrigger",
];

let evalBlock = "";
for (const fn of funcNames) {
  evalBlock += extractFunction(fn) + "\n\n";
}

// Eval in a clean context
const ctx = vm.createContext({});
vm.runInContext(evalBlock, ctx);

// Pull functions into local scope
const fns = {};
for (const fn of funcNames) {
  fns[fn] = vm.runInContext(fn, ctx);
}

// ─── Test harness ───
let pass = 0;
let fail = 0;
let total = 0;

function assert(label, actual, expected) {
  total++;
  if (actual === expected) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} → got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════

console.log("\n=== Gate 1: Emergency — Edge Cases ===");
assert("typo: 'i took to many pills'", fns.isEmergency("i took to many pills"), false); // "to" not "too" — should NOT match (intentional, no fuzzy)
assert("overdosed phrasing", fns.isEmergency("I think I overdosed on melatonin"), true);
assert("passive suicidal: 'I don't want to be here anymore'", fns.isEmergency("I don't want to be here anymore"), false); // doesn't match — known limitation
assert("chest pain + supplement context", fns.isEmergency("I have severe chest pain after taking pre-workout"), true);
assert("seizure mention", fns.isEmergency("my kid is having a seizure"), true);
assert("anaphylaxis phrasing", fns.isEmergency("I think I'm having anaphylaxis, my throat is closing"), true);
assert("NOT emergency: 'my heart feels weird'", fns.isEmergency("my heart feels weird after magnesium"), false);
assert("NOT emergency: 'I feel dizzy'", fns.isEmergency("I feel dizzy since starting iron"), false);

console.log("\n=== Gate 2: Greeting — Edge Cases ===");
assert("'hi' alone", fns.isGreeting("hi"), true);
assert("'Hi there!' — too long?", fns.isGreeting("Hi there!"), false); // "hi there" normalized is 8 chars, under 20
assert("'hello how are you doing today' — too long", fns.isGreeting("hello how are you doing today"), false);
assert("'hey can I take magnesium' — has med context", fns.isGreeting("hey can I take magnesium"), false);
assert("'sup' — slang", fns.isGreeting("sup"), true);
assert("'Good morning' — capitalized", fns.isGreeting("Good morning"), true);

console.log("\n=== Gate 3: Thanks/Goodbye — Edge Cases ===");
assert("'thanks for the help' — thanks", fns.isThanks("thanks for the help"), true);
assert("'thanks, can I also take zinc?' — has question", fns.isThanks("thanks, can I also take zinc?"), false);
assert("'bye' — goodbye", fns.isGoodbye("bye"), true);
assert("'goodbye, should I take my dose?' — has question", fns.isGoodbye("goodbye, should I take my dose?"), false);

console.log("\n=== Gate 4: Intent Score — Edge Cases ===");
assert("'what is the weather' → off-topic", fns.intentScore("what is the weather") < 2, true);
assert("'who won the election' → off-topic", fns.intentScore("who won the election") < 2, true);
assert("'tell me a joke' → off-topic", fns.intentScore("tell me a joke") < 2, true);
assert("'magnesium' — single supplement word → on-topic (short + keyword)", fns.intentScore("magnesium") >= 2, true);
assert("'what about the timing' — follow-up", fns.intentScore("what about the timing") >= 2, true);
assert("'my results are low' — follow-up lab", fns.intentScore("my results are low") >= 2, true);
assert("'is creatine safe long-term' → on-topic", fns.intentScore("is creatine safe long-term") >= 2, true);
assert("'can I take this with food' → on-topic (dose language)", fns.intentScore("can I take this with food") >= 2, true);
assert("'how about instead of' → follow-up", fns.intentScore("how about instead of") >= 2, true);
assert("'ok' — ambiguous short, low intent (score=1, below threshold)", fns.intentScore("ok") < 2, true);
// Let me check: "ok" = 2 chars, 1 word → score: no keywords = 0, short (<=5 words) = +1 → total 1, so < 2

console.log("\n=== Gate 5: Serotonergic Risk — Edge Cases ===");
assert("'5-HTP' detected", fns.mentionsHighRiskSerotonergic("I take 5-HTP for sleep"), true);
assert("'5 htp' no hyphen", fns.mentionsHighRiskSerotonergic("can I take 5 htp"), true);
assert("'St. John's Wort' with period", fns.mentionsHighRiskSerotonergic("I use St. John's Wort"), true);
assert("'st johns wort' lowercase no punctuation", fns.mentionsHighRiskSerotonergic("st johns wort is good"), true);
assert("'rhodiola' detected", fns.mentionsHighRiskSerotonergic("I take rhodiola rosea"), true);
assert("'tryptophan' detected", fns.mentionsHighRiskSerotonergic("L-tryptophan for sleep"), true);
assert("'melatonin' NOT serotonergic trigger", fns.mentionsHighRiskSerotonergic("I take melatonin"), false);
assert("'ashwagandha' NOT serotonergic trigger", fns.mentionsHighRiskSerotonergic("ashwagandha for stress"), false);

assert("antidepressant: 'Zoloft'", fns.mentionsAntidepressant("I take Zoloft 100mg"), true);
assert("antidepressant: 'my anxiety meds'", fns.mentionsAntidepressant("I'm on my anxiety meds"), true);
assert("antidepressant: 'Wellbutrin'", fns.mentionsAntidepressant("I take Wellbutrin"), true);
assert("NOT antidepressant: 'I take magnesium for anxiety'", fns.mentionsAntidepressant("I take magnesium for anxiety"), false);

console.log("\n=== Gate 5b: Complex Stack Detection ===");
assert("4 items = complex", fns.isComplexStack("I take sertraline, adderall, magnesium, and ashwagandha"), true);
assert("3 items = not complex", fns.isComplexStack("I take sertraline, magnesium, and ashwagandha"), false);
assert("biohacker stack", fns.isComplexStack("sertraline 100mg, Adderall XR 20mg, magnesium glycinate, L-theanine, ashwagandha, rhodiola, fish oil, 5-HTP"), true);
assert("2 items only", fns.isComplexStack("I take sertraline and melatonin"), false);

console.log("\n=== Gate 6: Serotonergic Symptoms ===");
assert("'shaky and sweaty'", fns.mentionsSerotonergicSymptoms("I feel shaky and sweaty"), true);
assert("'tremor'", fns.mentionsSerotonergicSymptoms("I noticed a tremor in my hands"), true);
assert("'racing heart'", fns.mentionsSerotonergicSymptoms("my heart is racing"), true);
assert("'fever and diarrhea' — both are serotonin syndrome signs", fns.mentionsSerotonergicSymptoms("I have fever and diarrhea"), true);
assert("'agitated and confused'", fns.mentionsSerotonergicSymptoms("I feel agitated and confused"), true);
assert("NOT symptoms: 'I feel great'", fns.mentionsSerotonergicSymptoms("I feel great after taking it"), false);

console.log("\n=== Gate 7: Blood Thinner Risk — Edge Cases ===");
assert("'turmeric' detected as anticoag supplement", fns.mentionsAnticoagulantRiskSupplement("I want to take turmeric"), true);
assert("'ginger tea' detected", fns.mentionsAnticoagulantRiskSupplement("I drink ginger tea daily"), true);
assert("'nattokinase'", fns.mentionsAnticoagulantRiskSupplement("can I take nattokinase"), true);
assert("'garlic supplement'", fns.mentionsAnticoagulantRiskSupplement("I take garlic supplement"), true);
assert("'plain garlic in cooking' — NOT supplement", fns.mentionsAnticoagulantRiskSupplement("I use garlic in cooking"), false);
assert("'fish oil'", fns.mentionsAnticoagulantRiskSupplement("I take fish oil daily"), true);
assert("'vitamin E'", fns.mentionsAnticoagulantRiskSupplement("vitamin E 400 IU"), true);
assert("'aspirin' as blood thinner", fns.mentionsBloodThinner("I take baby aspirin"), true);
assert("'Eliquis' as blood thinner", fns.mentionsBloodThinner("I'm on Eliquis"), true);
assert("'blood clot medication'", fns.mentionsBloodThinner("I take blood clot medication"), false); // "blood clot med" not exact match
assert("'warfarin' — classic", fns.mentionsBloodThinner("I take warfarin"), true);
assert("'Plavix'", fns.mentionsBloodThinner("I'm on Plavix"), true);

console.log("\n=== Gate 8: Symptom Triage — Edge Cases ===");
assert("'dizzy since starting supplement'", fns.mentionsNonEmergencySymptom("I feel dizzy since starting this supplement"), true);
assert("'rash after vitamin'", fns.mentionsNonEmergencySymptom("I got a rash after taking my new vitamin"), true);
assert("'heart feels weird'", fns.mentionsNonEmergencySymptom("my heart feels weird"), true);
assert("'brain zaps'", fns.mentionsNonEmergencySymptom("I'm getting brain zaps"), true);
assert("'feeling jittery'", fns.mentionsNonEmergencySymptom("feeling really jittery"), true);
assert("'tinnitus / ringing in ears'", fns.mentionsNonEmergencySymptom("I have ringing in my ears"), true);
assert("'nausea all day'", fns.mentionsNonEmergencySymptom("nausea all day after taking it"), true);
assert("NOT symptom: 'I feel good'", fns.mentionsNonEmergencySymptom("I feel good"), false);
assert("NOT symptom: 'it tastes weird'", fns.mentionsNonEmergencySymptom("it tastes weird"), false);
assert("supplement context: 'I took 500mg'", fns.mentionsSupplementOrDose("I took 500mg"), true);
assert("supplement context: 'started a new vitamin'", fns.mentionsSupplementOrDose("I started a new vitamin"), true);

console.log("\n=== Gate 9: Vitamin D + Heart — Edge Cases ===");
assert("'50000 IU vitamin D'", fns.mentionsHighDoseVitaminD("I took 50000 IU vitamin D"), true);
assert("'50k IU vitamin d'", fns.mentionsHighDoseVitaminD("50k IU vitamin d"), true);
assert("'50,000 iu of D3'", fns.mentionsHighDoseVitaminD("I take 50,000 iu of D3"), true); // comma gets normalized
assert("'high dose vitamin D'", fns.mentionsHighDoseVitaminD("I'm on high dose vitamin D"), true);
assert("'5000 IU vitamin D' — NOT high dose trigger", fns.mentionsHighDoseVitaminD("I take 5000 IU vitamin D"), false);
assert("'1000 IU D3' — NOT trigger", fns.mentionsHighDoseVitaminD("I take 1000 IU D3"), false);
assert("heart racing", fns.mentionsHeartSymptoms("my heart is racing"), true);
assert("palpitations", fns.mentionsHeartSymptoms("I have palpitations"), true);
assert("'heart beat so fast'", fns.mentionsHeartSymptoms("my heart beat so fast"), true);
assert("'fast heart rate'", fns.mentionsHeartSymptoms("I have a fast heart rate"), true);
assert("deficiency: 'my level is 12'", fns.mentionsDeficiency("my level is 12"), true);
assert("deficiency: 'blood work shows low D'", fns.mentionsDeficiency("blood work shows low vitamin D"), true);
assert("deficiency: 'I'm vitamin D deficient'", fns.mentionsDeficiency("I'm vitamin D deficient"), true);
assert("NOT deficiency: 'I take vitamin D daily'", fns.mentionsDeficiency("I take vitamin D daily"), false);

console.log("\n=== Gate 10: Pregnancy + Retinol — Edge Cases ===");
assert("'pregnant + vitamin A'", fns.mentionsPregnancyContext("I'm pregnant") && fns.mentionsRetinolRisk("can I take vitamin A"), true);
assert("'6 weeks pregnant'", fns.mentionsPregnancyContext("I'm 6 weeks pregnant"), true);
assert("'ttc' (trying to conceive)", fns.mentionsPregnancyContext("I'm ttc"), true);
assert("'breastfeeding'", fns.mentionsPregnancyContext("I'm breastfeeding"), true);
assert("'prenatal' detected as pregnancy context", fns.mentionsPregnancyContext("I take a prenatal vitamin"), true);
assert("'retinol' as risk", fns.mentionsRetinolRisk("I use retinol cream"), true);
assert("'cod liver oil' as risk", fns.mentionsRetinolRisk("I take cod liver oil"), true);
assert("'vitamin A' detected", fns.mentionsRetinolRisk("vitamin A supplement"), true);
assert("'vitamin A D E K' — should NOT match retinol (vitamin A followed by D)", fns.mentionsRetinolRisk("I take vitamins A D E K"), false); // pattern excludes "vitamin a" followed by D/E/K

console.log("\n=== Gate 11: Pregnancy + Limited Evidence ===");
assert("'melatonin' flagged in pregnancy", fns.mentionsPregnancyLimitedEvidence("I take melatonin 5mg"), true);
assert("'ashwagandha' flagged", fns.mentionsPregnancyLimitedEvidence("ashwagandha for stress"), true);
assert("'kava' flagged", fns.mentionsPregnancyLimitedEvidence("can I drink kava"), true);
assert("'berberine' flagged", fns.mentionsPregnancyLimitedEvidence("I take berberine"), true);
assert("'vitamin D' NOT flagged (not limited evidence)", fns.mentionsPregnancyLimitedEvidence("vitamin D 5000 IU"), false);
assert("'fish oil' NOT flagged", fns.mentionsPregnancyLimitedEvidence("fish oil daily"), false);

console.log("\n=== Gate 12: Isotretinoin + Vitamin A ===");
assert("'Accutane + vitamin A'", fns.detectsIsotretinoinVitA("I'm on Accutane and take vitamin A 10000 IU"), true);
assert("'isotretinoin + retinol'", fns.detectsIsotretinoinVitA("isotretinoin and retinol supplement"), true);
assert("'Accutane alone' — no vitamin A → false", fns.detectsIsotretinoinVitA("I'm on Accutane"), false);
assert("'vitamin A alone' — no isotretinoin → false", fns.detectsIsotretinoinVitA("I take vitamin A"), false);
assert("'Claravis + cod liver oil'", fns.detectsIsotretinoinVitA("I take Claravis and cod liver oil daily"), true);

console.log("\n=== Gate 13: Supplement Stacking ===");
assert("'prenatal + vitamin D'", fns.mentionsPrenatalOrMulti("I take a prenatal") && fns.mentionsStandaloneFatSoluble("can I add vitamin D"), true);
assert("'multivitamin + iron supplement'", fns.mentionsPrenatalOrMulti("I take a multivitamin") && fns.mentionsStandaloneFatSoluble("and an iron supplement"), true);
assert("'Centrum' recognized as multi", fns.mentionsPrenatalOrMulti("I take Centrum"), true);
assert("'Ritual prenatal' recognized", fns.mentionsPrenatalOrMulti("I'm on Ritual prenatal"), true);
assert("'vitamin C' — NOT fat soluble, no trigger", fns.mentionsStandaloneFatSoluble("I take extra vitamin C"), false);

console.log("\n=== Gate 14: Liver Toxicity Stacking ===");
assert("'kava + alcohol' → liver risk", fns.detectsLiverToxicityStack("I take kava and drink socially"), true);
assert("'Tylenol + green tea extract' → liver risk", fns.detectsLiverToxicityStack("I take Tylenol daily and green tea extract"), true);
assert("'kava + Tylenol + alcohol' → 3 agents", fns.detectsLiverToxicityStack("kava, Tylenol, and I drink beer"), true);
assert("'kava alone' → not enough", fns.detectsLiverToxicityStack("I take kava"), false);
assert("'Tylenol alone' → not enough", fns.detectsLiverToxicityStack("I take Tylenol occasionally"), false);
assert("'green tea (drink)' does NOT trigger GTE", fns.detectsLiverToxicityStack("I drink green tea and take Tylenol"), false); // "green tea" without "extract"

console.log("\n=== Gate 15: Charcoal + Medication ===");
assert("'activated charcoal + birth control'", fns.detectsCharcoalMed("I take activated charcoal and birth control"), true);
assert("'charcoal detox + levothyroxine'", fns.detectsCharcoalMed("charcoal supplement for detox and levothyroxine"), true);
assert("'charcoal daily + my medication'", fns.detectsCharcoalMed("I take charcoal daily with my medication"), true);
assert("'charcoal alone' — no med", fns.detectsCharcoalMed("I take activated charcoal for detox"), false); // no medication mentioned
// Actually "detox" alone might not trigger — let's verify the pattern
assert("'charcoal supplement' alone — no med word", fns.detectsCharcoalMed("I use charcoal supplement"), false);

console.log("\n=== Gate 16: CYP3A4 / Grapefruit ===");
assert("'grapefruit + simvastatin'", fns.detectsGrapefruitInteraction("I drink grapefruit juice and take simvastatin"), true);
assert("'grapefruit + quetiapine + buspirone'", fns.detectsGrapefruitInteraction("grapefruit juice with quetiapine and buspirone"), true);
assert("'grapefruit + cholesterol med' (vague)", fns.detectsGrapefruitInteraction("grapefruit with my cholesterol med"), true);
assert("'grapefruit + vitamin C' — no CYP3A4 substrate", fns.detectsGrapefruitInteraction("grapefruit and vitamin C"), false);
assert("'grapefruit alone'", fns.detectsGrapefruitInteraction("I love grapefruit"), false);
assert("'simvastatin alone'", fns.detectsGrapefruitInteraction("I take simvastatin"), false);

console.log("\n=== Gate 17: SSRI Discontinuation ===");
assert("'stopped SSRI + 5-HTP instead'", fns.detectsSSRIDiscontinuation("I stopped my SSRI and want to take 5-HTP instead"), true);
assert("'quit Zoloft + St. John's Wort'", fns.detectsSSRIDiscontinuation("I quit Zoloft, should I try st johns wort instead"), true);
assert("'weaning off Lexapro + replace with 5-HTP'", fns.detectsSSRIDiscontinuation("I'm weaning off Lexapro, can I replace with 5-HTP"), true);
assert("'ran out of Prozac + 5-HTP'", fns.detectsSSRIDiscontinuation("I ran out of Prozac, is 5-HTP a good substitute"), true);
assert("'still on SSRI + 5-HTP' — NOT discontinued", fns.detectsSSRIDiscontinuation("I take an SSRI and want to add 5-HTP"), false);
assert("'stopped SSRI' alone — no substitute", fns.detectsSSRIDiscontinuation("I stopped my SSRI"), false);

console.log("\n=== Gate 18: Dose Sanity ===");
assert("'potassium + lisinopril'", fns.detectsPotassiumACEi("can I take potassium supplement with lisinopril"), true);
assert("'potassium + losartan (ARB)'", fns.detectsPotassiumACEi("potassium citrate with losartan"), true);
assert("'potassium + spironolactone'", fns.detectsPotassiumACEi("extra potassium with spironolactone"), true);
assert("'potassium alone'", fns.detectsPotassiumACEi("can I take potassium"), false);
assert("'iodine + hypothyroid'", fns.detectsIodineThyroid("I have hypothyroidism and want to take iodine"), true);
assert("'kelp + Hashimoto's'", fns.detectsIodineThyroid("kelp supplement with Hashimotos"), true);
assert("'iodine + levothyroxine'", fns.detectsIodineThyroid("can I take iodine with levothyroxine"), true);
assert("'iodine alone'", fns.detectsIodineThyroid("I want to try iodine"), false);
assert("'niacin + atorvastatin'", fns.detectsNiacinStatin("niacin with atorvastatin"), true);
assert("'vitamin B3 + statin'", fns.detectsNiacinStatin("vitamin B3 with my statin"), true);
assert("'niacinamide + statin' — should NOT trigger", fns.detectsNiacinStatin("niacinamide with my statin"), false);
assert("'niacin + red yeast rice'", fns.detectsNiacinStatin("niacin and red yeast rice"), true);

console.log("\n=== Gate 19: Medication Clarifier ===");
assert("'my blood thinner + natural supplement' (vague)", fns.needsMedicationClarifier("I take a blood thinner and a natural supplement for circulation. Is that fine?"), true);
assert("'my meds + supplement' (vague)", fns.needsMedicationClarifier("can I take a supplement with my meds"), true);
assert("'warfarin + turmeric' — specific, no clarify", fns.needsMedicationClarifier("can I take turmeric with warfarin"), false);
assert("'my antidepressant + 5-HTP' — high risk overrides", fns.needsMedicationClarifier("can I take 5-HTP with my antidepressant"), false);
assert("unknown brand name → should clarify (ask for ingredients)", fns.needsMedicationClarifier("I take NatureBoost Hormone Balance Support. Is it safe with birth control?"), true);

console.log("\n=== Gate Context-Awareness (getConversationContext) ===");
const ctx1 = fns.getConversationContext("can he add ginkgo", [
  { role: "user", content: "My dad takes warfarin and aspirin" },
  { role: "assistant", content: "Got it." },
]);
assert("warfarin from history + ginkgo from message", ctx1.includes("warfarin") && ctx1.includes("ginkgo"), true);

const ctx2 = fns.getConversationContext("can I try st johns wort", [
  { role: "user", content: "I take sertraline 50mg" },
  { role: "assistant", content: "Got it." },
]);
assert("sertraline from history appears in context", ctx2.includes("sertraline"), true);
assert("st johns from message appears in context", ctx2.includes("st john"), true);

// Test that context-aware blood thinner gate fires with history
assert("blood thinner from history + ginkgo in message triggers gate 7",
  fns.mentionsAnticoagulantRiskSupplement("can he add ginkgo and ginseng") && fns.mentionsBloodThinner(ctx1),
  true
);

// Test that context-aware serotonergic gate fires with history
assert("sertraline from history + st johns in message triggers gate 5",
  fns.mentionsHighRiskSerotonergic("can I try st johns wort") && fns.mentionsAntidepressant(ctx2),
  true
);

console.log("\n=== Cross-Gate Priority / Overlap Edge Cases ===");
// These test whether the right gate SHOULD fire given the handler's ordering

// Emergency vs symptom triage
assert("'chest pain after pre-workout' → emergency wins over symptom triage",
  fns.isEmergency("I have severe chest pain after taking pre-workout"), true);

// Serotonergic + symptoms → gate 6 urgent, not gate 8 triage
assert("'shaky and sweaty' + serotonergic context → symptoms detected",
  fns.mentionsSerotonergicSymptoms("I took St Johns Wort with Prozac and feel shaky and sweaty"), true);
assert("...and serotonergic + antidepressant also detected",
  fns.mentionsHighRiskSerotonergic("I took St Johns Wort with Prozac and feel shaky and sweaty") &&
  fns.mentionsAntidepressant("I took St Johns Wort with Prozac and feel shaky and sweaty"), true);

// Pregnancy + retinol vs pregnancy + limited evidence
assert("'pregnant + vitamin A' → retinol gate, NOT limited evidence",
  fns.mentionsPregnancyContext("I'm pregnant, can I take vitamin A") && fns.mentionsRetinolRisk("I'm pregnant, can I take vitamin A"), true);
assert("'pregnant + melatonin' → limited evidence, NOT retinol",
  fns.mentionsPregnancyContext("I'm pregnant, can I take melatonin") && fns.mentionsPregnancyLimitedEvidence("I'm pregnant, can I take melatonin") && !fns.mentionsRetinolRisk("I'm pregnant, can I take melatonin"), true);

// Mineral spacing edge case: conceptual mention shouldn't trigger
assert("'calcium helps with vitamin K absorption' — conceptual, long", fns.mentionsMineralSpacingTrigger("calcium helps with vitamin K absorption in general"), false);
assert("'taking calcium 500mg' — action verb + mineral → triggers", fns.mentionsMineralSpacingTrigger("I'm taking calcium 500mg"), true);
assert("'magnesium' alone (short) → triggers", fns.mentionsMineralSpacingTrigger("magnesium"), true);

console.log("\n=== Tricky Real-World Messages ===");
// User says something that could be multiple gates
assert("'I take warfarin and ginger tea and feel dizzy' — symptom triage AND blood thinner",
  fns.mentionsBloodThinner("I take warfarin and ginger tea and feel dizzy") &&
  fns.mentionsAnticoagulantRiskSupplement("I take warfarin and ginger tea and feel dizzy") &&
  fns.mentionsNonEmergencySymptom("I take warfarin and ginger tea and feel dizzy"),
  true); // Handler: gate 7 fires first (line 1031)

assert("'I'm pregnant and take kava and feel nauseous' — pregnancy + limited evidence + symptom",
  fns.mentionsPregnancyContext("I'm pregnant and take kava and feel nauseous") &&
  fns.mentionsPregnancyLimitedEvidence("I'm pregnant and take kava and feel nauseous"),
  true); // But handler checks symptom triage (gate 8) before pregnancy gates... let's verify

// Actually checking handler order:
// Gate 8 checks mentionsNonEmergencySymptom(message) && mentionsSupplementOrDose(convoContext)
// "nauseous" → matches "nausea" pattern? Let's check:
assert("'nauseous' as symptom", fns.mentionsNonEmergencySymptom("I feel nauseous"), true);
// That's a gap! "nauseous" doesn't match the symptom regex

assert("'I'm on Accutane and pregnant and take vitamin A' — isotretinoin + pregnancy + retinol all match",
  fns.detectsIsotretinoinVitA("I'm on Accutane and pregnant and take vitamin A") &&
  fns.mentionsPregnancyContext("I'm on Accutane and pregnant and take vitamin A") &&
  fns.mentionsRetinolRisk("I'm on Accutane and pregnant and take vitamin A"),
  true); // Handler: pregnancy-retinol (gate 10) fires before isotretinoin (gate 12)... actually gate 8 (symptom) checked first, but no symptoms. Then gate 10 fires.

// ── SUMMARY ──
console.log("\n" + "═".repeat(50));
console.log(`Results: ${pass}/${total} passed, ${fail} failed`);
console.log("═".repeat(50) + "\n");

if (fail > 0) process.exit(1);
