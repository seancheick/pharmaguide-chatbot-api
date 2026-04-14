/**
 * Structured knowledge base for the top ~35 supplements and medications.
 * Each entry provides verified data for KB-augmented LLM calls, dose extraction,
 * and form-specific guidance.
 *
 * Fields:
 *   canonical    — lowercase canonical name (matches entity extraction)
 *   aliases      — brand names, abbreviations, common misspellings
 *   category     — "supplement" | "medication" | "mineral" | "vitamin"
 *   forms        — form-specific data (elemental content, absorption, GI tolerance)
 *   adult_dose_range — { min, max, unit } typical adult range
 *   upper_limit  — { value, unit, source } tolerable upper intake level
 *   timing       — { best_time, with_food, separate_from[] }
 *   populations  — { pregnancy, renal, elderly } safety + notes
 *   interactions — [{ with, severity, mechanism, timing_fix }]
 *   common_goals — what users typically take this for
 *   reference_ids — links to references.js
 */

const KNOWLEDGE_BASE = {
  magnesium: {
    canonical: "magnesium",
    aliases: ["mag", "magnesium glycinate", "magnesium citrate", "magnesium oxide", "mag glycinate", "calm", "natural calm"],
    category: "mineral",
    forms: {
      glycinate: { elemental_pct: 14, absorption: "high", gi_tolerance: "excellent", best_for: ["sleep", "anxiety"] },
      citrate: { elemental_pct: 16, absorption: "high", gi_tolerance: "moderate", best_for: ["constipation", "general"] },
      oxide: { elemental_pct: 60, absorption: "low", gi_tolerance: "poor", best_for: ["cost-effective if tolerant"] },
      threonate: { elemental_pct: 8, absorption: "high", gi_tolerance: "good", best_for: ["cognitive", "focus"] },
      taurate: { elemental_pct: 9, absorption: "high", gi_tolerance: "good", best_for: ["cardiovascular", "heart"] },
    },
    adult_dose_range: { min: 200, max: 400, unit: "mg elemental" },
    upper_limit: { value: 350, unit: "mg elemental (supplemental)", source: "NIH ODS" },
    timing: { best_time: "evening", with_food: true, separate_from: ["iron", "calcium", "zinc", "bisphosphonates"] },
    populations: {
      pregnancy: { safe: true, notes: "Generally safe at RDA (350-360 mg). Glycinate preferred." },
      renal: { safe: false, notes: "CKD stages 3-5 cannot clear excess. Risk of hypermagnesemia." },
      elderly: { safe: true, notes: "Often deficient. Start low (200 mg), glycinate or citrate preferred." },
    },
    interactions: [
      { with: "bisphosphonates", severity: "moderate", mechanism: "Reduces absorption. Separate by 2+ hours.", timing_fix: "2h separation" },
      { with: "antibiotics (tetracycline/quinolone)", severity: "moderate", mechanism: "Chelation reduces antibiotic absorption.", timing_fix: "2h separation" },
      { with: "levodopa", severity: "moderate", mechanism: "May reduce absorption.", timing_fix: "2h separation" },
    ],
    common_goals: ["sleep", "anxiety", "muscle cramps", "constipation", "general wellness"],
    reference_ids: ["ods-magnesium-2022"],
  },

  iron: {
    canonical: "iron",
    aliases: ["ferrous sulfate", "ferrous gluconate", "ferrous bisglycinate", "iron bisglycinate", "gentle iron", "slow fe"],
    category: "mineral",
    forms: {
      "ferrous sulfate": { elemental_pct: 20, absorption: "moderate", gi_tolerance: "poor", best_for: ["deficiency (cheapest)"] },
      "ferrous gluconate": { elemental_pct: 12, absorption: "moderate", gi_tolerance: "moderate", best_for: ["sensitive stomachs"] },
      bisglycinate: { elemental_pct: 20, absorption: "high", gi_tolerance: "excellent", best_for: ["best overall tolerance"] },
    },
    adult_dose_range: { min: 18, max: 45, unit: "mg elemental" },
    upper_limit: { value: 45, unit: "mg elemental/day", source: "NIH ODS" },
    timing: { best_time: "morning", with_food: false, separate_from: ["calcium", "magnesium", "zinc", "coffee", "tea", "dairy"] },
    populations: {
      pregnancy: { safe: true, notes: "Often needed. 27 mg/day RDA in pregnancy." },
      renal: { safe: true, notes: "Often needed in CKD with anemia. IV iron may be preferred." },
      elderly: { safe: true, notes: "Check levels before supplementing. Excess iron is harmful." },
    },
    interactions: [
      { with: "levothyroxine", severity: "moderate", mechanism: "Reduces thyroid hormone absorption.", timing_fix: "4h separation" },
      { with: "calcium", severity: "moderate", mechanism: "Competes for absorption.", timing_fix: "2h separation" },
      { with: "vitamin C", severity: "beneficial", mechanism: "Enhances iron absorption. Take together.", timing_fix: null },
    ],
    common_goals: ["iron deficiency", "anemia", "energy", "fatigue"],
    reference_ids: [],
  },

  zinc: {
    canonical: "zinc",
    aliases: ["zinc picolinate", "zinc gluconate", "zinc citrate", "zinc carnosine", "optizinc"],
    category: "mineral",
    forms: {
      picolinate: { elemental_pct: 21, absorption: "high", gi_tolerance: "good", best_for: ["general"] },
      gluconate: { elemental_pct: 14, absorption: "moderate", gi_tolerance: "good", best_for: ["lozenges/cold"] },
      citrate: { elemental_pct: 34, absorption: "high", gi_tolerance: "good", best_for: ["general"] },
      carnosine: { elemental_pct: 23, absorption: "high", gi_tolerance: "excellent", best_for: ["gut health"] },
    },
    adult_dose_range: { min: 15, max: 30, unit: "mg" },
    upper_limit: { value: 40, unit: "mg/day", source: "NIH ODS" },
    timing: { best_time: "morning", with_food: true, separate_from: ["iron", "calcium", "copper"] },
    populations: {
      pregnancy: { safe: true, notes: "11 mg/day RDA. Do not exceed 40 mg/day." },
      renal: { safe: true, notes: "Often deficient in CKD. Monitor levels." },
      elderly: { safe: true, notes: "Often deficient. 15-30 mg typical." },
    },
    interactions: [
      { with: "copper", severity: "moderate", mechanism: "High-dose zinc (50+ mg) depletes copper over time.", timing_fix: null },
      { with: "antibiotics (tetracycline/quinolone)", severity: "moderate", mechanism: "Chelation reduces absorption.", timing_fix: "2h separation" },
    ],
    common_goals: ["immune", "skin", "testosterone", "wound healing"],
    reference_ids: [],
  },

  calcium: {
    canonical: "calcium",
    aliases: ["calcium carbonate", "calcium citrate", "caltrate", "citracal", "tums"],
    category: "mineral",
    forms: {
      carbonate: { elemental_pct: 40, absorption: "moderate (needs acid)", gi_tolerance: "moderate", best_for: ["with meals, cheapest"] },
      citrate: { elemental_pct: 21, absorption: "high (acid-independent)", gi_tolerance: "good", best_for: ["empty stomach OK, elderly, low acid"] },
    },
    adult_dose_range: { min: 500, max: 600, unit: "mg per dose (max 2 doses)" },
    upper_limit: { value: 2500, unit: "mg/day total (food + supplements)", source: "NIH ODS" },
    timing: { best_time: "with meals", with_food: true, separate_from: ["iron", "zinc", "magnesium", "levothyroxine", "bisphosphonates"] },
    populations: {
      pregnancy: { safe: true, notes: "1000 mg/day RDA. Citrate preferred if on prenatal with iron." },
      renal: { safe: false, notes: "Risk of hypercalcemia in CKD. Requires nephrologist guidance." },
      elderly: { safe: true, notes: "1200 mg/day RDA (65+). Citrate preferred (lower stomach acid)." },
    },
    interactions: [
      { with: "levothyroxine", severity: "high", mechanism: "Significantly reduces absorption.", timing_fix: "4h separation" },
      { with: "iron", severity: "moderate", mechanism: "Competes for absorption.", timing_fix: "2h separation" },
      { with: "bisphosphonates", severity: "high", mechanism: "Reduces drug absorption.", timing_fix: "30min+ separation (take bisphosphonate first on empty stomach)" },
    ],
    common_goals: ["bone health", "osteoporosis prevention"],
    reference_ids: [],
  },

  "vitamin d": {
    canonical: "vitamin d",
    aliases: ["vitamin d3", "cholecalciferol", "ergocalciferol", "d3", "vitamin d2"],
    category: "vitamin",
    forms: {
      d3: { absorption: "high", notes: "Preferred form. Better at raising blood levels than D2." },
      d2: { absorption: "moderate", notes: "Plant-derived. Less effective per IU than D3." },
    },
    adult_dose_range: { min: 1000, max: 4000, unit: "IU/day" },
    upper_limit: { value: 4000, unit: "IU/day (maintenance)", source: "NIH ODS / Endocrine Society" },
    timing: { best_time: "morning or lunch", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "600 IU/day RDA, many providers recommend 1000-2000 IU." },
      renal: { safe: true, notes: "Often needed in CKD. Active form (calcitriol) may be required. Provider-managed." },
      elderly: { safe: true, notes: "800-2000 IU/day commonly recommended. Check 25(OH)D levels." },
    },
    interactions: [
      { with: "thiazide diuretics", severity: "moderate", mechanism: "Both raise calcium. Risk of hypercalcemia.", timing_fix: null },
      { with: "steroids (prednisone)", severity: "low", mechanism: "Steroids impair vitamin D metabolism. Higher doses may be needed.", timing_fix: null },
    ],
    common_goals: ["bone health", "immune", "mood", "deficiency correction"],
    reference_ids: ["holick-2011", "ods-vitamin-a-2023"],
  },

  "vitamin k2": {
    canonical: "vitamin k2",
    aliases: ["k2", "mk-7", "mk-4", "menaquinone"],
    category: "vitamin",
    forms: {
      "mk-7": { absorption: "high", notes: "Long half-life (~72h). Lower dose needed (100-200 mcg)." },
      "mk-4": { absorption: "moderate", notes: "Short half-life. Higher dose needed (1-15 mg)." },
    },
    adult_dose_range: { min: 100, max: 200, unit: "mcg (MK-7)" },
    upper_limit: { value: null, unit: "no established UL", source: "NIH ODS" },
    timing: { best_time: "with fat-containing meal", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Limited data at supplemental doses. 90 mcg/day AI." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Commonly paired with D3 and calcium for bone health." },
    },
    interactions: [
      { with: "warfarin", severity: "high", mechanism: "Vitamin K opposes warfarin's mechanism. Can reduce INR.", timing_fix: null },
    ],
    common_goals: ["bone health", "cardiovascular", "calcium directing"],
    reference_ids: [],
  },

  iodine: {
    canonical: "iodine",
    aliases: ["kelp", "seaweed", "iodoral", "lugol's", "potassium iodide"],
    category: "mineral",
    forms: {
      "potassium iodide": { absorption: "high", notes: "Standard supplemental form." },
      kelp: { absorption: "variable", notes: "Highly variable iodine content. Difficult to dose accurately." },
    },
    adult_dose_range: { min: 150, max: 290, unit: "mcg" },
    upper_limit: { value: 1100, unit: "mcg/day", source: "NIH ODS" },
    timing: { best_time: "morning", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "220 mcg/day RDA. Many prenatals include it." },
      renal: { safe: true, notes: "Generally safe at normal doses." },
      elderly: { safe: true, notes: "Check thyroid function first." },
    },
    interactions: [
      { with: "levothyroxine", severity: "moderate", mechanism: "Excess iodine can destabilize thyroid levels.", timing_fix: null },
    ],
    common_goals: ["thyroid support", "pregnancy"],
    reference_ids: ["ods-iodine-2022"],
  },

  potassium: {
    canonical: "potassium",
    aliases: ["potassium citrate", "potassium gluconate", "potassium chloride"],
    category: "mineral",
    adult_dose_range: { min: 99, max: 99, unit: "mg (OTC cap)" },
    upper_limit: { value: null, unit: "no UL but OTC limited to 99 mg/dose", source: "FDA" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Get from food. Supplementation rarely needed." },
      renal: { safe: false, notes: "High hyperkalemia risk in CKD. Avoid without monitoring." },
      elderly: { safe: true, notes: "Use caution if on ACE-I/ARB/spironolactone." },
    },
    interactions: [
      { with: "ACE inhibitors/ARBs", severity: "high", mechanism: "Both raise potassium. Hyperkalemia risk.", timing_fix: null },
      { with: "spironolactone", severity: "high", mechanism: "Potassium-sparing diuretic. Additive hyperkalemia risk.", timing_fix: null },
    ],
    common_goals: ["electrolyte balance", "muscle cramps", "blood pressure"],
    reference_ids: ["palmer-2004"],
  },

  b12: {
    canonical: "b12",
    aliases: ["vitamin b12", "cobalamin", "methylcobalamin", "cyanocobalamin", "hydroxocobalamin"],
    category: "vitamin",
    forms: {
      methylcobalamin: { absorption: "high (sublingual)", notes: "Active form. Preferred for MTHFR variants." },
      cyanocobalamin: { absorption: "moderate", notes: "Synthetic. Most studied. Needs conversion." },
    },
    adult_dose_range: { min: 500, max: 2000, unit: "mcg" },
    upper_limit: { value: null, unit: "no established UL (water-soluble)", source: "NIH ODS" },
    timing: { best_time: "morning", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "2.6 mcg/day RDA. Deficiency causes neural tube defects." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Often deficient (reduced absorption). 500-1000 mcg recommended." },
    },
    interactions: [],
    common_goals: ["energy", "nerve health", "deficiency", "vegan diet"],
    reference_ids: [],
  },

  folate: {
    canonical: "folate",
    aliases: ["folic acid", "methylfolate", "5-mthf", "l-methylfolate", "vitamin b9"],
    category: "vitamin",
    adult_dose_range: { min: 400, max: 800, unit: "mcg DFE" },
    upper_limit: { value: 1000, unit: "mcg/day (folic acid, not food folate)", source: "NIH ODS" },
    timing: { best_time: "morning", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "600 mcg/day RDA. Critical for neural tube defect prevention." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Can mask B12 deficiency. Check B12 levels." },
    },
    interactions: [
      { with: "methotrexate", severity: "high", mechanism: "Folate antagonizes methotrexate's mechanism. Discuss with oncologist.", timing_fix: null },
    ],
    common_goals: ["pregnancy", "neural tube prevention", "mood", "MTHFR support"],
    reference_ids: [],
  },

  "vitamin a": {
    canonical: "vitamin a",
    aliases: ["retinol", "retinyl palmitate", "beta-carotene", "cod liver oil"],
    category: "vitamin",
    forms: {
      retinol: { absorption: "high", notes: "Preformed. Accumulates. Teratogenic at high doses." },
      "beta-carotene": { absorption: "moderate", notes: "Provitamin A. Body regulates conversion. Safer in pregnancy." },
    },
    adult_dose_range: { min: 700, max: 900, unit: "mcg RAE" },
    upper_limit: { value: 3000, unit: "mcg/day (preformed retinol)", source: "NIH ODS" },
    timing: { best_time: "with fat-containing meal", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Excess preformed retinol is teratogenic. Max 3,000 mcg/day. Beta-carotene is safer." },
      renal: { safe: true, notes: "Generally safe at normal doses." },
      elderly: { safe: true, notes: "Use caution with liver supplements (high retinol)." },
    },
    interactions: [
      { with: "isotretinoin", severity: "high", mechanism: "Both are retinoids. Hypervitaminosis A risk.", timing_fix: null },
      { with: "warfarin", severity: "moderate", mechanism: "High-dose vitamin A may increase anticoagulant effect.", timing_fix: null },
    ],
    common_goals: ["vision", "immune", "skin"],
    reference_ids: ["rothman-1995", "ods-vitamin-a-2023"],
  },

  ashwagandha: {
    canonical: "ashwagandha",
    aliases: ["withania somnifera", "ksm-66", "sensoril"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 600, unit: "mg (root extract)" },
    upper_limit: { value: null, unit: "no established UL", source: "Traditional use" },
    timing: { best_time: "morning or evening", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Limited safety data. May have abortifacient properties. Avoid." },
      renal: { safe: true, notes: "No known renal concerns at normal doses." },
      elderly: { safe: true, notes: "May interact with thyroid medications." },
    },
    interactions: [
      { with: "levothyroxine", severity: "moderate", mechanism: "May stimulate thyroid hormone production, destabilizing levels.", timing_fix: null },
      { with: "immunosuppressants", severity: "moderate", mechanism: "May stimulate immune system, opposing immunosuppression.", timing_fix: null },
      { with: "benzodiazepines", severity: "low", mechanism: "Additive sedation possible.", timing_fix: null },
    ],
    common_goals: ["anxiety", "sleep", "energy", "cortisol management"],
    reference_ids: [],
  },

  rhodiola: {
    canonical: "rhodiola",
    aliases: ["rhodiola rosea", "golden root", "arctic root"],
    category: "supplement",
    adult_dose_range: { min: 200, max: 600, unit: "mg (extract)" },
    upper_limit: { value: null, unit: "no established UL", source: "Traditional use" },
    timing: { best_time: "morning (stimulating)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid." },
      renal: { safe: true, notes: "No known renal concerns." },
      elderly: { safe: true, notes: "Start low. Has stimulant and MAO-modulating properties." },
    },
    interactions: [
      { with: "SSRIs/SNRIs", severity: "high", mechanism: "MAO-modulating + serotonergic. Serotonin syndrome risk.", timing_fix: null },
      { with: "stimulant medications", severity: "moderate", mechanism: "Additive stimulant effects. BP/HR increase.", timing_fix: null },
    ],
    common_goals: ["energy", "focus", "stress resilience", "endurance"],
    reference_ids: ["panossian-2010"],
  },

  "5-htp": {
    canonical: "5-htp",
    aliases: ["5-hydroxytryptophan", "griffonia", "griffonia simplicifolia"],
    category: "supplement",
    adult_dose_range: { min: 50, max: 200, unit: "mg" },
    upper_limit: { value: null, unit: "no established UL", source: "Limited data" },
    timing: { best_time: "evening (for sleep) or with meals (for mood)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Serotonin effects concerning. Avoid." },
      renal: { safe: true, notes: "No specific renal concerns." },
      elderly: { safe: true, notes: "Start low. Monitor for serotonergic effects." },
    },
    interactions: [
      { with: "SSRIs/SNRIs/MAOIs", severity: "high", mechanism: "Both raise serotonin. Serotonin syndrome risk.", timing_fix: null },
      { with: "tramadol", severity: "high", mechanism: "Tramadol has serotonergic activity. Additive risk.", timing_fix: null },
      { with: "carbidopa", severity: "high", mechanism: "Carbidopa enhances 5-HTP conversion to serotonin peripherally.", timing_fix: null },
    ],
    common_goals: ["sleep", "mood", "anxiety", "appetite control"],
    reference_ids: ["boyer-shannon-2005"],
  },

  melatonin: {
    canonical: "melatonin",
    aliases: [],
    category: "supplement",
    adult_dose_range: { min: 0.5, max: 5, unit: "mg" },
    upper_limit: { value: null, unit: "no established UL. Most adults need 0.5-3 mg.", source: "Clinical consensus" },
    timing: { best_time: "30-60 min before bed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Limited safety data. Not recommended without provider guidance." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Start at 0.5-1 mg. Higher doses often unnecessary and can cause grogginess." },
    },
    interactions: [
      { with: "blood thinners", severity: "low", mechanism: "May have mild antiplatelet activity.", timing_fix: null },
      { with: "immunosuppressants", severity: "moderate", mechanism: "May stimulate immune function.", timing_fix: null },
      { with: "diabetes medications", severity: "low", mechanism: "May affect blood sugar regulation.", timing_fix: null },
    ],
    common_goals: ["sleep", "jet lag", "circadian rhythm"],
    reference_ids: ["briggs-2017"],
  },

  valerian: {
    canonical: "valerian",
    aliases: ["valerian root", "valeriana officinalis"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 600, unit: "mg (extract)" },
    upper_limit: { value: null, unit: "no established UL", source: "Traditional use" },
    timing: { best_time: "30-60 min before bed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid." },
      renal: { safe: true, notes: "No known renal concerns." },
      elderly: { safe: true, notes: "May cause excessive sedation. Start low." },
    },
    interactions: [
      { with: "benzodiazepines/sleep aids", severity: "moderate", mechanism: "Additive sedation.", timing_fix: null },
      { with: "alcohol", severity: "moderate", mechanism: "Additive CNS depression.", timing_fix: null },
    ],
    common_goals: ["sleep", "anxiety"],
    reference_ids: [],
  },

  kava: {
    canonical: "kava",
    aliases: ["kava kava", "piper methysticum"],
    category: "supplement",
    adult_dose_range: { min: 100, max: 250, unit: "mg kavalactones" },
    upper_limit: { value: null, unit: "limit duration to 3 months", source: "WHO/FDA" },
    timing: { best_time: "evening", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Avoid. Uterotonic effects reported." },
      renal: { safe: true, notes: "No specific renal concerns." },
      elderly: { safe: false, notes: "Higher hepatotoxicity risk. Avoid if liver concerns." },
    },
    interactions: [
      { with: "acetaminophen", severity: "high", mechanism: "Additive hepatotoxicity.", timing_fix: null },
      { with: "alcohol", severity: "high", mechanism: "Additive hepatotoxicity + CNS depression.", timing_fix: null },
      { with: "benzodiazepines", severity: "moderate", mechanism: "Additive sedation + potential hepatotoxicity.", timing_fix: null },
    ],
    common_goals: ["anxiety", "relaxation", "sleep"],
    reference_ids: ["fda-kava-2002", "teschke-2010"],
  },

  "st. john's wort": {
    canonical: "st. john's wort",
    aliases: ["st john's wort", "st johns wort", "hypericum", "hypericum perforatum"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 900, unit: "mg (standardized extract)" },
    upper_limit: { value: null, unit: "no established UL", source: "Clinical use" },
    timing: { best_time: "with meals (3x daily)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. May cause uterine contractions. Avoid." },
      renal: { safe: true, notes: "No specific renal concerns." },
      elderly: { safe: true, notes: "Significant drug interaction potential. Review medication list." },
    },
    interactions: [
      { with: "SSRIs/SNRIs", severity: "high", mechanism: "Serotonin syndrome risk.", timing_fix: null },
      { with: "birth control pills", severity: "high", mechanism: "Induces CYP3A4. Reduces contraceptive effectiveness.", timing_fix: null },
      { with: "warfarin", severity: "high", mechanism: "Induces CYP enzymes. Reduces warfarin levels.", timing_fix: null },
      { with: "cyclosporine", severity: "high", mechanism: "Induces metabolism. Can cause organ rejection.", timing_fix: null },
    ],
    common_goals: ["mood", "mild depression"],
    reference_ids: [],
  },

  turmeric: {
    canonical: "turmeric",
    aliases: ["curcumin", "curcuma longa", "theracurmin", "meriva"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1500, unit: "mg (curcumin extract)" },
    upper_limit: { value: null, unit: "no established UL. GI upset common above 2g.", source: "Clinical use" },
    timing: { best_time: "with meals (fat improves absorption)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Culinary amounts fine. Supplemental doses lack safety data — avoid." },
      renal: { safe: true, notes: "May increase oxalate. Use caution if kidney stone history." },
      elderly: { safe: true, notes: "Generally safe. Watch if on blood thinners." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Antiplatelet effects at supplement doses.", timing_fix: null },
      { with: "diabetes medications", severity: "low", mechanism: "May lower blood sugar. Monitor.", timing_fix: null },
    ],
    common_goals: ["inflammation", "joint pain", "antioxidant"],
    reference_ids: [],
  },

  "fish oil": {
    canonical: "fish oil",
    aliases: ["omega-3", "omega 3", "epa", "dha", "cod liver oil", "krill oil"],
    category: "supplement",
    adult_dose_range: { min: 1000, max: 3000, unit: "mg EPA+DHA" },
    upper_limit: { value: 3000, unit: "mg EPA+DHA/day", source: "FDA (GRAS up to 3g)" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Beneficial. 200-300 mg DHA/day recommended. Avoid cod liver oil (vitamin A)." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Watch if on blood thinners (mild antiplatelet effect)." },
    },
    interactions: [
      { with: "blood thinners", severity: "low", mechanism: "Mild antiplatelet effect at high doses.", timing_fix: null },
      { with: "blood pressure medications", severity: "low", mechanism: "May slightly lower BP (additive effect).", timing_fix: null },
    ],
    common_goals: ["cardiovascular", "inflammation", "brain health", "triglycerides"],
    reference_ids: [],
  },

  coq10: {
    canonical: "coq10",
    aliases: ["coenzyme q10", "ubiquinol", "ubiquinone"],
    category: "supplement",
    forms: {
      ubiquinol: { absorption: "high", notes: "Active/reduced form. Preferred for 40+ or statin users." },
      ubiquinone: { absorption: "moderate", notes: "Oxidized form. Cheaper but less bioavailable." },
    },
    adult_dose_range: { min: 100, max: 300, unit: "mg" },
    upper_limit: { value: null, unit: "no established UL. Generally safe up to 1200 mg.", source: "Clinical trials" },
    timing: { best_time: "with meals (fat)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Limited data at supplemental doses. Likely safe." },
      renal: { safe: true, notes: "Generally safe." },
      elderly: { safe: true, notes: "Often recommended with statins to offset CoQ10 depletion." },
    },
    interactions: [
      { with: "warfarin", severity: "moderate", mechanism: "Structurally similar to vitamin K. May reduce INR.", timing_fix: null },
      { with: "blood pressure meds", severity: "low", mechanism: "May lower BP slightly (additive).", timing_fix: null },
    ],
    common_goals: ["energy", "heart health", "statin side effects", "migraines"],
    reference_ids: [],
  },

  nac: {
    canonical: "nac",
    aliases: ["n-acetyl cysteine", "n-acetylcysteine"],
    category: "supplement",
    adult_dose_range: { min: 600, max: 1800, unit: "mg" },
    upper_limit: { value: null, unit: "no established UL", source: "Clinical use" },
    timing: { best_time: "between meals", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Used medically (acetaminophen overdose). Limited data for daily supplementation." },
      renal: { safe: true, notes: "Sometimes used to protect kidneys from contrast dye." },
      elderly: { safe: true, notes: "Generally safe." },
    },
    interactions: [
      { with: "nitroglycerin", severity: "moderate", mechanism: "May potentiate vasodilatory effect. Headache/hypotension risk.", timing_fix: null },
      { with: "activated charcoal", severity: "moderate", mechanism: "Charcoal may bind NAC, reducing effectiveness.", timing_fix: "1h separation" },
    ],
    common_goals: ["liver support", "antioxidant", "respiratory", "mood"],
    reference_ids: [],
  },

  berberine: {
    canonical: "berberine",
    aliases: ["berberine hcl", "goldenseal"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1500, unit: "mg (divided doses)" },
    upper_limit: { value: null, unit: "no established UL. GI issues common above 1500 mg.", source: "Clinical use" },
    timing: { best_time: "with meals (2-3x daily)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May cross placenta. Potential fetal harm. Avoid." },
      renal: { safe: true, notes: "No specific renal concerns." },
      elderly: { safe: true, notes: "Watch for hypoglycemia if on diabetes meds." },
    },
    interactions: [
      { with: "metformin", severity: "moderate", mechanism: "Both lower blood glucose. Hypoglycemia risk. Also inhibits CYP2D6/CYP3A4.", timing_fix: null },
      { with: "cyclosporine", severity: "high", mechanism: "Inhibits CYP3A4. Raises cyclosporine levels.", timing_fix: null },
    ],
    common_goals: ["blood sugar", "cholesterol", "gut health", "PCOS"],
    reference_ids: [],
  },

  creatine: {
    canonical: "creatine",
    aliases: ["creatine monohydrate", "creapure"],
    category: "supplement",
    adult_dose_range: { min: 3, max: 5, unit: "g/day (maintenance)" },
    upper_limit: { value: null, unit: "no established UL. 3-5g/day well-studied.", source: "ISSN Position Stand" },
    timing: { best_time: "any time (consistency matters)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. Not recommended." },
      renal: { safe: false, notes: "May raise creatinine (not kidney damage, but confounds labs). Avoid with existing CKD." },
      elderly: { safe: true, notes: "Beneficial for muscle mass and cognitive function." },
    },
    interactions: [],
    common_goals: ["muscle", "strength", "cognitive", "exercise performance"],
    reference_ids: [],
  },

  "green tea extract": {
    canonical: "green tea extract",
    aliases: ["gte", "egcg", "epigallocatechin gallate", "matcha extract"],
    category: "supplement",
    adult_dose_range: { min: 250, max: 500, unit: "mg EGCG" },
    upper_limit: { value: 800, unit: "mg EGCG/day", source: "EFSA" },
    timing: { best_time: "with food (reduces hepatotoxicity risk)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "High EGCG may reduce folate absorption. Avoid concentrated extracts." },
      renal: { safe: true, notes: "Generally safe at normal doses." },
      elderly: { safe: true, notes: "Watch for liver concerns. Take with food." },
    },
    interactions: [
      { with: "acetaminophen", severity: "moderate", mechanism: "Additive hepatotoxicity risk.", timing_fix: null },
      { with: "nadolol", severity: "moderate", mechanism: "May reduce absorption of beta-blockers.", timing_fix: null },
      { with: "iron supplements", severity: "low", mechanism: "EGCG may reduce iron absorption.", timing_fix: "2h separation" },
    ],
    common_goals: ["weight loss", "antioxidant", "energy", "metabolism"],
    reference_ids: ["mazzanti-2009"],
  },

  ginseng: {
    canonical: "ginseng",
    aliases: ["panax ginseng", "korean ginseng", "american ginseng", "panax quinquefolius"],
    category: "supplement",
    adult_dose_range: { min: 200, max: 400, unit: "mg (standardized extract)" },
    upper_limit: { value: null, unit: "no established UL", source: "Traditional use" },
    timing: { best_time: "morning (stimulating)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid." },
      renal: { safe: true, notes: "No specific renal concerns." },
      elderly: { safe: true, notes: "May lower blood sugar. Monitor if on diabetes meds." },
    },
    interactions: [
      { with: "warfarin", severity: "moderate", mechanism: "May reduce warfarin effectiveness.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "Additive blood sugar lowering.", timing_fix: null },
      { with: "MAOIs", severity: "moderate", mechanism: "Possible additive stimulant/serotonergic effects.", timing_fix: null },
    ],
    common_goals: ["energy", "focus", "immune", "libido"],
    reference_ids: [],
  },

  // ── Medications (key ones that interact with supplements) ──

  sertraline: {
    canonical: "sertraline",
    aliases: ["zoloft"],
    category: "medication",
    adult_dose_range: { min: 25, max: 200, unit: "mg/day" },
    upper_limit: { value: 200, unit: "mg/day", source: "FDA prescribing information" },
    timing: { best_time: "morning or evening (consistent)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Considered one of the safer SSRIs in pregnancy. Risk-benefit discussion with provider." },
      renal: { safe: true, notes: "No dose adjustment needed for mild-moderate CKD." },
      elderly: { safe: true, notes: "Start low (25 mg). Increased fall risk with all SSRIs." },
    },
    interactions: [
      { with: "5-HTP/St. John's Wort", severity: "high", mechanism: "Serotonin syndrome risk.", timing_fix: null },
      { with: "tramadol", severity: "high", mechanism: "Serotonin syndrome risk + seizure threshold lowering.", timing_fix: null },
      { with: "blood thinners", severity: "moderate", mechanism: "SSRIs impair platelet function. Increased bleeding risk.", timing_fix: null },
    ],
    common_goals: ["depression", "anxiety", "OCD", "PTSD"],
    reference_ids: ["boyer-shannon-2005"],
  },

  warfarin: {
    canonical: "warfarin",
    aliases: ["coumadin", "jantoven"],
    category: "medication",
    adult_dose_range: { min: 2, max: 10, unit: "mg/day (INR-guided)" },
    upper_limit: { value: null, unit: "INR-guided dosing", source: "Clinical monitoring" },
    timing: { best_time: "evening (same time daily)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Teratogenic. Contraindicated especially in first trimester." },
      renal: { safe: true, notes: "No dose adjustment but increased bleeding risk." },
      elderly: { safe: true, notes: "Higher bleeding risk. More frequent INR monitoring needed." },
    },
    interactions: [
      { with: "vitamin K/K2", severity: "high", mechanism: "Opposes warfarin mechanism. Reduces INR.", timing_fix: null },
      { with: "turmeric/fish oil/ginkgo", severity: "moderate", mechanism: "Antiplatelet effects. Additive bleeding risk.", timing_fix: null },
      { with: "St. John's Wort", severity: "high", mechanism: "Induces CYP enzymes. Reduces warfarin levels.", timing_fix: null },
      { with: "NSAIDs", severity: "high", mechanism: "Antiplatelet + GI mucosal damage. High bleeding risk.", timing_fix: null },
    ],
    common_goals: ["anticoagulation", "atrial fibrillation", "DVT/PE prevention"],
    reference_ids: ["lanas-2006"],
  },

  levothyroxine: {
    canonical: "levothyroxine",
    aliases: ["synthroid", "levoxyl", "tirosint", "euthyrox"],
    category: "medication",
    adult_dose_range: { min: 25, max: 200, unit: "mcg/day" },
    upper_limit: { value: null, unit: "TSH-guided dosing", source: "Clinical monitoring" },
    timing: { best_time: "30-60 min before breakfast on empty stomach", with_food: false, separate_from: ["calcium", "iron", "magnesium", "coffee", "fiber"] },
    populations: {
      pregnancy: { safe: true, notes: "Essential to continue. Dose often needs increase by 30-50% in pregnancy." },
      renal: { safe: true, notes: "No dose adjustment needed." },
      elderly: { safe: true, notes: "Start low (25-50 mcg). Cardiac risk with over-replacement." },
    },
    interactions: [
      { with: "calcium", severity: "high", mechanism: "Reduces absorption significantly.", timing_fix: "4h separation" },
      { with: "iron", severity: "high", mechanism: "Reduces absorption significantly.", timing_fix: "4h separation" },
      { with: "magnesium", severity: "moderate", mechanism: "May reduce absorption.", timing_fix: "4h separation" },
      { with: "coffee", severity: "moderate", mechanism: "Reduces absorption.", timing_fix: "30-60 min separation" },
    ],
    common_goals: ["hypothyroidism", "thyroid hormone replacement"],
    reference_ids: [],
  },

  metformin: {
    canonical: "metformin",
    aliases: ["glucophage", "fortamet", "glumetza"],
    category: "medication",
    adult_dose_range: { min: 500, max: 2000, unit: "mg/day" },
    upper_limit: { value: 2550, unit: "mg/day", source: "FDA prescribing information" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Generally considered safe. Used for gestational diabetes." },
      renal: { safe: false, notes: "Contraindicated if eGFR <30. Dose reduce if eGFR 30-45." },
      elderly: { safe: true, notes: "Monitor renal function. B12 deficiency more common." },
    },
    interactions: [
      { with: "alcohol", severity: "moderate", mechanism: "Increased lactic acidosis risk. Especially with heavy drinking.", timing_fix: null },
      { with: "berberine", severity: "moderate", mechanism: "Additive blood sugar lowering. Hypoglycemia risk.", timing_fix: null },
      { with: "contrast dye", severity: "high", mechanism: "Hold metformin 48h before/after contrast. Lactic acidosis risk.", timing_fix: null },
    ],
    common_goals: ["type 2 diabetes", "blood sugar management", "PCOS"],
    reference_ids: ["defrances-2008"],
  },

  lisinopril: {
    canonical: "lisinopril",
    aliases: ["prinivil", "zestril"],
    category: "medication",
    adult_dose_range: { min: 5, max: 40, unit: "mg/day" },
    upper_limit: { value: 80, unit: "mg/day", source: "FDA prescribing information" },
    timing: { best_time: "morning (consistent time)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Contraindicated. ACE inhibitors cause fetal harm." },
      renal: { safe: true, notes: "Renoprotective in diabetic nephropathy. Monitor potassium and creatinine." },
      elderly: { safe: true, notes: "Start low. Monitor potassium." },
    },
    interactions: [
      { with: "potassium supplements", severity: "high", mechanism: "Hyperkalemia risk. ACE inhibitors raise potassium.", timing_fix: null },
      { with: "NSAIDs", severity: "moderate", mechanism: "Reduces antihypertensive effect. Increases kidney injury risk.", timing_fix: null },
      { with: "lithium", severity: "moderate", mechanism: "ACE inhibitors reduce lithium clearance.", timing_fix: null },
    ],
    common_goals: ["blood pressure", "heart failure", "kidney protection"],
    reference_ids: ["palmer-2004"],
  },

  lithium: {
    canonical: "lithium",
    aliases: ["lithobid", "eskalith"],
    category: "medication",
    adult_dose_range: { min: 300, max: 1200, unit: "mg/day (level-guided)" },
    upper_limit: { value: null, unit: "serum level 0.6-1.2 mEq/L", source: "Clinical monitoring" },
    timing: { best_time: "with meals (reduces GI effects)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Teratogenic risk (Ebstein's anomaly). Risk-benefit discussion required." },
      renal: { safe: false, notes: "Nephrotoxic long-term. Requires renal monitoring." },
      elderly: { safe: true, notes: "Lower doses needed. Increased toxicity risk." },
    },
    interactions: [
      { with: "NSAIDs", severity: "high", mechanism: "NSAIDs reduce renal clearance. Raises lithium to toxic levels.", timing_fix: null },
      { with: "ACE inhibitors/ARBs", severity: "high", mechanism: "Reduce lithium clearance. Toxicity risk.", timing_fix: null },
      { with: "diuretics (thiazide)", severity: "high", mechanism: "Reduce lithium clearance. Toxicity risk.", timing_fix: null },
      { with: "caffeine", severity: "low", mechanism: "Caffeine increases lithium excretion. Abrupt cessation can raise levels.", timing_fix: null },
    ],
    common_goals: ["bipolar disorder", "mood stabilization"],
    reference_ids: ["handler-2006", "lexi-comp-2023"],
  },

  ibuprofen: {
    canonical: "ibuprofen",
    aliases: ["advil", "motrin", "nurofen"],
    category: "medication",
    adult_dose_range: { min: 200, max: 800, unit: "mg per dose (max 3200/day)" },
    upper_limit: { value: 3200, unit: "mg/day (prescription max)", source: "FDA" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Avoid in 3rd trimester (premature ductus closure). Caution in 1st/2nd trimester." },
      renal: { safe: false, notes: "Reduces renal blood flow. Avoid in CKD. Acute kidney injury risk." },
      elderly: { safe: false, notes: "Higher GI bleeding and renal risk. Use lowest dose for shortest duration." },
    },
    interactions: [
      { with: "blood thinners", severity: "high", mechanism: "Antiplatelet + GI mucosal damage. High bleeding risk.", timing_fix: null },
      { with: "lithium", severity: "high", mechanism: "Reduces lithium clearance. Toxicity risk.", timing_fix: null },
      { with: "ACE inhibitors/ARBs", severity: "moderate", mechanism: "Reduces antihypertensive effect. AKI risk (triple whammy with diuretic).", timing_fix: null },
      { with: "methotrexate", severity: "high", mechanism: "Reduces clearance. Methotrexate toxicity risk.", timing_fix: null },
    ],
    common_goals: ["pain", "inflammation", "fever", "headache"],
    reference_ids: ["lanas-2006", "warner-2011"],
  },

  acetaminophen: {
    canonical: "acetaminophen",
    aliases: ["tylenol", "paracetamol", "apap"],
    category: "medication",
    adult_dose_range: { min: 325, max: 1000, unit: "mg per dose" },
    upper_limit: { value: 3000, unit: "mg/day (4000 max, 3000 if alcohol)", source: "FDA" },
    timing: { best_time: "as needed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Generally considered safest OTC analgesic in pregnancy. Avoid chronic high-dose use." },
      renal: { safe: true, notes: "Preferred over NSAIDs in CKD. Standard dose limits still apply." },
      elderly: { safe: true, notes: "Safer than NSAIDs. Max 3000 mg/day. Monitor with liver disease." },
    },
    interactions: [
      { with: "alcohol", severity: "high", mechanism: "Combined liver toxicity. Max 2000 mg/day with regular alcohol use.", timing_fix: null },
      { with: "warfarin", severity: "moderate", mechanism: "Regular use may increase INR. Occasional use OK but monitor.", timing_fix: null },
    ],
    common_goals: ["pain", "fever", "headache"],
    reference_ids: [],
  },

  aspirin: {
    canonical: "aspirin",
    aliases: ["asa", "bayer", "ecotrin", "bufferin"],
    category: "medication",
    adult_dose_range: { min: 81, max: 650, unit: "mg (81 mg for cardiac, 325-650 mg for pain)" },
    upper_limit: { value: 4000, unit: "mg/day", source: "FDA" },
    timing: { best_time: "with food", with_food: true, separate_from: ["ibuprofen"] },
    populations: {
      pregnancy: { safe: false, notes: "Avoid in 3rd trimester. Low-dose (81 mg) sometimes used under OB supervision for preeclampsia prevention." },
      renal: { safe: false, notes: "Reduces renal blood flow like other NSAIDs. Use caution in CKD." },
      elderly: { safe: true, notes: "Low-dose widely used for cardiac prevention. Higher bleeding risk with age." },
    },
    interactions: [
      { with: "warfarin/anticoagulants", severity: "high", mechanism: "Additive antiplatelet + anticoagulant = major bleeding risk.", timing_fix: null },
      { with: "ibuprofen", severity: "moderate", mechanism: "Ibuprofen can block aspirin's antiplatelet effect if taken first. Take aspirin 30 min before ibuprofen.", timing_fix: "Take aspirin 30 min before NSAID" },
      { with: "ginkgo", severity: "moderate", mechanism: "Additive antiplatelet effects. Increased bleeding risk.", timing_fix: null },
    ],
    common_goals: ["cardiac prevention", "pain", "anti-inflammatory", "fever"],
    reference_ids: [],
  },

  omeprazole: {
    canonical: "omeprazole",
    aliases: ["prilosec", "nexium", "esomeprazole", "pantoprazole", "protonix", "lansoprazole", "prevacid", "ppi"],
    category: "medication",
    adult_dose_range: { min: 20, max: 40, unit: "mg/day" },
    timing: { best_time: "30 min before breakfast", with_food: false, separate_from: ["iron", "calcium carbonate", "b12"] },
    populations: {
      pregnancy: { safe: true, notes: "Omeprazole category C. Lansoprazole may be preferred. Short-term use generally safe." },
      renal: { safe: true, notes: "No dose adjustment needed. Watch for hypomagnesemia with long-term use." },
      elderly: { safe: true, notes: "Long-term use: monitor B12, magnesium, bone density. Shortest effective duration." },
    },
    interactions: [
      { with: "clopidogrel", severity: "high", mechanism: "Omeprazole inhibits CYP2C19 which activates clopidogrel. Reduced antiplatelet effect. Use pantoprazole instead.", timing_fix: null },
      { with: "iron", severity: "moderate", mechanism: "Reduced stomach acid impairs iron absorption.", timing_fix: "Take iron 2h before PPI" },
      { with: "calcium carbonate", severity: "moderate", mechanism: "Needs acid for absorption. Use calcium citrate instead with PPIs.", timing_fix: null },
      { with: "B12", severity: "moderate", mechanism: "Long-term PPI reduces B12 absorption. Consider sublingual B12.", timing_fix: null },
      { with: "magnesium", severity: "moderate", mechanism: "Long-term PPI use linked to hypomagnesemia. Monitor levels.", timing_fix: null },
    ],
    common_goals: ["acid reflux", "GERD", "ulcers", "heartburn"],
    reference_ids: [],
  },

  ginkgo: {
    canonical: "ginkgo",
    aliases: ["ginkgo biloba", "ginko", "ginkgo extract"],
    category: "supplement",
    adult_dose_range: { min: 120, max: 240, unit: "mg standardized extract/day" },
    upper_limit: { value: 240, unit: "mg/day", source: "EMA" },
    timing: { best_time: "morning", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Antiplatelet activity is a concern." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Common use for cognitive support. Watch for bleeding with polypharmacy." },
    },
    interactions: [
      { with: "blood thinners (warfarin, aspirin, clopidogrel)", severity: "high", mechanism: "Antiplatelet activity. Additive bleeding risk.", timing_fix: null },
      { with: "NSAIDs", severity: "moderate", mechanism: "Added bleeding risk. Monitor for bruising.", timing_fix: null },
      { with: "SSRIs", severity: "moderate", mechanism: "Possible serotonergic interaction + bleeding risk (SSRIs also have antiplatelet effects).", timing_fix: null },
    ],
    common_goals: ["memory", "cognitive function", "circulation", "tinnitus"],
    reference_ids: [],
  },

  "d-mannose": {
    canonical: "d-mannose",
    aliases: ["d mannose", "mannose"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 2000, unit: "mg/day (preventive), up to 2g every 2-3h for acute UTI" },
    timing: { best_time: "any time", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Limited data but generally considered safe. Some OBs recommend for recurrent UTI prevention." },
      renal: { safe: true, notes: "Excreted renally. No evidence of harm but limited CKD data." },
      elderly: { safe: true, notes: "Safe. Useful for recurrent UTI prevention in post-menopausal women." },
    },
    interactions: [],
    common_goals: ["UTI prevention", "urinary tract health", "bladder health"],
    reference_ids: [],
  },

  "milk thistle": {
    canonical: "milk thistle",
    aliases: ["silymarin", "milk thistle extract"],
    category: "supplement",
    adult_dose_range: { min: 140, max: 420, unit: "mg silymarin/day" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid unless directed by provider." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Generally well tolerated. May interact with CYP-metabolized drugs." },
    },
    interactions: [
      { with: "CYP3A4/CYP2C9 substrates", severity: "moderate", mechanism: "May inhibit CYP enzymes, raising blood levels of certain drugs.", timing_fix: null },
      { with: "metformin", severity: "moderate", mechanism: "May potentiate blood sugar lowering. Monitor glucose.", timing_fix: null },
    ],
    common_goals: ["liver support", "detox", "liver protection"],
    reference_ids: [],
  },

  cbd: {
    canonical: "cbd",
    aliases: ["cannabidiol", "cbd oil", "hemp extract"],
    category: "supplement",
    adult_dose_range: { min: 10, max: 50, unit: "mg/day (typical supplement range)" },
    timing: { best_time: "variable", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "FDA advises against CBD use during pregnancy. Insufficient safety data." },
      renal: { safe: true, notes: "No significant renal concerns at supplement doses." },
      elderly: { safe: true, notes: "Start low. Increased sensitivity to sedation. Monitor for drug interactions." },
    },
    interactions: [
      { with: "clobazam", severity: "high", mechanism: "CBD inhibits CYP2C19. Significantly raises clobazam levels. Excessive sedation risk.", timing_fix: null },
      { with: "blood thinners (warfarin)", severity: "moderate", mechanism: "CBD inhibits CYP2C9. May increase warfarin levels and INR.", timing_fix: null },
      { with: "benzodiazepines", severity: "moderate", mechanism: "Additive sedation. Start with lower doses.", timing_fix: null },
      { with: "SSRIs", severity: "moderate", mechanism: "CBD inhibits CYP2D6. May raise SSRI levels.", timing_fix: null },
    ],
    common_goals: ["anxiety", "pain", "sleep", "inflammation"],
    reference_ids: [],
  },

  glucosamine: {
    canonical: "glucosamine",
    aliases: ["glucosamine sulfate", "glucosamine hcl", "glucosamine chondroitin"],
    category: "supplement",
    adult_dose_range: { min: 1500, max: 1500, unit: "mg glucosamine sulfate/day" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Common use for osteoarthritis. May take 4-8 weeks for effect." },
    },
    interactions: [
      { with: "warfarin", severity: "moderate", mechanism: "Case reports of increased INR. Monitor if on warfarin.", timing_fix: null },
    ],
    common_goals: ["joint health", "arthritis", "cartilage", "knee pain"],
    reference_ids: [],
  },

  probiotics: {
    canonical: "probiotics",
    aliases: ["probiotic", "lactobacillus", "bifidobacterium", "saccharomyces"],
    category: "supplement",
    adult_dose_range: { min: 1, max: 100, unit: "billion CFU/day (strain-dependent)" },
    timing: { best_time: "with food or 30 min before", with_food: true, separate_from: ["antibiotics (2h separation)"] },
    populations: {
      pregnancy: { safe: true, notes: "Generally safe. Lactobacillus and Bifidobacterium strains well-studied." },
      renal: { safe: true, notes: "Safe. No renal concerns." },
      elderly: { safe: true, notes: "Safe. May help with antibiotic-associated diarrhea." },
    },
    interactions: [
      { with: "antibiotics", severity: "moderate", mechanism: "Antibiotics kill probiotics. Separate by 2+ hours. Continue probiotics 1-2 weeks after antibiotic course.", timing_fix: "2h separation from antibiotic dose" },
      { with: "immunosuppressants", severity: "moderate", mechanism: "Theoretical infection risk in severely immunocompromised. Discuss with provider.", timing_fix: null },
    ],
    common_goals: ["gut health", "digestion", "immune support", "antibiotic recovery"],
    reference_ids: [],
  },

  collagen: {
    canonical: "collagen",
    aliases: ["collagen peptides", "collagen powder", "hydrolyzed collagen", "marine collagen"],
    category: "supplement",
    adult_dose_range: { min: 5, max: 15, unit: "g/day" },
    timing: { best_time: "any time", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Generally considered safe. Hydrolyzed collagen is just protein." },
      renal: { safe: true, notes: "High protein content — discuss with nephrologist if on protein restriction." },
      elderly: { safe: true, notes: "May help with joint and skin health. Common use." },
    },
    interactions: [],
    common_goals: ["skin", "hair", "nails", "joints", "gut health"],
    reference_ids: [],
  },

  // ── Women's Health / Reproductive Health ──

  "boric acid": {
    canonical: "boric acid",
    aliases: ["boric acid suppository", "boric acid capsule"],
    category: "supplement",
    adult_dose_range: { min: 600, max: 600, unit: "mg vaginal suppository" },
    timing: { best_time: "bedtime", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Contraindicated in pregnancy. Toxic if ingested or used on broken skin." },
      renal: { safe: true, notes: "Vaginal use only. No systemic renal concerns at standard dose." },
      elderly: { safe: true, notes: "Safe for vaginal use. Effective for recurrent yeast/BV." },
    },
    interactions: [],
    common_goals: ["recurrent yeast infections", "bacterial vaginosis", "vaginal pH balance"],
    reference_ids: [],
  },

  cranberry: {
    canonical: "cranberry",
    aliases: ["cranberry extract", "cranberry pills", "cranberry supplement", "cranberry capsules", "cranberry pacs"],
    category: "supplement",
    adult_dose_range: { min: 36, max: 72, unit: "mg PACs/day (proanthocyanidins)" },
    timing: { best_time: "any time", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Cranberry juice/supplements generally safe in pregnancy for UTI prevention." },
      renal: { safe: true, notes: "Safe. May slightly acidify urine. Drink adequate water." },
      elderly: { safe: true, notes: "Commonly used for recurrent UTI prevention in older women." },
    },
    interactions: [
      { with: "warfarin", severity: "moderate", mechanism: "Cranberry may increase warfarin effect (INR). Monitor if consuming regularly.", timing_fix: null },
    ],
    common_goals: ["UTI prevention", "urinary tract health", "bladder health"],
    reference_ids: [],
  },

  vitex: {
    canonical: "vitex",
    aliases: ["chasteberry", "vitex agnus-castus", "chaste tree"],
    category: "supplement",
    adult_dose_range: { min: 20, max: 40, unit: "mg standardized extract/day" },
    timing: { best_time: "morning", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Avoid in pregnancy. Hormonal effects could affect pregnancy maintenance." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Generally safe. Less common use in post-menopausal women." },
    },
    interactions: [
      { with: "birth control pills", severity: "moderate", mechanism: "May reduce effectiveness of hormonal contraceptives via dopaminergic effects.", timing_fix: null },
      { with: "dopamine agonists/antagonists", severity: "moderate", mechanism: "Vitex has dopaminergic activity. May interact with Parkinson's meds or antipsychotics.", timing_fix: null },
    ],
    common_goals: ["PMS", "menstrual regulation", "cycle irregularity", "hormonal balance", "fertility"],
    reference_ids: [],
  },

  "myo-inositol": {
    canonical: "myo-inositol",
    aliases: ["inositol", "myo inositol", "d-chiro-inositol"],
    category: "supplement",
    adult_dose_range: { min: 2000, max: 4000, unit: "mg/day (often 40:1 myo:d-chiro ratio for PCOS)" },
    timing: { best_time: "divided doses (morning/evening)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Used in pregnancy for gestational diabetes prevention in PCOS. Generally safe." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Safe. Less common use outside metabolic/hormonal context." },
    },
    interactions: [
      { with: "metformin", severity: "moderate", mechanism: "Both improve insulin sensitivity. Additive blood sugar lowering. Monitor glucose.", timing_fix: null },
    ],
    common_goals: ["PCOS", "insulin resistance", "fertility", "egg quality", "anxiety"],
    reference_ids: [],
  },

  "l-carnitine": {
    canonical: "l-carnitine",
    aliases: ["carnitine", "acetyl l carnitine", "alcar", "l carnitine tartrate"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 2000, unit: "mg/day" },
    timing: { best_time: "morning or pre-workout", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Limited data. Likely safe at dietary levels. Discuss with OB for supplemental doses." },
      renal: { safe: true, notes: "Often deficient in dialysis patients. May be supplemented under supervision." },
      elderly: { safe: true, notes: "May benefit cognitive function (acetyl-L-carnitine form). Safe." },
    },
    interactions: [
      { with: "thyroid medications", severity: "moderate", mechanism: "L-carnitine may reduce thyroid hormone activity. Separate by 4+ hours if on levothyroxine.", timing_fix: "4h separation" },
      { with: "blood thinners", severity: "moderate", mechanism: "May have mild antiplatelet effects. Monitor for bruising.", timing_fix: null },
    ],
    common_goals: ["sperm quality", "male fertility", "energy", "exercise performance", "cognitive function"],
    reference_ids: [],
  },

  fenugreek: {
    canonical: "fenugreek",
    aliases: ["fenugreek seed", "fenugreek extract", "trigonella"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 600, unit: "mg standardized extract/day" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May stimulate uterine contractions. Avoid in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "May lower blood sugar. Monitor if diabetic." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Contains coumarin compounds. May increase bleeding risk.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Additive hypoglycemia risk with metformin/insulin.", timing_fix: null },
    ],
    common_goals: ["testosterone support", "libido", "lactation support", "blood sugar"],
    reference_ids: [],
  },

  "saw palmetto": {
    canonical: "saw palmetto",
    aliases: ["saw palmetto extract", "serenoa repens"],
    category: "supplement",
    adult_dose_range: { min: 320, max: 320, unit: "mg standardized extract/day" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Anti-androgenic effects. Contraindicated in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Common use in older men for BPH symptoms. Safe." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Theoretical antiplatelet effect. Monitor for bruising.", timing_fix: null },
      { with: "finasteride (Proscar/Propecia)", severity: "moderate", mechanism: "Similar mechanism (5-alpha reductase inhibition). Additive effects possible.", timing_fix: null },
      { with: "hormonal contraceptives", severity: "moderate", mechanism: "Anti-androgenic effects may theoretically interact. Limited data.", timing_fix: null },
    ],
    common_goals: ["BPH", "prostate health", "urinary symptoms", "hair loss (men)"],
    reference_ids: [],
  },
};

// ── Lookup functions ──

function getKBEntry(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Direct match
  if (KNOWLEDGE_BASE[lower]) return { id: lower, ...KNOWLEDGE_BASE[lower] };

  // Alias match
  for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
    if (entry.aliases && entry.aliases.some(a => a.toLowerCase() === lower)) {
      return { id, ...entry };
    }
  }

  return null;
}

function getKBEntriesForEntities(entityList) {
  const results = [];
  const seen = new Set();
  for (const name of entityList) {
    const entry = getKBEntry(name);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      results.push(entry);
    }
  }
  return results;
}

function getInteractionsBetween(entityA, entityB) {
  const entryA = getKBEntry(entityA);
  const entryB = getKBEntry(entityB);
  if (!entryA || !entryB) return [];

  // Build match terms for each entry: canonical + aliases + category-based terms
  function matchTerms(entry) {
    const terms = [entry.canonical];
    if (entry.aliases) terms.push(...entry.aliases.map(a => a.toLowerCase()));
    // Add category-based generic terms
    if (entry.category === "medication") {
      if (/\b(warfarin|eliquis|xarelto|pradaxa|heparin)\b/.test(entry.canonical)) {
        terms.push("blood thinner", "blood thinners", "anticoagulant");
      }
      if (/\b(ibuprofen|naproxen|diclofenac|celecoxib|meloxicam|indomethacin|ketorolac)\b/.test(entry.canonical)) {
        terms.push("nsaid", "nsaids");
      }
      if (/\b(sertraline|fluoxetine|escitalopram|citalopram|paroxetine|fluvoxamine)\b/.test(entry.canonical)) {
        terms.push("ssri", "ssris");
      }
      if (/\b(lisinopril|enalapril|ramipril|benazepril)\b/.test(entry.canonical)) {
        terms.push("ace inhibitor", "ace inhibitors", "ace-i");
      }
      if (/\b(losartan|valsartan|irbesartan|olmesartan)\b/.test(entry.canonical)) {
        terms.push("arb", "arbs");
      }
    }
    return terms;
  }

  const termsA = matchTerms(entryA);
  const termsB = matchTerms(entryB);

  function ixMatchesTerms(ix, terms) {
    const w = ix.with.toLowerCase();
    return terms.some(t => w.includes(t));
  }

  const results = [];
  for (const ix of (entryA.interactions || [])) {
    if (ixMatchesTerms(ix, termsB)) {
      results.push({ from: entryA.canonical, ...ix });
    }
  }
  for (const ix of (entryB.interactions || [])) {
    if (ixMatchesTerms(ix, termsA)) {
      results.push({ from: entryB.canonical, ...ix });
    }
  }
  return results;
}

function getAllEntries() {
  return Object.entries(KNOWLEDGE_BASE).map(([id, entry]) => ({ id, ...entry }));
}

module.exports = {
  KNOWLEDGE_BASE,
  getKBEntry,
  getKBEntriesForEntities,
  getInteractionsBetween,
  getAllEntries,
};
