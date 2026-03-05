const SAFETY_POLICY = {
  policy_version: "1.1.0",
  last_reviewed: "2026-03-03",
  domains: {
    serotonin: {
      id: "serotonin",
      route: "system:serotonin-risk",
      urgent_route: "system:serotonin-urgent",
      triggers: ["5-htp", "st-johns-wort", "tryptophan", "rhodiola", "psilocybin"],
      co_triggers: ["ssri", "snri", "maoi", "antidepressant"],
      severity_levels: {
        1: { label: "supplement_present", color: "yellow", action: "inform" },
        2: { label: "combo_detected", color: "red", action: "warn_and_ask" },
        3: { label: "symptoms_active", color: "red", action: "urgent_escalation" },
      },
      required_fields: ["antidepressant_name"],
      response_template_id: "serotonin-risk",
      evidence_refs: ["serotonin-syndrome-clinical"],
    },
    bleeding: {
      id: "bleeding",
      route: "system:blood-thinner-risk",
      triggers: ["turmeric", "fish-oil", "ginkgo", "nattokinase", "garlic", "ginger", "vitamin-e"],
      co_triggers: ["warfarin", "eliquis", "xarelto", "blood-thinner", "aspirin", "plavix"],
      severity_levels: {
        1: { label: "supplement_present", color: "yellow", action: "inform" },
        2: { label: "combo_detected", color: "red", action: "warn_and_ask" },
        3: { label: "nattokinase_combo", color: "red", action: "urgent_warn" },
      },
      required_fields: ["blood_thinner_name"],
      response_template_id: "blood-thinner-risk",
      evidence_refs: ["anticoagulant-supplement-interaction"],
    },
    hepatotoxic: {
      id: "hepatotoxic",
      route: "system:liver-toxicity",
      triggers: ["kava", "green-tea-extract", "acetaminophen", "alcohol", "niacin"],
      co_triggers: [],
      severity_levels: {
        2: { label: "multi_hepatotoxin", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["frequency_of_use"],
      response_template_id: "liver-toxicity",
      evidence_refs: ["hepatotoxicity-stacking"],
    },
    absorption: {
      id: "absorption",
      route: "system:charcoal-med",
      triggers: ["activated-charcoal"],
      co_triggers: ["medication", "birth-control", "levothyroxine"],
      severity_levels: {
        2: { label: "charcoal_med_combo", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["medication_list"],
      response_template_id: "charcoal-med",
      evidence_refs: ["charcoal-absorption-interference"],
    },
    pregnancy_teratogen: {
      id: "pregnancy_teratogen",
      route: "system:pregnancy-retinol",
      triggers: ["retinol", "retinyl", "cod-liver-oil", "vitamin-a"],
      co_triggers: ["pregnancy"],
      severity_levels: {
        2: { label: "retinol_in_pregnancy", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["prenatal_brand", "vitamin_a_form"],
      response_template_id: "pregnancy-retinol",
      evidence_refs: ["retinol-teratogenicity"],
    },
    pregnancy_limited: {
      id: "pregnancy_limited",
      route: "system:pregnancy-limited",
      triggers: ["melatonin", "ashwagandha", "rhodiola", "valerian", "kava", "st-johns-wort", "ginseng", "maca", "berberine", "echinacea"],
      co_triggers: ["pregnancy"],
      severity_levels: {
        1: { label: "limited_evidence", color: "yellow", action: "inform_and_refer" },
      },
      required_fields: ["reason_for_use"],
      response_template_id: "pregnancy-limited",
      evidence_refs: ["pregnancy-herbal-safety-gaps"],
    },
    isotretinoin_vita: {
      id: "isotretinoin_vita",
      route: "system:isotretinoin-vita",
      triggers: ["isotretinoin", "accutane"],
      co_triggers: ["vitamin-a", "retinol", "cod-liver-oil"],
      severity_levels: {
        2: { label: "hypervitaminosis_a", color: "red", action: "urgent_warn" },
      },
      required_fields: [],
      response_template_id: "isotretinoin-vita",
      evidence_refs: ["isotretinoin-vitamin-a-toxicity"],
    },
    stacking: {
      id: "stacking",
      route: "system:stacking-risk",
      triggers: ["prenatal", "multivitamin"],
      co_triggers: ["vitamin-d", "vitamin-a", "vitamin-e", "vitamin-k", "iron"],
      severity_levels: {
        1: { label: "potential_overlap", color: "yellow", action: "ask_labels" },
      },
      required_fields: ["prenatal_brand", "prenatal_label_values"],
      response_template_id: "stacking-risk",
      evidence_refs: ["fat-soluble-vitamin-accumulation"],
    },
    cyp3a4: {
      id: "cyp3a4",
      route: "system:grapefruit-cyp3a4",
      triggers: ["grapefruit"],
      co_triggers: ["simvastatin", "atorvastatin", "quetiapine", "buspirone", "felodipine", "cyclosporine", "statin"],
      severity_levels: {
        2: { label: "enzyme_inhibition", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["medication_name"],
      response_template_id: "grapefruit-cyp3a4",
      evidence_refs: ["cyp3a4-grapefruit-inhibition"],
    },
    potassium_acei: {
      id: "potassium_acei",
      route: "system:potassium-acei",
      triggers: ["potassium-supplement"],
      co_triggers: ["ace-inhibitor", "arb", "spironolactone"],
      severity_levels: {
        2: { label: "hyperkalemia_risk", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["medication_name"],
      response_template_id: "potassium-acei",
      evidence_refs: ["potassium-acei-hyperkalemia"],
    },
    iodine_thyroid: {
      id: "iodine_thyroid",
      route: "system:iodine-thyroid",
      triggers: ["iodine", "kelp"],
      co_triggers: ["thyroid-condition", "levothyroxine", "hashimotos", "graves"],
      severity_levels: {
        1: { label: "thyroid_interference", color: "yellow", action: "warn_and_ask" },
      },
      required_fields: ["thyroid_condition", "iodine_dose"],
      response_template_id: "iodine-thyroid",
      evidence_refs: ["iodine-thyroid-dysfunction"],
    },
    niacin_statin: {
      id: "niacin_statin",
      route: "system:niacin-statin",
      triggers: ["niacin", "nicotinic-acid"],
      co_triggers: ["statin", "red-yeast-rice"],
      severity_levels: {
        1: { label: "myopathy_risk", color: "yellow", action: "warn_and_ask" },
      },
      required_fields: ["niacin_dose", "statin_name"],
      response_template_id: "niacin-statin",
      evidence_refs: ["niacin-statin-myopathy"],
    },
    renal_clearance: {
      id: "renal_clearance",
      route: "system:renal-magnesium",
      triggers: ["magnesium"],
      co_triggers: ["ckd", "kidney-disease", "dialysis"],
      severity_levels: {
        2: { label: "hypermagnesemia_risk", color: "red", action: "warn_and_ask" },
      },
      required_fields: ["ckd_stage"],
      response_template_id: "renal-magnesium",
      evidence_refs: ["renal-magnesium-clearance"],
    },
    ssri_discontinuation: {
      id: "ssri_discontinuation",
      route: "system:ssri-discontinuation",
      triggers: ["5-htp", "st-johns-wort", "tryptophan"],
      co_triggers: ["ssri-stopped", "antidepressant-stopped"],
      severity_levels: {
        2: { label: "dangerous_substitution", color: "red", action: "warn_and_refer" },
      },
      required_fields: ["ssri_name", "time_since_stop"],
      response_template_id: "ssri-discontinuation",
      evidence_refs: ["ssri-discontinuation-syndrome"],
    },
    stimulant: {
      id: "stimulant",
      route: "system:stack-triage",
      triggers: ["rhodiola", "ginseng", "maca", "caffeine", "preworkout"],
      co_triggers: ["adderall", "vyvanse", "ritalin", "modafinil"],
      severity_levels: {
        1: { label: "supplement_present", color: "yellow", action: "inform" },
        2: { label: "combo_detected", color: "yellow", action: "warn_and_monitor" },
      },
      required_fields: [],
      response_template_id: "stimulant-stacking",
      evidence_refs: ["stimulant-supplement-synergy"],
    },
    nsaid_anticoagulant: {
      id: "nsaid_anticoagulant",
      route: "system:nsaid-anticoagulant",
      triggers: ["ibuprofen", "naproxen", "diclofenac", "celecoxib", "meloxicam"],
      co_triggers: ["warfarin", "eliquis", "xarelto", "pradaxa", "heparin"],
      severity_levels: {
        2: { label: "combo_detected", color: "red", action: "warn_and_refer" },
      },
      required_fields: ["anticoagulant_name"],
      response_template_id: "nsaid-anticoagulant",
      evidence_refs: ["nsaid-anticoagulant-bleeding"],
    },
    triple_whammy: {
      id: "triple_whammy",
      route: "system:triple-whammy",
      triggers: ["ibuprofen", "naproxen", "nsaid"],
      co_triggers: ["lisinopril", "losartan", "hydrochlorothiazide", "furosemide", "spironolactone"],
      severity_levels: {
        3: { label: "triple_combo_detected", color: "red", action: "urgent_referral" },
      },
      required_fields: [],
      response_template_id: "triple-whammy",
      evidence_refs: ["triple-whammy-aki"],
    },
    lithium_nsaid: {
      id: "lithium_nsaid",
      route: "system:lithium-nsaid",
      triggers: ["ibuprofen", "naproxen", "diclofenac", "celecoxib", "meloxicam"],
      co_triggers: ["lithium"],
      severity_levels: {
        2: { label: "combo_detected", color: "red", action: "warn_and_refer" },
      },
      required_fields: [],
      response_template_id: "lithium-nsaid",
      evidence_refs: ["lithium-nsaid-toxicity"],
    },
    metformin_alcohol: {
      id: "metformin_alcohol",
      route: "system:metformin-alcohol",
      triggers: ["alcohol", "wine", "beer", "liquor"],
      co_triggers: ["metformin"],
      severity_levels: {
        1: { label: "moderate_risk", color: "yellow", action: "inform_and_ask" },
        2: { label: "heavy_drinking", color: "red", action: "warn_and_refer" },
      },
      required_fields: ["drinking_frequency"],
      response_template_id: "metformin-alcohol",
      evidence_refs: ["metformin-alcohol-lactic-acidosis"],
    },
    ototoxic: {
      id: "ototoxic",
      route: "system:ototoxic-tinnitus",
      triggers: ["high-dose-aspirin", "furosemide", "aminoglycoside", "cisplatin", "quinine"],
      co_triggers: ["tinnitus", "hearing-loss", "ringing-ears"],
      severity_levels: {
        1: { label: "ototoxic_suspected", color: "yellow", action: "warn_and_refer" },
      },
      required_fields: ["medication_name", "onset_timing"],
      response_template_id: "ototoxic-tinnitus",
      evidence_refs: ["ototoxic-medication-hearing"],
    },
    nsaid_chronic: {
      id: "nsaid_chronic",
      route: "system:nsaid-chronic",
      triggers: ["ibuprofen", "naproxen", "diclofenac", "celecoxib", "meloxicam"],
      co_triggers: ["daily", "chronic", "long-term"],
      severity_levels: {
        1: { label: "chronic_use_detected", color: "yellow", action: "warn_and_ask" },
      },
      required_fields: ["duration", "other_medications"],
      response_template_id: "nsaid-chronic",
      evidence_refs: ["nsaid-chronic-risk"],
    },
  },
};

// Route → domain ID lookup (built from SAFETY_POLICY)
const ROUTE_TO_DOMAIN = {};
for (const [id, domain] of Object.entries(SAFETY_POLICY.domains)) {
  ROUTE_TO_DOMAIN[domain.route] = id;
  if (domain.urgent_route) ROUTE_TO_DOMAIN[domain.urgent_route] = id;
}

function getPolicyVersion() {
  return SAFETY_POLICY.policy_version;
}

function getDomainPolicy(id) {
  return SAFETY_POLICY.domains[id] || null;
}

function getSeverityForDomain(id, level) {
  const domain = SAFETY_POLICY.domains[id];
  if (!domain) return null;
  return domain.severity_levels[level] || null;
}

function validatePolicyCompleteness() {
  const issues = [];
  for (const [id, domain] of Object.entries(SAFETY_POLICY.domains)) {
    if (!domain.route) issues.push(`${id}: missing route`);
    if (!domain.triggers || domain.triggers.length === 0) issues.push(`${id}: no triggers`);
    if (!domain.severity_levels || Object.keys(domain.severity_levels).length === 0) issues.push(`${id}: no severity levels`);
    if (!domain.evidence_refs || domain.evidence_refs.length === 0) issues.push(`${id}: no evidence refs`);
    if (!domain.response_template_id) issues.push(`${id}: no response template`);
  }
  return { valid: issues.length === 0, issues };
}

module.exports = {
  SAFETY_POLICY,
  ROUTE_TO_DOMAIN,
  getPolicyVersion,
  getDomainPolicy,
  getSeverityForDomain,
  validatePolicyCompleteness,
};
