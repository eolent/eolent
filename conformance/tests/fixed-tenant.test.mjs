// Category: fixed tenant (spec/tenancy.md, section 2, step 4). Runs only against a deployment with a fixed tenant.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, needs } from "../lib/config.mjs";
import { request } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath } = cfg.fixtures.resource;
const on = !cfg.deployment.fixedTenant && "the deployment has no fixed tenant";

describe("fixed tenant", () => {
  test("a host principal with the switching permission needs no tenant signal", { skip: on || needs(cfg, "hostSwitch") }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "hostSwitch" });
    assert.equal(res.status, 200, "the fixed tenant must be used, so TenantRequired never occurs");
  });

  test("a host principal without the switching permission is refused", { skip: on || needs(cfg, "host") }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "host" });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
  });

  test("a tenant principal's header naming another tenant is still a mismatch", { skip: on }, async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA", headers: { "x-eolent-tenant": cfg.fixtures.tenants.b.id } });
    assertProblem(res, { status: 403, code: "Eolent.TenantMismatch" });
  });
});
