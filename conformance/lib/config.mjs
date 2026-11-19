// Reads the run configuration from the environment and the fixtures file.
//
//   EOLENT_BASE_URL   base URL of the deployment under test, for example http://localhost:8080 (required)
//   EOLENT_FIXTURES   path to a fixtures file (conformance/fixtures.schema.json), default conformance/fixtures/example.json
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
  const tokens = {};
  for (const [key, p] of Object.entries(fixtures.principals ?? {})) {
    if (p.tokenEnv) {
      const token = env[p.tokenEnv];
      if (!token) throw new Error(`principal "${key}": environment variable ${p.tokenEnv} is not set`);
      tokens[key] = token;
    }
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), fixtures, tokens };
}
