/**
 * Phase 1 tests — knowledge base, KB lookup, dose extractor,
 * confidence signal, and expanded session memory.
 * Run: node test/knowledge.test.js
 */

const { KNOWLEDGE_BASE, getKBEntry, getKBEntriesForEntities, getInteractionsBetween, getAllEntries } = require("../src/config/knowledgeBase");
const { buildKBContext, buildAugmentedMessages } = require("../src/core/kbLookup");
const { extractDoses, getDoseSummary } = require("../src/core/doseExtractor");
const { resolveConfidence, CONFIDENCE_LABELS } = require("../src/core/confidence");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(condition, label) {
  total++;
  if (condition) { pass++; }
  else { fail++; failures.push(label); }
}

// ═══════════════════════════════════════════════════
//  1A. Knowledge Base Structure
// ═══════════════════════════════════════════════════

(function testKBEntryCount() {
  const count = Object.keys(KNOWLEDGE_BASE).length;
  assert(count >= 30, `KB has ≥30 entries (got ${count})`);
})();

(function testEveryEntryHasCanonical() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(typeof entry.canonical === "string" && entry.canonical.length > 0, `${id} has canonical name`);
  }
})();

(function testEveryEntryHasCategory() {
  const validCategories = ["supplement", "medication", "mineral", "vitamin"];
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(validCategories.includes(entry.category), `${id} has valid category (got "${entry.category}")`);
  }
})();

(function testEveryEntryHasDoseRange() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(entry.adult_dose_range && typeof entry.adult_dose_range.min === "number", `${id} has adult_dose_range`);
  }
})();

(function testEveryEntryHasTiming() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(entry.timing && typeof entry.timing.with_food === "boolean", `${id} has timing.with_food`);
  }
})();

(function testEveryEntryHasPopulations() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(entry.populations && typeof entry.populations.pregnancy === "object", `${id} has populations.pregnancy`);
    assert(entry.populations && typeof entry.populations.renal === "object", `${id} has populations.renal`);
    assert(entry.populations && typeof entry.populations.elderly === "object", `${id} has populations.elderly`);
  }
})();

(function testEveryEntryHasInteractions() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    assert(Array.isArray(entry.interactions), `${id} has interactions array`);
  }
})();

(function testEveryEntryHasCommonGoals() {
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    // medications don't need common_goals
    if (entry.category !== "medication") {
      assert(Array.isArray(entry.common_goals) && entry.common_goals.length > 0, `${id} has common_goals`);
    }
  }
})();

// ── getKBEntry ──

(function testGetKBEntryDirect() {
  const entry = getKBEntry("magnesium");
  assert(entry !== null, "getKBEntry('magnesium') returns entry");
  assert(entry.canonical === "magnesium", "getKBEntry returns correct canonical");
})();

(function testGetKBEntryAlias() {
  const entry = getKBEntry("zoloft");
  assert(entry !== null, "getKBEntry('zoloft') resolves alias");
  assert(entry.canonical === "sertraline", "zoloft alias resolves to sertraline");
})();

(function testGetKBEntryAliasCaseInsensitive() {
  const entry = getKBEntry("Advil");
  assert(entry !== null, "getKBEntry('Advil') resolves case-insensitive");
  assert(entry.canonical === "ibuprofen", "Advil resolves to ibuprofen");
})();

(function testGetKBEntryUnknown() {
  const entry = getKBEntry("unicorn dust");
  assert(entry === null, "getKBEntry returns null for unknown");
})();

(function testGetKBEntryNull() {
  const entry = getKBEntry(null);
  assert(entry === null, "getKBEntry(null) returns null");
})();

// ── getKBEntriesForEntities ──

(function testGetKBEntriesForEntities() {
  const results = getKBEntriesForEntities(["magnesium", "sertraline", "unknown_thing"]);
  assert(results.length === 2, `getKBEntriesForEntities returns 2 entries (got ${results.length})`);
})();

(function testGetKBEntriesDeduplication() {
  const results = getKBEntriesForEntities(["magnesium", "mag glycinate", "magnesium"]);
  // "mag glycinate" won't match but "magnesium" should appear only once
  assert(results.filter(e => e.canonical === "magnesium").length === 1, "deduplicates entries");
})();

// ── getInteractionsBetween ──

(function testGetInteractionsBetween() {
  const ixs = getInteractionsBetween("ibuprofen", "warfarin");
  assert(ixs.length >= 1, `ibuprofen-warfarin has ≥1 interaction (got ${ixs.length})`);
  assert(ixs.some(ix => ix.severity === "high"), "ibuprofen-warfarin has high severity interaction");
})();

(function testGetInteractionsUnknown() {
  const ixs = getInteractionsBetween("ibuprofen", "unicorn");
  assert(ixs.length === 0, "unknown entity returns no interactions");
})();

// ── getAllEntries ──

(function testGetAllEntries() {
  const all = getAllEntries();
  assert(all.length >= 30, `getAllEntries returns ≥30 (got ${all.length})`);
  assert(all.every(e => e.id && e.canonical), "all entries have id and canonical");
})();

// ── Form-specific data ──

(function testMagnesiumForms() {
  const mg = getKBEntry("magnesium");
  assert(mg.forms && Object.keys(mg.forms).length >= 3, "magnesium has ≥3 forms");
  assert(mg.forms.glycinate && mg.forms.glycinate.absorption === "high", "glycinate has high absorption");
  assert(mg.forms.oxide && mg.forms.oxide.absorption === "low", "oxide has low absorption");
})();

(function testIronForms() {
  const fe = getKBEntry("iron");
  assert(fe.forms && fe.forms.bisglycinate, "iron has bisglycinate form");
})();

// ── Population safety ──

(function testPregnancyUnsafe() {
  const kava = getKBEntry("kava");
  assert(kava.populations.pregnancy.safe === false, "kava unsafe in pregnancy");

  const ashwa = getKBEntry("ashwagandha");
  assert(ashwa.populations.pregnancy.safe === false, "ashwagandha unsafe in pregnancy");
})();

(function testRenalUnsafe() {
  const mg = getKBEntry("magnesium");
  assert(mg.populations.renal.safe === false, "magnesium unsafe in renal");

  const k = getKBEntry("potassium");
  assert(k.populations.renal.safe === false, "potassium unsafe in renal");
})();

// ═══════════════════════════════════════════════════
//  1B. KB Lookup / Context Builder
// ═══════════════════════════════════════════════════

(function testBuildKBContextWithHits() {
  const entities = { meds: ["sertraline"], supplements: ["magnesium"] };
  const result = buildKBContext(entities);
  assert(result.hits === 2, `buildKBContext hits = 2 (got ${result.hits})`);
  assert(result.context.includes("VERIFIED REFERENCE DATA"), "context has header");
  assert(result.context.includes("SERTRALINE"), "context includes sertraline");
  assert(result.context.includes("MAGNESIUM"), "context includes magnesium");
})();

(function testBuildKBContextNoHits() {
  const entities = { meds: [], supplements: ["unknown_supp"] };
  const result = buildKBContext(entities);
  assert(result.hits === 0, "no hits for unknown entities");
  assert(result.context === "", "empty context for no hits");
})();

(function testBuildKBContextNull() {
  const result = buildKBContext(null);
  assert(result.hits === 0, "null entities returns 0 hits");
})();

(function testBuildKBContextCapsAt4() {
  const entities = { meds: ["sertraline", "warfarin", "metformin", "lisinopril", "lithium"], supplements: [] };
  const result = buildKBContext(entities);
  // Context should include max 4 entries
  const entryHeaders = (result.context.match(/\[[\w\s]+\]/g) || []);
  assert(entryHeaders.length <= 4, `caps at 4 entries (got ${entryHeaders.length})`);
})();

(function testBuildKBContextIncludesPopulations() {
  const entities = { meds: [], supplements: ["magnesium"], populations: ["renal"] };
  const result = buildKBContext(entities);
  assert(result.context.includes("renal"), "includes renal population context");
})();

(function testBuildKBContextIncludesInteractions() {
  const entities = { meds: ["warfarin"], supplements: [] };
  const result = buildKBContext(entities);
  assert(result.context.includes("⚠"), "includes interaction warnings");
})();

(function testBuildAugmentedMessages() {
  const entities = { meds: ["sertraline"], supplements: ["5-htp"] };
  const result = buildAugmentedMessages("System prompt", [{ role: "user", content: "prev" }], "Can I take 5-HTP with Zoloft?", entities);
  assert(result.messages.length >= 4, `augmented messages has ≥4 items (got ${result.messages.length})`);
  assert(result.messages[0].content === "System prompt", "first message is system prompt");
  assert(result.messages[1].role === "system", "KB context is system message");
  assert(result.kbHits >= 1, "reports KB hits");
})();

(function testBuildAugmentedMessagesNoHits() {
  const entities = { meds: [], supplements: [] };
  const result = buildAugmentedMessages("System prompt", [], "Hello", entities);
  assert(result.messages.length === 2, "no KB context when no hits");
  assert(result.kbHits === 0, "0 KB hits");
})();

// ═══════════════════════════════════════════════════
//  1C. Dose Extractor
// ═══════════════════════════════════════════════════

(function testExtractDoseBasic() {
  const doses = extractDoses("I take 500 mg magnesium daily");
  assert(doses.length >= 1, `extracts dose from '500 mg magnesium' (got ${doses.length})`);
  if (doses.length > 0) {
    assert(doses[0].amount === 500, "amount is 500");
    assert(doses[0].unit === "mg", "unit is mg");
  }
})();

(function testExtractDoseWithComma() {
  const doses = extractDoses("I'm taking 10,000 IU vitamin D");
  assert(doses.length >= 1, `extracts dose from '10,000 IU vitamin D' (got ${doses.length})`);
  if (doses.length > 0) {
    assert(doses[0].amount === 10000, "amount is 10000");
    assert(doses[0].unit === "IU", "unit is IU");
  }
})();

(function testExtractDoseReversed() {
  const doses = extractDoses("magnesium 400mg");
  assert(doses.length >= 1, `extracts reversed dose (got ${doses.length})`);
  if (doses.length > 0) {
    assert(doses[0].amount === 400, "amount is 400");
  }
})();

(function testExtractDoseWeekly() {
  const doses = extractDoses("50,000 IU/week of vitamin D");
  assert(doses.length >= 1, `extracts weekly dose (got ${doses.length})`);
  if (doses.length > 0) {
    assert(Math.round(doses[0].daily_amount) === 7143, `daily amount ≈ 7143 (got ${Math.round(doses[0].daily_amount)})`);
  }
})();

(function testExtractDoseNone() {
  const doses = extractDoses("Can I take magnesium with sertraline?");
  assert(doses.length === 0, "no doses in non-dose message");
})();

(function testExtractDoseNull() {
  const doses = extractDoses(null);
  assert(doses.length === 0, "null input returns empty array");
})();

(function testExtractDoseMultiple() {
  const doses = extractDoses("I take 500 mg magnesium and 2000 IU vitamin D daily");
  assert(doses.length >= 2, `extracts multiple doses (got ${doses.length})`);
})();

// ── getDoseSummary ──

(function testGetDoseSummaryNoDoses() {
  const summary = getDoseSummary([]);
  assert(summary.has_dose === false, "no doses = has_dose false");
  assert(summary.any_exceeds_ul === false, "no doses = no UL exceeded");
})();

(function testGetDoseSummaryWithULExceed() {
  const doses = extractDoses("I take 1200 mg magnesium daily");
  const summary = getDoseSummary(doses);
  assert(summary.has_dose === true, "has_dose is true");
  // 1200 mg > 350 mg UL for magnesium
  if (doses.length > 0 && doses[0].exceeds_upper_limit !== null) {
    assert(summary.any_exceeds_ul === true, "1200mg magnesium exceeds UL");
    assert(summary.high_dose_items.length > 0, "has high dose items");
  }
})();

(function testGetDoseSummaryWithinUL() {
  const doses = extractDoses("I take 200 mg magnesium daily");
  const summary = getDoseSummary(doses);
  assert(summary.has_dose === true, "has_dose is true");
  if (doses.length > 0 && doses[0].exceeds_upper_limit !== null) {
    assert(summary.any_exceeds_ul === false, "200mg magnesium within UL");
  }
})();

// ═══════════════════════════════════════════════════
//  1D. Confidence Signal
// ═══════════════════════════════════════════════════

(function testConfidenceGate() {
  const result = resolveConfidence("gate", 0);
  assert(result.confidence === "high", "gate → high confidence");
  assert(result.label === CONFIDENCE_LABELS.high, "gate → correct label");
})();

(function testConfidenceCache() {
  const result = resolveConfidence("cache", 0);
  assert(result.confidence === "high", "cache → high confidence");
})();

(function testConfidenceLLMWithKB() {
  const result = resolveConfidence("llm", 3);
  assert(result.confidence === "moderate", "LLM + KB hits → moderate confidence");
})();

(function testConfidenceLLMNoKB() {
  const result = resolveConfidence("llm", 0);
  assert(result.confidence === "low", "LLM no KB → low confidence");
})();

(function testConfidenceDegraded() {
  const result = resolveConfidence("degraded", 0);
  assert(result.confidence === "low", "degraded → low confidence");
})();

// ═══════════════════════════════════════════════════
//  Cross-module integration
// ═══════════════════════════════════════════════════

(function testKBLookupMatchesEntityExtraction() {
  // Entity extraction output format matches KB lookup input
  const entities = { meds: ["sertraline"], supplements: ["magnesium", "5-htp"] };
  const kbResults = getKBEntriesForEntities([...entities.meds, ...entities.supplements]);
  assert(kbResults.length >= 2, "KB lookup works with entity extraction format");
})();

(function testDoseExtractorFindsKBEntry() {
  const doses = extractDoses("I take 500 mg magnesium and 100 mg sertraline");
  const withKB = doses.filter(d => d.kb_entry !== null);
  assert(withKB.length >= 1, `dose extractor links to KB entries (got ${withKB.length})`);
})();

// ═══════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Knowledge/Phase 1 tests: ${pass} passed, ${fail} failed, ${total} total`);
if (failures.length > 0) {
  console.log("\nFailed:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
}
console.log(`${"=".repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
