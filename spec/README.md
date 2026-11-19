# Eolent specification

> **Status:** draft `0.1`. Everything here can change until the first release.

The specification is the language-neutral contract that every Eolent implementation follows and that the frontend kit consumes. It is checked by the conformance suite in [conformance/](conformance/README.md).

## Contents

| Path | Description |
|---|---|
| [module.schema.json](module.schema.json) | JSON Schema (2020-12) for the module manifest |
| [api-conventions.md](api-conventions.md) | OpenAPI profile: paths, naming, pagination, filtering, concurrency, permission annotations |
| [error-format.md](error-format.md) | Error responses: RFC 9457 problem details, status codes, error code registry, validation errors |
| [tenancy.md](tenancy.md) | Tenants, tenant resolution, data isolation rules, tenancy errors |
| [permissions.md](permissions.md) | Permissions (exact match), grants, the tenant administrator role, features, the access endpoint for the frontend |
| [audit.md](audit.md) | Audit entries: actor, tenant, change set, agent-for-user fields, reading the log |
| [localization.md](localization.md) | Localization files (ICU MessageFormat in JSON), culture fallback, frontend resources, `llms.txt` |
| [events.md](events.md) | Event envelope: a CloudEvents 1.0 profile with tenant, trace and actor context and delivery rules |
| [examples/](examples/) | Example manifests; each must validate against the schema |
| [conformance/](conformance/README.md) | Layout and categories of the black-box conformance tests |

## The module manifest

Every module ships a manifest that declares what it provides, so tools and agents can introspect a system without reading code:

- identity (`name`, `version`, `displayName`, `description`) and `dependencies`
- `permissions`, `features` and `settings`
- `entities`, with tenancy, soft-delete, auditing behaviour (`auditing`, `auditReads`) and `sensitiveProperties`
- `operations`: each API operation with the permission, feature and entity it uses. It is to be generated from the code by the build, not written by hand, and checked against the OpenAPI description once the consistency check lands (D11); until then it is not verified ([ADR 0007](../docs/adr/0007-manifest-0-2.md))
- `agentTools`: the operations the module opts in to expose to AI agents, each with a risk class and an approval flag
- `errors`: the error codes the module defines
- `permissions` can be marked `scope: host`
- `events` the module publishes or subscribes to
- `ui`: routes and menu items, each tied to a permission
- `localization` resources

## Versioning and changes

The manifest carries a `manifestVersion`. While the specification is a draft (`0.x`), breaking changes are allowed but must be recorded in the changelog below and, for significant ones, in an ADR in [`docs/adr/`](../docs/adr/).

### Changelog

- **0.1** (manifest) Initial draft of the module manifest schema.
- **0.1** (API conventions) Added the API conventions profile (draft).
- **0.1** (error format) Added the error format profile (draft).
- **0.1** (tenancy) Added the tenancy contract (draft) and the platform codes `Eolent.TenantRequired`, `Eolent.TenantNotFound`, `Eolent.TenantMismatch` and `Eolent.TenantSuspended` to the error format profile.
- **0.1** (permissions) Added the permission and feature contract (draft), the extension `x-eolent-feature`, the platform code `Eolent.FeatureDisabled` and the host permission `Tenants.Tenants.Switch`.
- **0.1** (API conventions) Filter and sort property names may be dotted paths to nested properties.
- **0.1** (audit) Added the audit log contract (draft) and the permission `Audit.AuditLogs.Read`, which the audit module declares in its manifest.
- **0.1** (events) Added the event envelope profile (draft), a CloudEvents 1.0 profile.
- **0.1** (manifest) Added the `entity` property of manifest events, which names the entity an event is about; it is required for events with direction `publishes`. This is a breaking change to the draft manifest `0.1`, which allows breaking changes until the first release; no example outside this repository is affected.
- **0.2** (manifest) Manifest `0.2`, see [ADR 0007](../docs/adr/0007-manifest-0-2.md): added `operations`, `agentTools`, `errors`, `permissions[].scope` and `entities[].sensitiveProperties`; `manifestVersion` is now `0.2`. `0.1` manifests are not valid under `0.2`. Added the example `tenants.module.json`, and cross-reference checks to the validation of manifests.
- **0.1** (localization) Added the localization contract (draft): message files in ICU MessageFormat, keys, culture fallback, the frontend resources operation `localizationResourcesGet` and the `llms.txt` convention. Resource file names in the manifest must be `<culture>.json`, and `localization.defaultCulture` is required when `localization` is present. This is a breaking change to draft manifest `0.2`, which is not bumped because no release exists: a `0.2` manifest with `localization` must add `defaultCulture` and name its resource files `<culture>.json`. Added the example resource files and checks in the validation of manifests, and the root `llms.txt`.
- **0.1** (permissions contract, draft) Permission checks are exact match: a parent no longer implies its children, and the hierarchy only groups permissions. Added the built-in tenant administrator role, which holds every tenant permission of the installed modules. The rule that the ancestors of a host permission are host permissions is removed. This changes the draft permission contract of 0.1, which is not released, so no grant migration is needed; the reason is that a permission added in an upgrade must not widen anyone's access silently.
- **0.2** (manifest, operations) `operations` is to be generated by the build and checked against the OpenAPI description (D11), not hand-written; the examples here are illustrative. See [ADR 0007](../docs/adr/0007-manifest-0-2.md) for the rule and its rationale. Only the description text of `operations` in `module.schema.json` changed.
- **0.1** (audit) Denied attempts are now audited (MUST): permission and feature denials and refused tenant switches, with a per-actor rate limit and the `suppressed` property. Added entry kind `read` and the optional entity property `auditReads` (read auditing, optional to implement, off by default). A decision recorded in the strategy repository (issue 2).
- **0.1** (audit) Audit is asynchronous through events: the audit event of a change is recorded with the change through the outbox, and the audit module writes the entry later, idempotently by event id. Added the events `audit.entry.recorded` and `audit.host-entry.recorded` (published by the platform for the audit module), the schema `audit-entry.schema.json` and the example `audit.module.json`. A host tenant switch now fails with `503 Eolent.Unavailable` when its audit event cannot be durably recorded: a new coupling between host requests and the event store. A decision recorded in the strategy repository (issue 4, AU2).
