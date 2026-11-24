import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, findTags, parseRequirements } from "./requirements-check.mjs";

const prd = `# X
## 3. Concepts
- **Z9.** not a requirement
## 4. Requirements
### Companies
- **C1.** Create.
- **M2a.** Namesakes.
  - **C9.** nested text is not a requirement id line start? (indented list items count)
## 5. Lifecycles
- **L1.** after the section
`;

test("the requirement ids are the bold ids of the Requirements section", () => {
  assert.deepEqual(parseRequirements(prd).map((r) => r.id), ["C1", "M2a", "C9"]);
});

test("the real Parties PRD has its requirements", () => {
  const ids = parseRequirements(readFileSync(new URL("../docs/prd/parties.md", import.meta.url), "utf8")).map((r) => r.id);
  for (const id of ["C1", "C5", "M2a", "D4", "P3"]) assert.ok(ids.includes(id), id);
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
