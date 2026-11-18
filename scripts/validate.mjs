// Validates the Eolent hub repository:
//   1. every .json file parses
//   2. every spec/examples/*.json validates against spec/module.schema.json
//   3. relative links in Markdown files resolve to existing files
// Usage: npm run validate

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipDirs = new Set([".git", "node_modules"]);
const errors = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const rel = (p) => relative(root, p).split(sep).join("/");
const files = walk(root);

// 1. JSON files parse
const parsed = new Map();
for (const file of files.filter((f) => f.endsWith(".json"))) {
  try {
    parsed.set(file, JSON.parse(readFileSync(file, "utf8")));
  } catch (e) {
    errors.push(`${rel(file)}: invalid JSON (${e.message})`);
  }
}

// 2. Examples validate against the manifest schema
const schemaPath = join(root, "spec", "module.schema.json");
const schema = parsed.get(schemaPath);
if (!schema) {
  errors.push("spec/module.schema.json: missing or unparseable, cannot validate examples");
} else {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const examplesDir = join(root, "spec", "examples") + sep;
  const examples = [...parsed.keys()].filter((f) => f.startsWith(examplesDir));
  if (examples.length === 0) errors.push("spec/examples: no example manifests found");
  for (const file of examples) {
    if (!validate(parsed.get(file))) {
      for (const err of validate.errors) {
        errors.push(`${rel(file)}: ${err.instancePath || "/"} ${err.message}`);
      }
    }
  }
}

// 3. Relative Markdown links resolve
const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const file of files.filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(linkRe)) {
    const target = match[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue; // external or in-page
    const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!path) continue;
    const resolved = path.startsWith("/") ? join(root, path) : resolve(dirname(file), path);
    if (!existsSync(resolved)) errors.push(`${rel(file)}: broken link to "${target}"`);
  }
}

if (errors.length > 0) {
  console.error(`Validation failed (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `OK: ${parsed.size} JSON file(s) parse, examples validate, Markdown links resolve.`
);
