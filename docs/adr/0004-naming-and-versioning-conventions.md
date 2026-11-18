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
| Permissions | `Module.Resource.Action`, PascalCase segments separated by dots | `Identity.Users.Create` |
| Features and settings | PascalCase segments separated by dots, starting with the module | `Identity.Password.MinimumLength` |
| Events | lowercase `module.entity.action` | `identity.user.created` |
| Repositories | `eolent` (hub), `eolent-<language or kit>` for implementations | `eolent-dotnet`, `eolent-react` |

Names in the specification are language-neutral. A language implementation maps them to its idioms (for example PascalCase types) without changing the names that appear on the wire or in manifests.

### Versioning

- Everything uses [Semantic Versioning 2.0.0](https://semver.org).
- **Implementation packages are versioned in lockstep within a repository.** All `Eolent.*` NuGet packages share one version number per release, and all `@eolent/*` npm packages share another. This avoids a compatibility matrix between modules of the same release.
- **The specification has its own version.** The manifest format carries `manifestVersion`; the specification as a whole is versioned in `spec/README.md`. Each implementation release states which specification version it conforms to.
- **Prerelease tags** use `-alpha.N`, `-beta.N` and `-rc.N`, for example `0.1.0-alpha.3`.
- While the major version is `0`, breaking changes are allowed but must appear in the changelog. From `1.0.0`, a public extension point is removed only after it has been marked deprecated for at least one minor release, with a message that names the replacement.
- Public extension points (module contracts, manifest schema, permission and event names) are the stable surface. Anything outside them is internal and may change in any release.

## Consequences

- Names can be derived without reading code, which helps generated code and agent tooling.
- Lockstep versions mean a small change to one module still bumps every package in that repository. This is accepted in exchange for a simple compatibility story.
- The conformance suite and the specification version give other implementations a fixed target independent of the C# release cycle.
