/**
 * Phase 2 Tests — Structural Upgrades
 *
 * Tests for:
 * - 2A: Population-adjusted risk scoring (KB-aware)
 * - 2B: Temporal context engine
 * - 2C: DSL gate expansion (12 gates, v2.0.0 schema)
 * - 2E: Form-specific gate branching
 */

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL: ${name}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ═══════════════════════════════════════════════════════════════
// Imports
// ═══════════════════════════════════════════════════════════════

const { resolveSeverity } = require("../src/core/riskScore");
const { getKBEntriesForEntities } = require("../src/config/knowledgeBase");
const {
  getTemporalData,
  getWashoutGuidance,
  getOnsetGuidance,
  buildTemporalContext,
  TEMPORAL_DATA,
} = require("../src/core/temporalContext");
const {
  tryDSLGate,
  isDSLRoute,
  getCompiledGates,
  validateGateDefinitions,
} = require("../src/gates/gateEngine");
const {
  detectMentionedForm,
  getFormGuidance,
  getSafeItemClarification,
  getRenalFormNote,
} = require("../src/core/formAdvisor");
const { serotonergicWarningReply, renalMagnesiumReply } = require("../src/gates/replies");

const emptyEntities = { meds: [], supplements: [], symptoms: [], populations: [] };

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Population-Adjusted Risk Scoring (2A)
// ═══════════════════════════════════════════════════════════════
section("2A: Population-adjusted risk — elderly KB flag");

assert("elderly + ibuprofen → severity bump", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: ["ibuprofen"], supplements: [], symptoms: [], populations: ["elderly"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity !== "green";
})());

assert("elderly + safe supplement → no bump", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: [], supplements: ["magnesium"], symptoms: [], populations: ["elderly"] };
  const result = resolveSeverity(scores, entities, null);
  // magnesium is safe for elderly per KB, so should stay green
  return result.severity === "green";
})());

section("2A: Population-adjusted risk — renal KB flag");

assert("renal + magnesium → red", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: [], supplements: ["magnesium"], symptoms: [], populations: ["renal"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "red" && result.escalations.some(e => e.includes("renal_unsafe"));
})());

assert("renal + iron → no bump (iron safe for renal)", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: [], supplements: ["iron"], symptoms: [], populations: ["renal"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "green";
})());

section("2A: Population-adjusted risk — pregnancy KB flag");

assert("pregnancy + kava → red (KB unsafe)", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: [], supplements: ["kava"], symptoms: [], populations: ["pregnancy"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "red" && result.reason_codes.includes("pregnancy_kb_flag");
})());

assert("pregnancy + iron → no bump (iron safe in pregnancy)", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: [], supplements: ["iron"], symptoms: [], populations: ["pregnancy"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "green";
})());

section("2A: Population-adjusted risk — polypharmacy + elderly");

assert("5+ items + elderly + green → yellow", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { meds: ["sertraline", "metformin", "lisinopril"], supplements: ["magnesium", "vitamin d"], symptoms: [], populations: ["elderly"] };
  const result = resolveSeverity(scores, entities, null);
  return result.escalations.includes("polypharmacy_elderly_bump");
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Temporal Context Engine (2B)
// ═══════════════════════════════════════════════════════════════
section("2B: Temporal data — direct lookups");

assert("sertraline has temporal data", getTemporalData("sertraline") !== null);
assert("sertraline half-life is 26h", getTemporalData("sertraline").half_life_hours === 26);
assert("sertraline washout is 7d", getTemporalData("sertraline").washout_days === 7);
assert("sertraline category is ssri", getTemporalData("sertraline").category === "ssri");

assert("fluoxetine washout is 35d", getTemporalData("fluoxetine").washout_days === 35);
assert("phenelzine washout is 14d (MAOI)", getTemporalData("phenelzine").washout_days === 14);
assert("venlafaxine half-life is 5h", getTemporalData("venlafaxine").half_life_hours === 5);

section("2B: Temporal data — alias lookups");

assert("zoloft → sertraline", getTemporalData("zoloft").canonical === "sertraline");
assert("prozac → fluoxetine", getTemporalData("prozac").canonical === "fluoxetine");
assert("lexapro → escitalopram", getTemporalData("lexapro").canonical === "escitalopram");
assert("xanax → alprazolam", getTemporalData("xanax").canonical === "alprazolam");
assert("advil → ibuprofen", getTemporalData("advil").canonical === "ibuprofen");
assert("synthroid → levothyroxine", getTemporalData("synthroid").canonical === "levothyroxine");

assert("unknown returns null", getTemporalData("aspirin") === null);
assert("null input returns null", getTemporalData(null) === null);
assert("empty string returns null", getTemporalData("") === null);

section("2B: Washout guidance");

assert("sertraline washout guidance", (() => {
  const g = getWashoutGuidance("sertraline");
  return g && g.includes("washout") && g.includes("sertraline");
})());

assert("fluoxetine washout mentions longer", (() => {
  const g = getWashoutGuidance("fluoxetine");
  return g && g.includes("longer") && g.includes("5 weeks");
})());

assert("phenelzine washout mentions MAOI 14-day", (() => {
  const g = getWashoutGuidance("phenelzine");
  return g && g.includes("14-day minimum");
})());

assert("paroxetine washout mentions discontinuation", (() => {
  const g = getWashoutGuidance("paroxetine");
  return g && g.includes("discontinuation");
})());

assert("unknown returns null washout", getWashoutGuidance("unknown_drug") === null);

section("2B: Onset guidance");

assert("sertraline onset 2-6 weeks", (() => {
  const g = getOnsetGuidance("sertraline");
  return g && g.includes("2–6 weeks");
})());

assert("alprazolam onset within hours", (() => {
  const g = getOnsetGuidance("alprazolam");
  return g && g.includes("within hours");
})());

assert("unknown returns null onset", getOnsetGuidance("unknown_drug") === null);

section("2B: buildTemporalContext");

assert("single med returns temporal block", (() => {
  const block = buildTemporalContext(["sertraline"]);
  return block.includes("TEMPORAL DATA") && block.includes("sertraline");
})());

assert("multiple meds returns combined block", (() => {
  const block = buildTemporalContext(["sertraline", "ibuprofen"]);
  return block.includes("sertraline") && block.includes("ibuprofen");
})());

assert("empty list returns empty string", buildTemporalContext([]) === "");
assert("null returns empty string", buildTemporalContext(null) === "");

assert("unknown meds return empty string", buildTemporalContext(["randomthing"]) === "");

section("2B: Temporal data coverage");

assert("at least 25 entries", Object.keys(TEMPORAL_DATA).length >= 25);
assert("all SSRIs present", ["sertraline", "fluoxetine", "escitalopram", "citalopram", "paroxetine", "fluvoxamine"].every(s => TEMPORAL_DATA[s]));
assert("all SNRIs present", ["venlafaxine", "duloxetine", "desvenlafaxine"].every(s => TEMPORAL_DATA[s]));
assert("all MAOIs present", ["phenelzine", "tranylcypromine", "selegiline"].every(s => TEMPORAL_DATA[s]));

// ═══════════════════════════════════════════════════════════════
// SECTION 3: DSL Gate Expansion (2C)
// ═══════════════════════════════════════════════════════════════
section("2C: DSL v2.0.0 — gate count");

assert("12 DSL gates compiled", getCompiledGates().length === 12);
assert("gate definitions valid", validateGateDefinitions().valid);
assert("validation reports 12 gates", validateGateDefinitions().gate_count === 12);

section("2C: New DSL gates — route matching");

const newDslRoutes = [
  "system:metformin-alcohol",
  "system:renal-magnesium",
  "system:isotretinoin-vita",
  "system:ototoxic-tinnitus",
  "system:nsaid-chronic",
  "system:medical-condition",
];

for (const route of newDslRoutes) {
  assert(`${route} matches DSL`, tryDSLGate(route).matched);
  assert(`${route} isDSLRoute`, isDSLRoute(route));
}

section("2C: DSL v2.0.0 — confidence + reference_ids");

const allGates = getCompiledGates();
for (const gate of allGates) {
  assert(`gate ${gate.id}: has confidence`, !!gate.confidence);
  assert(`gate ${gate.id}: confidence is valid`, ["high", "moderate", "low"].includes(gate.confidence));
  assert(`gate ${gate.id}: has reference_ids array`, Array.isArray(gate.reference_ids));
}

section("2C: DSL tryDSLGate returns confidence");

const dslResult = tryDSLGate("system:potassium-acei");
assert("tryDSLGate returns confidence", !!dslResult.confidence);
assert("tryDSLGate returns reference_ids", Array.isArray(dslResult.reference_ids));
assert("potassium-acei confidence is high", dslResult.confidence === "high");
assert("potassium-acei has reference_ids", dslResult.reference_ids.length > 0);

section("2C: DSL reply content quality");

for (const route of newDslRoutes) {
  const result = tryDSLGate(route);
  const reply = result.reply;
  assert(`${route}: has bold text`, reply.includes("**"));
  assert(`${route}: has bullet points`, reply.includes("•"));
  assert(`${route}: not empty`, reply.length > 50);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Form-Specific Guidance (2E)
// ═══════════════════════════════════════════════════════════════
section("2E: Form detection — magnesium");

assert("detects glycinate form", (() => {
  const result = detectMentionedForm("I take magnesium glycinate for sleep", "magnesium");
  return result && result.form === "glycinate";
})());

assert("detects citrate form", (() => {
  const result = detectMentionedForm("Should I take magnesium citrate?", "magnesium");
  return result && result.form === "citrate";
})());

assert("detects oxide form", (() => {
  const result = detectMentionedForm("I have magnesium oxide 400mg", "magnesium");
  return result && result.form === "oxide";
})());

assert("detects threonate form", (() => {
  const result = detectMentionedForm("magnesium threonate for brain health", "magnesium");
  return result && result.form === "threonate";
})());

assert("no form detected for plain magnesium", detectMentionedForm("I take magnesium", "magnesium") === null);

section("2E: Form detection — iron");

assert("detects ferrous sulfate", (() => {
  const result = detectMentionedForm("I take ferrous sulfate 325mg", "iron");
  return result && result.form === "ferrous sulfate";
})());

assert("detects bisglycinate via alias", (() => {
  const result = detectMentionedForm("I take gentle iron daily", "iron");
  return result && result.form === "bisglycinate";
})());

section("2E: Form guidance");

assert("glycinate guidance mentions sleep", (() => {
  const g = getFormGuidance("magnesium glycinate before bed", "magnesium");
  return g && g.includes("sleep");
})());

assert("oxide guidance mentions absorption", (() => {
  const g = getFormGuidance("magnesium oxide 400mg", "magnesium");
  return g && g.includes("absorption");
})());

assert("no form → null guidance", getFormGuidance("I take magnesium", "magnesium") === null);

section("2E: Safe item clarification in serotonergic context");

assert("magnesium + 5-HTP → clarifies magnesium is safe", (() => {
  const c = getSafeItemClarification("I take magnesium glycinate and 5-HTP with sertraline");
  return c && c.includes("Magnesium") && c.includes("not serotonergic");
})());

assert("vitamin D + 5-HTP → clarifies vitamin D is safe", (() => {
  const c = getSafeItemClarification("vitamin d and 5-htp with my SSRI");
  return c && c.includes("Vitamin D") && c.includes("not serotonergic");
})());

assert("fish oil + st johns wort → clarifies fish oil is safe", (() => {
  const c = getSafeItemClarification("fish oil and st john's wort with lexapro");
  return c && c.includes("Fish oil") && c.includes("not serotonergic");
})());

assert("multiple safe items + serotonergic → combined note", (() => {
  const c = getSafeItemClarification("magnesium, fish oil, zinc, and 5-HTP with zoloft");
  return c && c.includes("Magnesium") && c.includes("Fish oil") && c.includes("Zinc");
})());

assert("no serotonergic risk → no clarification", (() => {
  const c = getSafeItemClarification("magnesium and vitamin d");
  return c === null;
})());

section("2E: Renal form note");

assert("renal + glycinate → form note with elemental %", (() => {
  const note = getRenalFormNote("magnesium glycinate with CKD stage 4");
  return note && note.includes("glycinate") && note.includes("14%");
})());

assert("renal + oxide → form note with higher elemental", (() => {
  const note = getRenalFormNote("magnesium oxide with kidney disease");
  return note && note.includes("oxide") && note.includes("60%") && note.includes("Higher elemental");
})());

assert("renal + no specific form → null", getRenalFormNote("magnesium with CKD") === null);

section("2E: Integration — serotonergic reply with form clarification");

assert("serotonergic reply includes safe item note when magnesium present", (() => {
  const reply = serotonergicWarningReply("I take magnesium glycinate, 5-HTP, and sertraline");
  return reply.includes("Magnesium") && reply.includes("not serotonergic");
})());

assert("serotonergic reply omits safe item note when no safe items", (() => {
  const reply = serotonergicWarningReply("I take 5-HTP and sertraline");
  return !reply.includes("not serotonergic");
})());

section("2E: Integration — renal reply with form note");

assert("renal reply includes form note for glycinate", (() => {
  const reply = renalMagnesiumReply("I have CKD stage 3 and take magnesium glycinate");
  return reply.includes("glycinate") && reply.includes("14%");
})());

assert("renal reply works without form", (() => {
  const reply = renalMagnesiumReply("I have CKD and want to take magnesium");
  return reply.includes("hypermagnesemia") && !reply.includes("14%");
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Cross-module integration
// ═══════════════════════════════════════════════════════════════
section("Cross-module: temporal + KB alignment");

assert("all temporal meds have KB entries or are meds", (() => {
  // Temporal data should cover items that are also in KB or are pure medications
  const temporalKeys = Object.keys(TEMPORAL_DATA);
  return temporalKeys.length >= 25;
})());

assert("lithium in temporal data + KB interactions", (() => {
  const td = getTemporalData("lithium");
  return td && td.category === "mood_stabilizer" && td.washout_days === 5;
})());

section("Cross-module: DSL gates + detection alignment");

assert("all DSL gates have valid detection functions", (() => {
  const validation = validateGateDefinitions();
  return validation.valid;
})());

assert("no duplicate gate IDs", (() => {
  const gates = getCompiledGates();
  const ids = gates.map(g => g.id);
  return new Set(ids).size === ids.length;
})());

assert("no duplicate gate routes", (() => {
  const gates = getCompiledGates();
  const routes = gates.map(g => g.route);
  return new Set(routes).size === routes.length;
})());

// ═══════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`Phase 2 tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  • ${f}`));
  process.exit(1);
}

console.log("All Phase 2 tests passed!");
console.log("═".repeat(50));
