// Category: localization (spec/localization.md, section 8).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig, needs } from "../lib/config.mjs";
import { request } from "../lib/http.mjs";
import { assertProblem } from "../lib/problem.mjs";

const cfg = loadConfig();
const culture = cfg.deployment.culture;

describe("localization", { skip: needs(cfg, "cap:localization") || (!culture && "no culture in the fixtures") }, () => {
  test("an error is localized by Accept-Language and the code does not change", async () => {
    const path = `/api/v1/${randomUUID()}`;
    const en = await request(cfg, { path, principal: "tenantA", headers: { "accept-language": "en" } });
    const other = await request(cfg, { path, principal: "tenantA", headers: { "accept-language": culture } });
    const a = assertProblem(en, { status: 404, code: "Eolent.NotFound" });
    const b = assertProblem(other, { status: 404, code: "Eolent.NotFound" });
    assert.equal(en.headers.get("content-language")?.toLowerCase(), "en");
    assert.equal(other.headers.get("content-language")?.toLowerCase(), culture.toLowerCase());
    assert.notEqual(a.title, b.title, "the title must change with the language");
    assert.equal(a.code, b.code);
  });

  test("an unsupported language falls back and still names the language used", async () => {
    const res = await request(cfg, { path: `/api/v1/${randomUUID()}`, principal: "tenantA", headers: { "accept-language": "xx" } });
    assertProblem(res, { status: 404, code: "Eolent.NotFound" });
    assert.ok(res.headers.get("content-language"), "the response must carry Content-Language");
  });

  test("the resources operation serves the culture, with a region falling back to its language", async () => {
    const res = await request(cfg, { path: `/api/v1/localization/resources/${culture}-XX` });
    assert.equal(res.status, 200);
    assert.equal(res.json.culture.toLowerCase(), culture.toLowerCase());
    assert.ok(res.json.messages && Object.keys(res.json.messages).length > 0, "messages must not be empty");
    assert.equal(res.headers.get("content-language")?.toLowerCase(), res.json.culture.toLowerCase());
    assert.ok(res.headers.get("etag"), "the response must carry an ETag");
    assert.match(res.headers.get("cache-control") ?? "", /public/);
  });

  test("the resources operation needs no authentication and rejects a malformed culture", async () => {
    const bad = await request(cfg, { path: "/api/v1/localization/resources/not_a_culture" });
    const p = assertProblem(bad, { status: 400, code: "Eolent.Validation" });
    assert.ok(p.errors?.some((e) => e.code === "Eolent.Validation.Invalid" && e.parameter === "culture"));
  });
});
