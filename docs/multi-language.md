# Multi-language approach (C#, Node.js, Java)

Eolent does not aim to be the same framework written three times. Framework features lean on each language's idioms (dependency injection, ORM, async model), and a lowest-common-denominator design would feel foreign everywhere. Instead:

## Layer 1: a language-neutral specification

All implementations follow the same specification (see [spec/](../spec/README.md)):

- module manifest schema
- permission and feature definitions
- tenant resolution and propagation (claims, headers)
- OIDC/JWT identity, which any language can validate
- error format (RFC 9457 problem details)
- audit log and event schemas
- localization files (a portable format such as ICU MessageFormat in JSON)
- OpenAPI conventions (pagination, filtering, naming)

## Layer 2: a conformance test suite

Black-box HTTP tests that any backend must pass, for example "tenant A cannot read tenant B's data" or "a missing permission returns 403 in the documented shape". This is what keeps several implementations honest.

## Layer 3: idiomatic implementations

1. C# reference implementation (the first one).
2. TypeScript / Node.js next, since it shares types with the React kit.
3. Java (Spring) later, if demand justifies it.

## The frontend is already language-agnostic

The React kit consumes OpenAPI and the module manifest, so it works against any backend that follows the specification.

## Alternative considered: platform services plus SDKs

Identity, a tenancy registry, permissions, settings and audit could run as services with thin SDKs per language. That is truly language-agnostic but adds operational complexity and makes "just run one process" harder. The planned approach is a hybrid: standards-based services for identity and tenancy where mature tools exist, and libraries for the rest.

## Caveat

Maintaining several runtimes multiplies testing, documentation and release work. The realistic path is the specification plus one excellent reference implementation, with other languages added by the community or when resources allow.
