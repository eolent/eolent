# AI-friendliness

Eolent is designed so that AI coding agents can build with it and applications built on it can be used by agents, safely.

## Design time: helping agents build with the framework

1. **Explicit over magic.** Strong types, a predictable module layout (the same folders everywhere), generators that emit readable code, and compiler or analyzer errors with actionable messages.
2. **Machine-readable contracts.** OpenAPI for HTTP, AsyncAPI or CloudEvents for events, JSON Schema for everything else, and a **module manifest** declaring permissions, entities, events, settings, routes and menu items (see [spec/](../spec/README.md)).
3. **Shipped AI context.** `AGENTS.md` in every repository, template and module (conventions, how to add an entity, a permission or an endpoint, and what to avoid). Documentation is plain Markdown with an `llms.txt` index, versioned per release, with clear deprecation messages.
4. **Agent-callable CLI.** Non-interactive, idempotent, with `--dry-run` and `--json` output, so an agent can compose scaffolding commands instead of hand-writing boilerplate. A development-time **MCP server** wraps it: list modules, inspect manifests, scaffold, run migrations, search documentation.
5. **Guardrails.** Architecture tests, analyzers and a fast test suite, so a generated change that breaks a module boundary fails within seconds.
6. **Reference application** in which every pattern appears exactly once.

## Run time: agents using applications

Every application service is declared with its permission, tenant scope and audit behaviour, so it can be exposed automatically as an MCP or function-calling tool with the **same** authorisation and audit trail as the UI. This requires:

- agent identities with scoped tokens, not shared administrator keys
- per-tenant isolation and usage metering
- audit entries that record "agent X acting for user Y"
- an approval hook for medium and high risk actions, with the posture fixed in [ADR 0008](adr/0008-agent-posture.md): a module opts operations in to agent exposure in its manifest (`agentTools`) with a risk class and an approval flag ([ADR 0007](adr/0007-manifest-0-2.md))
- awareness of prompt injection, since tool inputs may contain untrusted text

An AI provider abstraction (Microsoft.Extensions.AI in .NET and equivalents elsewhere) and an optional retrieval-augmented-generation module are planned.
