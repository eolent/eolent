// Proves the conformance runner itself: it must pass against the correct stub and fail, on exactly the
// expected tests, against each stub that breaks one rule on purpose.
//
//   node conformance/selftest.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createStub } from "./stub/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Every test that asserts the problem details shape. Faults that break the shape for all errors fail all of them.
const shapeTests = [
  "an unknown path returns 404 problem details",
  "a disallowed method returns 405 with an Allow header",
  "an unauthenticated request returns 401 with WWW-Authenticate: Bearer",
  "a malformed body returns a validation error with a Malformed item",
  "a body with missing required fields returns validation items",
  "an unsupported filter property returns an UnknownValue item for the parameter",
  "another tenant's entity looks exactly like a nonexistent one",
  "a tenant header that differs from the token is a tenant mismatch",
  "a tenant header naming a nonexistent tenant is also a tenant mismatch",
  "a tenant header that is not a UUID is a validation error",
  "a host principal without a tenant context gets TenantRequired",
  "a host principal without the switching permission cannot send a tenant header"
];

// fault -> the tests that must fail, and only those
const faults = {
  crossTenantRead: ["another tenant's entity looks exactly like a nonexistent one"],
  crossTenantList: ["another tenant cannot list the entity"],
  ignoreTenantHeader: ["a tenant header that differs from the token is a tenant mismatch", "a tenant header naming a nonexistent tenant is also a tenant mismatch"],
  unknownTenantNotMismatch: ["a tenant header naming a nonexistent tenant is also a tenant mismatch"],
  nonUuidHeaderAccepted: ["a tenant header that is not a UUID is a validation error"],
  hostWithoutTenantAllowed: ["a host principal without a tenant context gets TenantRequired"],
  hostHeaderAllowed: ["a host principal without the switching permission cannot send a tenant header"],
  wrongProblemType: shapeTests,
  noCacheControl: shapeTests,
  noWwwAuthenticate: ["an unauthenticated request returns 401 with WWW-Authenticate: Bearer"],
  no405Allow: ["a disallowed method returns 405 with an Allow header"],
  noMalformedItem: ["a malformed body returns a validation error with a Malformed item"],
  acceptsEmptyBody: ["a body with missing required fields returns validation items"],
  ignoreUnknownFilter: ["an unsupported filter property returns an UnknownValue item for the parameter"]
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
if (good.code !== 0) failures.push(`the correct stub failed the suite:\n${failedTests(good.out).join("\n") || good.out.slice(-1500)}`);
else {
  const counts = Object.fromEntries([...good.out.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]));
  // 16 tests run: 10 tenancy and 6 error format, none skipped, so the host tests really ran.
  if (counts.pass !== 16 || counts.skipped !== 0) failures.push(`the correct stub run should pass 16 tests with none skipped, got ${JSON.stringify(counts)}`);
  else console.log("ok: the correct stub passes 16 tests, none skipped");
  // Every title that a fault expects must exist, so renaming a test cannot silently break the self-test.
  const names = new Set([...good.out.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1].trim()));
  for (const title of new Set(Object.values(faults).flat())) {
    if (!names.has(title)) failures.push(`the self-test expects a test titled "${title}", which does not exist`);
  }
}

// 2. Each faulty stub fails on the expected tests.
for (const [fault, expected] of Object.entries(faults)) {
  const r = await withStub(fault, runSuite);
  const failed = failedTests(r.out).filter((n) => !n.startsWith("tenancy isolation") && !n.startsWith("problem details"));
  if (r.code === 0) {
    failures.push(`fault "${fault}" was not detected`);
  } else if (failedTests(r.out).length === 0) {
    failures.push(`fault "${fault}": the suite crashed without a failing test:\n${r.out.slice(-1500)}`);
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
