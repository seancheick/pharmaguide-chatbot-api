#!/usr/bin/env node
/**
 * Production smoke test: replays the pinned canaries (test/canaries.js)
 * against a deployed /api/chat and exits non-zero if any fail.
 *
 *   node scripts/smoke_prod.js [baseUrl]
 *   SMOKE_BASE_URL=https://pharmaguide-chatbot-api.vercel.app node scripts/smoke_prod.js
 *
 * Optional environment:
 *   PG_PROXY_SECRET                   sent as x-pg-proxy-secret (needed once the API enforces it)
 *   VERCEL_AUTOMATION_BYPASS_SECRET   sent as x-vercel-protection-bypass (preview deployments)
 *
 * Plain Node, no dependencies. Safe to run after every deploy and on a cron.
 */

const { CANARIES } = require("../test/canaries");

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || "https://pharmaguide-chatbot-api.vercel.app").replace(/\/+$/, "");
const TIMEOUT_MS = 30000;

const HEADERS = { "Content-Type": "application/json", Origin: "https://pharmaguide.io" };
if (process.env.PG_PROXY_SECRET) HEADERS["x-pg-proxy-secret"] = process.env.PG_PROXY_SECRET;
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) HEADERS["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

let servingRuleset = null; // the X-PG-Ruleset header of the last response: which rules the deployment is running

async function post(body, attempt = 1) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  // The API allows 10 requests/min per IP: wait out a 429 once instead of failing the canary.
  if (res.status === 429 && attempt === 1) {
    const wait = Math.min(65, Math.max(1, (json && json.retryAfter) || 30));
    console.log(`  (rate limited, waiting ${wait}s)`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return post(body, 2);
  }
  const ruleset = res.headers.get("x-pg-ruleset");
  if (ruleset) servingRuleset = ruleset;
  return { status: res.status, json };
}

async function runCanary(canary) {
  const results = [];
  const history = [];
  let state;
  for (const turn of canary.turns) {
    const r = await post({ message: turn.message, history: history.slice(-10), ...(state ? { _state: state } : {}) });
    results.push(r);
    history.push({ role: "user", content: turn.message });
    if (r.json && typeof r.json.reply === "string") history.push({ role: "assistant", content: r.json.reply });
    if (r.json && r.json._state) state = r.json._state;
  }
  return canary.check(results);
}

(async () => {
  const live = CANARIES.filter((c) => !c.inProcessOnly);
  console.log(`Smoke test against ${BASE} (${live.length} canaries; ${CANARIES.length - live.length} in-process-only skipped)`);
  let failed = 0;
  for (const canary of live) {
    try {
      const problems = await runCanary(canary);
      if (problems.length === 0) console.log(`PASS  ${canary.id}`);
      else { failed++; console.log(`FAIL  ${canary.id}\n      - ${problems.join("\n      - ")}`); }
    } catch (e) {
      failed++;
      console.log(`FAIL  ${canary.id}\n      - request error: ${e.message}`);
    }
  }
  console.log(`\nServing: ${servingRuleset || "(no X-PG-Ruleset header: deployment predates it)"}`);
  console.log(failed === 0 ? "All canaries passed." : `${failed} canary(ies) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
})();
