# Conformance suite

> **Status:** the runner, the fixtures format and six categories (tenancy isolation, error format, permissions, API conventions, localization and audit, plus a fixed-tenant check) exist in [`conformance/`](../../conformance). Events and manifest consistency are planned.

The conformance suite is a set of black-box HTTP tests. It runs against any backend that claims to follow the Eolent specification, regardless of language. It runs from a container image or directly with Node.js 20 or later (the image and CI use Node.js 22), configured with the base URL of a test deployment.

## Test categories

| Category | Status | What it checks |
|---|---|---|
| Tenancy isolation | runs | Tenant A cannot read or list tenant B's data; header, token and host rules; unknown and non-UUID tenants |
| Error format | runs | Problem details shape, status codes, validation items, trace id, no caching |
| Permissions | runs | `403` for a missing permission on reads and changes, no permission named in the response, `401` before `403`, the access endpoint |
| API conventions | runs | Cursor pagination, limits, `includeTotal`, sorting, ETag and `If-Match` (`428`, `412`), `Idempotency-Key` |
| Localization | runs | `Accept-Language` and `Content-Language`, fallback, the public resources operation |
| Fixed tenant | runs when the deployment has one | A host principal needs no tenant signal; a tenant principal's mismatching header is still refused |
| Audit | runs, through the audit log API | Entries for changes, denied attempts and tenant switches appear within the wait time, with actor, tenant, change set and trace id; isolation of the log; the log is read-only |
| Events | planned, needs the conformance event sink | Published events use the CloudEvents envelope with tenant, trace and actor context, are recorded with the change, and match the manifest |
| Manifest consistency | planned | The permissions, entities and events exposed at run time match each module's manifest |

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
| `EOLENT_REQUIRE_ALL_PRINCIPALS` | Set to `1` to fail, instead of skipping tests, when an optional principal or its token is missing. CI sets it |
| `EOLENT_AUDIT_WAIT_MS` | How long the audit tests wait for an entry, default `60000`. Audit is asynchronous ([audit log](audit.md), section 1.1) |
| `EOLENT_REQUEST_TIMEOUT_MS` | Timeout of each request in milliseconds, default `10000` |
| `EOLENT_FIXTURES` | Path to a fixtures file, default `conformance/fixtures/example.json` |
| the variables named in `tokenEnv` | Bearer tokens of the principals in the fixtures file |

```bash
EOLENT_BASE_URL=http://localhost:8080 \
EOLENT_TOKEN_TENANT_A=... EOLENT_TOKEN_TENANT_B=... EOLENT_TOKEN_TENANT_A_LIMITED=... \
EOLENT_TOKEN_HOST=... EOLENT_TOKEN_HOST_SWITCH=... \
node --test conformance/tests/*.test.mjs
```

The same, from the image: `docker build -f conformance/Dockerfile -t eolent-conformance .`, then `docker run` with the settings above and a fixtures file mounted at the path in `EOLENT_FIXTURES`.

### Fixtures

A fixtures file ([schema](../../conformance/fixtures.schema.json)) names two tenants that exist in the deployment, the principals that can call it and one tenant-scoped collection that supports create and get by id. Tokens are never stored in the file; each principal names the environment variable that holds its token. The principals are: a user of each tenant who holds every permission of the collection and of the audit log (`tenantA`, `tenantB`), and optionally `tenantALimited` (a user of tenant A with none of those permissions), `host` (a host principal without the tenant-switching permission, which must not hold it) and `hostSwitch` (a host principal that holds it). The `resource` gives the collection path, a body to create and a merge patch to change it, the permission that creating needs, and a sortable property. The `deployment` says whether the deployment has a fixed tenant, which optional parts of the contract it supports (`concurrency`, `idempotency`, `localization`, `audit`), and a second culture it has messages for. The deployment is set up with these tenants and principals before the run. Tests that need an optional principal, or a capability the deployment does not have, are skipped with the reason; with `EOLENT_REQUIRE_ALL_PRINCIPALS=1` a missing principal is an error instead. The check for `405` sends `DELETE` to the collection, so it assumes that the collection exists and does not support `DELETE`.

The tests create entities and do not remove them, and the list checks read every page (up to 100 pages of 200 items), so use a test deployment that is reset between runs; one that accumulates more than that fails the list checks, with a message that says so, because a list that cannot be read in full proves nothing and a skipped test would look like a pass.

### Self-test

`npm run conformance:selftest` starts the stub backend, runs the suite and checks that it passes, then starts stubs that each break one rule (about 30 faults, such as reading another tenant's entity, listing across tenants, ignoring or mishandling the tenant header, a wrong problem type, a missing `Cache-Control`, `Allow` or `WWW-Authenticate` header, a missing validation item, or accepting an empty body) and checks that the suite fails on exactly the tests that cover that rule. CI runs it for every change.

## Running against a database matrix

Implementations that support several databases run the suite once per supported database, so dialect differences surface in CI rather than in production.

## Not yet covered

- **Events.** Published events cannot be observed from outside a backend. A conformance event sink, defined with the kernel (D12), is planned; until then the checks in the event specification cannot be run. The audit category does not need it: audit entries are read through the audit log API.
- The `agent actions` category (H18), the permission hierarchy (exact match is tested only indirectly), the localization of UI labels, and the manifest consistency checks against a running backend (D11).
