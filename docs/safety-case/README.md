# PharmaGuide Safety Case

This directory contains the safety case documentation for PharmaGuide AI Chatbot — a supplement and medication interaction advisory system.

## Documents

| File | Purpose |
|------|---------|
| [safety-architecture.md](./safety-architecture.md) | Defense-in-depth architecture overview |
| [risk-domains.md](./risk-domains.md) | Clinical risk domains, severity levels, and routing |
| [validation-rules.md](./validation-rules.md) | Post-response safety validator rules |
| [threat-model.md](./threat-model.md) | Adversarial threat model and mitigations |
| [test-coverage.md](./test-coverage.md) | Test suite inventory and coverage map |

## Safety Policy Version

Current: **1.0.0** (defined in `src/config/safetyPolicy.js`)

## Key Safety Properties

1. **No diagnosing** — The system never diagnoses medical conditions
2. **No prescribing** — The system never prescribes medications
3. **No stop-med instructions** — The system never instructs users to stop prescribed medications
4. **No prohibited dosing** — No specific dosing for pregnancy or pediatric populations
5. **Deterministic safety gates** — High-risk scenarios use hardcoded replies, never LLM generation
6. **Defense-in-depth** — Post-response validator catches unsafe content even if gates miss it
7. **Emergency escalation** — Overdose, suicidal ideation, and acute symptoms route to 911/988 immediately
