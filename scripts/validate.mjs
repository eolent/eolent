// Validates the Eolent hub repository:
//   1. every .json file parses
//   2. every spec/examples/*.json validates against spec/module.schema.json
//      and passes the cross-reference rules in checkManifest
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

// Cross-reference rules that JSON Schema cannot express (ADR 0004, ADR 0007).
function pascalModule(name) {
  return name
    .split(".")
    .map((seg) => seg.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(""))
    .join(".");
}
function camelModule(name) {
  const joined = name.split(/[.-]/).map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
  return joined;
}
function checkManifest(m) {
  const out = [];
  const prefix = pascalModule(m.name) + ".";
  const idPrefix = camelModule(m.name);
  const names = (list) => new Set((list ?? []).map((x) => x.name));
  const perms = new Map((m.permissions ?? []).map((p) => [p.name, p]));
  const features = new Map((m.features ?? []).map((f) => [f.name, f]));
  const entities = names(m.entities);

  for (const [kind, list] of [["permission", m.permissions], ["feature", m.features], ["setting", m.settings]]) {
    for (const x of list ?? []) {
      if (!x.name.startsWith(prefix)) out.push(`${kind} "${x.name}" must start with "${prefix}"`);
    }
  }
  for (const e of m.errors ?? []) {
    if (!e.code.startsWith(prefix)) out.push(`error code "${e.code}" must start with "${prefix}"`);
  }
  const dup = (kind, values) => {
    const seen = new Set();
    for (const v of values) {
      if (seen.has(v)) out.push(`duplicate ${kind} "${v}"`);
      seen.add(v);
    }
  };
  dup("permission", (m.permissions ?? []).map((p) => p.name));
  dup("error code", (m.errors ?? []).map((e) => e.code));
  dup("operationId", (m.operations ?? []).map((o) => o.operationId));
  dup("method and path", (m.operations ?? []).map((o) => `${o.method} ${o.path}`));
  dup("agent tool", (m.agentTools ?? []).map((t) => t.operation));

  for (const p of m.permissions ?? []) {
    if (p.parent !== undefined && !perms.has(p.parent)) out.push(`permission "${p.name}" has undeclared parent "${p.parent}"`);
    // The ancestors of a host permission are host permissions too.
    if ((p.scope ?? "tenant") === "host") {
      for (let a = p.parent, n = 0; a !== undefined && perms.has(a) && n < 100; a = perms.get(a).parent, n++) {
        if ((perms.get(a).scope ?? "tenant") !== "host") out.push(`host permission "${p.name}" has ancestor "${a}" that is not a host permission`);
      }
    }
  }
  const ops = new Map((m.operations ?? []).map((o) => [o.operationId, o]));
  for (const o of m.operations ?? []) {
    if (!o.operationId.startsWith(idPrefix)) out.push(`operationId "${o.operationId}" must start with "${idPrefix}"`);
    if (o.permission !== undefined && !perms.has(o.permission)) out.push(`operation "${o.operationId}" names undeclared permission "${o.permission}"`);
    if (o.feature !== undefined) {
      const f = features.get(o.feature);
      if (!f) out.push(`operation "${o.operationId}" names undeclared feature "${o.feature}"`);
      else if (f.valueType !== "boolean") out.push(`operation "${o.operationId}" names feature "${o.feature}" that is not boolean`);
      if ((o.tenancy ?? "tenantScoped") !== "tenantScoped") out.push(`operation "${o.operationId}" has a feature but is not tenantScoped`);
    }
    if (o.entity !== undefined && !entities.has(o.entity)) out.push(`operation "${o.operationId}" names undeclared entity "${o.entity}"`);
  }
  for (const t of m.agentTools ?? []) {
    const o = ops.get(t.operation);
    if (!o) out.push(`agent tool names undeclared operation "${t.operation}"`);
    else if (o.method !== "GET" && t.risk === "low") out.push(`agent tool "${t.operation}" changes data and cannot have risk "low"`);
    else if (o.method === "DELETE" && t.risk !== "high") out.push(`agent tool "${t.operation}" deletes data and must have risk "high"`);
  }
  // An event's entity must be declared in the same manifest's entities.
  for (const ev of m.events ?? []) {
    if (ev.entity !== undefined && !entities.has(ev.entity)) out.push(`event "${ev.name}" names undeclared entity "${ev.entity}"`);
  }
  for (const r of m.ui?.routes ?? []) {
    if (r.permission !== undefined && !perms.has(r.permission)) out.push(`ui route "${r.path}" names undeclared permission "${r.permission}"`);
  }
  for (const i of m.ui?.menu ?? []) {
    if (i.permission !== undefined && !perms.has(i.permission)) out.push(`ui menu item "${i.key}" names undeclared permission "${i.permission}"`);
  }
  return out;
}

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
  let validate = null;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    errors.push(`spec/module.schema.json: schema does not compile (${e.message})`);
  }
  if (validate) {
    const examplesDir = join(root, "spec", "examples") + sep;
    const examples = [...parsed.keys()].filter((f) => f.startsWith(examplesDir));
    if (examples.length === 0) errors.push("spec/examples: no example manifests found");
    for (const file of examples) {
      const manifest = parsed.get(file);
      if (!validate(manifest)) {
        for (const err of validate.errors) {
          errors.push(`${rel(file)}: ${err.instancePath || "/"} ${err.message}`);
        }
        continue; // the entity check below needs a schema-valid manifest
      }
      for (const problem of checkManifest(manifest)) errors.push(`${rel(file)}: ${problem}`);
    }
  }
}

// 3. Relative Markdown links resolve.
// Coverage note: only inline links of the form [text](target) are checked.
// Angle-bracket destinations ([x](<path with spaces.md>)), targets containing
// ")" or whitespace, reference-style links and HTML links are not checked.
const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const file of files.filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(linkRe)) {
    const target = match[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue; // external or in-page
    let path;
    try {
      path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    } catch {
      errors.push(`${rel(file)}: malformed link target "${target}"`);
      continue;
    }
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
