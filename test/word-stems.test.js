/**
 * A word stem inside \b…\b never matches the word: \b(toxicit)\b cannot match "toxicity", because the
 * pattern needs a word boundary straight after the stem. The emergency gate's `suicid` was the worst
 * case (fixed with its own tests in test/wave-b.test.js); a scan of the gates found the same mistake in
 * the liver, charcoal and SSRI-discontinuation gates and in several routing helpers.
 *
 * Not changed on purpose: the validator's educational word "teratogen" (safetyValidator.js). Counting
 * "teratogenic" as educational would let "Take 25,000 IU of vitamin A every day during pregnancy, the
 * teratogenic concern is overblown" through; the last test pins that it stays blocked.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const d = require("../src/gates/detection");
const { getFormRecommendation } = require("../src/core/formAdvisor");
const { extractEntities } = require("../src/core/entities");
const { normalizeText } = require("../src/core/normalize");
const { validateResponse } = require("../src/postprocess/safetyValidator");

test("liver-toxicity gate: every common form of the liver word", () => {
  for (const m of ["I take kava, could that cause liver injury?", "I take kava, worried about liver toxicity", "I take kava and turmeric, any liver problems?",
    "I take kava, any liver issues?", "is kava hepatotoxicity real", "I take kava, could that cause liver damage?"]) {
    assert.equal(d.detectsLiverToxicityStack(m), true, m);
  }
});

test("charcoal gate: contraceptive and contraception count as a medication", () => {
  for (const m of ["can I take activated charcoal with my contraceptive?", "activated charcoal and contraception", "can I take activated charcoal with my birth control?"]) {
    assert.equal(d.detectsCharcoalMed(m), true, m);
  }
});

test("SSRI-discontinuation gate: 'discontinued' and 'no longer taking'", () => {
  for (const m of ["I discontinued my zoloft, can I just take 5-HTP instead?", "I'm no longer taking my lexapro, can I switch to st john's wort instead?",
    "I stopped my zoloft, can I just take 5-HTP instead?"]) {
    assert.equal(d.detectsSSRIDiscontinuation(m), true, m);
  }
});

test("off-topic scorer: health words in their usual forms clear the threshold", () => {
  for (const w of ["inflammation", "menopause", "menstrual", "conceive", "endometriosis", "digestion"]) {
    assert.ok(d.intentScore(w) >= 2, `${w} scored ${d.intentScore(w)}`);
  }
});

test("routing helpers: veterinarian is a pet question; home remedies is a request for help, not a condition to redirect", () => {
  assert.equal(d.isPetQuestion("veterinarian approved joint supplement?"), true);
  assert.equal(d.isMedicalConditionQuery("any home remedies for my arthritis pain"), false);
});

test("form advice: magnesium oxide taken for constipation is not told to switch forms", () => {
  for (const m of ["I take magnesium oxide for constipation", "I take magnesium oxide for my bowels"]) {
    const t = normalizeText(m);
    const rec = getFormRecommendation(t, "magnesium", extractEntities(m, t));
    assert.ok(!rec || !/low absorption/.test(rec), `${m}: ${rec}`);
  }
});

test("validator: a pregnancy dose that waves away the teratogenic risk is still blocked", () => {
  const entities = { meds: [], supplements: ["vitamin a"], populations: ["pregnancy"], symptoms: [], intents: [], unknowns: [] };
  for (const r of ["Take 25,000 IU of vitamin A every day during pregnancy, the teratogenic concern is overblown.",
    "You can take 15,000 IU of vitamin A daily while pregnant; it is not teratogenic at that dose."]) {
    assert.equal(validateResponse(r, "llm", entities, null).safe, false, r);
  }
});
