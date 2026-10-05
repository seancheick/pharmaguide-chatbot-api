/**
 * API keys for the evaluation, by name only.
 *
 * Reads the requested variable names from the environment, then from .env.local. Nothing else
 * in .env.local is read, so the evaluation can never pick up the Upstash token or the proxy
 * secret. Values are never printed.
 */

const fs = require("fs");
const path = require("path");

function loadKeys(names, { env = process.env, file = path.join(__dirname, "../../.env.local") } = {}) {
  const fromFile = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) fromFile[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch {
    // no .env.local: environment only
  }
  const keys = {};
  for (const name of names) keys[name] = env[name] || fromFile[name] || "";
  return keys;
}

module.exports = { loadKeys };
