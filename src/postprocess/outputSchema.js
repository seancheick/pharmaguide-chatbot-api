function parseLLMStructuredOutput(rawText) {
  if (!rawText || typeof rawText !== "string") return safeFallbackResponse();

  // Try JSON parse first
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.answer) return parsed;
    } catch (e) {
      // Not valid JSON, fall through to free-text parser
    }
  }

  return parseFreetextToSchema(trimmed);
}

function parseFreetextToSchema(text) {
  if (!text || text.trim().length === 0) return safeFallbackResponse();

  const lines = text.split("\n");

  // Extract answer: first paragraph (non-bullet lines before first bullet)
  const answerLines = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) break;
    if (line.length > 0) answerLines.push(line);
    if (line.length === 0 && answerLines.length > 0) break;
  }
  const answer = answerLines.join(" ").trim();

  // Extract bullets
  const bullets = [];
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^[•\-*]\s/.test(line)) {
      bullets.push(line.replace(/^[•\-*]\s*/, "").trim());
    }
  }

  // Extract severity flag if present
  let severity = null;
  const severityMatch = text.match(/🔴|🟡|🟢/);
  if (severityMatch) {
    if (severityMatch[0] === "🔴") severity = "red";
    else if (severityMatch[0] === "🟡") severity = "yellow";
    else if (severityMatch[0] === "🟢") severity = "green";
  }

  // Extract question (last line ending with ?)
  let one_question = null;
  const questionMatch = text.match(/[^\n.!?]*\?\s*$/m);
  if (questionMatch) {
    one_question = questionMatch[0].replace(/^[•\-*]\s*/, "").trim();
  }

  // Check for prescriber prompt
  let prescriber_prompt = null;
  const prescriberMatch = text.match(/(?:worth|tell|mention|ask).{0,30}prescriber[^"]*"([^"]+)"/i);
  if (prescriberMatch) prescriber_prompt = prescriberMatch[1].trim();

  return {
    answer: answer || text.substring(0, 200),
    bullets,
    severity,
    one_question,
    prescriber_prompt,
  };
}

function renderSchemaToText(schema) {
  if (!schema) return safeFallbackResponse().answer;

  // If it's already plain text (string), return as-is
  if (typeof schema === "string") return schema;

  const parts = [];

  if (schema.answer) parts.push(schema.answer);

  if (schema.bullets && schema.bullets.length > 0) {
    parts.push("");
    for (const b of schema.bullets) {
      parts.push(`• ${b}`);
    }
  }

  if (schema.one_question) {
    parts.push("");
    parts.push(schema.one_question);
  }

  return parts.join("\n").trim();
}

function safeFallbackResponse() {
  return {
    answer: "I wasn't able to process that fully. Could you rephrase your question about supplements, medications, or interactions?",
    bullets: [],
    severity: null,
    one_question: null,
    prescriber_prompt: null,
  };
}

module.exports = { parseLLMStructuredOutput, parseFreetextToSchema, renderSchemaToText, safeFallbackResponse };
