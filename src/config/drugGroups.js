/**
 * Drug groups: the one owner of "which names mean an NSAID, an anticoagulant, a statin …" for the
 * deterministic gates.
 *
 * Each gate used to spell its own list, and the lists drifted: the lithium, triple-whammy and chronic-
 * NSAID gates missed piroxicam (and triple whammy indomethacin and ketorolac); the ginkgo gate missed
 * heparin, enoxaparin, edoxaban, ticagrelor and prasugrel; statin myopathy missed fluvastatin and the
 * plural "statins"; benzodiazepine + alcohol missed oxazepam, chlordiazepoxide and midazolam.
 *
 * A gate names the groups it means, so a deliberate difference stays visible in the gate: lithium +
 * NSAID uses NSAIDS without ASPIRIN; grapefruit uses CYP3A4_STATINS, not every statin. Names are
 * regex fragments matched on normalizeText() output, as whole words.
 */

const GROUPS = {
  // Non-aspirin NSAIDs. Aspirin is its own group: some gates mean it, some deliberately do not.
  NSAIDS: ["ibuprofen", "advil", "motrin", "naproxen", "aleve", "diclofenac", "celecoxib", "celebrex", "meloxicam",
    "indomethacin", "ketorolac", "piroxicam", "nsaids?"],
  ASPIRIN: ["aspirin"],
  ANTICOAGULANTS: ["warfarin", "coumadin", "apixaban", "eliquis", "rivaroxaban", "xarelto", "dabigatran", "pradaxa",
    "edoxaban", "savaysa", "heparin", "enoxaparin", "lovenox", "fondaparinux", "blood\\s*thinners?", "anticoagulants?",
    "blood clot meds?"],
  ANTIPLATELETS: ["clopidogrel", "plavix", "ticagrelor", "brilinta", "prasugrel", "effient"],
  ACE_INHIBITORS: ["lisinopril", "enalapril", "ramipril", "benazepril", "ace inhibitors?", "acei"],
  ARBS: ["losartan", "valsartan", "irbesartan", "olmesartan", "telmisartan", "arbs?"],
  POTASSIUM_SPARING: ["spironolactone", "aldactone", "eplerenone"],
  STATINS: ["statins?", "atorvastatin", "lipitor", "rosuvastatin", "crestor", "simvastatin", "zocor", "pravastatin",
    "lovastatin", "fluvastatin", "pitavastatin"],
  // A natural statin (monacolin K): a statin for the niacin gate, a risk factor added to a statin for myopathy.
  RED_YEAST_RICE: ["red yeast rice"],
  // The statins grapefruit raises (CYP3A4 substrates); rosuvastatin and pravastatin are not.
  CYP3A4_STATINS: ["simvastatin", "zocor", "atorvastatin", "lipitor", "lovastatin"],
  BENZODIAZEPINES: ["alprazolam", "xanax", "clonazepam", "klonopin", "lorazepam", "ativan", "diazepam", "valium",
    "temazepam", "restoril", "oxazepam", "chlordiazepoxide", "librium", "midazolam", "benzodiazepines?", "benzos?"],
};

/** A whole-word regex for the union of the named groups: drugsRe("NSAIDS", "ASPIRIN"). */
function drugsRe(...names) {
  const terms = names.flatMap((n) => {
    if (!GROUPS[n]) throw new Error(`unknown drug group ${n}`);
    return GROUPS[n];
  });
  return new RegExp(`\\b(?:${terms.join("|")})\\b`);
}

module.exports = { GROUPS, drugsRe };
