// Reads the run configuration from the environment and the fixtures file.
//
//   EOLENT_BASE_URL   base URL of the deployment under test, for example http://localhost:8080 (required)
//   EOLENT_FIXTURES   path to a fixtures file (conformance/fixtures.schema.json), default conformance/fixtures/example.json
//   EOLENT_REQUIRE_ALL_PRINCIPALS   set to 1 to fail, instead of skipping tests, when an optional principal or its token is missing (optional)
//   EOLENT_AUDIT_WAIT_MS   how long the audit tests wait for an entry to appear, default 60000 (optional)
//   EOLENT_REQUEST_TIMEOUT_MS   timeout of each request in milliseconds, default 10000 (optional)
//   tokens            read from the environment variables that the fixtures name in tokenEnv

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const optionalPrincipals = new Set(["host", "hostSwitch", "tenantALimited"]);

export function loadConfig(env = process.env) {
  const baseUrl = env.EOLENT_BASE_URL;
  if (!baseUrl) throw new Error("EOLENT_BASE_URL is not set");
  const path = resolve(env.EOLENT_FIXTURES ?? resolve(here, "../fixtures/example.json"));
  const fixtures = JSON.parse(readFileSync(path, "utf8"));
  const strict = env.EOLENT_REQUIRE_ALL_PRINCIPALS === "1";
  const tokens = {};
  for (const [key, p] of Object.entries(fixtures.principals ?? {})) {
    const token = env[p.tokenEnv];
    if (token) tokens[key] = token;
    else if (!optionalPrincipals.has(key) || strict) throw new Error(`principal "${key}": environment variable ${p.tokenEnv} is not set`);
    // An optional principal without a token is left out, and the tests that need it are skipped.
  }
  if (strict) {
    for (const key of optionalPrincipals) {
      if (!fixtures.principals?.[key]) throw new Error(`EOLENT_REQUIRE_ALL_PRINCIPALS is set but the fixtures have no "${key}" principal`);
    }
  }
  const timeoutMs = Number(env.EOLENT_REQUEST_TIMEOUT_MS ?? 10000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("EOLENT_REQUEST_TIMEOUT_MS must be a positive number");
  const auditWaitMs = Number(env.EOLENT_AUDIT_WAIT_MS ?? 60000);
  if (!Number.isFinite(auditWaitMs) || auditWaitMs <= 0) throw new Error("EOLENT_AUDIT_WAIT_MS must be a positive number");
  const deployment = { fixedTenant: false, capabilities: [], ...(fixtures.deployment ?? {}) };
  return { baseUrl: baseUrl.replace(/\/+$/, ""), fixtures, tokens, timeoutMs, auditWaitMs, deployment };
}

// Why a test is skipped, or false when it can run.
export function needs(cfg, ...names) {
  const missing = names.filter((n) => (n.startsWith("cap:") ? !cfg.deployment.capabilities.includes(n.slice(4)) : !cfg.tokens[n]));
  return missing.length ? `not available in this run: ${missing.join(", ")}` : false;
}
