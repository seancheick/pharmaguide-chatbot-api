function createLLMClient(provider) {
  if (provider === "groq") {
    const Groq = require("groq-sdk");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    return {
      provider: "groq",
      generate: async function({ system, messages, constraints, timeout }) {
        const fullMessages = [
          { role: "system", content: system },
          ...messages,
        ];

        const completion = await groq.chat.completions.create({
          model: constraints?.model || "llama-3.3-70b-versatile",
          messages: fullMessages,
          temperature: constraints?.temperature ?? 0.45,
          max_tokens: constraints?.max_tokens ?? 650,
          top_p: constraints?.top_p ?? 0.9,
          stream: false,
        }, { timeout: timeout || 8000 });

        return {
          content: completion.choices?.[0]?.message?.content?.trim() || "",
          usage: completion.usage,
          model: completion.model || constraints?.model || "llama-3.3-70b-versatile",
          provider: "groq",
        };
      },
    };
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

async function llmGenerateWithFallback(params) {
  const { client, system, messages, constraints, timeout } = params;

  try {
    return await client.generate({ system, messages, constraints, timeout });
  } catch (error) {
    // Re-throw rate limits and auth errors for handler to manage
    if (error?.status === 429 || error?.status === 401) throw error;

    // For other errors, return a safe fallback
    return {
      content: "I couldn't generate a response. Please try again.",
      usage: null,
      model: "fallback",
      provider: client.provider,
      error: true,
    };
  }
}

module.exports = { createLLMClient, llmGenerateWithFallback };
