# What is free and what is commercial

Eolent is open source. This page states where the line is between what the project provides for free and what Eolentis Labs may offer commercially, so that anyone can build on Eolent knowing what to expect. The reasoning is recorded in [ADR 0003](adr/0003-free-and-commercial-boundary.md).

## Always free (Apache License 2.0)

Everything needed to build, run and secure a multi-tenant application stays open source and free to use, including in commercial products:

- the specification and the conformance suite
- the kernel and every platform module: identity and access, tenants, permissions, features, settings, audit, localization, background jobs, file storage
- the React frontend kit, the admin UI and the default theme
- the command-line tool, code generators and project templates
- the development-time MCP server and the `AGENTS.md` / `llms.txt` context files
- the basic agent runtime: agent identities with scoped tokens, audit entries for agent actions and the approval hook for destructive actions

## Commercial offerings

Eolentis Labs may offer the following separately:

- **Hosting:** a managed service that runs Eolent applications for you.
- **Support and consulting:** support plans, service-level agreements, training and migration help.
- **Enterprise extras:** optional modules for needs that appear at scale, for example single sign-on federation and user provisioning (SAML, SCIM), compliance tooling, and advanced governance and usage metering for agents.
- **Premium themes and starter applications.**

## Principles

- **Nothing moves from free to commercial.** A feature released under the Apache License 2.0 stays under it.
- **The core is complete without the extras.** The commercial offerings add capabilities; they do not remove or limit anything in the open-source modules.
- **Separate code.** Commercial code lives in separate repositories and packages, never inside the open-source ones.
- **Contributions stay open.** Code contributed to the open-source repositories is not moved into a commercial product.
- **Open standards.** Commercial offerings use the same public specification as everyone else, so alternatives can be built.

## Status

Eolent is pre-alpha. No commercial offering exists yet, and none is planned before the first release.
