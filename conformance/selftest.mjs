// Proves the conformance runner itself: it must pass against the correct stub and fail, on exactly the
// expected tests, against each stub that breaks one rule on purpose. The expectations are in
// selftest-expectations.json.
//
//   node conformance/selftest.mjs

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createStub } from "./stub/server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expectations = JSON.parse(readFileSync(join(here, "selftest-expectations.json"), "utf8"));
const faults = Object.fromEntries(Object.entries(expectations.faults).map(([k, v]) => [k, v === "$shape" ? expectations.shapeTests : v]));

const testFiles = ["tenancy", "problem-details", "permissions", "api-conventions", "localization", "fixed-tenant", "audit"].map((f) => join(here, "tests", `${f}.test.mjs`));
const suites = /^(tenancy isolation|problem details|permissions|API conventions|localization|fixed tenant|audit|concurrency|idempotency)$/;

function runSuite(port, fixtures) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      EOLENT_BASE_URL: `http://127.0.0.1:${port}`,
      EOLENT_FIXTURES: join(here, "fixtures", `${fixtures}.json`),
      EOLENT_TOKEN_TENANT_A: "token-a",
      EOLENT_TOKEN_TENANT_B: "token-b",
      EOLENT_TOKEN_TENANT_A_LIMITED: "token-a-limited",
      EOLENT_TOKEN_HOST: "token-host",
      EOLENT_TOKEN_HOST_SWITCH: "token-host-switch",
      EOLENT_REQUIRE_ALL_PRINCIPALS: "1",
      EOLENT_AUDIT_WAIT_MS: "2500"
    };
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", ...testFiles], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function withStub(options, fn) {
  const server = createStub(options);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const failures = [];
const failedTests = (out) => [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()).filter((n) => !suites.test(n) && !n.endsWith(".mjs"));
const counts = (out) => Object.fromEntries([...out.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]));

// 1. The correct stub passes, in a deployment without a fixed tenant and in one with a fixed tenant. The number of
// skipped tests is fixed, so a wiring mistake cannot make tests disappear: 3 fixed-tenant tests are skipped in the
// first run, and the 2 tests that need a tenant signal are skipped in the second.
const runs = [
  { name: "no fixed tenant", fixtures: "example", options: {}, pass: 46, skipped: 3 },
  { name: "fixed tenant", fixtures: "example-fixed-tenant", options: { fixedTenant: true }, pass: 47, skipped: 2 }
];
let goodNames = new Set();
for (const run of runs) {
  const r = await withStub(run.options, (port) => runSuite(port, run.fixtures));
  const c = counts(r.out);
  if (r.code !== 0 || c.pass !== run.pass || c.skipped !== run.skipped) {
    failures.push(`the correct stub (${run.name}) should pass ${run.pass} tests with ${run.skipped} skipped, got ${JSON.stringify(c)}:\n${failedTests(r.out).join("\n") || r.out.slice(-1500)}`);
  } else {
    console.log(`ok: the correct stub passes (${run.name}): ${c.pass} tests, ${c.skipped} skipped`);
  }
  for (const m of r.out.matchAll(/^\s*ok \d+ - (.+?)(?: # SKIP.*)?$/gm)) goodNames.add(m[1].trim());
}

// 2. Every title that a fault expects must exist, so renaming a test cannot silently break the self-test.
for (const title of new Set(Object.values(faults).flat())) {
  if (!goodNames.has(title)) failures.push(`the self-test expects a test titled "${title}", which does not exist`);
}

// 3. Each faulty stub fails on exactly the expected tests.
for (const [fault, expected] of Object.entries(faults)) {
  const r = await withStub({ fault }, (port) => runSuite(port, "example"));
  const failed = failedTests(r.out);
  if (r.code === 0) {
    failures.push(`fault "${fault}" was not detected`);
  } else if (failed.length === 0) {
    failures.push(`fault "${fault}": the suite crashed without a failing test:\n${r.out.slice(-1500)}`);
  } else if (!expected.every((e) => failed.includes(e))) {
    failures.push(`fault "${fault}": expected failures ${JSON.stringify(expected.filter((e) => !failed.includes(e)))} did not happen`);
  } else if (failed.some((f) => !expected.includes(f))) {
    failures.push(`fault "${fault}": unexpected extra failures ${JSON.stringify(failed.filter((f) => !expected.includes(f)))}`);
  } else {
    console.log(`ok: fault "${fault}" is detected (${failed.length} test${failed.length === 1 ? "" : "s"})`);
  }
}

if (failures.length) {
  console.error(`Self-test failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Self-test passed.");
