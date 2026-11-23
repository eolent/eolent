// Tests for the standards generator and its vendored schema.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MIN_RULE_TEXT_TOKENS,
  RULE_ID_PATTERN,
  checkRule,
  checkRulesFile,
  tokenize,
} from "./standards/rules-schema.mjs";
import { collectRules, compareRuleIds, isInactive, parseFrontmatter, renderRulesFile, run } from "./generate-standards.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = "Every HTTP endpoint in a controller must declare an explicit authorization policy.";

/** The SHA-256 of the vendored schema file. A change here must be copied from agent-platform, with a new schema version. */
const VENDORED_SCHEMA_SHA256 = "d0e47e45aaa429d9f6d60d5605015993c76ab1c7b0d53f7e0a2cb71c350a72a3";

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), "standards-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const doc = (id, rules, extra = "") =>
  `---\nid: ${id}\n${extra}rules:\n${rules}\n---\n\n# Title\n`;
const rule = (id, text = TEXT, severity = "warning") =>
  `  - id: ${id}\n    severity: ${severity}\n    appliesTo: ['src/**/*.cs']\n    text: ${text}`;

test("the vendored schema file is the one copied from agent-platform", () => {
  const bytes = readFileSync(join(repoRoot, "scripts/standards/standards-rules.v1.json"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), VENDORED_SCHEMA_SHA256);
});

test("the vendored limits are the ones ReviewBot enforces", () => {
  const schema = JSON.parse(readFileSync(join(repoRoot, "scripts/standards/standards-rules.v1.json"), "utf8"));
  assert.equal(schema.properties.version.const, 1);
  assert.equal(new RegExp(schema.properties.rules.items.properties.id.pattern).source, RULE_ID_PATTERN.source);
  assert.deepEqual(schema.properties.rules.items.properties.severity.enum, ["error", "warning"]);
  assert.equal(MIN_RULE_TEXT_TOKENS, 8);
});

test("tokenize lower-cases and splits on everything that is not a letter or digit", () => {
  assert.deepEqual(tokenize("Every `HTTP` endpoint, System.Exception"), ["every", "http", "endpoint", "system", "exception"]);
  assert.deepEqual(tokenize("--- *** ---"), []);
});

test("checkRule accepts a valid rule and rejects each way a rule can be wrong", () => {
  const good = { id: "ADR-0012-R1", severity: "error", appliesTo: ["src/**/*.cs"], text: TEXT, source: "docs/adr/x.md" };
  assert.deepEqual(checkRule(good, "r"), []);
  assert.ok(checkRule({ ...good, id: "ADR-12" }, "r").length > 0);
  assert.ok(checkRule({ ...good, severity: "info" }, "r").length > 0);
  assert.ok(checkRule({ ...good, appliesTo: [] }, "r").length > 0);
  assert.ok(checkRule({ ...good, text: "Declare an authorization policy." }, "r").length > 0);
  assert.ok(checkRule({ ...good, source: "" }, "r").length > 0);
});

test("checkRulesFile rejects an unsupported version", () => {
  assert.match(checkRulesFile({ version: 2, rules: [] })[0], /unsupported rules file version/);
  assert.deepEqual(checkRulesFile({ version: 1, rules: [] }), []);
});

test("compareRuleIds sorts digit runs as numbers", () => {
  const ids = ["ADR-0009-R10", "ADR-0009-R2", "ADR-0004-R1", "ADR-0009-R1"];
  assert.deepEqual([...ids].sort(compareRuleIds), ["ADR-0004-R1", "ADR-0009-R1", "ADR-0009-R2", "ADR-0009-R10"]);
});

test("parseFrontmatter reads the leading YAML block and returns null without one", () => {
  assert.deepEqual(parseFrontmatter("---\nid: ADR-1\n---\n# T\n"), { id: "ADR-1" });
  assert.equal(parseFrontmatter("# No frontmatter\n"), null);
});

test("collectRules gathers rules from docs/adr, docs and spec, sorted, with their source", () => {
  const root = workspace({
    "docs/adr/0002-b.md": doc("ADR-0002", rule("ADR-0002-R1")),
    "docs/adr/0001-a.md": doc("ADR-0001", rule("ADR-0001-R2") + "\n" + rule("ADR-0001-R10") + "\n" + rule("ADR-0001-R1")),
    "docs/architecture.md": doc("ARCH-1", rule("ARCH-1-R1")),
    "spec/tenancy.md": doc("SPEC-1", rule("SPEC-1-R1")),
    "docs/plain.md": "# No rules\n",
  });
  try {
    const { rules, problems } = collectRules(root);
    assert.deepEqual(problems, []);
    assert.deepEqual(rules.map((r) => r.id), ["ADR-0001-R1", "ADR-0001-R2", "ADR-0001-R10", "ADR-0002-R1", "ARCH-1-R1", "SPEC-1-R1"]);
    assert.equal(rules[0].source, "docs/adr/0001-a.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectRules skips superseded and deprecated documents", () => {
  const root = workspace({
    "docs/adr/0001-a.md": doc("ADR-0001", rule("ADR-0001-R1"), "status: superseded\n"),
    "docs/adr/0002-b.md": doc("ADR-0002", rule("ADR-0002-R1"), "status: deprecated\n"),
    "docs/adr/0003-c.md": doc("ADR-0003", rule("ADR-0003-R1"), "status: accepted\n"),
  });
  try {
    assert.deepEqual(collectRules(root).rules.map((r) => r.id), ["ADR-0003-R1"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isInactive reads the status from the frontmatter, else from the ADR's body line", () => {
  assert.equal(isInactive({ status: "Superseded" }, ""), true);
  assert.equal(isInactive({ status: "accepted" }, "- **Status:** Superseded by ADR 0012"), false);
  assert.equal(isInactive({}, "# ADR\n\n- **Status:** Superseded by [ADR 0012](0012.md)\n"), true);
  assert.equal(isInactive({}, "- **Status:** Deprecated"), true);
  assert.equal(isInactive({}, "- **Status:** Accepted"), false);
  assert.equal(isInactive({}, "no status line at all"), false);
  assert.equal(isInactive(null, "- **Status:** Accepted (amended 2026-11-22)"), false);
});

test("collectRules skips a document whose body status line says superseded", () => {
  const root = workspace({
    "docs/adr/0001-a.md": doc("ADR-0001", rule("ADR-0001-R1")) + "\n- **Status:** Superseded by ADR 0002\n",
    "docs/adr/0002-b.md": doc("ADR-0002", rule("ADR-0002-R1")) + "\n- **Status:** Accepted\n",
  });
  try {
    assert.deepEqual(collectRules(root).rules.map((r) => r.id), ["ADR-0002-R1"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectRules reports an id that does not start with the document id, a duplicate, a short rule and a missing document id", () => {
  const root = workspace({
    "docs/adr/0001-a.md": doc("ADR-0001", rule("ADR-0099-R1")),
    "docs/adr/0002-b.md": doc("ADR-0002", rule("ADR-0002-R1") + "\n" + rule("ADR-0002-R1")),
    "docs/adr/0003-c.md": doc("ADR-0003", rule("ADR-0003-R1", "Too short to check.")),
    "docs/adr/0004-d.md": "---\nrules:\n" + rule("ADR-0004-R1") + "\n---\n",
  });
  try {
    const problems = collectRules(root).problems.join("\n");
    assert.match(problems, /must start with the document id/);
    assert.match(problems, /duplicate rule id/);
    assert.match(problems, /at least 8 words/);
    assert.match(problems, /needs an `id`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run writes the file, and --check passes then fails when a document changes", () => {
  const root = workspace({ "docs/adr/0001-a.md": doc("ADR-0001", rule("ADR-0001-R1")) });
  try {
    assert.equal(run({ root, check: true }).ok, false); // nothing written yet
    assert.equal(run({ root }).ok, true);
    assert.equal(run({ root, check: true }).ok, true);
    writeFileSync(join(root, "docs/adr/0001-a.md"), doc("ADR-0001", rule("ADR-0001-R1", TEXT + " Also here.")));
    const stale = run({ root, check: true });
    assert.equal(stale.ok, false);
    assert.match(stale.message, /out of date/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderRulesFile is deterministic and its output passes the rules schema", () => {
  const rules = [{ id: "ADR-0001-R1", severity: "error", appliesTo: ["src/**/*.cs"], text: TEXT, source: "docs/adr/a.md" }];
  assert.equal(renderRulesFile(rules), renderRulesFile(rules));
  assert.match(renderRulesFile(rules), /^version: 1$/m);
});

test("the committed standards/rules.yaml is up to date with the documents", () => {
  assert.equal(run({ check: true }).ok, true);
});
