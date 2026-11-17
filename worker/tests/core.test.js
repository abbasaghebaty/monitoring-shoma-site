import test from "node:test";
import assert from "node:assert/strict";
import { canRead } from "../src/auth/permissions.js";
import { parsePagination, validIsoDate } from "../src/validation/common.js";

test("role access is restricted by resource", () => {
  assert.equal(canRead("owner", "sales"), true);
  assert.equal(canRead("manager", "customers"), true);
  assert.equal(canRead("employee", "attendance"), true);
  assert.equal(canRead("employee", "sales"), false);
  assert.equal(canRead("unknown", "products"), false);
});

test("pagination is bounded and invalid values fall back safely", () => {
  const url = new URL("https://example.test/?limit=9999&offset=-1");
  assert.deepEqual(parsePagination(url), { limit: 100, offset: 0 });
  const invalid = new URL("https://example.test/?limit=abc&offset=oops");
  assert.deepEqual(parsePagination(invalid), { limit: 50, offset: 0 });
});

test("ISO dates are calendar-valid", () => {
  assert.equal(validIsoDate("2026-11-17"), true);
  assert.equal(validIsoDate("2026-02-31"), false);
  assert.equal(validIsoDate("17/11/2026"), false);
});
