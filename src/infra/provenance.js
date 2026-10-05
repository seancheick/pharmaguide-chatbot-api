/**
 * What is running: the versions and content hashes of everything that decides an answer.
 *
 * One owner. /api/health reports it, every chat response carries it as the X-PG-Ruleset
 * header, and the response-cache key uses the prompt hash, so "which rules produced this
 * reply?" has one answer. Computed once per cold start.
 */

const crypto = require("crypto");
const { SYSTEM_PROMPT } = require("../config/systemPrompt");
const { getPolicyVersion } = require("../config/safetyPolicy");
const { APPROVED_CLAIMS } = require("../config/approvedClaims");
const knowledgeBase = require("../config/knowledgeBase");
const gateDefinitions = require("../gates/gates.json");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

const systemPromptHash = sha(SYSTEM_PROMPT);
const knowledgeEntries = knowledgeBase.getAllEntries();
const provenance = Object.freeze({
  policy_version: getPolicyVersion(),
  gates_version: gateDefinitions._version,
  system_prompt_hash: systemPromptHash,
  knowledge: { entries: knowledgeEntries.length, hash: sha(JSON.stringify(knowledgeEntries)) },
  claims: { count: Object.keys(APPROVED_CLAIMS).length, hash: sha(JSON.stringify(APPROVED_CLAIMS)) },
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
});

function getProvenance() {
  return provenance;
}

/** Compact form for a response header. */
function rulesetTag() {
  const p = provenance;
  return [
    `policy=${p.policy_version}`,
    `gates=${p.gates_version}`,
    `prompt=${p.system_prompt_hash}`,
    `kb=${p.knowledge.hash}`,
    `claims=${p.claims.hash}`,
    ...(p.commit ? [`commit=${p.commit}`] : []),
  ].join("; ");
}

module.exports = { getProvenance, rulesetTag, systemPromptHash };
