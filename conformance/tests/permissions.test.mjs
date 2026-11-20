// Category: permissions (spec/permissions.md, section 6).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, needs } from "../lib/config.mjs";
import { request } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath, createBody, permission } = cfg.fixtures.resource;
const limited = needs(cfg, "tenantALimited");

describe("permissions", () => {
  test("a caller without the permission of a change is refused with 403 Forbidden", { skip: limited }, async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantALimited", body: createBody });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
  });

  test("a caller without the permission of a read is refused with 403 Forbidden", { skip: limited }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantALimited" });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
  });

  test("the 403 does not name the missing permission", { skip: limited }, async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantALimited", body: createBody });
    const text = JSON.stringify(res.json);
    assert.ok(!(permission && text.includes(permission)), "a 403 must not name the missing permission");
  });

  test("a caller with the permission succeeds", async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: createBody });
    assert.equal(res.status, 201);
  });

  test("an unauthenticated request is 401 before any permission check", async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, body: createBody });
    assertProblem(res, { status: 401, code: "Eolent.Unauthenticated" });
  });

  test("the access endpoint lists the caller's own permissions, sorted, and is not cacheable", async () => {
    const res = await request(cfg, { path: "/api/v1/me/access", principal: "tenantA" });
    assert.equal(res.status, 200);
    assert.equal(res.json.tenantId, cfg.fixtures.tenants.a.id);
    assert.ok(Array.isArray(res.json.permissions), "permissions must be an array");
    assert.deepEqual(res.json.permissions, [...new Set(res.json.permissions)].sort(), "permissions must be sorted without duplicates");
    if (permission) assert.ok(res.json.permissions.includes(permission), `permissions must include ${permission}`);
    assert.equal(typeof res.json.features, "object");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.match(res.headers.get("cache-control") ?? "", /private/);
  });

  test("the access endpoint of a caller without the permission does not list it", { skip: limited || !permission }, async () => {
    const res = await request(cfg, { path: "/api/v1/me/access", principal: "tenantALimited" });
    assert.equal(res.status, 200);
    assert.ok(!res.json.permissions.includes(permission));
  });
});
