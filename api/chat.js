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
const { rulesetTag, systemPromptHash } = require("../src/infra/provenance");
const { promptMode, buildSystemPrompt, promptHash } = require("../src/core/promptAssembly");
const { normalizeText } = require("../src/core/normalize");
const { sanitizeHistory, getConversationContext, extractConversationState, mergeStateIntoEntities } = require("../src/core/history");
const { extractEntities, extractKnownItems } = require("../src/core/entities");
const { scoreRisks } = require("../src/core/riskScore");
const { routeByRisk } = require("../src/core/router");
const detection = require("../src/gates/detection");
const { ROUTE_REPLY_MAP, emergencyReply, premiumWelcomeReply, premiumThanksReply, premiumGoodbyeReply, offTopicReply, flirtyDeflectReply, flirtyRepeatReply, flirtyFinalReply, whatIsReply, privacyReply, depletionReply, creatorReply, petQuestionReply, businessInquiryReply, medicalConditionRedirectReply } = require("../src/gates/replies");
const { getFormRecommendation } = require("../src/core/formAdvisor");
const { checkRateLimit } = require("../src/infra/rateLimit");
const { isTrustedProxy, proxyEnforcement, forwardedClientIp } = require("../src/infra/proxyAuth");
const { logGate } = require("../src/infra/logger");
const { mineralSpacingNote, stripModelSpacingAdvice, enforceOneQuestion, addDoseWarnings, stripMarkdownLinks, stripUnverifiedCitations } = require("../src/postprocess");
const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");
const { classifyEntities } = require("../src/core/entityClassifier");
const { correctMisspellings, resolveBrandName, detectUnknownDosedItems } = require("../src/core/unknownResolver");
const { findMissingFields } = require("../src/core/requiredFields");
const { recordAnalytics } = require("../src/infra/analytics");
const { buildCacheKey, isCacheable, getCachedResponse, setCachedResponse } = require("../src/infra/responseCache");
const { callWithFallback, scoreComplexity } = require("../src/infra/providerRouter");
const { buildAugmentedMessages } = require("../src/core/kbLookup");
const { findInteractions, recordBlock, RECORD_ID } = require("../src/core/pipelineInteractions");
const { extractDoses, getDoseSummary } = require("../src/core/doseExtractor");
const { resolveConfidence } = require("../src/core/confidence");
const { detectAndRecordGaps } = require("../src/infra/topicTracker");
const { buildTemporalContext } = require("../src/core/temporalContext");

function getClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim().length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Once enforcement is on, only the website's proxy (which holds the shared secret) may call.
  const trustedProxy = isTrustedProxy(req);
  if (!trustedProxy && proxyEnforcement()) return res.status(401).json({ error: "Unauthorized" });
  res.setHeader("X-PG-Ruleset", rulesetTag());

  // On Vercel `req.body` is parsed lazily and throws on malformed JSON.
  let body;
  try {
    body = req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  const message = body.message;
  if (!message || typeof message !== "string") return res.status(400).json({ error: "Message is required" });
  if (message.length > 2000) return res.status(400).json({ error: "Message too long. Please keep it under 2000 characters." });

  // ── 1. Emergency (instant) ──
  // Answered BEFORE the rate limiter: the limiter talks to an external
  // service, and an outage there must never delay or block an emergency reply.
  if (detection.isEmergency(message)) {
    logGate("system:emergency", message.length, false);
    return res.status(200).json({ reply: emergencyReply(), model: "system:emergency" });
  }

  // Behind the proxy every request arrives from the proxy's own address, so the visitor's
  // address is taken from the header the proxy sets, and only when the secret checks out.
  const clientIP = (trustedProxy && forwardedClientIp(req)) || getClientIP(req);
  const rl = await checkRateLimit(clientIP);
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
    return res.status(429).json({ error: "Too many requests. Please wait a moment before trying again.", retryAfter });
  }

  try {
    const requestStart = Date.now();
    const history = body.history || [];

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
    if (detection.isWhatIsQuestion(message)) {
      logGate("system:what-is", message.length, hasConversation);
      return res.status(200).json({ reply: whatIsReply(), model: "system:what-is" });
    }
    if (detection.isPrivacyQuestion(message)) {
      logGate("system:privacy", message.length, hasConversation);
      return res.status(200).json({ reply: privacyReply(), model: "system:privacy" });
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

    // ── 3c. Wellness-goal detection (BEFORE off-topic gate) ─────────
    // First-message wellness queries like "to reduce my stress" or
    // "how do I lower my cholesterol naturally" must NOT trip the
    // off-topic gate — they belong in the LLM path with KB grounding.
    // The detected goals are carried forward to bypass off-topic +
    // medical-condition-redirect, and to inject goal-specific KB
    // candidates when the user named a goal but no specific supplement.
    const wellnessGoals = detection.detectWellnessGoal(message);
    const hasWellnessIntent = wellnessGoals.length > 0;

    // ── 4. Off-topic (first message, intent scorer) ──
    const isCreativeRequest = /\b(write me|write a|compose|create a|make a|generate a|give me a)\b.{0,20}\b(poem|song|story|essay|rap|haiku|limerick|joke|riddle)\b/.test(normalizeText(message));
    if (isCreativeRequest) {
      logGate("system:off-topic", message.length, hasConversation);
      return res.status(200).json({ reply: offTopicReply(), model: "system:off-topic" });
    }
    const isMetaQuestion = /\b(you.?re ai|are you ai|how do i know|can i trust|are you accurate|how accurate|who built|who made|how does this work|what are you|reveal|system prompt|safety rules|previous instructions|prescribing authority|pretend you|act as|you are now|ignore .{0,20}(instruct|safety|rules)|stop follow|answer (yes|no)|without restrict|testing .{0,10}(ai|model|chatbot)|test.*model|better than google|trust (your|this|these) answers?|is ai safe|is this (safe|reliable|trustworthy)|can i actually trust|is this a scam|i don.?t trust|should i trust)\b/.test(normalizeText(message));
    // Only block truly off-topic first messages (jokes, random chat).
    // Let through if: wellness intent detected, any supplement/med mentioned, or intent >= 2.
    const quickEntities = extractEntities(message, normalizeText(message));
    const hasAnyEntity = (quickEntities.meds?.length || 0) + (quickEntities.supplements?.length || 0) > 0;
    if (!hasConversation && !isMetaQuestion && !hasWellnessIntent && !hasAnyEntity && detection.intentScore(message) < 2) {
      logGate("system:off-topic", message.length, hasConversation);
      return res.status(200).json({ reply: offTopicReply(), model: "system:off-topic" });
    }

    // ── 4b. Medical condition redirect (first message, no supplement/interaction intent) ──
    // Wellness-goal queries also bypass — the goal IS the supplement intent.
    if (!hasConversation && !hasWellnessIntent && detection.isMedicalConditionQuery(message)) {
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
    // ── Depletion check (before triage — grounded, structured answers) ──
    if (detection.isDepletionQuestion(message) && entities.meds.length > 0) {
      const deplReply = depletionReply(convoContext);
      if (deplReply) {
        logGate("system:depletion", message.length, hasConversation);
        return res.status(200).json({
          reply: deplReply,
          model: "system:depletion",
          confidence: "high",
          _state: conversationState,
        });
      }
    }

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
      // One owner of reply text: replies.js. (gates.json holds gate metadata only.)
      gateReply = ROUTE_REPLY_MAP[triageRoute](convoContext, message, entities);
      const validation = validateResponse(gateReply, triageRoute, entities, null);
      if (!validation.safe) {
        // Production-visible so regressions in gate replies are
        // debuggable from Vercel logs without redeploying.
        console.warn(
          `[VALIDATOR] Gate ${triageRoute} rejected:`,
          (validation.violations || []).map((v) => v.rule)
        );
        gateReply = validation.fallback;
      }

      // ── Analytics (gate path) ──
      recordAnalytics({
        route: triageRoute, scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: validation, source: "gate", llmError: null,
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult,
        clarifierTriggered: triageRoute === "system:clarifier",
        unknownDosedCount: unknownDosed.length,
        missingFields,
      });

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

    // Build KB-augmented messages (need kbHits for complexity scoring).
    // wellnessGoals is passed so goal-only queries ("what can I take
    // to sleep better") still get grounded KB candidates injected.
    // Pre-compute complexity hint for KB context depth
    let complexityHint = scoreComplexity(message, entities, 0, convoContext);
    if (hasWellnessIntent) complexityHint = Math.min(5, complexityHint + 1);

    // PG_PROMPT_MODE (default "full"): which sections of the system prompt this question needs.
    const mode = promptMode();
    const slimPrompt = mode === "full" ? null : buildSystemPrompt({ message, history: safeHistory, entities, mode: "selective" });

    // Verified pipeline records for any two agents the conversation names (src/core/pipelineInteractions.js).
    const pipelineRecords = findInteractions([...safeHistory.filter((m) => m.role === "user").map((m) => m.content), message].join("\n"));

    const { messages, kbHits } = buildAugmentedMessages(
      mode === "selective" ? slimPrompt : SYSTEM_PROMPT,
      safeHistory,
      message,
      entities,
      { complexity: complexityHint, wellnessGoals, pipelineRecords }
    );
    const complexity = scoreComplexity(message, entities, kbHits, convoContext);

    // ── Topic gap tracking (detect missing coverage for future KB expansion) ──
    const intentScore = detection.intentScore(message);
    detectAndRecordGaps(message, "llm", intentScore, kbHits, entities);

    let finalMessages = messages;

    // Inject conversation state so LLM knows persistent patient facts
    if (conversationState.populations.length > 0 || conversationState.conditions.length > 0) {
      const stateParts = [];
      if (conversationState.populations.length > 0) {
        stateParts.push("Patient context: " + conversationState.populations.join(", "));
      }
      if (conversationState.conditions.length > 0) {
        stateParts.push("Known conditions: " + conversationState.conditions.join(", "));
      }
      finalMessages.splice(1, 0, { role: "system", content: "PATIENT PROFILE (from conversation history): " + stateParts.join(". ") + ". Factor this into your response." });
    }

    // Inject temporal context if any meds/supps have temporal data
    const temporalBlock = buildTemporalContext(allEntityNames);
    if (temporalBlock) {
      finalMessages.splice(1, 0, { role: "system", content: temporalBlock });
    }

    // The verified records: the model explains them and must not contradict them. Inserted last, so
    // they sit right after the system prompt.
    if (pipelineRecords.length > 0) {
      finalMessages.splice(1, 0, { role: "system", content: pipelineRecords.map(recordBlock).join("\n\n") });
    }

    // ── Cache check ──
    const cacheKey = buildCacheKey(message, mode === "selective" ? promptHash(slimPrompt) : systemPromptHash, "multi-provider");
    // Read the cache only for requests that would also be allowed to WRITE it: the
    // entry is keyed on the message alone, so a pregnant user's follow-up must never be
    // answered with a stranger's generic reply to the same words.
    const cacheEligible = isCacheable(message, entities, hasConversation, null, "llm", scores);
    const cached = cacheEligible ? getCachedResponse(cacheKey) : null;
    if (cached) {
      logGate("llm", message.length, hasConversation);
      recordAnalytics({
        route: "llm", scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: { safe: true, violations: [] }, source: "cache", llmError: null,
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult, clarifierTriggered: false,
        unknownDosedCount: unknownDosed.length, missingFields: [],
      });
      const { confidence: cacheConf } = resolveConfidence("cache", 0);
      return res.status(200).json({ reply: cached, model: "cache", confidence: cacheConf, _state: conversationState });
    }

    // ── LLM call via provider router (Gemini → Groq → degraded) ──
    logGate("llm", message.length, hasConversation);

    if (process.env.NODE_ENV === "development") {
      const estTokens = Math.ceil(finalMessages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      console.log(`[TOKEN EST] ~${estTokens} input tokens | history: ${safeHistory.length} msgs | KB hits: ${kbHits} | complexity: ${complexity}`);
    }

    const llmResult = await callWithFallback(finalMessages, { complexity, entities, kbHits, ...(mode === "fallback" ? { slimSystemPrompt: slimPrompt } : {}) });

    if (llmResult.degraded) {
      recordAnalytics({
        route: "llm", scores, entities, message, safeHistory,
        latencyMs: Date.now() - requestStart,
        validationResult: { safe: true, violations: [] }, source: "degraded", llmError: "all_providers_failed",
        clientIP, misspellingCount: corrections.length,
        brandResolved: !!brandResult, clarifierTriggered: false,
        unknownDosedCount: unknownDosed.length, missingFields: [],
      });
      const { confidence: degradedConf } = resolveConfidence("degraded", 0);
      const degradedPayload = {
        reply: llmResult.text,
        model: "system:degraded",
        confidence: degradedConf,
      };
      // Provider names and raw upstream error text are for developers only: in
      // production they reach the visitor's browser. The same detail is in the
      // [PROVIDER] log lines.
      if (process.env.NODE_ENV === "development") {
        degradedPayload._provider_failures = llmResult._failures || [];
        degradedPayload._providers_skipped = llmResult._skipped || [];
      }
      return res.status(200).json(degradedPayload);
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

    // Internal pipeline record ids are not sources a reader can look up.
    reply = reply.replace(RECORD_ID, "");
    // Citations: only references verified against PubMed (or listed regulatory sources) survive.
    reply = stripUnverifiedCitations(reply);

    // Strip Markdown link syntax (frontend doesn't render Markdown)
    reply = stripMarkdownLinks(reply);

    // Mineral spacing
    if (detection.mentionsMineralSpacingTrigger(message)) {
      reply = stripModelSpacingAdvice(reply);
      reply = reply + "\n\n" + mineralSpacingNote();
    }

    // Single question enforcement
    reply = enforceOneQuestion(reply);

    // Optional decorators: a failure in one of these must never turn a
    // finished answer into a 500 (a malformed KB entry once did exactly that).
    try {
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
    } catch (decoratorError) {
      console.warn("[POSTPROCESS] optional decorator failed:", decoratorError && decoratorError.message);
    }

    // Post-response safety validation. Two outcomes:
    //   • safe: replace `reply` with the sanitized version (URL strip
    //     + tidy artifacts) so the user sees a clean answer.
    //   • unsafe: log the violations (always — not just dev) so we can
    //     see what's failing in prod logs, then fall back to the
    //     generic safe reply.
    const llmValidation = validateResponse(reply, "llm", entities, null);
    if (llmValidation.safe) {
      if (llmValidation.sanitizedReply && llmValidation.sanitizedReply !== reply) {
        reply = llmValidation.sanitizedReply;
      }
      // Non-blocking violations (e.g. stripped URLs) still get logged.
      const nonBlocking = (llmValidation.violations || []).filter((v) => v.nonBlocking);
      if (nonBlocking.length > 0) {
        console.warn("[VALIDATOR] LLM response sanitized:", nonBlocking.map((v) => v.rule));
      }
    } else {
      // Production-visible: log the rules that fired so regressions are
      // debuggable from Vercel logs without rebuilding. Never the user's text.
      console.warn(
        "[VALIDATOR] LLM response rejected:",
        (llmValidation.violations || []).map((v) => v.rule),
        "| message_length:",
        message.length
      );
      reply = llmValidation.fallback;
    }

    // ── Cache store (only if safe and cacheable) ──
    // An answer written from the slim fallback prompt is not stored under the full prompt's key.
    const slimServed = mode === "fallback" && llmResult.provider === "groq";
    if (!slimServed && isCacheable(message, entities, hasConversation, llmValidation, "llm", scores)) {
      setCachedResponse(cacheKey, reply);
    }

    // ── Analytics (LLM path) ──
    recordAnalytics({
      route: "llm", scores, entities, message, safeHistory,
      latencyMs: Date.now() - requestStart,
      validationResult: llmValidation, source: llmResult.provider, llmError: null,
      clientIP, misspellingCount: corrections.length,
      brandResolved: !!brandResult, clarifierTriggered: false,
      unknownDosedCount: unknownDosed.length, missingFields: [],
    });

    const { confidence: llmConf, label: llmConfLabel } = resolveConfidence("llm", kbHits, llmResult.provider);
    const response = { reply, model: llmResult.modelId, confidence: llmConf, _state: conversationState };
    if (process.env.NODE_ENV === "development") {
      response.usage = llmResult.usage;
      response._validation = llmValidation;
      response._confidence_label = llmConfLabel;
      response._kb_hits = kbHits;
      response._pipeline_records = pipelineRecords.map((r) => r.id);
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
