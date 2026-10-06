/**
 * Unknown medication/supplement hardening.
 * Catches items that slip through ENTITY_PATTERNS and resolves common
 * misspellings, brand names, and abbreviations.
 */

const { normalizeText } = require("./normalize");

// Brand-to-generic mapping: the owner of exact brand → generic pairs (chat glue). The verified
// pipeline records are matched through it (src/core/pipelineInteractions.js), so an entry must be the
// same drug, never a "close enough" one: pantoprazole is not omeprazole, Xyzal is not cetirizine.
// temporalContext.js and replies.js keep their own lookup aliases, which group related drugs on purpose.
const BRAND_TO_GENERIC = {
  // Common brands also known to ENTITY_PATTERNS
  "zoloft": "sertraline", "prozac": "fluoxetine", "lexapro": "escitalopram", "celexa": "citalopram",
  "paxil": "paroxetine", "luvox": "fluvoxamine", "effexor": "venlafaxine", "cymbalta": "duloxetine",
  "pristiq": "desvenlafaxine", "wellbutrin": "bupropion", "nardil": "phenelzine", "parnate": "tranylcypromine",
  "ritalin": "methylphenidate", "concerta": "methylphenidate", "valium": "diazepam",
  "lithobid": "lithium", "lopressor": "metoprolol",
  "toprol": "metoprolol", "tenormin": "atenolol", "inderal": "propranolol", "coreg": "carvedilol",
  "zestril": "lisinopril", "prinivil": "lisinopril", "vasotec": "enalapril", "lipitor": "atorvastatin",
  "lasix": "furosemide", "aldactone": "spironolactone", "zithromax": "azithromycin", "z-pack": "azithromycin",
  "ultram": "tramadol", "zyrtec": "cetirizine", "claritin": "loratadine", "allegra": "fexofenadine",
  "benadryl": "diphenhydramine", "protonix": "pantoprazole", "prevacid": "lansoprazole",
  // Brands of drugs named in the pipeline's verified interaction records
  "eliquis": "apixaban", "xarelto": "rivaroxaban", "plavix": "clopidogrel", "brilinta": "ticagrelor",
  "lanoxin": "digoxin", "dilantin": "phenytoin", "depakene": "valproic acid", "cordarone": "amiodarone",
  "pacerone": "amiodarone", "diflucan": "fluconazole", "calan": "verapamil", "verelan": "verapamil",
  "lopid": "gemfibrozil", "questran": "cholestyramine", "zofran": "ondansetron", "cipro": "ciprofloxacin",
  "levaquin": "levofloxacin", "trexall": "methotrexate", "demerol": "meperidine", "imitrex": "sumatriptan",
  "fosamax": "alendronate", "medrol": "methylprednisolone", "deltasone": "prednisone", "elavil": "amitriptyline",
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
