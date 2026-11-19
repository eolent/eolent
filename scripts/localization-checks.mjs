// Checks for localization resource files of a module manifest (spec/localization.md).
// Pure functions: the caller reads and parses the files.

import { pascalModule } from "./manifest-checks.mjs";

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
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

// The argument names a message uses, or null when the message cannot be parsed.
// Handles simple arguments {name}, formatted ones {n, number} and plural/select forms with nested messages.
export function messageArguments(message) {
  const names = new Set();
  let i = 0;
  const parseMessage = (inside) => {
    while (i < message.length) {
      const c = message[i];
      if (c === "'") {
        if (message[i + 1] === "'") i += 2;
        else if (message[i + 1] === "{" || message[i + 1] === "}") {
          const end = message.indexOf("'", i + 1);
          if (end === -1) return false;
          i = end + 1;
        } else i++;
      } else if (c === "{") {
        i++;
        if (!parseArgument()) return false;
      } else if (c === "}") {
        return inside;
      } else i++;
    }
    return !inside;
  };
  const parseArgument = () => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*/.exec(message.slice(i));
    if (!m) return false;
    names.add(m[1]);
    i += m[0].length;
    if (message[i] === "}") { i++; return true; }
    if (message[i] !== ",") return false;
    i++;
    const t = /^\s*([a-z]+)\s*/.exec(message.slice(i));
    if (!t) return false;
    i += t[0].length;
    if (message[i] === "}") { i++; return true; }
    if (message[i] !== ",") return false;
    i++;
    if (["plural", "select", "selectordinal"].includes(t[1])) {
      // options: key {message} ...
      for (;;) {
        const o = /^\s*(offset:\s*\d+|[^\s{}]+)\s*/.exec(message.slice(i));
        if (message[i + (o ? o[0].length : 0)] === "}" && o && /^\s*$/.test(o[0])) return false;
        if (!o) { const ws = /^\s*/.exec(message.slice(i))[0]; i += ws.length; if (message[i] === "}") { i++; return true; } return false; }
        i += o[0].length;
        if (message[i] !== "{") return false;
        i++;
        if (!parseMessage(true)) return false;
        i++; // closing brace of the option
        const ws = /^\s*/.exec(message.slice(i))[0];
        i += ws.length;
        if (message[i] === "}") { i++; return true; }
      }
    }
    // style of number/date/time: skip to the closing brace
    const end = message.indexOf("}", i);
    if (end === -1) return false;
    i = end + 1;
    return true;
  };
  return parseMessage(false) ? names : null;
}

// manifest: the parsed manifest. files: Map of resource path (as listed in the manifest) to parsed JSON, or
// undefined for a file that could not be read.
export function checkLocalization(manifest, files) {
  const out = [];
  const loc = manifest.localization;
  if (!loc) {
    const names = [...(manifest.ui?.routes ?? []), ...(manifest.ui?.menu ?? [])].some((x) => x.titleKey) || (manifest.errors ?? []).length > 0;
    if (names) out.push("the manifest names title keys or error codes but has no localization block with a default culture file");
    return out;
  }
  const prefix = pascalModule(manifest.name) + ".";
  const resources = loc.resources ?? [];
  const cultureOf = (path) => path.split("/").pop().replace(/\.json$/, "");
  const byCulture = new Map(resources.map((r) => [cultureOf(r), r]));
  if (byCulture.size !== resources.length) out.push("localization.resources lists two files for one culture");
  if (new Set(resources.map((r) => cultureOf(r).toLowerCase())).size !== byCulture.size) {
    out.push("localization.resources lists two files whose cultures differ only in case");
  }
  if (loc.defaultCulture === undefined) {
    out.push("localization.defaultCulture is missing; every module with localization must name its default culture");
  } else if (!byCulture.has(loc.defaultCulture)) {
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
      else if (!bracesBalanced(value)) out.push(`${path}: message "${key}" has unbalanced braces or an unterminated quote`);
      if (!keyRe.test(key)) out.push(`${path}: key "${key}" is not a dotted PascalCase name`);
      else if (key.startsWith("Eolent.")) out.push(`${path}: key "${key}" uses the reserved prefix "Eolent."`);
      else if (!key.startsWith(prefix)) out.push(`${path}: key "${key}" must start with "${prefix}"`);
    }
  }
  // Every key the manifest names must exist in the default culture file.
  const defaults = files.get(byCulture.get(loc.defaultCulture));
  if (isObject(defaults)) {
    const need = [];
    for (const r of manifest.ui?.routes ?? []) if (r.titleKey) need.push(r.titleKey);
    for (const i of manifest.ui?.menu ?? []) if (i.titleKey) need.push(i.titleKey);
    for (const e of manifest.errors ?? []) need.push(`${e.code}.Title`);
    for (const key of new Set(need)) {
      if (!Object.hasOwn(defaults, key)) out.push(`default culture file lacks the key "${key}" that the manifest names`);
    }
  }
  // A key in another culture must also exist in the default culture file.
  if (isObject(defaults)) {
    for (const path of resources) {
      if (path === byCulture.get(loc.defaultCulture)) continue;
      const content = files.get(path);
      if (!isObject(content)) continue;
      for (const key of Object.keys(content)) {
        if (!Object.hasOwn(defaults, key)) out.push(`${path}: key "${key}" has no counterpart in the default culture file`);
      }
    }
  }
  // A Detail message may only use arguments that the manifest lists for its error code.
  const listed = new Map((manifest.errors ?? []).map((e) => [e.code, new Set(e.arguments ?? [])]));
  for (const path of resources) {
    const content = files.get(path);
    if (!isObject(content)) continue;
    for (const [key, value] of Object.entries(content)) {
      if (typeof value !== "string" || !key.endsWith(".Detail")) continue;
      const code = key.slice(0, -".Detail".length);
      if (!listed.has(code)) continue;
      const used = messageArguments(value);
      if (used === null) continue; // reported as unbalanced or unparseable above
      for (const name of used) {
        if (!listed.get(code).has(name)) out.push(`${path}: message "${key}" uses argument "${name}" that the manifest does not list for "${code}"`);
      }
    }
  }
  return out;
}
