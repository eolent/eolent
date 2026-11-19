// A minimal stub of an Eolent backend, used only to prove the conformance runner itself.
// It implements just enough of the specification for the conformance categories (tenancy isolation, problem
// details, permissions, API conventions, localization, fixed tenant and audit) and can be told to break one rule
// on purpose, so the runner can be shown to fail.
//
//   node conformance/stub/server.mjs [--port 8080] [--fault <name>] [--fixed-tenant]
//
// Faults, by area:
//   tenancy:      crossTenantRead, crossTenantList, ignoreTenantHeader, nonUuidHeaderAccepted, unknownTenantNotMismatch,
//                 hostWithoutTenantAllowed, hostHeaderAllowed, hostUnknownTenantNotFound
//   problems:     wrongProblemType, noCacheControl, noWwwAuthenticate, no405Allow, noMalformedItem, acceptsEmptyBody,
//                 ignoreUnknownFilter
//   permissions:  noPermissionCheck, accessCacheable
//   conventions:  ignoreCursor, noLimitValidation, noTotalCount, noEtag, noIfMatchRequired, idempotencyIgnored
//   localization: noContentLanguage, wrongResourcesCulture
//   audit:        noAudit, noDeniedAudit, noSwitchAudit, auditLeakAcrossTenants, auditWritable, wrongTraceId

import { createServer } from "node:http";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const TENANT_A = "6b1f0f7e-3b0e-4b8c-8f6f-1a2d6f7c9e10";
export const TENANT_B = "c2d4e6f8-1a3b-4c5d-9e7f-0a1b2c3d4e5f";

const ALL = ["Widgets.Widgets.Create", "Widgets.Widgets.Read", "Widgets.Widgets.Update", "Audit.AuditLogs.Read"];
// token -> principal. A tenant of null is a host principal; "switch" means it holds the tenant-switching permission.
export const TOKENS = {
  "token-a": { id: "2c4e6a80-1f3b-4d5c-8e7a-9b0c1d2e3f40", tenant: TENANT_A, permissions: ALL },
  "token-b": { id: "3d5f7b91-2a4c-4e6d-9f8b-0c1d2e3f4051", tenant: TENANT_B, permissions: ALL },
  "token-a-limited": { id: "4e608ca2-3b5d-4f7e-8a9c-1d2e3f405162", tenant: TENANT_A, permissions: [] },
  "token-host": { id: "5f719db3-4c6e-408f-9bad-2e3f40516273", tenant: null, level: "host", permissions: ALL },
  "token-host-switch": { id: "60822ec4-5d7f-4190-8cbe-3f4051627384", tenant: null, level: "host", switch: true, permissions: ["Tenants.Tenants.Switch", ...ALL] }
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages = {
  en: { "Eolent.NotFound.Title": "Not found", "Eolent.Validation.Title": "The request is not valid" },
  cs: { "Eolent.NotFound.Title": "Nenalezeno", "Eolent.Validation.Title": "Požadavek není platný" }
};

export function createStub({ fault, fixedTenant = false, auditDelayMs = 150 } = {}) {
  const widgets = []; // { id, tenantId, name, version }
  const audit = []; // entries
  const idempotency = new Map(); // key -> { hash, status, body }

  function record(entry) {
    if (fault === "noAudit") return;
    const e = { id: randomUUID(), occurredAt: new Date().toISOString(), ...entry };
    setTimeout(() => audit.push(e), auditDelayMs); // asynchronous: the entry appears later
  }

  return createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const traceHeader = /^00-([0-9a-f]{32})-/.exec(req.headers.traceparent ?? "")?.[1];
    const traceId = traceHeader ?? randomBytes(16).toString("hex");
    const lang = /^\s*([a-z]{2})/i.exec(req.headers["accept-language"] ?? "")?.[1]?.toLowerCase();
    const culture = messages[lang] ? lang : "en";

    const problem = (status, code, title, extra = {}, headers = {}) => {
      const type = fault === "wrongProblemType" ? `urn:example:${code}` : `urn:eolent:error:${code}`;
      const cache = fault === "noCacheControl" ? {} : { "cache-control": "no-store" };
      const localized = messages[culture][`${code}.Title`] ?? title;
      const language = fault === "noContentLanguage" ? {} : { "content-language": culture };
      res.writeHead(status, { "content-type": "application/problem+json", ...cache, ...language, ...headers });
      res.end(JSON.stringify({ type, title: localized, status, code, traceId: fault === "wrongTraceId" ? randomBytes(16).toString("hex") : traceId, ...extra }));
    };
    const json = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    const validation = (errors) => problem(400, "Eolent.Validation", "The request is not valid", { errors });

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const path = url.pathname;
      const collection = path === "/api/v1/widgets";
      const item = /^\/api\/v1\/widgets\/([^/]+)$/.exec(path);
      const access = path === "/api/v1/me/access";
      const auditList = path === "/api/v1/audit-logs";
      const auditItem = /^\/api\/v1\/audit-logs\/([^/]+)$/.exec(path);
      const resources = /^\/api\/v1\/localization\/resources\/([^/]+)$/.exec(path);

      // The public localization operation: no authentication, no tenant.
      if (resources) {
        if (req.method !== "GET") return problem(405, "Eolent.MethodNotAllowed", "Method not allowed", {}, { allow: "GET" });
        const tag = decodeURIComponent(resources[1]);
        if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(tag)) {
          return validation([{ code: "Eolent.Validation.Invalid", parameter: "culture", detail: "Not a culture tag." }]);
        }
        const lower = tag.toLowerCase();
        let resolved = messages[lower] ? lower : messages[lower.split("-")[0]] ? lower.split("-")[0] : "en";
        if (fault === "wrongResourcesCulture") resolved = "en";
        const body = { culture: resolved, messages: messages[resolved] };
        return json(200, body, {
          "content-language": resolved,
          etag: `"${createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12)}"`,
          "cache-control": "public, max-age=300"
        });
      }

      if (!collection && !item && !access && !auditList && !auditItem) return problem(404, "Eolent.NotFound", "Not found");
      const allowed = collection ? ["GET", "POST"] : item ? ["GET", "PATCH"] : auditList ? (fault === "auditWritable" ? ["GET", "POST"] : ["GET"]) : ["GET"];
      if (!allowed.includes(req.method)) {
        return problem(405, "Eolent.MethodNotAllowed", "Method not allowed", {}, fault === "no405Allow" ? {} : { allow: allowed.join(", ") });
      }

      // Authentication
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      const principal = token ? TOKENS[token] : undefined;
      if (!principal) {
        const headers = fault === "noWwwAuthenticate" ? {} : { "www-authenticate": "Bearer" };
        return problem(401, "Eolent.Unauthenticated", "Authentication required", {}, headers);
      }
      const actor = { type: "user", id: principal.id, ...(principal.level ? { level: principal.level } : {}) };
      const kindOf = req.method === "POST" ? "create" : req.method === "PATCH" ? "update" : "read";

      // Tenancy
      const header = req.headers["x-eolent-tenant"];
      const named = header && uuidRe.test(header) ? header.toLowerCase() : undefined;
      if (header !== undefined && !uuidRe.test(header) && fault !== "nonUuidHeaderAccepted") {
        return validation([{ code: "Eolent.Validation.Invalid", parameter: "X-Eolent-Tenant", detail: "Must be a tenant id." }]);
      }
      let tenant = principal.tenant;
      let switched = false;
      if (tenant === null) {
        if (header !== undefined && !principal.switch) {
          if (header !== undefined && fault === "hostUnknownTenantNotFound" && named !== TENANT_A && named !== TENANT_B) {
            return problem(404, "Eolent.TenantNotFound", "Tenant not found");
          }
          if (fault !== "hostHeaderAllowed") {
            if (fault !== "noDeniedAudit" && fault !== "noSwitchAudit") {
              const known = named === TENANT_A || named === TENANT_B ? named : null;
              setTimeout(() => record({ tenantId: known, actor, kind: "tenantSwitch", outcome: "denied", traceId }), 0);
            }
            return problem(403, "Eolent.Forbidden", "Forbidden");
          }
        }
        if (header === undefined && !(fixedTenant && principal.switch) && fault !== "hostWithoutTenantAllowed") {
          if (fixedTenant) return problem(403, "Eolent.Forbidden", "Forbidden");
          return problem(400, "Eolent.TenantRequired", "A tenant is required");
        }
        tenant = named ?? TENANT_A;
        switched = principal.switch === true;
      } else if (header !== undefined && named !== tenant && fault !== "ignoreTenantHeader") {
        if (fault === "unknownTenantNotMismatch" && named !== TENANT_B) return problem(404, "Eolent.TenantNotFound", "Tenant not found");
        return problem(403, "Eolent.TenantMismatch", "Tenant mismatch");
      }
      if (switched && fault !== "noSwitchAudit") {
        record({ tenantId: tenant, actor, kind: "tenantSwitch", outcome: "succeeded", traceId });
      }

      // Permissions
      const need = access ? undefined : auditList || auditItem ? "Audit.AuditLogs.Read" : req.method === "POST" ? "Widgets.Widgets.Create" : req.method === "PATCH" ? "Widgets.Widgets.Update" : "Widgets.Widgets.Read";
      if (need && !principal.permissions.includes(need) && fault !== "noPermissionCheck") {
        if (fault !== "noDeniedAudit") {
          record({ tenantId: tenant, actor, kind: auditList || auditItem ? "read" : kindOf, outcome: "denied", operation: auditList ? "auditAuditLogsList" : undefined, traceId });
        }
        return problem(403, "Eolent.Forbidden", "Forbidden");
      }

      if (access) {
        return json(200, { tenantId: tenant, permissions: [...new Set(principal.permissions)].sort(), features: {} }, {
          "cache-control": fault === "accessCacheable" ? "public, max-age=60" : "private, no-store"
        });
      }

      if (auditList || auditItem) {
        const visible = audit.filter((e) => e.tenantId === tenant || fault === "auditLeakAcrossTenants");
        if (auditItem) {
          const e = visible.find((x) => x.id === auditItem[1]);
          return e ? json(200, e) : problem(404, "Eolent.NotFound", "Not found");
        }
        if (req.method === "POST") return json(201, {});
        let items = visible;
        for (const [k, v] of url.searchParams) {
          const m = /^filter\[(.+)\]$/.exec(k);
          if (!m) continue;
          const get = (e) => m[1].split(".").reduce((o, p) => o?.[p], e);
          items = items.filter((e) => String(get(e)) === v);
        }
        items = [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return json(200, { items, nextCursor: null });
      }

      if (item) {
        const w = widgets.find((x) => x.id === item[1] && (x.tenantId === tenant || fault === "crossTenantRead"));
        if (!w) return problem(404, "Eolent.NotFound", "Not found");
        const etag = fault === "noEtag" ? {} : { etag: `"${w.version}"` };
        if (req.method === "GET") return json(200, { id: w.id, name: w.name, version: w.version }, etag);
        // PATCH, JSON merge patch with optimistic concurrency
        const match = req.headers["if-match"];
        if (match === undefined && fault !== "noIfMatchRequired") return problem(428, "Eolent.PreconditionRequired", "Precondition required");
        if (match !== undefined && match !== `"${w.version}"`) return problem(412, "Eolent.PreconditionFailed", "Precondition failed");
        let patch;
        try { patch = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return validation([{ code: "Eolent.Validation.Malformed", detail: "Not valid JSON." }]); }
        const before = w.name;
        if (typeof patch.name === "string") w.name = patch.name;
        w.version = String(Number(w.version) + 1);
        record({ tenantId: tenant, actor, kind: "update", outcome: "succeeded", operation: "widgetsWidgetsUpdate", resource: { type: "Widgets.Widget", id: w.id }, changes: [{ path: "/name", old: before, new: w.name }], traceId });
        return json(200, { id: w.id, name: w.name, version: w.version }, fault === "noEtag" ? {} : { etag: `"${w.version}"` });
      }

      if (req.method === "GET") {
        const bad = [];
        for (const k of url.searchParams.keys()) if (k.startsWith("filter[") && k !== "filter[name]") bad.push({ code: "Eolent.Validation.UnknownValue", parameter: k, detail: "Unsupported filter." });
        const sort = url.searchParams.get("sort");
        if (sort !== null && !["name", "-name"].includes(sort)) bad.push({ code: "Eolent.Validation.UnknownValue", parameter: "sort", detail: "Unsupported sort." });
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw === null ? 50 : Number(limitRaw);
        if (limitRaw !== null && fault !== "noLimitValidation" && !(Number.isInteger(limit) && limit >= 1 && limit <= 200)) {
          bad.push({ code: "Eolent.Validation.OutOfRange", parameter: "limit", detail: "Must be 1 to 200." });
        }
        if (bad.length && fault !== "ignoreUnknownFilter") return validation(bad);
        let items = widgets.filter((w) => w.tenantId === tenant || fault === "crossTenantList");
        const name = url.searchParams.get("filter[name]");
        if (name !== null) items = items.filter((w) => w.name === name);
        if (sort === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name));
        if (sort === "-name") items = [...items].sort((a, b) => b.name.localeCompare(a.name));
        const total = items.length;
        const start = fault === "ignoreCursor" ? 0 : Number(Buffer.from(url.searchParams.get("cursor") ?? "MA", "base64url").toString() || 0);
        const page = items.slice(start, start + (Number.isFinite(limit) && limit > 0 ? limit : 50));
        const next = start + page.length < total ? Buffer.from(String(start + page.length)).toString("base64url") : null;
        const body = { items: page.map((w) => ({ id: w.id, name: w.name })), nextCursor: next };
        if (url.searchParams.get("includeTotal") === "true" && fault !== "noTotalCount") body.totalCount = total;
        return json(200, body);
      }

      // POST /widgets
      const raw = Buffer.concat(chunks).toString("utf8");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return validation([{ code: fault === "noMalformedItem" ? "Eolent.Validation.Invalid" : "Eolent.Validation.Malformed", detail: "The body is not valid JSON." }]);
      }
      if ((typeof body?.name !== "string" || body.name === "") && fault !== "acceptsEmptyBody") {
        return validation([{ code: "Eolent.Validation.Required", pointer: "/name", detail: "Name is required." }]);
      }
      const key = req.headers["idempotency-key"];
      const hash = createHash("sha1").update(raw).digest("hex");
      if (key !== undefined && fault !== "idempotencyIgnored") {
        const seen = idempotency.get(`${tenant}:${key}`);
        if (seen) {
          if (seen.hash !== hash) return problem(422, "Eolent.IdempotencyKeyReuse", "Idempotency key reused");
          return json(seen.status, seen.body, { etag: `"${seen.body.version}"` });
        }
      }
      const w = { id: randomUUID(), tenantId: tenant, name: body?.name ?? "", version: "1" };
      widgets.push(w);
      const out = { id: w.id, name: w.name, version: w.version };
      if (key !== undefined) idempotency.set(`${tenant}:${key}`, { hash, status: 201, body: out });
      record({ tenantId: tenant, actor, kind: "create", outcome: "succeeded", operation: "widgetsWidgetsCreate", resource: { type: "Widgets.Widget", id: w.id }, changes: [{ path: "/name", new: w.name }], traceId });
      json(201, out, fault === "noEtag" ? {} : { etag: `"${w.version}"` });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const port = Number(arg("--port") ?? 8080);
  createStub({ fault: arg("--fault"), fixedTenant: process.argv.includes("--fixed-tenant") }).listen(port, () => console.log(`stub listening on http://localhost:${port}`));
}
