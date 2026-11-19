// Assertions for the error format profile (spec/error-format.md).

import assert from "node:assert/strict";

const codeRe = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/;

// Checks that a response is a well-formed problem details response with the expected status and code.
export function assertProblem(res, { status, code }) {
  assert.equal(res.status, status, `expected status ${status}, got ${res.status}: ${res.text.slice(0, 200)}`);
  const type = res.headers.get("content-type") ?? "";
  assert.ok(type.startsWith("application/problem+json"), `content type must be application/problem+json, got "${type}"`);
  const p = res.json;
  assert.ok(p && typeof p === "object", "body must be a JSON object");
  for (const prop of ["type", "title", "status", "code", "traceId"]) {
    assert.ok(prop in p, `missing required property "${prop}"`);
  }
  assert.equal(p.status, res.status, "status in the body must equal the HTTP status");
  assert.match(p.code, codeRe, "code must follow the code grammar");
  assert.equal(p.type, `urn:eolent:error:${p.code}`, "type must be urn:eolent:error: followed by code");
  if (code !== undefined) assert.equal(p.code, code);
  const cache = res.headers.get("cache-control") ?? "";
  assert.ok(/no-store/.test(cache), `error responses must carry Cache-Control: no-store, got "${cache}"`);
  return p;
}

// Checks the items of a validation error.
export function assertValidationItems(problem) {
  assert.ok(Array.isArray(problem.errors) && problem.errors.length > 0, "errors must be a non-empty array");
  for (const item of problem.errors) {
    assert.match(item.code ?? "", codeRe, "each item needs a code that follows the grammar");
    assert.ok(!(item.pointer !== undefined && item.parameter !== undefined), "an item has at most one of pointer and parameter");
  }
}
