// Tests of spec/audit-entry.schema.json.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(join(root, "spec", "audit-entry.schema.json"), "utf8")));

const entry = () => ({
  id: "0f9d3c5e-5a77-4f86-9d1c-2f1b2f0c9a11",
  occurredAt: "2026-11-19T09:30:12Z",
  tenantId: "6b1f0f7e-3b0e-4b8c-8f6f-1a2d6f7c9e10",
  actor: { type: "user", id: "2c4e6a80-1f3b-4d5c-8e7a-9b0c1d2e3f40" },
  kind: "update",
  outcome: "succeeded",
  operation: "identityUsersUpdate",
  resource: { type: "Identity.User", id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" },
  changes: [{ path: "/displayName", old: "J. Novak", new: "Jana Novakova" }],
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736"
});

test("a valid entry passes", () => assert.equal(validate(entry()), true));
test("a host entry with no tenant passes", () => assert.equal(validate({ ...entry(), tenantId: null }), true));
test("an agent entry needs onBehalfOf", () => {
  const e = { ...entry(), actor: { type: "agent", id: "b7a0c4d2-8e11-4a47-9c52-3d6f2a9e0b77" } };
  assert.equal(validate(e), false);
  e.onBehalfOf = { type: "user", id: "2c4e6a80-1f3b-4d5c-8e7a-9b0c1d2e3f40" };
  assert.equal(validate(e), true);
});
test("an unknown kind or property is rejected, an x- property is allowed", () => {
  assert.equal(validate({ ...entry(), kind: "explode" }), false);
  assert.equal(validate({ ...entry(), surprise: 1 }), false);
  assert.equal(validate({ ...entry(), "x-component": "jobs" }), true);
});
test("a redacted change carries no values", () => {
  assert.equal(validate({ ...entry(), changes: [{ path: "/password", redacted: true }] }), true);
});
