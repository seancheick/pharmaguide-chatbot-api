/**
 * The rate limiter must never hand a visitor's address to its backend.
 *
 * A local server stands in for Upstash and records every request body the
 * limiter sends; the assertions look at exactly what would have left the process.
 */

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const captured = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    captured.push({ url: req.url, body });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ result: 0 }));
  });
});

test("limiter sends a keyed hash to the backend, never the address", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "limiter-test-token";
  process.env.RATE_LIMIT_SALT = "salt-for-tests";
  const warn = console.warn;
  console.warn = () => {};

  const { checkRateLimit, limiterKey } = require("../src/infra/rateLimit");
  const ip = "203.0.113.77";
  try {
    const result = await checkRateLimit(ip); // the fake backend gives nonsense, so this falls back to memory
    assert.equal(typeof result.success, "boolean");
  } finally {
    console.warn = warn;
  }

  const key = limiterKey(ip);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.notEqual(key, ip);
  assert.equal(limiterKey(ip), key, "stable, so every serverless instance shares one bucket");
  process.env.RATE_LIMIT_SALT = "another-salt";
  assert.notEqual(limiterKey(ip), key, "keyed: a different secret gives a different value");

  const wire = captured.map((c) => c.url + c.body).join("\n");
  assert.ok(captured.length > 0, "the limiter should have contacted the backend");
  assert.ok(wire.includes(key), "the hashed key is what the backend receives");
  assert.ok(!wire.includes(ip), "the raw address must never be sent to the backend");
});

after(() => server.close());
