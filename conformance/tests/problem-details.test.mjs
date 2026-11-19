// Category: error format (spec/error-format.md, section 8).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../lib/config.mjs";
import { request } from "../lib/http.mjs";
import { assertProblem, assertValidationItems } from "../lib/problem.mjs";

const cfg = loadConfig();
const { collectionPath } = cfg.fixtures.resource;

describe("problem details", () => {
  test("an unknown path returns 404 problem details", async () => {
    const res = await request(cfg, { path: `/api/v1/${randomUUID()}`, principal: "tenantA" });
    assertProblem(res, { status: 404, code: "Eolent.NotFound" });
  });

  test("a disallowed method returns 405 with an Allow header", async () => {
    const res = await request(cfg, { method: "DELETE", path: collectionPath, principal: "tenantA" });
    assertProblem(res, { status: 405, code: "Eolent.MethodNotAllowed" });
    assert.ok(res.headers.get("allow"), "a 405 response must carry an Allow header");
  });

  test("an unauthenticated request returns 401 with WWW-Authenticate: Bearer", async () => {
    const res = await request(cfg, { path: collectionPath });
    assertProblem(res, { status: 401, code: "Eolent.Unauthenticated" });
    assert.match(res.headers.get("www-authenticate") ?? "", /^Bearer/i);
  });

  test("a malformed body returns a validation error with a Malformed item", async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", rawBody: "{not json" });
    const p = assertProblem(res, { status: 400, code: "Eolent.Validation" });
    assertValidationItems(p);
    assert.ok(p.errors.some((e) => e.code === "Eolent.Validation.Malformed"));
  });

  test("a body with missing required fields returns validation items", async () => {
    const res = await request(cfg, { method: "POST", path: collectionPath, principal: "tenantA", body: {} });
    const p = assertProblem(res, { status: 400, code: "Eolent.Validation" });
    assertValidationItems(p);
  });

  test("an unsupported filter property returns an UnknownValue item for the parameter", async () => {
    const res = await request(cfg, { path: `${collectionPath}?filter[noSuchProperty]=x`, principal: "tenantA" });
    const p = assertProblem(res, { status: 400, code: "Eolent.Validation" });
    assertValidationItems(p);
    assert.ok(p.errors.some((e) => e.code === "Eolent.Validation.UnknownValue" && e.parameter));
  });
});
