/**
 * Shared-secret check for the website's server-side proxy.
 *
 * The only legitimate caller of /api/chat is the pharmaguide.io proxy route.
 * When PG_PROXY_SECRET is set the proxy sends it as `x-pg-proxy-secret` plus
 * the visitor's address as `x-pg-client-ip`, so rate limits apply per visitor
 * instead of per proxy egress address. Roll-out is staged: the API accepts
 * the header first, the proxy starts sending it, and only then is
 * PG_REQUIRE_PROXY_SECRET=true set to reject everything else.
 */

const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

/** True when the request carries the correct proxy secret (constant-time compare). */
function isTrustedProxy(req) {
  const secret = process.env.PG_PROXY_SECRET;
  if (!secret) return false;
  const given = req.headers && req.headers["x-pg-proxy-secret"];
  if (typeof given !== "string") return false;
  return crypto.timingSafeEqual(sha256(secret), sha256(given));
}

/**
 * Enforcement is on only when both settings are present. Requiring a secret
 * that was never configured would lock out every visitor, so that
 * misconfiguration fails open (and says so) instead.
 */
function proxyEnforcement() {
  if (process.env.PG_REQUIRE_PROXY_SECRET !== "true") return false;
  if (!process.env.PG_PROXY_SECRET) {
    console.error("[PROXY] PG_REQUIRE_PROXY_SECRET=true but PG_PROXY_SECRET is not set: NOT enforcing");
    return false;
  }
  return true;
}

/** The visitor address forwarded by a trusted proxy, or null if absent/malformed. */
function forwardedClientIp(req) {
  const v = req.headers && req.headers["x-pg-client-ip"];
  if (typeof v !== "string") return null;
  const ip = v.trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

module.exports = { isTrustedProxy, proxyEnforcement, forwardedClientIp };
