// Proves the conformance runner itself: it must pass against the correct stub and fail, on exactly the
// expected tests, against each stub that breaks one rule on purpose.
//
//   node conformance/selftest.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createStub } from "./stub/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// fault -> substrings of the tests that must fail (and only those)
const faults = {
  crossTenantRead: ["another tenant's entity looks exactly like a nonexistent one"],
  crossTenantList: ["another tenant cannot list the entity"],
  ignoreTenantHeader: ["a tenant header that differs from the token is a tenant mismatch", "a tenant header naming a nonexistent tenant is also a tenant mismatch"],
  wrongProblemType: null, // many tests fail; only the exit code is checked
  noWwwAuthenticate: ["an unauthenticated request returns 401 with WWW-Authenticate: Bearer"]
};

function runSuite(port) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      EOLENT_BASE_URL: `http://127.0.0.1:${port}`,
      EOLENT_FIXTURES: join(here, "fixtures/example.json"),
      EOLENT_TOKEN_TENANT_A: "token-a",
      EOLENT_TOKEN_TENANT_B: "token-b",
      EOLENT_TOKEN_HOST: "token-host"
    };
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", join(here, "tests/tenancy.test.mjs"), join(here, "tests/problem-details.test.mjs")], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function withStub(fault, fn) {
  const server = createStub({ fault });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const failures = [];
const failedTests = (out) => [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());

// 1. The correct stub passes.
const good = await withStub(undefined, runSuite);
if (good.code !== 0) failures.push(`the correct stub failed the suite:\n${failedTests(good.out).join("\n")}`);
else console.log("ok: the correct stub passes");

// 2. Each faulty stub fails on the expected tests.
for (const [fault, expected] of Object.entries(faults)) {
  const r = await withStub(fault, runSuite);
  const failed = failedTests(r.out).filter((n) => !n.startsWith("tenancy isolation") && !n.startsWith("problem details"));
  if (r.code === 0) {
    failures.push(`fault "${fault}" was not detected`);
  } else if (expected && !expected.every((e) => failed.some((f) => f === e)) ) {
    failures.push(`fault "${fault}": expected failures ${JSON.stringify(expected)} but got ${JSON.stringify(failed)}`);
  } else if (expected && failed.some((f) => !expected.includes(f))) {
    failures.push(`fault "${fault}": unexpected extra failures ${JSON.stringify(failed.filter((f) => !expected.includes(f)))}`);
  } else {
    console.log(`ok: fault "${fault}" is detected${expected ? ` (${failed.length} test${failed.length === 1 ? "" : "s"})` : ""}`);
  }
}

if (failures.length) {
  console.error(`Self-test failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Self-test passed.");
