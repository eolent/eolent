// Category: audit (spec/audit.md, section 8), through the audit log API only. Entries arrive asynchronously,
// so each check waits up to EOLENT_AUDIT_WAIT_MS (default 60 seconds) for its entry.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig, needs } from "../lib/config.mjs";
import { request, waitFor, newTrace } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath, createBody, updateBody } = cfg.fixtures.resource;
const tenantA = cfg.fixtures.tenants.a;
const logPath = "/api/v1/audit-logs";

// Finds the entry with this trace id in tenant A's log, as tenant A's administrator.
const findEntry = (traceId) =>
  waitFor(cfg, async () => {
    const res = await request(cfg, { path: `${logPath}?filter[traceId]=${traceId}`, principal: "tenantA" });
    return res.status === 200 ? res.json.items?.find((e) => e.traceId === traceId) : undefined;
  });

describe("audit", { skip: needs(cfg, "cap:audit") }, () => {
  test("a create produces an entry with the actor, tenant, resource and trace id", async () => {
    const trace = newTrace();
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: createBody, headers: { traceparent: trace.header } });
    assert.equal(res.status, 201);
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no audit entry appeared for the create");
    assert.equal(entry.kind, "create");
    assert.equal(entry.outcome, "succeeded");
    assert.equal(entry.tenantId, tenantA.id);
    assert.equal(entry.actor?.type, "user");
    assert.ok(entry.actor?.id, "the entry must name the actor");
    assert.equal(entry.resource?.id, res.json.id);
    assert.equal(entry.traceId, trace.traceId, "the entry's trace id must equal the request's");
  });

  test("an update records exactly the changed property with its old and new value", { skip: !updateBody && "no updateBody in the fixtures" }, async () => {
    const made = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: createBody });
    const path = `${collectionPath}/${made.json.id}`;
    const current = await request(cfg, { path, principal: "tenantA" });
    const trace = newTrace();
    const res = await request(cfg, { method: "PATCH", path, principal: "tenantA", body: updateBody, headers: { "content-type": "application/merge-patch+json", "if-match": current.headers.get("etag"), traceparent: trace.header } });
    assert.equal(res.status, 200);
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no audit entry appeared for the update");
    assert.equal(entry.kind, "update");
    const change = entry.changes?.find((c) => c.path === `/${Object.keys(updateBody)[0]}`);
    assert.ok(change, "the change set must contain the changed property");
    assert.equal(change.old, createBody[Object.keys(updateBody)[0]]);
    assert.equal(change.new, Object.values(updateBody)[0]);
    assert.equal(entry.changes.length, Object.keys(updateBody).length, "only changed properties belong in the change set");
  });

  test("a refused request produces a denied entry, and the response is the same 403", { skip: needs(cfg, "tenantALimited") }, async () => {
    const trace = newTrace();
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantALimited", body: createBody, headers: { traceparent: trace.header } });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no denied entry appeared");
    assert.equal(entry.outcome, "denied");
    assert.equal(entry.kind, "create");
    assert.equal(entry.tenantId, tenantA.id);
  });

  test("a host principal acting within a tenant produces a tenantSwitch entry for that tenant", { skip: needs(cfg, "hostSwitch") }, async () => {
    const trace = newTrace();
    const res = await request(cfg, { path: collectionPath, principal: "hostSwitch", headers: { "x-eolent-tenant": tenantA.id, traceparent: trace.header } });
    assert.equal(res.status, 200);
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no tenantSwitch entry appeared");
    assert.equal(entry.kind, "tenantSwitch");
    assert.equal(entry.outcome, "succeeded");
    assert.equal(entry.actor?.level, "host");
  });

  test("a refused tenant switch produces a denied tenantSwitch entry in the named tenant's log", { skip: needs(cfg, "host") }, async () => {
    const trace = newTrace();
    const res = await request(cfg, { path: collectionPath, principal: "host", headers: { "x-eolent-tenant": tenantA.id, traceparent: trace.header } });
    assertProblem(res, { status: 403, code: "Eolent.Forbidden" });
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no denied tenantSwitch entry appeared");
    assert.equal(entry.kind, "tenantSwitch");
    assert.equal(entry.outcome, "denied");
  });

  test("another tenant cannot see the entry, and its identifier looks like a nonexistent one", async () => {
    const trace = newTrace();
    await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: createBody, headers: { traceparent: trace.header } });
    const entry = await findEntry(trace.traceId);
    assert.ok(entry, "no audit entry appeared");
    const list = await request(cfg, { path: `${logPath}?filter[traceId]=${trace.traceId}`, principal: "tenantB" });
    assert.equal(list.status, 200);
    assert.ok(!list.json.items.some((e) => e.id === entry.id), "tenant B's log contains tenant A's entry");
    const other = await request(cfg, { path: `${logPath}/${entry.id}`, principal: "tenantB" });
    const missing = await request(cfg, { path: `${logPath}/${randomUUID()}`, principal: "tenantB" });
    const a = assertProblem(other, { status: 404, code: "Eolent.NotFound" });
    const b = assertProblem(missing, { status: 404, code: "Eolent.NotFound" });
    assert.deepEqual([a.type, a.title], [b.type, b.title]);
  });

  test("the log has no operation that creates, changes or deletes an entry", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await request(cfg, { method, path: logPath, principal: "tenantA", body: {} });
      assert.ok([404, 405].includes(res.status), `${method} on the log returned ${res.status}`);
    }
  });
});
