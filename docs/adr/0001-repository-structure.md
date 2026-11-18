# ADR 0001: Repository structure

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Eolent combines a language-neutral specification, a C# reference implementation, a React frontend kit and, later, implementations in other languages. These use different toolchains (.NET, pnpm, Maven or Gradle), different package registries (NuGet, npm, Maven) and different release cadences. A single monorepo for everything would mean slow CI, noisy dependency tooling and a high barrier for contributors who only touch one part. It would also make each repository a less focused context for AI coding agents.

## Decision

Use a small number of repositories, split by toolchain and release cadence, with the specification at the centre:

| Repository | Contents |
|---|---|
| `eolent/eolent` | Language-neutral hub: specification, conformance suite, documentation, roadmap, architecture decisions |
| `eolent/eolent-dotnet` | C# reference implementation (one .NET solution with modules as projects, versioned in lockstep), CLI, templates, sample application |
| `eolent/eolent-react` | pnpm monorepo of npm packages for the frontend kit |
| `eolent/.github` | Organisation profile and shared community files |
| `eolent/eolent-node`, `eolent/eolent-java` | Added only after the specification is stable |

The flagship repository is language-neutral because the contract is the product. Implementations are named by language, so adding another does not force a rename.

## Consequences

- Cross-repository changes are not atomic. The specification, a generated API client and a sample application that runs the frontend against the backend in CI mitigate this.
- Each repository has its own `AGENTS.md`, CI and release process.
- Package names use the `Eolent.*` and `@eolent/*` namespaces from the first commit.
