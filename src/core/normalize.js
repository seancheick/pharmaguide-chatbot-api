const { applySynonyms } = require("../config/synonymMap");

function normalizeText(s) {
  let t = String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return applySynonyms(t);
}

module.exports = { normalizeText };
