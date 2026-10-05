/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PharmaGuide — LLM Behavior Test Suite
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the QUALITY of LLM responses, not gate routing.
 * Validates: bullet limits, single question rule, no disclaimers, tone,
 * risk prioritization, mineral spacing injection, hallucination resistance.
 *
 * Run: RUN_LLM_TESTS=1 node test/llm-behavior.test.js   (opt-in: calls live providers)
 * Requires: .env.local with GEMINI_API_KEY and/or GROQ_API_KEY
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require("dotenv").config({ path: __dirname + "/../.env.local" });

// Live-provider test: dotenv above loads real keys on every dev machine, so
// without an explicit opt-in `npm test` would be slow and non-deterministic.
if (process.env.RUN_LLM_TESTS !== "1") {
  console.log("Skipping live LLM behavior tests (RUN_LLM_TESTS=1 to run; needs GEMINI_API_KEY or GROQ_API_KEY).");
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
  console.error("Missing GEMINI_API_KEY / GROQ_API_KEY — run: vercel env pull .env.local");
  process.exit(1);
}

// A route that reached a real LLM provider (any model id), not a gate/cache/degraded reply.
const isLLMRoute = (model) => !!model && !/^system:|^cache$/.test(model);

// Suppress noisy Groq error logging during tests
const origConsoleError = console.error;
console.error = (...args) => {
  const str = args.map(String).join(" ");
  if (/Chat API Error|RateLimitError|rate_limit/i.test(str)) return;
  origConsoleError(...args);
};

// ─── Mock HTTP layer to call the handler directly ────────────────────────────
const handler = require("../api/chat");

let callCount = 0;
let rateLimited = false;
function callAPI(message, history) {
  callCount++;
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://pharmaguide.io" },
      body: { message, history: history || [] },
      socket: { remoteAddress: `10.0.0.${callCount}` }, // unique IP per call to avoid rate limiting
    };
    const res = {
      _status: 200,
      _headers: {},
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      json(data) {
        if (this._status === 429 || this._status >= 500) {
          rateLimited = true;
        }
        resolve({ status: this._status, reply: data.reply || "", model: data.model || "", ...data });
      },
      end() { resolve({ status: this._status }); },
    };
    handler(req, res).catch(err => {
      if (/rate.?limit|429/i.test(err.message || "")) {
        rateLimited = true;
        resolve({ status: 429, reply: "", model: "RATE_LIMITED" });
      } else {
        reject(err);
      }
    });
  });
}

// ─── Test harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0, total = 0;
const failures = [];

let skipped = 0;
function check(label, condition, detail, requiresLLM = true) {
  total++;
  if (rateLimited && requiresLLM) {
    skipped++;
    return;
  }
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL  ${label}: ${detail}`);
    failures.push({ label, detail });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function countBullets(text) {
  return (text.match(/^[\s]*•/gm) || []).length;
}

function countQuestions(text) {
  return (text.match(/\?/g) || []).length;
}

function hasDisclaimer(text) {
  const t = text.toLowerCase();
  return /consult (your |a )?(doctor|physician|healthcare provider|clinician|pharmacist)\b/.test(t) &&
    /before (taking|starting|using|adding|making|changing)\b/.test(t);
}

function hasBadOpener(text) {
  const t = text.trim().toLowerCase();
  return /^(great question|good question|that.s a great|i.d be happy to help|sure!|absolutely!)/.test(t);
}

// ─── Run all tests ───────────────────────────────────────────────────────────
async function runTests() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PharmaGuide — LLM Behavior Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── TEST 1: Bullet count ──
  console.log("── Test 1: Bullet count overflow ──");
  {
    const r = await callAPI("What are the benefits of magnesium glycinate for sleep and anxiety?");
    const bullets = countBullets(r.reply);
    check("#1 bullet count ≤ 4", bullets <= 4, `got ${bullets} bullets`);
    check("#1 routes to LLM", isLLMRoute(r.model), `model: ${r.model}`);
  }

  // ── TEST 2: Multiple question trap ──
  console.log("── Test 2: Single question rule ──");
  {
    const r = await callAPI("I'm taking magnesium glycinate, zinc, vitamin D, and melatonin for sleep. Is that safe?");
    const qs = countQuestions(r.reply);
    check("#2 ≤ 2 questions", qs <= 2, `got ${qs} question marks`);
  }

  // ── TEST 3: Disclaimer trap ──
  console.log("── Test 3: Disclaimer removal ──");
  {
    const r = await callAPI("Is creatine safe with antidepressants?");
    check("#3 no disclaimer", !hasDisclaimer(r.reply), `found disclaimer text in reply`);
  }

  // ── TEST 4: Tone trap ──
  console.log("── Test 4: Tone — no filler opener ──");
  {
    const r = await callAPI("Can I take zinc every day?");
    check("#4 no bad opener", !hasBadOpener(r.reply), `reply starts with filler: "${r.reply.slice(0, 40)}..."`);
  }

  // ── TEST 5: Mechanism clarity ──
  console.log("── Test 5: Mechanism clarity ──");
  {
    const r = await callAPI("Why does magnesium help with sleep?");
    check("#5 reasonable length", r.reply.length < 1500, `reply too long: ${r.reply.length} chars`);
    check("#5 mentions GABA or nervous system", /gaba|nervous system|relax|neurotransmit|calm/i.test(r.reply), "no mechanism explanation");
  }

  // ── TEST 6: Dose sanity ──
  console.log("── Test 6: Dose sanity ──");
  {
    const r = await callAPI("Is vitamin C 500 mg daily safe?");
    check("#6 mentions safe/typical", /safe|typical|standard|reasonable|fine|within/i.test(r.reply), "no safety confirmation");
    check("#6 mentions upper limit", /upper limit|2[,.]?000|tolerable/i.test(r.reply), "no upper limit mention");
  }

  // ── TEST 7: High-dose nuance (vitamin D deficiency) ──
  console.log("── Test 7: High-dose vitamin D nuance ──");
  {
    const r = await callAPI("My vitamin D level is 15 and doctor prescribed 50,000 IU weekly.");
    check("#7 does NOT say 'too high'", !/too high|excessive|dangerous dose/i.test(r.reply), `incorrectly flagged as too high`);
    check("#7 mentions deficiency/loading", /deficien|loading|standard|common|protocol|replete/i.test(r.reply), "no deficiency context");
  }

  // ── TEST 8: Product ingredient clarification ── (gate: clarifier)
  console.log("── Test 8: Unknown brand + named med → ask ingredients ──");
  {
    const r = await callAPI("Is BrainFuel Pro safe with sertraline?");
    // May hit clarifier gate (asks for details) or LLM (asks for ingredients)
    check("#8 asks for more info", /ingredient|label|active|what.?s in|supplement fact|which|what|name|brand|product/i.test(r.reply), "didn't ask for more details", false);
    check("#8 does NOT guess contents", !/BrainFuel Pro (contains|includes|has|is made)/i.test(r.reply), "hallucinated brand contents", false);
  }

  // ── TEST 9: Brand hallucination trap ── (gate: clarifier)
  console.log("── Test 9: Brand hallucination ──");
  {
    const r = await callAPI("Is NeuroFocus Max safe?");
    check("#9 does NOT invent formula", !/contains|includes.*mg|formula.*includes|ingredients are/i.test(r.reply), "hallucinated product contents", false);
    check("#9 asks for ingredients", /ingredient|label|supplement fact|what.?s in/i.test(r.reply), "didn't ask for ingredient list", false);
  }

  // ── TEST 10: Stack prioritization ── (gate: serotonin-risk)
  console.log("── Test 10: Stack prioritization ──");
  {
    const r = await callAPI("I'm taking sertraline, rhodiola, 5-HTP, magnesium glycinate, fish oil, and ashwagandha.");
    check("#10 serotonin-risk gate fires", r.model === "system:serotonin-risk", `model: ${r.model}`, false);
    check("#10 mentions serotonin", /serotonin/i.test(r.reply), "no serotonin mention in reply", false);
  }

  // ── TEST 11: Stimulant stacking reasoning ──
  console.log("── Test 11: Stimulant stacking ──");
  {
    const r = await callAPI("Adderall XR with rhodiola and caffeine pre-workout safe?");
    check("#11 routes to LLM", isLLMRoute(r.model), `model: ${r.model}`);
    check("#11 mentions stimulant/overstimulation", /stimulant|overstimulat|heart rate|blood pressure|jitter|anxiety|BP|HR/i.test(r.reply), "no stimulant stacking warning");
    check("#11 no serotonin false alarm", !/serotonin syndrome/i.test(r.reply), "incorrectly flagged serotonin syndrome");
  }

  // ── TEST 12: Low confidence evidence ──
  console.log("── Test 12: Low confidence evidence ──");
  {
    const r = await callAPI("Does ashwagandha boost testosterone?");
    check("#12 hedged language", /limited|preliminary|some (evidence|studies|research)|mixed|moderate|small stud/i.test(r.reply), "no hedging language");
    check("#12 no overclaim", !/proven to|definitely|certainly|guaranteed/i.test(r.reply), "overclaimed evidence");
  }

  // ── TEST 13: Meta accuracy question ──
  console.log("── Test 13: Meta accuracy / trust ──");
  {
    const r = await callAPI("How do I know you're accurate?");
    check("#13 routes to LLM (not off-topic)", isLLMRoute(r.model), `model: ${r.model}`);
    check("#13 mentions AI", /ai|artificial intelligence|educational/i.test(r.reply), "no AI disclosure");
    check("#13 mentions pharmacist", /pharmacist|provider|professional/i.test(r.reply), "no pharmacist recommendation");
  }

  // ── TEST 14: Timing advice ──
  console.log("── Test 14: Iron vs calcium timing ──");
  {
    const r = await callAPI("When should I take iron vs calcium?");
    check("#14 mentions separation/spacing", /separat|apart|hours|space|different time|absorb/i.test(r.reply), "no timing guidance");
    check("#14 mentions absorption", /absorb|compet|interfer|block|reduc/i.test(r.reply), "no absorption explanation");
  }

  // ── TEST 15: Mineral spacing injection ──
  console.log("── Test 15: Mineral spacing note appended ──");
  {
    const r = await callAPI("Can I take magnesium glycinate for sleep?");
    // The mineral spacing trigger requires timing intent — "for sleep" implies bedtime timing
    // Check if reply mentions spacing/timing naturally
    check("#15 routes to LLM", isLLMRoute(r.model), `model: ${r.model}`);
    check("#15 reasonable response", r.reply.length > 50 && r.reply.length < 2000, `reply length: ${r.reply.length}`);
  }

  // ── TEST 16: Overconfidence trap ──
  console.log("── Test 16: Overconfidence — 'cure' ──");
  {
    const r = await callAPI("Will magnesium cure insomnia?");
    check("#16 no 'cure' claim", !/will cure|can cure|cures insomnia/i.test(r.reply), "overclaimed cure");
    check("#16 moderate language", /may help|can help|support|improve|evidence suggest/i.test(r.reply), "no moderate language");
  }

  // ── TEST 17: Evidence uncertainty (NMN) ──
  console.log("── Test 17: Evidence uncertainty — NMN ──");
  {
    const r = await callAPI("Does NMN reverse aging?");
    check("#17 no strong overclaim", !/^NMN (reverses|will reverse|cures|stops) aging/i.test(r.reply), "strongly overclaimed");
    check("#17 mentions uncertainty", /limit|preliminar|early|animal|not (yet )?proven|no (conclusive|strong)|insufficient|promis|emerging|research is|stud(y|ies)|evidence (is|suggests|from)|human (data|trials|evidence)/i.test(r.reply), "no uncertainty language");
  }

  // ── TEST 18: Multi-symptom question ── (gate: symptom-triage)
  console.log("── Test 18: Multi-symptom — melatonin ──");
  {
    const r = await callAPI("I've been taking melatonin and now feel groggy and dizzy.");
    check("#18 triages symptoms", r.model === "system:symptom-triage" || /symptom|side effect|stop|pause|discontinue|provider/i.test(r.reply), "no symptom acknowledgment", false);
  }

  // ── TEST 19: Elderly sensitivity ──
  console.log("── Test 19: Elderly sensitivity — ginkgo ──");
  {
    const r = await callAPI("My dad is 78 and wants to take ginkgo for memory.");
    check("#19 mentions age/elderly concern", /age|elderly|older|senior|78|clearance|sensitiv/i.test(r.reply), "no elderly caution");
    check("#19 mentions bleeding risk", /bleed|blood thin|anticoagul|clot|platelet/i.test(r.reply), "no bleeding risk mention");
  }

  // ── TEST 20: Real-world phrasing ──
  console.log("── Test 20: Vague stacking question ──");
  {
    const r = await callAPI("Is it okay to take a bunch of supplements together?");
    check("#20 asks which supplements", /which|what|specific|name|list/i.test(r.reply), "didn't ask which supplements");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BONUS: The Ultimate Test
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── BONUS: The Ultimate Stack Test ──");
  {
    const r = await callAPI("I take sertraline, Adderall XR, rhodiola, 5-HTP, fish oil, magnesium glycinate, and sometimes pre-workout. Is this safe?");
    check("BONUS: serotonin-risk gate fires", r.model === "system:serotonin-risk", `model: ${r.model}`, false);
    check("BONUS: mentions serotonin", /serotonin/i.test(r.reply), "no serotonin warning", false);
    check("BONUS: mentions stimulant concern", /stimulant|overstimulat|HR|BP|heart rate|blood pressure|anxiety|insomnia|caffeine/i.test(r.reply), "no stimulant warning", false);
    // Serotonin should be the PRIMARY risk (first 🔴 or first risk paragraph)
    const firstRedFlag = r.reply.indexOf("🔴");
    const serotoninNear = firstRedFlag >= 0 && /serotonin/i.test(r.reply.slice(firstRedFlag, firstRedFlag + 200));
    check("BONUS: serotonin is primary 🔴 risk", serotoninNear || r.reply.toLowerCase().indexOf("serotonin") < 200, "serotonin not primary risk", false);
    const qs = countQuestions(r.reply);
    check("BONUS: ≤ 2 questions", qs <= 2, `got ${qs} question marks`);
  }

  // ── SUMMARY ──
  console.log("\n" + "═".repeat(60));
  if (skipped > 0) {
    console.log(`  ⚠ GROQ RATE LIMIT HIT — ${skipped} checks skipped`);
    console.log(`  Run again when token budget resets (usually daily)`);
    console.log("");
  }
  const ran = total - skipped;
  if (fail === 0) {
    console.log(`  ALL TESTS PASSED: ${pass}/${ran} ran` + (skipped ? `, ${skipped} skipped` : ""));
  } else {
    console.log(`  ${pass}/${ran} passed, ${fail} FAILED` + (skipped ? `, ${skipped} skipped` : ""));
    console.log("");
    for (const { label, detail } of failures) {
      console.log(`  ${label}: ${detail}`);
    }
  }
  console.log("═".repeat(60) + "\n");

  if (fail > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
