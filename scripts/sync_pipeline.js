#!/usr/bin/env node
/**
 * Copy the pipeline's clinical export into the chatbot (one owner of the copy).
 *
 * The pipeline owns clinical truth; the chatbot explains it. This copies, from a dsld_clean checkout
 * into src/data/pipeline/:
 *   scripts/interaction_db_output/interactions_verified.json   verified interaction records (byte for byte)
 *   scripts/data/drug_classes.json                              drug-class membership (byte for byte)
 *   scripts/data/medication_depletions.json                     medication–nutrient notes, keeping only the
 *                                                               entries src/core/depletions.js isApproved()
 *                                                               passes; the rest are listed in the manifest
 * and writes MANIFEST.json with the pipeline's versions, the source commit and the SHA-256 of each
 * bundled file. test/pipeline-interactions.test.js fails if a bundled file no longer matches its
 * manifest, so the data cannot be edited here by hand.
 *
 *   node scripts/sync_pipeline.js [--from ~/Downloads/dsld_clean]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { isApproved } = require("../src/core/depletions");

const arg = process.argv.indexOf("--from");
const from = arg > 0 ? process.argv[arg + 1] : process.env.PG_PIPELINE_PATH || path.join(os.homedir(), "Downloads/dsld_clean");
const out = path.join(__dirname, "..", "src", "data", "pipeline");
const FILES = {
  "interactions_verified.json": "scripts/interaction_db_output/interactions_verified.json",
  "drug_classes.json": "scripts/data/drug_classes.json",
  "medication_depletions.json": "scripts/data/medication_depletions.json",
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

fs.mkdirSync(out, { recursive: true });
const files = {};
for (const [name, rel] of Object.entries(FILES)) {
  const src = fs.readFileSync(path.join(from, rel));
  const doc = JSON.parse(src.toString("utf8")); // refuse to copy a broken file
  let buf = src;
  let extra = {};
  if (name === "medication_depletions.json") {
    // Chat quotes only notes the pipeline has verified and approved; the others never enter the bundle,
    // and are listed so the review backlog stays visible.
    const withheld = doc.depletions.filter((e) => !isApproved(e));
    doc.depletions = doc.depletions.filter(isApproved);
    buf = Buffer.from(JSON.stringify(doc, null, 2) + "\n");
    extra = {
      source_sha256: sha256(src),
      kept: doc.depletions.length,
      withheld: withheld.map((e) => ({ id: e.id, drug: (e.drug_ref || {}).id || null, nutrient: (e.depleted_nutrient || {}).standard_name || null })),
    };
  }
  fs.writeFileSync(path.join(out, name), buf);
  files[name] = { source: rel, sha256: sha256(buf), bytes: buf.length, ...extra };
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
