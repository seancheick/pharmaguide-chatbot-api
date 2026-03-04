const REQUIRED_FIELDS_REGISTRY = {
  "system:serotonin-risk": {
    fields: ["antidepressant_name"],
    priority: ["antidepressant_name"],
    prompts: {
      antidepressant_name: "Which antidepressant are you taking (name + dose)?",
    },
  },
  "system:serotonin-urgent": {
    fields: [],
    priority: [],
    prompts: {},
  },
  "system:blood-thinner-risk": {
    fields: ["blood_thinner_name"],
    priority: ["blood_thinner_name"],
    prompts: {
      blood_thinner_name: "Which blood thinner are you on?",
    },
  },
  "system:liver-toxicity": {
    fields: ["frequency_of_use"],
    priority: ["frequency_of_use"],
    prompts: {
      frequency_of_use: "How often do you take each of these, and for how long?",
    },
  },
  "system:charcoal-med": {
    fields: ["medication_list"],
    priority: ["medication_list"],
    prompts: {
      medication_list: "Which medications are you currently taking?",
    },
  },
  "system:pregnancy-retinol": {
    fields: ["prenatal_brand", "vitamin_a_form"],
    priority: ["prenatal_brand"],
    prompts: {
      prenatal_brand: "Which prenatal (brand name)?",
      vitamin_a_form: "What does the vitamin A line say on the label (mcg, retinol vs beta-carotene)?",
    },
  },
  "system:pregnancy-limited": {
    fields: ["reason_for_use"],
    priority: ["reason_for_use"],
    prompts: {
      reason_for_use: "What are you taking it for?",
    },
  },
  "system:isotretinoin-vita": {
    fields: [],
    priority: [],
    prompts: {},
  },
  "system:stacking-risk": {
    fields: ["prenatal_brand", "prenatal_label_values"],
    priority: ["prenatal_brand"],
    prompts: {
      prenatal_brand: "Which prenatal (exact brand name)?",
      prenatal_label_values: "What does the label list for vitamins D, A, iron, and K?",
    },
  },
  "system:grapefruit-cyp3a4": {
    fields: ["medication_name"],
    priority: ["medication_name"],
    prompts: {
      medication_name: "Which medication(s) are you taking?",
    },
  },
  "system:potassium-acei": {
    fields: ["medication_name"],
    priority: ["medication_name"],
    prompts: {
      medication_name: "Which medication are you on?",
    },
  },
  "system:iodine-thyroid": {
    fields: ["thyroid_condition", "iodine_dose"],
    priority: ["thyroid_condition"],
    prompts: {
      thyroid_condition: "What thyroid condition do you have?",
      iodine_dose: "What dose of iodine are you considering?",
    },
  },
  "system:niacin-statin": {
    fields: ["niacin_dose", "statin_name"],
    priority: ["niacin_dose"],
    prompts: {
      niacin_dose: "What dose of niacin are you taking?",
      statin_name: "Which statin?",
    },
  },
  "system:renal-magnesium": {
    fields: ["ckd_stage"],
    priority: ["ckd_stage"],
    prompts: {
      ckd_stage: "What stage is your kidney disease?",
    },
  },
  "system:ssri-discontinuation": {
    fields: ["ssri_name", "time_since_stop"],
    priority: ["ssri_name"],
    prompts: {
      ssri_name: "Which SSRI did you stop?",
      time_since_stop: "How long ago did you stop?",
    },
  },
  "system:clarifier": {
    fields: ["medication_name"],
    priority: ["medication_name"],
    prompts: {
      medication_name: "Which medication(s) are you taking?",
    },
  },
  "system:stack-triage": {
    fields: [],
    priority: [],
    prompts: {},
  },
  "system:symptom-triage": {
    fields: ["supplement_changed", "symptom_onset"],
    priority: ["supplement_changed"],
    prompts: {
      supplement_changed: "Which supplement/medication did you recently start or change?",
      symptom_onset: "When did the symptoms begin?",
    },
  },
  "system:vitd-palpitations": {
    fields: ["other_substances"],
    priority: ["other_substances"],
    prompts: {
      other_substances: "What else are you taking (caffeine, preworkout, etc.)?",
    },
  },
};

function findMissingFields(route, state) {
  const registry = REQUIRED_FIELDS_REGISTRY[route];
  if (!registry) return [];

  const missing = [];
  for (const field of registry.fields) {
    // Check if state has info that satisfies this field
    let satisfied = false;
    switch (field) {
      case "antidepressant_name":
        satisfied = state.known_meds.some((m) => /sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|paroxetine|paxil|phenelzine|tranylcypromine|selegiline/.test(m));
        break;
      case "blood_thinner_name":
        satisfied = state.known_meds.some((m) => /warfarin|eliquis|xarelto|pradaxa|plavix|aspirin|clopidogrel/.test(m));
        break;
      case "medication_name":
      case "medication_list":
        satisfied = state.known_meds.length > 0;
        break;
      case "prenatal_brand":
      case "prenatal_label_values":
      case "vitamin_a_form":
      case "frequency_of_use":
      case "reason_for_use":
      case "thyroid_condition":
      case "iodine_dose":
      case "niacin_dose":
      case "statin_name":
      case "ckd_stage":
      case "ssri_name":
      case "time_since_stop":
      case "supplement_changed":
      case "symptom_onset":
      case "other_substances":
        // These require specific user input we can't detect from entity extraction alone
        satisfied = false;
        break;
      default:
        satisfied = false;
    }
    if (!satisfied) missing.push(field);
  }
  return missing;
}

function pickHighestImpactQuestion(route, state) {
  const missing = findMissingFields(route, state);
  if (missing.length === 0) return null;

  const registry = REQUIRED_FIELDS_REGISTRY[route];
  // Return the highest-priority missing field's prompt
  for (const field of registry.priority) {
    if (missing.includes(field)) {
      return { field, prompt: registry.prompts[field] };
    }
  }
  // Fallback to first missing
  return { field: missing[0], prompt: registry.prompts[missing[0]] };
}

module.exports = { REQUIRED_FIELDS_REGISTRY, findMissingFields, pickHighestImpactQuestion };
