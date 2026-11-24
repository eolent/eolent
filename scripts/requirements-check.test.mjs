import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { check, findTags, parseRequirements } from "./requirements-check.mjs";

const prd = `# X
## 3. Concepts
- **Z9.** not a requirement
## 4. Requirements
### Companies
- **C1.** Create.
- **M2a.** Namesakes.
  - **C9.** a nested item is not a requirement
## 5. Lifecycles
- **L1.** after the section
`;

test("the requirement ids are the bold ids of the Requirements section", () => {
  assert.deepEqual(parseRequirements(prd).map((r) => r.id), ["C1", "M2a"]);
});

test("the real Parties PRD has its requirements", () => {
  const ids = parseRequirements(readFileSync(new URL("../docs/prd/parties.md", import.meta.url), "utf8")).map((r) => r.id);
  for (const id of ["C1", "C5", "M2a", "D4", "P3"]) assert.ok(ids.includes(id), id);
});

test("a pair that is not the argument of a call is not a tag", () => {
  assert.deepEqual(findTags('{ "requirement", "created" } ["requirement", "x"]'), []);
});

test("a misspelled prefix of the module is reported, a real other module is listed", () => {
  const result = check({ requirements: [{ id: "C1" }], tagsByFile: new Map([["a.cs", ["parites/C1", "Parties/C1", "invoicing/I3"]]]), module: "parties" });
  assert.equal(result.unknown.length, 1); // the case variant is an error
  assert.equal(result.warnings.length, 1); // the near miss is a warning: it may be a sibling module
  assert.deepEqual(result.otherModules, ["invoicing", "parites"]);
});

test("tags are read from traits and from other languages, several ids in one", () => {
  assert.deepEqual(findTags('[Trait("requirement", "C1,M2a")] x; test("a", { requirement: 1 }); tag("requirement", \'P3\')'), ["C1", "M2a", "P3"]);
});

test("missing, allowed and unknown requirements, and another module's tags are ignored", () => {
  const requirements = [{ id: "C1" }, { id: "C2" }, { id: "C5" }];
  const tagsByFile = new Map([["a.cs", ["C1", "X1", "invoicing/I3"]], ["b.cs", ["parties/C2"]]]);
  const result = check({ requirements, tagsByFile, module: "parties", allowMissing: ["C5"] });
  assert.deepEqual(result.covered.sort(), ["C1", "C2"]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.allowedMissing, ["C5"]);
  assert.deepEqual(result.unknown, [{ file: "a.cs", id: "X1" }]);
});

test("the command line refuses an option without its value and an unknown option", () => {
  const script = new URL("./requirements-check.mjs", import.meta.url).pathname;
  assert.equal(spawnSync("node", [script, "a.md", ".", "--module"]).status, 2);
  assert.equal(spawnSync("node", [script, "a.md", ".", "--module", "--json"]).status, 2);
  assert.equal(spawnSync("node", [script, "a.md", ".", "--bogus"]).status, 2);
});
