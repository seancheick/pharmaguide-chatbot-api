const { applySynonyms } = require("../config/synonymMap");

function normalizeText(s) {
  let t = String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return applySynonyms(t);
}

// Escape a string for literal use inside a RegExp (KB names such as
// "curcumin + piperine" must never be compiled as pattern syntax).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { normalizeText, escapeRegex };
