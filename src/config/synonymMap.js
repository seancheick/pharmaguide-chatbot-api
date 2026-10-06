const SYNONYM_MAP = [
  // ── Serotonergic substances ──
  [/\b5\s*hydroxytryptophan\b/g, "5 htp"],
  [/\bhydroxytryptophan\b/g, "5 htp"],
  [/\bserotonin\s*(supplement|booster|precursor|support)\b/g, "5 htp"],
  [/\bmood\s*precursor\b/g, "5 htp"],
  [/\bst\s*johns?\b/g, "st johns wort"],
  [/\bsaint\s*john\s*s?\s*wort\b/g, "st johns wort"],
  [/\bmicro\s*dos(e|ing)?\s*mushrooms?\b/g, "psilocybin"],
  [/\bmagic\s*mushrooms?\b/g, "psilocybin"],
  [/\bshrooms?\b/g, "psilocybin"],

  // ── Medication class synonyms ──
  [/\bcholesterol\s*(medication|drug|pill|medicine)\b/g, "cholesterol meds"],
  [/\bblood\s*pressure\s*(medication|drug|pill|medicine)\b/g, "blood pressure meds"],
  [/\bblood\s*thin(ner|ning)\s+(medication|drug|pill|medicine|thingy|thing)\b/g, "blood thinner"],
  [/\banxiety\s*(medication|drug|pill|medicine)\b/g, "anxiety meds"],
  [/\bdepression\s*(medication|drug|pill|medicine)\b/g, "depression meds"],
  [/\bsleep\s*(medication|drug|pill|medicine)\b/g, "sleep meds"],
  [/\bthyroid\s*(medication|drug|pill|medicine)\b/g, "thyroid meds"],
  [/\bheart\s*(medication|drug|pill|medicine)\b/g, "heart meds"],

  // ── Charcoal variants ──
  [/\bcharcoal\s*(detox|cleanse|flush|powder)\b/g, "activated charcoal detox"],

  // ── Supplement name variants ──
  [/\bgreen\s*tea\s*(fat\s*burner|diet|weight\s*loss|pills?|caps?|capsules?)\b/g, "green tea extract"],
  [/\begcg\s+(supplement|pills?|caps?|capsules?)\b/g, "green tea extract"],
  [/\begcg\b/g, "green tea extract"],
  [/\bomega\s*3\s+(supplement|pills?|caps?|capsules?|fatty\s*acids?)\b/g, "fish oil"],
  [/\bomega\s*3\b/g, "fish oil"],
  [/\bcurcumin\b/g, "turmeric"],
  [/\bcoenzyme\s*q\s*10\b/g, "coq10"],
  [/\bubiquinol\b/g, "coq10"],

  // ── Nootropic / energy synonyms (for clarifier) ──
  [/\bbrain\s*(booster|enhancer|supplement|pill|vitamin)\b/g, "nootropic supplement"],
  [/\bfocus\s*(supplement|pill|booster|enhancer)\b/g, "nootropic supplement"],
  [/\bcognitive\s*(enhancer|supplement|booster)\b/g, "nootropic supplement"],
  [/\bmemory\s*(supplement|pill|booster|enhancer)\b/g, "nootropic supplement"],

  // ── Brand name → generic ──
  // Antidepressants
  [/\bluvox\b/g, "fluvoxamine"],
  [/\btrintellix\b/g, "vortioxetine"],
  [/\bviibryd\b/g, "vilazodone"],
  [/\bsarafem\b/g, "fluoxetine"],
  // Stimulants
  [/\bprovigil\b/g, "modafinil"],
  [/\bnuvigil\b/g, "armodafinil"],
  [/\bfocalin\b/g, "methylphenidate"],
  [/\bmydayis\b/g, "amphetamine"],
  // Benzodiazepines
  [/\bserax\b/g, "oxazepam"],
  [/\btranxene\b/g, "clorazepate"],
  // Beta-blockers
  [/\blopressor\b/g, "metoprolol"],
  [/\btoprol\b/g, "metoprolol"],
  [/\btenormin\b/g, "atenolol"],
  [/\binderal\b/g, "propranolol"],
  [/\bcoreg\b/g, "carvedilol"],
  [/\bbystolic\b/g, "nebivolol"],
  // ACE inhibitors / ARBs
  [/\bprinivil\b/g, "lisinopril"],
  [/\bzestril\b/g, "lisinopril"],
  [/\bvasotec\b/g, "enalapril"],
  [/\baltace\b/g, "ramipril"],
  [/\baccupril\b/g, "quinapril"],
  [/\bcozaar\b/g, "losartan"],
  [/\bdiovan\b/g, "valsartan"],
  [/\bavapro\b/g, "irbesartan"],
  [/\bbenicar\b/g, "olmesartan"],
  // Statins
  [/\bcrestor\b/g, "rosuvastatin"],
  [/\bpravachol\b/g, "pravastatin"],
  [/\bmevacor\b/g, "lovastatin"],
  [/\blivalo\b/g, "pitavastatin"],
  // Antihistamines
  [/\bzyrtec\b/g, "cetirizine"],
  [/\bclaritin\b/g, "loratadine"],
  [/\ballegra\b/g, "fexofenadine"],
  [/\bbenadryl\b/g, "diphenhydramine"],
  [/\bxyzal\b/g, "levocetirizine"],
  [/\bclarinex\b/g, "desloratadine"],
  [/\ballergy\s*(med(s|ication)?|pill|tablet)\b/g, "antihistamine"],
  // Anticoagulants / antiplatelets
  [/\bjantoven\b/g, "warfarin"],
  [/\bcoumadin\b/g, "warfarin"],
  [/\bpradaxa\b/g, "dabigatran"],
  [/\bsavaysa\b/g, "edoxaban"],
  [/\bbrilinta\b/g, "ticagrelor"],
  [/\beffient\b/g, "prasugrel"],
  // PPIs / GI meds
  [/\bprilosec\b/g, "omeprazole"],
  [/\bprotonix\b/g, "pantoprazole"],
  [/\bnexium\b/g, "esomeprazole"],
  [/\bprevacid\b/g, "lansoprazole"],
  [/\bpepcid\b/g, "famotidine"],
  [/\bzantac\b/g, "famotidine"],
  // Diuretics
  [/\bhctz\b/g, "hydrochlorothiazide"],
  [/\blasix\b/g, "furosemide"],
  [/\baldactone\b/g, "spironolactone"],
  // Other common meds
  [/\bvoltaren\b/g, "diclofenac"],
  [/\bneurontin\b/g, "gabapentin"],
  [/\blyrica\b/g, "pregabalin"],
  [/\bnorvasc\b/g, "amlodipine"],
  [/\bsynthroid\b/g, "levothyroxine"],
  [/\blevoxyl\b/g, "levothyroxine"],
  [/\briomet\b/g, "metformin"],
  [/\bfortamet\b/g, "metformin"],
  [/\bglumetza\b/g, "metformin"],
  [/\bglucophage\b/g, "metformin"],
  [/\broaccutane\b/g, "accutane"],
  [/\bepuris\b/g, "isotretinoin"],
  [/\bultram\b/g, "tramadol"],
  [/\bflexeril\b/g, "cyclobenzaprine"],
  [/\bcardizem\b/g, "diltiazem"],
  [/\bcalan\b/g, "verapamil"],

  // ── Common supplement name variants ──
  [/\blion.?s?\s*mane(\s+(mushroom|extract|supplement))?\b/g, "lions mane"],
  [/\bhericium\s*erinaceus\b/g, "lions mane"],
  [/\bapple\s*cider\s*vinegar\b/g, "apple cider vinegar"],
  [/\bacv(\s+(supplement|gummies?|pills?|capsules?))?\b/g, "apple cider vinegar"],
  [/\bsleep\s+(aid|supplement|support)\b/g, "sleep supplement"],
  [/\bnootropic(\s+(supplement|stack))?\b/g, "nootropic supplement"],

  // ── GLP-1 / Weight loss drugs ──
  [/\bozempic\b/g, "semaglutide"],
  [/\bwegovy\b/g, "semaglutide"],
  [/\brybelsus\b/g, "semaglutide"],
  [/\bmounjaro\b/g, "tirzepatide"],
  [/\bzepbound\b/g, "tirzepatide"],
  [/\bsaxenda\b/g, "liraglutide"],
  [/\bvictoza\b/g, "liraglutide"],
  [/\bglp[\s-]?1(\s+(med(s|ication)?|drug|injection|shot|agonist))?\b/g, "glp-1 agonist"],

  // ── Trending supplements ──
  [/\bsea\s*moss(\s+(gel|capsules?|supplement))?\b/g, "sea moss"],
  [/\birish\s*moss\b/g, "sea moss"],
  [/\bshilajit(\s+(resin|supplement|capsules?))?\b/g, "shilajit"],
  [/\bmumijo\b/g, "shilajit"],
  [/\btart\s*cherry(\s+(juice|extract|supplement))?\b/g, "tart cherry"],
  [/\bapigenin(\s+supplement)?\b/g, "apigenin"],

  // ── Quercetin misspellings ──
  [/\bquertincin\b/g, "quercetin"],
  [/\bquercitin\b/g, "quercetin"],
  [/\bquercentin\b/g, "quercetin"],
  [/\bquarcetin\b/g, "quercetin"],

  // ── Peptide / Longevity ──
  [/\bblueprint\s*(protocol|stack|supplements?)?\b/g, "longevity protocol"],
  [/\bbryan\s*johnson\s*(stack|protocol|supplements?)?\b/g, "longevity protocol"],

  // ── Weight loss / trending product synonyms ──
  [/\bag1\b/g, "greens powder"],
  [/\bathletic\s*greens\b/g, "greens powder"],
  [/\bbeef\s*liver\s*(capsules?|pills?|supplement)?\b/g, "beef liver"],
  [/\borgan\s*meat\s*(capsules?|pills?|supplement)?\b/g, "organ meat supplement"],
  [/\bmushroom\s*coffee\b/g, "mushroom coffee"],
  [/\bliquid\s*iv\b/g, "electrolytes"],
  [/\bpedialyte\b/g, "electrolytes"],
  [/\btums\b/g, "calcium carbonate antacid"],
  [/\bpepto\s*(bismol)?\b/g, "bismuth subsalicylate"],
  [/\bambien\b/g, "zolpidem"],
  // SAM-e. Only spellings that cannot be the ordinary word "same": "SAM-e" and "sam e" (punctuation is
  // already a space here), the capitalised "SAMe" (marked in normalizeText), the full name, and
  // lowercase "same" only next to a dose (and not after "the/my/that ...", nor before "as/every/dose ...") or as the object of "take/add/start ... same with/and".
  [/\bsam\s+e\b/g, "sam-e"],
  [/\bs\s?adenosyl\s?(?:l\s?)?methionine\b/g, "sam-e"],
  [/(?<!\b(?:the|a|an|my|your|his|her|their|our|that|this|these|those)\s)\bsame(\s+\d{2,4}\s?(?:mg|mcg)\b)/g, "sam-e$1"],
  [/\b(\d{2,4}\s?(?:mg|mcg)\s+(?:of\s+)?)same\b(?!\s+(?:as|every|each|time|day|dose|way|thing|again))/g, "$1sam-e"],
  [/\b((?:take|taking|took|add|adding|start|starting|started|try|trying|use|using|mix|mixing)\s+)same(?=\s+(?:with|and|plus|or|together)\b|$)/g, "$1sam-e"],
  [/\bgas[\s-]?x\b/g, "simethicone"],
  [/\bmylicon\b/g, "simethicone"],
  [/\bdiflucan\b/g, "fluconazole"],
  [/\bflagyl\b/g, "metronidazole"],

  // ── Alcohol normalization ──
  [/\btequila\b/g, "alcohol"],
  [/\brum\b/g, "alcohol"],
  [/\bgin\b/g, "alcohol"],
  [/\bbrandy\b/g, "alcohol"],
  [/\bchampagne\b/g, "alcohol"],
  [/\bsake\b/g, "alcohol"],
  [/\bhard\s*seltzer\b/g, "alcohol"],
  [/\bwhite\s*claw\b/g, "alcohol"],
  [/\bshots?\b/g, "alcohol"],

  // ── Supplement form variants ──
  [/\bkelp\s*(tablets?|pills?|caps?|capsules?)\b/g, "kelp supplement"],
  [/\bcharcoal\s*(tablets?|gummies?)\b/g, "activated charcoal detox"],
  [/\blugol\s*s?\s*(solution|iodine)?\b/g, "iodine"],

  // ── Colloquial medication references ──
  [/\bmy\s*(happy|psych|psychiatric)\s*(pills?|meds?|medication)\b/g, "antidepressant"],
  [/\bmy\s*sugar\s*(pills?|meds?|medication)\b/g, "metformin"],
  [/\bmy\s*adhd\s*(pills?|meds?|medication)\b/g, "adderall"],
  [/\bwater\s*pills?\b/g, "diuretic"],
  [/\bmy\s*mood\s*stabilizer\b/g, "lithium"],
  [/\bpain\s*killers?\b/g, "nsaid"],
  [/\banti\s*inflammator(y|ies)\b/g, "nsaid"],

  // ── Emergency-relevant normalization ──
  [/\bi\s*m\s*od\s*ing\b/g, "overdose"],
  [/\bcold\s*turkey\b/g, "stopped abruptly"],

  // ── Supplement synonyms ──
  [/\bginko\b/g, "ginkgo"],
  [/\bginkgo\s*biloba\b/g, "ginkgo"],
  [/\bd[\s-]?mannose\b/g, "d-mannose"],
  [/\bcranberry\s*(pills?|caps?|capsules?|extract|supplement)\b/g, "cranberry extract"],
  [/\bmilk\s*thistle\s*(extract|supplement)?\b/g, "milk thistle"],
  [/\bsilymarin\b/g, "milk thistle"],
  [/\bsaw\s*palmetto\s*(extract|supplement)?\b/g, "saw palmetto"],
  [/\bcbd\s*(oil|gummies?|capsules?|tincture)\b/g, "cbd"],
  [/\bcannabidiol\b/g, "cbd"],

  // ── Common misspellings ──
  [/\bsertaline\b/g, "sertraline"],
  [/\bsertralina\b/g, "sertraline"],
  [/\bxanex\b/g, "xanax"],
  [/\bklonipin\b/g, "clonazepam"],
  [/\bklonapin\b/g, "clonazepam"],
  [/\bwelbutrin\b/g, "wellbutrin"],
  [/\badderal\b/g, "adderall"],
  [/\baderall\b/g, "adderall"],
  [/\bvyvance\b/g, "vyvanse"],
  [/\blevothyroxin\b/g, "levothyroxine"],
  [/\batorvastain\b/g, "atorvastatin"],
  [/\batorvastain\b/g, "atorvastatin"],
  [/\brosuvastain\b/g, "rosuvastatin"],
  [/\bmetforman\b/g, "metformin"],
  [/\bmetformine\b/g, "metformin"],
  [/\blisinipril\b/g, "lisinopril"],
  [/\blisiniprol\b/g, "lisinopril"],
  [/\bacutane\b/g, "accutane"],
  [/\btendonitis\b/g, "tendinitis"],
  [/\bashwaganda\b/g, "ashwagandha"],
  [/\btumeric\b/g, "turmeric"],
  [/\bglucosamine\b/g, "glucosamine"],
  [/\bgabapenten\b/g, "gabapentin"],
  [/\bpregabalyn\b/g, "pregabalin"],
  [/\bomeprazol\b/g, "omeprazole"],
  [/\bhydrochlorothiazid\b/g, "hydrochlorothiazide"],
  [/\bamlodapine\b/g, "amlodipine"],
];

function applySynonyms(text) {
  let t = text;
  for (const [pattern, replacement] of SYNONYM_MAP) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(/\s+/g, " ").trim();
}

module.exports = { SYNONYM_MAP, applySynonyms };
