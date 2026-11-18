# Roadmap

This roadmap is a suggested order of work, not a commitment or a schedule.

1. **Kernel.** Module system, DI conventions, unit of work, domain events and the tenancy abstraction. Small and heavily tested.
2. **Identity and access.** Users, roles, permissions, OpenIddict integration, and a permission API for the React client.
3. **Platform modules.** Settings, features, audit, localization, background jobs, file storage, tenant management.
4. **Frontend kit.** Monorepo packages, module registry, themeable component set, generated API client.
5. **CLI and templates.** `dotnet new` templates and a scaffolding CLI; a CRUD generator later.
6. **Specification and conformance suite.** Published alongside the C# implementation. The MCP server and `AGENTS.md` files ship from the first release.

The first release covers steps 1 to 3 plus a minimal admin UI. A module marketplace, microservice templates and graphical tooling are deferred.
