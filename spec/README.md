# Eolent specification

> **Status:** draft `0.1`. Everything here can change until the first release.

The specification is the language-neutral contract that every Eolent implementation follows and that the frontend kit consumes. It is checked by the conformance suite in [conformance/](conformance/README.md).

## Contents

| Path | Description |
|---|---|
| [module.schema.json](module.schema.json) | JSON Schema (2020-12) for the module manifest |
| [api-conventions.md](api-conventions.md) | OpenAPI profile: paths, naming, pagination, filtering, concurrency, permission annotations |
| [examples/](examples/) | Example manifests; each must validate against the schema |
| [conformance/](conformance/README.md) | Layout and categories of the black-box conformance tests |

Planned additions: error format profile (RFC 9457), event envelope (CloudEvents), tenancy and permission contract, audit log schema.

## The module manifest

Every module ships a manifest that declares what it provides, so tools and agents can introspect a system without reading code:

- identity (`name`, `version`, `displayName`, `description`) and `dependencies`
- `permissions`, `features` and `settings`
- `entities`, with tenancy, soft-delete and auditing behaviour
- `events` the module publishes or subscribes to
- `ui`: routes and menu items, each tied to a permission
- `localization` resources

## Versioning and changes

The manifest carries a `manifestVersion`. While the specification is a draft (`0.x`), breaking changes are allowed but must be recorded in the changelog below and, for significant ones, in an ADR in [`docs/adr/`](../docs/adr/).

### Changelog

- **0.1** Initial draft of the module manifest schema. Added the API conventions profile (draft).
