/**
 * PharmaGuide AI Chatbot API (Vercel Serverless Function)
 * Multi-provider: Gemini 2.5 Flash (primary) → Groq/Llama 3.3 70B (fallback)
 *
 * Endpoint: POST /api/chat
 * Body: { "message": "user question", "history": [...previous messages] }
 *
 * Thin handler — imports gate logic, routing, and reply functions from /src.
 */

const { setCors } = require("../src/config/cors");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
const { normalizeText } = require("../src/core/normalize");
const { sanitizeHistory, getConversationContext, extractConversationState, mergeStateIntoEntities } = require("../src/core/history");
const { extractEntities, extractKnownItems } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const detection = require("../src/gates/detection");
const { ROUTE_REPLY_MAP, emergencyReply, premiumWelcomeReply, premiumThanksReply, premiumGoodbyeReply, offTopicReply, flirtyDeflectReply, flirtyRepeatReply, flirtyFinalReply, creatorReply, petQuestionReply, businessInquiryReply, medicalConditionRedirectReply } = require("../src/gates/replies");
const { getFormRecommendation } = require("../src/core/formAdvisor");
const { tryDSLGate, isDSLRoute } = require("../src/gates/gateEngine");
const { checkRateLimit } = require("../src/infra/rateLimit");
const { logGate } = require("../src/infra/logger");
const { mineralSpacingNote, stripModelSpacingAdvice, enforceOneQuestion, addDoseWarnings } = require("../src/postprocess");
const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");
const { classifyEntities } = require("../src/core/entityClassifier");
const { correctMisspellings, resolveBrandName, detectUnknownDosedItems } = require("../src/core/unknownResolver");
const { findMissingFields } = require("../src/core/requiredFields");
const { buildAnalyticsEvent, emitAnalyticsEvent } = require("../src/infra/analytics");
const { buildCacheKey, isCacheable, getCachedResponse, setCachedResponse } = require("../src/infra/responseCache");
const { callWithFallback, scoreComplexity } = require("../src/infra/providerRouter");
const { buildAugmentedMessages } = require("../src/core/kbLookup");
const { extractDoses, getDoseSummary } = require("../src/core/doseExtractor");
const { resolveConfidence } = require("../src/core/confidence");
const { detectAndRecordGaps } = require("../src/infra/topicTracker");
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
      // Count prior flirty deflections in history
      const flirtySignature = "supplement stack";
      const repeatSignature = "going in circles";
      const priorFlirtyCount = safeHistory.filter(m =>
        m.role === "assistant" && (m.content.includes(flirtySignature) || m.content.includes(repeatSignature))
      ).length;

      if (priorFlirtyCount >= 2) {
        logGate("system:flirty-final", message.length, hasConversation);
        return res.status(200).json({ reply: flirtyFinalReply(), model: "system:flirty-final" });
      } else if (priorFlirtyCount >= 1) {
        logGate("system:flirty-repeat", message.length, hasConversation);
        return res.status(200).json({ reply: flirtyRepeatReply(), model: "system:flirty-repeat" });
      }
      logGate("system:flirty", message.length, hasConversation);
      return res.status(200).json({ reply: flirtyDeflectReply(), model: "system:flirty" });
    }
    if (detection.isCreatorQuestion(message)) {
      logGate("system:creator", message.length, hasConversation);
      return res.status(200).json({ reply: creatorReply(), model: "system:creator" });
    }
    if (detection.isPetQuestion(message)) {
      logGate("system:pet-question", message.length, hasConversation);
      return res.status(200).json({ reply: petQuestionReply(), model: "system:pet-question" });
    }
    if (detection.isBusinessInquiry(message)) {
      logGate("system:business-inquiry", message.length, hasConversation);
      return res.status(200).json({ reply: businessInquiryReply(message), model: "system:business-inquiry" });
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

    // ── Conversation state persistence ──
    const previousState = body._state || null;
    const conversationState = extractConversationState(message, safeHistory, previousState);

    // ── Risk triage pipeline ──
    const rawEntities = extractEntities(message, convoContext);
    const entities = mergeStateIntoEntities(rawEntities, conversationState);
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

      // Track topic gaps for off-topic and clarifier routes
      if (triageRoute === "system:off-topic" || triageRoute === "system:clarifier") {
        detectAndRecordGaps(message, triageRoute, detection.intentScore(message), 0, entities);
      }

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
        _state: conversationState,
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

    // ── Query complexity scoring ──
    const allEntityNames = [...(entities.meds || []), ...(entities.supplements || [])];

    // Build KB-augmented messages (need kbHits for complexity scoring)
    const { messages, kbHits } = buildAugmentedMessages(SYSTEM_PROMPT, safeHistory, message, entities);
    const complexity = scoreComplexity(message, entities, kbHits, convoContext);

    // ── Topic gap tracking (detect missing coverage for future KB expansion) ──
    const intentScore = detection.intentScore(message);
    detectAndRecordGaps(message, "llm", intentScore, kbHits, entities);

    // Rebuild with complexity-aware context if complex
    let finalMessages = messages;
    if (complexity >= 3) {
      const rebuilt = buildAugmentedMessages(SYSTEM_PROMPT, safeHistory, message, entities, complexity);
      finalMessages = rebuilt.messages;
    }

    // Inject temporal context if any meds/supps have temporal data
    const temporalBlock = buildTemporalContext(allEntityNames);
    if (temporalBlock) {
      finalMessages.splice(1, 0, { role: "system", content: temporalBlock });
    }

    // ── Cache check ──
    const systemPromptHash = crypto.createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);
    const cacheKey = buildCacheKey(message, systemPromptHash, "multi-provider");
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
      return res.status(200).json({ reply: cached, model: "cache", confidence: cacheConf });
    }

    // ── LLM call via provider router (Gemini → Groq → degraded) ──
    logGate("llm", message.length, hasConversation);

    if (process.env.NODE_ENV === "development") {
      const estTokens = Math.ceil(finalMessages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      console.log(`[TOKEN EST] ~${estTokens} input tokens | history: ${safeHistory.length} msgs | KB hits: ${kbHits} | complexity: ${complexity}`);
    }

    const llmResult = await callWithFallback(finalMessages, { complexity, entities, kbHits });

    if (llmResult.degraded) {
      emitAnalyticsEvent(buildAnalyticsEvent({
        route: "llm", scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: { safe: true, violations: [] }, source: "degraded", llmError: "all_providers_failed",
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult, clarifierTriggered: false,
        unknownDosedCount: unknownDosed.length, missingFields: [],
      }));
      const { confidence: degradedConf } = resolveConfidence("degraded", 0);
      return res.status(200).json({ reply: llmResult.text, model: "system:degraded", confidence: degradedConf });
    }

    let reply = llmResult.text || "I couldn't generate a response. Please try again.";

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

    // Dose-over-limit warnings
    reply = addDoseWarnings(reply, doses);

    // Form-specific recommendations (e.g., "oxide → try glycinate for sleep")
    for (const supp of (entities.supplements || [])) {
      const formRec = getFormRecommendation(convoContext, supp, entities);
      if (formRec) {
        reply = reply + "\n\n" + formRec;
        break; // One form rec per response to avoid clutter
      }
    }

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
      validationResult: llmValidation, source: llmResult.provider, llmError: null,
      clientIP, misspellingCount: corrections.length,
      brandResolved: !!brandResult, clarifierTriggered: false,
      unknownDosedCount: unknownDosed.length, missingFields: [],
    }));

    const { confidence: llmConf, label: llmConfLabel } = resolveConfidence("llm", kbHits, llmResult.provider);
    const response = { reply, model: llmResult.modelId, confidence: llmConf, _state: conversationState };
    if (process.env.NODE_ENV === "development") {
      response.usage = llmResult.usage;
      response._validation = llmValidation;
      response._confidence_label = llmConfLabel;
      response._kb_hits = kbHits;
      response._dose_summary = doseSummary;
      response._complexity = complexity;
      response._provider = llmResult.provider;
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error("Chat API Error:", error);
    if (error?.status === 429) return res.status(429).json({ error: "Our AI service is busy right now. Please try again in a few moments.", retryAfter: 30 });
    if (error?.status === 401) return res.status(500).json({ error: "Service configuration error. Please contact support." });
    return res.status(500).json({ error: "An unexpected error occurred. Please try again.", details: process.env.NODE_ENV === "development" ? String(error?.message || error) : undefined });
  }
};
