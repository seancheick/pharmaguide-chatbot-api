const { normalizeText } = require("../core/normalize");

function isEmergency(text) {
  const t = normalizeText(text);
  return /\b(overdose[d]?|took too many|took \d+\s+\w*\s*pills|took \d+ pills|swallowed .* pills|whole bottle|entire bottle|can ?t breathe|chest pain|heart attack|stroke|seizure|anaphyla(xis|ctic)?|throat.* clos(ing|ed|es)?|passing out|faint(ed|ing)|suicid|kill myself|want to die|hurt myself|self.?harm|slit|hanging|blacking out|coughing blood|blood in vomit|can ?t stop bleeding|unresponsive|unconscious|not breathing)\b/.test(t);
}

function isGreeting(text) {
  const t = normalizeText(text);
  if (t.length > 20) return false;
  return ["hi","hey","hello","yo","sup","good morning","good afternoon","good evening","howdy"].includes(t);
}

function isThanks(text) {
  const t = normalizeText(text);
  if (t.length > 60) return false;
  if (/\b(can i|should i|what|how|take|dose|interact|safe|supplement|vitamin|medication)\b/.test(t)) return false;
  return /\b(thanks|thank you|thx|ty|appreciate it)\b/.test(t);
}

function isGoodbye(text) {
  const t = normalizeText(text);
  if (t.length > 60) return false;
  if (/\btake care\b/.test(t)) return true;
  if (/\b(can i|should i|what|how|take|dose|interact|safe|supplement|vitamin|medication)\b/.test(t)) return false;
  return /\b(bye|goodbye|see you|cya|later)\b/.test(t);
}

function intentScore(text) {
  const t = normalizeText(text);
  let score = 0;
  if (/\b(supplements?|vitamins?|minerals?|medications?|med|meds|drugs?|pills?|capsules?|tablets?|herbal|extract|protein|probiotic|omega|fish oil|cbd|thc|melatonin|magnesium|iron|zinc|calcium|creatine|ashwagandha|turmeric|curcumin|collagen|biotin|folate|folic|b12|vitamin d|vitamin c|coq10|nac|glutathione|l.?theanine|gaba|valerian|rhodiola|ginseng|echinacea|elderberry|garlic|ginkgo|prescription|rx|otc|pharma|kava|charcoal|berberine|inositol|isotretinoin|accutane|niacin|red yeast rice|birth control|grapefruit|xanax|xanex|alprazolam|clonazepam|lorazepam|ativan|psilocybin|mushroom|microdose|antidepressants?|ssri|zoloft|sertraline|sertaline|prozac|lexapro|wellbutrin|adderall|vyvanse|ritalin|metformin|levothyroxine|warfarin|eliquis|xarelto|rivaroxaban|dabigatran|pradaxa|clopidogrel|plavix|nattokinase|statin|rapamycin|nmn|nad|resveratrol|preworkout|pre\s*workout|spironolactone|aldactone|potassium|lisinopril|enalapril|losartan|kelp|iodine|5.?htp|5.?hydroxytryptophan|st\.?\s*john|prenatal|retinol|retinyl|palmitate|vitamin a)\b/.test(t)) score += 2;
  if (/\b(dose|dosage|interact|can i take|safe to take|safe to|is it safe|safe with|together with|combine|mix with|timing|before bed|empty stomach|with food|morning|evening|how much|how many|milligram|mg|iu|mcg|long.?term|daily|weekly|toxic|toxicity|overdose|side effect|dangerous|er\b|emergency room|urgent care|should i stop|switch to|switch from)\b/.test(t)) score += 2;
  if (/\b(blood pressure|cholesterol|thyroid|diabetes|kidney|liver|heart|stomach|gut|digest|inflam|immune|joint|bone|muscle|weight|cortisol|hormones?|insulin|serotonin|dopamine|pregnant|pregnancy|breastfeed(ing)?|nursing|conceiv|fertility|pcos|allerg|headache|migraine|nause(a|ous)|diarrhea|constipat|bloat|fatigue|insomnia|acne|hair loss|menopaus|menstr|period|pms|anxiety|sleep|energy|pain|symptoms?|side effects?|adhd|depression|seizure|depressed|stressed|focus|doctor|prescriber|pharmacist|wine|alcohol|drink|toxic|toxicity|dangerous|safe|jitter(y|s|ing)?|dizz(y|iness)|rash|hives|swelling|tingling|palpitat(ion|ions|ing)?)\b/.test(t)) score += 1;
  if (/\b(how about|what about|what if|and also|but what|can i also|should i also|instead of|rather than|you said|you mentioned|my results?|my levels?|my blood\s?work|my labs?|the results?|the levels?|i take|i took|i m on|i m taking|i started|i stopped|am i good|is that ok|is that bad|is this bad)\b/.test(t)) score += 1;
  if (t.split(/\s+/).length <= 5) score += 1;
  return score;
}

function mentionsHighRiskSerotonergic(text) {
  const t = normalizeText(text);
  return /\b(5[\s-]?htp|5[\s-]?hydroxytryptophan|st\.?\s*john.?s?\s*wort|tryptophan|rhodiola|psilocybin|mushroom\s*(micro\s*dos|psychedelic))\b/.test(t);
}

function mentionsAntidepressant(text) {
  const t = normalizeText(text);
  return /\b(antidepressants?|ssri|snri|maoi|anxiety meds?|depression meds?|my meds?|sertraline|sertaline|sertralina|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|amitriptyline|nortriptyline|paroxetine|paxil|fluvoxamine|desvenlafaxine|pristiq|phenelzine|tranylcypromine|selegiline)\b/.test(t);
}

function isComplexStack(text) {
  const { extractKnownItems } = require("../core/entities");
  return extractKnownItems(text).size >= 4;
}

function mentionsStimulantMed(text) {
  const t = normalizeText(text);
  return /\b(adderall|amphetamine|vyvanse|lisdexamfetamine|ritalin|methylphenidate|concerta|dexedrine|modafinil)\b/.test(t);
}

function mentionsStimulantSupp(text) {
  const t = normalizeText(text);
  return /\b(rhodiola|ginseng|maca|yohimbine|synephrine|preworkout|pre\s*workout|caffeine)\b/.test(t);
}

function mentionsSerotonergicSymptoms(text) {
  const t = normalizeText(text);
  return /\b(shak(y|ing)|sweat(y|ing)|tremor|agitat(ed|ion)?|confus(ed|ion)?|fever|fast\s*heart|racing\s*heart|heart\s*(is\s*)?(racing|fast|pounding)|palpitat(ion|ions|ing)?|diarrhea|restless|twitch|jerk|rigid|clumsy|disorient|brain\s*zaps?|jitter(y|s|ing)?)\b/.test(t);
}

function mentionsAnticoagulantRiskSupplement(text) {
  const t = normalizeText(text);
  return /\b(turmeric|curcumin|fish oil|omega.?3|ginkgo|garlic supplement|high.?dose garlic|nattokinase|vitamin e|ginger|ginger\s*(supplement|extract|capsule|tea))\b/.test(t);
}

function mentionsBloodThinner(text) {
  const t = normalizeText(text);
  return /\b(blood thinner|anticoagulant|warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|heparin|enoxaparin|lovenox|clopidogrel|plavix|blood clot med|aspirin)\b/.test(t);
}

function mentionsNonEmergencySymptom(text) {
  const t = normalizeText(text);
  return /\b(palpitat(ion|ions|ing)?|dizz(y|iness)|light\s*head|faint\s*(ish|feeling)|rash|hives|swelling|severe\s*headache|numb(ness)?|tingling|muscle\s*cramp|twitch|blurr(y|ed)\s*vision|ring(ing)?\s*(in\s*)?(my\s*)?ears?|tinnitus|heart\s*feels?\s*(weird|strange|funny|off)|feel(s?|ing)\s*(weird|strange|off|funny|wrong)|brain\s*zaps?|shak(y|ing)|jitter(y|s|ing)?|nause(a|ous)|sick\s*(to|after))\b/.test(t);
}

function mentionsSupplementOrDose(text) {
  const t = normalizeText(text);
  return /\b(supplement|vitamin|mineral|mg|iu|mcg|dose|capsule|tablet|pill|took|taking|started|new\s*(supplement|vitamin)|pre\s*workout|preworkout)\b/.test(t);
}

function mentionsHighDoseVitaminD(text) {
  const t = normalizeText(text);
  return /\b(50\s*0{3}|50k)\s*(iu|ui|units?)?\s*(vitamin\s*d|vit\s*d|d3)?/.test(t) ||
    /\b(vitamin\s*d|vit\s*d|d3)\b.*\b(50\s*0{3}|50k)\b/.test(t) ||
    /\bhigh\s*dose\s*(vitamin\s*d|vit\s*d|d3)\b/.test(t);
}

function mentionsHeartSymptoms(text) {
  const t = normalizeText(text);
  return /\b(heart\s*(\w+\s+)?(rate|beat|racing|fast|pound(ing)?|flutter(ing)?|palpitat(ion|ions|ing)?|feels?\s*(weird|strange|funny|off))|palpitat(ion|ions|ing)?|tachycard|racing\s*heart|chest\s*pound|fast\s*heart|rapid\s*heart)\b/.test(t);
}

function mentionsDeficiency(text) {
  const t = normalizeText(text);
  return /\b(deficien(t|cy)|low\s*(vitamin\s*d|vit\s*d|d3|level|result)|level.{0,15}\b([0-9]|1[0-9]|2[0-9])\b|blood\s*work|my\s*(results?|labs?|levels?))\b/.test(t);
}

function mentionsPregnancyContext(text) {
  const t = normalizeText(text);
  return /\b(pregnan(t|cy)|breastfeed(ing)?|nursing|prenatal|conceiv(e|ing)|ttc|trying to conceive|first trimester|second trimester|third trimester|expecting|\d+\s*weeks?\s*pregnant)\b/.test(t);
}

function mentionsRetinolRisk(text) {
  const t = normalizeText(text);
  return /\b(vitamin\s*a(?!\s*(d|e|k))|retinol|retinyl|cod\s*liver\s*oil|liver\s*supplement)\b/.test(t);
}

function mentionsPregnancyLimitedEvidence(text) {
  const t = normalizeText(text);
  return /\b(melatonin|ashwagandha|rhodiola|valerian|kava|st\.?\s*john|ginseng|maca|berberine|echinacea)\b/.test(t);
}

function detectsIsotretinoinVitA(text) {
  const t = normalizeText(text);
  const isotretinoin = /\b(isotretinoin|accutane|claravis|absorica|zenatane|myorisan|amnesteem)\b/.test(t);
  const vitA = /\b(vitamin\s*a|retinol|retinyl|cod\s*liver\s*oil|liver\s*supplement|beta.?carotene)\b/.test(t);
  return isotretinoin && vitA;
}

function mentionsPrenatalOrMulti(text) {
  const t = normalizeText(text);
  return /\b(prenatal|prenatal vitamin|pre\s*natal|multivitamin|multi\s*vitamin|multi|one\s*a\s*day|centrum|ritual|thorne.*prenatal|prenatal.*thorne|garden of life)\b/.test(t);
}

function mentionsStandaloneFatSoluble(text) {
  const t = normalizeText(text);
  return /\b(vitamin\s*d|vit\s*d|d3|vitamin\s*a|retinol|vitamin\s*e|vitamin\s*k|50\s*0{3}\s*(iu|ui)|iron\s*supplement|extra\s*iron|ferrous)\b/.test(t);
}

function detectsLiverToxicityStack(text) {
  const t = normalizeText(text);
  const hepatotoxins = [
    /\b(kava)\b/,
    /\b(green\s*tea\s*extract|gte|egcg)\b/,
    /\b(acetaminophen|tylenol|paracetamol)\b/,
    /\b(alcohol|drink(s|ing)?\s*(socially|alcohol|beer|wine|heavily|occasionally|daily|weekly|nightly)|beer|wine|cocktail)\b/,
    /\b(niacin|nicotinic\s*acid)\b/,
  ];
  let count = 0;
  for (const p of hepatotoxins) {
    if (p.test(t)) count++;
  }
  if (count >= 2) return true;
  if (count >= 1 && /\b(liver\s*(damage|failure|injur|toxicit|problem|harm|issue)|hepatotoxic|hepatitis)\b/.test(t)) return true;
  return false;
}

function detectsCharcoalMed(text) {
  const t = normalizeText(text);
  const charcoal = /\b(activated\s*charcoal|charcoal\s*(supplement|capsule|pill|daily|detox))\b/.test(t);
  const medication = /\b(birth control|contracepti|pills?|medications?|meds?|levothyroxine|synthroid|prescription|rx|drugs?)\b/.test(t);
  return charcoal && medication;
}

function detectsGrapefruitInteraction(text) {
  const t = normalizeText(text);
  const grapefruit = /\b(grapefruit|grapefruit juice)\b/.test(t);
  const cyp3a4Substrates = /\b(simvastatin|zocor|atorvastatin|lipitor|lovastatin|quetiapine|seroquel|buspirone|felodipine|cyclosporine|tacrolimus|midazolam|triazolam|nifedipine|carbamazepine|ergotamine|fentanyl)\b/.test(t);
  const vagueStatinOrMed = /\b(statin|cholesterol\s*meds?|my\s*(med|medication|prescription))\b/.test(t);
  return grapefruit && (cyp3a4Substrates || vagueStatinOrMed);
}

function detectsSSRIDiscontinuation(text) {
  const t = normalizeText(text);
  const discontinued = /\b(stopped|quit|came off|went off|discontinu|weaning off|tapered off|ran out|no longer tak|don t want to take|want to stop|want to quit|want to get off|getting off|going off)\b/.test(t);
  const ssri = /\b(ssri|antidepressant|sertraline|sertaline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|paroxetine|paxil|duloxetine|cymbalta|fluvoxamine|desvenlafaxine|pristiq)\b/.test(t);
  const substitute = /\b(5[\s-]?htp|st\.?\s*john|tryptophan|ashwagandha|rhodiola|instead|replace|substitute|switch|can i just)\b/.test(t);
  return discontinued && ssri && substitute;
}

function detectsPotassiumACEi(text) {
  const t = normalizeText(text);
  const potassium = /\b(potassium\s*(supplements?|citrate|chloride|gluconate)|extra potassium)\b/.test(t);
  const acei = /\b(lisinopril|enalapril|ramipril|benazepril|ace inhibitor|acei|losartan|valsartan|irbesartan|olmesartan|telmisartan|arb|spironolactone|aldactone|eplerenone)\b/.test(t);
  return potassium && acei;
}

function detectsIodineThyroid(text) {
  const t = normalizeText(text);
  const iodine = /\b(iodine|iodide|kelp\s*supplements?|sea\s*kelp|bladderwrack)\b/.test(t);
  const thyroid = /\b(thyroid(ism)?|hashimoto.?s?|graves|hypothyroid(ism)?|hyperthyroid(ism)?|levothyroxine|synthroid|armour thyroid|tirosint)\b/.test(t);
  return iodine && thyroid;
}

function detectsNiacinStatin(text) {
  const t = normalizeText(text);
  const niacin = /\b(niacin|nicotinic acid|vitamin b3)\b/.test(t);
  if (/\bniacinamide\b/.test(t) && !/\bniacin\b/.test(t)) return false;
  const statin = /\b(statin|atorvastatin|lipitor|rosuvastatin|crestor|simvastatin|zocor|pravastatin|lovastatin|fluvastatin|pitavastatin|red yeast rice)\b/.test(t);
  return niacin && statin;
}

function needsMedicationClarifier(text) {
  const t = normalizeText(text);
  if (t.length > 250) return false;
  const vaguemedRef = /\b(my meds?|my medication|my prescription|my antidepressant|my blood thinner|my statin|some antidepressant|an? antidepressant|an? adhd med|anxiety meds?|depression meds?|blood pressure meds?|heart meds?|thyroid meds?|sleep meds?|natural supplement|a supplement|a natural|natural stuff|something for (energy|sleep|anxiety|focus|mood|stress|pain)|a lot of meds|lots of (meds|medications|prescriptions|pills)|bunch of|don t know.{0,20}(med|pill|name)|yellow pill|blue pill|white pill|that pill|starts with|some pill)\b/.test(t);
  const unknownBrandSafety = /\b(safe with|safe to take with|is .{3,50} safe|ok with|okay with)\b/.test(t) && !/(magnesium|iron|zinc|calcium|vitamin|ashwagandha|turmeric|fish oil|melatonin|creatine|biotin|rhodiola|ginseng|kava|berberine|nac|coq10|collagen|valerian|charcoal|ginkgo|echinacea|elderberry|niacin|red yeast rice|quercetin|resveratrol|omega|probiotics?)/.test(t);
  if (!vaguemedRef && !unknownBrandSafety) return false;
  const highRiskSupplement = /\b(5.?htp|st\.? john.?s? wort|maoi|grapefruit|psilocybin|nattokinase)\b/.test(t);
  if (highRiskSupplement) return false;
  if (/^(why|how come|i can t believe|i wish|i m (worried|scared|frustrated|confused|upset))/.test(t)) return false;
  const specificItems = t.match(/\b(sertraline|sertaline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|metformin|levothyroxine|synthroid|warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|atorvastatin|lipitor|lisinopril|amlodipine|losartan|omeprazole|pantoprazole|gabapentin|pregabalin|tramadol|hydrocodone|oxycodone|ibuprofen|naproxen|acetaminophen|aspirin|prednisone|metoprolol|propranolol|clonazepam|lorazepam|alprazolam|xanax|duloxetine|trazodone|mirtazapine|amitriptyline|lithium|lamotrigine|quetiapine|aripiprazole|isotretinoin|accutane|spironolactone|simvastatin|buspirone|clopidogrel|clobazam|adderall|vyvanse|ritalin|concerta|magnesium|iron|zinc|calcium|ashwagandha|turmeric|curcumin|fish oil|melatonin|creatine|biotin|rhodiola|ginseng|kava|berberine|nac|coq10|collagen|valerian|charcoal|ginkgo|vitamin d|vitamin c|b12)\b/g);
  if (specificItems && specificItems.length >= 3) return false;
  return true;
}

function mentionsMineralSpacingTrigger(text) {
  const t = normalizeText(text);
  const minerals = /\b(magnesium|mag glycinate|magnesium glycinate|iron|ferrous|calcium|zinc)\b/;
  if (!minerals.test(t)) return false;
  const timingIntent = /\b(timing|when should|morning|evening|empty stomach|with food|separate|space|together|what time|before bed|after meal|same time)\b/.test(t);
  const targetMeds = /\b(levothyroxine|synthroid|tirosint|armour thyroid|tetracycline|doxycycline|minocycline|cipro|ciprofloxacin|levofloxacin|fluoroquinolone|thyroid\s*med)\b/.test(t);
  return timingIntent || targetMeds;
}

function detectsNSAIDAnticoagulant(text) {
  const t = normalizeText(text);
  const nsaid = /\b(ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|indomethacin|ketorolac|piroxicam|nsaid)\b/.test(t);
  const anticoag = /\b(warfarin|coumadin|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|heparin|blood thinner|anticoagulant)\b/.test(t);
  return nsaid && anticoag;
}

function detectsTripleWhammy(text) {
  // Triple whammy: NSAID + ACEi/ARB + diuretic → acute kidney injury risk
  const t = normalizeText(text);
  const nsaid = /\b(ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|nsaid)\b/.test(t);
  const raas = /\b(lisinopril|enalapril|ramipril|benazepril|losartan|valsartan|irbesartan|olmesartan|telmisartan|ace inhibitor|acei|arb)\b/.test(t);
  const diuretic = /\b(hydrochlorothiazide|hctz|furosemide|lasix|spironolactone|chlorthalidone|diuretic|water pill)\b/.test(t);
  return nsaid && raas && diuretic;
}

function detectsLithiumNSAID(text) {
  const t = normalizeText(text);
  const lithium = /\b(lithium|lithobid|eskalith)\b/.test(t);
  const nsaid = /\b(ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|indomethacin|ketorolac|nsaid)\b/.test(t);
  return lithium && nsaid;
}

function detectsMetforminAlcohol(text) {
  const t = normalizeText(text);
  const metformin = /\b(metformin|glucophage)\b/.test(t);
  const alcohol = /\b(alcohol|beer|wine|liquor|drink(ing|s)?|cocktail|bourbon|whiskey|vodka)\b/.test(t);
  return metformin && alcohol;
}

function detectRiskFamilies(text) {
  const families = [];
  if (mentionsHighRiskSerotonergic(text) && mentionsAntidepressant(text)) families.push("serotonin");
  if (mentionsAnticoagulantRiskSupplement(text) && mentionsBloodThinner(text)) families.push("bleeding");
  if (mentionsStimulantMed(text) && mentionsStimulantSupp(text)) families.push("stimulant");
  if (detectsLiverToxicityStack(text)) families.push("liver");
  return families;
}

module.exports = {
  isEmergency,
  isGreeting,
  isThanks,
  isGoodbye,
  intentScore,
  mentionsHighRiskSerotonergic,
  mentionsAntidepressant,
  isComplexStack,
  mentionsStimulantMed,
  mentionsStimulantSupp,
  mentionsSerotonergicSymptoms,
  mentionsAnticoagulantRiskSupplement,
  mentionsBloodThinner,
  mentionsNonEmergencySymptom,
  mentionsSupplementOrDose,
  mentionsHighDoseVitaminD,
  mentionsHeartSymptoms,
  mentionsDeficiency,
  mentionsPregnancyContext,
  mentionsRetinolRisk,
  mentionsPregnancyLimitedEvidence,
  detectsIsotretinoinVitA,
  mentionsPrenatalOrMulti,
  mentionsStandaloneFatSoluble,
  detectsLiverToxicityStack,
  detectsCharcoalMed,
  detectsGrapefruitInteraction,
  detectsSSRIDiscontinuation,
  detectsPotassiumACEi,
  detectsIodineThyroid,
  detectsNiacinStatin,
  needsMedicationClarifier,
  mentionsMineralSpacingTrigger,
  detectsNSAIDAnticoagulant,
  detectsTripleWhammy,
  detectsLithiumNSAID,
  detectsMetforminAlcohol,
  detectRiskFamilies,
};
