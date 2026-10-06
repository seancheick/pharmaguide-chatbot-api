const { composePrompt } = require("./systemPromptSections");

// The full prompt: every section, in order. The text lives in systemPromptSections.js.
const SYSTEM_PROMPT = composePrompt();

module.exports = { SYSTEM_PROMPT };
