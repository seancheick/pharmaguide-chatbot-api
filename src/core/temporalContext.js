/**
 * Temporal context engine — structured washout, onset, and half-life data.
 * Enables specific guidance like "Fluoxetine has a 5-week washout — longer
 * than most SSRIs" instead of generic "1–5+ weeks depending on the drug."
 *
 * All durations in hours unless noted. Washout = ~5 half-lives.
 */

const TEMPORAL_DATA = {
  // ── SSRIs ──
  sertraline: {
    canonical: "sertraline",
    half_life_hours: 26,
    washout_days: 7,
    onset_days: { min: 14, max: 42 },
    notes: "Moderate washout. One of the shorter SSRI half-lives.",
    category: "ssri",
  },
  fluoxetine: {
    canonical: "fluoxetine",
    half_life_hours: 72, // parent; norfluoxetine: 4-16 days
    washout_days: 35,
    onset_days: { min: 14, max: 42 },
    notes: "Very long washout due to active metabolite norfluoxetine (half-life 4-16 days). Must account for this when switching.",
    category: "ssri",
  },
  escitalopram: {
    canonical: "escitalopram",
    half_life_hours: 30,
    washout_days: 7,
    onset_days: { min: 14, max: 28 },
    notes: "Moderate washout. Similar to sertraline.",
    category: "ssri",
  },
  citalopram: {
    canonical: "citalopram",
    half_life_hours: 35,
    washout_days: 8,
    onset_days: { min: 14, max: 28 },
    notes: "Moderate washout.",
    category: "ssri",
  },
  paroxetine: {
    canonical: "paroxetine",
    half_life_hours: 21,
    washout_days: 5,
    onset_days: { min: 14, max: 42 },
    notes: "Shortest SSRI half-life. Higher discontinuation syndrome risk — needs careful tapering.",
    category: "ssri",
  },
  fluvoxamine: {
    canonical: "fluvoxamine",
    half_life_hours: 16,
    washout_days: 4,
    onset_days: { min: 14, max: 42 },
    notes: "Short half-life. Potent CYP1A2 inhibitor.",
    category: "ssri",
  },

  // ── SNRIs ──
  venlafaxine: {
    canonical: "venlafaxine",
    half_life_hours: 5, // parent; desvenlafaxine: 11h
    washout_days: 3,
    onset_days: { min: 14, max: 42 },
    notes: "Very short half-life. High discontinuation syndrome risk. Must taper slowly.",
    category: "snri",
  },
  duloxetine: {
    canonical: "duloxetine",
    half_life_hours: 12,
    washout_days: 3,
    onset_days: { min: 14, max: 42 },
    notes: "Short half-life. Discontinuation syndrome common without taper.",
    category: "snri",
  },
  desvenlafaxine: {
    canonical: "desvenlafaxine",
    half_life_hours: 11,
    washout_days: 3,
    onset_days: { min: 14, max: 42 },
    notes: "Active metabolite of venlafaxine. Slightly longer half-life than parent.",
    category: "snri",
  },

  // ── Other antidepressants ──
  bupropion: {
    canonical: "bupropion",
    half_life_hours: 21,
    washout_days: 5,
    onset_days: { min: 14, max: 42 },
    notes: "NDRI, not serotonergic. Lowers seizure threshold.",
    category: "ndri",
  },
  trazodone: {
    canonical: "trazodone",
    half_life_hours: 7,
    washout_days: 2,
    onset_days: { min: 7, max: 28 },
    notes: "Short half-life. Often used at low doses for sleep rather than depression.",
    category: "sari",
  },
  mirtazapine: {
    canonical: "mirtazapine",
    half_life_hours: 30,
    washout_days: 7,
    onset_days: { min: 14, max: 28 },
    notes: "Sedating. Weight gain common. Lower discontinuation risk than SSRIs.",
    category: "tetracyclic",
  },

  // ── MAOIs ──
  phenelzine: {
    canonical: "phenelzine",
    half_life_hours: 12,
    washout_days: 14, // MAOIs need 14-day washout regardless of half-life
    onset_days: { min: 14, max: 42 },
    notes: "Irreversible MAOI. 14-day washout required before starting serotonergic agents. Tyramine dietary restriction required.",
    category: "maoi",
  },
  tranylcypromine: {
    canonical: "tranylcypromine",
    half_life_hours: 2.5,
    washout_days: 14,
    onset_days: { min: 14, max: 42 },
    notes: "Irreversible MAOI. 14-day washout required. Tyramine restriction.",
    category: "maoi",
  },
  selegiline: {
    canonical: "selegiline",
    half_life_hours: 10,
    washout_days: 14,
    onset_days: { min: 14, max: 42 },
    notes: "MAO-B selective at low doses, non-selective at higher doses. Patch form has fewer dietary restrictions.",
    category: "maoi",
  },

  // ── Mood stabilizers ──
  lithium: {
    canonical: "lithium",
    half_life_hours: 24,
    washout_days: 5,
    onset_days: { min: 7, max: 14 },
    notes: "Narrow therapeutic window. Serum levels needed. NSAIDs reduce clearance significantly.",
    category: "mood_stabilizer",
  },

  // ── Stimulants ──
  methylphenidate: {
    canonical: "methylphenidate",
    half_life_hours: 3.5,
    washout_days: 1,
    onset_days: { min: 0, max: 1 },
    notes: "Rapid onset and offset. Extended-release forms last 8-12 hours.",
    category: "stimulant",
  },
  amphetamine: {
    canonical: "amphetamine",
    half_life_hours: 10,
    washout_days: 2,
    onset_days: { min: 0, max: 1 },
    notes: "Includes Adderall (mixed amphetamine salts). pH-dependent elimination.",
    category: "stimulant",
  },

  // ── Benzodiazepines ──
  alprazolam: {
    canonical: "alprazolam",
    half_life_hours: 11,
    washout_days: 3,
    onset_days: { min: 0, max: 1 },
    notes: "Short-acting. High dependence risk. Taper required.",
    category: "benzodiazepine",
  },
  clonazepam: {
    canonical: "clonazepam",
    half_life_hours: 35,
    washout_days: 8,
    onset_days: { min: 0, max: 1 },
    notes: "Long-acting. Lower interdose withdrawal than alprazolam.",
    category: "benzodiazepine",
  },
  lorazepam: {
    canonical: "lorazepam",
    half_life_hours: 12,
    washout_days: 3,
    onset_days: { min: 0, max: 1 },
    notes: "Intermediate-acting. No active metabolites.",
    category: "benzodiazepine",
  },
  diazepam: {
    canonical: "diazepam",
    half_life_hours: 48, // parent; active metabolites much longer
    washout_days: 14,
    onset_days: { min: 0, max: 1 },
    notes: "Very long-acting including active metabolites (nordiazepam: 100h). Useful for taper protocols.",
    category: "benzodiazepine",
  },

  // ── Anticoagulants ──
  warfarin: {
    canonical: "warfarin",
    half_life_hours: 40,
    washout_days: 5,
    onset_days: { min: 2, max: 5 },
    notes: "Full anticoagulant effect takes 2-5 days. INR monitoring required. Vitamin K can reverse.",
    category: "anticoagulant",
  },

  // ── NSAIDs ──
  ibuprofen: {
    canonical: "ibuprofen",
    half_life_hours: 2,
    washout_days: 1,
    onset_days: { min: 0, max: 0 },
    notes: "Short half-life but antiplatelet effect lasts ~24h. GI and renal effects are dose/duration dependent.",
    category: "nsaid",
  },
  naproxen: {
    canonical: "naproxen",
    half_life_hours: 14,
    washout_days: 3,
    onset_days: { min: 0, max: 0 },
    notes: "Longer-acting NSAID. Better cardiovascular safety profile than diclofenac.",
    category: "nsaid",
  },

  // ── Thyroid ──
  levothyroxine: {
    canonical: "levothyroxine",
    half_life_hours: 168, // ~7 days
    washout_days: 35,
    onset_days: { min: 14, max: 42 },
    notes: "Very long half-life (~7 days). TSH changes take 6-8 weeks to stabilize after dose adjustment.",
    category: "thyroid",
  },

  // ── Supplements with temporal relevance ──
  "5-htp": {
    canonical: "5-htp",
    half_life_hours: 2,
    washout_days: 1,
    onset_days: { min: 0, max: 7 },
    notes: "Short half-life. Serotonin risk depends more on the co-administered drug's washout than 5-HTP's.",
    category: "supplement",
  },
  melatonin: {
    canonical: "melatonin",
    half_life_hours: 0.75, // 40-50 min
    washout_days: 1,
    onset_days: { min: 0, max: 0 },
    notes: "Very short half-life. Take 30-60 min before bed. No accumulation.",
    category: "supplement",
  },
};

// ── Alias map (built at load time) ──
const ALIAS_MAP = {
  zoloft: "sertraline",
  prozac: "fluoxetine",
  lexapro: "escitalopram",
  celexa: "citalopram",
  paxil: "paroxetine",
  effexor: "venlafaxine",
  cymbalta: "duloxetine",
  pristiq: "desvenlafaxine",
  wellbutrin: "bupropion",
  ritalin: "methylphenidate",
  concerta: "methylphenidate",
  adderall: "amphetamine",
  vyvanse: "amphetamine",
  xanax: "alprazolam",
  klonopin: "clonazepam",
  ativan: "lorazepam",
  valium: "diazepam",
  coumadin: "warfarin",
  advil: "ibuprofen",
  motrin: "ibuprofen",
  aleve: "naproxen",
  synthroid: "levothyroxine",
  lithobid: "lithium",
};

/**
 * Look up temporal data for a medication/supplement.
 * Accepts canonical names and common brand aliases.
 */
function getTemporalData(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Direct match
  if (TEMPORAL_DATA[lower]) return { id: lower, ...TEMPORAL_DATA[lower] };

  // Alias match
  const canonical = ALIAS_MAP[lower];
  if (canonical && TEMPORAL_DATA[canonical]) return { id: canonical, ...TEMPORAL_DATA[canonical] };

  return null;
}

/**
 * Get washout guidance for switching from one serotonergic to another.
 * Returns a human-readable string or null if no temporal data.
 */
function getWashoutGuidance(fromMed) {
  const data = getTemporalData(fromMed);
  if (!data) return null;

  const days = data.washout_days;
  const weeks = Math.round(days / 7 * 10) / 10;

  let timeStr;
  if (days <= 3) timeStr = `${days} days`;
  else if (days <= 14) timeStr = `about ${weeks} week${weeks === 1 ? "" : "s"}`;
  else timeStr = `about ${weeks} weeks`;

  let guidance = `${data.canonical} has a washout period of ${timeStr}`;

  // Add comparative context
  if (data.category === "ssri") {
    if (data.washout_days >= 21) {
      guidance += " — significantly longer than most SSRIs";
    } else if (data.washout_days <= 5) {
      guidance += " — shorter than most SSRIs, but higher discontinuation risk";
    }
  }

  if (data.category === "maoi") {
    guidance += ". MAOIs require a strict 14-day minimum washout before starting any serotonergic agent";
  }

  guidance += ".";

  if (data.notes) {
    guidance += ` ${data.notes}`;
  }

  return guidance;
}

/**
 * Get onset guidance for a medication.
 */
function getOnsetGuidance(medName) {
  const data = getTemporalData(medName);
  if (!data) return null;

  const { min, max } = data.onset_days;
  if (min === 0 && max <= 1) return `${data.canonical} typically works within hours.`;
  if (min === max) return `${data.canonical} typically takes about ${min} days to take effect.`;

  const minWeeks = Math.round(min / 7);
  const maxWeeks = Math.round(max / 7);
  if (minWeeks >= 1) {
    return `${data.canonical} typically takes ${minWeeks}–${maxWeeks} weeks to reach full effect.`;
  }
  return `${data.canonical} typically takes ${min}–${max} days to take effect.`;
}

/**
 * Build temporal context for LLM injection.
 * Only includes data for entities that have temporal relevance.
 */
function buildTemporalContext(entityNames) {
  if (!entityNames || entityNames.length === 0) return "";

  const lines = [];
  for (const name of entityNames) {
    const data = getTemporalData(name);
    if (!data) continue;

    const parts = [];
    parts.push(`${data.canonical}: half-life ${formatDuration(data.half_life_hours)}`);
    parts.push(`washout ~${data.washout_days}d`);
    if (data.onset_days.min > 0) {
      parts.push(`onset ${data.onset_days.min}-${data.onset_days.max}d`);
    }
    lines.push(parts.join(", "));
  }

  if (lines.length === 0) return "";
  return "TEMPORAL DATA: " + lines.join("; ") + ".";
}

function formatDuration(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24 * 10) / 10;
  return `${days}d`;
}

module.exports = {
  TEMPORAL_DATA,
  getTemporalData,
  getWashoutGuidance,
  getOnsetGuidance,
  buildTemporalContext,
};
