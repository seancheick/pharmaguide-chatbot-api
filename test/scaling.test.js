/**
 * Scaling upgrades tests — gate DSL, severity resolver, session memory.
 * Run: node test/scaling.test.js
 */

const { tryDSLGate, isDSLRoute, getCompiledGates, validateGateDefinitions, renderDSLReply } = require("../src/gates/gateEngine");
const { scoreRisks, resolveSeverity } = require("../src/core/riskScore");
const { validateResponse } = require("../src/postprocess/safetyValidator");
const { createSessionMemory, detectGoal, updateSessionMemory, shouldSkipClarifier, getMemorySummary } = require("../src/infra/sessionMemory");

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
// SECTION 1: Gate DSL (~20 tests)
// ═══════════════════════════════════════════════════════════════
section("Gate DSL — validation");

assert("gate definitions valid", validateGateDefinitions().valid);
assert("6 DSL gates compiled", getCompiledGates().length === 6);

section("Gate DSL — route matching");

assert("potassium-acei matches", tryDSLGate("system:potassium-acei").matched);
assert("iodine-thyroid matches", tryDSLGate("system:iodine-thyroid").matched);
assert("niacin-statin matches", tryDSLGate("system:niacin-statin").matched);
assert("nsaid-anticoagulant matches", tryDSLGate("system:nsaid-anticoagulant").matched);
assert("triple-whammy matches", tryDSLGate("system:triple-whammy").matched);
assert("lithium-nsaid matches", tryDSLGate("system:lithium-nsaid").matched);

assert("code gate serotonin-risk does NOT match DSL", !tryDSLGate("system:serotonin-risk").matched);
assert("code gate blood-thinner-risk does NOT match DSL", !tryDSLGate("system:blood-thinner-risk").matched);
assert("llm does NOT match DSL", !tryDSLGate("llm").matched);

section("Gate DSL — isDSLRoute");

assert("isDSLRoute true for DSL gate", isDSLRoute("system:potassium-acei"));
assert("isDSLRoute false for code gate", !isDSLRoute("system:serotonin-risk"));
assert("isDSLRoute false for llm", !isDSLRoute("llm"));

section("Gate DSL — reply rendering");

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
  const reply = result.reply;

  // Every DSL reply should have opening, bullets, and question
  assert(`${route}: has opening`, reply.includes("**"));
  assert(`${route}: has bullet points`, reply.includes("•"));
  assert(`${route}: passes validator`, validateResponse(reply, route, emptyEntities, null).safe);
}

section("Gate DSL — gate metadata");

const gates = getCompiledGates();
for (const gate of gates) {
  assert(`gate ${gate.id}: has domain`, !!gate.domain);
  assert(`gate ${gate.id}: has severity`, gate.severity === "red" || gate.severity === "yellow");
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Severity Resolver (~25 tests)
// ═══════════════════════════════════════════════════════════════
section("Severity Resolver — base scoring");

assert("all zeros → green", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  return resolveSeverity(scores, emptyEntities, null).severity === "green";
})());

assert("score 1 → yellow", (() => {
  const scores = { serotonin_risk: 1, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  return resolveSeverity(scores, emptyEntities, null).severity === "yellow";
})());

assert("score 2 → red", (() => {
  const scores = { serotonin_risk: 2, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const result = resolveSeverity(scores, emptyEntities, null);
  return result.severity === "red" && result.top_domain === "serotonin";
})());

assert("emergency → red + emergency domain", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: true };
  const result = resolveSeverity(scores, emptyEntities, null);
  return result.severity === "red" && result.top_domain === "emergency";
})());

section("Severity Resolver — escalation: symptoms + serotonergic");

assert("serotonin 1 + symptoms → red", (() => {
  const scores = { serotonin_risk: 1, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { ...emptyEntities, symptoms: ["serotonergic_symptoms"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "red" && result.reason_codes.includes("serotonin_symptoms_active");
})());

assert("serotonin 0 + symptoms → no escalation", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { ...emptyEntities, symptoms: ["serotonergic_symptoms"] };
  return resolveSeverity(scores, entities, null).severity === "green";
})());

section("Severity Resolver — escalation: pregnancy + teratogen");

assert("pregnancy + teratogen 1 → red", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 1, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { ...emptyEntities, populations: ["pregnancy"] };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "red" && result.reason_codes.includes("pregnancy_teratogen");
})());

assert("pregnancy + teratogen 2 → red (already red, no double escalation)", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 2, renal_clearance_risk: 0, emergency_risk: false };
  const entities = { ...emptyEntities, populations: ["pregnancy"] };
  return resolveSeverity(scores, entities, null).severity === "red";
})());

section("Severity Resolver — escalation: polypharmacy + elderly");

assert("polypharmacy + elderly bumps green → yellow", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = {
    meds: ["a", "b", "c"],
    supplements: ["d", "e"],
    populations: ["elderly"],
    symptoms: [], intents: [], unknowns: [],
  };
  const result = resolveSeverity(scores, entities, null);
  return result.severity === "yellow" && result.escalations.includes("polypharmacy_elderly_bump");
})());

assert("polypharmacy + elderly bumps yellow → red", (() => {
  const scores = { serotonin_risk: 1, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = {
    meds: ["a", "b", "c"],
    supplements: ["d", "e"],
    populations: ["elderly"],
    symptoms: [], intents: [], unknowns: [],
  };
  return resolveSeverity(scores, entities, null).severity === "red";
})());

assert("polypharmacy without elderly: no bump", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const entities = {
    meds: ["a", "b", "c"],
    supplements: ["d", "e"],
    populations: [],
    symptoms: [], intents: [], unknowns: [],
  };
  return resolveSeverity(scores, entities, null).severity === "green";
})());

section("Severity Resolver — escalation: validator violations");

assert("validator violations → force_degraded", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const validation = { safe: false, violations: [{ rule: "no_diagnosing" }] };
  const result = resolveSeverity(scores, emptyEntities, validation);
  return result.force_degraded === true && result.escalations.includes("validator_forced_degraded");
})());

assert("safe validation → no force_degraded", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  return resolveSeverity(scores, emptyEntities, { safe: true, violations: [] }).force_degraded === false;
})());

section("Severity Resolver — top_domain tracking");

assert("highest score determines top_domain", (() => {
  const scores = { serotonin_risk: 1, bleeding_risk: 2, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  return resolveSeverity(scores, emptyEntities, null).top_domain === "bleeding";
})());

assert("reason_codes accumulate", (() => {
  const scores = { serotonin_risk: 2, bleeding_risk: 2, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 0, renal_clearance_risk: 0, emergency_risk: false };
  const result = resolveSeverity(scores, emptyEntities, null);
  return result.reason_codes.includes("serotonin_score_2") && result.reason_codes.includes("bleeding_score_2");
})());

section("Severity Resolver — combined escalations");

assert("pregnancy + teratogen + polypharmacy + elderly", (() => {
  const scores = { serotonin_risk: 0, bleeding_risk: 0, stimulant_risk: 0, hepatotoxic_risk: 0, absorption_risk: 0, pregnancy_teratogen_risk: 1, renal_clearance_risk: 0, emergency_risk: false };
  const entities = {
    meds: ["a", "b", "c"],
    supplements: ["d", "e"],
    populations: ["pregnancy", "elderly"],
    symptoms: [], intents: [], unknowns: [],
  };
  const result = resolveSeverity(scores, entities, null);
  // pregnancy+teratogen → red, polypharmacy+elderly also fires but already red
  return result.severity === "red";
})());

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Session Memory (~15 tests)
// ═══════════════════════════════════════════════════════════════
section("Session Memory — creation");

assert("createSessionMemory returns clean state", (() => {
  const mem = createSessionMemory();
  return mem.populations.length === 0 && mem.goal_category === null && mem.turn_count === 0;
})());

section("Session Memory — goal detection");

assert("sleep goal detected", detectGoal("I can't sleep at night") === "sleep");
assert("energy goal detected", detectGoal("I'm always tired and fatigued") === "energy");
assert("anxiety goal detected", detectGoal("I feel anxious all the time") === "anxiety");
assert("pain goal detected", detectGoal("I have joint pain") === "pain");
assert("mood goal detected", detectGoal("I've been feeling depressed") === "mood");
assert("focus goal detected", detectGoal("I need help with concentration") === "focus");
assert("immune goal detected", detectGoal("I keep getting sick") === "immune");
assert("gut goal detected", detectGoal("I have stomach bloating issues") === "gut");
assert("no goal for generic message", detectGoal("Can I take magnesium?") === null);

section("Session Memory — updateSessionMemory");

assert("populations persist across turns", (() => {
  const mem = createSessionMemory();
  const entities1 = { ...emptyEntities, populations: ["pregnancy"] };
  updateSessionMemory(mem, entities1, "I'm pregnant");
  const entities2 = { ...emptyEntities, populations: ["renal"] };
  updateSessionMemory(mem, entities2, "I have kidney disease");
  return mem.populations.includes("pregnancy") && mem.populations.includes("renal") && mem.populations.length === 2;
})());

assert("populations deduped", (() => {
  const mem = createSessionMemory();
  const entities = { ...emptyEntities, populations: ["pregnancy"] };
  updateSessionMemory(mem, entities, "pregnant");
  updateSessionMemory(mem, entities, "still pregnant");
  return mem.populations.length === 1;
})());

assert("goal detected from message", (() => {
  const mem = createSessionMemory();
  updateSessionMemory(mem, emptyEntities, "I need help with sleep");
  return mem.goal_category === "sleep";
})());

assert("goal not overwritten once set", (() => {
  const mem = createSessionMemory();
  updateSessionMemory(mem, emptyEntities, "I need help with sleep");
  updateSessionMemory(mem, emptyEntities, "I also have anxiety");
  return mem.goal_category === "sleep";
})());

assert("turn_count increments", (() => {
  const mem = createSessionMemory();
  updateSessionMemory(mem, emptyEntities, "turn 1");
  updateSessionMemory(mem, emptyEntities, "turn 2");
  updateSessionMemory(mem, emptyEntities, "turn 3");
  return mem.turn_count === 3;
})());

section("Session Memory — clarifier skipping");

assert("skip reason_for_use if goal known", (() => {
  const mem = createSessionMemory();
  mem.goal_category = "sleep";
  return shouldSkipClarifier(mem, "reason_for_use").skip;
})());

assert("don't skip reason_for_use if no goal", (() => {
  const mem = createSessionMemory();
  return !shouldSkipClarifier(mem, "reason_for_use").skip;
})());

assert("don't skip unrelated fields", (() => {
  const mem = createSessionMemory();
  mem.goal_category = "sleep";
  return !shouldSkipClarifier(mem, "medication_name").skip;
})());

section("Session Memory — summary (no PHI)");

assert("getMemorySummary returns expected shape", (() => {
  const mem = createSessionMemory();
  updateSessionMemory(mem, { ...emptyEntities, populations: ["pregnancy"] }, "I need sleep help and I'm pregnant");
  const summary = getMemorySummary(mem);
  return summary.populations.includes("pregnancy") &&
    summary.goal_category === "sleep" &&
    summary.turn_count === 1 &&
    summary.has_populations &&
    summary.has_goal;
})());

// ═══════════════════════════════════════════════════════════════
// Final tally
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`Scaling tests: ${pass}/${total} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
console.log("All scaling tests passed!");
