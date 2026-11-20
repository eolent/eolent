# ADR 0005: Technology choices and dependency policy

- **Status:** Accepted
- **Date:** 2026-11-18
- **Amended:** 2026-11-20, rule 4: the re-check step moved into the release checklist, and each code repository must run a licence scan in CI from its bootstrap
- **Amended:** 2026-11-20, licence check table: rows for the kernel's JSON Schema validator (adopted), its dependency injection packages (adopted) and JsonSchema.Net (rejected)
- **Amended:** 2026-11-20, rule 4 and licence check table: the scans exist since the bootstrap of the code repositories; rows added for the architecture test and banned-API analyzer packages of the kernel repository (D3)

## Context

[Architecture](../architecture.md) names the main technologies of the reference implementation, and says that the licence terms of each dependency must be checked before it is adopted. Several widely used .NET libraries have moved to restrictive or commercial terms in recent years. Eolent is distributed under the Apache License 2.0 and is meant to be built on by others, including commercially, so a dependency whose terms limit redistribution would pass that limit on to every user.

## Decision

### Dependency policy

1. A runtime dependency of Eolent packages must be available under a permissive licence (Apache-2.0, MIT, BSD or similar) that allows redistribution as part of a commercial product.
2. Libraries under copyleft, source-available or paid terms are not used as dependencies of core packages. They may be supported through optional, separate packages that users opt into knowingly.
3. Third-party types do not appear in public module contracts where a thin abstraction is practical. Each abstraction records an exit option: what we would switch to if the licence or maintenance of the library changes.
4. Licences are checked when a dependency is added and re-checked before each release. The result is recorded in the table below. The maintainer who prepares a release runs the re-check. The step is in the [release checklist](../release-checklist.md), which is refined with the release process before the first release. Each code repository MUST run a licence scan in CI from its bootstrap, which checks every pull request against rules 1 and 2. Both code repositories have been bootstrapped with such a scan: eolent-dotnet (D1, `licences` job with `allowed-licenses.json`, `license-url-mappings.json` and `license-overrides.json`) and eolent-react (R1, `scan:licences`). A package whose metadata names no licence is recorded in `license-overrides.json` with the evidence, which is its repository's licence file.

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

### Licence check (2026-11-18; rows added 2026-11-20 are marked)

Checked against the licence metadata published on NuGet and npm for the latest stable version, and against the licence files in each project's repository. The version is given because licence terms can differ between versions. The rows marked 2026-11-20 were checked against the NuGet metadata and the licence files in the repositories on that date (`LICENSE` of Lateapexearlyspeed.JsonSchema, `LICENSE.TXT` of dotnet/runtime, `OSMFEULA.txt` of json-everything, `LICENSE` of BenMorris/NetArchTest, `LICENSE.txt` of jbevain/cecil, `LICENSE` of dotnet/roslyn, where the banned-API analyzer lives). The licence scan that runs on every pull request in eolent-dotnet (rule 4) is a separate, automatic check of the same packages.

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
| LateApexEarlySpeed.Json.Schema (checked 2026-11-20) | 5.0.0 | BSD-3-Clause ([licence file](https://github.com/lateapexearlyspeed/Lateapexearlyspeed.JsonSchema/blob/main/LICENSE)) | Adopted (manifest validation in the kernel; JSON Schema 2020-12). Maintained by one individual (lateapexearlyspeed on GitHub), so the replacement path matters: the validator is used in one place only. Accepted risk: it depends on Microsoft.Extensions 3.1.0 packages (Configuration, Http, Logging, Options, Primitives), which are out of support but permissive and have no advisories found in the GitHub advisory database at the time of checking, 2026-11-20 (the command `dotnet list package --vulnerable --include-transitive` run in eolent-dotnet at the D2 pull request reported none; the result goes stale, so repeat it at each rule-4 re-check); the kernel does not call them. Exit option: another 2020-12 validator behind `ManifestLoader`, whose public API exposes no validator types |
| Microsoft.Extensions.DependencyInjection.Abstractions (checked 2026-11-20) | 10.0.15 | MIT ([licence file](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT)) | Adopted (kernel module system) |
| Microsoft.Extensions.DependencyInjection (checked 2026-11-20) | 10.0.15 | MIT ([licence file](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT)) | Adopted (pinned centrally; the validator depends on an older version) |
| NetArchTest.Rules (checked 2026-11-20) | 1.3.2 | MIT: the NuGet package names no licence; the repository's [licence file](https://github.com/BenMorris/NetArchTest/blob/master/LICENSE) is MIT, recorded in `license-overrides.json` of eolent-dotnet | Adopted (architecture tests only, not shipped). Exit option: hand-written tests over the project graph, which already carry most rules |
| Mono.Cecil (checked 2026-11-20) | 0.11.3 | MIT (the package gives the licence as a URL; the licence file of jbevain/cecil is MIT, and the eolent-dotnet licence scan maps the URL to MIT) | Adopted (transitive dependency of NetArchTest.Rules; tests only) |
| Microsoft.CodeAnalysis.BannedApiAnalyzers (checked 2026-11-20) | 5.6.0 | MIT (package metadata) | Adopted (compile-time layer rules; an analyzer, not shipped in packages). Exit option: the architecture tests alone |
| JsonSchema.Net (checked 2026-11-20) | 9.7.0 | Source under MIT, but the published binary (NuGet package) is offered under the Open Source Maintenance Fee agreement ([`OSMFEULA.txt`](https://github.com/json-everything/json-everything/blob/master/OSMFEULA.txt)): use of the binary is bound to a maintenance fee | Rejected (the rejection applies to the NuGet binary; the MIT source licence does not reverse it, because Eolent would consume the package) |
| Hangfire | 1.8.25 | Multi-licensed: LGPL v3 for the open-source edition, plus a paid edition | Rejected (the rejection applies to the NuGet binary; the MIT source licence does not reverse it, because Eolent would consume the package) |
| MediatR | 15.0.0 | Reciprocal Public License 1.5, or a paid commercial licence | Rejected (the rejection applies to the NuGet binary; the MIT source licence does not reverse it, because Eolent would consume the package) |
| MassTransit | 9.3.0 | Proprietary commercial licence | Rejected (the rejection applies to the NuGet binary; the MIT source licence does not reverse it, because Eolent would consume the package) |

Infrastructure services are not covered by this table. Eolent does not distribute any server software: the Redis cache provider talks to a Redis-compatible server that the deployer chooses and is responsible for, and Redis is optional. Because recent Redis server releases use source-available or copyleft licence options, deployments should check the terms of the server they run, or use a compatible server under a permissive licence such as Valkey (BSD-3-Clause). The kernel depends only on the `IDistributedCache` abstraction.

Licences can change, so this table is a snapshot and must be refreshed under rule 4.

## Consequences

- Eolent owns a small amount of infrastructure code (domain events, outbox, scheduler interface). It is to be covered by the kernel's tests and, once it exists, the conformance suite (planned).
- Users can plug in a different identity provider or job engine without changes to modules.
- Users who want a full message bus can opt into an optional module, or use their own, without it becoming a dependency of everyone.
- A change of any listed library's licence requires a new ADR or an update to this one, and a switch via the recorded exit option.
