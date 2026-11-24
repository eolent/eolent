#!/usr/bin/env node
// Lists the requirements of a PRD that no test is tagged with (plan item: requirement ids linked to tests).
//
// A test names the requirement it proves with a tag in its source: an xunit trait [Trait("requirement", "C1")] (several ids: "C1,M2"), or the same two words in any
// other language: requirement then the id, as two string literals. Tests that belong to a PRD of another module carry the module as a prefix: "invoicing/I3".
//
// Usage: node scripts/requirements-check.mjs <prd.md> <tests-folder>... [--module <name>] [--fail-on-missing] [--allow-missing C5,D4] [--json]
// Exit code 1 when a test names a requirement the PRD does not have, or (with --fail-on-missing) a requirement has no test that is not on the allow list.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = new Set([".cs", ".ts", ".tsx", ".js", ".mjs"]);
const SKIP_FOLDERS = new Set(["node_modules", "bin", "obj", ".git", "dist"]);

/** The requirement ids of a PRD: the bold ids that start a list item in "## 4. Requirements". */
export function parseRequirements(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+\d*\.?\s*Requirements\b/i.test(l));
  if (start < 0) throw new Error("the PRD has no \"Requirements\" section");
  const ids = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const m = /^\s*[-*]\s+\*\*([A-Z]+\d+[a-z]?)\.\*\*/.exec(lines[i]);
    if (m) ids.push({ id: m[1], line: i + 1 });
  }
  return ids;
}

/** The ids a source text is tagged with: a map from "module/id" or "id" to the number of tags. */
export function findTags(source) {
  const tags = [];
  // A tag is the two literals as the arguments of a call or attribute: the closing parenthesis must follow, so a pair in an object or an array is not a tag.
  const pattern = /["']requirement["']\s*,\s*["']([^"']+)["']\s*\)/g;
  for (const m of source.matchAll(pattern)) {
    for (const id of m[1].split(",").map((s) => s.trim()).filter(Boolean)) tags.push(id);
  }
  return tags;
}

function* sourceFiles(folder) {
  for (const name of readdirSync(folder)) {
    if (SKIP_FOLDERS.has(name)) continue;
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (SOURCE_EXTENSIONS.has(extname(name))) yield path;
  }
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Compares the PRD with the tags of the test folders. */
export function check({ requirements, tagsByFile, module, allowMissing = [] }) {
  const known = new Set(requirements.map((r) => r.id));
  const covered = new Map();
  const unknown = [];
  const otherModules = new Set();
  const warnings = [];
  for (const [file, tags] of tagsByFile) {
    for (const tag of tags) {
      const slash = tag.indexOf("/");
      const tagModule = slash >= 0 ? tag.slice(0, slash) : module;
      const id = slash >= 0 ? tag.slice(slash + 1) : tag;
      if (tagModule !== module) {
        // Another module's requirement. A case variant of this module's name is a typo (an error); a near miss may be a typo or a sibling module (a warning).
        if (tagModule.toLowerCase() === module.toLowerCase()) unknown.push({ file, id: tag, reason: `the prefix "${tagModule}" is not "${module}"` });
        else {
          if (distance(tagModule, module) <= 2) warnings.push(`${file}: the prefix "${tagModule}" is close to "${module}": a typo?`);
          otherModules.add(tagModule);
        }
        continue;
      }
      if (!known.has(id)) unknown.push({ file, id });
      else covered.set(id, [...(covered.get(id) ?? []), file]);
    }
  }
  const allowed = new Set(allowMissing);
  const missing = requirements.filter((r) => !covered.has(r.id) && !allowed.has(r.id)).map((r) => r.id);
  const allowedMissing = requirements.filter((r) => !covered.has(r.id) && allowed.has(r.id)).map((r) => r.id);
  return { total: requirements.length, covered: [...covered.keys()], missing, allowedMissing, unknown, warnings, otherModules: [...otherModules].sort() };
}

function main(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const name = argv[i].slice(2);
      options[name] = ["fail-on-missing", "json"].includes(name) ? true : argv[++i];
    } else positional.push(argv[i]);
  }
  if (positional.length < 2) {
    console.error("Usage: requirements-check.mjs <prd.md> <tests-folder>... [--module <name>] [--fail-on-missing] [--allow-missing C5,D4] [--json]");
    return 2;
  }
  const [prd, ...folders] = positional;
  const module = options.module ?? basename(prd, ".md");
  const requirements = parseRequirements(readFileSync(prd, "utf8"));
  const tagsByFile = new Map();
  for (const folder of folders) for (const file of sourceFiles(folder)) {
    const tags = findTags(readFileSync(file, "utf8"));
    if (tags.length) tagsByFile.set(file, tags);
  }
  const result = check({ requirements, tagsByFile, module, allowMissing: (options["allow-missing"] ?? "").split(",").filter(Boolean) });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${module}: ${result.covered.length} of ${result.total} requirements have a test.`);
    if (result.missing.length) console.log(`No test: ${result.missing.join(", ")}`);
    if (result.allowedMissing.length) console.log(`No test, allowed: ${result.allowedMissing.join(", ")}`);
    for (const u of result.unknown) console.log(`Unknown requirement ${u.id} in ${u.file}` + (u.reason ? `: ${u.reason}` : ""));
    for (const w of result.warnings) console.log(`Warning: ${w}`);
    if (result.otherModules.length) console.log(`Tags of other modules (not checked here): ${result.otherModules.join(", ")}`);
  }
  return result.unknown.length || (options["fail-on-missing"] && result.missing.length) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
