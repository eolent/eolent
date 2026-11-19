// Reads the run configuration from the environment and the fixtures file.
//
//   EOLENT_BASE_URL   base URL of the deployment under test, for example http://localhost:8080 (required)
//   EOLENT_FIXTURES   path to a fixtures file (conformance/fixtures.schema.json), default conformance/fixtures/example.json
//   EOLENT_REQUIRE_HOST   set to 1 to fail, instead of skipping the host tests, when the host principal or its token is missing (optional)
//   EOLENT_REQUEST_TIMEOUT_MS   timeout of each request in milliseconds, default 10000 (optional)
//   tokens            read from the environment variables that the fixtures name in tokenEnv

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const baseUrl = env.EOLENT_BASE_URL;
  if (!baseUrl) throw new Error("EOLENT_BASE_URL is not set");
  const path = resolve(env.EOLENT_FIXTURES ?? resolve(here, "../fixtures/example.json"));
  const fixtures = JSON.parse(readFileSync(path, "utf8"));
  if (env.EOLENT_REQUIRE_HOST === "1" && !fixtures.principals?.host) throw new Error("EOLENT_REQUIRE_HOST is set but the fixtures have no host principal");
  const tokens = {};
  for (const [key, p] of Object.entries(fixtures.principals ?? {})) {
    if (p.tokenEnv) {
      const token = env[p.tokenEnv];
      if (token) tokens[key] = token;
      else if (key !== "host" || env.EOLENT_REQUIRE_HOST === "1") throw new Error(`principal "${key}": environment variable ${p.tokenEnv} is not set`);
      // The optional host principal is skipped, with its tests, when its token is not set.
    }
  }
  const timeoutMs = Number(env.EOLENT_REQUEST_TIMEOUT_MS ?? 10000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("EOLENT_REQUEST_TIMEOUT_MS must be a positive number");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), fixtures, tokens, timeoutMs };
}
