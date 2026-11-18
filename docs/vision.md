# Vision and principles

## Summary

Eolent is an open-source, modular application framework for building line-of-business and multi-tenant SaaS applications. It provides the foundations such applications keep needing (modularity, multi-tenancy, permissions, auditing, settings, localization, background jobs) as a coherent set of modules with a React admin UI, plus the tooling to generate and extend them.

The framework is organised around a **language-neutral contract**. A reference implementation is written in C# on ASP.NET Core, and the frontend kit is written in React and TypeScript. Other backend implementations can follow the same contract and are verified by a shared conformance suite.

## Principles

- **The contract is the product.** The specification (module manifest, API conventions, error and event formats, tenancy and permission rules) is the source of truth. An implementation is replaceable.
- **Explicit over magic.** Use plain framework primitives, source generators that emit readable code, and a predictable layout. Anything a developer or an agent needs to know about a module should be discoverable from its manifest and code, not hidden in runtime conventions.
- **Modular monolith first.** Modules have explicit boundaries and can be split into services later, but the default deployment is a single process.
- **Small, stable extension points.** Extension points are versioned deliberately. Breaking them costs the trust of everyone building modules.
- **Everything introspectable.** If a human or an agent has to read implementation code to discover what a module offers, its manifest is incomplete.
- **Integration quality over feature count.** Teams often assemble many libraries by hand. Eolent's value is that the pieces already fit together and are tested together.
- **Standards-based.** OpenAPI, OIDC/JWT, RFC 9457 problem details, CloudEvents / AsyncAPI, JSON Schema.

## What the platform provides

Core kernel:

- module system and dependency-injection conventions
- unit of work and domain events
- multi-tenancy (tenant resolution and data isolation)
- permissions, features and settings
- audit logging
- localization
- background jobs
- file storage

Platform modules built on the kernel: identity and access, tenant management, settings and features, audit log, localization, background jobs, file storage.

Frontend kit: a themeable component set, a module registry for routes, menus and permissions, and a typed API client generated from the backend's OpenAPI description.

## Out of scope for early releases

A module marketplace, microservice templates and graphical IDE-style tooling are deliberately deferred until the kernel and the specification are stable.

## Related documents

- [Architecture](architecture.md)
- [AI-friendliness](ai-friendliness.md)
- [Multi-language approach](multi-language.md)
- [Roadmap](roadmap.md)
