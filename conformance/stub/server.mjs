// A minimal stub of an Eolent backend, used only to prove the conformance runner itself.
// It implements just enough of the specification for the first two categories (tenancy isolation and
// problem details) and can be told to break one rule on purpose, so the runner can be shown to fail.
//
//   node conformance/stub/server.mjs [--port 8080] [--fault <name>]
//
// Faults: crossTenantRead, crossTenantList, ignoreTenantHeader, wrongProblemType, noCacheControl, noWwwAuthenticate,
// no405Allow, hostWithoutTenantAllowed, hostHeaderAllowed, nonUuidHeaderAccepted, unknownTenantNotMismatch,
// noMalformedItem, acceptsEmptyBody, ignoreUnknownFilter, hostUnknownTenantNotFound.

import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const TENANT_A = "6b1f0f7e-3b0e-4b8c-8f6f-1a2d6f7c9e10";
export const TENANT_B = "c2d4e6f8-1a3b-4c5d-9e7f-0a1b2c3d4e5f";
export const TOKENS = { "token-a": { tenant: TENANT_A }, "token-b": { tenant: TENANT_B }, "token-host": { tenant: null } };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createStub({ fault } = {}) {
  const widgets = []; // { id, tenantId, name }

  return createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const traceId = /^00-([0-9a-f]{32})-/.exec(req.headers.traceparent ?? "")?.[1] ?? randomBytes(16).toString("hex");

    const problem = (status, code, title, extra = {}, headers = {}) => {
      const type = fault === "wrongProblemType" ? `urn:example:${code}` : `urn:eolent:error:${code}`;
      const cache = fault === "noCacheControl" ? {} : { "cache-control": "no-store" };
      res.writeHead(status, { "content-type": "application/problem+json", ...cache, ...headers });
      res.end(JSON.stringify({ type, title, status, code, traceId, ...extra }));
    };
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const path = url.pathname;
      const collection = path === "/api/v1/widgets";
      const item = /^\/api\/v1\/widgets\/([^/]+)$/.exec(path);
      if (!collection && !item) return problem(404, "Eolent.NotFound", "Not found");
      if (collection && !["GET", "POST"].includes(req.method)) {
        return problem(405, "Eolent.MethodNotAllowed", "Method not allowed", {}, fault === "no405Allow" ? {} : { allow: "GET, POST" });
      }
      if (item && req.method !== "GET") return problem(405, "Eolent.MethodNotAllowed", "Method not allowed", {}, { allow: "GET" });

      // Authentication
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      const principal = token ? TOKENS[token] : undefined;
      if (!principal) {
        const headers = fault === "noWwwAuthenticate" ? {} : { "www-authenticate": "Bearer" };
        return problem(401, "Eolent.Unauthenticated", "Authentication required", {}, headers);
      }

      // Tenancy
      const header = req.headers["x-eolent-tenant"];
      if (header !== undefined && !uuidRe.test(header) && fault !== "nonUuidHeaderAccepted") {
        return problem(400, "Eolent.Validation", "The request is not valid", {
          errors: [{ code: "Eolent.Validation.Invalid", parameter: "X-Eolent-Tenant", detail: "Must be a tenant id." }]
        });
      }
      let tenant = principal.tenant;
      if (tenant === null) {
        if (header !== undefined && fault === "hostUnknownTenantNotFound" && header.toLowerCase() !== TENANT_A && header.toLowerCase() !== TENANT_B) return problem(404, "Eolent.TenantNotFound", "Tenant not found");
        if (header !== undefined && fault !== "hostHeaderAllowed") return problem(403, "Eolent.Forbidden", "Forbidden");
        if (header === undefined && fault !== "hostWithoutTenantAllowed") return problem(400, "Eolent.TenantRequired", "A tenant is required");
        tenant = header ?? TENANT_A;
      }
      if (header !== undefined && header.toLowerCase() !== tenant && fault !== "ignoreTenantHeader" && principal.tenant !== null) {
        if (fault === "unknownTenantNotMismatch" && header.toLowerCase() !== TENANT_B) return problem(404, "Eolent.TenantNotFound", "Tenant not found");
        return problem(403, "Eolent.TenantMismatch", "Tenant mismatch");
      }

      if (item) {
        const w = widgets.find((x) => x.id === item[1] && (x.tenantId === tenant || fault === "crossTenantRead"));
        return w ? json(200, { id: w.id, name: w.name }) : problem(404, "Eolent.NotFound", "Not found");
      }

      if (req.method === "GET") {
        const filters = [...url.searchParams.keys()].filter((k) => k.startsWith("filter["));
        const bad = filters.filter((k) => k !== "filter[name]");
        if (bad.length && fault !== "ignoreUnknownFilter") {
          return problem(400, "Eolent.Validation", "The request is not valid", {
            errors: bad.map((k) => ({ code: "Eolent.Validation.UnknownValue", parameter: k, detail: "Unsupported filter." }))
          });
        }
        const items = widgets.filter((w) => w.tenantId === tenant || fault === "crossTenantList").map((w) => ({ id: w.id, name: w.name }));
        return json(200, { items, nextCursor: null });
      }

      // POST
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return problem(400, "Eolent.Validation", "The request is not valid", {
          errors: [{ code: fault === "noMalformedItem" ? "Eolent.Validation.Invalid" : "Eolent.Validation.Malformed", detail: "The body is not valid JSON." }]
        });
      }
      if ((typeof body?.name !== "string" || body.name === "") && fault !== "acceptsEmptyBody") {
        return problem(400, "Eolent.Validation", "The request is not valid", {
          errors: [{ code: "Eolent.Validation.Required", pointer: "/name", detail: "Name is required." }]
        });
      }
      const w = { id: randomUUID(), tenantId: tenant, name: body?.name ?? "" };
      widgets.push(w);
      json(201, { id: w.id, name: w.name });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const port = Number(arg("--port") ?? 8080);
  createStub({ fault: arg("--fault") }).listen(port, () => console.log(`stub listening on http://localhost:${port}`));
}
