# ADR 0007: Manifest 0.2: operations, agent tools, errors and markers

- **Status:** Proposed
- **Date:** 2026-11-19

## Context

Manifest `0.1` describes what a module has (permissions, entities, events, UI) but not what it does. The specification work since then left four items for manifest `0.2`: a place to declare error codes ([error format](../../spec/error-format.md)), a marker for host-only permissions ([permissions](../../spec/permissions.md)), a marker for sensitive entity properties ([audit log](../../spec/audit.md), [events](../../spec/events.md)), and the approval data the audit log reserves for agent actions. The product principle that everything is introspectable also needs the link between an API operation and the permission, feature and entity it uses, so that tools and agents can read it without reading code.

## Decision

Manifest `0.2` is a breaking change to the draft `0.1`, which allows breaking changes until the first release. `manifestVersion` is `0.2`; the schema accepts no other value, and the examples are updated.

### Added

| Property | Purpose |
|---|---|
| `operations` | Each API operation: `operationId`, `method`, `path`, and the `permission`, `feature`, `tenancy` and `entity` it uses. It mirrors the `x-eolent-*` annotations of the OpenAPI description, so the two can be checked against each other |
| `agentTools` | The operations a module opts in to expose to AI agents: `operation`, a `description` for the model, a `risk` class and `requiresApproval` |
| `errors` | The error codes the module defines: `code`, `status`, `description` |
| `permissions[].scope` | `tenant` (default) or `host`. A host permission can only be held by host principals, and its ancestors are host permissions too |
| `entities[].sensitiveProperties` | Names of properties, as in the API, that hold sensitive values |

### Agent tools

- **Opt-in.** An operation is exposed to agents only when it is listed in `agentTools`. Nothing is exposed by default
- **Same authorization.** An agent call goes through the same checks as any call: authentication, tenancy, permission and feature, with the agent's permissions limited to those of the user it acts for ([permissions](../../spec/permissions.md)). `agentTools` adds exposure, never access
- **Risk class.** `low` is for operations that only read. `medium` is for changes that can be undone. `high` is for destructive, irreversible or security-relevant operations. An operation that does not use `GET` cannot be `low`, and a `DELETE` is `high`; the validation of manifests checks both
- **Approval.** `requiresApproval` says that a person must approve each call before it runs. It is always `true` for `high` risk and may be set for other classes. The approval is recorded in the `approval` object of the audit entry
- The full contract for agent tools, including the runtime behaviour and prompt-injection posture, is a later specification (H18) and its conformance category

### Checks that go beyond the schema

JSON Schema cannot express references between parts of a manifest. The validation of manifests in this repository checks that: names of permissions, features, settings and error codes start with the module's PascalCase name; operation ids start with its camelCase name; every named permission, feature, entity, operation and parent exists in the manifest; a feature named by an operation is boolean and the operation is tenant-scoped; there are no duplicates; and the host-permission and agent-risk rules above hold. Implementations run the same checks when loading a manifest.

## Consequences

- Tools, agents and the conformance suite can learn what a module offers and what it needs from the manifest alone, and the manifest can be compared with the running OpenAPI description (manifest consistency category)
- A module author now writes `operations` by hand or generates them from code; the duplication with OpenAPI is accepted for introspectability and is guarded by the consistency check
- A manifest that is valid under `0.1` is not valid under `0.2`. Since no release exists, only the examples in this repository are affected
- Permissions are declared by the module that owns them, so an operation cannot require a permission of another module in `0.2`
