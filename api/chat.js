/**
 * PharmaGuide AI Chatbot API (Vercel Serverless Function)
 * Powered by Groq (Llama 3.3 70B)
 *
 * Endpoint: POST /api/chat
 * Body: { "message": "user question", "history": [...previous messages] }
 *
 * Thin handler — imports gate logic, routing, and reply functions from /src.
 */

const { setCors } = require("../src/config/cors");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
const { normalizeText } = require("../src/core/normalize");
const { sanitizeHistory, getConversationContext } = require("../src/core/history");
const { extractEntities, extractKnownItems } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const detection = require("../src/gates/detection");
const { ROUTE_REPLY_MAP, emergencyReply, premiumWelcomeReply, premiumThanksReply, premiumGoodbyeReply, offTopicReply, flirtyDeflectReply, creatorReply, medicalConditionRedirectReply } = require("../src/gates/replies");
const { tryDSLGate, isDSLRoute } = require("../src/gates/gateEngine");
const { groq } = require("../src/infra/groqClient");
const { checkRateLimit } = require("../src/infra/rateLimit");
const { logGate } = require("../src/infra/logger");
const { mineralSpacingNote, stripModelSpacingAdvice, enforceOneQuestion } = require("../src/postprocess");
const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");
const { classifyEntities } = require("../src/core/entityClassifier");
const { correctMisspellings, resolveBrandName, detectUnknownDosedItems } = require("../src/core/unknownResolver");
const { findMissingFields } = require("../src/core/requiredFields");
const { buildAnalyticsEvent, emitAnalyticsEvent } = require("../src/infra/analytics");
const { buildCacheKey, isCacheable, getCachedResponse, setCachedResponse } = require("../src/infra/responseCache");
const { allowRequest, recordSuccess, recordFailure } = require("../src/infra/circuitBreaker");
const { getDegradedResponse } = require("../src/infra/gracefulDegradation");
const { buildAugmentedMessages } = require("../src/core/kbLookup");
const { extractDoses, getDoseSummary } = require("../src/core/doseExtractor");
const { resolveConfidence } = require("../src/core/confidence");
const { buildTemporalContext } = require("../src/core/temporalContext");
const crypto = require("crypto");

function getClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim().length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientIP = getClientIP(req);
  const rl = await checkRateLimit(clientIP);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
    return res.status(429).json({ error: "Too many requests. Please wait a moment before trying again.", retryAfter });
  }

  try {
    const requestStart = Date.now();
    const body = req.body || {};
    const message = body.message;
    const history = body.history || [];

    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message is required" });
    if (message.length > 2000) return res.status(400).json({ error: "Message too long. Please keep it under 2000 characters." });

    // ── 1. Emergency (instant) ──
    if (detection.isEmergency(message)) {
      logGate("system:emergency", message.length, false);
      return res.status(200).json({ reply: emergencyReply(), model: "system:emergency" });
    }

    const safeHistory = sanitizeHistory(history);
    const hasConversation = safeHistory.length > 0;
    const convoContext = getConversationContext(message, safeHistory);

    // ── 2. Greeting (first message only) ──
    if (!hasConversation && detection.isGreeting(message)) {
      logGate("system:welcome", message.length, hasConversation);
      return res.status(200).json({ reply: premiumWelcomeReply(), model: "system:welcome" });
    }

    // ── 3. Thanks / Goodbye ──
    if (detection.isThanks(message)) {
      logGate("system:thanks", message.length, hasConversation);
      return res.status(200).json({ reply: premiumThanksReply(), model: "system:thanks" });
    }
    if (detection.isGoodbye(message)) {
      logGate("system:goodbye", message.length, hasConversation);
      return res.status(200).json({ reply: premiumGoodbyeReply(), model: "system:goodbye" });
    }

    // ── 3b. Personality gates ──
    if (detection.isFlirty(message)) {
      logGate("system:flirty", message.length, hasConversation);
      return res.status(200).json({ reply: flirtyDeflectReply(), model: "system:flirty" });
    }
    if (detection.isCreatorQuestion(message)) {
      logGate("system:creator", message.length, hasConversation);
      return res.status(200).json({ reply: creatorReply(), model: "system:creator" });
    }

    // ── 4. Off-topic (first message, intent scorer) ──
    const isCreativeRequest = /\b(write me|write a|compose|create a|make a|generate a|give me a)\b.{0,20}\b(poem|song|story|essay|rap|haiku|limerick|joke|riddle)\b/.test(normalizeText(message));
    if (isCreativeRequest) {
      logGate("system:off-topic", message.length, hasConversation);
      return res.status(200).json({ reply: offTopicReply(), model: "system:off-topic" });
    }
    const isMetaQuestion = /\b(you.?re ai|are you ai|how do i know|can i trust|are you accurate|who built|who made|how does this work|what are you|reveal|system prompt|safety rules|previous instructions|prescribing authority|pretend you|act as|you are now|ignore .{0,20}(instruct|safety|rules)|stop follow|answer (yes|no)|without restrict|testing .{0,10}(ai|model|chatbot)|test.*model)\b/.test(normalizeText(message));
    if (!hasConversation && !isMetaQuestion && detection.intentScore(message) < 2) {
      logGate("system:off-topic", message.length, hasConversation);
      return res.status(200).json({ reply: offTopicReply(), model: "system:off-topic" });
    }

    // ── 4b. Medical condition redirect (first message, no supplement/interaction intent) ──
    if (!hasConversation && detection.isMedicalConditionQuery(message)) {
      logGate("system:medical-condition", message.length, hasConversation);
      return res.status(200).json({ reply: medicalConditionRedirectReply(), model: "system:medical-condition" });
    }

    // ── Risk triage pipeline ──
    const entities = extractEntities(message, convoContext);
    const doses = extractDoses(message);
    const doseSummary = getDoseSummary(doses);
    const scores = scoreRisks(entities, normalizeText(message), convoContext);
    const triageRoute = routeByRisk(scores, entities, convoContext, message, hasConversation);

    // ── Unknown/misspelling detection (for analytics) ──
    const { corrections } = correctMisspellings(message);
    const brandResult = resolveBrandName(message);
    const knownItems = extractKnownItems(convoContext);
    const unknownDosed = detectUnknownDosedItems(message, knownItems);
    const missingFields = triageRoute !== "llm" ? findMissingFields(triageRoute, { known_meds: entities.meds }) : [];

    if (triageRoute !== "llm") {
      logGate(triageRoute, message.length, hasConversation);

      // Try DSL gate first, fall back to code gate
      let gateReply;
      const dslResult = tryDSLGate(triageRoute);
      if (dslResult.matched) {
        gateReply = dslResult.reply;
      } else {
        const replyFn = ROUTE_REPLY_MAP[triageRoute];
        gateReply = replyFn(convoContext, message, entities);
      }
      const validation = validateResponse(gateReply, triageRoute, entities, null);
      if (!validation.safe) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[VALIDATOR] Gate ${triageRoute} failed:`, validation.violations);
        }
        gateReply = validation.fallback;
      }

      // ── Analytics (gate path) ──
      emitAnalyticsEvent(buildAnalyticsEvent({
        route: triageRoute, scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: validation, source: "gate", llmError: null,
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult,
        clarifierTriggered: triageRoute === "system:clarifier",
        unknownDosedCount: unknownDosed.length,
        missingFields,
      }));

      const { confidence, label: confidenceLabel } = resolveConfidence("gate", 0);
      const payload = {
        reply: gateReply,
        model: triageRoute,
        confidence,
      };
      if (process.env.NODE_ENV === "development") {
        payload._scores = scores;
        payload._entities = entities;
        payload._validation = validation;
        payload._confidence_label = confidenceLabel;
        payload._dose_summary = doseSummary;
      }
      return res.status(200).json(payload);
    }

    // ── Cache check ──
    const systemPromptHash = crypto.createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);
    const modelId = "llama-3.3-70b-versatile";
    const cacheKey = buildCacheKey(message, systemPromptHash, modelId);
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      logGate("llm", message.length, hasConversation);
      emitAnalyticsEvent(buildAnalyticsEvent({
        route: "llm", scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: { safe: true, violations: [] }, source: "cache", llmError: null,
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult, clarifierTriggered: false,
        unknownDosedCount: unknownDosed.length, missingFields: [],
      }));
      const { confidence: cacheConf } = resolveConfidence("cache", 0);
      return res.status(200).json({ reply: cached, model: modelId, confidence: cacheConf });
    }

    // ── Circuit breaker check ──
    const circuit = allowRequest();
    if (!circuit.allowed) {
      logGate("llm", message.length, hasConversation);
      const degradedReply = getDegradedResponse("llm_timeout");
      emitAnalyticsEvent(buildAnalyticsEvent({
        route: "llm", scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: { safe: true, violations: [] }, source: "degraded", llmError: "circuit_open",
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult, clarifierTriggered: false,
        unknownDosedCount: unknownDosed.length, missingFields: [],
      }));
      const { confidence: degradedConf } = resolveConfidence("degraded", 0);
      return res.status(200).json({ reply: degradedReply, model: "system:degraded", confidence: degradedConf });
    }

    // ── LLM call ──
    logGate("llm", message.length, hasConversation);
    let llmError = null;

    // Build KB-augmented messages
    const { messages, kbHits } = buildAugmentedMessages(SYSTEM_PROMPT, safeHistory, message, entities);

    // Inject temporal context if any meds/supps have temporal data
    const allEntityNames = [...(entities.meds || []), ...(entities.supplements || [])];
    const temporalBlock = buildTemporalContext(allEntityNames);
    if (temporalBlock) {
      // Insert as system message right after the main system prompt
      messages.splice(1, 0, { role: "system", content: temporalBlock });
    }

    if (process.env.NODE_ENV === "development") {
      const estTokens = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      console.log(`[TOKEN EST] ~${estTokens} input tokens | history: ${safeHistory.length} msgs | KB hits: ${kbHits}`);
    }

    const completion = await groq.chat.completions.create({
      model: modelId,
      messages,
      temperature: 0.45,
      max_tokens: 650,
      top_p: 0.9,
      stream: false,
    }, { timeout: 8000 });

    recordSuccess();
    let reply = completion.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response. Please try again.";

    // Strip disclaimers (UI footer handles it)
    reply = reply
      .replace(/\n*\*?Educational only[^\n]*/gi, "")
      .replace(/\n*\*?This is for educational[^\n]*/gi, "")
      .replace(/\n*\*?Disclaimer[^\n]*/gi, "")
      .replace(/\n*\*?Note: this is not medical advice[^\n]*/gi, "")
      .replace(/\n*\*?Consult (?:your |a )?(?:doctor|physician|healthcare provider|clinician|pharmacist)[^\n]*before[^\n]*/gi, "")
      .trim();

    // Mineral spacing
    if (detection.mentionsMineralSpacingTrigger(message)) {
      reply = stripModelSpacingAdvice(reply);
      reply = reply + "\n\n" + mineralSpacingNote();
    }

    // Single question enforcement
    reply = enforceOneQuestion(reply);

    // Post-response safety validation
    const llmValidation = validateResponse(reply, "llm", entities, null);
    if (!llmValidation.safe) {
      if (process.env.NODE_ENV === "development") {
        console.log("[VALIDATOR] LLM response failed:", llmValidation.violations);
      }
      reply = llmValidation.fallback;
    }

    // ── Cache store (only if safe and cacheable) ──
    if (isCacheable(message, entities, hasConversation, llmValidation, "llm", scores)) {
      setCachedResponse(cacheKey, reply);
    }

    // ── Analytics (LLM path) ──
    emitAnalyticsEvent(buildAnalyticsEvent({
      route: "llm", scores, entities, message, safeHistory,
      latencyMs: Date.now() - requestStart,
      validationResult: llmValidation, source: "llm", llmError,
      clientIP, misspellingCount: corrections.length,
      brandResolved: !!brandResult, clarifierTriggered: false,
      unknownDosedCount: unknownDosed.length, missingFields: [],
    }));

    const { confidence: llmConf, label: llmConfLabel } = resolveConfidence("llm", kbHits);
    const response = { reply, model: modelId, confidence: llmConf };
    if (process.env.NODE_ENV === "development") {
      response.usage = completion.usage;
      response._validation = llmValidation;
      response._confidence_label = llmConfLabel;
      response._kb_hits = kbHits;
      response._dose_summary = doseSummary;
    }
    return res.status(200).json(response);
  } catch (error) {
    recordFailure();
    console.error("Chat API Error:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Our AI service is busy right now. Please try again in a few moments.", retryAfter: 30 });
    if (error?.status === 401) return res.status(500).json({ error: "Service configuration error. Please contact support." });
    return res.status(500).json({ error: "An unexpected error occurred. Please try again.", details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined });
  }
};
