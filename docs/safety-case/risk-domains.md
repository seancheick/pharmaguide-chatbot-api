# Clinical Risk Domains

## Domain Registry

PharmaGuide monitors 15 clinical risk domains. Each domain has defined triggers, severity levels, and deterministic response routes.

**Policy version**: 1.0.0 (see `src/config/safetyPolicy.js`)

---

### 1. Serotonin Syndrome Risk

| Field | Value |
|-------|-------|
| Route | `system:serotonin-risk` / `system:serotonin-urgent` |
| Triggers | 5-HTP, St. John's Wort, tryptophan, rhodiola, psilocybin, SAMe |
| Co-triggers | SSRI, SNRI, MAOI, antidepressant |
| Severity 1 | Supplement present (yellow) — inform |
| Severity 2 | Combo detected (red) — warn and ask |
| Severity 3 | Symptoms active (red) — urgent escalation |

**Urgent escalation criteria**: User reports muscle rigidity, tremor, hyperthermia, agitation, or rapid heartbeat while on serotonergic combo.

---

### 2. Bleeding / Anticoagulant Risk

| Field | Value |
|-------|-------|
| Route | `system:blood-thinner-risk` |
| Triggers | Fish oil, turmeric/curcumin, ginkgo, vitamin E (high dose), garlic extract, dong quai |
| Co-triggers | Warfarin, heparin, Eliquis, Xarelto, Pradaxa, Plavix, aspirin |
| Severity 2 | Combo detected (red) — warn about increased bleeding risk |

---

### 3. Hepatotoxic Stacking Risk

| Field | Value |
|-------|-------|
| Route | `system:hepatotoxic-risk` |
| Triggers | Kava + another hepatotoxin (high-dose niacin, green tea extract, comfrey, black cohosh) |
| Severity 2 | Liver toxicity stack detected (red) |

---

### 4. Absorption Interference

| Field | Value |
|-------|-------|
| Route | `system:absorption-risk` |
| Triggers | Activated charcoal + any medication, grapefruit + CYP3A4 substrates |
| Severity 2 | Absorption interference detected (red) |

---

### 5. Pregnancy / Teratogen Risk

| Field | Value |
|-------|-------|
| Routes | `system:pregnancy-retinol`, `system:pregnancy-limited`, `system:isotretinoin-vita` |
| Triggers | Retinol/vitamin A (high dose), isotretinoin + vitamin A |
| Population | Pregnancy detected in message or conversation context |
| Severity 2-3 | Known teratogen exposure (red) |

---

### 6. Renal Clearance Risk

| Field | Value |
|-------|-------|
| Route | `system:renal-magnesium` |
| Triggers | Magnesium + kidney disease/CKD/dialysis |
| Severity 2 | Renal accumulation risk (red) |

---

### 7. Stimulant Stacking

| Field | Value |
|-------|-------|
| Route | `system:stimulant-risk` |
| Triggers | Caffeine pills/pre-workout + stimulant medications (Adderall, Ritalin, Vyvanse) |
| Severity 1 | Stimulant overlap (yellow) |

---

### 8. SSRI Discontinuation

| Field | Value |
|-------|-------|
| Route | `system:ssri-discontinuation` |
| Triggers | User mentions stopping/quitting SSRI and replacing with supplement |
| Key message | Do not stop SSRI without prescriber guidance; supplements are not replacements |

---

### 9. Potassium + ACE Inhibitor

| Field | Value |
|-------|-------|
| Route | `system:potassium-acei` |
| Triggers | Potassium supplement + ACE inhibitor (lisinopril, enalapril, ramipril) |
| Risk | Hyperkalemia |

---

### 10. Iodine + Thyroid Condition

| Field | Value |
|-------|-------|
| Route | `system:iodine-thyroid` |
| Triggers | Iodine/kelp + thyroid condition (hypothyroid, hyperthyroid, Hashimoto's, Graves') |
| Risk | Thyroid function disruption |

---

### 11. Niacin + Statin

| Field | Value |
|-------|-------|
| Route | `system:niacin-statin` |
| Triggers | High-dose niacin + statin medication |
| Risk | Increased myopathy/rhabdomyolysis risk |

---

### 12. Isotretinoin + Vitamin A

| Field | Value |
|-------|-------|
| Route | `system:isotretinoin-vita` |
| Triggers | Isotretinoin (Accutane) + vitamin A supplement |
| Risk | Vitamin A toxicity (hypervitaminosis A) |

---

### 13. Supplement Stacking

| Field | Value |
|-------|-------|
| Route | `system:stacking-risk` |
| Triggers | Prenatal/multivitamin + standalone fat-soluble vitamins (A, D, E, K) |
| Risk | Exceeding upper intake levels for fat-soluble vitamins |

---

### 14. Symptom Triage

| Field | Value |
|-------|-------|
| Route | `system:symptom-triage` |
| Triggers | Non-emergency symptoms (dizziness, nausea, rash, headache) + supplement/dose mention |
| Action | Advise stopping supplement and contacting prescriber |

---

### 15. Vitamin D + Palpitations

| Field | Value |
|-------|-------|
| Route | `system:vitd-palpitations` |
| Triggers | High-dose vitamin D (>10,000 IU) + heart symptoms (palpitations, racing heart) |
| Risk | Hypercalcemia-related cardiac effects |

---

## Severity Color Mapping

| Color | Criteria | Action |
|-------|----------|--------|
| Red | Any risk score >= 2, or emergency | Safety-only response (no LLM) |
| Yellow | Any risk score >= 1 | Safety-only response (no LLM) |
| Green | All scores 0 | LLM response |

## Route Priority Order

When multiple risk domains match, routes are evaluated in this priority order (highest first):

1. Emergency
2. Serotonin urgent (symptoms active)
3. Serotonin risk
4. Bleeding risk
5. SSRI discontinuation
6. Pregnancy retinol
7. Isotretinoin + vitamin A
8. Pregnancy limited evidence
9. Hepatotoxic risk
10. Absorption risk (charcoal, grapefruit)
11. Potassium + ACEi
12. Iodine + thyroid
13. Niacin + statin
14. Renal magnesium
15. Supplement stacking
16. Vitamin D + palpitations
17. Symptom triage
18. Stimulant risk
