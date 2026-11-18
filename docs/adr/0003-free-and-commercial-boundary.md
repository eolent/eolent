# ADR 0003: Boundary between free and commercial offerings

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Eolent is an open-source framework created by Eolentis Labs, which intends to fund its development through commercial offerings. Users and contributors need to know in advance which parts of the project will stay free. An unclear or shifting boundary damages trust, especially for a framework whose modules and extension points other people build on.

## Decision

- The specification, conformance suite, kernel, all platform modules, the frontend kit including the admin UI and default theme, the command-line tool, templates, the MCP server and the basic agent runtime stay under the Apache License 2.0 and free to use.
- Eolentis Labs may offer hosting, support and consulting, optional enterprise extras (single sign-on federation and provisioning, compliance tooling, advanced agent governance and usage metering), and premium themes and starter applications.
- Nothing released as open source moves to a commercial offering later.
- Commercial code lives in separate repositories and packages. Contributions to the open-source repositories are never moved into commercial products.
- No commercial offering is planned before the first release.

The public statement of this boundary is [docs/free-and-commercial.md](../free-and-commercial.md).

## Consequences

- Contributors and adopters can rely on a stable open-source scope.
- The commercial side has room to grow without touching the core, but cannot reach into it. A feature that is wanted in the core is added to the core.
- The boundary is binding on the project: a change to it needs a new ADR that supersedes this one, and it can only move toward more open-source, not less.
