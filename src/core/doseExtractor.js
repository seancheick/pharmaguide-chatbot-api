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
  // "50,000 IU/week of vitamin D"
  new RegExp("(\\d[\\d,]*\\.?\\d*)\\s*(mg|mcg|iu|g)\\s*/\\s*(day|week|month)\\s+(?:of\\s+)?" + SUBSTANCE_RE, "gi"),
];

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

  // Pattern 1: "500 mg magnesium"
  const p1 = new RegExp(DOSE_PATTERNS[0].source, "gi");
  let m;
  while ((m = p1.exec(text)) !== null) {
    const key = `${m[1]}-${m[2]}-${m[3]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = buildDoseResult(m[1], m[2], m[3].trim(), "day");
    if (r) results.push(r);
  }

  // Pattern 2: "magnesium 500mg"
  const p2 = new RegExp(DOSE_PATTERNS[1].source, "gi");
  while ((m = p2.exec(text)) !== null) {
    const key = `${m[2]}-${m[3]}-${m[1]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = buildDoseResult(m[2], m[3], m[1].trim(), "day");
    if (r) results.push(r);
  }

  // Pattern 3: "50,000 IU/week vitamin D"
  const p3 = new RegExp(DOSE_PATTERNS[2].source, "gi");
  while ((m = p3.exec(text)) !== null) {
    const key = `${m[1]}-${m[2]}-${m[4]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = buildDoseResult(m[1], m[2], m[4].trim(), m[3].toLowerCase());
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
const NOISE_WORDS = /\b(and|or|with|plus|daily|twice|once|every|per|the|a|an|of|i|my|am|is|take|taking|took|started|been)\b/gi;

function cleanSubstance(raw) {
  return raw
    .replace(NOISE_WORDS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDoseResult(amountStr, unitStr, substance, period) {
  const amount = parseNumber(amountStr);
  const unit = normalizeUnit(unitStr);
  substance = cleanSubstance(substance);
  if (!substance || substance.length < 2) return null;

  // Convert to daily amount
  let dailyAmount = amount;
  if (period === "week") dailyAmount = amount / 7;
  else if (period === "month") dailyAmount = amount / 30;

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
