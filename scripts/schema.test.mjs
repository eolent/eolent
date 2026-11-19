// Tests of rules that live in the manifest schema itself (spec/module.schema.json).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(join(root, "spec", "module.schema.json"), "utf8")));

const manifest = (entity) => ({ manifestVersion: "0.2", name: "x", version: "0.1.0", entities: [entity] });

test("auditReads is accepted alone and with auditing", () => {
  assert.equal(validate(manifest({ name: "A", auditReads: true })), true);
  assert.equal(validate(manifest({ name: "A", auditReads: true, auditing: true })), true);
});

test("auditReads without auditing is rejected", () => {
  assert.equal(validate(manifest({ name: "A", auditReads: true, auditing: false })), false);
});

test("auditing false alone is accepted", () => {
  assert.equal(validate(manifest({ name: "A", auditing: false })), true);
});
