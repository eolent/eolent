// Category: API conventions (spec/api-conventions.md, section 9).

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig, needs } from "../lib/config.mjs";
import { request } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath, createBody, updateBody, sortProperty } = cfg.fixtures.resource;

describe("API conventions", () => {
  const created = [];
  before(async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: { ...createBody, name: `${createBody.name} ${randomUUID()}` } });
      assert.equal(res.status, 201);
      created.push(res.json);
    }
  });

  test("a list returns the envelope with items", async () => {
    const res = await request(cfg, { path: collectionPath, principal: "tenantA" });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.items));
    assert.ok("nextCursor" in res.json || res.json.nextCursor === undefined);
  });

  test("following nextCursor returns every item once", async () => {
    const seen = [];
    let cursor;
    for (let page = 0; page < 1000; page++) {
      const q = `${collectionPath}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await request(cfg, { path: q, principal: "tenantA" });
      assert.equal(res.status, 200);
      assert.ok(res.json.items.length <= 1, "limit=1 must return at most one item");
      seen.push(...res.json.items.map((i) => i.id));
      cursor = res.json.nextCursor;
      if (!cursor) break;
    }
    assert.equal(new Set(seen).size, seen.length, "an item appeared on two pages");
    for (const c of created) assert.ok(seen.includes(c.id), "an item created earlier is missing from the pages");
  });

  test("a limit outside 1 to 200 is a validation error for the parameter", async () => {
    for (const limit of ["0", "201"]) {
      const res = await request(cfg, { path: `${collectionPath}?limit=${limit}`, principal: "tenantA" });
      const p = assertProblem(res, { status: 400, code: "Eolent.Validation" });
      assert.ok(p.errors?.some((e) => e.code === "Eolent.Validation.OutOfRange" && e.parameter === "limit"), `limit=${limit}: expected an OutOfRange item for limit`);
    }
  });

  test("totalCount is present only when includeTotal is true", async () => {
    const without = await request(cfg, { path: collectionPath, principal: "tenantA" });
    assert.equal(without.json.totalCount, undefined);
    const withTotal = await request(cfg, { path: `${collectionPath}?includeTotal=true&limit=1`, principal: "tenantA" });
    assert.equal(withTotal.status, 200);
    assert.ok(Number.isInteger(withTotal.json.totalCount) && withTotal.json.totalCount >= 3);
  });

  test("a declared sort property is accepted and an undeclared one is rejected", { skip: !sortProperty && "no sortProperty in the fixtures" }, async () => {
    const ok = await request(cfg, { path: `${collectionPath}?sort=-${sortProperty}`, principal: "tenantA" });
    assert.equal(ok.status, 200);
    const bad = await request(cfg, { path: `${collectionPath}?sort=noSuchProperty`, principal: "tenantA" });
    const p = assertProblem(bad, { status: 400, code: "Eolent.Validation" });
    assert.ok(p.errors?.some((e) => e.code === "Eolent.Validation.UnknownValue" && e.parameter === "sort"));
  });

  describe("concurrency", { skip: needs(cfg, "cap:concurrency") || !updateBody && "no updateBody in the fixtures" }, () => {
    test("a read returns the version as a property and as a strong ETag", async () => {
      const res = await request(cfg, { path: `${collectionPath}/${created[0].id}`, principal: "tenantA" });
      assert.equal(res.status, 200);
      assert.ok(res.json.version, "the resource must have a version property");
      assert.equal(res.headers.get("etag"), `"${res.json.version}"`);
    });

    test("a change without If-Match returns 428 and a stale one returns 412", async () => {
      const path = `${collectionPath}/${created[1].id}`;
      const none = await request(cfg, { method: "PATCH", path, principal: "tenantA", body: updateBody, headers: { "content-type": "application/merge-patch+json" } });
      assertProblem(none, { status: 428, code: "Eolent.PreconditionRequired" });
      const stale = await request(cfg, { method: "PATCH", path, principal: "tenantA", body: updateBody, headers: { "content-type": "application/merge-patch+json", "if-match": '"stale-version"' } });
      assertProblem(stale, { status: 412, code: "Eolent.PreconditionFailed" });
    });

    test("a change with the current version succeeds and returns a new version", async () => {
      const path = `${collectionPath}/${created[2].id}`;
      const current = await request(cfg, { path, principal: "tenantA" });
      const res = await request(cfg, { method: "PATCH", path, principal: "tenantA", body: updateBody, headers: { "content-type": "application/merge-patch+json", "if-match": current.headers.get("etag") } });
      assert.equal(res.status, 200);
      assert.notEqual(res.json.version, current.json.version);
    });
  });

  describe("idempotency", { skip: needs(cfg, "cap:idempotency") }, () => {
    test("the same key and body return the original result, another body returns 422", async () => {
      const key = randomUUID();
      const body = { ...createBody, name: `idempotent ${key}` };
      const first = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body, headers: { "idempotency-key": key } });
      assert.equal(first.status, 201);
      const again = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body, headers: { "idempotency-key": key } });
      assert.equal(again.json.id, first.json.id, "a repeated request must return the original result");
      const other = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: { ...body, name: "something else" }, headers: { "idempotency-key": key } });
      assertProblem(other, { status: 422, code: "Eolent.IdempotencyKeyReuse" });
    });
  });
});
