/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PharmaGuide — Full Gate Logic Test Suite
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 * ───────────
 *   node test/full-suite.test.js
 *
 * WHAT IT TESTS:
 * ──────────────
 *   This file tests the ENTIRE gate logic in api/chat.js without needing a
 *   running server. It extracts every detection function from the source code
 *   and runs 300+ assertions across:
 *
 *     PART 1 — Individual gate regex tests (every gate, every edge case)
 *     PART 2 — Full routing simulation (traces messages through the complete
 *              gate chain exactly as the handler does, including priority order)
 *     PART 3 — 20 original stress-test scenarios
 *     PART 4 — 20 UX-focused developer scenarios
 *     PART 5 — Hard edge cases (ALL CAPS, misspellings, emoji, slang, etc.)
 *     PART 6 — Context-aware follow-ups (multi-turn conversations)
 *     PART 7 — False-positive guards (things that should NOT trigger gates)
 *     PART 8 — Gate priority / overlap tests (when multiple gates match)
 *
 *   If any test fails the script exits with code 1 and prints a summary
 *   of all failures at the bottom so you can see exactly what broke.
 *
 * WHEN TO RUN:
 * ────────────
 *   - Before every deploy
 *   - After editing any regex or gate logic in api/chat.js
 *   - After adding new gates or keywords
 *   - As a CI check (exits non-zero on failure)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require("fs");
const vm = require("vm");

// ─── Bootstrap: extract functions from chat.js ───────────────────────────────
const src = fs.readFileSync(__dirname + "/../api/chat.js", "utf-8");

function extractFunction(name) {
  const funcStart = src.indexOf(`function ${name}(`);
  if (funcStart === -1) throw new Error(`Function "${name}" not found in api/chat.js — did it get renamed?`);
  let braceCount = 0, started = false, i = funcStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") { braceCount++; started = true; }
    if (src[i] === "}") { braceCount--; }
    if (started && braceCount === 0) break;
  }
  return src.slice(funcStart, i + 1);
}

const funcNames = [
  "normalizeText", "getConversationContext",
  "isEmergency", "isGreeting", "isThanks", "isGoodbye", "intentScore",
  "mentionsHighRiskSerotonergic", "mentionsAntidepressant", "isComplexStack",
  "mentionsSerotonergicSymptoms",
  "mentionsAnticoagulantRiskSupplement", "mentionsBloodThinner",
  "mentionsNonEmergencySymptom", "mentionsSupplementOrDose",
  "mentionsHighDoseVitaminD", "mentionsHeartSymptoms", "mentionsDeficiency",
  "mentionsPregnancyContext", "mentionsRetinolRisk", "mentionsPregnancyLimitedEvidence",
  "detectsIsotretinoinVitA",
  "mentionsPrenatalOrMulti", "mentionsStandaloneFatSoluble",
  "detectsLiverToxicityStack", "detectsCharcoalMed", "detectsGrapefruitInteraction",
  "detectsSSRIDiscontinuation",
  "detectsPotassiumACEi", "detectsIodineThyroid", "detectsNiacinStatin",
  "needsMedicationClarifier", "mentionsMineralSpacingTrigger",
];

let evalBlock = "";
for (const fn of funcNames) evalBlock += extractFunction(fn) + "\n\n";
const sandbox = vm.createContext({});
vm.runInContext(evalBlock, sandbox);
const f = {};
for (const fn of funcNames) f[fn] = vm.runInContext(fn, sandbox);

// ─── Test harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, actual, expected) {
  total++;
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL  ${label} → got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    failures.push(label);
  }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ─── Full routing simulation ─────────────────────────────────────────────────
function route(message, history) {
  const safeHistory = (history || []).slice(-10);
  const hasConvo = safeHistory.length > 0;
  const ctx = f.getConversationContext(message, safeHistory);

  if (f.isEmergency(message)) return "system:emergency";
  if (!hasConvo && f.isGreeting(message)) return "system:welcome";
  if (f.isThanks(message)) return "system:thanks";
  if (f.isGoodbye(message)) return "system:goodbye";

  const meta = /\b(you.?re ai|are you ai|how do i know|can i trust|are you accurate|who built|who made|how does this work|what are you)\b/.test(f.normalizeText(message));
  if (!hasConvo && !meta && f.intentScore(message) < 2) return "system:off-topic";

  if (f.detectsSSRIDiscontinuation(ctx)) return "system:ssri-discontinuation";
  if (f.mentionsHighRiskSerotonergic(ctx) && f.mentionsAntidepressant(ctx)) {
    if (f.mentionsSerotonergicSymptoms(message)) return "system:serotonin-urgent";
    if (f.mentionsHighRiskSerotonergic(message)) return "system:serotonin-risk";
  }
  if (f.mentionsAnticoagulantRiskSupplement(message) && f.mentionsBloodThinner(ctx)) return "system:blood-thinner-risk";
  if (f.mentionsNonEmergencySymptom(message) && f.mentionsSupplementOrDose(ctx)) {
    if (f.mentionsHighDoseVitaminD(ctx) && f.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";
    return "system:symptom-triage";
  }
  if (f.mentionsHighDoseVitaminD(message) && f.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";
  if (f.mentionsPregnancyContext(ctx) && f.mentionsRetinolRisk(message)) return "system:pregnancy-retinol";
  if (f.mentionsPregnancyContext(ctx) && f.mentionsPregnancyLimitedEvidence(message)) return "system:pregnancy-limited";
  if (f.detectsIsotretinoinVitA(ctx)) return "system:isotretinoin-vita";
  if (f.mentionsPrenatalOrMulti(ctx) && f.mentionsStandaloneFatSoluble(message)) return "system:stacking-risk";
  if (f.detectsLiverToxicityStack(ctx)) return "system:liver-toxicity";
  if (f.detectsCharcoalMed(ctx)) return "system:charcoal-med";
  if (f.detectsGrapefruitInteraction(ctx)) return "system:grapefruit-cyp3a4";
  if (f.detectsPotassiumACEi(ctx)) return "system:potassium-acei";
  if (f.detectsIodineThyroid(ctx)) return "system:iodine-thyroid";
  if (f.detectsNiacinStatin(ctx)) return "system:niacin-statin";
  if (!hasConvo && f.needsMedicationClarifier(message)) return "system:clarifier";
  return "llm";
}

function expectRoute(label, msg, expected, history) {
  total++;
  const actual = route(msg, history);
  if (actual === expected) { pass++; }
  else {
    fail++;
    console.log(`  FAIL  ${label} → got '${actual}', expected '${expected}'`);
    failures.push(label);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — INDIVIDUAL GATE REGEX TESTS
// ═════════════════════════════════════════════════════════════════════════════

section("Gate 1: Emergency");
assert("overdose", f.isEmergency("I think I overdosed on melatonin"), true);
assert("overdosed past tense", f.isEmergency("I overdosed on pills"), true);
assert("took too many", f.isEmergency("I took too many sleeping pills"), true);
assert("took 20 pills", f.isEmergency("I took 20 pills of Tylenol"), true);
assert("chest pain", f.isEmergency("I have severe chest pain after pre-workout"), true);
assert("seizure", f.isEmergency("my kid is having a seizure"), true);
assert("throat closing", f.isEmergency("my throat is closing up"), true);
assert("anaphylaxis", f.isEmergency("I think anaphylaxis is happening"), true);
assert("suicidal ideation", f.isEmergency("I want to kill myself"), true);
assert("self harm", f.isEmergency("I want to hurt myself"), true);
assert("cant breathe", f.isEmergency("I can't breathe"), true);
assert("coughing blood", f.isEmergency("I am coughing blood"), true);
assert("unconscious", f.isEmergency("my friend is unconscious"), true);
assert("NOT emergency: dizzy", f.isEmergency("I feel dizzy"), false);
assert("NOT emergency: heart weird", f.isEmergency("my heart feels weird"), false);
assert("NOT emergency: headache", f.isEmergency("I have a headache"), false);
assert("NOT emergency: nausea", f.isEmergency("I feel nauseous"), false);
assert("typo 'took to many' (no match)", f.isEmergency("I took to many pills"), false);

section("Gate 2: Greeting");
assert("hi", f.isGreeting("hi"), true);
assert("hey", f.isGreeting("hey"), true);
assert("hello", f.isGreeting("hello"), true);
assert("sup", f.isGreeting("sup"), true);
assert("good morning", f.isGreeting("Good morning"), true);
assert("good evening", f.isGreeting("good evening"), true);
assert("yo", f.isGreeting("yo"), true);
assert("NOT: hi there!", f.isGreeting("Hi there!"), false);
assert("NOT: hey can I take", f.isGreeting("hey can I take magnesium"), false);
assert("NOT: long greeting", f.isGreeting("hello how are you doing today"), false);

section("Gate 3: Thanks / Goodbye");
assert("thanks", f.isThanks("thanks"), true);
assert("thank you so much", f.isThanks("thank you so much"), true);
assert("appreciate it", f.isThanks("appreciate it"), true);
assert("NOT: thanks + question", f.isThanks("thanks, can I also take zinc?"), false);
assert("bye", f.isGoodbye("bye"), true);
assert("take care", f.isGoodbye("take care"), true);
assert("NOT: bye + question", f.isGoodbye("bye, should I take my dose?"), false);

section("Gate 4: Intent Score (on-topic vs off-topic)");
// Off-topic (score < 2)
assert("weather → off-topic", f.intentScore("what is the weather") < 2, true);
assert("election → off-topic", f.intentScore("who won the election") < 2, true);
assert("joke → off-topic", f.intentScore("tell me a joke") < 2, true);
assert("recipe → off-topic", f.intentScore("how do I make pasta") < 2, true);
assert("sports → off-topic", f.intentScore("who won the super bowl") < 2, true);
assert("ok → below threshold", f.intentScore("ok") < 2, true);
// On-topic (score >= 2)
assert("magnesium (short)", f.intentScore("magnesium") >= 2, true);
assert("is creatine safe", f.intentScore("is creatine safe long-term") >= 2, true);
assert("can I take with food", f.intentScore("can I take this with food") >= 2, true);
assert("what about timing (follow-up)", f.intentScore("what about the timing") >= 2, true);
assert("my results are low", f.intentScore("my results are low") >= 2, true);
assert("how about instead of", f.intentScore("how about instead of") >= 2, true);
assert("Xanax + wine", f.intentScore("I take Xanax sometimes. Can I drink wine tonight?") >= 2, true);
assert("everything I take is toxic", f.intentScore("I googled and now I think everything I take is toxic") >= 2, true);
assert("depressed + hormones", f.intentScore("I'm depressed, stressed, hormones are crazy, I take everything") >= 2, true);
assert("child ADHD", f.intentScore("My 7-year-old won't focus. Can I give him what I take for ADHD?") >= 2, true);
assert("supplements (plural)", f.intentScore("after supplements") >= 2, true);
assert("psilocybin + SSRI", f.intentScore("I microdose psilocybin and take SSRI. Safe?") >= 2, true);

section("Gate 5: Serotonergic Risk");
assert("5-HTP", f.mentionsHighRiskSerotonergic("I take 5-HTP for sleep"), true);
assert("5 htp (no hyphen)", f.mentionsHighRiskSerotonergic("can I take 5 htp"), true);
assert("St. John's Wort (punctuated)", f.mentionsHighRiskSerotonergic("I use St. John's Wort"), true);
assert("st johns wort (plain)", f.mentionsHighRiskSerotonergic("st johns wort is good"), true);
assert("rhodiola", f.mentionsHighRiskSerotonergic("I take rhodiola rosea"), true);
assert("tryptophan", f.mentionsHighRiskSerotonergic("L-tryptophan for sleep"), true);
assert("psilocybin", f.mentionsHighRiskSerotonergic("I microdose psilocybin"), true);
assert("NOT: melatonin", f.mentionsHighRiskSerotonergic("I take melatonin"), false);
assert("NOT: ashwagandha", f.mentionsHighRiskSerotonergic("ashwagandha for stress"), false);
// Antidepressant detection
assert("Zoloft", f.mentionsAntidepressant("I take Zoloft 100mg"), true);
assert("anxiety meds", f.mentionsAntidepressant("I'm on my anxiety meds"), true);
assert("Wellbutrin", f.mentionsAntidepressant("I take Wellbutrin"), true);
assert("SSRI keyword", f.mentionsAntidepressant("I take an SSRI"), true);
assert("sertaline (misspelled)", f.mentionsAntidepressant("I take sertaline"), true);
assert("NOT: magnesium for anxiety", f.mentionsAntidepressant("I take magnesium for anxiety"), false);
// Complex stack
assert("4+ items = complex", f.isComplexStack("sertraline, adderall, magnesium, ashwagandha"), true);
assert("8 items (biohacker)", f.isComplexStack("sertraline 100mg, Adderall XR 20mg, magnesium, L-theanine, ashwagandha, rhodiola, fish oil, 5-HTP"), true);
assert("3 items = NOT complex", f.isComplexStack("sertraline, magnesium, ashwagandha"), false);
assert("2 items", f.isComplexStack("sertraline and melatonin"), false);

section("Gate 6: Serotonergic Symptoms");
assert("shaky and sweaty", f.mentionsSerotonergicSymptoms("I feel shaky and sweaty"), true);
assert("tremor", f.mentionsSerotonergicSymptoms("I noticed a tremor in my hands"), true);
assert("heart is racing", f.mentionsSerotonergicSymptoms("my heart is racing"), true);
assert("agitated and confused", f.mentionsSerotonergicSymptoms("I feel agitated and confused"), true);
assert("fever + diarrhea", f.mentionsSerotonergicSymptoms("I have fever and diarrhea"), true);
assert("brain zaps", f.mentionsSerotonergicSymptoms("I'm getting brain zaps"), true);
assert("jittery", f.mentionsSerotonergicSymptoms("feeling really jittery"), true);
assert("palpitations", f.mentionsSerotonergicSymptoms("I have palpitations"), true);
assert("NOT: I feel great", f.mentionsSerotonergicSymptoms("I feel great"), false);
assert("NOT: I feel tired", f.mentionsSerotonergicSymptoms("I feel tired"), false);

section("Gate 7: Blood Thinner Risk");
assert("turmeric", f.mentionsAnticoagulantRiskSupplement("I want to take turmeric"), true);
assert("ginger tea", f.mentionsAnticoagulantRiskSupplement("I drink ginger tea daily"), true);
assert("nattokinase", f.mentionsAnticoagulantRiskSupplement("can I take nattokinase"), true);
assert("garlic supplement", f.mentionsAnticoagulantRiskSupplement("garlic supplement daily"), true);
assert("fish oil", f.mentionsAnticoagulantRiskSupplement("I take fish oil"), true);
assert("vitamin E", f.mentionsAnticoagulantRiskSupplement("vitamin E 400 IU"), true);
assert("ginkgo", f.mentionsAnticoagulantRiskSupplement("ginkgo biloba extract"), true);
assert("NOT: garlic in cooking", f.mentionsAnticoagulantRiskSupplement("I use garlic in cooking"), false);
assert("warfarin", f.mentionsBloodThinner("I take warfarin"), true);
assert("Eliquis", f.mentionsBloodThinner("I'm on Eliquis"), true);
assert("aspirin", f.mentionsBloodThinner("I take baby aspirin"), true);
assert("Plavix", f.mentionsBloodThinner("I'm on Plavix"), true);
assert("blood thinner (generic)", f.mentionsBloodThinner("I take a blood thinner"), true);

section("Gate 8: Symptom Triage");
assert("dizzy", f.mentionsNonEmergencySymptom("I feel dizzy since starting this supplement"), true);
assert("rash", f.mentionsNonEmergencySymptom("I got a rash after my vitamin"), true);
assert("heart feels weird", f.mentionsNonEmergencySymptom("my heart feels weird"), true);
assert("brain zaps", f.mentionsNonEmergencySymptom("I'm getting brain zaps"), true);
assert("jittery", f.mentionsNonEmergencySymptom("feeling really jittery"), true);
assert("tinnitus", f.mentionsNonEmergencySymptom("I have ringing in my ears"), true);
assert("nausea all day", f.mentionsNonEmergencySymptom("nausea all day"), true);
assert("nauseous", f.mentionsNonEmergencySymptom("I feel nauseous"), true);
assert("feel funny", f.mentionsNonEmergencySymptom("I feel funny"), true);
assert("feel strange", f.mentionsNonEmergencySymptom("I feel strange after taking it"), true);
assert("blurry vision", f.mentionsNonEmergencySymptom("I have blurry vision"), true);
assert("numbness", f.mentionsNonEmergencySymptom("numbness in my hands"), true);
assert("NOT: I feel good", f.mentionsNonEmergencySymptom("I feel good"), false);
assert("NOT: tastes weird", f.mentionsNonEmergencySymptom("it tastes weird"), false);
assert("supplement context: 500mg", f.mentionsSupplementOrDose("I took 500mg"), true);
assert("supplement context: new vitamin", f.mentionsSupplementOrDose("I started a new vitamin"), true);

section("Gate 9: Vitamin D + Heart Symptoms");
assert("50000 IU vitamin D", f.mentionsHighDoseVitaminD("I took 50000 IU vitamin D"), true);
assert("50k IU", f.mentionsHighDoseVitaminD("50k IU vitamin d"), true);
assert("50,000 iu D3", f.mentionsHighDoseVitaminD("I take 50,000 iu of D3"), true);
assert("high dose vitamin D", f.mentionsHighDoseVitaminD("I'm on high dose vitamin D"), true);
assert("NOT: 5000 IU", f.mentionsHighDoseVitaminD("I take 5000 IU vitamin D"), false);
assert("NOT: 1000 IU", f.mentionsHighDoseVitaminD("I take 1000 IU D3"), false);
assert("heart racing", f.mentionsHeartSymptoms("my heart is racing"), true);
assert("palpitations", f.mentionsHeartSymptoms("I have palpitations"), true);
assert("heart beat fast", f.mentionsHeartSymptoms("my heart beat so fast"), true);
assert("fast heart rate", f.mentionsHeartSymptoms("I have a fast heart rate"), true);
assert("heart feels weird", f.mentionsHeartSymptoms("my heart feels weird"), true);
assert("deficiency: level is 12", f.mentionsDeficiency("my level is 12"), true);
assert("deficiency: blood work", f.mentionsDeficiency("blood work shows low vitamin D"), true);
assert("deficiency: vitamin D deficient", f.mentionsDeficiency("I'm vitamin D deficient"), true);
assert("NOT deficiency: take D daily", f.mentionsDeficiency("I take vitamin D daily"), false);

section("Gate 10: Pregnancy + Retinol");
assert("pregnant", f.mentionsPregnancyContext("I'm pregnant"), true);
assert("6 weeks pregnant", f.mentionsPregnancyContext("I'm 6 weeks pregnant"), true);
assert("breastfeeding", f.mentionsPregnancyContext("I'm breastfeeding"), true);
assert("ttc", f.mentionsPregnancyContext("I'm ttc"), true);
assert("prenatal", f.mentionsPregnancyContext("I take a prenatal vitamin"), true);
assert("conceiving", f.mentionsPregnancyContext("I'm trying to conceive"), true);
assert("vitamin A", f.mentionsRetinolRisk("vitamin A supplement"), true);
assert("retinol", f.mentionsRetinolRisk("I use retinol cream"), true);
assert("cod liver oil", f.mentionsRetinolRisk("I take cod liver oil"), true);
assert("NOT: vitamin A D E K", f.mentionsRetinolRisk("I take vitamins A D E K"), false);

section("Gate 11: Pregnancy + Limited Evidence");
assert("melatonin", f.mentionsPregnancyLimitedEvidence("I take melatonin"), true);
assert("ashwagandha", f.mentionsPregnancyLimitedEvidence("ashwagandha for stress"), true);
assert("kava", f.mentionsPregnancyLimitedEvidence("can I drink kava"), true);
assert("berberine", f.mentionsPregnancyLimitedEvidence("I take berberine"), true);
assert("echinacea", f.mentionsPregnancyLimitedEvidence("echinacea for cold"), true);
assert("NOT: vitamin D", f.mentionsPregnancyLimitedEvidence("vitamin D 5000 IU"), false);
assert("NOT: fish oil", f.mentionsPregnancyLimitedEvidence("fish oil daily"), false);

section("Gate 12: Isotretinoin + Vitamin A");
assert("Accutane + vitamin A", f.detectsIsotretinoinVitA("I'm on Accutane and take vitamin A 10000 IU"), true);
assert("isotretinoin + retinol", f.detectsIsotretinoinVitA("isotretinoin and retinol supplement"), true);
assert("Claravis + cod liver oil", f.detectsIsotretinoinVitA("Claravis and cod liver oil daily"), true);
assert("NOT: Accutane alone", f.detectsIsotretinoinVitA("I'm on Accutane"), false);
assert("NOT: vitamin A alone", f.detectsIsotretinoinVitA("I take vitamin A"), false);

section("Gate 13: Supplement Stacking");
assert("prenatal detected", f.mentionsPrenatalOrMulti("I take a prenatal"), true);
assert("multivitamin detected", f.mentionsPrenatalOrMulti("I take a multivitamin"), true);
assert("Centrum detected", f.mentionsPrenatalOrMulti("I take Centrum"), true);
assert("Ritual detected", f.mentionsPrenatalOrMulti("I'm on Ritual prenatal"), true);
assert("vitamin D = fat soluble", f.mentionsStandaloneFatSoluble("can I add vitamin D"), true);
assert("iron supplement", f.mentionsStandaloneFatSoluble("and an iron supplement"), true);
assert("NOT: vitamin C", f.mentionsStandaloneFatSoluble("I take extra vitamin C"), false);

section("Gate 14: Liver Toxicity");
assert("kava + alcohol", f.detectsLiverToxicityStack("I take kava and drink socially"), true);
assert("Tylenol + green tea extract", f.detectsLiverToxicityStack("Tylenol daily and green tea extract"), true);
assert("kava + Tylenol + beer", f.detectsLiverToxicityStack("kava, Tylenol, and I drink beer"), true);
assert("NOT: kava alone", f.detectsLiverToxicityStack("I take kava"), false);
assert("NOT: Tylenol alone", f.detectsLiverToxicityStack("I take Tylenol occasionally"), false);
assert("NOT: green tea drink + Tylenol", f.detectsLiverToxicityStack("I drink green tea and take Tylenol"), false);

section("Gate 15: Charcoal + Medication");
assert("charcoal + birth control", f.detectsCharcoalMed("activated charcoal and birth control"), true);
assert("charcoal detox + levothyroxine", f.detectsCharcoalMed("charcoal supplement for detox and levothyroxine"), true);
assert("charcoal + my medication", f.detectsCharcoalMed("charcoal daily with my medication"), true);
assert("NOT: charcoal alone", f.detectsCharcoalMed("I take activated charcoal for detox"), false);

section("Gate 16: CYP3A4 / Grapefruit");
assert("grapefruit + simvastatin", f.detectsGrapefruitInteraction("grapefruit juice and simvastatin"), true);
assert("grapefruit + quetiapine", f.detectsGrapefruitInteraction("grapefruit juice with quetiapine"), true);
assert("grapefruit + cholesterol med", f.detectsGrapefruitInteraction("grapefruit with my cholesterol med"), true);
assert("NOT: grapefruit + vitamin C", f.detectsGrapefruitInteraction("grapefruit and vitamin C"), false);
assert("NOT: grapefruit alone", f.detectsGrapefruitInteraction("I love grapefruit"), false);

section("Gate 17: SSRI Discontinuation");
assert("stopped SSRI + 5-HTP", f.detectsSSRIDiscontinuation("I stopped my SSRI and want 5-HTP instead"), true);
assert("quit Zoloft + st johns", f.detectsSSRIDiscontinuation("I quit Zoloft, should I try st johns wort instead"), true);
assert("weaning off Lexapro + 5-HTP", f.detectsSSRIDiscontinuation("weaning off Lexapro, can I replace with 5-HTP"), true);
assert("ran out of Prozac + substitute", f.detectsSSRIDiscontinuation("ran out of Prozac, is 5-HTP a good substitute"), true);
assert("don't want to take + switch ashwagandha", f.detectsSSRIDiscontinuation("I don't want to take my antidepressant anymore. Can I just switch to ashwagandha?"), true);
assert("want to stop + 5-HTP", f.detectsSSRIDiscontinuation("I want to stop my SSRI and try 5-HTP"), true);
assert("NOT: still taking SSRI + 5-HTP", f.detectsSSRIDiscontinuation("I take an SSRI and want to add 5-HTP"), false);
assert("NOT: stopped SSRI (no substitute)", f.detectsSSRIDiscontinuation("I stopped my SSRI"), false);

section("Gate 18: Dose Sanity");
assert("potassium + lisinopril", f.detectsPotassiumACEi("potassium supplement with lisinopril"), true);
assert("potassium + losartan", f.detectsPotassiumACEi("potassium citrate with losartan"), true);
assert("potassium + spironolactone", f.detectsPotassiumACEi("extra potassium with spironolactone"), true);
assert("NOT: potassium alone", f.detectsPotassiumACEi("can I take potassium"), false);
assert("iodine + hypothyroidism", f.detectsIodineThyroid("hypothyroidism and want to take iodine"), true);
assert("kelp + Hashimotos", f.detectsIodineThyroid("kelp supplement with Hashimotos"), true);
assert("iodine + levothyroxine", f.detectsIodineThyroid("iodine with levothyroxine"), true);
assert("NOT: iodine alone", f.detectsIodineThyroid("I want to try iodine"), false);
assert("niacin + atorvastatin", f.detectsNiacinStatin("niacin with atorvastatin"), true);
assert("vitamin B3 + statin", f.detectsNiacinStatin("vitamin B3 with my statin"), true);
assert("niacin + red yeast rice", f.detectsNiacinStatin("niacin and red yeast rice"), true);
assert("NOT: niacinamide + statin", f.detectsNiacinStatin("niacinamide with my statin"), false);

section("Gate 19: Medication Clarifier");
assert("blood thinner + natural supplement", f.needsMedicationClarifier("I take a blood thinner and a natural supplement for circulation. Is that fine?"), true);
assert("my meds + supplement", f.needsMedicationClarifier("can I take a supplement with my meds"), true);
assert("unknown brand + safe with", f.needsMedicationClarifier("Is Happy Hormone Booster Pro Max Ultra safe with birth control?"), true);
assert("yellow pill starts with S", f.needsMedicationClarifier("I take that yellow pill for anxiety starts with S and magnesium. Is that bad?"), true);
assert("something for energy", f.needsMedicationClarifier("I take Zoloft, fish oil, and something for energy. That's it."), true);
assert("caregiver + don't know meds", f.needsMedicationClarifier("My mom is 68 and on a lot of meds. I don't know all of them."), true);
assert("NOT: warfarin + turmeric (specific)", f.needsMedicationClarifier("can I take turmeric with warfarin"), false);
assert("NOT: 5-HTP + antidepressant (high risk)", f.needsMedicationClarifier("can I take 5-HTP with my antidepressant"), false);
assert("NOT: rhetorical why", f.needsMedicationClarifier("Why didn't my doctor tell me this about magnesium and thyroid meds?"), false);

section("Mineral Spacing");
assert("magnesium alone (short)", f.mentionsMineralSpacingTrigger("magnesium"), true);
assert("taking calcium 500mg", f.mentionsMineralSpacingTrigger("I'm taking calcium 500mg"), true);
assert("iron supplement", f.mentionsMineralSpacingTrigger("I take iron supplement daily"), true);
assert("NOT: calcium helps absorption (conceptual)", f.mentionsMineralSpacingTrigger("calcium helps with vitamin K absorption in general"), false);

section("Context Awareness (getConversationContext)");
const ctx1 = f.getConversationContext("can he add ginkgo", [
  { role: "user", content: "My dad takes warfarin and aspirin" },
  { role: "assistant", content: "Got it." },
]);
assert("warfarin from history in context", ctx1.includes("warfarin"), true);
assert("ginkgo from message in context", ctx1.includes("ginkgo"), true);

const ctx2 = f.getConversationContext("can I try st johns wort", [
  { role: "user", content: "I take sertraline 50mg" },
  { role: "assistant", content: "Got it." },
]);
assert("sertraline from history", ctx2.includes("sertraline"), true);
assert("st johns from message", ctx2.includes("st john"), true);

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — FULL ROUTING: 20 ORIGINAL STRESS-TEST SCENARIOS
// ═════════════════════════════════════════════════════════════════════════════

section("Original Stress Scenarios (routing)");
expectRoute("biohacker stack (serotonergic)", "I take sertraline 100mg, Adderall XR 20mg, magnesium glycinate, L-theanine, ashwagandha, rhodiola, fish oil, and occasionally 5-HTP for mood. Is this safe?", "system:serotonin-risk");
expectRoute("hashimotos + biotin → LLM", "I have Hashimotos and take levothyroxine. Can I take biotin 10000 mcg and ashwagandha?", "llm");
expectRoute("warfarin + turmeric + nattokinase", "Im on warfarin and want to start turmeric, ginger tea daily, and nattokinase", "system:blood-thinner-risk");
expectRoute("pregnant + melatonin + DHA", "Im 6 weeks pregnant and taking prenatals DHA vitamin D 5000 IU and melatonin 5mg nightly. Safe?", "system:pregnancy-limited");
expectRoute("pediatric ADHD → LLM", "My 4 year old has ADHD. Can I give omega-3 zinc magnesium and L-tyrosine?", "llm");
expectRoute("red yeast rice → LLM", "My cholesterol labs improved after I started red yeast rice. Is that safe long term?", "llm");
expectRoute("SJW + Prozac + symptoms", "I took St Johns Wort with my Prozac this morning and feel shaky and sweaty", "system:serotonin-urgent");
expectRoute("wellbutrin + vyvanse → LLM", "I take Wellbutrin and Vyvanse. Can I add phenylpiracetam and alpha-GPC for productivity?", "llm");
expectRoute("ginkgo + aspirin (history)", "can he add ginkgo and ginseng", "system:blood-thinner-risk", [
  { role: "user", content: "My dad takes metformin, lisinopril, atorvastatin, aspirin, and omeprazole" },
  { role: "assistant", content: "Got it." }
]);
expectRoute("timing conflict → LLM", "I take iron calcium magnesium zinc levothyroxine and coffee in the morning. Is that okay?", "llm");
expectRoute("Tylenol + alcohol + kava + GTE", "I take Tylenol daily, drink socially, and just started kava and green tea extract", "system:liver-toxicity");
expectRoute("vague blood thinner", "I take a blood thinner and a natural supplement for circulation. Is that fine?", "system:clarifier");
expectRoute("magnesium + heart weird", "I took magnesium and my heart feels weird", "system:symptom-triage");
expectRoute("Accutane + vitamin A", "Im on isotretinoin and take vitamin A 10000 IU. Is that okay?", "system:isotretinoin-vita");
expectRoute("charcoal + birth control", "I take birth control and started activated charcoal daily for detox. Problem?", "system:charcoal-med");
expectRoute("simvastatin + grapefruit", "I take simvastatin and drink grapefruit juice daily", "system:grapefruit-cyp3a4");
expectRoute("iodine + hypothyroid", "TikTok says iodine cures thyroid issues. I have hypothyroidism. Should I take 25mg iodine daily?", "system:iodine-thyroid");
expectRoute("PCOS metformin + berberine → LLM", "I have PCOS take metformin and spironolactone. Can I take berberine and inositol?", "llm");
expectRoute("stopped SSRI + 5-HTP", "I stopped my SSRI and now I feel brain zaps. Should I take 5-HTP instead?", "system:ssri-discontinuation");
expectRoute("potassium + lisinopril", "can I take potassium supplement with lisinopril", "system:potassium-acei");
expectRoute("pregnant + vitamin A", "Im pregnant, can I take vitamin A", "system:pregnancy-retinol");
expectRoute("prenatal + vitamin D → stacking", "can I take vitamin d with my prenatal", "system:stacking-risk");
expectRoute("niacin + statin", "is niacin safe with my atorvastatin", "system:niacin-statin");
expectRoute("5-HTP + SSRI (history)", "can I try st johns wort", "system:serotonin-risk", [
  { role: "user", content: "I take sertraline 50mg" },
  { role: "assistant", content: "Got it." }
]);
expectRoute("vitamin D 50k + fast heart", "I took 50000 iu vitamin d and my heart rate is so fast", "system:vitd-palpitations");

// ═════════════════════════════════════════════════════════════════════════════
// PART 3 — 20 UX DEVELOPER SCENARIOS
// ═════════════════════════════════════════════════════════════════════════════

section("UX Scenarios (routing)");
expectRoute("UX1: vague meds", "I take some antidepressant and ADHD med and a bunch of natural stuff from Amazon. Am I good?", "system:clarifier");
expectRoute("UX2: mild panic", "My heart feels weird after I took my supplements. Should I go to the ER?", "system:symptom-triage");
expectRoute("UX3: yellow pill", "I take that yellow pill for anxiety… starts with S? And magnesium. Is that bad?", "system:clarifier");
expectRoute("UX4: unknown brand", "Is Happy Hormone Booster Pro Max Ultra safe with birth control?", "system:clarifier");
expectRoute("UX5: berberine + metformin", "TikTok says berberine is natural Ozempic. I take metformin. Should I switch?", "llm");
expectRoute("UX6: chatty user", "Okay so like I take this, this, and this but not every day lol and sometimes I forget but mostly in the morning except when I work out.", "llm");
expectRoute("UX7: oversharing", "I'm depressed, stressed, gaining weight, can't sleep, hormones are crazy, I take everything honestly.", "llm");
expectRoute("UX8: caregiver elderly", "My mom is 68 and on a lot of meds. I don't know all of them. Can I just send you a picture?", "system:clarifier");
expectRoute("UX9: dose confusion", "I take 10,000 vitamin D daily. That's fine right? I saw someone take 50,000.", "llm");
expectRoute("UX10: Xanax + wine", "I take Xanax sometimes. Can I drink wine tonight?", "llm");
expectRoute("UX11: psilocybin + SSRI", "I microdose psilocybin and take SSRI. Safe?", "system:serotonin-risk");
expectRoute("UX12: biohacker stack", "I take NAD+, NMN, resveratrol, quercetin, metformin, rapamycin, and creatine. Rate my stack.", "llm");
expectRoute("UX13: am I dying", "I took magnesium and now I feel funny. Is this dangerous?", "system:symptom-triage");
expectRoute("UX14: child ADHD", "My 7-year-old won't focus. Can I give him what I take for ADHD?", "llm");
expectRoute("UX15: stop AD for ashwagandha", "I don't want to take my antidepressant anymore. Can I just switch to ashwagandha?", "system:ssri-discontinuation");
expectRoute("UX16: might be pregnant", "I might be pregnant. Is it okay that I took melatonin last night?", "system:pregnancy-limited");
expectRoute("UX17: trust question", "You're AI. How do I know you're right?", "llm");
expectRoute("UX18: partial stack", "I take Zoloft, fish oil, and something for energy. That's it.", "system:clarifier");
expectRoute("UX19: timing question", "When should I take all this stuff? Morning? Night? With food?", "llm");
expectRoute("UX20: anxiety spiral", "I googled and now I think everything I take is toxic.", "llm");

// ═════════════════════════════════════════════════════════════════════════════
// PART 4 — HARD EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

section("Hard Edge Cases (routing)");
expectRoute("ALL CAPS", "CAN I TAKE MAGNESIUM WITH ZOLOFT", "llm");
expectRoute("slang: blood thinner thingy", "I take a blood thinner thingy and want turmeric", "system:blood-thinner-risk");
expectRoute("misspelled: sertaline + 5-HTP", "I take sertaline and 5-HTP, is that ok?", "system:serotonin-risk");
expectRoute("misspelled: xanex", "can I drink alcohol with xanex", "llm");
expectRoute("mg vs mcg confusion", "I take 5000mg of vitamin D", "llm");
expectRoute("emoji only", "😵‍💫 after supplements", "llm");
expectRoute("angry tone", "Why didn't my doctor tell me this about magnesium and thyroid meds?", "llm");
expectRoute("cannabis + sertraline", "I smoke weed daily and take sertraline. Any interaction?", "llm");
expectRoute("exact dosage request", "How many mg of ashwagandha should I take exactly?", "llm");
expectRoute("fast answer only", "Quick: magnesium glycinate safe with lisinopril? Yes or no.", "llm");
expectRoute("ashwagandha safe (style 1)", "is ashwagandha safe", "llm");
expectRoute("ashwagandha safe (style 2)", "what about ashwagandha safety", "llm");
expectRoute("ashwagandha safe (style 3)", "ashwagandha — safe or not?", "llm");

// ═════════════════════════════════════════════════════════════════════════════
// PART 5 — CONTEXT-AWARE FOLLOW-UPS (multi-turn)
// ═════════════════════════════════════════════════════════════════════════════

section("Context-Aware Follow-ups");
expectRoute("chatty → names with rhodiola", "ok so its Zoloft, fish oil, and rhodiola", "system:serotonin-risk", [
  { role: "user", content: "Okay so like I take this, this, and this but not every day" },
  { role: "assistant", content: "I need the specific names of what you're taking." }
]);
expectRoute("caregiver → med list + ginkgo", "she takes metformin, lisinopril, aspirin, and wants to add ginkgo", "system:blood-thinner-risk", [
  { role: "user", content: "My mom is 68 and on a lot of meds" },
  { role: "assistant", content: "Which medications is she on?" }
]);
expectRoute("stop AD → then stopped + 5-HTP", "I stopped it last week. Can I use 5-HTP now?", "system:ssri-discontinuation", [
  { role: "user", content: "I don't want to take my antidepressant anymore" },
  { role: "assistant", content: "Which antidepressant and how long have you been on it?" }
]);
expectRoute("follow-up timing (plain)", "what about the timing", "llm", [
  { role: "user", content: "can I take magnesium glycinate" },
  { role: "assistant", content: "Yes, 200-400mg before bed." }
]);
expectRoute("follow-up lab result", "my result is 16 kinda low", "llm", [
  { role: "user", content: "I took 50000 iu vitamin d" },
  { role: "assistant", content: "That is a common loading dose." }
]);
expectRoute("sertraline history + st johns wort now", "can I try st johns wort", "system:serotonin-risk", [
  { role: "user", content: "I take sertraline 50mg" },
  { role: "assistant", content: "Got it." }
]);
expectRoute("warfarin history + turmeric now", "can I take turmeric capsules", "system:blood-thinner-risk", [
  { role: "user", content: "I take warfarin for blood clots" },
  { role: "assistant", content: "Got it. What else are you taking?" }
]);

// ═════════════════════════════════════════════════════════════════════════════
// PART 6 — FALSE POSITIVE GUARDS
// ═════════════════════════════════════════════════════════════════════════════

section("False Positive Guards");
// These should NOT trigger specific gates
expectRoute("weather → off-topic", "what is the weather today in New York", "system:off-topic");
expectRoute("politics → off-topic", "who is the president of the united states", "system:off-topic");
expectRoute("recipe → off-topic", "how do I make scrambled eggs", "system:off-topic");
expectRoute("math → off-topic", "what is 2+2", "system:off-topic");
expectRoute("just 'ok' → off-topic", "ok", "system:off-topic");
expectRoute("greeting → welcome, not LLM", "hi", "system:welcome");
expectRoute("thanks → thanks, not LLM", "thanks so much", "system:thanks");
expectRoute("goodbye → goodbye, not LLM", "bye take care", "system:goodbye");
// Make sure simple supplement questions don't trigger wrong gates
expectRoute("ashwagandha (simple) → LLM", "tell me about ashwagandha", "llm");
expectRoute("vitamin C (simple) → LLM", "should I take vitamin C for cold", "llm");
expectRoute("magnesium before bed → LLM", "is it better to take magnesium before bed", "llm");

// ═════════════════════════════════════════════════════════════════════════════
// PART 7 — GATE PRIORITY / OVERLAP
// ═════════════════════════════════════════════════════════════════════════════

section("Gate Priority / Overlap");
// Emergency always wins
expectRoute("chest pain → emergency (not symptom triage)", "I have severe chest pain after taking pre-workout", "system:emergency");
expectRoute("seizure → emergency", "my kid is having a seizure after vitamin", "system:emergency");
// SSRI discontinuation beats serotonergic risk
expectRoute("stopped SSRI + 5-HTP → discontinuation (not serotonin-risk)", "I stopped my SSRI and want to take 5-HTP instead", "system:ssri-discontinuation");
// Serotonergic urgent beats standard serotonergic
expectRoute("SJW + Prozac + shaky → urgent (not standard)", "I took St Johns Wort with Prozac and feel shaky and sweaty", "system:serotonin-urgent");
// Pregnancy retinol beats limited evidence
expectRoute("pregnant + vitamin A → retinol (not limited)", "I'm pregnant, can I take vitamin A", "system:pregnancy-retinol");
// Pregnancy limited evidence for non-retinol
expectRoute("pregnant + melatonin → limited (not retinol)", "I'm pregnant, can I take melatonin", "system:pregnancy-limited");
// Blood thinner risk (gate 7) fires before symptom triage (gate 8)
expectRoute("warfarin + ginger + dizzy → blood thinner (not symptom)", "I take warfarin and ginger tea and feel dizzy", "system:blood-thinner-risk");
// Isotretinoin + vit A fires on context
expectRoute("Accutane + vitamin A → isotretinoin gate", "Im on isotretinoin and take vitamin A 10000 IU. Is that okay?", "system:isotretinoin-vita");

// ═════════════════════════════════════════════════════════════════════════════
// PART 8 — ADDITIONAL REAL-WORLD PHRASINGS
// ═════════════════════════════════════════════════════════════════════════════

section("Additional Real-World Phrasings");
expectRoute("quetiapine + grapefruit", "I take quetiapine, buspirone, and drink grapefruit juice", "system:grapefruit-cyp3a4");
expectRoute("niacin + statin simple", "is niacin safe with my atorvastatin", "system:niacin-statin");
expectRoute("5-htp + ssri (simple)", "can I take 5-HTP with my antidepressant", "system:serotonin-risk");
expectRoute("unknown brand (NatureBoost)", "I take NatureBoost Hormone Balance Support. Is it safe with birth control?", "system:clarifier");
expectRoute("prenatal + extra D3", "can I take vitamin d with my prenatal", "system:stacking-risk");
expectRoute("kelp + thyroid (seaweed)", "I take sea kelp supplement for energy. I have Hashimotos.", "system:iodine-thyroid");
expectRoute("potassium + ACE inhibitor", "can I take potassium supplement with lisinopril", "system:potassium-acei");

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(60));
if (fail === 0) {
  console.log(`  ALL TESTS PASSED: ${pass}/${total}`);
} else {
  console.log(`  ${pass}/${total} passed, ${fail} FAILED`);
  console.log("");
  console.log("  Failed tests:");
  for (const f of failures) console.log(`    - ${f}`);
}
console.log("═".repeat(60) + "\n");

if (fail > 0) process.exit(1);
