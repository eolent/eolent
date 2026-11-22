# Architecture

## Backend (reference implementation: C#)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | ASP.NET Core on the current LTS release | Controllers or minimal APIs; controllers suit convention-based features |
| Data | EF Core, with Dapper for hot read paths outside core modules or behind a dialect-aware abstraction | Global query filters for multi-tenancy and soft delete |
| Auth | OpenIddict, or an external OIDC server such as Keycloak | Standards-based OIDC and JWT |
| Modularity | Modular monolith; each module is a set of projects (Domain, Application, Contracts, Infrastructure, API) | Boundaries enforced with architecture tests and analyzers |
| Events, outbox and jobs | Own abstractions in the kernel, with Quartz.NET behind the job scheduler interface. A message broker is an optional module, not a kernel dependency | See [ADR 0005](adr/0005-technology-choices-and-dependency-policy.md) |
| Cross-cutting | Serilog, OpenTelemetry, FluentValidation, and optionally Redis through `IDistributedCache` | |

### Kernel building blocks

Module system and DI conventions, unit of work, domain events, multi-tenancy (resolution and query filters), permissions, features and settings, audit logging, localization, background jobs, file storage, tenant management.

## Database support

Do not promise every database on day one. EF Core makes switching providers look cheap, but the real cost is the test matrix and the dialect differences that leak through. Databases are supported in tiers.

| Tier | Databases | Commitment |
|---|---|---|
| 1 (reference) | PostgreSQL, SQL Server | Full CI on every change, migrations tested, documented. PostgreSQL is the default. |
| 2 (supported) | MySQL / MariaDB | Runs in CI and fixes are accepted, but a failure does not block a release. Added once the kernel is stable. |
| 3 (on demand) | Oracle | Only if a sponsor or contributor owns it. |
| Development only | SQLite | Quick local runs. Not used as the test oracle. |

### Where the real cost is

- **Migrations in a modular framework.** EF migrations are provider-specific, so each module times each database multiplies. Modules ship only model configuration; the application owns its migrations. The CLI generates and applies them per provider.
- **Dialect differences:** case sensitivity and collations, identifier length limits, JSON column support, GUID and date-time precision, pagination, locking and concurrency tokens, full-text search. Core modules use a documented portable subset and avoid provider-specific features.
- **Raw SQL** is where portability breaks. Keep it out of core modules or hide it behind a dialect-aware abstraction.
- **Test against real databases** (for example with Testcontainers), not SQLite or EF's in-memory provider, which hide exactly these differences. Run the conformance suite across the whole matrix.
- **Provider health.** Check the maintenance status and EF Core version support of each provider package before committing to a tier.

### Multi-tenancy

Three isolation modes are planned: shared database with a tenant column, schema per tenant, and database per tenant. PostgreSQL row-level security can add defence in depth. Schema- and database-per-tenant are where database differences matter most, so the documentation states which modes each tier supports. The contract is in [spec/tenancy.md](../spec/tenancy.md) and the mode decisions are in [ADR 0006](adr/0006-tenant-isolation-modes.md).

### Other decisions

- UUIDv7 keys, which keep inserts index-friendly across providers.
- No document or NoSQL stores initially; they change the repository and query model and are a separate decision.
- Other language implementations use their ecosystem's mature migration tooling and follow the schema conventions in the specification.

## Frontend

- **Core:** React and TypeScript on Vite, with TanStack Router and TanStack Query.
- **UI:** Tailwind with shadcn/ui, chosen for flexibility and themeability.
- **Forms:** React Hook Form with Zod.
- **API client:** generated from the backend's OpenAPI description with openapi-typescript (types only, a development tool; the client is a small typed `fetch` wrapper with no runtime dependency, [ADR 0005](adr/0005-technology-choices-and-dependency-policy.md)), so the frontend is typed end to end.
- **i18n and permissions:** ICU MessageFormat through intl-messageformat behind the kit's own `Translator` interface (the platform's messages are ICU, and the shell loads them already resolved from the localization operation; i18next with i18next-icu is the exit option, [ADR 0005](adr/0005-technology-choices-and-dependency-policy.md)), and a `usePermission()` hook fed by a backend permission endpoint.
- **Server-side rendering:** only if public pages need it. The admin UI stays a single-page app.
- **UI modularity:** a monorepo of npm packages in which each module registers its routes, menu items and permissions in a central registry. Runtime module federation is considered only if third-party runtime plugins become a requirement.

The frontend kit consumes the OpenAPI description and the module manifest, so it works against any backend that follows the specification.
