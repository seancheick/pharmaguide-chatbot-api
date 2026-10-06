#!/usr/bin/env node
/**
 * Copy the pipeline's clinical export into the chatbot (one owner of the copy).
 *
 * The pipeline owns clinical truth; the chatbot explains it. This copies, byte for byte:
 *   scripts/interaction_db_output/interactions_verified.json   verified interaction records
 *   scripts/data/drug_classes.json                              drug-class membership (names, RxCUIs)
 * from a dsld_clean checkout into src/data/pipeline/, and writes MANIFEST.json with the pipeline's
 * versions, the source commit and the SHA-256 of each copied file. test/pipeline-interactions.test.js
 * fails if a bundled file no longer matches its manifest, so the data cannot be edited here by hand.
 *
 *   node scripts/sync_pipeline.js [--from ~/Downloads/dsld_clean]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const arg = process.argv.indexOf("--from");
const from = arg > 0 ? process.argv[arg + 1] : process.env.PG_PIPELINE_PATH || path.join(os.homedir(), "Downloads/dsld_clean");
const out = path.join(__dirname, "..", "src", "data", "pipeline");
const FILES = {
  "interactions_verified.json": "scripts/interaction_db_output/interactions_verified.json",
  "drug_classes.json": "scripts/data/drug_classes.json",
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

fs.mkdirSync(out, { recursive: true });
const files = {};
for (const [name, rel] of Object.entries(FILES)) {
  const buf = fs.readFileSync(path.join(from, rel));
  JSON.parse(buf.toString("utf8")); // refuse to copy a broken file
  fs.writeFileSync(path.join(out, name), buf);
  files[name] = { source: rel, sha256: sha256(buf), bytes: buf.length };
}
const dbManifest = JSON.parse(fs.readFileSync(path.join(from, "scripts/interaction_db_output/interaction_db_manifest.json"), "utf8"));
let commit = null;
try { commit = execFileSync("git", ["-C", from, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
const interactions = JSON.parse(fs.readFileSync(path.join(out, "interactions_verified.json"), "utf8"));
const manifest = {
  source_repo: "dsld_clean (PharmaGuide pipeline)",
  source_commit: commit,
  db_version: dbManifest.interaction_db_version || dbManifest.db_version,
  schema_version: dbManifest.schema_version,
  pipeline_version: dbManifest.pipeline_version,
  built_at: dbManifest.built_at,
  interactions: (interactions.interactions || interactions).length,
  files,
};
fs.writeFileSync(path.join(out, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Synced pipeline db ${manifest.db_version} (schema ${manifest.schema_version}, ${manifest.interactions} interactions) from ${commit ? commit.slice(0, 9) : from}`);
