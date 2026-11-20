# ADR 0005: Technology choices and dependency policy

- **Status:** Accepted
- **Date:** 2026-11-18
- **Amended:** 2026-11-20, rule 4: the re-check step moved into the release checklist, and each code repository must run a licence scan in CI from its bootstrap

## Context

[Architecture](../architecture.md) names the main technologies of the reference implementation, and says that the licence terms of each dependency must be checked before it is adopted. Several widely used .NET libraries have moved to restrictive or commercial terms in recent years. Eolent is distributed under the Apache License 2.0 and is meant to be built on by others, including commercially, so a dependency whose terms limit redistribution would pass that limit on to every user.

## Decision

### Dependency policy

1. A runtime dependency of Eolent packages must be available under a permissive licence (Apache-2.0, MIT, BSD or similar) that allows redistribution as part of a commercial product.
2. Libraries under copyleft, source-available or paid terms are not used as dependencies of core packages. They may be supported through optional, separate packages that users opt into knowingly.
3. Third-party types do not appear in public module contracts where a thin abstraction is practical. Each abstraction records an exit option: what we would switch to if the licence or maintenance of the library changes.
4. Licences are checked when a dependency is added and re-checked before each release. The result is recorded in the table below. The maintainer who prepares a release runs the re-check. The step is in the [release checklist](../release-checklist.md), which is refined with the release process before the first release. Each code repository MUST run a licence scan in CI from its bootstrap, which checks every pull request against rules 1 and 2. No such scan exists yet, because the code repositories are not bootstrapped.

### Choices

| Concern | Decision | Exit option |
|---|---|---|
| Domain events, outbox, job scheduling | Own small abstractions in the kernel (domain event publisher, transactional outbox, job scheduler interface) | Nothing to exit: the code is ours. A broker or bus can be added behind the same interfaces |
| Job engine behind the scheduler interface | Quartz.NET | Another engine behind the scheduler interface, for example a database-polling worker written for Eolent |
| Message broker integration | Not part of the kernel. An optional module may be added later, for example on Wolverine | Optional and separate, so no core change is needed |
| Authentication | OpenIddict embedded in the identity module by default | Any OIDC/JWT-compliant provider, such as Keycloak, Microsoft Entra ID or ZITADEL, because Eolent validates standard tokens only |
| Validation | FluentValidation, used inside module application layers only. Module contracts expose plain request types and the standard problem-details error shape, not FluentValidation types | Replace the validators inside a module with another library or hand-written checks, without changing any contract |
| Logging | Serilog, behind `Microsoft.Extensions.Logging` | Any logging provider for `Microsoft.Extensions.Logging` |
| Telemetry | OpenTelemetry | Not applicable: it is the vendor-neutral standard |
| Caching and distributed state | `Microsoft.Extensions.Caching.Abstractions` (`IDistributedCache`), with StackExchange.Redis as the first provider | Another `IDistributedCache` implementation |
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
| shadcn/ui | [commit 968d8cb9dc42ae5d52e8fd356cf84596ec832a26](https://github.com/shadcn-ui/ui/tree/968d8cb9dc42ae5d52e8fd356cf84596ec832a26) ([licence file](https://github.com/shadcn-ui/ui/blob/968d8cb9dc42ae5d52e8fd356cf84596ec832a26/LICENSE.md)) | MIT | Adopted (components are copied into the kit from that commit) |
| Wolverine | 6.64.2 | MIT | Optional module only |
| Hangfire | 1.8.25 | Multi-licensed: LGPL v3 for the open-source edition, plus a paid edition | Rejected |
| MediatR | 15.0.0 | Reciprocal Public License 1.5, or a paid commercial licence | Rejected |
| MassTransit | 9.3.0 | Proprietary commercial licence | Rejected |

Infrastructure services are not covered by this table. Eolent does not distribute any server software: the Redis cache provider talks to a Redis-compatible server that the deployer chooses and is responsible for, and Redis is optional. Because recent Redis server releases use source-available or copyleft licence options, deployments should check the terms of the server they run, or use a compatible server under a permissive licence such as Valkey (BSD-3-Clause). The kernel depends only on the `IDistributedCache` abstraction.

Licences can change, so this table is a snapshot and must be refreshed under rule 4.

## Consequences

- Eolent owns a small amount of infrastructure code (domain events, outbox, scheduler interface). It is to be covered by the kernel's tests and, once it exists, the conformance suite (planned).
- Users can plug in a different identity provider or job engine without changes to modules.
- Users who want a full message bus can opt into an optional module, or use their own, without it becoming a dependency of everyone.
- A change of any listed library's licence requires a new ADR or an update to this one, and a switch via the recorded exit option.
