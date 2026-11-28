import test from "node:test";
import assert from "node:assert/strict";
import { getInitialPage, getVisibleNavigation, isKnownRole } from "../../src/modules/access.js";
import { requestOtp, verifyOtp } from "../src/auth/otp.js";
import { requireSession } from "../src/middleware/auth.js";
import { sha256 } from "../src/auth/crypto.js";

const NAV = [["Dashboard", "dashboard"], ["Products", "products"], ["Attendance", "attendance"]];
function makeKv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}
function makeDb({ user, otpHash = null, telegramId = 123456 } = {}) {
  let challenge = otpHash ? { otp_hash: otpHash, attempts: 0, expires_at: Math.floor(Date.now()/1000)+300, consumed_at: null } : null;
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("INSERT INTO auth_rate_limits")) return { request_count: 1 };
              if (sql.includes("SELECT otp_hash")) return challenge;
              if (sql.includes("UPDATE auth_otp_challenges SET consumed_at")) {
                if (!challenge || challenge.consumed_at != null || challenge.otp_hash !== values[2] || challenge.expires_at <= values[3] || challenge.attempts >= values[4]) return null;
                challenge.consumed_at = values[0];
                return { telegram_id: telegramId };
              }
              if (sql.includes("UPDATE auth_otp_challenges SET attempts")) {
                if (!challenge || challenge.consumed_at != null || challenge.otp_hash !== values[3] || challenge.expires_at <= values[4] || challenge.attempts >= values[5]) return null;
                challenge.attempts += 1;
                if (challenge.attempts >= values[0]) challenge.consumed_at = values[1];
                return { attempts: challenge.attempts };
              }
              if (sql.includes("FROM users")) return user;
              return null;
            },
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}
function verifyRequest() {
  return new Request("https://worker.test/api/v1/auth/verify-otp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: "123456", code: "123456" }),
  });
}
async function verifyForRole(role) {
  const pepper = "test-pepper";
  const hash = await sha256("123456:123456:" + pepper);
  const kv = makeKv();
  const env = {
    OTP_PEPPER: pepper, SITE_AUTH_KV: kv,
    DB: makeDb({ user: { telegram_id: 123456, full_name: "Test", username: "test", role, is_active: 1 }, otpHash: hash }),
  };
  return { response: await verifyOtp(verifyRequest(), env), kv };
}

test("navigation and initial page follow the role permission matrix", () => {
  for (const role of ["owner", "manager"]) {
    assert.equal(isKnownRole(role), true);
    assert.equal(getInitialPage(role), "dashboard");
    assert.deepEqual(getVisibleNavigation(role, NAV), NAV);
  }
  assert.equal(getInitialPage("employee"), "attendance");
  assert.deepEqual(getVisibleNavigation("employee", NAV), [NAV[1], NAV[2]]);
});
test("unknown roles never receive management navigation or an initial page", () => {
  assert.equal(isKnownRole("admin"), false);
  assert.equal(getInitialPage("admin"), null);
  assert.deepEqual(getVisibleNavigation("admin", NAV), []);
});
test("OTP verification issues sessions for exactly the three valid roles", async () => {
  for (const role of ["owner", "manager", "employee"]) {
    const { response } = await verifyForRole(role);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.user.role, role);
  }
});
test("OTP verification rejects unknown role and creates no session", async () => {
  const { response, kv } = await verifyForRole("admin");
  assert.equal(response.status, 401);
  assert.equal([...kv.values.keys()].some((key) => key.startsWith("session:")), false);
  assert.equal(kv.values.has("otp:123456"), false);
});
test("session middleware independently rejects and invalidates unknown database roles", async () => {
  const token = "a".repeat(64), tokenHash = await sha256(token), key = "session:" + tokenHash;
  const kv = makeKv({ [key]: JSON.stringify({ telegramId: 123456, createdAt: Date.now(), role: "admin" }) });
  const env = {
    SITE_AUTH_KV: kv,
    DB: { prepare() { return { bind() { return { async first() {
      return { telegram_id: 123456, full_name: "Test", username: "test", role: "admin", is_active: 1 };
    } }; } }; } },
  };
  const request = new Request("https://worker.test/api/v1/products", { headers: { Authorization: "Bearer " + token } });
  const access = await requireSession(request, env);
  assert.equal(access.response.status, 403);
  assert.equal(kv.values.has(key), false);
});
test("inactive and role-mismatched sessions remain forbidden", async () => {
  const token = "b".repeat(64), tokenHash = await sha256(token);
  const kv = makeKv({ ["session:" + tokenHash]: JSON.stringify({ telegramId: 123456, createdAt: Date.now(), role: "owner" }) });
  const env = {
    SITE_AUTH_KV: kv,
    DB: { prepare() { return { bind() { return { async first() {
      return { telegram_id: 123456, full_name: "Test", username: "test", role: "manager", is_active: 1 };
    } }; } }; } },
  };
  const access = await requireSession(new Request("https://worker.test/", { headers: { Authorization: "Bearer " + token } }), env);
  assert.equal(access.response.status, 403);
});

test("OTP request does not issue a code to an account with an unknown role", async () => {
  const kv = makeKv();
  let telegramCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { telegramCalled = true; throw new Error("must not send OTP"); };
  try {
    const response = await requestOtp(new Request("https://worker.test/api/v1/auth/request-otp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId: "123456" }),
    }), {
      DB: makeDb({ user: { telegram_id: 123456, full_name: "Test", role: "admin", is_active: 1 } }),
      SITE_AUTH_KV: kv, OTP_PEPPER: "pepper", BOT_TOKEN: "test-token",
    });
    assert.equal(response.status, 202);
    assert.equal(telegramCalled, false);
    assert.equal(kv.values.has("otp:123456"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
