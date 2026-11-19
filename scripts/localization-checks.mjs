// Checks for localization resource files of a module manifest (spec/localization.md).
// Pure functions: the caller reads and parses the files.

import { pascalModule } from "./manifest-checks.mjs";

const keyRe = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/;

// Whether the braces of an ICU message are balanced, honouring ICU quoting:
// '{' and '}' between apostrophes are literal, and '' is a literal apostrophe.
export function bracesBalanced(message) {
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < message.length; i++) {
    const c = message[i];
    if (c === "'") {
      if (message[i + 1] === "'") {
        i++;
      } else if (quoted) {
        quoted = false;
      } else if (message[i + 1] === "{" || message[i + 1] === "}") {
        quoted = true;
      }
    } else if (!quoted && c === "{") {
      depth++;
    } else if (!quoted && c === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !quoted;
}

// manifest: the parsed manifest. files: Map of resource path (as listed in the manifest) to parsed JSON, or
// undefined for a file that could not be read.
export function checkLocalization(manifest, files) {
  const out = [];
  const loc = manifest.localization;
  if (!loc) return out;
  const prefix = pascalModule(manifest.name) + ".";
  const resources = loc.resources ?? [];
  const cultureOf = (path) => path.split("/").pop().replace(/\.json$/, "");
  const byCulture = new Map(resources.map((r) => [cultureOf(r), r]));
  if (byCulture.size !== resources.length) out.push("localization.resources lists two files for one culture");
  if (loc.defaultCulture !== undefined && !byCulture.has(loc.defaultCulture)) {
    out.push(`localization.defaultCulture "${loc.defaultCulture}" has no file in resources`);
  }
  for (const path of resources) {
    const content = files.get(path);
    if (content === undefined) {
      out.push(`resource file "${path}" is missing or not valid JSON`);
      continue;
    }
    if (content === null || typeof content !== "object" || Array.isArray(content)) {
      out.push(`resource file "${path}" must be a JSON object`);
      continue;
    }
    for (const [key, value] of Object.entries(content)) {
      if (typeof value !== "string") out.push(`${path}: value of "${key}" must be a string`);
      else if (!bracesBalanced(value)) out.push(`${path}: message "${key}" has unbalanced braces`);
      if (!keyRe.test(key)) out.push(`${path}: key "${key}" is not a dotted PascalCase name`);
      else if (key.startsWith("Eolent.")) out.push(`${path}: key "${key}" uses the reserved prefix "Eolent."`);
      else if (!key.startsWith(prefix)) out.push(`${path}: key "${key}" must start with "${prefix}"`);
    }
  }
  // Every key the manifest names must exist in the default culture file.
  const defaults = files.get(byCulture.get(loc.defaultCulture));
  if (defaults && typeof defaults === "object") {
    const need = [];
    for (const r of manifest.ui?.routes ?? []) if (r.titleKey) need.push(r.titleKey);
    for (const i of manifest.ui?.menu ?? []) if (i.titleKey) need.push(i.titleKey);
    for (const e of manifest.errors ?? []) need.push(`${e.code}.Title`);
    for (const key of new Set(need)) {
      if (!(key in defaults)) out.push(`default culture file lacks the key "${key}" that the manifest names`);
    }
  }
  // A key in another culture must also exist in the default culture file.
  if (defaults && typeof defaults === "object") {
    for (const path of resources) {
      if (path === byCulture.get(loc.defaultCulture)) continue;
      const content = files.get(path);
      if (!content || typeof content !== "object") continue;
      for (const key of Object.keys(content)) {
        if (!(key in defaults)) out.push(`${path}: key "${key}" has no counterpart in the default culture file`);
      }
    }
  }
  return out;
}
