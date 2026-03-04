/**
 * Unknown medication/supplement hardening.
 * Catches items that slip through ENTITY_PATTERNS and resolves common
 * misspellings, brand names, and abbreviations.
 */

const { normalizeText } = require("./normalize");

// Brand-to-generic mapping (items not already in ENTITY_PATTERNS)
const BRAND_TO_GENERIC = {
  // Antidepressants / psych meds
  "desyrel": "trazodone",
  "remeron": "mirtazapine",
  "trintellix": "vortioxetine",
  "abilify": "aripiprazole",
  "seroquel": "quetiapine",
  // Statins
  "crestor": "rosuvastatin",
  "zocor": "simvastatin",
  "pravachol": "pravastatin",
  // Blood pressure
  "norvasc": "amlodipine",
  "diovan": "valsartan",
  "cozaar": "losartan",
  "benicar": "olmesartan",
  "micardis": "telmisartan",
  // Thyroid
  "synthroid": "levothyroxine",
  "armour thyroid": "desiccated thyroid",
  "tirosint": "levothyroxine",
  // Anticoagulants
  "coumadin": "warfarin",
  "pradaxa": "dabigatran",
  "savaysa": "edoxaban",
  // GI
  "prilosec": "omeprazole",
  "nexium": "esomeprazole",
  "pepcid": "famotidine",
  // Diabetes
  "glucophage": "metformin",
  "jardiance": "empagliflozin",
  "ozempic": "semaglutide",
  "mounjaro": "tirzepatide",
  // Pain
  "tylenol": "acetaminophen",
  "advil": "ibuprofen",
  "motrin": "ibuprofen",
  "aleve": "naproxen",
  // Other
  "neurontin": "gabapentin",
  "lyrica": "pregabalin",
  "ambien": "zolpidem",
  "xanax": "alprazolam",
  "ativan": "lorazepam",
  "klonopin": "clonazepam",
};

// Common misspellings → correct form
const MISSPELLINGS = {
  "ashwaganda": "ashwagandha",
  "ashwaghanda": "ashwagandha",
  "aswagandha": "ashwagandha",
  "tumeric": "turmeric",
  "tumric": "turmeric",
  "curcumine": "curcumin",
  "magnesuim": "magnesium",
  "magnessium": "magnesium",
  "seratonin": "serotonin",
  "seritonin": "serotonin",
  "meletonin": "melatonin",
  "melitonin": "melatonin",
  "valarian": "valerian",
  "echinachia": "echinacea",
  "glucosamine": "glucosamine",
  "coenzyme q10": "coq10",
  "lisinipril": "lisinopril",
  "lisinnopril": "lisinopril",
  "metformine": "metformin",
  "atorvastain": "atorvastatin",
  "sertaline": "sertraline",
  "sertralline": "sertraline",
  "exitalopram": "escitalopram",
  "fluoxitine": "fluoxetine",
  "levothyroxin": "levothyroxine",
};

// Ingredient-label patterns: items described with dosing but not in known patterns
const LABEL_ITEM_PATTERN = /\b(\d+\s*(?:mg|iu|mcg|g)\s+(?:of\s+)?)([\w][\w\s-]{2,20}?)(?=\s*(?:daily|twice|per|a\s+day|capsule|tablet|$|[.,;]))/gi;

/**
 * Resolve a brand name to its generic equivalent.
 * Returns the generic name if found, otherwise null.
 */
function resolveBrandName(text) {
  const lower = normalizeText(text);
  for (const [brand, generic] of Object.entries(BRAND_TO_GENERIC)) {
    if (lower.includes(brand)) {
      return { brand, generic };
    }
  }
  return null;
}

/**
 * Fix common misspellings in the input text.
 * Returns { corrected, corrections[] }.
 */
function correctMisspellings(text) {
  let corrected = text;
  const corrections = [];
  const lower = text.toLowerCase();

  for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
    if (lower.includes(wrong)) {
      corrections.push({ from: wrong, to: right });
      corrected = corrected.replace(new RegExp(wrong, "gi"), right);
    }
  }

  return { corrected, corrections };
}

/**
 * Detect items mentioned with dosing context that aren't in known entity patterns.
 * Returns an array of { name, dose } objects.
 */
function detectUnknownDosedItems(text, knownItems) {
  const matches = [];
  const lower = text.toLowerCase();
  let m;
  const pattern = new RegExp(LABEL_ITEM_PATTERN.source, "gi");
  while ((m = pattern.exec(lower)) !== null) {
    const itemName = m[2].trim();
    // Skip if it's a known entity
    if (knownItems.has(itemName)) continue;
    // Skip generic words
    if (/^(this|that|the|my|your|a|an|some|each|one|it|of|for)$/i.test(itemName)) continue;
    if (itemName.length < 3) continue;
    matches.push({ name: itemName, dose: m[1].trim() });
  }
  return matches;
}

module.exports = {
  BRAND_TO_GENERIC,
  MISSPELLINGS,
  resolveBrandName,
  correctMisspellings,
  detectUnknownDosedItems,
};
