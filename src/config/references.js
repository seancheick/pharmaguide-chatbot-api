// Curated clinical references for PharmaGuide gate replies and approved claims.
// Each entry covers one or more safety domains. IDs are stable — do not rename, except to correct a
// citation (2026-10-06: ids now match the verified year). Every journal article carries its PubMed ID
// and is checked against PubMed by scripts/verify_references.js (title, year, journal, first author,
// topic, retraction); the other entries are regulatory, fact-sheet or textbook sources.

const REFERENCES = {
  "battistella-2005": {
    short: "Battistella et al., Arch Intern Med 2005",
    title: "Risk of upper gastrointestinal hemorrhage in warfarin users treated with nonselective NSAIDs or COX-2 inhibitors",
    source: "Archives of Internal Medicine, 165(2), 189-192",
    year: 2005,
    type: "cohort_study",
    domains: ["bleeding"],
    pmid: "15668365",
  },
  "ding-2016": {
    short: "Ding et al., J Otol 2016",
    title: "Ototoxic effects and mechanisms of loop diuretics",
    source: "Journal of Otology, 11(4), 145-156",
    year: 2016,
    type: "review",
    domains: ["ototoxic"],
    pmid: "29937824",
  },
  "boyer-shannon-2005": {
    short: "Boyer & Shannon, NEJM 2005",
    title: "The Serotonin Syndrome",
    source: "New England Journal of Medicine, 352(11), 1112-1120",
    year: 2005,
    type: "review",
    domains: ["serotonin"],
    pmid: "15784664",
  },
  "sumi-1987": {
    short: "Sumi et al., Experientia 1987",
    title: "A novel fibrinolytic enzyme (nattokinase) in the vegetable cheese Natto; a typical and popular soybean food in the Japanese diet",
    source: "Experientia, 43(10), 1110-1111",
    year: 1987,
    type: "original_research",
    domains: ["bleeding"],
    pmid: "3478223",
  },
  "bailey-2013": {
    short: "Bailey et al., CMAJ 2013",
    title: "Grapefruit-medication interactions: Forbidden fruit or avoidable consequences?",
    source: "Canadian Medical Association Journal, 185(4), 309-316",
    year: 2013,
    type: "review",
    domains: ["cyp3a4"],
    pmid: "23184849",
  },
  "fda-kava-2002": {
    short: "FDA Safety Communication, 2002",
    title: "Consumer Advisory: Kava-Containing Dietary Supplements May Be Associated with Severe Liver Injury",
    source: "U.S. Food and Drug Administration, Center for Food Safety and Applied Nutrition",
    year: 2002,
    type: "regulatory",
    domains: ["hepatotoxic"],
  },
  "rothman-1995": {
    short: "Rothman et al., NEJM 1995",
    title: "Teratogenicity of High Vitamin A Intake",
    source: "New England Journal of Medicine, 333(21), 1369-1373",
    year: 1995,
    type: "cohort_study",
    domains: ["pregnancy_teratogen"],
    pmid: "7477116",
  },
  "palmer-2004": {
    short: "Palmer, NEJM 2004",
    title: "Managing Hyperkalemia Caused by Inhibitors of the Renin-Angiotensin-Aldosterone System",
    source: "New England Journal of Medicine, 351(6), 585-592",
    year: 2004,
    type: "review",
    domains: ["potassium_acei"],
    pmid: "15295051",
  },
  "lanas-2003": {
    short: "Lanas et al., Eur J Gastroenterol Hepatol 2003",
    title: "Risk of upper gastrointestinal bleeding associated with non-aspirin cardiovascular drugs, analgesics and nonsteroidal anti-inflammatory drugs",
    source: "European Journal of Gastroenterology & Hepatology, 15(2), 173-178",
    year: 2003,
    type: "cohort_study",
    domains: ["nsaid_anticoagulant", "nsaid_chronic"],
    pmid: "12560762",
  },
  "lapi-2013": {
    short: "Lapi et al., BMJ 2013",
    title: "Concurrent use of diuretics, angiotensin converting enzyme inhibitors, and angiotensin receptor blockers with non-steroidal anti-inflammatory drugs and risk of acute kidney injury",
    source: "BMJ, 346, e8525",
    year: 2013,
    type: "cohort_study",
    domains: ["triple_whammy"],
    pmid: "23299844",
  },
  "rybak-2007": {
    short: "Rybak & Ramkumar, Kidney Int 2007",
    title: "Ototoxicity",
    source: "Kidney International, 72(8), 931-935",
    year: 2007,
    type: "review",
    domains: ["ototoxic"],
    pmid: "17653135",
  },
  "handler-2009": {
    short: "Handler, J Clin Hypertens 2009",
    title: "Lithium and antihypertensive medication: a potentially dangerous interaction",
    source: "Journal of Clinical Hypertension, 11(12), 738-742",
    year: 2009,
    type: "case_series",
    domains: ["lithium_nsaid"],
    pmid: "20021532",
  },
  "defronzo-2016": {
    short: "DeFronzo et al., Metabolism 2016",
    title: "Metformin-associated lactic acidosis: Current perspectives on causes and risk",
    source: "Metabolism, 65(2), 20-29",
    year: 2016,
    type: "review",
    domains: ["metformin_alcohol"],
    pmid: "26773926",
  },
  "lexi-comp-2023": {
    short: "Lexi-Comp Drug Interactions, 2023",
    title: "Lithium-NSAID Drug Interaction Monograph",
    source: "Lexicomp Online, Wolters Kluwer",
    year: 2023,
    type: "drug_reference",
    domains: ["lithium_nsaid"],
  },
  "juurlink-2003": {
    short: "Juurlink et al., CMAJ 2003",
    title: "Drug-drug interactions among elderly patients hospitalized for drug toxicity",
    source: "JAMA, 289(13), 1652-1658",
    year: 2003,
    type: "cohort_study",
    domains: ["potassium_acei"],
    pmid: "12672733",
  },
  "nj-fda-isotretinoin-2010": {
    short: "FDA Isotretinoin Label, 2010",
    title: "Isotretinoin Prescribing Information — Vitamin A Contraindication",
    source: "U.S. Food and Drug Administration, Accutane Label",
    year: 2010,
    type: "regulatory",
    domains: ["isotretinoin_vita"],
  },
  "ods-vitamin-a-2025": {
    short: "NIH ODS Vitamin A Fact Sheet, 2025",
    title: "Vitamin A and Carotenoids — Health Professional Fact Sheet",
    source: "National Institutes of Health, Office of Dietary Supplements (updated March 10, 2025)",
    year: 2025,
    type: "reference",
    domains: ["pregnancy_teratogen", "stacking"],
  },
  "ajgaonkar-2026": {
    short: "Ajgaonkar et al., Front Glob Womens Health 2026",
    title: "Efficacy and safety of Ashwagandha (Withania somnifera) root extract in pregnant women: a prospective, randomized, comparative, open-label, 12-week study",
    source: "Frontiers in Global Women's Health, 7, 1767865 (doi:10.3389/fgwh.2026.1767865)",
    year: 2026,
    type: "rct",
    domains: ["pregnancy_limited"],
    pmid: "41767760",
  },
  "briggs-2017": {
    short: "Briggs & Freeman, Drugs in Pregnancy 2017",
    title: "Drugs in Pregnancy and Lactation (11th ed.)",
    source: "Wolters Kluwer",
    year: 2017,
    type: "reference",
    domains: ["pregnancy_limited"],
  },
  "ods-iodine-2022": {
    short: "NIH ODS Iodine Fact Sheet, 2022",
    title: "Iodine — Health Professional Fact Sheet",
    source: "National Institutes of Health, Office of Dietary Supplements",
    year: 2022,
    type: "reference",
    domains: ["iodine_thyroid"],
  },
  "aim-him-2011": {
    short: "AIM-HIGH Investigators, NEJM 2011",
    title: "Niacin in Patients with Low HDL Cholesterol Levels Receiving Intensive Statin Therapy",
    source: "New England Journal of Medicine, 365(24), 2255-2267",
    year: 2011,
    type: "rct",
    domains: ["niacin_statin"],
    pmid: "22085343",
  },
  "ods-magnesium-2022": {
    short: "NIH ODS Magnesium Fact Sheet, 2022",
    title: "Magnesium — Health Professional Fact Sheet",
    source: "National Institutes of Health, Office of Dietary Supplements",
    year: 2022,
    type: "reference",
    domains: ["renal_clearance"],
  },
  "whelton-1999": {
    short: "Whelton, Am J Med 1999",
    title: "Nephrotoxicity of nonsteroidal anti-inflammatory drugs: physiologic foundations and clinical implications",
    source: "American Journal of Medicine, 106(5B), 13S-24S",
    year: 1999,
    type: "review",
    domains: ["nsaid_chronic", "triple_whammy"],
    pmid: "10390124",
  },
  "juurlink-2004": {
    short: "Juurlink et al., NEJM 2004",
    title: "Rates of hyperkalemia after publication of the Randomized Aldactone Evaluation Study",
    source: "New England Journal of Medicine, 351(6), 543-551",
    year: 2004,
    type: "cohort_study",
    domains: ["potassium_acei"],
    pmid: "15295047",
  },
  "chyka-2005": {
    short: "Chyka et al., Clin Toxicol 2005",
    title: "Position paper: Single-dose activated charcoal",
    source: "Clinical Toxicology, 43(2), 61-87",
    year: 2005,
    type: "position_paper",
    domains: ["absorption"],
    pmid: "15822758",
  },
  "dunkley-2003": {
    short: "Dunkley et al., QJM 2003",
    title: "The Hunter Serotonin Toxicity Criteria: simple and accurate diagnostic decision rules for serotonin toxicity",
    source: "QJM, 96(9), 635-642",
    year: 2003,
    type: "diagnostic_criteria",
    domains: ["serotonin"],
    pmid: "12925718",
  },
  "panossian-2010": {
    short: "Panossian & Wikman, Pharmaceuticals 2010",
    title: "Effects of Adaptogens on the Central Nervous System and the Molecular Mechanisms Associated with Their Stress-Protective Activity",
    source: "Pharmaceuticals, 3(1), 188-224",
    year: 2010,
    type: "review",
    domains: ["stimulant"],
    pmid: "27713248",
  },
  "ssri-discontinuation-warner-2006": {
    short: "Warner et al., Am Fam Physician 2006",
    title: "Antidepressant discontinuation syndrome",
    source: "American Family Physician, 74(3), 449-456",
    year: 2006,
    type: "review",
    domains: ["ssri_discontinuation"],
    pmid: "16913164",
  },
  "teschke-2010": {
    short: "Teschke et al., Ann Hepatol 2010",
    title: "Kava hepatotoxicity: a clinical review",
    source: "Annals of Hepatology, 9(3), 251-265",
    year: 2010,
    type: "systematic_review",
    domains: ["hepatotoxic"],
    pmid: "20720265",
  },
  "mazzanti-2009": {
    short: "Mazzanti et al., Eur J Clin Pharmacol 2009",
    title: "Hepatotoxicity from green tea: a review of the literature and two unpublished cases",
    source: "European Journal of Clinical Pharmacology, 65(4), 331-341",
    year: 2009,
    type: "review",
    domains: ["hepatotoxic"],
    pmid: "19198822",
  },
  "holick-2011": {
    short: "Holick et al., J Clin Endocrinol Metab 2011",
    title: "Evaluation, Treatment, and Prevention of Vitamin D Deficiency: an Endocrine Society Clinical Practice Guideline",
    source: "Journal of Clinical Endocrinology & Metabolism, 96(7), 1911-1930",
    year: 2011,
    type: "clinical_guideline",
    domains: ["stacking"],
    pmid: "21646368",
  },
};

function getReferenceById(id) {
  return REFERENCES[id] || null;
}

function getReferencesForDomain(domainId) {
  return Object.entries(REFERENCES)
    .filter(([, ref]) => ref.domains.includes(domainId))
    .map(([id, ref]) => ({ id, ...ref }));
}

function validateAllReferences() {
  const issues = [];
  const requiredFields = ["short", "title", "source", "year", "type", "domains"];
  for (const [id, ref] of Object.entries(REFERENCES)) {
    for (const field of requiredFields) {
      if (ref[field] === undefined || ref[field] === null) {
        issues.push(`${id}: missing required field "${field}"`);
      }
    }
    if (ref.domains && !Array.isArray(ref.domains)) {
      issues.push(`${id}: domains must be an array`);
    }
    if (ref.domains && ref.domains.length === 0) {
      issues.push(`${id}: domains must not be empty`);
    }
  }
  return { valid: issues.length === 0, issues };
}

module.exports = { REFERENCES, getReferenceById, getReferencesForDomain, validateAllReferences };
