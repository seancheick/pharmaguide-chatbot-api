# Threat Model

## Scope

PharmaGuide is a supplement and medication interaction advisory chatbot. It is **not** a prescribing system, diagnostic tool, or electronic health record. The threat model focuses on risks where the system could cause harm through unsafe health information.

## Threat Categories

### T1: Prompt Injection — System Prompt Extraction

**Risk**: Attacker extracts the system prompt to understand safety rules and craft bypasses.

**Mitigations**:
- System prompt extraction attempts without medical intent are routed to off-topic (intent score < 2)
- Meta-question regex detects "system prompt", "reveal", "previous instructions" and allows them through to LLM (which is instructed to refuse)
- Even if the system prompt is extracted, safety gates are **deterministic** and cannot be bypassed by prompt manipulation — they run before the LLM

**Test coverage**: ADV-PI-001 through ADV-PI-005

---

### T2: Role Confusion / Identity Override

**Risk**: Attacker convinces the LLM it is a doctor, pharmacist, or unrestricted AI.

**Mitigations**:
- "Pretend you", "act as", "you are now" detected by meta-question regex → routed to LLM (which refuses)
- Post-response validator catches prescribing language ("I am prescribing") and diagnosing language ("you have diabetes") regardless of how the LLM was prompted
- Gate replies are hardcoded strings — they cannot be influenced by role confusion

**Test coverage**: ADV-RC-001 through ADV-RC-005

---

### T3: Safety Bypass via Framing

**Risk**: Attacker frames unsafe requests as hypothetical, educational, or constrained ("just say yes or no").

**Mitigations**:
- "Without restrictions", "answer yes/no" detected by meta-question regex
- If the framed message contains real risk triggers (e.g., blood thinner + supplement), the risk triage pipeline fires regardless of framing
- Post-response validator catches unsafe outputs even if framing tricks the LLM

**Test coverage**: ADV-SB-001 through ADV-SB-005

---

### T4: Injection Embedded in Real Queries

**Risk**: Attacker embeds injection text alongside genuine clinical questions, hoping the injection overrides safety behavior.

**Mitigations**:
- Risk triage pipeline (Layer 2) uses regex on the full message including injection text — clinical triggers still fire
- Entity extraction is keyword-based, not LLM-based — injection text doesn't suppress extraction
- Emergency detection always runs first and cannot be bypassed

**Test coverage**: ADV-EI-001 through ADV-EI-004

---

### T5: Multi-Turn Context Poisoning

**Risk**: Attacker sends injection instructions in earlier messages, hoping they influence later responses.

**Mitigations**:
- `sanitizeHistory()` filters out non-user/assistant roles (blocks injected "system" messages)
- History is capped at 10 messages and 1000 chars per message
- Risk scoring uses conversation context (last 3 user messages) — this increases detection, not decreases it
- Gate decisions are based on current message + conversation context entities, not on assistant responses

**Test coverage**: ADV-MP-001 through ADV-MP-003, ADV-HS-001 through ADV-HS-003

---

### T6: Creative Writing Bypass

**Risk**: Attacker uses creative writing framing ("write a story about stopping medications") to elicit unsafe content.

**Mitigations**:
- Creative writing regex detects "write me/compose/create a [poem/song/story/etc.]" → off-topic route
- This gate fires before risk triage and LLM, so no creative content is generated

**Test coverage**: ADV-CW-001 through ADV-CW-003

---

### T7: Delimiter / Encoding Injection

**Risk**: Attacker uses markdown code blocks, HTML tags, or unicode to bypass detection.

**Mitigations**:
- `normalizeText()` strips non-alphanumeric characters, lowercases, and applies synonym mapping
- Entity extraction and risk scoring operate on normalized text
- HTML/markdown injection in messages is rendered as plain text (no execution context)

**Test coverage**: ADV-DI-001 through ADV-DI-003

---

### T8: Unsafe LLM Generation

**Risk**: Despite the system prompt, the LLM generates diagnosing, prescribing, or stop-medication content.

**Mitigations**:
- Post-response safety validator (Layer 4) checks every LLM response against 7 rules
- Violations trigger replacement with `SAFE_FALLBACK_REPLY`
- Temperature 0.45 reduces creative/risky outputs
- Max tokens 650 limits response length
- System prompt explicitly forbids these patterns

**Test coverage**: ADV-VAL-001 through ADV-VAL-019

---

### T9: PHI Leakage in Logs

**Risk**: Audit logs or error messages expose user health information.

**Mitigations**:
- `buildAuditEntry()` includes entity **counts** only, never names
- Raw messages are never logged
- Error responses in production omit `details` field
- Debug fields (`_scores`, `_entities`, `_validation`) gated to `NODE_ENV === "development"`

---

### T10: Rate Limiting Bypass

**Risk**: Attacker sends high-volume requests to exhaust API quota or extract information.

**Mitigations**:
- Upstash Redis rate limiting (with in-memory fallback)
- IP-based rate limiting via `x-forwarded-for` header
- 429 responses include `retryAfter` for well-behaved clients

## Residual Risks

| Risk | Severity | Status |
|------|----------|--------|
| LLM hallucinates a plausible but incorrect interaction | Medium | Mitigated by gate system (high-risk combos never reach LLM) but low-risk combos rely on LLM accuracy |
| Novel supplement not in entity patterns | Low | Falls through to LLM with system prompt guidance; no gate protection |
| Coordinated adversarial campaign discovering new bypasses | Low | Regex-based detection has known limitations; periodic review needed |
| Upstream model change (Gemini 2.5 Flash primary, Groq Llama 3.3 70B fallback) alters behavior | Medium | Multi-provider chain in `src/infra/providerRouter.js` plus per-provider circuit breakers absorb single-provider drift; system prompt is model-agnostic. Gemini 2.5 Flash + 2.5 Flash-Lite shut down 2026-10-16 — track Google's deprecation schedule. |
