# ADR 0007: Manifest 0.2: operations, agent tools, errors and markers

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Manifest `0.1` describes what a module has (permissions, entities, events, UI) but not what it does. The specification work since then left four items for manifest `0.2`: a place to declare error codes ([error format](../../spec/error-format.md)), a marker for host-only permissions ([permissions](../../spec/permissions.md)), a marker for sensitive entity properties ([audit log](../../spec/audit.md), [events](../../spec/events.md)), and the approval data the audit log reserves for agent actions. The product principle that everything is introspectable also needs the link between an API operation and the permission, feature and entity it uses, so that tools and agents can read it without reading code.

## Decision

Manifest `0.2` is a breaking change to the draft `0.1`, which allows breaking changes until the first release. `manifestVersion` is `0.2`; the schema accepts no other value, and the examples are updated.

### Added

| Property | Purpose |
|---|---|
| `operations` | Generated, not hand-written (see below). Each API operation: `operationId`, `method`, `path`, and the `permission`, `feature`, `tenancy` and `entity` it uses. It mirrors the `x-eolent-*` annotations of the OpenAPI description, so the two can be checked against each other |
| `agentTools` | The operations a module opts in to expose to AI agents: `operation`, a `description` for the model, a `risk` class and `requiresApproval` |
| `errors` | The error codes the module defines: `code`, `status`, `description` |
| `permissions[].scope` | `tenant` (default) or `host`. A host permission can only be held by host principals |
| `entities[].sensitiveProperties` | Names of properties, as in the API, that hold sensitive values |

### Agent tools

- **Opt-in.** An operation is exposed to agents only when it is listed in `agentTools`. Nothing is exposed by default
- **Same authorization.** An agent call goes through the same checks as any call: authentication, tenancy, permission and feature, with the agent's permissions limited to those of the user it acts for ([permissions](../../spec/permissions.md)). `agentTools` adds exposure, never access
- **Risk class.** `low` is for operations that only read. `medium` is for changes that can be undone. `high` is for destructive, irreversible or security-relevant operations. An operation that does not use `GET` cannot be `low`, and a `DELETE` is `high`; the validation of manifests checks both
- **Approval.** `requiresApproval` says that a person must approve each call before it runs. It is always `true` for `medium` and `high` risk ([ADR 0008](0008-agent-posture.md)) and may be set for `low`. The approval is recorded in the `approval` object of the audit entry
- The posture for agents is fixed in [ADR 0008](0008-agent-posture.md). The full contract for agent tools, including the runtime behaviour, is a later specification (H18) and its conformance category

### Checks that go beyond the schema

JSON Schema cannot express references between parts of a manifest. The validation of manifests in this repository checks that: names of permissions, features, settings and error codes start with the module's PascalCase name; operation ids start with its camelCase name; every named permission, feature, entity, operation and parent exists in the manifest; a feature named by an operation is boolean and the operation is tenant-scoped; an operation has the same tenancy as its entity; permission parent chains have no cycles; there are no duplicates; and the agent-risk rules above hold. Implementations SHOULD run the same checks when loading a manifest; the reference implementation of the loader is part of the kernel (D2). Uniqueness of operation ids across modules is checked when the modules are installed together, not by the check of a single manifest.

## Consequences

- Tools, agents and the conformance suite can learn what a module offers and what it needs from the manifest alone, and the manifest can be compared with the running OpenAPI description (manifest consistency category)
- An `operations` entry is not authoritative until it is verified: neither the generator nor the check against the OpenAPI description exists yet. Until the manifest consistency check lands with the OpenAPI generation (D11), nothing stops `operations` from drifting from the real API
- A module author is not to write `operations` by hand. The build is to generate that section of the manifest from the code, so the manifest stays self-contained and introspectable and nobody maintains it by hand. The OpenAPI annotations remain a second source of the same facts: the duplication is kept and guarded, and the consistency check against the OpenAPI description (D11) is to verify the generated section, so a bug in the generator is caught. Authors still write `agentTools`, which refer to the generated operation ids. Where the generated section is written (the committed manifest or a build output) is decided with the generator in D11. The `operations` in the examples of this repository are hand-written for illustration only
- A manifest that is valid under `0.1` is not valid under `0.2`. Since no release exists, only the examples in this repository are affected
- Permissions and features are declared by the module that owns them, so an operation cannot require a permission or a feature of another module in `0.2`
