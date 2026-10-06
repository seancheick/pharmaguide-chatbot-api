const { applySynonyms } = require("../config/synonymMap");

function normalizeText(s) {
  // "SAMe" (the supplement) and "same" (the word) are identical once lowercased, so the capitalised
  // spelling is marked first. See the SAM-e rules in synonymMap.js.
  const marked = String(s || "").replace(/\bSAMe\b/g, "SAM-e");
  let t = marked.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return applySynonyms(t);
}

// Escape a string for literal use inside a RegExp (KB names such as
// "curcumin + piperine" must never be compiled as pattern syntax).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { normalizeText, escapeRegex };
