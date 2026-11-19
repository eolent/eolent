# Conformance suite

> **Status:** skeleton. The runner, the fixtures format and two categories (tenancy isolation and error format) exist in [`conformance/`](../../conformance). The other categories below are planned.

The conformance suite is a set of black-box HTTP tests. It runs against any backend that claims to follow the Eolent specification, regardless of language. It runs from a container image or directly with Node.js 20 or later, configured with the base URL of a test deployment.

## Test categories

| Category | Example checks |
|---|---|
| Tenancy isolation | Tenant A cannot read, update or list tenant B's data; a missing or unknown tenant is rejected in the documented way |
| Permissions | A caller without a permission receives `403` with an RFC 9457 problem details body; granted permissions allow the call |
| Error format | Validation and domain errors use the documented problem details shape and error codes |
| API conventions | Pagination, filtering, sorting and naming follow the OpenAPI profile |
| Audit | Mutating calls produce audit entries with actor, tenant and change details; agent calls record "agent acting for user" |
| Events (planned, no runnable checks yet) | Published events use the CloudEvents envelope with tenant, trace and actor context, are recorded with the change, and match the manifest |
| Manifest consistency | The permissions, entities and events exposed at run time match each module's manifest |

## Layout

```
conformance/
  tests/              test cases, one file per category (Node.js test runner)
  lib/                configuration, HTTP client and the problem details assertions
  fixtures/           fixtures files that describe a test deployment
  fixtures.schema.json  JSON Schema for a fixtures file
  stub/               a minimal stub backend, used only to test the runner
  selftest.mjs        proves the runner: passes on the stub, fails on stubs that break one rule
  Dockerfile          runner image
```

## Running it

| Setting | Meaning |
|---|---|
| `EOLENT_BASE_URL` | Base URL of the deployment under test, required |
| `EOLENT_FIXTURES` | Path to a fixtures file, default `conformance/fixtures/example.json` |
| the variables named in `tokenEnv` | Bearer tokens of the principals in the fixtures file |

```bash
EOLENT_BASE_URL=http://localhost:8080 \
EOLENT_TOKEN_TENANT_A=... EOLENT_TOKEN_TENANT_B=... EOLENT_TOKEN_HOST=... \
node --test conformance/tests/tenancy.test.mjs conformance/tests/problem-details.test.mjs
```

The same, from the image: `docker build -f conformance/Dockerfile -t eolent-conformance .`, then `docker run` with the settings above and a fixtures file mounted at the path in `EOLENT_FIXTURES`.

### Fixtures

A fixtures file ([schema](../../conformance/fixtures.schema.json)) names two tenants that exist in the deployment, the principals that can call it (a token for each tenant, and optionally a host principal without the tenant-switching permission) and one tenant-scoped collection that supports create and get by id. Tokens are never stored in the file; each principal names the environment variable that holds its token. The deployment is set up with these tenants and principals before the run. Tests that need a principal the file does not have are skipped and say so.

### Self-test

`npm run conformance:selftest` starts the stub backend, runs the suite and checks that it passes, then starts stubs that each break one rule (reading another tenant's entity, listing across tenants, ignoring the tenant header, a wrong problem type, a missing `WWW-Authenticate` header) and checks that the suite fails on exactly the tests that cover that rule. CI runs it for every change.

## Running against a database matrix

Implementations that support several databases run the suite once per supported database, so dialect differences surface in CI rather than in production.

## Not yet covered

The audit and events categories need a way to observe audit entries and published events from outside the backend. That mechanism is not defined yet and will be added with those categories. Until then the checks in the audit and event specifications cannot be run.
