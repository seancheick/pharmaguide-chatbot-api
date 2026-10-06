/**
 * One list of known product names: the entity extractor (src/core/entities.js ENTITY_PATTERNS).
 *
 * The off-topic scorer kept its own list of ~240 words, 164 of them product names the extractor already
 * knew, and the clarifier kept a third list; the lists drifted (the clarifier bug fixed in #16 came from
 * one). Both now count known names through the extractor. A differential run over every test message
 * and every extractor name (5,628 messages) moved scores only upward (names the old list lacked, such as
 * venlafaxine, lithium, aspirin) and changed no clarifier decision.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../src/gates/detection");
const { extractKnownItems } = require("../src/core/entities");

test("the scorer's own word list holds no name the extractor already knows", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src/gates/detection.js"), "utf8");
  const m = src.match(/const SCOPE_WORDS = \/\\b\((.*)\)\\b\/;/);
  assert.ok(m, "SCOPE_WORDS not found");
  const plain = (a) => a.replace(/\\s\*|\\s\+/g, " ").replace(/\.\?/g, "").replace(/\\\./g, ".").replace(/[?+*]/g, "").replace(/\\/g, "");
  const duplicated = m[1].split("|").filter((a) => extractKnownItems(plain(a)).size > 0);
  assert.deepEqual(duplicated, [], "add names to ENTITY_PATTERNS, not to SCOPE_WORDS");
});

test("any medicine the extractor knows puts a message in scope", () => {
  for (const m of ["venlafaxine", "lithium", "atorvastatin", "gabapentin", "oxycodone", "amitriptyline"]) {
    assert.ok(d.intentScore(m) >= 2, `${m} scored ${d.intentScore(m)}`);
  }
});

test("names the extractor lacked are now known (moved there, not kept in side lists)", () => {
  for (const m of ["hydrocodone", "oxycodone", "amitriptyline", "clobazam", "charcoal", "chasteberry"]) {
    assert.ok(extractKnownItems(`I take ${m}`).size > 0, m);
  }
});

test("the clarifier counts known items through the extractor", () => {
  assert.equal(d.needsMedicationClarifier("I take zoloft, xanax and lisinopril, is that ok with my meds?"), false, "three named items is specific enough");
  assert.equal(d.needsMedicationClarifier("can I take a supplement with my meds"), true);
});
