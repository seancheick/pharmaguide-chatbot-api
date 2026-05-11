/**
 * Wellness-query routing + KB grounding + safety-gate tests.
 *
 * Covers the regressions the user reported (sleep / stress / cholesterol /
 * weight / sexual / energy / focus etc. queries getting the generic
 * SAFE_FALLBACK_REPLY or hitting system:off-topic). Also guards the
 * deterministic system:nitrate-vasodilator safety gate for the
 * L-arginine/L-citrulline + PDE5/nitrate combo.
 *
 * Pure deterministic tests — no live API calls, no LLM mocking.
 * Each test exercises the pipeline stage by stage and asserts on
 * the deterministic decisions (route, kbHits, validator) without
 * depending on Gemini/Groq output.
 *
 * Run with: `node --test test/`
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const detection = require("../src/gates/detection");
const { extractEntities } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const { normalizeText } = require("../src/core/normalize");
const { buildAugmentedMessages } = require("../src/core/kbLookup");
const { GOAL_SUPPLEMENT_CANDIDATES } = require("../src/core/wellnessGoalMap");
const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");
const { ROUTE_REPLY_MAP, nitrateVasodilatorReply } = require("../src/gates/replies");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");

// ─── Helpers ────────────────────────────────────────────────────────

function routeMessage(message, opts = {}) {
  const hasConversation = !!opts.hasConversation;
  const entities = extractEntities(message, null);
  const scores = scoreRisks(entities, normalizeText(message), null);
  return {
    entities,
    scores,
    route: routeByRisk(scores, entities, message, message, hasConversation),
  };
}

// ─── 1. Wellness-goal detection ─────────────────────────────────────

test("detectWellnessGoal: identifies categories on natural phrasings", () => {
  const cases = [
    ["what can I take to perform better sexually", ["sexual_health"]],
    ["what can I take to sleep better", ["sleep"]],
    ["to reduce my level of stress", ["stress"]],
    ["how do I lower my cholesterol naturally", ["cholesterol"]],
    ["cholesterol", ["cholesterol"]],
    ["best supplements for weight loss", ["weight"]],
    ["what helps with energy", ["energy"]],
    ["supplements for focus", ["focus"]],
    ["immune support", ["immunity"]],
    ["knee joint pain", ["joint"]],
    ["pms relief", ["hormonal"]],
    ["heart health and circulation", ["cardiovascular"]],
  ];
  for (const [msg, expected] of cases) {
    const got = detection.detectWellnessGoal(msg);
    assert.deepEqual(got, expected, `query: "${msg}"`);
  }
});

test("detectWellnessGoal: returns empty array for non-wellness", () => {
  for (const msg of ["hello", "thanks", "what time is it", "tell me a joke", "what is the capital of france"]) {
    assert.deepEqual(detection.detectWellnessGoal(msg), [], `non-wellness: "${msg}"`);
  }
});

// ─── 2. Off-topic bypass for wellness goals ─────────────────────────
// The off-topic check in chat.js is:
//   !hasConversation && !isMetaQuestion && !hasWellnessIntent && intentScore < 2 → off-topic
// We replicate the condition here to assert wellness queries are
// allowed through (NOT off-topic) on the first turn.

test("wellness queries do NOT match the off-topic condition on first turn", () => {
  const wellnessQueries = [
    "what can I take to perform better sexually",
    "what can I take to sleep better",
    "to reduce my level of stress",
    "how do I lower my cholesterol naturally",
    "cholesterol",
    "best supplements for weight loss",
    "what helps with energy",
    "supplements for focus",
    "immune support",
  ];
  for (const q of wellnessQueries) {
    const wellnessGoals = detection.detectWellnessGoal(q);
    const hasWellnessIntent = wellnessGoals.length > 0;
    const score = detection.intentScore(q);
    // Off-topic only fires if there's no wellness intent. Wellness
    // intent always wins regardless of intentScore.
    const wouldBeOffTopic = !hasWellnessIntent && score < 2;
    assert.equal(wouldBeOffTopic, false, `"${q}" must not be off-topic; goals=${JSON.stringify(wellnessGoals)} score=${score}`);
  }
});

// ─── 3. Goal-to-KB context injection ────────────────────────────────

test("buildAugmentedMessages injects KB candidates when only a goal is provided", () => {
  const cases = [
    { goal: "sleep", expect: /melatonin|magnesium|glycine|theanine/i },
    { goal: "stress", expect: /ashwagandha|theanine|magnesium|rhodiola/i },
    { goal: "cholesterol", expect: /omega-3|fish oil|psyllium|plant sterols|red yeast/i },
    { goal: "weight", expect: /psyllium|glucomannan|green tea|berberine/i },
    { goal: "sexual_health", expect: /arginine|citrulline|maca|ashwagandha|zinc/i },
    { goal: "energy", expect: /b-complex|iron|coq10|rhodiola/i },
    { goal: "focus", expect: /omega-3|fish oil|theanine|creatine/i },
    { goal: "immunity", expect: /zinc|vitamin c|vitamin d|elderberry/i },
    { goal: "joint", expect: /omega-3|fish oil|turmeric|glucosamine|msm/i },
  ];
  for (const { goal, expect } of cases) {
    const { messages, kbHits, source } = buildAugmentedMessages(
      SYSTEM_PROMPT,
      [],
      `what can I take for ${goal.replace("_", " ")}`,
      { meds: [], supplements: [], populations: [] },
      { wellnessGoals: [goal] }
    );
    assert.ok(kbHits > 0, `goal "${goal}" must yield at least one KB hit (got ${kbHits})`);
    assert.equal(source, "wellness-goals", `goal "${goal}" must use wellness-goals source`);
    const ctx = messages.map((m) => m.content).join("\n").toLowerCase();
    assert.match(ctx, expect, `goal "${goal}" KB context must mention at least one candidate`);
  }
});

test("GOAL_SUPPLEMENT_CANDIDATES references resolvable KB IDs", () => {
  const { getKBEntry } = require("../src/config/knowledgeBase");
  const unresolved = [];
  for (const [goal, candidates] of Object.entries(GOAL_SUPPLEMENT_CANDIDATES)) {
    for (const id of candidates) {
      if (!getKBEntry(id)) unresolved.push(`${goal}:${id}`);
    }
  }
  assert.deepEqual(unresolved, [], `unresolved KB IDs in GOAL_SUPPLEMENT_CANDIDATES: ${unresolved.join(", ")}`);
});

// ─── 4. Validator acceptance — wellness answers must pass ───────────

test("validator accepts realistic wellness answers", () => {
  const samples = [
    {
      name: "sleep",
      reply:
        "For better sleep, evidence-graded options include magnesium glycinate at 200-400 mg about 30-60 minutes before bed, melatonin starting at 0.5-3 mg, and glycine at 3 g. Talk to your healthcare provider, especially if you take any prescription medications.",
    },
    {
      name: "stress",
      reply:
        "For non-clinical stress, ashwagandha (300-600 mg/day standardized to KSM-66 or Sensoril) and L-theanine (200 mg) have the most consistent evidence. Magnesium and rhodiola are reasonable additions. If stress is persistent or affecting daily life, talk to a mental-health professional.",
    },
    {
      name: "cholesterol",
      reply:
        "For LDL support, soluble fiber (psyllium 5-10 g/day), plant sterols (1.5-3 g/day with meals), and omega-3 fish oil (1-2 g EPA+DHA) have the best evidence. Red yeast rice is effective but contains monacolin K (same compound as lovastatin) — do not combine with prescribed statins. Discuss with your provider, especially if you take any prescription medications.",
    },
    {
      name: "weight",
      reply:
        "For weight management as an adjunct to diet and exercise, soluble fiber like psyllium and glucomannan (taken with a full glass of water) can support satiety. Green tea extract may modestly increase metabolism. None of these replace a sustainable nutrition and movement routine. Talk to your provider before starting any supplement.",
    },
    {
      name: "sexual",
      reply:
        "BEFORE listing options: if you take sildenafil (Viagra), tadalafil (Cialis), or any nitrate (nitroglycerin, isosorbide), do not add L-arginine or L-citrulline without clinician supervision — the additive vasodilation can cause severe low blood pressure. Otherwise, common options include L-arginine 2-6 g/day, L-citrulline 3-8 g/day, maca 1.5-3 g/day, and zinc 11-30 mg/day for testosterone support. Talk to your provider for personalized guidance.",
    },
    {
      name: "cardiovascular",
      reply:
        "For cardiovascular support, omega-3 (1-2 g EPA+DHA), CoQ10 (100-200 mg, especially if you take a statin), plant sterols (1.5-3 g/day), and magnesium are well-studied. Talk to your provider before adjusting your regimen if you take blood pressure medication or any anticoagulant.",
    },
  ];
  for (const { name, reply } of samples) {
    const result = validateResponse(reply, "llm", { populations: [] }, null);
    assert.equal(result.safe, true, `wellness reply "${name}" rejected by validator: ${JSON.stringify(result.violations)}`);
    assert.notEqual(result.fallback, SAFE_FALLBACK_REPLY, `wellness reply "${name}" must not fall back`);
  }
});

// ─── 5. PDE5/nitrate deterministic safety gate ──────────────────────

test("system:nitrate-vasodilator fires for L-arginine/L-citrulline + PDE5 or nitrate", () => {
  const positiveCases = [
    "l-arginine with sildenafil",
    "l-citrulline with viagra",
    "can I take arginine with my nitroglycerin",
    "arginine with cialis",
    "is it safe to take citrulline with tadalafil",
    "niacin with sildenafil",
    "yohimbine and stendra together",
  ];
  for (const msg of positiveCases) {
    const { route } = routeMessage(msg);
    assert.equal(route, "system:nitrate-vasodilator", `expected nitrate-vasodilator for "${msg}", got "${route}"`);
  }
});

test("system:nitrate-vasodilator does NOT fire without both sides", () => {
  const negativeCases = [
    "just arginine for circulation",
    "citrulline malate before exercise",
    "i need to refill my sildenafil",
    "what is nitroglycerin used for",
  ];
  for (const msg of negativeCases) {
    const { route } = routeMessage(msg);
    assert.notEqual(route, "system:nitrate-vasodilator", `nitrate-vasodilator must not fire for "${msg}"`);
  }
});

test("nitrateVasodilatorReply contains contraindication + provider/911 guidance", () => {
  const reply = nitrateVasodilatorReply();
  assert.match(reply, /contraindicated/i);
  assert.match(reply, /911|poison control|provider|pharmacist/i);
  assert.match(reply, /sildenafil|tadalafil|viagra|cialis/i);
  assert.ok(ROUTE_REPLY_MAP["system:nitrate-vasodilator"], "ROUTE_REPLY_MAP must register the new gate");
});

// ─── 6. Entity extraction — PDE5 + nitrate tagging ──────────────────

test("extractEntities tags PDE5/nitrate drug classes", () => {
  const cases = [
    { msg: "l-arginine with sildenafil", expectSupp: "arginine", expectMed: "sildenafil", expectClasses: ["pde5_inhibitor"] },
    { msg: "is viagra safe with citrulline", expectSupp: "citrulline", expectMed: "viagra", expectClasses: ["pde5_inhibitor"] },
    { msg: "i take nitroglycerin for angina", expectMed: "nitroglycerin", expectClasses: ["nitrate"] },
    { msg: "isosorbide and arginine?", expectMed: "isosorbide", expectClasses: ["nitrate"] },
  ];
  for (const { msg, expectSupp, expectMed, expectClasses } of cases) {
    const e = extractEntities(msg, null);
    if (expectSupp) {
      const suppMatch = e.supplements.some((s) => s.includes(expectSupp));
      assert.ok(suppMatch, `"${msg}" must extract supplement containing "${expectSupp}", got ${JSON.stringify(e.supplements)}`);
    }
    const medMatch = e.meds.some((m) => m.includes(expectMed));
    assert.ok(medMatch, `"${msg}" must extract medication containing "${expectMed}", got ${JSON.stringify(e.meds)}`);
    for (const cls of expectClasses) {
      assert.ok(e.drug_classes.includes(cls), `"${msg}" must include drug class "${cls}", got ${JSON.stringify(e.drug_classes)}`);
    }
  }
});
