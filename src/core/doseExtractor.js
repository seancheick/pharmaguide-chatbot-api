/**
 * Dose extraction pipeline.
 * Parses dose mentions from user messages (e.g., "10,000 IU vitamin D")
 * and compares against KB upper limits for risk scoring.
 */

const { getKBEntry } = require("../config/knowledgeBase");

// Dose patterns: number + optional comma/period + unit
// Captures: amount, unit, and nearby substance name
// Substance name capture: letters, digits, hyphens, dots, spaces — but stops at
// conjunctions (and, or, with, plus), commas, and sentence boundaries.
const SUBSTANCE_RE = "([a-z][a-z0-9.'-]*(?:\\s+[a-z][a-z0-9.'-]*){0,3})";

const DOSE_PATTERNS = [
  // "500 mg magnesium", "10,000 IU vitamin D", "2000 mcg B12"
  new RegExp("(\\d[\\d,]*\\.?\\d*)\\s*(mg|mcg|iu|g|ml)\\s+(?:of\\s+)?" + SUBSTANCE_RE, "gi"),
  // "magnesium 500mg", "vitamin D 5000IU", "iron 65 mg"
  new RegExp(SUBSTANCE_RE + "\\s+(\\d[\\d,]*\\.?\\d*)\\s*(mg|mcg|iu|g|ml)", "gi"),
  // "50,000 IU/week of vitamin D" or "50,000 IU per week of vitamin D"
  new RegExp("(\\d[\\d,]*\\.?\\d*)\\s*(mg|mcg|iu|g)\\s*(?:/|\\s+per\\s+)(day|week|month)\\s+(?:of\\s+)?" + SUBSTANCE_RE, "gi"),
];

// ── Frequency parsing ──
// Matches "twice daily", "3 times a day", "3x/day", "every other day", "2x weekly", etc.
const FREQUENCY_PATTERNS = [
  { pattern: /\b(twice|2x|2\s*times)\s*(a\s*)?(day|daily)\b/i, multiplier: 2 },
  { pattern: /\b(three\s*times|3x|3\s*times)\s*(a\s*)?(day|daily)\b/i, multiplier: 3 },
  { pattern: /\b(four\s*times|4x|4\s*times)\s*(a\s*)?(day|daily)\b/i, multiplier: 4 },
  { pattern: /\b(once|1x|1\s*time)\s*(a\s*)?(day|daily)\b/i, multiplier: 1 },
  { pattern: /\bevery\s*(other|2nd)\s*day\b/i, multiplier: 0.5 },
  { pattern: /\b(twice|2x|2\s*times)\s*(a\s*)?(week|weekly)\b/i, multiplier: 2 / 7 },
  { pattern: /\b(three\s*times|3x|3\s*times)\s*(a\s*)?(week|weekly)\b/i, multiplier: 3 / 7 },
  { pattern: /\b(once|1x|1\s*time)\s*(a\s*)?(week|weekly)\b/i, multiplier: 1 / 7 },
  { pattern: /\bonce\s*daily\b/i, multiplier: 1 },
  { pattern: /\bdaily\b/i, multiplier: 1 },
  { pattern: /\bevery\s*morning\b/i, multiplier: 1 },
  { pattern: /\bevery\s*night\b/i, multiplier: 1 },
  { pattern: /\b(morning and (night|evening)|am and pm|twice)\b/i, multiplier: 2 },
];

/**
 * Extract frequency multiplier from text surrounding a dose mention.
 * Returns the daily multiplier (e.g., "twice daily" → 2).
 */
function extractFrequency(text) {
  for (const { pattern, multiplier } of FREQUENCY_PATTERNS) {
    if (pattern.test(text)) return multiplier;
  }
  return 1; // default: assume once daily
}

/**
 * Parse a numeric string that may contain commas.
 */
function parseNumber(str) {
  return parseFloat(str.replace(/,/g, ""));
}

/**
 * Normalize unit to lowercase standard form.
 */
function normalizeUnit(unit) {
  const u = unit.toLowerCase().replace(/\s/g, "");
  if (u === "iu") return "IU";
  if (u === "mcg" || u === "mcg/day") return "mcg";
  if (u === "mg" || u === "mg/day") return "mg";
  if (u === "g") return "g";
  return u;
}

/**
 * Extract dose mentions from text.
 * Returns an array of { amount, unit, substance, daily_amount, period, kb_entry, exceeds_upper_limit }
 */
function extractDoses(text) {
  if (!text || typeof text !== "string") return [];

  const results = [];
  const seen = new Set();
  const freqMultiplier = extractFrequency(text);

  // Pattern 1: "500 mg magnesium"
  const p1 = new RegExp(DOSE_PATTERNS[0].source, "gi");
  let m;
  while ((m = p1.exec(text)) !== null) {
    const key = `${m[1]}-${m[2]}-${m[3]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = buildDoseResult(m[1], m[2], m[3].trim(), "day", freqMultiplier);
    if (r) results.push(r);
  }

  // Pattern 2: "magnesium 500mg"
  const p2 = new RegExp(DOSE_PATTERNS[1].source, "gi");
  while ((m = p2.exec(text)) !== null) {
    const key = `${m[2]}-${m[3]}-${m[1]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = buildDoseResult(m[2], m[3], m[1].trim(), "day", freqMultiplier);
    if (r) results.push(r);
  }

  // Pattern 3: "50,000 IU/week vitamin D"
  const p3 = new RegExp(DOSE_PATTERNS[2].source, "gi");
  while ((m = p3.exec(text)) !== null) {
    const key = `${m[1]}-${m[2]}-${m[4]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Period is explicit (week/month), frequency multiplier doesn't apply
    const r = buildDoseResult(m[1], m[2], m[4].trim(), m[3].toLowerCase(), 1);
    if (r) results.push(r);
  }

  // Deduplicate by substance (keep first match)
  const deduped = [];
  const seenSubstances = new Set();
  for (const r of results) {
    const key = (r.kb_entry || r.substance).toLowerCase();
    if (!seenSubstances.has(key)) {
      seenSubstances.add(key);
      deduped.push(r);
    }
  }

  return deduped;
}

// Words to strip from captured substance names
const NOISE_WORDS = /\b(and|or|with|plus|daily|twice|once|every|per|the|a|an|of|i|my|am|is|take|taking|took|started|been|other|day|night|morning|evening|times?|three|four|at)\b/gi;

function cleanSubstance(raw) {
  return raw
    .replace(NOISE_WORDS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDoseResult(amountStr, unitStr, substance, period, freqMultiplier = 1) {
  const amount = parseNumber(amountStr);
  const unit = normalizeUnit(unitStr);
  substance = cleanSubstance(substance);
  if (!substance || substance.length < 2) return null;

  // Convert to daily amount: apply period conversion then frequency
  let dailyAmount = amount;
  if (period === "week") dailyAmount = amount / 7;
  else if (period === "month") dailyAmount = amount / 30;

  // Apply frequency multiplier (e.g., "400mg 3x daily" → 1200mg/day)
  dailyAmount = dailyAmount * freqMultiplier;

  // Look up in KB
  const kbEntry = getKBEntry(substance);
  let exceedsUpperLimit = null;

  if (kbEntry && kbEntry.upper_limit && kbEntry.upper_limit.value !== null) {
    const ul = kbEntry.upper_limit;
    // Only compare if units are compatible
    if (unitMatchesUL(unit, ul.unit)) {
      exceedsUpperLimit = dailyAmount > ul.value;
    }
  }

  return {
    amount,
    unit,
    substance,
    period,
    frequency: freqMultiplier,
    daily_amount: Math.round(dailyAmount * 100) / 100,
    kb_entry: kbEntry ? kbEntry.canonical : null,
    exceeds_upper_limit: exceedsUpperLimit,
  };
}

/**
 * Check if extracted unit is compatible with upper limit unit for comparison.
 */
function unitMatchesUL(extractedUnit, ulUnit) {
  if (!ulUnit) return false;
  const ul = ulUnit.toLowerCase();
  const eu = extractedUnit.toLowerCase();

  // Direct match
  if (ul.includes(eu)) return true;

  // IU comparisons
  if (eu === "iu" && ul.includes("iu")) return true;

  // mg comparisons
  if (eu === "mg" && ul.includes("mg")) return true;

  // mcg comparisons
  if (eu === "mcg" && ul.includes("mcg")) return true;

  return false;
}

/**
 * Get a risk-relevant summary of dose extractions.
 * Returns { has_dose, any_exceeds_ul, high_dose_items[] }
 */
function getDoseSummary(doses) {
  if (!doses || doses.length === 0) {
    return { has_dose: false, any_exceeds_ul: false, high_dose_items: [] };
  }

  const highDoseItems = doses
    .filter(d => d.exceeds_upper_limit === true)
    .map(d => ({
      substance: d.kb_entry || d.substance,
      daily_amount: d.daily_amount,
      unit: d.unit,
    }));

  return {
    has_dose: true,
    any_exceeds_ul: highDoseItems.length > 0,
    high_dose_items: highDoseItems,
  };
}

module.exports = { extractDoses, getDoseSummary };
