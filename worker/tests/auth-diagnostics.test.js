import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { requestOtp, verifyOtp } from "../src/auth/otp.js";
import { logFailure, withRequestMetadata } from "../src/utils/diagnostics.js";

const originalFetch = globalThis.fetch;
const originalGetRandomValues = globalThis.crypto.getRandomValues;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };

function makeKv({ failGet = false, failPut = false, failDelete = false } = {}) {
  const values = new Map();
  return {
    values,
    async get(key) {
      if (failGet) throw new Error("KV read unavailable");
      return values.get(key) ?? null;
    },
    async put(key, value) {
      if (failPut) throw new Error("KV write unavailable");
      values.set(key, value);
    },
    async delete(key) {
      if (failDelete) throw new Error("KV delete unavailable");
      values.delete(key);
    },
  };
}

function makeDb(user = { telegram_id: 123456, full_name: "Test", is_active: 1 }, failure = null) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              if (failure) throw failure;
              return user;
            },
          };
        },
      };
    },
  };
}

function makeEnv({ user, dbFailure, kv, token = "test-token", pepper = "test-pepper" } = {}) {
  return {
    DB: makeDb(user, dbFailure),
    SITE_AUTH_KV: kv || makeKv(),
    BOT_TOKEN: token,
    OTP_PEPPER: pepper,
  };
}

function request(body = { telegramId: "123456" }) {
  return new Request("https://worker.test/api/v1/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(id = "test-request-id") {
  return { requestId: id, rayId: "test-ray", startedAt: Date.now(), stage: "test" };
}

async function responseBody(response) {
  return response.json();
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.crypto.getRandomValues = originalGetRandomValues;
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

test("missing required configuration returns a structured 503", async () => {
  const response = await requestOtp(request(), { DB: makeDb(), SITE_AUTH_KV: makeKv(), OTP_PEPPER: "pepper" }, context());
  const body = await responseBody(await withRequestMetadata(response, context()));
  assert.equal(response.status, 503);
  assert.equal(body.error.errorCode, "CONFIG_001");
  assert.equal(body.error.httpStatus, 503);
  assert.equal(body.error.requestId, "test-request-id");
});

test("missing D1 binding is reported as configuration failure", async () => {
  const env = makeEnv();
  env.DB = null;
  const response = await requestOtp(request(), env, context());
  const body = await responseBody(response);
  assert.equal(response.status, 503);
  assert.equal(body.error.errorCode, "CONFIG_001");
});

test("D1 query failure returns a traceable database error", async () => {
  const response = await requestOtp(request(), makeEnv({ dbFailure: new Error("D1 query failed") }), context());
  const body = await responseBody(response);
  assert.equal(response.status, 500);
  assert.equal(body.error.errorCode, "DB_002");
});

test("KV cooldown lookup failure returns a service-unavailable error", async () => {
  const response = await requestOtp(request(), makeEnv({ kv: makeKv({ failGet: true }) }), context());
  const body = await responseBody(response);
  assert.equal(response.status, 503);
  assert.equal(body.error.errorCode, "KV_001");
});


test("OTP generation failure is logged without revealing account eligibility", async () => {
  const captured = [];
  console.error = (line) => captured.push(String(line));
  globalThis.crypto.getRandomValues = () => { throw new Error("secure random unavailable"); };
  const response = await requestOtp(request(), makeEnv(), context());
  const body = await responseBody(response);
  assert.equal(response.status, 202);
  assert.equal(body.status, "unconfirmed");
  assert.ok(captured.some((line) => line.includes('"errorCode":"OTP_001"')));
});

test("OTP storage failure is logged without revealing account eligibility", async () => {
  const captured = [];
  console.error = (line) => captured.push(String(line));
  globalThis.fetch = async () => {
    throw new Error("Telegram must not be called when OTP storage fails");
  };
  const response = await requestOtp(request(), makeEnv({ kv: makeKv({ failPut: true }) }), context());
  const body = await responseBody(response);
  assert.equal(response.status, 202);
  assert.equal(body.status, "unconfirmed");
  assert.ok(captured.some((line) => line.includes('"errorCode":"OTP_002"')));
});

test("unknown and inactive users receive the same neutral response", async () => {
  const unknown = await requestOtp(request(), makeEnv({ user: null }), context("unknown"));
  const inactive = await requestOtp(request(), makeEnv({ user: { telegram_id: 123456, is_active: 0 } }), context("inactive"));
  assert.equal(unknown.status, 202);
  assert.equal(inactive.status, 202);
  assert.deepEqual(await responseBody(unknown), await responseBody(inactive));
});

test("cooldown returns the neutral anti-enumeration response", async () => {
  const kv = makeKv();
  await kv.put("otp-cooldown:123456", "1");
  const response = await requestOtp(request(), makeEnv({ kv }), context());
  assert.equal(response.status, 202);
  assert.equal((await responseBody(response)).status, "unconfirmed");
});

test("Telegram API rejection is logged internally and does not claim delivery", async () => {
  const captured = [];
  console.error = (line) => captured.push(String(line));
  console.log = (line) => captured.push(String(line));
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error_code: 400,
    description: "chat not found",
  }), { status: 400, headers: { "Content-Type": "application/json" } });

  const kv = makeKv();
  const response = await requestOtp(request(), makeEnv({ kv }), context());
  const body = await responseBody(response);
  assert.equal(response.status, 202);
  assert.match(body.data.message, /درخواست بررسی شد/);
  assert.equal(kv.values.has("otp:123456"), false);
  assert.ok(captured.some((line) => line.includes('"errorCode":"TG_002"')));
  assert.ok(captured.some((line) => line.includes('"event":"OTP_DELIVERY_FAILED"')));
});

test("Telegram network failure is distinguished from API rejection", async () => {
  const captured = [];
  console.error = (line) => captured.push(String(line));
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  const response = await requestOtp(request(), makeEnv(), context());
  assert.equal(response.status, 202);
  assert.ok(captured.some((line) => line.includes('"errorCode":"NET_001"')));
});

test("successful Telegram acceptance stores cooldown and returns neutral 202", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const kv = makeKv();
  const response = await requestOtp(request(), makeEnv({ kv }), context());
  assert.equal(response.status, 202);
  assert.ok(kv.values.has("otp:123456"));
  assert.equal(kv.values.get("otp-cooldown:123456"), "1");
});

test("request metadata standardizes errors and exposes Ray ID safely", async () => {
  const response = await withRequestMetadata(
    new Response(JSON.stringify({ ok: false, error: { code: "OLD_CODE", message: "failed" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
    context("trace-123"),
  );
  const body = await responseBody(response);
  assert.equal(response.headers.get("X-Request-ID"), "trace-123");
  assert.equal(response.headers.get("X-CF-Ray"), "test-ray");
  assert.equal(body.error.errorCode, "OLD_CODE");
  assert.equal(body.error.requestId, "trace-123");
  assert.equal(body.error.httpStatus, 503);
});

test("unexpected Worker failures are logged and returned with a request ID", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/health", { headers: { "cf-ray": "ray-test-ABC" } }),
    { DB: { prepare() { throw new Error("unexpected D1 runtime failure"); } } },
  );
  const body = await responseBody(response);
  assert.equal(response.status, 500);
  assert.equal(body.error.errorCode, "INTERNAL_001");
  assert.ok(body.error.requestId);
  assert.equal(response.headers.get("X-CF-Ray"), "ray");
});

test("diagnostic error logging redacts token-like values and numeric identifiers", () => {
  const captured = [];
  console.error = (line) => captured.push(String(line));
  logFailure(context(), {
    errorCode: "INTERNAL_001",
    stage: "test",
    error: new Error("failure bot123:dummy-secret for user 123456789"),
    dependency: "test",
  });
  const output = captured.join("\n");
  assert.doesNotMatch(output, /dummy-secret/);
  assert.doesNotMatch(output, /123456789/);
  assert.match(output, /REDACTED_BOT_TOKEN/);
});

test("invalid OTP uses the standardized authentication error", async () => {
  const verifyRequest = new Request("https://worker.test/api/v1/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: "123456", code: "111111" }),
  });
  const response = await verifyOtp(verifyRequest, makeEnv(), context());
  const body = await responseBody(response);
  assert.equal(response.status, 401);
  assert.equal(body.error.errorCode, "OTP_004");
});
