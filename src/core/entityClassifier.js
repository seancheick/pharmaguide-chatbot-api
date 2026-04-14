/**
 * Entity classifier — maps entity names to coarse drug/supplement classes.
 * Names are used for lookup but NEVER stored; only the class string is emitted.
 */

const { BRAND_TO_GENERIC } = require("./unknownResolver");

// ── Med class lookup ──
const MED_CLASS_MAP = {
  // SSRI
  sertraline: "SSRI", zoloft: "SSRI", fluoxetine: "SSRI", prozac: "SSRI",
  escitalopram: "SSRI", lexapro: "SSRI", citalopram: "SSRI", celexa: "SSRI",
  paroxetine: "SSRI", paxil: "SSRI",
  // SNRI
  venlafaxine: "SNRI", effexor: "SNRI", duloxetine: "SNRI", cymbalta: "SNRI",
  // MAOI
  phenelzine: "MAOI", tranylcypromine: "MAOI", selegiline: "MAOI",
  // Atypical antidepressant
  bupropion: "atypical_AD", wellbutrin: "atypical_AD",
  trazodone: "atypical_AD", desyrel: "atypical_AD",
  mirtazapine: "atypical_AD", remeron: "atypical_AD",
  // Mood stabilizer
  lithium: "mood_stabilizer", lamotrigine: "mood_stabilizer",
  // Antipsychotic
  quetiapine: "antipsychotic", seroquel: "antipsychotic",
  aripiprazole: "antipsychotic", abilify: "antipsychotic",
  // Anxiolytic
  buspirone: "anxiolytic",
  // Stimulant
  adderall: "stimulant", ritalin: "stimulant", concerta: "stimulant",
  vyvanse: "stimulant", modafinil: "stimulant", methylphenidate: "stimulant",
  // Statin
  atorvastatin: "statin", lipitor: "statin", simvastatin: "statin",
  rosuvastatin: "statin", pravastatin: "statin",
  // Anticoagulant
  warfarin: "anticoagulant", coumadin: "anticoagulant",
  eliquis: "anticoagulant", xarelto: "anticoagulant",
  aspirin: "anticoagulant", clopidogrel: "anticoagulant",
  dabigatran: "anticoagulant", pradaxa: "anticoagulant",
  edoxaban: "anticoagulant",
  // ACEi/ARB
  lisinopril: "ACEi_ARB", losartan: "ACEi_ARB",
  valsartan: "ACEi_ARB", olmesartan: "ACEi_ARB", telmisartan: "ACEi_ARB",
  // CCB
  amlodipine: "CCB", norvasc: "CCB",
  // MRA
  spironolactone: "MRA",
  // Beta blocker
  metoprolol: "beta_blocker", propranolol: "beta_blocker",
  // Thyroid
  levothyroxine: "thyroid", synthroid: "thyroid",
  // PPI
  omeprazole: "PPI", esomeprazole: "PPI", prilosec: "PPI", nexium: "PPI",
  // Retinoid
  isotretinoin: "retinoid", accutane: "retinoid",
  // Diabetes
  metformin: "diabetes", glucophage: "diabetes",
  empagliflozin: "diabetes", semaglutide: "diabetes", tirzepatide: "diabetes",
  // Anticonvulsant
  gabapentin: "anticonvulsant", neurontin: "anticonvulsant",
  pregabalin: "anticonvulsant", lyrica: "anticonvulsant",
  // Corticosteroid
  prednisone: "corticosteroid", prednisolone: "corticosteroid",
  // Benzodiazepine
  alprazolam: "benzodiazepine", xanax: "benzodiazepine",
  clonazepam: "benzodiazepine", klonopin: "benzodiazepine",
  lorazepam: "benzodiazepine", ativan: "benzodiazepine",
  diazepam: "benzodiazepine", valium: "benzodiazepine",
  temazepam: "benzodiazepine", midazolam: "benzodiazepine",
  // Diuretic
  furosemide: "diuretic", lasix: "diuretic",
  hydrochlorothiazide: "diuretic", hctz: "diuretic",
  chlorthalidone: "diuretic",
  // Antibiotic
  amoxicillin: "antibiotic", azithromycin: "antibiotic",
  doxycycline: "antibiotic", ciprofloxacin: "antibiotic",
  metronidazole: "antibiotic", fluconazole: "antifungal",
  // Analgesic
  tramadol: "opioid_analgesic",
  // NSAID
  ibuprofen: "NSAID", naproxen: "NSAID", diclofenac: "NSAID",
  celecoxib: "NSAID", meloxicam: "NSAID", indomethacin: "NSAID",
  // Acetaminophen
  acetaminophen: "acetaminophen", tylenol: "acetaminophen",
  // Hormonal
  "birth control": "hormonal_contraceptive",
  "oral contraceptive": "hormonal_contraceptive",
  finasteride: "5ARI",
  // Antihistamine
  cetirizine: "antihistamine", zyrtec: "antihistamine",
  loratadine: "antihistamine", claritin: "antihistamine",
  fexofenadine: "antihistamine", allegra: "antihistamine",
  diphenhydramine: "antihistamine_sedating", benadryl: "antihistamine_sedating",
  levocetirizine: "antihistamine", xyzal: "antihistamine",
  hydroxyzine: "antihistamine_sedating",
  desloratadine: "antihistamine", clarinex: "antihistamine",
};

// ── Supp class lookup ──
const SUPP_CLASS_MAP = {
  // Serotonergic
  "5-htp": "serotonergic", "5 htp": "serotonergic",
  "st john": "serotonergic", "st johns": "serotonergic",
  rhodiola: "serotonergic",
  // Adaptogen
  ashwagandha: "adaptogen", ginseng: "adaptogen", maca: "adaptogen",
  // Amino acid
  "l-theanine": "amino_acid", "l theanine": "amino_acid",
  gaba: "amino_acid", nac: "amino_acid", glutathione: "amino_acid",
  creatine: "amino_acid",
  // Mineral
  magnesium: "mineral", iron: "mineral", zinc: "mineral",
  calcium: "mineral", potassium: "mineral", iodine: "mineral",
  // Vitamin
  "vitamin d": "vitamin", "vitamin c": "vitamin",
  b12: "vitamin", folate: "vitamin", biotin: "vitamin",
  // Herbal
  valerian: "herbal", echinacea: "herbal", kava: "herbal",
  berberine: "herbal", turmeric: "herbal", curcumin: "herbal",
  // Sleep
  melatonin: "sleep",
  // Nootropic
  phenylpiracetam: "nootropic", "alpha-gpc": "nootropic",
  "alpha gpc": "nootropic", inositol: "nootropic",
  // Omega
  "fish oil": "omega", omega: "omega",
  // Antioxidant
  coq10: "antioxidant",
  // Antiplatelet supplement
  ginkgo: "antiplatelet_supp", "ginkgo biloba": "antiplatelet_supp",
  garlic: "antiplatelet_supp",
  // Women's health
  vitex: "hormonal_herb", chasteberry: "hormonal_herb",
  "black cohosh": "hormonal_herb", "evening primrose": "hormonal_herb",
  dim: "hormonal_herb", "myo-inositol": "metabolic_supp",
  // Men's health
  "saw palmetto": "prostate_supp",
  fenugreek: "hormonal_herb",
  "l-carnitine": "amino_acid", "l-arginine": "amino_acid",
  tongkat: "hormonal_herb", tribulus: "hormonal_herb",
  // Gut/UTI
  "d-mannose": "urinary_health", cranberry: "urinary_health",
  "boric acid": "vaginal_health",
  "milk thistle": "hepatoprotective", silymarin: "hepatoprotective",
  // CBD
  cbd: "cannabinoid",
  // Joint
  glucosamine: "joint_supp", chondroitin: "joint_supp",
  // Protein
  collagen: "protein",
  probiotics: "probiotic", probiotic: "probiotic",
  // Allergy support
  quercetin: "antihistamine_natural",
  "stinging nettle": "antihistamine_natural", "nettle leaf": "antihistamine_natural",
  bromelain: "anti_inflammatory_enzyme",
  butterbur: "antihistamine_natural",
  spirulina: "immune_modulator",
  "bee pollen": "immune_modulator",
  "local honey": "immune_modulator",
  // Brain / cognitive
  "lions mane": "nootropic", "lion's mane": "nootropic",
  // Immune
  elderberry: "immune_modulator",
  // Digestive
  "apple cider vinegar": "digestive_supp", acv: "digestive_supp",
  // Protein
  "whey protein": "protein", "protein powder": "protein",
};

/**
 * Classify a medication name to its coarse class.
 * Tries direct lookup, then brand→generic resolution.
 */
function classifyMed(name) {
  const lower = name.toLowerCase().trim();
  if (MED_CLASS_MAP[lower]) return MED_CLASS_MAP[lower];

  // Try brand→generic resolution
  const generic = BRAND_TO_GENERIC[lower];
  if (generic && MED_CLASS_MAP[generic]) return MED_CLASS_MAP[generic];

  return "other_med";
}

/**
 * Classify a supplement name to its coarse class.
 */
function classifySupp(name) {
  const lower = name.toLowerCase().trim();
  if (SUPP_CLASS_MAP[lower]) return SUPP_CLASS_MAP[lower];

  // Partial match for multi-word supplements
  for (const [key, cls] of Object.entries(SUPP_CLASS_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return cls;
  }

  return "other_supp";
}

/**
 * Classify all entities and return aggregate info (no names stored).
 */
function classifyEntities(entities) {
  const medClasses = new Set();
  const suppClasses = new Set();

  for (const med of (entities.meds || [])) {
    medClasses.add(classifyMed(med));
  }
  for (const supp of (entities.supplements || [])) {
    suppClasses.add(classifySupp(supp));
  }

  const medCount = (entities.meds || []).length;
  const suppCount = (entities.supplements || []).length;

  return {
    med_classes: [...medClasses].sort(),
    supp_classes: [...suppClasses].sort(),
    med_count: medCount,
    supp_count: suppCount,
    has_polypharmacy: medCount + suppCount >= 5,
  };
}

module.exports = { classifyMed, classifySupp, classifyEntities, MED_CLASS_MAP, SUPP_CLASS_MAP };
