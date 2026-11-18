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

| Concern | Decision | Exit option |
|---|---|---|
| Domain events, outbox, job scheduling | Own small abstractions in the kernel (domain event publisher, transactional outbox, job scheduler interface) | Nothing to exit: the code is ours. A broker or bus can be added behind the same interfaces |
| Job engine behind the scheduler interface | Quartz.NET | Another engine behind the scheduler interface, for example a database-polling worker written for Eolent |
| Message broker integration | Not part of the kernel. An optional module may be added later, for example on Wolverine | Optional and separate, so no core change is needed |
| Authentication | OpenIddict embedded in the identity module by default | Any OIDC/JWT-compliant provider, such as Keycloak, Microsoft Entra ID or ZITADEL, because Eolent validates standard tokens only |
| Validation | FluentValidation | Validation is declared through our own validation abstraction in module contracts, so another library can replace it |
| Logging | Serilog, behind `Microsoft.Extensions.Logging` | Any logging provider for `Microsoft.Extensions.Logging` |
| Telemetry | OpenTelemetry | Not applicable: it is the vendor-neutral standard |
| Caching and distributed state | `Microsoft.Extensions.Caching` abstractions, with StackExchange.Redis as the first provider | Another `IDistributedCache` implementation |
| Data access | EF Core, with Dapper for hot read paths (outside core modules, or behind a dialect-aware abstraction) | Dapper stays behind repository interfaces, so it can be replaced module by module |
| Frontend UI kit | Tailwind CSS with shadcn/ui components, and TanStack Table for data grids | shadcn/ui components are copied as source, so they are ours. Tailwind and TanStack Table are replaceable inside the kit |

[Architecture](../architecture.md) is updated by this ADR where it lists messaging libraries: the kernel contains no message-bus dependency.

### Licence check (2026-11-18)

Checked against the licence metadata published on NuGet and npm for the latest stable version, and against the licence files in each project's repository. The version is given because licence terms can differ between versions.

| Library | Version checked | Licence found | Status |
|---|---|---|---|
| Quartz.NET | 4.7.3 | Apache-2.0 | Adopted |
| OpenIddict | 7.9.0 | Apache-2.0 | Adopted |
| FluentValidation | 12.2.0 | Apache-2.0 | Adopted |
| Serilog | 4.4.0 | Apache-2.0 | Adopted |
| OpenTelemetry (.NET) | 1.21.0 | Apache-2.0 | Adopted |
| EF Core | 11.0.0 | MIT | Adopted |
| Dapper | 2.1.89 | Apache-2.0 | Adopted |
| StackExchange.Redis | 3.4.35 | MIT | Adopted (cache provider) |
| Tailwind CSS | 4.3.5 | MIT | Adopted |
| TanStack Table | 9.3.1 | MIT | Adopted |
| shadcn/ui | repository `main` | MIT | Adopted (source copied into the kit) |
| Wolverine | 6.64.2 | MIT | Optional module only |
| Hangfire | 1.8.25 | Multi-licensed: LGPL v3 for the open-source edition, plus a paid edition | Rejected |
| MediatR | 15.0.0 | Reciprocal Public License 1.5, or a paid commercial licence | Rejected |
| MassTransit | 9.3.0 | Proprietary commercial licence | Rejected |

Licences can change, so this table is a snapshot and must be refreshed under rule 4.

## Consequences

- Eolent owns a small amount of infrastructure code (domain events, outbox, scheduler interface). It is covered by the kernel's tests and the conformance suite.
- Users can plug in a different identity provider or job engine without changes to modules.
- Users who want a full message bus can opt into an optional module, or use their own, without it becoming a dependency of everyone.
- A change of any listed library's licence requires a new ADR or an update to this one, and a switch via the recorded exit option.
