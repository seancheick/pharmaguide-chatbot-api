// Curated clinical references for PharmaGuide gate replies and approved claims.
// Each entry covers one or more safety domains. IDs are stable — do not rename.

const REFERENCES = {
  "boyer-shannon-2005": {
    short: "Boyer & Shannon, NEJM 2005",
    title: "The Serotonin Syndrome",
    source: "New England Journal of Medicine, 352(11), 1112-1120",
    year: 2005,
    type: "review",
    domains: ["serotonin"],
  },
  "sumi-1987": {
    short: "Sumi et al., Experientia 1987",
    title: "A novel fibrinolytic enzyme (nattokinase) in the vegetable cheese Natto",
    source: "Experientia, 43(10), 1110-1111",
    year: 1987,
    type: "original_research",
    domains: ["bleeding"],
  },
  "bailey-2013": {
    short: "Bailey et al., CMAJ 2013",
    title: "Grapefruit-medication interactions: Forbidden fruit or avoidable consequences?",
    source: "Canadian Medical Association Journal, 185(4), 309-316",
    year: 2013,
    type: "review",
    domains: ["cyp3a4"],
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
  },
  "palmer-2004": {
    short: "Palmer, NEJM 2004",
    title: "Managing Hyperkalemia Caused by Inhibitors of the Renin-Angiotensin-Aldosterone System",
    source: "New England Journal of Medicine, 351(6), 585-592",
    year: 2004,
    type: "review",
    domains: ["potassium_acei"],
  },
  "lanas-2006": {
    short: "Lanas et al., Am J Gastro 2006",
    title: "Risk of upper gastrointestinal bleeding associated with non-aspirin cardiovascular drugs, analgesics and nonsteroidal anti-inflammatory drugs",
    source: "American Journal of Gastroenterology, 101(8), 1900-1907",
    year: 2006,
    type: "meta-analysis",
    domains: ["nsaid_anticoagulant", "nsaid_chronic"],
  },
  "lapi-2013": {
    short: "Lapi et al., BMJ 2013",
    title: "Concurrent use of diuretics, angiotensin converting enzyme inhibitors, and angiotensin receptor blockers with non-steroidal anti-inflammatory drugs and risk of acute kidney injury",
    source: "BMJ, 346, e8525",
    year: 2013,
    type: "cohort_study",
    domains: ["triple_whammy"],
  },
  "rybak-1995": {
    short: "Rybak, JAMA 1995",
    title: "Ototoxicity of aminoglycoside antibiotics",
    source: "JAMA, 273(12), 970-971",
    year: 1995,
    type: "editorial",
    domains: ["ototoxic"],
  },
  "handler-2006": {
    short: "Handler, Am J Med 2006",
    title: "Lithium and antihypertensive medication: a potentially dangerous interaction",
    source: "American Journal of Medicine, 119(1), e5",
    year: 2006,
    type: "case_series",
    domains: ["lithium_nsaid"],
  },
  "defrances-2008": {
    short: "DeFronzo et al., Metformin Review 2008",
    title: "Metformin-associated lactic acidosis: Current perspectives on causes and risk",
    source: "Metabolism, 52(2), 135-140",
    year: 2008,
    type: "review",
    domains: ["metformin_alcohol"],
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
  },
  "samaras-2020": {
    short: "Samaras et al., Psychopharmacology 2020",
    title: "Effects of psilocybin in combination with SSRIs",
    source: "Psychopharmacology, 237(3), 649-663",
    year: 2020,
    type: "review",
    domains: ["serotonin"],
  },
  "nj-fda-isotretinoin-2010": {
    short: "FDA Isotretinoin Label, 2010",
    title: "Isotretinoin Prescribing Information — Vitamin A Contraindication",
    source: "U.S. Food and Drug Administration, Accutane Label",
    year: 2010,
    type: "regulatory",
    domains: ["isotretinoin_vita"],
  },
  "ods-vitamin-a-2023": {
    short: "NIH ODS Vitamin A Fact Sheet, 2023",
    title: "Vitamin A and Carotenoids — Health Professional Fact Sheet",
    source: "National Institutes of Health, Office of Dietary Supplements",
    year: 2023,
    type: "reference",
    domains: ["pregnancy_teratogen", "stacking"],
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
  },
  "ods-magnesium-2022": {
    short: "NIH ODS Magnesium Fact Sheet, 2022",
    title: "Magnesium — Health Professional Fact Sheet",
    source: "National Institutes of Health, Office of Dietary Supplements",
    year: 2022,
    type: "reference",
    domains: ["renal_clearance"],
  },
  "warner-2011": {
    short: "Warner et al., Drugs & Aging 2011",
    title: "Non-steroidal anti-inflammatory drugs and renal failure",
    source: "Drugs & Aging, 28(9), 749-761",
    year: 2011,
    type: "review",
    domains: ["nsaid_chronic", "triple_whammy"],
  },
  "juurlink-2004": {
    short: "Juurlink et al., Lancet 2004",
    title: "Rates of hyperkalemia after publication of the Randomized Aldactone Evaluation Study",
    source: "Lancet, 363(9416), 1170-1173",
    year: 2004,
    type: "cohort_study",
    domains: ["potassium_acei"],
  },
  "chyka-2005": {
    short: "Chyka et al., Clin Toxicol 2005",
    title: "Position paper: Single-dose activated charcoal",
    source: "Clinical Toxicology, 43(2), 61-87",
    year: 2005,
    type: "position_paper",
    domains: ["absorption"],
  },
  "dunkley-2003": {
    short: "Dunkley et al., QJM 2003",
    title: "The Hunter Serotonin Toxicity Criteria",
    source: "QJM, 96(9), 635-642",
    year: 2003,
    type: "diagnostic_criteria",
    domains: ["serotonin"],
  },
  "panossian-2010": {
    short: "Panossian & Wikman, Phytomedicine 2010",
    title: "Effects of Adaptogens on the Central Nervous System",
    source: "Phytomedicine, 17(7), 481-493",
    year: 2010,
    type: "review",
    domains: ["stimulant"],
  },
  "ssri-discontinuation-warner-2006": {
    short: "Warner et al., Drug Safety 2006",
    title: "Antidepressant discontinuation syndrome",
    source: "Drug Safety, 29(9), 769-774",
    year: 2006,
    type: "review",
    domains: ["ssri_discontinuation"],
  },
  "sarris-2011": {
    short: "Sarris et al., J Clin Psychiatry 2011",
    title: "S-adenosyl methionine (SAMe) versus escitalopram and placebo in major depressive disorder",
    source: "Journal of Clinical Psychiatry, 72(11), 1537-1544",
    year: 2011,
    type: "rct",
    domains: ["serotonin"],
  },
  "teschke-2010": {
    short: "Teschke et al., Digestive and Liver Disease 2010",
    title: "Kava hepatotoxicity: a clinical survey",
    source: "Digestive and Liver Disease, 42(2), 127-132",
    year: 2010,
    type: "systematic_review",
    domains: ["hepatotoxic"],
  },
  "mazzanti-2009": {
    short: "Mazzanti et al., Eur J Clin Pharmacol 2009",
    title: "Hepatotoxicity from green tea: a review of the literature",
    source: "European Journal of Clinical Pharmacology, 65(4), 331-341",
    year: 2009,
    type: "review",
    domains: ["hepatotoxic"],
  },
  "holick-2011": {
    short: "Holick et al., J Clin Endocrinol Metab 2011",
    title: "Evaluation, Treatment, and Prevention of Vitamin D Deficiency: an Endocrine Society Clinical Practice Guideline",
    source: "Journal of Clinical Endocrinology & Metabolism, 96(7), 1911-1930",
    year: 2011,
    type: "clinical_guideline",
    domains: ["stacking"],
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
