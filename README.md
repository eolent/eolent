# Eolent

by Eolentis Labs

Eolent is an open-source, modular application framework for building multi-tenant business applications. It combines a .NET reference backend with a React frontend kit, and it is built around a language-neutral contract so that other backends can follow.

> **Status:** early design phase (pre-alpha). Nothing here is stable yet, and the repositories listed below are being created step by step.

## What it is for

Line-of-business and SaaS applications that need the same foundations again and again:

- modules with explicit boundaries and a manifest that describes them
- multi-tenancy (shared database, schema per tenant, database per tenant)
- identity, roles and permissions
- audit logging, settings, features and localization
- background jobs and events
- an admin UI that is themeable and extensible

Eolent aims to provide these once, in a form that humans and AI coding agents can both read, extend and verify.

## Principles

- **Contract first.** The specification is the product. Implementations follow it and are checked by a conformance suite.
- **Explicit over magic.** Plain framework primitives, readable generated code, predictable module layout.
- **Modular monolith first.** Split into services only where there is a reason to.
- **AI-friendly by design.** Machine-readable manifests, agent-callable tooling, shipped agent context.
- **Standards-based.** OpenAPI, OIDC/JWT, RFC 9457 problem details, CloudEvents.

More detail: [docs/vision.md](docs/vision.md).

## Repositories

| Repository | Purpose | Status |
|---|---|---|
| `eolent/eolent` (this repo) | Specification, conformance suite, documentation, architecture decisions | Active |
| `eolent/eolent-dotnet` | C# reference implementation: kernel, platform modules, CLI, templates | Planned |
| `eolent/eolent-react` | React frontend kit (npm packages) | Planned |
| `eolent/eolent-node`, `eolent/eolent-java` | Further implementations | Only once the specification is stable |

## Documentation

- [Vision and principles](docs/vision.md)
- [Architecture](docs/architecture.md)
- [AI-friendliness](docs/ai-friendliness.md)
- [Multi-language approach](docs/multi-language.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decision records](docs/adr/)
- [Specification](spec/README.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
