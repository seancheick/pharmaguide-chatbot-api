const { normalizeText } = require("./normalize");
const { detectPopulations } = require("../gates/detection");

const ENTITY_PATTERNS = {
  antidepressants: /\b(sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|paroxetine|paxil|fluvoxamine|luvox|desvenlafaxine|pristiq|phenelzine|tranylcypromine|selegiline|lithium|lamotrigine|quetiapine|aripiprazole|buspirone)\b/g,
  stimulantMeds: /\b(adderall|ritalin|concerta|vyvanse|dexedrine|modafinil|provigil|armodafinil|nuvigil|methylphenidate|amphetamine|lisdexamfetamine)\b/g,
  benzodiazepines: /\b(alprazolam|xanax|clonazepam|klonopin|lorazepam|ativan|diazepam|valium|temazepam|restoril|oxazepam|chlordiazepoxide|librium|midazolam)\b/g,
  betaBlockers: /\b(metoprolol|atenolol|propranolol|carvedilol|bisoprolol|nadolol|nebivolol|sotalol|labetalol|lopressor|tenormin|inderal|coreg)\b/g,
  minerals: /\b(magnesium|iron|zinc|calcium|vitamin\s*d|vitamin\s*c|vitamin\s*a|vitamin\s*e|vitamin\s*k|b12|b6|folate|folic\s*acid|biotin|iodine|potassium|selenium|copper|chromium|manganese)\b/g,
  supplements: /\b(ashwagandha|rhodiola|l.?theanine|gaba|valerian|melatonin|glycine|5[\s-]?htp|st\.?\s*john|ginseng|maca|turmeric|curcumin|fish oil|omega|creatine|nac|coq10|glutathione|echinacea|kava|berberine|inositol|phenylpiracetam|alpha.?gpc|ginkgo|garlic|quercetin|resveratrol|elderberry|saw palmetto|milk thistle|d.?mannose|probiotics?|collagen|cbd|glucosamine|chondroitin|boric acid|cranberry|l.?carnitine|(?:l.?)?arginine|(?:l.?)?citrulline|citrulline malate|fenugreek|tribulus|tongkat ali|dim|vitex|black cohosh|evening primrose|myo.?inositol|stinging nettle|nettle leaf|bromelain|butterbur|spirulina|bee pollen|local honey|lion.?s?\s*mane|apple cider vinegar|acv|electrolytes?|whey protein|protein powder|activated charcoal|psyllium|psyllium husk|metamucil|glucomannan|konjac|red yeast rice|red rice yeast|ryr|monacolin|plant sterols?|phytosterols?|beta.?sitosterol|b.?complex|b.?vitamins|shilajit|sea moss|hibiscus|chamomile|peppermint tea|ginger tea|raspberry leaf|licorice root|dong quai|irish moss|tart cherry|turkesterone|fadogia|apigenin|magnesium l.?threonate|dhea|pregnenolone|boron|bpc.?157|tb.?500|ghk.?cu|ipamorelin|sermorelin|spermidine|nmn|pterostilbene|pqq|sulforaphane|urolithin|fisetin|sam-e|garcinia|cla|conjugated linoleic|carb\s*blocker|white kidney bean|green coffee|chlorophyll|greens?\s*powder|reishi|chaga|cordyceps|astaxanthin|hyaluronic acid|beef liver|organ meat|fiber\s*supplement|psyllium|inulin|pectin|simethicone|gas.?x)\b/g,
  antihistamines: /\b(cetirizine|zyrtec|loratadine|claritin|fexofenadine|allegra|diphenhydramine|benadryl|levocetirizine|xyzal|hydroxyzine|desloratadine|clarinex|chlorpheniramine|antihistamine)\b/g,
  medications: /\b(warfarin|coumadin|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|lisinopril|enalapril|ramipril|quinapril|benazepril|metformin|levothyroxine|synthroid|armour thyroid|atorvastatin|lipitor|simvastatin|zocor|rosuvastatin|crestor|pravastatin|lovastatin|metoprolol|propranolol|gabapentin|neurontin|pregabalin|lyrica|losartan|valsartan|irbesartan|olmesartan|amlodipine|omeprazole|prilosec|pantoprazole|protonix|esomeprazole|nexium|lansoprazole|prevacid|famotidine|pepcid|prednisone|prednisolone|aspirin|clopidogrel|plavix|spironolactone|isotretinoin|accutane|ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|acetaminophen|tylenol|indomethacin|ketorolac|hydrochlorothiazide|hctz|furosemide|lasix|chlorthalidone|tramadol|cyclobenzaprine|amiodarone|digoxin|diltiazem|verapamil|birth control|oral contraceptive|finasteride|propecia|proscar|tamsulosin|flomax|doxycycline|amoxicillin|azithromycin|ciprofloxacin|fluconazole|metronidazole|semaglutide|ozempic|wegovy|rybelsus|tirzepatide|mounjaro|zepbound|liraglutide|saxenda|victoza|glp.?1)\b/g,
  // PDE5 inhibitors — vasodilators used for ED. Combining with
  // L-arginine/L-citrulline or any nitrate can cause severe hypotension.
  pde5Inhibitors: /\b(sildenafil|viagra|tadalafil|cialis|vardenafil|levitra|staxyn|avanafil|stendra|revatio|adcirca)\b/g,
  // Nitrates — vasodilators for angina / heart failure. Same severe
  // hypotension risk when combined with PDE5 inhibitors or arginine.
  nitrates: /\b(nitroglycerin|nitro|nitrostat|nitromist|nitrolingual|nitroquick|nitrodur|nitro.?dur|nitrobid|isosorbide|isosorbide\s+mononitrate|isosorbide\s+dinitrate|imdur|isordil|ismo|monoket|dilatrate)\b/g,
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

  const meds = new Set();
  const pde5Hits = new Set();
  const nitrateHits = new Set();
  for (const key of ["antidepressants", "stimulantMeds", "benzodiazepines", "betaBlockers", "antihistamines", "medications", "pde5Inhibitors", "nitrates"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) {
      meds.add(m[0]);
      if (key === "pde5Inhibitors") pde5Hits.add(m[0]);
      if (key === "nitrates") nitrateHits.add(m[0]);
    }
  }

  const supplements = new Set();
  for (const key of ["minerals", "supplements"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) supplements.add(m[0]);
  }

  const populations = detectPopulations(ctx);

  const symptoms = [];
  if (detection.mentionsSerotonergicSymptoms(text)) symptoms.push("serotonergic_symptoms");
  if (detection.mentionsHeartSymptoms(text)) symptoms.push("heart_symptoms");
  if (detection.mentionsNonEmergencySymptom(text)) symptoms.push("non_emergency_symptoms");

  const intents = [];
  const nt = normalizeText(text);
  if (/\b(interact|can i take|safe to take|safe with|together with|combine|mix with)\b/.test(nt)) intents.push("interaction_check");
  if (/\b(dose|dosage|how much|how many|milligram|mg|iu|mcg)\b/.test(nt)) intents.push("dosing");
  if (/\b(timing|when should|morning|evening|empty stomach|with food|before bed|same time|separate|space)\b/.test(nt)) intents.push("timing");
  if (/\b(stopped|quit|came off|went off|discontinu|weaning off|tapered off|ran out|want to stop|getting off|going off)\b/.test(nt)) intents.push("discontinuation");

  const unknowns = [];
  if (detection.needsMedicationClarifier(text)) unknowns.push("unidentified_item");

  // Drug-class tags so the router can fan out without re-running the regex set.
  const drug_classes = [];
  if (pde5Hits.size > 0) drug_classes.push("pde5_inhibitor");
  if (nitrateHits.size > 0) drug_classes.push("nitrate");

  return {
    meds: [...meds],
    supplements: [...supplements],
    populations,
    symptoms,
    intents,
    unknowns,
    drug_classes,
  };
}

module.exports = { ENTITY_PATTERNS, extractKnownItems, extractEntities };
