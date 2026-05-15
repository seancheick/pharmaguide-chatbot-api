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
      { with: "dairy/milk", severity: "moderate", mechanism: "Calcium in dairy inhibits iron absorption. Take iron 2+ hours away from milk, cheese, yogurt.", timing_fix: "2h separation from dairy" },
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

  // ── Allergy / Seasonal Support ──

  quercetin: {
    canonical: "quercetin",
    aliases: ["quercetin dihydrate", "quercetin supplement"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1000, unit: "mg/day" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data during pregnancy. Avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Generally well tolerated. May interact with some antibiotics." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Quercetin may inhibit platelet aggregation. Monitor if on anticoagulants.", timing_fix: null },
      { with: "cyclosporine", severity: "moderate", mechanism: "Quercetin inhibits CYP3A4. May raise cyclosporine levels.", timing_fix: null },
      { with: "fluoroquinolone antibiotics", severity: "moderate", mechanism: "Quercetin may interfere with fluoroquinolone activity. Separate by 2+ hours.", timing_fix: "2h separation" },
    ],
    common_goals: ["seasonal allergies", "histamine support", "anti-inflammatory", "antioxidant", "immune support"],
    reference_ids: [],
  },

  "stinging nettle": {
    canonical: "stinging nettle",
    aliases: ["nettle leaf", "nettle root", "urtica dioica", "nettle extract"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 900, unit: "mg dried leaf extract/day" },
    timing: { best_time: "with meals", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May stimulate uterine contractions. Avoid in pregnancy." },
      renal: { safe: true, notes: "Mild diuretic effect. Monitor fluid balance." },
      elderly: { safe: true, notes: "Root form used for BPH. Leaf form for allergies. Generally well tolerated." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Contains vitamin K. May reduce warfarin effectiveness.", timing_fix: null },
      { with: "blood pressure medications", severity: "moderate", mechanism: "May lower BP. Additive hypotension risk.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Monitor glucose.", timing_fix: null },
      { with: "lithium", severity: "moderate", mechanism: "Diuretic effect may reduce lithium clearance.", timing_fix: null },
    ],
    common_goals: ["seasonal allergies", "histamine support", "BPH (root)", "anti-inflammatory"],
    reference_ids: [],
  },

  bromelain: {
    canonical: "bromelain",
    aliases: ["pineapple enzyme", "bromelain supplement"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1000, unit: "mg/day (away from food for anti-inflammatory; with food for digestion)" },
    timing: { best_time: "between meals for allergies, with meals for digestion", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May increase bleeding risk. Avoid supplemental doses in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Generally well tolerated. Watch for GI upset." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Antiplatelet activity. Additive bleeding risk.", timing_fix: null },
      { with: "antibiotics (amoxicillin)", severity: "beneficial", mechanism: "May increase amoxicillin absorption and tissue levels.", timing_fix: null },
    ],
    common_goals: ["seasonal allergies", "sinus congestion", "inflammation", "digestion", "post-surgical swelling"],
    reference_ids: [],
  },

  cetirizine: {
    canonical: "cetirizine",
    aliases: ["zyrtec", "levocetirizine", "xyzal"],
    category: "medication",
    adult_dose_range: { min: 5, max: 10, unit: "mg/day" },
    timing: { best_time: "evening (may cause drowsiness)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Category B. One of the preferred antihistamines in pregnancy." },
      renal: { safe: true, notes: "Reduce dose in severe CKD (5mg/day). Renally cleared." },
      elderly: { safe: true, notes: "Less sedating than diphenhydramine. Preferred in elderly. Start at 5mg." },
    },
    interactions: [
      { with: "alcohol", severity: "moderate", mechanism: "Additive sedation. Avoid or limit alcohol.", timing_fix: null },
      { with: "CNS depressants", severity: "moderate", mechanism: "Additive drowsiness with benzodiazepines, sleep aids, opioids.", timing_fix: null },
    ],
    common_goals: ["seasonal allergies", "hay fever", "hives", "itchy eyes", "runny nose"],
    reference_ids: [],
  },

  loratadine: {
    canonical: "loratadine",
    aliases: ["claritin", "desloratadine", "clarinex"],
    category: "medication",
    adult_dose_range: { min: 10, max: 10, unit: "mg/day" },
    timing: { best_time: "morning (non-drowsy)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Category B. Considered safe in pregnancy. Preferred alongside cetirizine." },
      renal: { safe: true, notes: "Reduce dose in severe CKD or liver disease." },
      elderly: { safe: true, notes: "Non-sedating. Good first choice for elderly patients." },
    },
    interactions: [
      { with: "erythromycin/ketoconazole", severity: "moderate", mechanism: "CYP3A4 inhibitors raise loratadine levels. Rarely clinically significant.", timing_fix: null },
    ],
    common_goals: ["seasonal allergies", "hay fever", "hives", "non-drowsy allergy relief"],
    reference_ids: [],
  },

  diphenhydramine: {
    canonical: "diphenhydramine",
    aliases: ["benadryl", "diphenhydramine hcl"],
    category: "medication",
    adult_dose_range: { min: 25, max: 50, unit: "mg every 4-6h (max 300mg/day)" },
    timing: { best_time: "as needed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Category B. Generally considered safe. Avoid in first trimester if possible." },
      renal: { safe: true, notes: "Anticholinergic effects may worsen urinary retention." },
      elderly: { safe: false, notes: "Beers List: AVOID in elderly. Anticholinergic — causes confusion, falls, urinary retention, dry mouth. Use cetirizine or loratadine instead." },
    },
    interactions: [
      { with: "alcohol", severity: "high", mechanism: "Significant additive sedation. Impaired driving and coordination.", timing_fix: null },
      { with: "benzodiazepines", severity: "high", mechanism: "Additive CNS depression. Respiratory depression risk.", timing_fix: null },
      { with: "MAOIs", severity: "high", mechanism: "MAOIs prolong and intensify anticholinergic effects. Avoid combination.", timing_fix: null },
      { with: "other anticholinergics", severity: "moderate", mechanism: "Additive anticholinergic burden (dry mouth, constipation, urinary retention, confusion).", timing_fix: null },
    ],
    common_goals: ["acute allergic reaction", "hives", "itching", "sleep aid", "motion sickness"],
    reference_ids: [],
  },

  // ── Common Supplements (high-traffic, previously missing) ──

  "vitamin c": {
    canonical: "vitamin c",
    aliases: ["ascorbic acid", "vitamin c supplement", "ester-c"],
    category: "vitamin",
    adult_dose_range: { min: 250, max: 1000, unit: "mg/day" },
    upper_limit: { value: 2000, unit: "mg/day", source: "NIH ODS" },
    timing: { best_time: "any time", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "RDA 85 mg/day. Supplemental doses up to 2000 mg considered safe." },
      renal: { safe: true, notes: "High doses (>1000 mg) may increase oxalate — caution with kidney stone history." },
      elderly: { safe: true, notes: "Safe. May support immune function and wound healing." },
    },
    interactions: [
      { with: "iron", severity: "beneficial", mechanism: "Enhances non-heme iron absorption significantly. Take together.", timing_fix: null },
      { with: "blood thinners (warfarin)", severity: "moderate", mechanism: "Very high doses (>2000 mg) may reduce warfarin effectiveness. Unlikely at normal doses.", timing_fix: null },
      { with: "chemotherapy", severity: "moderate", mechanism: "Antioxidants may theoretically interfere with some chemo agents. Discuss with oncologist.", timing_fix: null },
    ],
    common_goals: ["immune support", "cold prevention", "antioxidant", "skin", "iron absorption"],
    reference_ids: [],
  },

  elderberry: {
    canonical: "elderberry",
    aliases: ["sambucus", "elderberry syrup", "elderberry extract", "black elderberry"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 600, unit: "mg standardized extract/day" },
    timing: { best_time: "any time", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Raw elderberry is toxic. Avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Generally well tolerated. Popular for cold/flu support." },
    },
    interactions: [
      { with: "immunosuppressants", severity: "moderate", mechanism: "Elderberry stimulates immune activity. May counteract immunosuppressant drugs.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Monitor glucose.", timing_fix: null },
    ],
    common_goals: ["cold and flu", "immune support", "antioxidant"],
    reference_ids: [],
  },

  "lions mane": {
    canonical: "lions mane",
    aliases: ["lion's mane", "lions mane mushroom", "hericium erinaceus"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 3000, unit: "mg/day" },
    timing: { best_time: "morning", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid during pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Promising for cognitive support. Well tolerated." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "May have antiplatelet activity. Monitor for bruising.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Monitor glucose.", timing_fix: null },
    ],
    common_goals: ["cognitive function", "focus", "memory", "brain health", "nerve support", "brain fog"],
    reference_ids: [],
  },

  "apple cider vinegar": {
    canonical: "apple cider vinegar",
    aliases: ["acv", "acv supplement", "acv gummies"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1500, unit: "mg/day (supplement), or 1-2 tbsp diluted" },
    timing: { best_time: "before meals", with_food: false, separate_from: ["potassium-lowering drugs"] },
    populations: {
      pregnancy: { safe: true, notes: "Diluted ACV in food amounts is fine. Supplemental doses: limited data." },
      renal: { safe: true, notes: "May lower potassium. Monitor if on potassium-lowering medications." },
      elderly: { safe: true, notes: "Dilute to protect tooth enamel. May interact with diuretics." },
    },
    interactions: [
      { with: "diuretics", severity: "moderate", mechanism: "ACV may lower potassium. Additive hypokalemia risk with diuretics.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Additive hypoglycemia risk with insulin/metformin.", timing_fix: null },
      { with: "digoxin", severity: "moderate", mechanism: "Low potassium from ACV increases digoxin toxicity risk.", timing_fix: null },
    ],
    common_goals: ["digestion", "blood sugar", "weight management", "gut health", "detox"],
    reference_ids: [],
  },

  "b12": {
    canonical: "b12",
    aliases: ["vitamin b12", "methylcobalamin", "cyanocobalamin", "hydroxocobalamin", "b-12"],
    category: "vitamin",
    adult_dose_range: { min: 500, max: 2500, unit: "mcg/day (sublingual or oral)" },
    timing: { best_time: "morning", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Essential in pregnancy. RDA 2.6 mcg. Deficiency causes neural tube defects." },
      renal: { safe: true, notes: "Safe. High-dose supplementation common in CKD with anemia." },
      elderly: { safe: true, notes: "Very commonly deficient in 65+ due to reduced absorption. Sublingual or injections bypass stomach acid." },
    },
    interactions: [
      { with: "metformin", severity: "moderate", mechanism: "Metformin reduces B12 absorption by 10-30%. Long-term users should monitor levels.", timing_fix: null },
      { with: "PPIs (omeprazole, etc.)", severity: "moderate", mechanism: "Long-term acid suppression reduces B12 absorption. Consider sublingual form.", timing_fix: null },
    ],
    common_goals: ["energy", "fatigue", "nerve health", "anemia", "vegetarian/vegan nutrition", "brain health"],
    reference_ids: [],
  },

  // ── Remaining high-traffic supplements ──

  "l-theanine": {
    canonical: "l-theanine",
    aliases: ["l theanine", "theanine", "suntheanine"],
    category: "supplement",
    adult_dose_range: { min: 100, max: 400, unit: "mg/day" },
    timing: { best_time: "any time (morning for focus, evening for calm)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. Avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Well tolerated. Good option for anxiety without sedation." },
    },
    interactions: [
      { with: "blood pressure medications", severity: "moderate", mechanism: "L-theanine may slightly lower BP. Additive effect with antihypertensives.", timing_fix: null },
    ],
    common_goals: ["anxiety", "focus", "calm without drowsiness", "sleep quality", "stress"],
    reference_ids: [],
  },

  echinacea: {
    canonical: "echinacea",
    aliases: ["echinacea purpurea", "echinacea angustifolia"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 500, unit: "mg 3x/day (at cold onset)" },
    timing: { best_time: "at first sign of cold, for 7-10 days max", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Limited data. Generally avoided in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Safe for short-term use. May modestly reduce cold duration." },
    },
    interactions: [
      { with: "immunosuppressants", severity: "high", mechanism: "Immune-stimulating — may counteract immunosuppressive drugs (cyclosporine, tacrolimus).", timing_fix: null },
      { with: "CYP3A4 substrates", severity: "moderate", mechanism: "May inhibit CYP3A4 and CYP1A2. Monitor drug levels.", timing_fix: null },
    ],
    common_goals: ["cold prevention", "cold shortening", "immune support"],
    reference_ids: [],
  },

  gaba: {
    canonical: "gaba",
    aliases: ["gamma-aminobutyric acid", "gaba supplement", "pharmagaba"],
    category: "supplement",
    adult_dose_range: { min: 100, max: 750, unit: "mg/day" },
    timing: { best_time: "evening or before stressful event", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Avoid." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "May cause drowsiness. Start low." },
    },
    interactions: [
      { with: "benzodiazepines", severity: "moderate", mechanism: "Both act on GABA receptors. Additive sedation possible.", timing_fix: null },
      { with: "gabapentin/pregabalin", severity: "moderate", mechanism: "Both are GABAergic. Additive effects possible.", timing_fix: null },
      { with: "blood pressure medications", severity: "moderate", mechanism: "GABA may lower BP. Additive hypotension.", timing_fix: null },
    ],
    common_goals: ["anxiety", "sleep", "calm", "stress relief"],
    reference_ids: [],
  },

  maca: {
    canonical: "maca",
    aliases: ["maca root", "maca powder", "peruvian ginseng", "lepidium meyenii"],
    category: "supplement",
    adult_dose_range: { min: 1500, max: 3000, unit: "mg/day" },
    timing: { best_time: "morning with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Traditionally used but avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Generally safe. May support energy and libido." },
    },
    interactions: [
      { with: "hormone-sensitive conditions", severity: "moderate", mechanism: "May have mild hormonal effects. Caution with breast/prostate cancer, endometriosis.", timing_fix: null },
    ],
    common_goals: ["energy", "libido", "hormonal balance", "stamina", "fertility"],
    reference_ids: [],
  },

  resveratrol: {
    canonical: "resveratrol",
    aliases: ["trans-resveratrol", "grape seed extract"],
    category: "supplement",
    adult_dose_range: { min: 150, max: 500, unit: "mg/day" },
    timing: { best_time: "with food (fat-soluble)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. Avoid in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Common anti-aging supplement. Watch for interactions." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Antiplatelet effects. May increase bleeding risk.", timing_fix: null },
      { with: "CYP-metabolized drugs", severity: "moderate", mechanism: "Inhibits CYP1A2, CYP3A4, CYP2D6. May raise blood levels of affected drugs.", timing_fix: null },
    ],
    common_goals: ["anti-aging", "cardiovascular", "antioxidant", "longevity"],
    reference_ids: [],
  },

  "activated charcoal": {
    canonical: "activated charcoal",
    aliases: ["charcoal supplement", "charcoal capsules", "charcoal detox"],
    category: "supplement",
    adult_dose_range: { min: 250, max: 500, unit: "mg as needed (NOT daily)" },
    timing: { best_time: "2+ hours away from ALL medications", with_food: false, separate_from: ["all medications", "all supplements"] },
    populations: {
      pregnancy: { safe: false, notes: "May bind prenatal vitamins. Only use under medical direction." },
      renal: { safe: true, notes: "No direct renal concerns but may bind necessary medications." },
      elderly: { safe: true, notes: "Risk of medication binding is higher with polypharmacy. Avoid daily use." },
    },
    interactions: [
      { with: "ALL oral medications", severity: "high", mechanism: "Binds and reduces absorption of most oral drugs taken within 1-2 hours — including birth control, thyroid meds, and heart medications.", timing_fix: "2h+ separation from ALL meds" },
    ],
    common_goals: ["gas", "bloating", "food poisoning", "detox"],
    reference_ids: [],
  },

  glutathione: {
    canonical: "glutathione",
    aliases: ["gsh", "liposomal glutathione", "reduced glutathione", "s-acetyl glutathione"],
    category: "supplement",
    adult_dose_range: { min: 250, max: 1000, unit: "mg/day (liposomal or S-acetyl forms best absorbed)" },
    timing: { best_time: "empty stomach or with vitamin C", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. Avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Natural levels decline with age. Safe to supplement." },
    },
    interactions: [],
    common_goals: ["antioxidant", "skin lightening", "liver support", "detox", "anti-aging", "immune support"],
    reference_ids: [],
  },

  selenium: {
    canonical: "selenium",
    aliases: ["selenium supplement", "selenomethionine", "sodium selenite"],
    category: "mineral",
    adult_dose_range: { min: 55, max: 200, unit: "mcg/day" },
    upper_limit: { value: 400, unit: "mcg/day", source: "NIH ODS" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "RDA 60 mcg. Do not exceed 400 mcg. Important for thyroid function." },
      renal: { safe: true, notes: "No dose adjustment needed at standard doses." },
      elderly: { safe: true, notes: "May support thyroid and immune function. Do not exceed 200 mcg without testing." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "High-dose selenium may have antiplatelet effects.", timing_fix: null },
      { with: "statins", severity: "moderate", mechanism: "Some evidence selenium may reduce statin effectiveness. Limited data.", timing_fix: null },
    ],
    common_goals: ["thyroid support", "immune", "antioxidant", "fertility"],
    reference_ids: [],
  },

  "black cohosh": {
    canonical: "black cohosh",
    aliases: ["cimicifuga racemosa", "black cohosh extract"],
    category: "supplement",
    adult_dose_range: { min: 20, max: 40, unit: "mg standardized extract/day" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May stimulate uterine contractions. Avoid in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Common for menopausal symptoms. Monitor liver function with long-term use." },
    },
    interactions: [
      { with: "hepatotoxic drugs", severity: "moderate", mechanism: "Rare cases of liver damage reported. Avoid combining with other liver-stressing agents.", timing_fix: null },
      { with: "hormone therapy", severity: "moderate", mechanism: "May have estrogenic activity. Discuss with provider if on HRT.", timing_fix: null },
      { with: "tamoxifen", severity: "moderate", mechanism: "Estrogenic effects may theoretically counteract tamoxifen. Discuss with oncologist.", timing_fix: null },
    ],
    common_goals: ["menopause", "hot flashes", "night sweats", "hormonal support"],
    reference_ids: [],
  },

  "evening primrose": {
    canonical: "evening primrose",
    aliases: ["evening primrose oil", "epo", "oenothera biennis"],
    category: "supplement",
    adult_dose_range: { min: 500, max: 1300, unit: "mg/day" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "May increase bleeding and has been associated with prolonged labor. Avoid." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Safe. May help with dry skin and mild inflammation." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "GLA (gamma-linolenic acid) may have mild antiplatelet effects.", timing_fix: null },
      { with: "phenothiazines", severity: "moderate", mechanism: "May lower seizure threshold. Avoid with seizure-prone conditions.", timing_fix: null },
    ],
    common_goals: ["PMS", "breast tenderness", "eczema", "hormonal balance", "skin health"],
    reference_ids: [],
  },

  dim: {
    canonical: "dim",
    aliases: ["diindolylmethane", "dim supplement"],
    category: "supplement",
    adult_dose_range: { min: 100, max: 200, unit: "mg/day" },
    timing: { best_time: "with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Hormonal effects. Avoid in pregnancy." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "May support healthy estrogen metabolism." },
    },
    interactions: [
      { with: "hormone therapy / birth control", severity: "moderate", mechanism: "DIM alters estrogen metabolism. May affect hormonal contraceptive or HRT effectiveness.", timing_fix: null },
      { with: "tamoxifen", severity: "moderate", mechanism: "Both affect estrogen pathways. Discuss with oncologist.", timing_fix: null },
    ],
    common_goals: ["estrogen balance", "hormonal acne", "PMS", "breast health", "menopause support"],
    reference_ids: [],
  },

  "alpha-gpc": {
    canonical: "alpha-gpc",
    aliases: ["alpha gpc", "alpha-glycerophosphocholine", "choline alfoscerate"],
    category: "supplement",
    adult_dose_range: { min: 300, max: 600, unit: "mg/day" },
    timing: { best_time: "morning", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. Avoid supplemental doses." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Studied for cognitive decline. Generally well tolerated." },
    },
    interactions: [
      { with: "anticholinergics", severity: "moderate", mechanism: "Opposing mechanisms — alpha-GPC increases acetylcholine, anticholinergics block it.", timing_fix: null },
      { with: "cholinesterase inhibitors (donepezil)", severity: "moderate", mechanism: "Additive cholinergic effects. Monitor for GI side effects.", timing_fix: null },
    ],
    common_goals: ["focus", "memory", "cognitive function", "nootropic", "athletic power output"],
    reference_ids: [],
  },

  // ─────────────────────────────────────────────────────────────────
  // Wellness-goal coverage additions
  // Filling gaps for sleep (glycine), cholesterol (psyllium, red yeast
  // rice, plant sterols), weight (glucomannan), sexual/cardiovascular
  // (l-arginine, l-citrulline), and energy (b-complex). Each follows
  // the schema above. Interactions emphasize the highest-stakes
  // combos (e.g., red yeast rice ≈ statin, l-arginine + nitrates =
  // contraindicated). Cohorts of overlap with prescribed drugs are
  // surfaced explicitly so the LLM grounds in evidence.
  // ─────────────────────────────────────────────────────────────────

  glycine: {
    canonical: "glycine",
    aliases: ["glycine powder", "amino acid glycine"],
    category: "supplement",
    adult_dose_range: { min: 1000, max: 3000, unit: "mg before bed" },
    upper_limit: { value: null, unit: "no established UL", source: "Evidence from sleep trials" },
    timing: { best_time: "30-60 min before bed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient supplementation data. Discuss with provider." },
      renal: { safe: true, notes: "Endogenous amino acid; no known concerns at typical doses." },
      elderly: { safe: true, notes: "Often well tolerated for sleep onset." },
    },
    interactions: [
      { with: "clozapine", severity: "moderate", mechanism: "May reduce clozapine effectiveness in some studies.", timing_fix: null },
    ],
    common_goals: ["sleep onset", "sleep quality", "core body temperature regulation"],
    reference_ids: [],
  },

  psyllium: {
    canonical: "psyllium",
    aliases: ["psyllium husk", "metamucil", "isabgol", "plantago ovata"],
    category: "supplement",
    adult_dose_range: { min: 5, max: 15, unit: "g/day soluble fiber" },
    upper_limit: { value: null, unit: "no established UL", source: "Tolerability-limited (bloat/gas)" },
    timing: { best_time: "with meals, plenty of water", with_food: true, separate_from: ["medications (2h)"] },
    populations: {
      pregnancy: { safe: true, notes: "Generally regarded as safe; bulk-forming, not absorbed systemically." },
      renal: { safe: true, notes: "Monitor fluid balance; psyllium needs adequate water." },
      elderly: { safe: true, notes: "Take with full glass of water to avoid esophageal obstruction." },
    },
    interactions: [
      { with: "oral medications (all)", severity: "moderate", mechanism: "Soluble fiber can reduce absorption. Separate dosing by 2 hours.", timing_fix: "2-hour separation from any oral medication" },
      { with: "warfarin", severity: "moderate", mechanism: "May reduce warfarin absorption. Maintain consistent fiber intake.", timing_fix: "2-hour separation" },
      { with: "levothyroxine", severity: "moderate", mechanism: "Reduced thyroid hormone absorption.", timing_fix: "4-hour separation" },
    ],
    common_goals: ["cholesterol (LDL reduction)", "weight (satiety)", "constipation", "blood sugar control", "soluble fiber"],
    reference_ids: [],
  },

  "red yeast rice": {
    canonical: "red yeast rice",
    aliases: ["ryr", "monascus purpureus", "monacolin k", "red rice yeast"],
    category: "supplement",
    adult_dose_range: { min: 1200, max: 2400, unit: "mg/day (standardized to monacolin K)" },
    upper_limit: { value: null, unit: "monacolin K content varies wildly between brands", source: "FDA flagged inconsistent labeling" },
    timing: { best_time: "evening (cholesterol biosynthesis peaks at night)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Avoid. Statin-like compound (monacolin K = lovastatin). Teratogenic risk." },
      renal: { safe: true, notes: "Monitor as you would for a statin." },
      elderly: { safe: true, notes: "Same myopathy/liver-enzyme considerations as statins." },
    },
    interactions: [
      { with: "statins (atorvastatin, simvastatin, rosuvastatin, etc.)", severity: "high", mechanism: "Monacolin K is chemically identical to lovastatin. NEVER combine — additive myopathy + rhabdomyolysis risk.", timing_fix: null },
      { with: "fibrates (gemfibrozil, fenofibrate)", severity: "high", mechanism: "Additive myopathy risk.", timing_fix: null },
      { with: "grapefruit juice", severity: "moderate", mechanism: "CYP3A4 inhibition raises monacolin K levels.", timing_fix: null },
      { with: "CoQ10", severity: "beneficial", mechanism: "Like statins, RYR may deplete CoQ10. Supplementation often recommended.", timing_fix: null },
    ],
    common_goals: ["cholesterol (LDL reduction)", "statin alternative (NOT a replacement without clinician)"],
    reference_ids: [],
  },

  "l-arginine": {
    canonical: "l-arginine",
    aliases: ["arginine", "l arginine"],
    category: "supplement",
    adult_dose_range: { min: 2000, max: 6000, unit: "mg/day" },
    upper_limit: { value: null, unit: "GI tolerance often limiting > 9 g", source: "Tolerability-limited" },
    timing: { best_time: "split doses, often pre-exercise", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Limited safety data at supplement doses. Discuss with provider." },
      renal: { safe: false, notes: "Caution in renal impairment — nitrogen handling." },
      elderly: { safe: true, notes: "Watch BP if on antihypertensives." },
    },
    interactions: [
      { with: "sildenafil (Viagra), tadalafil (Cialis), vardenafil, avanafil", severity: "high", mechanism: "Additive vasodilation. Risk of severe hypotension and syncope. CONTRAINDICATED without clinician supervision.", timing_fix: null },
      { with: "nitrates (nitroglycerin, isosorbide)", severity: "high", mechanism: "Additive vasodilation. Risk of severe hypotension. CONTRAINDICATED.", timing_fix: null },
      { with: "antihypertensives (ACE-i, ARBs, beta blockers, diuretics)", severity: "moderate", mechanism: "Additive BP lowering. Monitor and report dizziness.", timing_fix: null },
      { with: "anticoagulants (warfarin, eliquis)", severity: "moderate", mechanism: "Possible additive antiplatelet activity at high doses.", timing_fix: null },
    ],
    common_goals: ["sexual health (ED support)", "circulation", "exercise performance", "nitric oxide / blood flow"],
    reference_ids: [],
  },

  "l-citrulline": {
    canonical: "l-citrulline",
    aliases: ["citrulline", "citrulline malate", "l citrulline"],
    category: "supplement",
    adult_dose_range: { min: 3000, max: 8000, unit: "mg/day (often 6-8 g pre-exercise)" },
    upper_limit: { value: null, unit: "GI tolerance often limiting > 10 g", source: "Tolerability-limited" },
    timing: { best_time: "30-60 min pre-exercise or split daily", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient supplementation data. Discuss with provider." },
      renal: { safe: false, notes: "Caution in renal impairment." },
      elderly: { safe: true, notes: "Watch BP if on antihypertensives." },
    },
    interactions: [
      { with: "sildenafil (Viagra), tadalafil (Cialis), vardenafil, avanafil", severity: "high", mechanism: "Citrulline converts to arginine then to nitric oxide. Additive vasodilation with PDE5 inhibitors. Risk of severe hypotension. CONTRAINDICATED without clinician.", timing_fix: null },
      { with: "nitrates (nitroglycerin, isosorbide)", severity: "high", mechanism: "Additive vasodilation. Risk of severe hypotension. CONTRAINDICATED.", timing_fix: null },
      { with: "antihypertensives (ACE-i, ARBs, beta blockers)", severity: "moderate", mechanism: "Additive BP lowering. Monitor.", timing_fix: null },
    ],
    common_goals: ["sexual health (ED support)", "exercise performance", "blood flow / nitric oxide"],
    reference_ids: [],
  },

  glucomannan: {
    canonical: "glucomannan",
    aliases: ["konjac fiber", "konjac root", "amorphophallus konjac"],
    category: "supplement",
    adult_dose_range: { min: 1000, max: 3000, unit: "mg before meals" },
    upper_limit: { value: null, unit: "no established UL; GI / esophageal obstruction risk if not enough water", source: "Tolerability-limited" },
    timing: { best_time: "15-30 min before meals with FULL glass of water", with_food: false, separate_from: ["oral medications (1-2h)"] },
    populations: {
      pregnancy: { safe: true, notes: "Bulk-forming fiber; generally safe but use minimum effective dose." },
      renal: { safe: true, notes: "Maintain adequate fluid intake." },
      elderly: { safe: true, notes: "ESOPHAGEAL OBSTRUCTION RISK if not taken with enough water — especially in dysphagia." },
    },
    interactions: [
      { with: "oral medications (all)", severity: "moderate", mechanism: "Reduced absorption. Separate by 1-2 hours.", timing_fix: "1-2 hour separation" },
      { with: "diabetes medications (metformin, sulfonylureas, insulin)", severity: "moderate", mechanism: "Additive blood-sugar lowering. Monitor.", timing_fix: null },
    ],
    common_goals: ["weight loss (satiety)", "cholesterol (LDL reduction)", "blood sugar control"],
    reference_ids: [],
  },

  "plant sterols": {
    canonical: "plant sterols",
    aliases: ["phytosterols", "beta-sitosterol", "plant stanols", "phytostanols"],
    category: "supplement",
    adult_dose_range: { min: 1500, max: 3000, unit: "mg/day with meals" },
    upper_limit: { value: null, unit: "diminishing returns > 3 g/day", source: "EFSA / FDA guidance" },
    timing: { best_time: "with main meals (split AM/PM)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Naturally occurring in food. Supplemental doses generally acceptable; discuss with provider." },
      renal: { safe: true, notes: "No significant renal concerns." },
      elderly: { safe: true, notes: "Established LDL-lowering effect." },
    },
    interactions: [
      { with: "ezetimibe", severity: "moderate", mechanism: "Both inhibit cholesterol absorption; ezetimibe may reduce sterol effect.", timing_fix: null },
      { with: "fat-soluble vitamins (A, D, E, K, beta-carotene)", severity: "low", mechanism: "Modestly reduced absorption with chronic high-dose phytosterols.", timing_fix: null },
    ],
    common_goals: ["cholesterol (LDL reduction)", "cardiovascular support"],
    reference_ids: [],
  },

  "b-complex": {
    canonical: "b-complex",
    aliases: ["b complex", "vitamin b complex", "b-vitamins", "b vitamins"],
    category: "supplement",
    adult_dose_range: { min: 1, max: 1, unit: "1 dose/day of a standard B-complex" },
    upper_limit: { value: null, unit: "individual B-vitamin ULs apply (B6 is the limiting factor at ~100 mg/day)", source: "NIH ODS" },
    timing: { best_time: "morning with food (B12 can be energizing)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Most B-complex doses are safe; prenatals provide adequate amounts." },
      renal: { safe: true, notes: "Water-soluble; excess is excreted." },
      elderly: { safe: true, notes: "B12 absorption declines with age; supplementation often advised especially on metformin or PPIs." },
    },
    interactions: [
      { with: "levodopa", severity: "moderate", mechanism: "B6 (pyridoxine) at high dose can reduce levodopa effectiveness if carbidopa not co-administered.", timing_fix: null },
      { with: "metformin", severity: "beneficial", mechanism: "Metformin depletes B12; supplementation often advised.", timing_fix: null },
      { with: "PPIs / acid blockers", severity: "beneficial", mechanism: "Chronic acid suppression reduces B12 absorption.", timing_fix: null },
    ],
    common_goals: ["energy", "fatigue support", "homocysteine support", "metabolism cofactors"],
    reference_ids: [],
  },

  // ── GLP-1 Medications (Ozempic, Mounjaro, etc.) ──

  semaglutide: {
    canonical: "semaglutide",
    aliases: ["ozempic", "wegovy", "rybelsus"],
    category: "medication",
    adult_dose_range: { min: 0.25, max: 2.4, unit: "mg/week (injection) or 3-14 mg/day (oral)" },
    timing: { best_time: "same day each week (injection); 30 min before first food (oral)", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Contraindicated. Stop 2 months before planned conception. Animal studies show fetal harm." },
      renal: { safe: true, notes: "No dose adjustment needed. Monitor hydration — GI side effects can cause dehydration." },
      elderly: { safe: true, notes: "Safe. Start low, titrate slowly. Monitor for dehydration and muscle loss." },
    },
    interactions: [
      { with: "insulin/sulfonylureas", severity: "high", mechanism: "Additive hypoglycemia risk. Insulin dose often needs reduction when starting GLP-1.", timing_fix: null },
      { with: "oral medications (all)", severity: "moderate", mechanism: "GLP-1s slow gastric emptying — oral meds may be absorbed differently. Levothyroxine, birth control, and other timing-sensitive meds should be monitored.", timing_fix: "Take critical oral meds 1h before or 2h after eating" },
      { with: "supplements with GI side effects", severity: "moderate", mechanism: "Iron, magnesium oxide, and other GI-irritating supplements may worsen nausea. Use gentler forms (bisglycinate, citrate).", timing_fix: null },
    ],
    common_goals: ["weight loss", "diabetes management", "appetite control", "metabolic health"],
    reference_ids: [],
  },

  tirzepatide: {
    canonical: "tirzepatide",
    aliases: ["mounjaro", "zepbound"],
    category: "medication",
    adult_dose_range: { min: 2.5, max: 15, unit: "mg/week (injection)" },
    timing: { best_time: "same day each week", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Contraindicated. Stop 2 months before planned conception." },
      renal: { safe: true, notes: "No dose adjustment. Monitor hydration." },
      elderly: { safe: true, notes: "Safe. Same GI precautions as semaglutide." },
    },
    interactions: [
      { with: "insulin/sulfonylureas", severity: "high", mechanism: "Additive hypoglycemia risk. Insulin dose reduction typically needed.", timing_fix: null },
      { with: "oral medications", severity: "moderate", mechanism: "Dual GIP/GLP-1 agonist slows gastric emptying more than GLP-1 alone. Monitor absorption of oral meds.", timing_fix: null },
    ],
    common_goals: ["weight loss", "diabetes management", "appetite control"],
    reference_ids: [],
  },

  // ── Trending Supplements (2025-2026) ──

  shilajit: {
    canonical: "shilajit",
    aliases: ["shilajit resin", "mumijo", "mineral pitch"],
    category: "supplement",
    adult_dose_range: { min: 250, max: 500, unit: "mg/day (purified resin or extract)" },
    timing: { best_time: "morning with food", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient safety data. Contains heavy metals if unpurified. Avoid." },
      renal: { safe: true, notes: "Limited data in CKD. Contains minerals — use caution." },
      elderly: { safe: true, notes: "Traditional use for energy and cognitive support. Use purified forms only." },
    },
    interactions: [
      { with: "blood pressure medications", severity: "moderate", mechanism: "May lower blood pressure. Monitor for additive hypotension.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Monitor glucose.", timing_fix: null },
      { with: "iron supplements", severity: "moderate", mechanism: "Shilajit contains fulvic acid which enhances iron absorption. May increase iron levels.", timing_fix: null },
    ],
    common_goals: ["energy", "testosterone", "anti-aging", "cognitive function", "stamina"],
    reference_ids: [],
  },

  "sea moss": {
    canonical: "sea moss",
    aliases: ["irish moss", "sea moss gel", "chondrus crispus"],
    category: "supplement",
    adult_dose_range: { min: 1, max: 2, unit: "tablespoons gel/day (or 500-1000 mg capsule)" },
    timing: { best_time: "any time", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "High and variable iodine content. Excess iodine is dangerous in pregnancy. Avoid." },
      renal: { safe: true, notes: "Contains potassium. Caution if on potassium restrictions." },
      elderly: { safe: true, notes: "Iodine content varies wildly by product. Monitor thyroid function." },
    },
    interactions: [
      { with: "thyroid medications", severity: "high", mechanism: "Contains high/variable iodine. Can destabilize thyroid levels in Hashimoto's or Graves'. Can interfere with levothyroxine dosing.", timing_fix: null },
      { with: "blood thinners", severity: "moderate", mechanism: "Contains vitamin K and may have anticoagulant properties. Monitor INR.", timing_fix: null },
      { with: "potassium-sparing diuretics / ACE inhibitors", severity: "moderate", mechanism: "Sea moss contains potassium. Risk of hyperkalemia.", timing_fix: null },
    ],
    common_goals: ["thyroid support", "immune", "skin", "gut health", "mineral supplementation"],
    reference_ids: [],
  },

  "tart cherry": {
    canonical: "tart cherry",
    aliases: ["tart cherry juice", "tart cherry extract", "montmorency cherry"],
    category: "supplement",
    adult_dose_range: { min: 480, max: 960, unit: "mg extract/day (or 8-16 oz juice)" },
    timing: { best_time: "evening (for sleep) or post-workout (for recovery)", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: true, notes: "Tart cherry juice in food amounts is safe. Supplement doses: limited data." },
      renal: { safe: true, notes: "Contains potassium and oxalates. Moderate intake if kidney stone history." },
      elderly: { safe: true, notes: "Good for sleep and joint inflammation. Well tolerated." },
    },
    interactions: [
      { with: "blood thinners", severity: "moderate", mechanism: "Contains salicylates (aspirin-like compounds). May have mild antiplatelet effect.", timing_fix: null },
    ],
    common_goals: ["sleep", "muscle recovery", "inflammation", "gout", "joint pain", "antioxidant"],
    reference_ids: [],
  },

  apigenin: {
    canonical: "apigenin",
    aliases: ["apigenin supplement"],
    category: "supplement",
    adult_dose_range: { min: 50, max: 50, unit: "mg before bed (standard sleep dose)" },
    timing: { best_time: "30-60 min before bed", with_food: false, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Insufficient data. May have estrogenic effects. Avoid." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "Generally well tolerated for sleep." },
    },
    interactions: [
      { with: "sedatives/benzodiazepines", severity: "moderate", mechanism: "Apigenin binds GABA-A receptors (same as benzos). Additive sedation possible.", timing_fix: null },
      { with: "blood thinners", severity: "moderate", mechanism: "May inhibit platelet aggregation. Monitor if on anticoagulants.", timing_fix: null },
      { with: "CYP-metabolized drugs", severity: "moderate", mechanism: "Apigenin inhibits CYP1A2 and CYP2C9. May raise levels of caffeine, warfarin, some SSRIs.", timing_fix: null },
    ],
    common_goals: ["sleep", "anxiety", "calm", "anti-inflammatory"],
    reference_ids: [],
  },

  tongkat: {
    canonical: "tongkat",
    aliases: ["tongkat ali", "eurycoma longifolia", "longjack", "malaysian ginseng"],
    category: "supplement",
    adult_dose_range: { min: 200, max: 400, unit: "mg standardized extract/day" },
    timing: { best_time: "morning", with_food: true, separate_from: [] },
    populations: {
      pregnancy: { safe: false, notes: "Hormonal effects. Avoid in pregnancy and breastfeeding." },
      renal: { safe: true, notes: "No significant renal concerns at standard doses." },
      elderly: { safe: true, notes: "May support testosterone and energy. Well tolerated." },
    },
    interactions: [
      { with: "blood pressure medications", severity: "moderate", mechanism: "May lower blood pressure. Monitor for additive hypotension.", timing_fix: null },
      { with: "diabetes medications", severity: "moderate", mechanism: "May lower blood sugar. Monitor glucose.", timing_fix: null },
      { with: "hormone-sensitive conditions", severity: "moderate", mechanism: "May increase testosterone. Discuss with provider if prostate cancer or hormone-sensitive condition.", timing_fix: null },
    ],
    common_goals: ["testosterone", "libido", "energy", "muscle", "male fertility", "stress"],
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
