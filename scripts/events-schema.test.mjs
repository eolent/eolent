// Tests of the event rules in the manifest schema (spec/events.md).

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

test("a published event needs an entity", () => {
  const m = { manifestVersion: "0.2", name: "x", version: "0.1.0", events: [{ name: "x.a.b", direction: "publishes" }] };
  assert.equal(validate(m), false);
  m.events[0].entity = "A";
  assert.equal(validate(m), true);
});

test("a subscribed event needs no entity", () => {
  const m = { manifestVersion: "0.2", name: "x", version: "0.1.0", events: [{ name: "y.a.b", direction: "subscribes" }] };
  assert.equal(validate(m), true);
});
