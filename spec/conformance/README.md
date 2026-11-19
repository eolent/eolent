# Conformance suite

> **Status:** not implemented yet. This file describes the intended layout and categories.

The conformance suite is a set of black-box HTTP tests. It runs against any backend that claims to follow the Eolent specification, regardless of language. It is meant to run from a container image, configured with the base URL and credentials of a test deployment (for example `EOLENT_BASE_URL`).

## Test categories

| Category | Example checks |
|---|---|
| Tenancy isolation | Tenant A cannot read, update or list tenant B's data; a missing or unknown tenant is rejected in the documented way |
| Permissions | A caller without a permission receives `403` with an RFC 9457 problem details body; granted permissions allow the call |
| Error format | Validation and domain errors use the documented problem details shape and error codes |
| API conventions | Pagination, filtering, sorting and naming follow the OpenAPI profile |
| Audit | Mutating calls produce audit entries with actor, tenant and change details; agent calls record "agent acting for user" |
| Events (planned) | Published events use the CloudEvents envelope with tenant, trace and actor context, are recorded with the change, and match the manifest |
| Manifest consistency | The permissions, entities and events exposed at run time match each module's manifest |

## Running against a database matrix

Implementations that support several databases run the suite once per supported database, so dialect differences surface in CI rather than in production.

## Layout (planned)

```
conformance/
  tests/            test cases grouped by category
  fixtures/         tenants, users and permissions used by the tests
  Dockerfile        runner image
```
