const { normalizeText } = require("./normalize");
const { mentionsPregnancyContext } = require("../gates/detection");

const ENTITY_PATTERNS = {
  antidepressants: /\b(sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|paroxetine|paxil|phenelzine|tranylcypromine|selegiline|lithium|lamotrigine|quetiapine|aripiprazole|buspirone)\b/g,
  stimulantMeds: /\b(adderall|ritalin|concerta|vyvanse|dexedrine|modafinil|methylphenidate|amphetamine)\b/g,
  minerals: /\b(magnesium|iron|zinc|calcium|vitamin\s*d|vitamin\s*c|b12|folate|biotin|iodine|potassium)\b/g,
  supplements: /\b(ashwagandha|rhodiola|l.?theanine|gaba|valerian|melatonin|5[\s-]?htp|st\.?\s*john|ginseng|maca|turmeric|curcumin|fish oil|omega|creatine|nac|coq10|glutathione|echinacea|kava|berberine|inositol|phenylpiracetam|alpha.?gpc)\b/g,
  medications: /\b(warfarin|eliquis|xarelto|lisinopril|metformin|levothyroxine|atorvastatin|lipitor|simvastatin|metoprolol|propranolol|gabapentin|pregabalin|losartan|amlodipine|omeprazole|prednisone|aspirin|clopidogrel|spironolactone|isotretinoin|accutane)\b/g,
};

function extractKnownItems(text) {
  const t = normalizeText(text);
  const items = new Set();
  for (const key of Object.keys(ENTITY_PATTERNS)) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(t)) !== null) items.add(m[0]);
  }
  return items;
}

function extractEntities(text, convoContext) {
  const t = normalizeText(text);
  const ctx = convoContext || t;
  const detection = require("../gates/detection");

  // Meds: antidepressants + stimulantMeds + medications patterns
  const meds = new Set();
  for (const key of ["antidepressants", "stimulantMeds", "medications"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) meds.add(m[0]);
  }

  // Supplements: minerals + supplements patterns
  const supplements = new Set();
  for (const key of ["minerals", "supplements"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) supplements.add(m[0]);
  }

  // Populations
  const populations = [];
  if (mentionsPregnancyContext(ctx)) populations.push("pregnancy");
  if (/\b(elderly|65\+|senior|geriatric|older\s*adult)\b/.test(normalizeText(ctx))) populations.push("elderly");
  if (/\b(kidney|renal|ckd|dialysis|creatinine|gfr|nephro)\b/.test(normalizeText(ctx))) populations.push("renal");

  // Symptoms
  const symptoms = [];
  if (detection.mentionsSerotonergicSymptoms(text)) symptoms.push("serotonergic_symptoms");
  if (detection.mentionsHeartSymptoms(text)) symptoms.push("heart_symptoms");
  if (detection.mentionsNonEmergencySymptom(text)) symptoms.push("non_emergency_symptoms");

  // Intents
  const intents = [];
  const nt = normalizeText(text);
  if (/\b(interact|can i take|safe to take|safe with|together with|combine|mix with)\b/.test(nt)) intents.push("interaction_check");
  if (/\b(dose|dosage|how much|how many|milligram|mg|iu|mcg)\b/.test(nt)) intents.push("dosing");
  if (/\b(timing|when should|morning|evening|empty stomach|with food|before bed|same time|separate|space)\b/.test(nt)) intents.push("timing");
  if (/\b(stopped|quit|came off|went off|discontinu|weaning off|tapered off|ran out|want to stop|getting off|going off)\b/.test(nt)) intents.push("discontinuation");

  // Unknowns
  const unknowns = [];
  if (detection.needsMedicationClarifier(text)) unknowns.push("unidentified_item");

  return {
    meds: [...meds],
    supplements: [...supplements],
    populations,
    symptoms,
    intents,
    unknowns,
  };
}

module.exports = { ENTITY_PATTERNS, extractKnownItems, extractEntities };
