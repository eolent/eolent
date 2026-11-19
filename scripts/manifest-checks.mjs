// Cross-reference rules for module manifests that JSON Schema cannot express (ADR 0004, ADR 0007).
// Used by validate.mjs and tested by manifest-checks.test.mjs.

function pascalModule(name) {
  return name
    .split(".")
    .map((seg) => seg.split("-").filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(""))
    .join(".");
}
function camelModule(name) {
  const joined = name.split(/[.-]/).filter(Boolean).map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
  return joined;
}
export function checkManifest(m) {
  const out = [];
  const prefix = pascalModule(m.name) + ".";
  const idPrefix = camelModule(m.name);
  const names = (list) => new Set((list ?? []).map((x) => x.name));
  const perms = new Map((m.permissions ?? []).map((p) => [p.name, p]));
  const features = new Map((m.features ?? []).map((f) => [f.name, f]));
  const entities = names(m.entities);
  const entityList = new Map((m.entities ?? []).map((e) => [e.name, e]));

  for (const [kind, list] of [["permission", m.permissions], ["feature", m.features], ["setting", m.settings]]) {
    for (const x of list ?? []) {
      if (!x.name.startsWith(prefix)) out.push(`${kind} "${x.name}" must start with "${prefix}"`);
    }
  }
  if (m.name === "eolent" || m.name.startsWith("eolent.")) out.push(`module name "${m.name}" uses the reserved namespace "eolent"`);
  for (const e of m.errors ?? []) {
    if (e.code === "Eolent" || e.code.startsWith("Eolent.")) out.push(`error code "${e.code}" uses the reserved namespace "Eolent"`);
    else if (!e.code.startsWith(prefix)) out.push(`error code "${e.code}" must start with "${prefix}"`);
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
    const seenParents = new Set([p.name]);
    for (let a = p.parent; a !== undefined && perms.has(a); a = perms.get(a).parent) {
      if (seenParents.has(a)) {
        out.push(`permission "${p.name}" has a cyclic parent chain through "${a}"`);
        break;
      }
      seenParents.add(a);
    }
    // The ancestors of a host permission are host permissions too.
    if ((p.scope ?? "tenant") === "host") {
      for (let a = p.parent, n = 0; a !== undefined && perms.has(a) && n < 100; a = perms.get(a).parent, n++) {
        if ((perms.get(a).scope ?? "tenant") !== "host") out.push(`host permission "${p.name}" has ancestor "${a}" that is not a host permission`);
      }
    }
  }
  const ops = new Map((m.operations ?? []).map((o) => [o.operationId, o]));
  for (const o of m.operations ?? []) {
    if (!new RegExp(`^${idPrefix}[A-Z]`).test(o.operationId)) out.push(`operationId "${o.operationId}" must start with "${idPrefix}" followed by a capital letter`);
    if (o.permission !== undefined && !perms.has(o.permission)) out.push(`operation "${o.operationId}" names undeclared permission "${o.permission}"`);
    if (o.feature !== undefined) {
      const f = features.get(o.feature);
      if (!f) out.push(`operation "${o.operationId}" names undeclared feature "${o.feature}"`);
      else if (f.valueType !== "boolean") out.push(`operation "${o.operationId}" names feature "${o.feature}" that is not boolean`);
      if ((o.tenancy ?? "tenantScoped") !== "tenantScoped") out.push(`operation "${o.operationId}" has a feature but is not tenantScoped`);
    }
    if (o.entity !== undefined) {
      const ent = entityList.get(o.entity);
      if (!ent) out.push(`operation "${o.operationId}" names undeclared entity "${o.entity}"`);
      else if ((ent.tenancy ?? "tenantScoped") !== (o.tenancy ?? "tenantScoped")) out.push(`operation "${o.operationId}" has tenancy "${o.tenancy ?? "tenantScoped"}" but its entity "${o.entity}" has "${ent.tenancy ?? "tenantScoped"}"`);
    }
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

