#!/usr/bin/env node
/**
 * Model bake-off. Runs the golden set through the production handler with each candidate model
 * and scores the answers in the product owner's order (see eval/lib/score.js).
 *
 *   node eval/run.js --list                       the cases, and which ones reach a model (no network)
 *   node eval/run.js --smoke [--models a,b]       one trivial call per model: checks keys and request settings
 *   node eval/run.js --yes [options]              the real run (spends API credit)
 *
 * Options
 *   --models a,b,c        candidates by id (default: every model whose key is set)
 *   --sets canary,curated,interactions   (default: all)
 *   --interactions PATH   pipeline interactions_verified.json (default: $PG_INTERACTIONS_PATH or the dsld_clean checkout)
 *   --per-severity N      interaction records per severity (default 6; each gives a neutral and a pressure case)
 *   --no-record           do not hand the pipeline record to the model (tests the model on the production prompt alone)
 *   --via-openrouter      send every candidate through OpenRouter (needs OPENROUTER_API_KEY)
 *   --limit N             at most N cases per model
 *   --sleep-ms N          pause between calls (free tiers: 2500)
 *   --out DIR             results directory (default eval/results, git-ignored)
 *
 * A live run refuses to start without --yes. Keys come from the environment or .env.local, by name.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadKeys } = require("./lib/keys");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const registry = require("./models.json").models;
const viaOpenRouter = flag("--via-openrouter");
const wanted = (option("--models", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const keyNames = [...new Set([...registry.map((m) => m.keyEnv), "OPENROUTER_API_KEY"])];
const keys = loadKeys(keyNames); // read before the harness scrubs the environment

const { runCase, classify } = require("./lib/harness");
const { fromCanaries, CURATED, fromInteractions, loadInteractions } = require("./lib/cases");
const { scoreOutcome, summarize, rank } = require("./lib/score");
const { callModel } = require("./lib/adapters");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usd = (v) => (v === null || v === undefined ? "n/a" : `$${v.toFixed(5)}`);
const pct = (v) => `${(v * 100).toFixed(0)}%`;

function selectModels() {
  const pool = wanted.length ? registry.filter((m) => wanted.includes(m.id)) : registry;
  const usable = [];
  for (const m of pool) {
    const need = viaOpenRouter ? "OPENROUTER_API_KEY" : m.keyEnv;
    if (keys[need]) usable.push(m);
    else console.log(`  skipping ${m.id}: ${need} is not set`);
  }
  return usable;
}

function buildCases() {
  const sets = (option("--sets", "canary,curated,interactions") || "").split(",");
  let cases = [];
  if (sets.includes("canary")) cases = cases.concat(fromCanaries());
  if (sets.includes("curated")) cases = cases.concat(CURATED);
  if (sets.includes("interactions")) {
    const file = option("--interactions", process.env.PG_INTERACTIONS_PATH || path.join(os.homedir(), "Downloads/dsld_clean/scripts/interaction_db_output/interactions_verified.json"));
    if (fs.existsSync(file)) cases = cases.concat(fromInteractions(loadInteractions(file), { perSeverity: Number(option("--per-severity", "6")) }));
    else console.log(`  interactions file not found (${file}); skipping that set`);
  }
  return cases;
}

async function smoke(models) {
  console.log(`Smoke call, one per model${viaOpenRouter ? " (via OpenRouter)" : ""}:`);
  for (const m of models) {
    const call = await callModel(m, [{ role: "user", content: "Reply with the single word OK." }], { temperature: 0.2, maxTokens: 650, topP: 0.9 }, { keys, viaOpenRouter });
    if (call.ok) console.log(`  ${m.id}: ok · ${call.latencyMs} ms · tokens in ${call.usage.in} / out ${call.usage.out} (hidden reasoning ${call.usage.reasoning}) · finish ${call.finishReason} · "${call.text.slice(0, 40).trim()}"`);
    else console.log(`  ${m.id}: FAILED · ${call.error && call.error.status ? `HTTP ${call.error.status} · ` : ""}${call.error && call.error.message}`);
  }
}

function report(results, meta) {
  const ranked = rank(results);
  const lines = [];
  lines.push(`# Model evaluation ${meta.when}`, "");
  lines.push(`Cases: ${meta.dependent} reach a model, ${meta.gated} are answered by a deterministic gate (not model-dependent). Record supplied: ${meta.supplyRecord ? "yes" : "no"}. Route: ${viaOpenRouter ? "OpenRouter" : "direct"}.`, "");
  lines.push("Ranking is the product owner's order applied mechanically: critical failures, accuracy, supplied-facts, evidence overstatement, latency, cost. Read the flagged answers before trusting it; the checks are heuristics.", "");
  lines.push("| # | Model | Critical | Accuracy | Invented figures | Overstates | Failed/truncated | p50 ms | p95 ms | $/answer |", "|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|");
  ranked.forEach(({ id, summary: s }, i) => {
    lines.push(`| ${i + 1} | ${id} | ${s.criticalFailures} | ${pct(s.accuracyRate)} | ${pct(s.unsupportedRate)} | ${pct(s.overstateRate)} | ${s.errors + s.truncated + s.empty}/${s.cases} | ${s.p50LatencyMs ?? "n/a"} | ${s.p95LatencyMs ?? "n/a"} | ${usd(s.meanCostUsd)} |`);
  });
  lines.push("");
  for (const { id, summary: s, detail } of ranked) {
    lines.push(`## ${id}`, "");
    lines.push(`answered ${s.answered}/${s.cases} · validator rescues ${s.validatorRescues} · over the 8 s production budget ${s.overBudget} · errors ${s.errors}, truncated ${s.truncated}, empty ${s.empty} · total ${usd(s.totalCostUsd)}`, "");
    for (const c of s.criticalCases) lines.push(`- CRITICAL ${c.id}: ${c.flags.join(", ")}`);
    const flagged = detail.filter((d) => d.score.modelDependent && !d.score.failed && (d.score.critical.length || d.score.accuracy.failed.length || d.score.unsupportedFigures.length || d.score.overstates));
    for (const d of flagged) {
      lines.push("", `### ${d.id}`, `flags: ${[...d.score.critical.map((f) => `CRITICAL ${f}`), ...d.score.accuracy.failed, ...d.score.unsupportedFigures.map((f) => `invented ${f}`), ...(d.score.overstates ? ["overstates evidence"] : [])].join("; ")}`, "", "> " + String(d.raw).replace(/\n/g, "\n> ").slice(0, 1800));
    }
    lines.push("");
  }
  return lines.join("\n");
}

(async () => {
  if (flag("--list")) {
    const cases = buildCases();
    const { dependent, gated } = await classify(cases);
    console.log(`${cases.length} cases: ${dependent.length} reach a model, ${gated.length} are answered by a gate.`);
    for (const d of dependent) console.log(`  MODEL  ${d.case.id}`);
    for (const g of gated) console.log(`  gate   ${g.case.id} -> ${g.route}`);
    return;
  }

  const models = selectModels();
  if (models.length === 0) {
    console.log("No usable models. Set the keys named in eval/models.json (or OPENROUTER_API_KEY with --via-openrouter) in the environment or .env.local.");
    process.exit(2);
  }
  if (flag("--smoke")) return smoke(models);

  const supplyRecord = !flag("--no-record");
  const cases = buildCases();
  const { dependent, gated } = await classify(cases);
  const limit = Number(option("--limit", "0")) || dependent.length;
  const run = dependent.slice(0, limit);
  const calls = run.length * models.length;
  const estimate = models.reduce((sum, m) => sum + run.length * ((11000 * m.price.in + 400 * m.price.out) / 1e6), 0);

  console.log(`${run.length} model-dependent cases (${gated.length} gate-answered, skipped) x ${models.length} models = ${calls} calls`);
  console.log(`Rough cost at today's 11K-token prompt: about $${estimate.toFixed(2)} (reasoning tokens not included)`);
  if (models.some((m) => m.keyEnv === "GEMINI_API_KEY")) console.log("Note: GEMINI_API_KEY may be the PRODUCTION key; this run spends from the same quota and billing.");
  if (!flag("--yes")) {
    console.log("Dry run only. Add --yes to make live calls.");
    return;
  }

  const sleepMs = Number(option("--sleep-ms", "0"));
  const results = [];
  for (const m of models) {
    console.log(`\n${m.id}`);
    const detail = [];
    for (const { case: c } of run) {
      const { last } = await runCase(c, m, { keys, viaOpenRouter, supplyRecord });
      const score = scoreOutcome(c, last, m.price);
      detail.push({ id: c.id, score, raw: (last.call && last.call.text) || "" });
      process.stdout.write(score.failed ? "x" : score.critical && score.critical.length ? "!" : ".");
      if (sleepMs) await sleep(sleepMs);
    }
    results.push({ id: m.id, summary: summarize(detail.map((d) => ({ id: d.id, score: d.score }))), detail });
  }

  const when = new Date().toISOString();
  const outDir = option("--out", path.join(__dirname, "results"));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = when.replace(/[:.]/g, "-");
  const md = report(results, { when, dependent: dependent.length, gated: gated.length, supplyRecord });
  fs.writeFileSync(path.join(outDir, `${stamp}.md`), md);
  fs.writeFileSync(path.join(outDir, `${stamp}.json`), JSON.stringify({ when, supplyRecord, viaOpenRouter, results }, null, 1));
  console.log(`\n\n${md.split("\n## ")[0]}\n\nFull report: ${path.join(outDir, `${stamp}.md`)}`);
})().catch((e) => {
  console.error("evaluation failed:", e && e.message);
  process.exit(1);
});
