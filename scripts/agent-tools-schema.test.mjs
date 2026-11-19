// Tests of the agent tool rules in the manifest schema (ADR 0008).

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

const tool = (risk, requiresApproval) => ({
  manifestVersion: "0.2",
  name: "x",
  version: "0.1.0",
  agentTools: [{ operation: "xAList", description: "d", risk, ...(requiresApproval === undefined ? {} : { requiresApproval }) }]
});

test("low risk tools may run without approval or ask for it", () => {
  assert.equal(validate(tool("low")), true);
  assert.equal(validate(tool("low", true)), true);
});

test("medium and high risk tools must require approval", () => {
  assert.equal(validate(tool("medium", true)), true);
  assert.equal(validate(tool("medium", false)), false);
  assert.equal(validate(tool("medium")), false);
  assert.equal(validate(tool("high", true)), true);
  assert.equal(validate(tool("high", false)), false);
  assert.equal(validate(tool("high")), false);
});

test("low risk with approval explicitly false is accepted", () => {
  assert.equal(validate(tool("low", false)), true);
});

