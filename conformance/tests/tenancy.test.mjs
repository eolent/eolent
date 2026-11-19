// Category: tenancy isolation (spec/tenancy.md, section 6).

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../lib/config.mjs";
import { request, listAll } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath, createBody } = cfg.fixtures.resource;
const tenantA = cfg.fixtures.tenants.a;
const tenantB = cfg.fixtures.tenants.b;
const hasHost = cfg.tokens.host !== undefined;
const hostSkip = hasHost ? false : `no host principal token: the fixtures name ${cfg.fixtures.principals.host?.tokenEnv ?? "no host principal"}, which is not set`;

describe("tenancy isolation", () => {
  let created;

  before(async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: createBody });
    assert.equal(res.status, 201, `creating the fixture entity as tenant A failed: ${res.status} ${res.text.slice(0, 200)}`);
    created = res.json;
    assert.ok(created?.id, "the created entity must have an id");
  });

  test("a tenant can read its own entity", async () => {
    const res = await request(cfg, { path: `${collectionPath}/${created.id}`, principal: "tenantA" });
    assert.equal(res.status, 200);
    assert.equal(res.json.id, created.id);
  });

  test("another tenant's entity looks exactly like a nonexistent one", async () => {
    const other = await request(cfg, { path: `${collectionPath}/${created.id}`, principal: "tenantB" });
    const missing = await request(cfg, { path: `${collectionPath}/${randomUUID()}`, principal: "tenantB" });
    const a = assertProblem(other, { status: 404, code: "Eolent.NotFound" });
    const b = assertProblem(missing, { status: 404, code: "Eolent.NotFound" });
    assert.deepEqual([a.type, a.title, a.status, a.code], [b.type, b.title, b.status, b.code]);
  });

  test("another tenant cannot list the entity", async () => {
    const { res, items, truncated } = await listAll(cfg, collectionPath, "tenantB");
    assert.ok(!truncated, "the list has too many pages to check; use a smaller test deployment");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.items), "the list must be an envelope with items");
    assert.ok(!items.some((i) => i.id === created.id), "tenant B's list contains tenant A's entity");
  });

  test("the owner tenant sees the entity in its list", async () => {
    const { res, items, truncated } = await listAll(cfg, collectionPath, "tenantA");
    assert.ok(!truncated, "the list has too many pages to check; use a smaller test deployment");
    assert.equal(res.status, 200);
    assert.ok(items.some((i) => i.id === created.id));
  });

  test("a tenant header that differs from the token is a tenant mismatch", async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA", headers: { "x-eolent-tenant": tenantB.id } });
    assertProblem(res, { status: 403, code: "Eolent.TenantMismatch" });
  });

  test("a tenant header naming a nonexistent tenant is also a tenant mismatch", async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA", headers: { "x-eolent-tenant": randomUUID() } });
    assertProblem(res, { status: 403, code: "Eolent.TenantMismatch" });
  });

  test("a tenant header equal to the token's tenant is accepted", async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA", headers: { "x-eolent-tenant": tenantA.id } });
    assert.equal(res.status, 200);
  });

  test("a tenant header that is not a UUID is a validation error", async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA", headers: { "x-eolent-tenant": "alpha" } });
    const p = assertProblem(res, { status: 400, code: "Eolent.Validation" });
    assert.ok(
      p.errors?.some((e) => e.code === "Eolent.Validation.Invalid" && e.parameter === "X-Eolent-Tenant"),
      "expected an Eolent.Validation.Invalid item for the parameter X-Eolent-Tenant"
    );
  });

  test("a host principal without a tenant context gets TenantRequired", { skip: hostSkip }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "host" });
    assertProblem(res, { status: 400, code: "Eolent.TenantRequired" });
  });

  test("a host principal without the switching permission cannot send a tenant header", { skip: hostSkip }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "host", headers: { "x-eolent-tenant": tenantA.id } });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
  });
});
