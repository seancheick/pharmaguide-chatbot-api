const { normalizeText } = require("./normalize");

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const allowedRoles = new Set(["user", "assistant"]);
  return history
    .slice(-10)
    .map((m) => {
      const role = allowedRoles.has(m?.role) ? m.role : "user";
      const content = typeof m?.content === "string" ? m.content.slice(0, 1000) : "";
      return { role, content };
    })
    .filter((m) => m.content.trim().length > 0);
}

function getConversationContext(message, safeHistory) {
  const recentUserMessages = safeHistory
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content);
  return normalizeText([...recentUserMessages, message].join(" "));
}

module.exports = { sanitizeHistory, getConversationContext };
