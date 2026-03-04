const SYNONYM_MAP = [
  // ── Serotonergic substances ──
  [/\b5\s*hydroxytryptophan\b/g, "5 htp"],
  [/\bhydroxytryptophan\b/g, "5 htp"],
  [/\bserotonin\s*(supplement|booster|precursor|support)\b/g, "5 htp"],
  [/\bmood\s*precursor\b/g, "5 htp"],
  [/\bst\s*johns?\b/g, "st johns wort"],
  [/\bsaint\s*john\s*s?\s*wort\b/g, "st johns wort"],
  [/\bmicro\s*dos(e|ing)?\s*mushrooms?\b/g, "psilocybin"],
  [/\bmagic\s*mushrooms?\b/g, "psilocybin"],
  [/\bshrooms?\b/g, "psilocybin"],

  // ── Medication class synonyms ──
  [/\bcholesterol\s*(medication|drug|pill|medicine)\b/g, "cholesterol meds"],
  [/\bblood\s*pressure\s*(medication|drug|pill|medicine)\b/g, "blood pressure meds"],
  [/\bblood\s*thin(ner|ning)\s+(medication|drug|pill|medicine|thingy|thing)\b/g, "blood thinner"],
  [/\banxiety\s*(medication|drug|pill|medicine)\b/g, "anxiety meds"],
  [/\bdepression\s*(medication|drug|pill|medicine)\b/g, "depression meds"],
  [/\bsleep\s*(medication|drug|pill|medicine)\b/g, "sleep meds"],
  [/\bthyroid\s*(medication|drug|pill|medicine)\b/g, "thyroid meds"],
  [/\bheart\s*(medication|drug|pill|medicine)\b/g, "heart meds"],

  // ── Charcoal variants ──
  [/\bcharcoal\s*(detox|cleanse|flush|powder)\b/g, "activated charcoal detox"],

  // ── Supplement name variants ──
  [/\bgreen\s*tea\s*(fat\s*burner|diet|weight\s*loss|pills?|caps?|capsules?)\b/g, "green tea extract"],
  [/\begcg\s+(supplement|pills?|caps?|capsules?)\b/g, "green tea extract"],
  [/\begcg\b/g, "green tea extract"],
  [/\bomega\s*3\s+(supplement|pills?|caps?|capsules?|fatty\s*acids?)\b/g, "fish oil"],
  [/\bomega\s*3\b/g, "fish oil"],
  [/\bcurcumin\b/g, "turmeric"],
  [/\bcoenzyme\s*q\s*10\b/g, "coq10"],
  [/\bubiquinol\b/g, "coq10"],

  // ── Nootropic / energy synonyms (for clarifier) ──
  [/\bbrain\s*(booster|enhancer|supplement|pill|vitamin)\b/g, "nootropic supplement"],
  [/\bfocus\s*(supplement|pill|booster|enhancer)\b/g, "nootropic supplement"],
  [/\bcognitive\s*(enhancer|supplement|booster)\b/g, "nootropic supplement"],
  [/\bmemory\s*(supplement|pill|booster|enhancer)\b/g, "nootropic supplement"],

  // ── Common misspellings ──
  [/\bsertaline\b/g, "sertraline"],
  [/\bxanex\b/g, "xanax"],
  [/\bklonipin\b/g, "clonazepam"],
  [/\bwelbutrin\b/g, "wellbutrin"],
  [/\badderal\b/g, "adderall"],
  [/\bvyvance\b/g, "vyvanse"],
  [/\blevothyroxin\b/g, "levothyroxine"],
  [/\batorvastain\b/g, "atorvastatin"],
  [/\bmetforman\b/g, "metformin"],
  [/\blisinipril\b/g, "lisinopril"],
  [/\bacutane\b/g, "accutane"],
];

function applySynonyms(text) {
  let t = text;
  for (const [pattern, replacement] of SYNONYM_MAP) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(/\s+/g, " ").trim();
}

module.exports = { SYNONYM_MAP, applySynonyms };
