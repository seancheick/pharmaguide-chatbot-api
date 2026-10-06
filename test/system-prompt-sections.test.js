/**
 * The system prompt is stored as ordered sections (src/config/systemPromptSections.js).
 *
 * Step 1 of the prompt slimming is a pure refactor: the text was moved, not rewritten. These tests
 * pin that, and pin the property the next step depends on: every safety and behaviour rule is in a
 * core section, so choosing topic sections per question can never drop one.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
const { SECTIONS, composePrompt } = require("../src/config/systemPromptSections");
const { systemPromptHash } = require("../src/infra/provenance");
const { MUST_ALWAYS_APPLY } = require("./prompt-rules");

// The prompt that was in production when it was split into sections (2026-10-06). A deliberate
// prompt edit changes these: update both together, in the same commit as the edit, so the change
// is visible in review. Responses are cached on this hash and report it in X-PG-Ruleset.
const PRODUCTION_PROMPT_SHA256 = "6294d6d4bd1ea13fc1c47422f9d5de04907af16a70c628126cd80406e6da4b1a";
const PRODUCTION_PROMPT_LENGTH = 42552;

const core = () => SECTIONS.filter((s) => s.kind === "core").map((s) => s.text).join("");

test("the sectioned prompt is byte-identical to the prompt that was in production", () => {
  assert.equal(SYSTEM_PROMPT.length, PRODUCTION_PROMPT_LENGTH);
  assert.equal(crypto.createHash("sha256").update(SYSTEM_PROMPT).digest("hex"), PRODUCTION_PROMPT_SHA256);
  assert.equal(composePrompt(SECTIONS), SYSTEM_PROMPT);
  assert.equal(systemPromptHash, PRODUCTION_PROMPT_SHA256.slice(0, 12), "the cache key and X-PG-Ruleset prompt hash must not change in a refactor");
});

test("sections are well formed: unique ids, a known kind, text that starts at a block header, nothing empty", () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate section id");
  for (const s of SECTIONS) {
    assert.ok(["core", "topic"].includes(s.kind), `${s.id}: kind ${s.kind}`);
    assert.ok(s.text.trim().length > 0, `${s.id} is empty`);
  }
  assert.ok(SECTIONS[0].text.startsWith("You are PharmaGuide AI"), "the identity block comes first");
  for (const s of SECTIONS.filter((x) => x.kind === "topic")) {
    assert.match(s.text, /^[A-Z][A-Z0-9 &\/\-—()',.]+(?:\([^)]*\))?:/, `${s.id} should start with its own header`);
  }
});

// Every one of these must live in a core section. If topic sections are conditional, these rules still
// reach the model on every question (the list is shared with test/prompt-selection.test.js).
test("every safety and behaviour rule is in a core section, never inside a topic section", () => {
  const always = core();
  for (const rule of MUST_ALWAYS_APPLY) {
    assert.ok(SYSTEM_PROMPT.includes(rule), `rule text not found in the prompt (was it reworded?): ${rule}`);
    assert.ok(always.includes(rule), `a topic section holds this rule, so it could be dropped: ${rule}`);
  }
});

test("the blocks that used to be tails of topic-looking sections are their own core sections", () => {
  const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
  assert.equal(byId["strict-boundaries"].kind, "core", "was the tail of 'WELLNESS GOALS — ALWAYS IN SCOPE'");
  assert.equal(byId["rules"].kind, "core", "was the tail of 'META QUESTIONS'");
  assert.equal(byId["evidence-grading"].kind, "core", "sat between two food and timing sections");
  assert.equal(byId["wellness-goals"].kind, "topic");
  assert.ok(!byId["wellness-goals"].text.includes("STRICT BOUNDARIES"));
});

test("the split measures what the slimming is for: most of the prompt is topic guidance", () => {
  const size = (kind) => SECTIONS.filter((s) => s.kind === kind).reduce((n, s) => n + s.text.length, 0);
  assert.equal(size("core") + size("topic"), SYSTEM_PROMPT.length);
  assert.ok(size("core") < SYSTEM_PROMPT.length * 0.25, "core grew past a quarter of the prompt: that defeats the point of the split");
});
