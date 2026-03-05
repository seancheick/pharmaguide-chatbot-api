// Governance metadata: each claim carries review tracking and expiry.
// review_date: when this claim was last reviewed for accuracy
// review_cycle_months: how often this claim should be re-reviewed
// status: "active" | "under_review" | "deprecated"
// tags: searchable keywords for governance queries

const APPROVED_CLAIMS = {
  "serotonin-syndrome-clinical": {
    domain: "serotonin",
    claim: "Combining serotonergic supplements with SSRIs/SNRIs/MAOIs increases serotonin syndrome risk.",
    confidence: "high",
    what_could_change: "New dose threshold guidelines.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["serotonin", "ssri", "5-htp", "drug-supplement"],
    related_claims: ["ssri-discontinuation-syndrome"],
    reference_ids: ["boyer-shannon-2005", "dunkley-2003"],
  },
  "anticoagulant-supplement-interaction": {
    domain: "bleeding",
    claim: "Supplements with antiplatelet/anticoagulant properties (turmeric, fish oil, ginkgo, nattokinase) can increase bleeding risk when combined with blood thinners.",
    confidence: "high",
    what_could_change: "Dose-specific interaction thresholds.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["bleeding", "warfarin", "anticoagulant", "turmeric", "fish-oil"],
    related_claims: ["nsaid-anticoagulant-bleeding"],
    reference_ids: ["sumi-1987"],
  },
  "hepatotoxicity-stacking": {
    domain: "hepatotoxic",
    claim: "Combining multiple hepatotoxic substances (kava, green tea extract, acetaminophen, alcohol) increases cumulative liver damage risk.",
    confidence: "high",
    what_could_change: "Better quantification of individual substance thresholds.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["liver", "hepatotoxic", "kava", "green-tea-extract"],
    reference_ids: ["fda-kava-2002", "teschke-2010", "mazzanti-2009"],
  },
  "charcoal-absorption-interference": {
    domain: "absorption",
    claim: "Activated charcoal binds medications in the gut, reducing absorption of most oral drugs including birth control, thyroid meds, and antidepressants.",
    confidence: "high",
    what_could_change: "Timing-specific guidance refinements.",
    source_type: "pharmacokinetic_data",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["charcoal", "absorption", "drug-interaction"],
    reference_ids: ["chyka-2005"],
  },
  "retinol-teratogenicity": {
    domain: "pregnancy_teratogen",
    claim: "Excess preformed vitamin A (retinol) during pregnancy, especially in the first trimester, is linked to birth defects. Safe upper limit is 3,000 mcg/day.",
    confidence: "high",
    what_could_change: "Threshold refinements from ongoing studies.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 6,
    status: "active",
    tags: ["pregnancy", "retinol", "vitamin-a", "teratogen"],
    related_claims: ["isotretinoin-vitamin-a-toxicity", "fat-soluble-vitamin-accumulation", "pregnancy-herbal-safety-gaps"],
    reference_ids: ["rothman-1995", "ods-vitamin-a-2023"],
  },
  "pregnancy-herbal-safety-gaps": {
    domain: "pregnancy_limited",
    claim: "Most herbal supplements and hormonal supplements (melatonin, ashwagandha, etc.) lack adequate pregnancy safety data. Absence of harm evidence does not equal safety evidence.",
    confidence: "moderate",
    what_could_change: "New pregnancy safety studies.",
    source_type: "evidence_gap",
    review_date: "2026-03-03",
    review_cycle_months: 6,
    status: "active",
    tags: ["pregnancy", "herbal", "evidence-gap", "melatonin"],
    reference_ids: ["briggs-2017"],
  },
  "isotretinoin-vitamin-a-toxicity": {
    domain: "isotretinoin_vita",
    claim: "Isotretinoin is a vitamin A derivative. Adding supplemental vitamin A creates hypervitaminosis A risk including liver damage, intracranial pressure, and birth defects.",
    confidence: "high",
    what_could_change: "Nothing foreseeable — well-established pharmacology.",
    source_type: "pharmacological_data",
    review_date: "2026-03-03",
    review_cycle_months: 24,
    status: "active",
    tags: ["isotretinoin", "accutane", "vitamin-a", "toxicity"],
    related_claims: ["retinol-teratogenicity", "hepatotoxicity-stacking"],
    reference_ids: ["nj-fda-isotretinoin-2010"],
  },
  "fat-soluble-vitamin-accumulation": {
    domain: "stacking",
    claim: "Fat-soluble vitamins (A, D, E, K) accumulate in body fat. Stacking a prenatal/multivitamin with standalone fat-soluble supplements can exceed safe upper limits.",
    confidence: "high",
    what_could_change: "Updated upper limit guidelines.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["stacking", "fat-soluble", "vitamin-d", "prenatal"],
    reference_ids: ["ods-vitamin-a-2023", "holick-2011"],
  },
  "cyp3a4-grapefruit-inhibition": {
    domain: "cyp3a4",
    claim: "Grapefruit inhibits CYP3A4 enzyme, raising blood levels of many medications including statins, quetiapine, buspirone, and felodipine. Effect can last 24-72 hours.",
    confidence: "high",
    what_could_change: "Drug-specific magnitude data.",
    source_type: "pharmacokinetic_data",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["grapefruit", "cyp3a4", "drug-interaction", "statins"],
    reference_ids: ["bailey-2013"],
  },
  "potassium-acei-hyperkalemia": {
    domain: "potassium_acei",
    claim: "Potassium supplements combined with ACE inhibitors, ARBs, or spironolactone can raise potassium to dangerous levels (hyperkalemia).",
    confidence: "high",
    what_could_change: "Nothing foreseeable.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["potassium", "ace-inhibitor", "hyperkalemia"],
    reference_ids: ["palmer-2004", "juurlink-2003"],
  },
  "iodine-thyroid-dysfunction": {
    domain: "iodine_thyroid",
    claim: "Excess iodine can worsen Hashimoto's and Graves' disease. Kelp supplements often contain variable, potentially excessive iodine amounts.",
    confidence: "high",
    what_could_change: "Population-specific threshold data.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["iodine", "thyroid", "hashimotos", "kelp"],
    reference_ids: ["ods-iodine-2022"],
  },
  "niacin-statin-myopathy": {
    domain: "niacin_statin",
    claim: "High-dose niacin combined with statins increases risk of myopathy/rhabdomyolysis and liver stress.",
    confidence: "high",
    what_could_change: "Dose-specific risk quantification.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["niacin", "statin", "myopathy", "rhabdomyolysis"],
    reference_ids: ["aim-him-2011"],
  },
  "renal-magnesium-clearance": {
    domain: "renal_clearance",
    claim: "Impaired kidneys (CKD stages 3-5) cannot clear excess magnesium, leading to potentially dangerous hypermagnesemia.",
    confidence: "high",
    what_could_change: "GFR-specific dosing guidelines.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["renal", "magnesium", "ckd", "hypermagnesemia"],
    reference_ids: ["ods-magnesium-2022"],
  },
  "ssri-discontinuation-syndrome": {
    domain: "ssri_discontinuation",
    claim: "5-HTP is not a safe substitute for an SSRI. SSRI discontinuation causes withdrawal symptoms that 5-HTP doesn't address, and adding 5-HTP while the SSRI is still washing out can cause serotonergic side effects.",
    confidence: "high",
    what_could_change: "SSRI washout period refinements.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["ssri", "discontinuation", "5-htp", "withdrawal"],
    related_claims: ["serotonin-syndrome-clinical"],
    reference_ids: ["ssri-discontinuation-warner-2006", "boyer-shannon-2005"],
  },
  "nsaid-anticoagulant-bleeding": {
    domain: "nsaid_anticoagulant",
    claim: "NSAIDs combined with anticoagulants significantly increase the risk of gastrointestinal and other bleeding events. NSAIDs both inhibit platelet function and damage the GI mucosa.",
    confidence: "high",
    what_could_change: "Nothing foreseeable — well-established pharmacology.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["nsaid", "anticoagulant", "bleeding", "ibuprofen", "warfarin"],
    related_claims: ["anticoagulant-supplement-interaction", "triple-whammy-aki"],
    reference_ids: ["lanas-2006"],
  },
  "triple-whammy-aki": {
    domain: "triple_whammy",
    claim: "The combination of NSAID + ACE inhibitor/ARB + diuretic ('triple whammy') significantly increases the risk of acute kidney injury, particularly in elderly and volume-depleted patients.",
    confidence: "high",
    what_could_change: "Population-specific risk quantification.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["triple-whammy", "nsaid", "ace-inhibitor", "diuretic", "kidney"],
    related_claims: ["nsaid-anticoagulant-bleeding", "lithium-nsaid-toxicity", "renal-magnesium-clearance"],
    reference_ids: ["lapi-2013", "warner-2011"],
  },
  "lithium-nsaid-toxicity": {
    domain: "lithium_nsaid",
    claim: "NSAIDs reduce renal clearance of lithium, raising serum levels and increasing risk of lithium toxicity (tremor, nausea, confusion, seizures).",
    confidence: "high",
    what_could_change: "Nothing foreseeable — well-established pharmacokinetics.",
    source_type: "pharmacokinetic_data",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["lithium", "nsaid", "toxicity", "renal-clearance"],
    related_claims: ["triple-whammy-aki"],
    reference_ids: ["handler-2006", "lexi-comp-2023"],
  },
  "metformin-alcohol-lactic-acidosis": {
    domain: "metformin_alcohol",
    claim: "Heavy alcohol consumption combined with metformin increases the risk of lactic acidosis. Both substances affect hepatic lactate metabolism. Moderate occasional alcohol with food is generally considered manageable.",
    confidence: "high",
    what_could_change: "Dose-response data refinements.",
    source_type: "clinical_consensus",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["metformin", "alcohol", "lactic-acidosis", "diabetes"],
    reference_ids: ["defrances-2008"],
  },
  "ototoxic-medication-hearing": {
    domain: "ototoxic",
    claim: "Several medication classes are known ototoxins: high-dose aspirin, loop diuretics (furosemide), aminoglycosides (gentamicin), and cisplatin. These can cause tinnitus and hearing loss, sometimes irreversibly.",
    confidence: "high",
    what_could_change: "Nothing foreseeable — well-established pharmacology.",
    source_type: "clinical_consensus",
    review_date: "2026-03-05",
    review_cycle_months: 12,
    status: "active",
    tags: ["ototoxic", "tinnitus", "aspirin", "furosemide", "hearing-loss"],
    related_claims: ["nsaid-chronic-risk"],
    reference_ids: ["rybak-1995"],
  },
  "nsaid-chronic-risk": {
    domain: "nsaid_chronic",
    claim: "Chronic or daily NSAID use increases risks of GI bleeding/ulcers, kidney damage (especially with dehydration or existing renal impairment), and cardiovascular events at high doses/long duration.",
    confidence: "high",
    what_could_change: "Updated dose-duration risk quantification.",
    source_type: "clinical_consensus",
    review_date: "2026-03-05",
    review_cycle_months: 12,
    status: "active",
    tags: ["nsaid", "chronic", "gi-bleeding", "kidney", "cardiovascular"],
    related_claims: ["nsaid-anticoagulant-bleeding", "triple-whammy-aki", "ototoxic-medication-hearing"],
    reference_ids: ["lanas-2006", "warner-2011"],
  },
  "stimulant-supplement-synergy": {
    domain: "stimulant",
    claim: "Combining stimulant medications with stimulating supplements (rhodiola, ginseng, caffeine) can compound stimulant effects including raised heart rate, blood pressure, and anxiety.",
    confidence: "moderate",
    what_could_change: "Dose-response data for specific combinations.",
    source_type: "pharmacological_reasoning",
    review_date: "2026-03-03",
    review_cycle_months: 12,
    status: "active",
    tags: ["stimulant", "caffeine", "adderall", "heart-rate"],
    reference_ids: ["panossian-2010"],
  },
};

function getClaimById(id) {
  return APPROVED_CLAIMS[id] || null;
}

function getClaimsForDomain(domainId) {
  return Object.entries(APPROVED_CLAIMS)
    .filter(([, claim]) => claim.domain === domainId)
    .map(([id, claim]) => ({ id, ...claim }));
}

function validateClaimCoverage() {
  const { SAFETY_POLICY } = require("./safetyPolicy");
  const issues = [];
  for (const [domainId, domain] of Object.entries(SAFETY_POLICY.domains)) {
    for (const ref of domain.evidence_refs) {
      if (!APPROVED_CLAIMS[ref]) {
        issues.push(`${domainId}: evidence_ref "${ref}" not found in APPROVED_CLAIMS`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function getClaimsDueForReview(asOfDate) {
  const cutoff = new Date(asOfDate || Date.now());
  return Object.entries(APPROVED_CLAIMS)
    .filter(([, claim]) => {
      if (claim.status === "deprecated") return false;
      const reviewed = new Date(claim.review_date);
      const nextReview = new Date(reviewed);
      nextReview.setMonth(nextReview.getMonth() + (claim.review_cycle_months || 12));
      return nextReview <= cutoff;
    })
    .map(([id, claim]) => ({ id, ...claim }));
}

function getClaimsByTag(tag) {
  return Object.entries(APPROVED_CLAIMS)
    .filter(([, claim]) => claim.tags && claim.tags.includes(tag))
    .map(([id, claim]) => ({ id, ...claim }));
}

function validateGovernanceFields() {
  const issues = [];
  const requiredFields = ["domain", "claim", "confidence", "source_type", "review_date", "review_cycle_months", "status", "tags"];
  for (const [id, claim] of Object.entries(APPROVED_CLAIMS)) {
    for (const field of requiredFields) {
      if (claim[field] === undefined || claim[field] === null) {
        issues.push(`${id}: missing required field "${field}"`);
      }
    }
    if (claim.tags && !Array.isArray(claim.tags)) {
      issues.push(`${id}: tags must be an array`);
    }
    if (claim.confidence && !["high", "moderate", "low"].includes(claim.confidence)) {
      issues.push(`${id}: confidence must be high/moderate/low`);
    }
    if (claim.status && !["active", "under_review", "deprecated"].includes(claim.status)) {
      issues.push(`${id}: status must be active/under_review/deprecated`);
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Get a claim bundle — the claim plus all directly related claims.
 * Follows related_claims links one level deep (no recursive traversal).
 * Returns { primary, related[] } or null if claim not found.
 */
function getClaimBundle(claimId) {
  const primary = APPROVED_CLAIMS[claimId];
  if (!primary) return null;

  const related = [];
  for (const relId of (primary.related_claims || [])) {
    const rel = APPROVED_CLAIMS[relId];
    if (rel) {
      related.push({ id: relId, ...rel });
    }
  }

  return { primary: { id: claimId, ...primary }, related };
}

/**
 * Validate that all related_claims references point to existing claims.
 */
function validateRelatedClaims() {
  const issues = [];
  for (const [id, claim] of Object.entries(APPROVED_CLAIMS)) {
    for (const relId of (claim.related_claims || [])) {
      if (!APPROVED_CLAIMS[relId]) {
        issues.push(`${id}: related_claim "${relId}" not found`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Validate that every approved claim has at least one reference_id
 * and that all reference_ids point to existing references.
 */
function validateReferenceCoverage() {
  const { REFERENCES } = require("./references");
  const issues = [];
  for (const [id, claim] of Object.entries(APPROVED_CLAIMS)) {
    if (!claim.reference_ids || claim.reference_ids.length === 0) {
      issues.push(`${id}: missing reference_ids`);
    } else {
      for (const refId of claim.reference_ids) {
        if (!REFERENCES[refId]) {
          issues.push(`${id}: reference_id "${refId}" not found in REFERENCES`);
        }
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

module.exports = { APPROVED_CLAIMS, getClaimById, getClaimsForDomain, validateClaimCoverage, getClaimsDueForReview, getClaimsByTag, validateGovernanceFields, getClaimBundle, validateRelatedClaims, validateReferenceCoverage };
