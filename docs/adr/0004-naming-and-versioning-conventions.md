# ADR 0004: Naming and versioning conventions

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Package names, namespaces, module names and version numbers are the first things users and tools depend on, and the hardest to change later. [ADR 0001](0001-repository-structure.md) fixed the repository split. This ADR fixes the names and the versioning rules used inside those repositories, so that humans and coding agents can predict them.

## Decision

### Names

| Thing | Convention | Example |
|---|---|---|
| NuGet packages and .NET root namespace | `Eolent.<Module>`, with one package per layer where a module is split | `Eolent.Kernel`, `Eolent.Identity`, `Eolent.Identity.Contracts` |
| .NET projects of a module | `Eolent.<Module>.Domain`, `.Application`, `.Contracts`, `.Infrastructure`, `.Api` | `Eolent.Identity.Application` |
| npm packages | `@eolent/<name>`, lowercase, hyphen-separated | `@eolent/core`, `@eolent/api-client` |
| Module name in the manifest | lowercase segments separated by dots (as defined by the manifest schema) | `identity`, `tenants` |
| Entities | PascalCase, singular | `User`, `Role` |
| Permissions | PascalCase segments separated by dots, by convention `Module.Resource.Action` | `Identity.Users.Create` |
| Features and settings | PascalCase segments separated by dots, starting with the module | `Identity.Password.MinimumLength` |
| Events | lowercase segments separated by dots, by convention `module.entity.action` | `identity.user.created` |
| Repositories | `eolent` (hub), `eolent-<language or kit>` for implementations | `eolent-dotnet`, `eolent-react` |

**Module prefix.** Permission, feature and setting names start with the module name converted to PascalCase: each dot-separated segment of the module name keeps its place as a segment, and within a segment hyphens are removed and the following letter is capitalised. So `identity` becomes `Identity`, `user-admin` becomes `UserAdmin` and `billing.invoices` becomes `Billing.Invoices`. Hyphens never appear in permission, feature or setting names.

The manifest schema ([spec/module.schema.json](../../spec/module.schema.json)) is authoritative for what is syntactically valid, including the number of segments and the characters allowed in each name. The patterns above are conventions within what the schema allows.

Names in the specification are language-neutral. A language implementation maps them to its idioms (for example PascalCase types) without changing the names that appear on the wire or in manifests.

### Versioning

- Implementation packages (NuGet and npm) follow [Semantic Versioning 2.0.0](https://semver.org).
- **Implementation packages are versioned in lockstep within a repository.** All `Eolent.*` NuGet packages share one version number per release, and all `@eolent/*` npm packages share another. This avoids a compatibility matrix between modules of the same release.
- **The specification has its own version.** The manifest format carries `manifestVersion` (currently `0.1`), and the specification as a whole is versioned in `spec/README.md`. Both use `MAJOR.MINOR` and are not SemVer: a new minor version may add optional features, and a new major version may break compatibility. Each implementation release states which specification version it conforms to.
- **Prerelease tags** apply to implementation packages and use `-alpha.N`, `-beta.N` and `-rc.N`, for example `0.1.0-alpha.3`.
- While the major version is `0`, breaking changes are allowed but must be recorded: in the changelog in `spec/README.md` for the specification (with an ADR when significant, as that file requires), and in the repository's own changelog for an implementation. From `1.0.0`, a public extension point is removed only after it has been marked deprecated for at least one minor release, with a message that names the replacement.
- Public extension points (module contracts, manifest schema, permission and event names) are the stable surface. Anything outside them is internal and may change in any release.

## Consequences

- Names can be derived without reading code, which helps generated code and agent tooling.
- Lockstep versions mean a small change to one module still bumps every package in that repository. This is accepted in exchange for a simple compatibility story.
- The conformance suite and the specification version give other implementations a fixed target independent of the C# release cycle.
