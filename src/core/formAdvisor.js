/**
 * Form-specific guidance engine.
 * Uses KB form data to differentiate advice in gate replies.
 *
 * Example: "magnesium glycinate for sleep is fine alongside sertraline —
 * the concern is the 5-HTP."
 */

const { getKBEntry } = require("../config/knowledgeBase");
const { normalizeText } = require("./normalize");

/**
 * Detect which form of a supplement the user mentioned.
 * Returns { supplement, form, formData } or null.
 */
function detectMentionedForm(text, supplementName) {
  const kb = getKBEntry(supplementName);
  if (!kb || !kb.forms) return null;

  const t = normalizeText(text);

  for (const [formName, formData] of Object.entries(kb.forms)) {
    const formPattern = new RegExp("\\b" + formName.replace(/\s+/g, "\\s+") + "\\b", "i");
    if (formPattern.test(t)) {
      return { supplement: kb.canonical, form: formName, formData };
    }
  }

  // Check if the supplement alias itself implies a form
  // e.g., "magnesium glycinate" → glycinate form
  const aliasFormMap = {
    magnesium: {
      "magnesium glycinate": "glycinate",
      "mag glycinate": "glycinate",
      "magnesium citrate": "citrate",
      "magnesium oxide": "oxide",
      "magnesium threonate": "threonate",
      "magnesium taurate": "taurate",
      "natural calm": "citrate",
    },
    iron: {
      "ferrous sulfate": "ferrous sulfate",
      "ferrous gluconate": "ferrous gluconate",
      "ferrous bisglycinate": "bisglycinate",
      "iron bisglycinate": "bisglycinate",
      "gentle iron": "bisglycinate",
    },
    zinc: {
      "zinc picolinate": "picolinate",
      "zinc gluconate": "gluconate",
      "zinc citrate": "citrate",
      "zinc carnosine": "carnosine",
    },
  };

  const aliasMap = aliasFormMap[supplementName] || aliasFormMap[kb.canonical];
  if (aliasMap) {
    for (const [alias, formName] of Object.entries(aliasMap)) {
      if (t.includes(alias)) {
        const formData = kb.forms[formName];
        if (formData) return { supplement: kb.canonical, form: formName, formData };
      }
    }
  }

  return null;
}

/**
 * Build form-specific guidance for a supplement in a given context.
 * Returns a string note to inject into a gate reply, or null.
 */
function getFormGuidance(text, supplementName) {
  const result = detectMentionedForm(text, supplementName);
  if (!result) return null;

  const { supplement, form, formData } = result;
  const parts = [];

  if (formData.best_for && formData.best_for.length > 0) {
    parts.push(`**${supplement} ${form}** is best suited for: ${formData.best_for.join(", ")}`);
  }

  if (formData.absorption) {
    parts.push(`absorption is ${formData.absorption}`);
  }

  if (formData.gi_tolerance) {
    parts.push(`GI tolerance is ${formData.gi_tolerance}`);
  }

  if (parts.length === 0) return null;
  return parts.join("; ") + ".";
}

/**
 * For the serotonergic warning context: if user mentions a safe supplement
 * form alongside a serotonergic risk, clarify which item is the concern.
 *
 * Example: magnesium glycinate + sertraline + 5-HTP →
 * "Magnesium glycinate is not serotonergic — it's fine with sertraline.
 *  The concern is the 5-HTP."
 */
function getSafeItemClarification(text) {
  const t = normalizeText(text);

  const safeSupplements = [
    { pattern: /\bmagnesium\b/, name: "Magnesium", note: "is not serotonergic and is generally safe alongside antidepressants" },
    { pattern: /\bvitamin d\b/, name: "Vitamin D", note: "is not serotonergic and does not interact with antidepressants" },
    { pattern: /\bfish oil\b|omega.?3\b/, name: "Fish oil", note: "is not serotonergic and is generally safe alongside antidepressants" },
    { pattern: /\bcreatine\b/, name: "Creatine", note: "is not serotonergic and does not interact with antidepressants" },
    { pattern: /\bvitamin b12\b|b12\b/, name: "Vitamin B12", note: "is not serotonergic and is safe with antidepressants" },
    { pattern: /\bcoq10\b/, name: "CoQ10", note: "is not serotonergic and is safe with antidepressants" },
    { pattern: /\bzinc\b/, name: "Zinc", note: "is not serotonergic and is safe with antidepressants" },
  ];

  const found = [];
  for (const item of safeSupplements) {
    if (item.pattern.test(t)) {
      found.push(item);
    }
  }

  if (found.length === 0) return null;

  // Only include clarification if there's also a serotonergic risk item
  const hasSerotonergicRisk = /\b(5[\s-]?htp|st\.?\s*john(s)?|tryptophan|rhodiola)\b/.test(t);
  if (!hasSerotonergicRisk) return null;

  if (found.length === 1) {
    return `• **${found[0].name}** ${found[0].note} — it's not the concern here.`;
  }

  const names = found.map(f => f.name).join(", ");
  return `• **${names}** are not serotonergic — they're safe alongside your antidepressant. The concern is the serotonergic item(s) listed above.`;
}

/**
 * Build form-aware renal guidance.
 * All forms of magnesium add elemental Mg, but some have more per dose.
 */
function getRenalFormNote(text) {
  const result = detectMentionedForm(text, "magnesium");
  if (!result) return null;

  const { form, formData } = result;
  const pct = formData.elemental_pct;

  if (pct) {
    return `• **${form}** is ~${pct}% elemental magnesium by weight. ${pct >= 30 ? "Higher elemental content means more magnesium load per pill — extra caution with impaired kidneys." : "Lower elemental content per pill, but still adds magnesium your kidneys may not clear."}`;
  }
  return null;
}

module.exports = {
  detectMentionedForm,
  getFormGuidance,
  getSafeItemClarification,
  getRenalFormNote,
};
