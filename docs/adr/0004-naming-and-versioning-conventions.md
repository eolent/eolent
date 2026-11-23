---
id: ADR-0004
rules:
  - id: ADR-0004-R1
    severity: warning
    appliesTo: ['src/**/*.cs', 'packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}']
    text: Permission, feature and setting names start with the module name converted to PascalCase and never contain hyphens.
  - id: ADR-0004-R2
    severity: warning
    appliesTo: ['src/**/*.cs', 'packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}']
    text: Event names are lowercase segments separated by dots, by convention module.entity.action, and the schema also permits hyphens inside a segment.
  - id: ADR-0004-R3
    severity: warning
    appliesTo: ['src/**/*.cs']
    text: Entity type names are PascalCase and singular, for example User or Role.
  - id: ADR-0004-R4
    severity: warning
    appliesTo: ['packages/**/package.json', 'apps/**/package.json']
    text: npm packages are named @eolent/<name>, lowercase and hyphen-separated.
  - id: ADR-0004-R5
    severity: warning
    appliesTo: ['src/*/Eolent.*.{Domain,Application,Contracts,Infrastructure,Api}/*.csproj']
    text: The .NET projects of a module are named Eolent.<Module>.Domain, .Application, .Contracts, .Infrastructure and .Api.
---
# ADR 0004: Naming and versioning conventions

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Package names, namespaces, module names and version numbers are the first things users and tools depend on, and the hardest to change later. [ADR 0001](0001-repository-structure.md) fixed the repository split. This ADR fixes the names and the versioning rules used inside those repositories, so that humans and coding agents can predict them.

## Decision

### Names

| Thing | Convention | Example |
|---|---|---|
| NuGet packages and .NET root namespace | `Eolent.<Module>` is the package that references a module's layers and is what applications install; the layer packages `Eolent.<Module>.<Layer>` are published separately where other modules need only a contract (for example `.Contracts`) | `Eolent.Kernel`, `Eolent.Identity`, `Eolent.Identity.Contracts` |
| .NET projects of a module | `Eolent.<Module>.Domain`, `.Application`, `.Contracts`, `.Infrastructure`, `.Api` | `Eolent.Identity.Application` |
| npm packages | `@eolent/<name>`, lowercase, hyphen-separated | `@eolent/core`, `@eolent/api-client` |
| Module name in the manifest | lowercase segments separated by dots (as defined by the manifest schema) | `identity`, `tenants` |
| Entities | PascalCase, singular | `User`, `Role` |
| Permissions | PascalCase segments separated by dots, by convention `Module.Resource.Action` | `Identity.Users.Create` |
| Features and settings | PascalCase segments separated by dots, starting with the module | `Identity.Password.MinimumLength` |
| Events | lowercase segments separated by dots, by convention `module.entity.action` (the schema also permits hyphens inside a segment) | `identity.user.created` |
| Repositories | `eolent` (hub), `eolent-<language or kit>` for implementations | `eolent-dotnet`, `eolent-react` |

**Module prefix.** Permission, feature and setting names start with the module name converted to PascalCase: each dot-separated segment of the module name keeps its place as a segment, and within a segment hyphens are removed and the following letter is capitalised. So `identity` becomes `Identity`, `user-admin` becomes `UserAdmin` and `billing.invoices` becomes `Billing.Invoices`. Hyphens never appear in permission, feature or setting names. The same conversion applies to .NET namespaces, project names and NuGet package names (`user-admin` becomes `Eolent.UserAdmin`) and to the equivalent identifiers in other languages.

The manifest schema ([spec/module.schema.json](../../spec/module.schema.json)) is authoritative for what is syntactically valid, including the number of segments and the characters allowed in each name. The patterns above are conventions within what the schema allows.

Names in the specification are language-neutral. A language implementation maps them to its idioms (for example PascalCase types) without changing the names that appear on the wire or in manifests.

### Versioning

- Implementation packages (NuGet and npm) follow [Semantic Versioning 2.0.0](https://semver.org).
- **Implementation packages are versioned in lockstep within a repository.** All `Eolent.*` NuGet packages share one version number per release, and all `@eolent/*` npm packages share another. This avoids a compatibility matrix between modules of the same release.
- **Module manifest versions.** The `version` in a module's manifest is a SemVer value. For modules in the Eolent repositories it equals the lockstep release version of the packages that implement them, so a release bumps every module. Third-party modules version themselves independently with SemVer. A dependency `versionRange` in a manifest is evaluated against the dependency's manifest `version`.
- **The specification has its own version.** The manifest format carries `manifestVersion` (currently `0.1`), and the specification as a whole carries the same version, stated in the status line and changelog of `spec/README.md`. Both use `MAJOR.MINOR` and are not SemVer: a new minor version may add optional features, and a new major version may break compatibility. Each implementation release states which specification version it conforms to, in its release notes and in the package README.
- **Prerelease tags** apply to implementation packages and use `-alpha.N`, `-beta.N` and `-rc.N`, for example `0.1.0-alpha.3`.
- While the major version is `0`, breaking changes are allowed but must be recorded: in the changelog in `spec/README.md` for the specification (with an ADR when significant, as that file requires), and in the repository's own changelog for an implementation. From implementation version `1.0.0` (for implementation packages) and from specification version `1.0` (for the specification and manifest schema), a public extension point is removed only after it has been marked deprecated for at least one minor release, with a message that names the replacement.
- Public extension points (module contracts, manifest schema, permission and event names) are the stable surface. Anything outside them is internal and may change in any release.

## Consequences

- The schema enforces syntax only. Several conventions here (the module prefix, PascalCase for features and settings, singular entity names) are not checked by it, so a linter or the conformance suite is needed to enforce them. Both are planned, not yet built.
- Names can be derived without reading code, which helps generated code and agent tooling.
- Lockstep versions mean a small change to one module still bumps every package in that repository. This is accepted in exchange for a simple compatibility story.
- The conformance suite and the specification version give other implementations a fixed target independent of the C# release cycle.
