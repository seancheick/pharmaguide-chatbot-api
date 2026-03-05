const { normalizeText } = require("../core/normalize");

function isEmergency(text) {
  const t = normalizeText(text);
  const emergencyMatch = t.match(/\b(overdose[d]?|took too many|took \d+\s+\w*\s*pills|took \d+ pills|took a handful|swallowed .* pills|ingested too many|whole bottle|entire bottle|can ?t breathe|chest pain|heart attack|stroke|seizure|anaphyla(xis|ctic)?|throat.*(clos(ing|ed|es)?|swell(ing|ed|s)?|tight(en|ening)?)|passing out|faint(ed|ing)|suicid|kill myself|want to die|end it all|wanna die|hurt myself|self.?harm|slit|hanging|blacking out|coughing blood|blood in vomit|vomiting blood|can ?t stop bleeding|unresponsive|unconscious|not breathing|choking)\b/);
  if (!emergencyMatch) return false;
  // Allow educational/informational framing to pass through
  const idx = emergencyMatch.index;
  const prefix = t.substring(Math.max(0, idx - 60), idx);
  if (/\b(may indicate|can indicate|could indicate|sign of|signs of|risk of|cause of|caused by|known as|history of|prevent|research|about|what is|common cause|symptom of|symptoms of|lead to|associated with|linked to)\b/.test(prefix)) {
    // Still fire if there's also a first-person present-tense emergency signal
    if (/\b(i (have|am|think|feel|can ?t)|my .{0,10}(is|are|having)|help me|someone is|they re)\b/.test(t)) return true;
    return false;
  }
  return true;
}

function isGreeting(text) {
  const t = normalizeText(text);
  if (t.length > 20) return false;
  return ["hi","hey","hello","yo","sup","good morning","good afternoon","good evening","howdy","hiya","hey there","hi there","heya","heyy","greetings","what s up","whats up","good day"].includes(t);
}

function isThanks(text) {
  const t = normalizeText(text);
  if (t.length > 60) return false;
  if (/\b(can i|should i|what|how|take|dose|interact|safe|supplement|vitamin|medication)\b/.test(t)) return false;
  return /\b(thanks|thank you|thank u|thx|ty|tysm|appreciate it|much appreciated|cheers)\b/.test(t);
}

function isGoodbye(text) {
  const t = normalizeText(text);
  if (t.length > 60) return false;
  if (/\btake care\b/.test(t)) return true;
  if (/\b(can i|should i|what|how|take|dose|interact|safe|supplement|vitamin|medication)\b/.test(t)) return false;
  return /\b(bye|goodbye|see you|cya|later|gotta go|peace out|ttyl|have a good one|good night|signing off|i m out)\b/.test(t);
}

function isFlirty(text) {
  const t = normalizeText(text);
  if (t.length > 120) return false;
  // Direct flirty signals
  if (/\b(take you out|go on a date|take you.{0,10}date|date me|one date|marry me|be my girlfriend|be my boyfriend|i love you|wanna hang|can i have your number|are you single|you free tonight|flirt(ing)?)\b/.test(t)) return true;
  // Compliment-flirting
  if (/\b(you.?re|you are|you look|you sound)\s+(so\s+)?(cute|hot|pretty|beautiful|sexy|attractive|gorgeous|fine|stunning)\b/.test(t)) return true;
  // Persistent dinner/coffee asks (only if short and no supplement/med context)
  if (t.length < 60 && /\b(dinner with you|coffee with you|lunch with you|drinks with you|go out with you|hang out with you|what about.{0,10}(dinner|coffee|drinks|lunch))\b/.test(t)) return true;
  return false;
}

function isCreatorQuestion(text) {
  const t = normalizeText(text);
  if (t.length > 100) return false;
  return /\b(who (made|built|created|invented|designed|developed) you|who are you(r)? (creator|maker|developer|inventor)|who.?s behind you|who is your (creator|maker|developer)|who owns you|who runs you)\b/.test(t);
}

function isPetQuestion(text) {
  const t = normalizeText(text);
  if (t.length > 200) return false;
  // Only fire if there's clear animal context
  return /\b(my (dog|cat|pet|puppy|kitten|hamster|rabbit|bird|horse|ferret|guinea pig)|give.{0,15}(dog|cat|pet|puppy|kitten)|dog.{0,15}(take|eat|ate|swallow|chew)|cat.{0,15}(take|eat|ate|swallow|chew)|pet.{0,15}(supplement|vitamin|medication|med|safe)|for (dogs?|cats?|pets?|animals?)|veterinar|my animal)\b/.test(t);
}

function isBusinessInquiry(text) {
  const t = normalizeText(text);
  if (t.length > 200) return false;
  // Exclude if there's clear supplement/med context
  if (/\b(can i take|safe to take|interact|dose|mg|iu|supplement|vitamin|medication|side effect)\b/.test(t)) return false;
  return /\b(partner(ship)?|collaborate|collaboration|invest(or|ment|ing)?|sponsor|business|b2b|api access|white label|licensing|license|pricing|how much does|is (it|this|pharmaguide) free|subscription|plan|enterprise|career|job|hiring|work (for|at|with) (you|pharmaguide)|apply|join the team|join your team|contact (you|pharmaguide|the team|support)|reach out|get in touch|email|phone number|how (can|do) (i|we) (reach|contact)|feature request|suggest a feature|new feature|feedback|report a bug|bug report|advertise|advertising|marketing|affiliate|what (does|can|is) pharmaguide|what do you do|what are your features|what features|how does pharmaguide work|tell me about pharmaguide|about pharmaguide)\b/.test(t);
}

function intentScore(text) {
  const t = normalizeText(text);
  let score = 0;
  if (/\b(supplements?|vitamins?|minerals?|medications?|med|meds|drugs?|pills?|capsules?|tablets?|herbal|extract|protein|probiotic|omega|fish oil|cbd|thc|melatonin|magnesium|iron|zinc|calcium|creatine|ashwagandha|turmeric|curcumin|collagen|biotin|folate|folic|b12|vitamin d|vitamin c|coq10|nac|glutathione|l.?theanine|gaba|valerian|rhodiola|ginseng|echinacea|elderberry|garlic|ginkgo|prescription|rx|otc|pharma|kava|charcoal|berberine|inositol|isotretinoin|accutane|niacin|red yeast rice|birth control|grapefruit|xanax|xanex|alprazolam|clonazepam|lorazepam|ativan|psilocybin|mushroom|microdose|antidepressants?|ssri|zoloft|sertraline|sertaline|prozac|lexapro|wellbutrin|adderall|vyvanse|ritalin|metformin|levothyroxine|warfarin|eliquis|xarelto|rivaroxaban|dabigatran|pradaxa|clopidogrel|plavix|nattokinase|statin|rapamycin|nmn|nad|resveratrol|preworkout|pre\s*workout|spironolactone|aldactone|potassium|lisinopril|enalapril|losartan|kelp|iodine|5.?htp|5.?hydroxytryptophan|st\.?\s*john|prenatal|retinol|retinyl|palmitate|vitamin a|ibuprofen|advil|motrin|naproxen|aleve|acetaminophen|tylenol|diclofenac|celecoxib|celebrex|meloxicam)\b/.test(t)) score += 2;
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
  return /\b(antidepressants?|ssri|snri|maoi|anxiety meds?|depression meds?|my meds?|sertraline|sertaline|sertralina|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|amitriptyline|nortriptyline|paroxetine|paxil|fluvoxamine|desvenlafaxine|pristiq|phenelzine|tranylcypromine|selegiline|vortioxetine|vilazodone|doxepin|clomipramine|imipramine)\b/.test(t);
}

function isComplexStack(text) {
  const { extractKnownItems } = require("../core/entities");
  return extractKnownItems(text).size >= 4;
}

function mentionsStimulantMed(text) {
  const t = normalizeText(text);
  return /\b(adderall|amphetamine|vyvanse|lisdexamfetamine|ritalin|methylphenidate|concerta|dexedrine|modafinil|armodafinil)\b/.test(t);
}

function mentionsStimulantSupp(text) {
  const t = normalizeText(text);
  return /\b(rhodiola|ginseng|maca|yohimbine|synephrine|preworkout|pre\s*workout|caffeine|guarana|ephedra|ephedrine|dmaa|energy drink|coffee|matcha)\b/.test(t);
}

function mentionsSerotonergicSymptoms(text) {
  const t = normalizeText(text);
  return /\b(shak(y|ing)|sweat(y|ing|s)?|drenched in sweat|tremor|agitat(ed|ion)?|confus(ed|ion)?|fever|overheated|high temperature|fast\s*heart|racing\s*heart|heart\s*(is\s*)?(racing|fast|pounding)|palpitat(ion|ions|ing)?|diarrhea|restless|twitch|jerk|rigid|clumsy|disorient|brain\s*zaps?|jitter(y|s|ing)?|dilated pupils?|jaw\s*clench|teeth\s*chatter|feeling\s*faint|feeling\s*wired|clonus)\b/.test(t);
}

function mentionsAnticoagulantRiskSupplement(text) {
  const t = normalizeText(text);
  return /\b(turmeric|curcumin|fish oil|omega.?3|ginkgo|garlic supplement|high.?dose garlic|nattokinase|vitamin e|ginger|ginger\s*(supplement|extract|capsule|tea))\b/.test(t);
}

function mentionsBloodThinner(text) {
  const t = normalizeText(text);
  return /\b(blood thinner|anticoagulant|warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|heparin|enoxaparin|lovenox|clopidogrel|plavix|edoxaban|ticagrelor|prasugrel|fondaparinux|blood clot med|aspirin)\b/.test(t);
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
  return /\b(heart\s*(\w+\s+)?(rate|beat|racing|fast|pound(ing)?|flutter(ing)?|palpitat(ion|ions|ing)?|skip(ped|ping|s)?|feels?\s*(weird|strange|funny|off))|heartbeat|palpitat(ion|ions|ing)?|tachycardi|arrhythmi|racing\s*heart|chest\s*(pound|tight)|fast\s*heart|rapid\s*heart|irregular\s*heart|pulse\s*(is\s*)?(high|fast|racing|rapid))\b/.test(t);
}

function mentionsDeficiency(text) {
  const t = normalizeText(text);
  return /\b(deficien(t|cy)|low\s*(vitamin\s*d|vit\s*d|d3|level|result)|level.{0,15}\b([0-9]|1[0-9]|2[0-9])\b|blood\s*work|my\s*(results?|labs?|levels?))\b/.test(t);
}

function mentionsPregnancyContext(text) {
  const t = normalizeText(text);
  return /\b(pregnan(t|cy)|breastfeed(ing)?|nursing|prenatal|conceiv(e|ing)|ttc|trying to conceive|trying for a baby|first trimester|second trimester|third trimester|expecting|postpartum|lactating|pumping|new mom|just had a baby|due in \w+|\d+\s*weeks?\s*pregnant)\b/.test(t);
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
    /\b(alcohol|drink(s|ing)?\s*(socially|alcohol|beer|wine|heavily|occasionally|daily|weekly|nightly)|beers?|wines?|cocktails?|liquor|bourbon|whiskey|vodka)\b/,
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
  const discontinued = /\b(stopped|quit|came off|went off|discontinu|weaning off|tapered off|ran out|no longer tak|don t want to take|want to stop|want to quit|want to get off|getting off|going off|dropped|done with|finished|i m off|ditched|stopped abruptly)\b/.test(t);
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
  const nsaid = /\b(ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|indomethacin|ketorolac|piroxicam|aspirin|nsaid)\b/.test(t);
  const anticoag = /\b(warfarin|coumadin|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|edoxaban|ticagrelor|prasugrel|heparin|enoxaparin|lovenox|blood thinner|anticoagulant)\b/.test(t);
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

function isMedicalConditionQuery(text) {
  const t = normalizeText(text);
  if (t.length < 15) return false;
  const conditionPattern = /\b(rotator cuff|tendinitis|bursitis|impingement|frozen shoulder|arthritis|fracture|dislocation|tinnitus|ringing in.{0,5}ears?|hearing loss|carpal tunnel|sciatica|plantar fasciitis|tennis elbow|herniated disc|sprain|strain|torn ligament|acl|meniscus|shin splint|back pain|neck pain|knee pain|hip pain|shoulder pain)\b/;
  if (!conditionPattern.test(t)) return false;
  const interactionIntent = /\b(can i take|safe to take|interact|safe with|together with|combine|while on|supplement|vitamin|mineral)\b/;
  if (interactionIntent.test(t)) return false;
  return true;
}

function detectsMedInducedTinnitus(text) {
  const t = normalizeText(text);
  const tinnitusPattern = /\b(tinnitus|ringing.{0,15}ears?|ears?.{0,15}(ring|ringing|buzzing)|buzzing.{0,15}ears?|hearing.{0,10}(ringing|buzzing|whooshing|high pitched))\b/;
  if (!tinnitusPattern.test(t)) return false;
  const ototoxicPattern = /\b(aspirin|high.?dose aspirin|furosemide|lasix|gentamicin|tobramycin|amikacin|aminoglycoside|cisplatin|quinine|loop diuretic|bumetanide)\b/;
  return ototoxicPattern.test(t);
}

function detectsChronicNSAIDUse(text) {
  const t = normalizeText(text);
  const nsaid = /\b(ibuprofen|advil|motrin|naproxen|aleve|diclofenac|celecoxib|celebrex|meloxicam|indomethacin|ketorolac|nsaid)\b/;
  if (!nsaid.test(t)) return false;
  const chronicPattern = /\b(daily|every\s*day|every\s*other\s*day|chronic|long\s*term|long.?term|weeks|months|years|regularly|ongoing|constant|all the time|for a while|nonstop|since\s+\w+|times?\s*a\s*week|a lot)\b/;
  return chronicPattern.test(t);
}

function detectsRenalMagnesium(text) {
  const t = normalizeText(text);
  const renalPattern = /\b(ckd|chronic kidney|kidney disease|kidney failure|kidney problems?|dialysis|renal\s*(failure|insufficiency|impairment)|stage [3-5]|e?gfr.{0,10}(below|under|less|\d{1,2}\b)|one kidney|nephr(otic|itis))\b/;
  if (!renalPattern.test(t)) return false;
  return /\bmagnesium\b/.test(t);
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
  isMedicalConditionQuery,
  detectsMedInducedTinnitus,
  detectsChronicNSAIDUse,
  detectsRenalMagnesium,
  detectRiskFamilies,
  isFlirty,
  isCreatorQuestion,
  isPetQuestion,
  isBusinessInquiry,
};
