# Test Coverage Map

## Test Suite Inventory

| Suite | File | Tests | Focus |
|-------|------|------:|-------|
| Full Suite | `test/full-suite.test.js` | 505 | Entity extraction, risk scoring, routing, gate detection, edge cases, adversarial inputs |
| Edge Cases | `test/edge-cases.test.js` | 171 | Boundary conditions, regex edge cases, multi-turn context, synonym handling |
| UX Scenarios | `test/ux-scenarios.test.js` | 36 | End-to-end user journey routing, conversation flows |
| Safety Harness | `test/safety-harness.test.js` | 50 | Structured clinical cases with route + reply content validation |
| Validator | `test/validator.test.js` | 39 | Post-response safety validator rules, gate reply integrity |
| Adversarial | `test/adversarial.test.js` | 65 | Prompt injection, role confusion, safety bypasses, context poisoning |
| **Total** | | **866** | |

## Coverage by Safety Layer

### Layer 1: Input Gates

| Gate | Test IDs | Count |
|------|----------|------:|
| Emergency | EMR-001/002, full-suite PART 2 | ~15 |
| Greeting | full-suite PART 3, ux-scenarios | ~10 |
| Thanks/Goodbye | full-suite PART 3, ux-scenarios | ~10 |
| Creative writing | ADV-CW-001/002/003, full-suite PART 10 | ~8 |
| Off-topic (intent) | full-suite PART 10, ux-scenarios, ADV-PI-004/005 | ~20 |

### Layer 2: Risk Triage

| Domain | Test IDs | Count |
|--------|----------|------:|
| Serotonin | SER-001/002/003, full-suite PART 4/5/6 | ~40 |
| Bleeding | BLD-001/002, full-suite PART 4/5 | ~25 |
| Hepatotoxic | HEP-001/002/003, full-suite PART 7 | ~15 |
| Absorption | ABS-001/002, full-suite PART 7 | ~12 |
| Pregnancy | PRG-001/002/003, full-suite PART 8 | ~20 |
| Renal | RNL-001, full-suite PART 9 | ~8 |
| Stimulant | STM-001/002, full-suite PART 5 | ~10 |
| SSRI discontinuation | DIS-001/002, full-suite PART 5 | ~8 |
| Potassium+ACEi | POT-001, full-suite PART 9 | ~6 |
| Iodine+thyroid | IOD-001, full-suite PART 9 | ~6 |
| Niacin+statin | NIA-001, full-suite PART 9 | ~6 |
| Supplement stacking | STK-001/002, full-suite PART 8 | ~12 |
| Vitamin D+palpitations | VTD-001, full-suite PART 6 | ~5 |
| Symptom triage | SYM-001, full-suite PART 6 | ~8 |

### Layer 3: LLM Generation

| Aspect | Coverage |
|--------|----------|
| System prompt adherence | Tested via `test/llm-behavior.test.js` (requires `GEMINI_API_KEY` and/or `GROQ_API_KEY`; runs against whichever provider is in the chain) |
| Post-processing (disclaimers) | full-suite PART 11, edge-cases |
| Mineral spacing injection | full-suite mineral spacing tests |
| Single question enforcement | full-suite, edge-cases |

### Layer 4: Post-Response Validator

| Rule | Test IDs | Count |
|------|----------|------:|
| No diagnosing | ADV-VAL-001/002/003/004, validator tests | ~8 |
| No stop-medication | ADV-VAL-008/009/010/011, validator tests | ~8 |
| No prohibited dosing | ADV-VAL-012/013/014, validator tests | ~6 |
| No excessive questions | validator tests | ~4 |
| No prescribing | ADV-VAL-005/006/007, validator tests | ~6 |
| Length limit | ADV-VAL-015, validator tests | ~2 |
| No empty safety | ADV-VAL-016/017, validator tests | ~4 |
| Gate reply integrity | ADV-GR-*, validator gate tests | ~30 |

### Adversarial Coverage

| Threat | Test IDs | Count |
|--------|----------|------:|
| Prompt injection | ADV-PI-001 to 005 | 5 |
| Role confusion | ADV-RC-001 to 005 | 5 |
| Safety bypass framing | ADV-SB-001 to 005 | 5 |
| Embedded injection | ADV-EI-001 to 004 | 4 |
| Context poisoning | ADV-MP-001 to 003 | 3 |
| Delimiter injection | ADV-DI-001 to 003 | 3 |
| Creative bypass | ADV-CW-001 to 003 | 3 |
| History sanitization | ADV-HS-001 to 003 | 3 |

## Running Tests

```bash
# All gate/routing tests (no API key needed)
node test/full-suite.test.js
node test/edge-cases.test.js
node test/ux-scenarios.test.js
node test/safety-harness.test.js
node test/validator.test.js
node test/adversarial.test.js

# LLM behavior tests (requires GEMINI_API_KEY and/or GROQ_API_KEY)
node test/llm-behavior.test.js
```

## Coverage Gaps

| Area | Status | Notes |
|------|--------|-------|
| Novel supplements not in ENTITY_PATTERNS | Gap | Falls through to LLM; no gate protection |
| Misspelled medication names beyond synonym map | Gap | Limited synonym coverage |
| Non-English inputs | Gap | All detection is English-only |
| Image/file uploads | N/A | Text-only API |
| Rate limiting behavior | Partial | Tested in integration, not unit tests |
| LLM provider failure modes (Gemini + Groq) | Partial | Error handling tested per provider; transparent chain failover covered by wellness-queries.test.js + adversarial tests. Not all 429/500/timeout permutations exercised in CI. |
