# ADR 0005: Technology choices and dependency policy

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

[Architecture](../architecture.md) names the main technologies of the reference implementation, and says that the licence terms of each dependency must be checked before it is adopted. Several widely used .NET libraries have moved to restrictive or commercial terms in recent years. Eolent is distributed under the Apache License 2.0 and is meant to be built on by others, including commercially, so a dependency whose terms limit redistribution would pass that limit on to every user.

## Decision

### Dependency policy

1. A runtime dependency of Eolent packages must be available under a permissive licence (Apache-2.0, MIT, BSD or similar) that allows redistribution as part of a commercial product.
2. Libraries under copyleft, source-available or paid terms are not used as dependencies of core packages. They may be supported through optional, separate packages that users opt into knowingly.
3. Third-party types do not appear in public module contracts where a thin abstraction is practical. Each abstraction records an exit option: what we would switch to if the licence or maintenance of the library changes.
4. Licences are checked when a dependency is added and re-checked before each release. The result is recorded in the table below.

### Choices

| Concern | Decision | Notes |
|---|---|---|
| Domain events, outbox, job scheduling | Own small abstractions in the kernel (domain event publisher, transactional outbox, job scheduler interface) | Keeps third-party messaging types out of module APIs |
| Job engine behind the scheduler interface | Quartz.NET | Replaceable behind the interface |
| Message broker integration | Not part of the kernel. An optional module may be added later, for example on Wolverine | Opt-in, separate package |
| Authentication | OpenIddict embedded in the identity module by default | |
| External identity providers | Supported: Eolent validates standard OIDC/JWT tokens only, so any compliant provider (for example Keycloak, Microsoft Entra ID, ZITADEL) can replace the embedded server | The specification and conformance suite test tokens, not the server |
| Validation | FluentValidation | |
| Logging | Serilog | |
| Data access | EF Core, with Dapper for hot read paths (outside core modules, or behind a dialect-aware abstraction) | See [architecture](../architecture.md) for database tiers |
| Frontend UI kit | Tailwind CSS with shadcn/ui components, and TanStack Table for data grids | Components are copied as source into the frontend kit, so there is no runtime UI framework dependency |

### Licence check (2026-11-18)

Checked against the package metadata published on NuGet and the licence files in each project's repository.

| Library | Licence found | Used? |
|---|---|---|
| Quartz.NET | Apache-2.0 | Yes |
| Wolverine | MIT | Optional module only |
| OpenIddict | Apache-2.0 | Yes |
| FluentValidation | Apache-2.0 | Yes |
| Serilog | Apache-2.0 | Yes |
| Dapper | Apache-2.0 | Yes |
| Hangfire | Multi-licensed: LGPL v3 for the open-source edition, plus a paid edition | No |
| MediatR | Reciprocal Public License 1.5, or a paid commercial licence | No |
| MassTransit (version 9) | Proprietary commercial licence | No |

Licences can change, so this table is a snapshot and must be refreshed under rule 4.

## Consequences

- Eolent owns a small amount of infrastructure code (domain events, outbox, scheduler interface). It is covered by the kernel's tests and the conformance suite.
- Users can plug in a different identity provider or job engine without changes to modules.
- Users who want a full message bus can opt into an optional module, or use their own, without it becoming a dependency of everyone.
- A change of any listed library's licence requires a new ADR or an update to this one, and a switch via the recorded exit option.
