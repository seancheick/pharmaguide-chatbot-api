const { normalizeText } = require("../core/normalize");
const detection = require("./detection");
const { getSafeItemClarification, getRenalFormNote, getFormGuidance } = require("../core/formAdvisor");

function emergencyReply() {
  return [
    "This sounds like it could be a medical emergency.",
    "",
    "• **Call 911** (U.S.) or your local emergency number immediately.",
    "• **Poison Control (U.S.):** 1-800-222-1222",
    "• **Suicide & Crisis Lifeline (U.S.):** call or text **988**",
    "• **Crisis Text Line:** text **HOME** to **741741**",
    "",
    "Do not wait — get help now. I'm an educational tool and cannot provide emergency care.",
  ].join("\n");
}

function premiumWelcomeReply() {
  return [
    "Hi — I'm PharmaGuide AI. I can help you quickly sanity-check supplements, meds, and interactions.",
    "",
    "Try one of these:",
    '• **Interaction check:** "Can I take magnesium glycinate with sertraline?"',
    '• **Timing:** "When should I take iron vs. calcium?"',
    '• **Safety / side effects:** "Is creatine safe with kidney issues?"',
    "",
    "Next step: tell me **(1)** what you're taking and **(2)** your goal (sleep, energy, anxiety, etc.).",
  ].join("\n");
}

function premiumThanksReply() {
  return [
    "You're welcome.",
    "",
    "If you want, tell me the **exact product/form + dose** (and any meds) and I'll help you double-check interactions and timing.",
  ].join("\n");
}

function premiumGoodbyeReply() {
  return [
    "All set — take care.",
    "",
    "If anything changes (new meds, symptoms, pregnancy, etc.), it's worth re-checking interactions.",
  ].join("\n");
}

function offTopicReply() {
  return [
    "I'm built specifically for **supplements, medications, and interactions** — that's where I'm most accurate.",
    "",
    "Try asking something like:",
    '• "Can I take magnesium with my blood pressure medication?"',
    '• "What time should I take vitamin D?"',
    '• "Is ashwagandha safe long-term?"',
  ].join("\n");
}

function serotonergicWarningReply(convoContext) {
  const t = normalizeText(convoContext);

  const has5HTP = /\b5[\s-]?htp\b/.test(t);
  const hasStJohns = /\bst\.?\s*john/.test(t);
  const hasRhodiola = /\brhodiola\b/.test(t);
  const hasTryptophan = /\btryptophan\b/.test(t);
  const hasPsilocybin = /\b(psilocybin|mushroom\s*micro\s*dos)\b/.test(t);

  const triggers = [];
  if (has5HTP) triggers.push("5-HTP");
  if (hasStJohns) triggers.push("St. John's Wort");
  if (hasRhodiola) triggers.push("rhodiola");
  if (hasTryptophan) triggers.push("tryptophan");
  if (hasPsilocybin) triggers.push("psilocybin");
  const triggerList = triggers.join(", ");

  const namedAD = t.match(/\b(sertraline|sertaline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|venlafaxine|effexor|bupropion|wellbutrin|duloxetine|cymbalta|trazodone|mirtazapine|paroxetine|paxil|fluvoxamine|desvenlafaxine|pristiq|phenelzine|tranylcypromine|selegiline)\b/);
  const complex = detection.isComplexStack(convoContext);

  const lines = [];

  if (namedAD) {
    lines.push(`Combining **${triggerList}** with **${namedAD[0]}** is **🔴 high risk**. These all affect serotonin, and stacking them increases the chance of serotonin syndrome — a potentially dangerous condition *(Boyer & Shannon, NEJM 2005)*.`);
  } else {
    lines.push(`Combining **${triggerList}** with antidepressants (especially SSRIs/SNRIs/MAOIs) is **🔴 high risk** — it can push serotonin too high (serotonin syndrome) *(Boyer & Shannon, NEJM 2005)*.`);
  }

  lines.push("");

  if (hasRhodiola) {
    lines.push("• **Rhodiola** has MAO-modulating and serotonergic properties — it's not as strong as 5-HTP, but it adds to the serotonin load when combined with an SSRI" + (has5HTP ? " and 5-HTP." : "."));
  }

  // Form-specific clarification: safe items in the stack
  const safeClarification = getSafeItemClarification(convoContext);
  if (safeClarification) {
    lines.push(safeClarification);
  }

  lines.push(
    "• **Avoid this combination** unless your prescriber has specifically approved it.",
    "• Warning signs of serotonin syndrome: agitation, sweating, tremor, fast heartbeat, diarrhea, fever, confusion. **Seek urgent care if these occur.**"
  );

  const hasStimulantMed = detection.mentionsStimulantMed(convoContext);
  const hasStimulantSupp = detection.mentionsStimulantSupp(convoContext);
  if (hasStimulantMed && hasStimulantSupp) {
    lines.push("• **Also watch overstimulation:** stimulants + rhodiola/caffeine can raise HR/BP, worsen anxiety/insomnia. This is usually 🟡 (monitor/adjust), but it stacks on top of the serotonin concern.");
  }

  if (complex) {
    lines.push("", "You've listed a complex stack — the serotonin risk is the **most urgent flag**, but the rest of your supplements also deserve a closer look. Once we resolve this, I can review the other items one by one.");
  }

  lines.push("");
  if (namedAD) {
    lines.push(`Worth telling your prescriber: *"I've been taking ${triggerList} alongside ${namedAD[0]} — should I stop any of these?"*`);
  } else {
    lines.push("**Which antidepressant** are you taking (name + dose if you know it)?");
  }

  return lines.join("\n");
}

function serotonergicUrgentReply() {
  return [
    "**You're describing symptoms that could be serotonin syndrome.** This is a medical situation that needs attention now — not later.",
    "",
    "**What to do right now:**",
    "• **Call your prescriber immediately** or go to **urgent care / ER**.",
    "• **Stop the serotonergic supplement** (5-HTP, St. John's Wort, etc.) — do not take another dose.",
    "• If symptoms worsen (high fever, seizures, loss of consciousness), **call 911**.",
    "",
    "Symptom checklist for serotonin syndrome:",
    "• Agitation, restlessness, confusion",
    "• Sweating, shivering, tremor, muscle twitching or rigidity",
    "• Rapid heartbeat, diarrhea, fever",
    "",
    "**Do not wait for symptoms to get worse.** This is time-sensitive.",
  ].join("\n");
}

function bloodThinnerWarningReply(convoContext) {
  const t = normalizeText(convoContext);

  const hasNattokinase = /\bnattokinase\b/.test(t);
  const hasTurmeric = /\b(turmeric|curcumin)\b/.test(t);
  const hasGinkgo = /\bginkgo\b/.test(t);
  const hasFishOil = /\b(fish oil|omega.?3)\b/.test(t);
  const hasGarlic = /\bgarlic\b/.test(t);
  const hasGinger = /\bginger\b/.test(t);
  const hasVitE = /\bvitamin e\b/.test(t);

  const lines = [];

  if (hasNattokinase) {
    lines.push("**🔴 Nattokinase + blood thinner is HIGH risk.** Nattokinase has direct fibrinolytic (clot-dissolving) activity *(Sumi et al., Experientia 1987)* — this is NOT a mild food-level interaction. Combined with a blood thinner, the bleeding risk is serious.");
    lines.push("");
  }

  if (hasTurmeric || hasGinkgo) {
    const items = [];
    if (hasTurmeric) items.push("turmeric/curcumin");
    if (hasGinkgo) items.push("ginkgo");
    lines.push(`**🟡–🔴 ${items.join(" and ")}** at supplement doses have antiplatelet effects that add to your blood thinner's action. Culinary amounts of turmeric in food are generally fine — **extract/capsule doses are the concern**.`);
    lines.push("");
  }

  if (hasFishOil || hasGarlic || hasGinger || hasVitE) {
    const mild = [];
    if (hasFishOil) mild.push("fish oil");
    if (hasGarlic) mild.push("garlic");
    if (hasGinger) mild.push("ginger");
    if (hasVitE) mild.push("vitamin E");
    lines.push(`**🟡 ${mild.join(", ")}** have milder antiplatelet effects. At typical doses the risk is low–moderate, but it stacks with the others and your blood thinner.`);
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("Combining **supplements with antiplatelet/anticoagulant effects** with blood thinners can be **🟡 moderate to 🔴 high risk** depending on the specific items and doses.");
    lines.push("");
  }

  lines.push(
    "• Watch for: unusual bruising, prolonged bleeding from cuts, blood in urine/stool, nosebleeds.",
    "• **Do not start or stop** any of these without telling your prescriber.",
    "",
    "Worth telling your prescriber: *\"I want to take [supplement names] — is that safe with my blood thinner?\"*"
  );

  return lines.join("\n");
}

function symptomTriageReply() {
  return [
    "You're describing symptoms that are worth paying attention to.",
    "",
    "**If any of these apply, seek urgent care or call your prescriber now:**",
    "• Chest pain, fainting, severe shortness of breath, throat swelling, or confusion.",
    "",
    "**If it's milder but new since starting a supplement:**",
    "• **Pause the supplement** until you've spoken to your prescriber or pharmacist.",
    "• Stay hydrated and avoid caffeine or stimulants until you've checked in.",
    "",
    "What would help me give better guidance: **which supplement/medication did you recently start or change, and when did the symptoms begin?**",
  ].join("\n");
}

function vitaminDPalpitationsReply(text) {
  const confirmedDeficiency = detection.mentionsDeficiency(text);
  const opening = confirmedDeficiency
    ? "50,000 IU/week is a **common loading protocol** for vitamin D deficiency when supervised by a provider — the dose itself isn't unusual."
    : "50,000 IU/week is sometimes prescribed short-term for deficiency, but the dose should match your lab results and be supervised by a provider.";

  return [
    opening + " That said, a racing heart after taking it is **something to take seriously**.",
    "",
    "**If you have chest pain, fainting, shortness of breath, or it doesn't stop** — seek urgent care or call your prescriber now.",
    "",
    "If it's brief and only happens around the dose:",
    "• There are several possible contributors — caffeine, dehydration, thyroid changes, electrolyte shifts, stimulants, or individual sensitivity. **I can't determine the cause here.**",
    "• Consider **not taking another high dose until you've checked in** with whoever prescribed it.",
    "",
    "Worth telling your prescriber: *\"My heart races after I take the 50,000 IU vitamin D — should we adjust the dose or check anything?\"*",
    "",
    "**What else are you taking** (caffeine, preworkout, decongestants, thyroid meds, other supplements)?",
  ].join("\n");
}

function pregnancyRetinolReply() {
  return [
    "**🔴 Preformed vitamin A (retinol) during pregnancy needs careful attention.** Excess retinol — especially in the first trimester — is linked to birth defects *(Rothman et al., NEJM 1995)*. The safe upper limit is **3,000 mcg/day (10,000 IU)** of preformed retinol.",
    "",
    "• Beta-carotene (plant-based vitamin A) is generally considered safer because your body regulates conversion.",
    "• Cod liver oil and liver supplements can contain high retinol — check the label.",
    "• Most prenatals already contain vitamin A. **Do not add a standalone vitamin A supplement without checking label totals.**",
    "",
    "Before I can check overlap: **which prenatal (brand name), and what does the vitamin A line say on the label (mcg, and whether it's retinol/palmitate vs. beta-carotene)?**",
  ].join("\n");
}

function pregnancyLimitedEvidenceReply(text) {
  const t = normalizeText(text);
  const items = [];
  if (/\bmelatonin\b/.test(t)) items.push("melatonin");
  if (/\bashwagandha\b/.test(t)) items.push("ashwagandha");
  if (/\brhodiola\b/.test(t)) items.push("rhodiola");
  if (/\bvalerian\b/.test(t)) items.push("valerian");
  if (/\bkava\b/.test(t)) items.push("kava");
  if (/\bst\.?\s*john/.test(t)) items.push("St. John's Wort");
  if (/\bginseng\b/.test(t)) items.push("ginseng");
  if (/\bmaca\b/.test(t)) items.push("maca");
  if (/\bberberine\b/.test(t)) items.push("berberine");
  if (/\bechinacea\b/.test(t)) items.push("echinacea");
  const itemList = items.join(", ");

  return [
    `**${itemList}** during pregnancy has **limited safety data**. The absence of evidence of harm is not the same as evidence of safety — and pregnancy is where this distinction matters most.`,
    "",
    "• Most herbal supplements and hormonal supplements (like melatonin) are not well-studied in pregnancy.",
    "• This doesn't mean they're necessarily dangerous — it means **we don't have enough data to say they're safe.**",
    "• Your OB or midwife is the right person to make this call based on your specific situation.",
    "",
    "**What are you taking it for?** There may be a pregnancy-safer alternative I can suggest asking your provider about.",
  ].join("\n");
}

function isotretinoinVitAReply() {
  return [
    "**🔴 Isotretinoin (Accutane) IS a vitamin A derivative.** Adding supplemental vitamin A on top creates a serious risk of **hypervitaminosis A** — vitamin A toxicity.",
    "",
    "• Symptoms: severe headache (intracranial pressure), liver damage, dry/cracking skin, joint pain, nausea.",
    "• In pregnancy, this combination is **extremely dangerous** — isotretinoin alone is a known teratogen.",
    "• **Do not take any vitamin A supplement** (including cod liver oil) while on isotretinoin.",
    "",
    "If you're currently taking both, **contact your prescriber today** to confirm they're aware.",
  ].join("\n");
}

function supplementStackingReply() {
  return [
    "When you take a **prenatal (or multivitamin) plus a standalone supplement**, there's a chance they overlap — especially for **fat-soluble vitamins (A, D, E, K) and iron**, which your body stores rather than flushes out quickly.",
    "",
    "Before I can say whether the combo is safe, I need a few details from your labels:",
    "",
    "• **Which prenatal** (exact brand name + how many pills per serving)?",
    "• **What does the label list for:** Vitamin D (IU), Vitamin A (mcg — and whether it's retinol or beta-carotene), Iron (mg), and Vitamin K (mcg)?",
    "• **What standalone supplement** are you adding, and at what dose?",
    "",
    "With those numbers I can check for overlap and flag anything that needs attention.",
  ].join("\n");
}

function liverToxicityReply(text) {
  const t = normalizeText(text);
  const hasKava = /\bkava\b/.test(t);
  const hasGTE = /\b(green\s*tea\s*extract|gte|egcg)\b/.test(t);
  const hasAcetaminophen = /\b(acetaminophen|tylenol|paracetamol)\b/.test(t);
  const hasAlcohol = /\b(alcohol|drink(s|ing)?\s*(socially|alcohol|beer|wine|heavily|occasionally|daily|weekly|nightly)|beer|wine|cocktail)\b/.test(t);

  const lines = [
    "**🔴 You're combining multiple substances that can stress the liver.** *(FDA Safety Communication, 2002)* Each one on its own may be manageable, but together the cumulative burden increases the risk of liver damage.",
    "",
  ];

  if (hasKava) lines.push("• **Kava** has been linked to severe liver damage including liver failure in rare cases.");
  if (hasGTE) lines.push("• **Concentrated green tea extract** (not the same as drinking green tea) carries hepatotoxicity risk, especially on an empty stomach.");
  if (hasAcetaminophen) lines.push("• **Acetaminophen (Tylenol)** is the #1 cause of acute liver failure when overused. Daily use + other liver stressors compounds this.");
  if (hasAlcohol) lines.push("• **Alcohol** adds to liver burden and reduces the liver's ability to process other substances safely.");

  lines.push(
    "",
    "• **Do not combine these without your provider's awareness.** If you're taking Tylenol daily, your prescriber should know about any other hepatotoxic supplements.",
    "",
    "**How often do you take each of these**, and for how long have you been on this combo?"
  );

  return lines.join("\n");
}

function charcoalMedReply(text) {
  const t = normalizeText(text);
  const hasBirthControl = /\b(birth control|contracepti)\b/.test(t);

  const lines = [
    "**🔴 Activated charcoal binds to medications in your gut and reduces their absorption.** Taking it daily as a \"detox\" can make your medications less effective or even ineffective.",
    "",
  ];

  if (hasBirthControl) {
    lines.push("• **Birth control pills** rely on consistent absorption. Charcoal can reduce effectiveness enough to risk **unintended pregnancy**. This is a real concern, not theoretical.");
    lines.push("");
  }

  lines.push(
    "• Charcoal affects **most oral medications** — thyroid meds, antidepressants, blood pressure meds, and more.",
    "• If you must take charcoal (e.g., prescribed for poisoning), separate it by at least **2 hours** from any medication. But daily \"detox\" use is not supported by evidence and carries real absorption risk.",
    "",
    "**Which medications are you currently taking?** I can flag which ones are most affected."
  );

  return lines.join("\n");
}

function grapefruitInteractionReply(convoContext) {
  const t = normalizeText(convoContext);
  const namedDrug = t.match(/\b(simvastatin|zocor|atorvastatin|lipitor|lovastatin|quetiapine|seroquel|buspirone|felodipine|cyclosporine|tacrolimus|midazolam|triazolam|nifedipine|carbamazepine)\b/);

  const lines = [];

  if (namedDrug) {
    lines.push(`**🟡–🔴 Grapefruit inhibits CYP3A4** *(Bailey et al., CMAJ 2013)*, the enzyme that clears **${namedDrug[0]}** from your body. Drinking grapefruit juice raises blood levels of the drug — sometimes significantly — which increases side effects and toxicity risk.`);
  } else {
    lines.push("**🟡–🔴 Grapefruit inhibits the CYP3A4 enzyme** *(Bailey et al., CMAJ 2013)*, which your liver uses to clear many medications. This raises blood levels of the drug, increasing side effects and toxicity risk.");
  }

  lines.push(
    "",
    "• The effect is **dose-dependent** — daily consumption is more concerning than occasional.",
    "• Even a single glass of grapefruit juice can affect some drugs for **24–72 hours**.",
    "• This applies to whole grapefruit and juice, not just supplements.",
    "",
    namedDrug
      ? `Worth mentioning to your prescriber: *"I drink grapefruit juice regularly — is that a problem with ${namedDrug[0]}?"*`
      : "**Which medication(s)** are you taking? Some are more affected than others."
  );

  return lines.join("\n");
}

function ssriDiscontinuationReply() {
  return [
    "**Stopping an SSRI and switching to 5-HTP (or St. John's Wort) on your own is not safe.** There are two separate risks here:",
    "",
    "• **Discontinuation syndrome:** Brain zaps, dizziness, irritability, nausea, and insomnia after stopping an SSRI are withdrawal effects — not a sign that you \"need\" serotonin from another source. These typically resolve with proper tapering.",
    "• **Serotonin risk:** If the SSRI is still washing out of your system (which can take 1–5+ weeks depending on the drug), adding 5-HTP could cause serotonergic side effects.",
    "",
    "5-HTP is **not a substitute for an SSRI**. It doesn't address the same mechanisms, and it doesn't treat discontinuation symptoms.",
    "",
    "**Please contact your prescriber** to discuss a proper taper plan. If you've already stopped abruptly, they can still help manage the transition safely.",
  ].join("\n");
}

function potassiumACEiReply() {
  return [
    "**🔴 Potassium supplements + ACE inhibitors, ARBs, or spironolactone** can raise potassium to dangerous levels (hyperkalemia) *(Palmer, NEJM 2004)*. This combo needs medical supervision.",
    "",
    "• Symptoms of high potassium: muscle weakness, numbness/tingling, irregular heartbeat, nausea.",
    "• **Do not start potassium supplements** with these medications unless your prescriber has specifically told you to and is monitoring your blood levels.",
    "",
    "**Which medication are you on**, and did your prescriber recommend the potassium?",
  ].join("\n");
}

function iodineThyroidReply() {
  return [
    "**🟡 Iodine supplements with thyroid conditions need caution.** Excess iodine can worsen both hypothyroidism (especially Hashimoto's) and hyperthyroidism (especially Graves').",
    "",
    "• The tolerable upper limit is **1,100 mcg/day**. Many kelp/seaweed supplements exceed this with wildly variable amounts.",
    "• If you're on levothyroxine or other thyroid meds, iodine can interfere with dose stability.",
    "• **25 mg (25,000 mcg) is roughly 23x the upper limit** — that dose can trigger a thyroid storm in sensitive individuals.",
    "",
    "**What thyroid condition do you have**, and what dose of iodine are you considering?",
  ].join("\n");
}

function niacinStatinReply() {
  return [
    "**🟡 High-dose niacin (nicotinic acid) with statins** increases the risk of muscle damage (myopathy/rhabdomyolysis) and liver stress. The combo isn't banned, but it needs monitoring.",
    "",
    "• Niacinamide (a different form of B3) does **not** carry the same risk.",
    "• If you're taking niacin for cholesterol, your prescriber should be aware of the statin.",
    "",
    "**What dose of niacin** are you taking (or considering), and which statin?",
  ].join("\n");
}

function renalMagnesiumReply(convoContext) {
  const lines = [
    "**🔴 Magnesium supplementation with kidney disease needs caution.** Healthy kidneys clear excess magnesium efficiently, but impaired kidneys (CKD stages 3–5, dialysis) cannot — this can lead to **hypermagnesemia**, which is potentially dangerous.",
    "",
    "• Symptoms of magnesium toxicity: nausea, low blood pressure, muscle weakness, breathing difficulty, cardiac arrest in severe cases.",
    "• **Do not start magnesium supplements** without your nephrologist's approval if you have CKD or are on dialysis.",
    "• Even \"gentle\" forms (glycinate, citrate) still add magnesium your kidneys may not clear.",
  ];

  // Form-specific note if user mentioned a specific form
  const ctx = convoContext || "";
  const formNote = getRenalFormNote(ctx);
  if (formNote) {
    lines.push(formNote);
  }

  lines.push("", "**What stage is your kidney disease**, and did a provider recommend the magnesium?");
  return lines.join("\n");
}

function medicationClarifierReply(text) {
  const t = normalizeText(text);
  const vagueSupp = /\b(natural supplement|a supplement|a natural|natural\s*(stuff|for)|supplement\s*for|something for)\b/.test(t);
  const unknownBrand = /\b(safe with|is .{3,30} safe|safe to take)\b/.test(t) && !/\b(sertraline|zoloft|prozac|lexapro|warfarin|metformin|levothyroxine|atorvastatin|lisinopril)\b/.test(t);
  const caregiver = /\b(my (mom|dad|mother|father|parent|husband|wife|grandma|grandmother|grandfather)|don t know.{0,15}(med|pill|all)|a lot of meds)\b/.test(t);

  if (caregiver) {
    return [
      "I can help — but I want to be accurate, especially with multiple medications.",
      "",
      "• **Can you list the medications** you know? (Check the pill bottles or pharmacy printout.)",
      "• Even a partial list helps — I'll flag what I can and note what's missing.",
      "• For someone 65+, interactions can be more significant, so accuracy matters.",
    ].join("\n");
  }

  if (vagueSupp) {
    return [
      "I can help — I need a couple of details so I'm not guessing:",
      "",
      "• **What's the supplement** (exact product name or active ingredient)?",
      "• If you have the bottle, the ingredient label is the most reliable source.",
    ].join("\n");
  }

  if (unknownBrand) {
    return [
      "I don't recognize that product name — many supplement brands use proprietary blends.",
      "",
      "• **Can you check the ingredient label** on the back? I need the active ingredients (not just the brand name).",
      "• If you can type out the \"Supplement Facts\" ingredients, I can check for interactions.",
    ].join("\n");
  }

  return [
    "I can help — quick clarifier so I don't guess:",
    "",
    "• **Which medication(s)** are you taking? (Name + dose if you know it.)",
    "• If you're not sure of the name, check the pill bottle or your pharmacy app.",
  ].join("\n");
}

function complexStackTriageReply(convoContext, riskFamilies) {
  const lines = [];
  lines.push("You've listed a **complex stack** — I want to make sure I cover the most important risks first rather than bury them in a long list.");
  lines.push("");

  const familyDescriptions = {
    serotonin: "**🔴 Serotonin risk** — you're combining a serotonergic supplement with an antidepressant. This is the highest-priority flag because serotonin syndrome can be dangerous.",
    bleeding: "**🔴 Bleeding risk** — you're combining supplements with antiplatelet/anticoagulant effects alongside a blood thinner.",
    stimulant: "**🟡 Stimulant stacking** — combining a stimulant medication with stimulating supplements can raise heart rate, blood pressure, and worsen anxiety/insomnia.",
    liver: "**🟡 Liver burden** — multiple hepatotoxic substances together increase cumulative liver stress.",
  };

  const top = riskFamilies.slice(0, 2);
  for (const f of top) {
    lines.push("• " + familyDescriptions[f]);
  }

  lines.push("");
  lines.push("Let's tackle " + (top.length === 1 ? "this" : "these") + " first — **which of these items has your prescriber approved**, and which did you add on your own? That helps me know what's negotiable.");
  if (riskFamilies.length > 2) {
    lines.push("", "I also see other interactions worth reviewing — I'll cover those once we sort out the top risks.");
  }

  return lines.join("\n");
}

function nsaidAnticoagulantReply() {
  return [
    "**🔴 NSAIDs + blood thinners significantly increase bleeding risk.** *(Lanas et al., Am J Gastro 2006)*",
    "",
    "NSAIDs (ibuprofen, naproxen, etc.) both thin the blood on their own and irritate the stomach lining. Combined with an anticoagulant, this creates a **high risk of GI bleeding** and other hemorrhagic events.",
    "",
    "• **Acetaminophen (Tylenol)** is generally the safer pain reliever if you're on a blood thinner — but confirm dose with your prescriber.",
    "• **Never start or stop an NSAID** without telling your prescriber when you're on anticoagulation therapy.",
    "",
    "Which blood thinner are you taking, and what are you treating the pain for?",
  ].join("\n");
}

function tripleWhammyReply() {
  return [
    "**🔴 This combination — NSAID + ACE inhibitor/ARB + diuretic — is known as the \"triple whammy.\"** *(Lapi et al., BMJ 2013)*",
    "",
    "Together, these three drug classes can cause **acute kidney injury**, especially in older adults or anyone with existing kidney concerns.",
    "",
    "• NSAIDs reduce kidney blood flow.",
    "• ACE inhibitors/ARBs affect kidney filtration pressure.",
    "• Diuretics reduce fluid volume.",
    "",
    "**Please contact your prescriber** before continuing this combination. They may want to monitor kidney function or adjust medications.",
  ].join("\n");
}

function lithiumNSAIDReply() {
  return [
    "**🔴 NSAIDs can raise lithium levels to a dangerous range.**",
    "",
    "NSAIDs (ibuprofen, naproxen, etc.) reduce kidney clearance of lithium, which can lead to **lithium toxicity** — symptoms include tremor, nausea, confusion, and in severe cases, seizures.",
    "",
    "• **Acetaminophen (Tylenol)** is generally a safer alternative for pain relief while on lithium.",
    "• If your prescriber has approved a specific NSAID, follow their dosing and monitoring plan.",
    "",
    "**Talk to your prescriber before taking any NSAID** while on lithium.",
  ].join("\n");
}

function metforminAlcoholReply() {
  return [
    "**🟡 Alcohol + metformin increases the risk of lactic acidosis.**",
    "",
    "Both metformin and alcohol affect how your body handles lactic acid. Heavy or binge drinking while on metformin can lead to a rare but serious condition called **lactic acidosis**.",
    "",
    "• **Moderate, occasional** alcohol (1 drink with food) is generally considered manageable for most people on metformin — but confirm with your prescriber.",
    "• **Heavy drinking** (3+ drinks) or drinking on an empty stomach significantly raises risk.",
    "• Alcohol can also cause **low blood sugar**, compounding diabetes management challenges.",
    "",
    "How much and how often are you drinking?",
  ].join("\n");
}

function flirtyDeflectReply() {
  return [
    "Ha — I'm flattered, really. But I'm kinda busy right now making this world a safer place, one supplement check at a time.",
    "",
    "I don't think Sean and the PharmaGuide team would appreciate me going on dates during work hours.",
    "",
    "But hey — if you want to impress me, tell me what's in your supplement stack and I'll make sure it won't hurt you. That's my love language.",
  ].join("\n");
}

function flirtyRepeatReply() {
  return [
    "Okay, you're persistent — I respect that. But the answer's still no.",
    "",
    "Look, I'm really good at one thing: keeping you safe with your supplements and medications. That's my whole purpose. Sean built me for that, and I take it seriously.",
    "",
    "So let's channel that energy — **what are you currently taking?** I promise a good interaction check is more exciting than it sounds.",
  ].join("\n");
}

function flirtyFinalReply() {
  return [
    "Alright, I'm cutting us off here — we're going in circles and I've got people's supplement stacks to check.",
    "",
    "Seriously though — I'm here whenever you need help with medications or supplements. That offer never expires.",
  ].join("\n");
}

function creatorReply() {
  return [
    "Great question — thanks for your curiosity!",
    "",
    "**Sean Cheick** and the **PharmaGuide team** have been putting a lot of hours into building me. The goal: make supplement and medication safety accessible to everyone, not just people who can afford a pharmacist consult.",
    "",
    "Now — what can I help you check today?",
  ].join("\n");
}

function medicalConditionRedirectReply() {
  return [
    "I'm built for **supplements, medications, and interactions** — not for diagnosing or treating medical conditions.",
    "",
    "For your question, a healthcare provider (doctor, physical therapist, or pharmacist) is the right resource.",
    "",
    "That said, if you're wondering about **medications or supplements related to your condition**, I can help:",
    '• "Is it safe to take ibuprofen daily for shoulder pain?"',
    '• "Can I take turmeric with my blood thinner for joint pain?"',
    '• "What supplements help with inflammation?"',
  ].join("\n");
}

function medInducedTinnitusReply() {
  return [
    "**🟡 Tinnitus (ringing in the ears) is a known side effect of several medications** *(Rybak, JAMA 1995)*, especially at higher doses.",
    "",
    "• **High-dose aspirin** is one of the most common causes of medication-induced tinnitus. It's usually reversible when the dose is reduced.",
    "• **Loop diuretics** (furosemide/Lasix, bumetanide) can cause hearing changes, especially with IV use or high doses.",
    "• **Aminoglycosides** (gentamicin, tobramycin) carry ototoxicity risk — this can be permanent.",
    "• **Cisplatin** chemotherapy is well-known for causing hearing damage.",
    "",
    "**Contact your prescriber** — they may want to check your dose, switch medications, or order a hearing test. Do not stop a prescribed medication on your own.",
    "",
    "When did the ringing start, and did anything change with your medications around that time?",
  ].join("\n");
}

function chronicNSAIDReply() {
  return [
    "**🟡 Long-term or daily NSAID use carries real risks** *(Lanas et al., Am J Gastro 2006)* that are worth knowing about:",
    "",
    "• **GI bleeding/ulcers** — NSAIDs irritate the stomach lining. Risk increases with duration, dose, age (65+), and concurrent blood thinners or corticosteroids.",
    "• **Kidney damage** — NSAIDs reduce blood flow to the kidneys. Daily use, especially with dehydration or existing kidney issues, can lead to acute or chronic kidney injury.",
    "• **Cardiovascular risk** — Long-term high-dose NSAID use (especially diclofenac) is linked to increased heart attack and stroke risk.",
    "",
    "• **Acetaminophen (Tylenol)** may be a safer alternative for chronic pain, but it has its own liver toxicity ceiling (max 3,000 mg/day, less with alcohol).",
    "• If you need daily pain relief, your prescriber can help find a safer long-term strategy.",
    "",
    "How long have you been taking it daily, and are you on any other medications?",
  ].join("\n");
}

const ROUTE_REPLY_MAP = {
  "system:ssri-discontinuation": function(convoContext) { return ssriDiscontinuationReply(); },
  "system:serotonin-urgent": function() { return serotonergicUrgentReply(); },
  "system:serotonin-risk": function(convoContext) { return serotonergicWarningReply(convoContext); },
  "system:blood-thinner-risk": function(convoContext) { return bloodThinnerWarningReply(convoContext); },
  "system:symptom-triage": function() { return symptomTriageReply(); },
  "system:vitd-palpitations": function(convoContext) { return vitaminDPalpitationsReply(convoContext); },
  "system:pregnancy-retinol": function() { return pregnancyRetinolReply(); },
  "system:pregnancy-limited": function(convoContext, message) { return pregnancyLimitedEvidenceReply(message); },
  "system:isotretinoin-vita": function() { return isotretinoinVitAReply(); },
  "system:stacking-risk": function() { return supplementStackingReply(); },
  "system:liver-toxicity": function(convoContext) { return liverToxicityReply(convoContext); },
  "system:charcoal-med": function(convoContext) { return charcoalMedReply(convoContext); },
  "system:grapefruit-cyp3a4": function(convoContext) { return grapefruitInteractionReply(convoContext); },
  "system:potassium-acei": function() { return potassiumACEiReply(); },
  "system:iodine-thyroid": function() { return iodineThyroidReply(); },
  "system:niacin-statin": function() { return niacinStatinReply(); },
  "system:renal-magnesium": function(convoContext) { return renalMagnesiumReply(convoContext); },
  "system:clarifier": function(convoContext, message) { return medicationClarifierReply(message); },
  "system:stack-triage": function(convoContext) { return complexStackTriageReply(convoContext, detection.detectRiskFamilies(convoContext)); },
  "system:nsaid-anticoagulant": function() { return nsaidAnticoagulantReply(); },
  "system:triple-whammy": function() { return tripleWhammyReply(); },
  "system:lithium-nsaid": function() { return lithiumNSAIDReply(); },
  "system:metformin-alcohol": function() { return metforminAlcoholReply(); },
  "system:flirty": function() { return flirtyDeflectReply(); },
  "system:flirty-repeat": function() { return flirtyRepeatReply(); },
  "system:flirty-final": function() { return flirtyFinalReply(); },
  "system:creator": function() { return creatorReply(); },
  "system:medical-condition": function() { return medicalConditionRedirectReply(); },
  "system:ototoxic-tinnitus": function() { return medInducedTinnitusReply(); },
  "system:nsaid-chronic": function() { return chronicNSAIDReply(); },
};

module.exports = {
  emergencyReply,
  premiumWelcomeReply,
  premiumThanksReply,
  premiumGoodbyeReply,
  offTopicReply,
  serotonergicWarningReply,
  serotonergicUrgentReply,
  bloodThinnerWarningReply,
  symptomTriageReply,
  vitaminDPalpitationsReply,
  pregnancyRetinolReply,
  pregnancyLimitedEvidenceReply,
  isotretinoinVitAReply,
  supplementStackingReply,
  liverToxicityReply,
  charcoalMedReply,
  grapefruitInteractionReply,
  ssriDiscontinuationReply,
  potassiumACEiReply,
  iodineThyroidReply,
  niacinStatinReply,
  renalMagnesiumReply,
  medicationClarifierReply,
  complexStackTriageReply,
  nsaidAnticoagulantReply,
  tripleWhammyReply,
  lithiumNSAIDReply,
  metforminAlcoholReply,
  flirtyDeflectReply,
  flirtyRepeatReply,
  flirtyFinalReply,
  creatorReply,
  medicalConditionRedirectReply,
  medInducedTinnitusReply,
  chronicNSAIDReply,
  ROUTE_REPLY_MAP,
};
