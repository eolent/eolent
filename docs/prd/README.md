# Product requirements (PRDs)

A PRD states **what a module is for and what it must do**, in the words of its users, before it is designed or built. It is the place for product decisions. How the module is built is decided in its ERD and in [architecture decision records](../adr/).

Each PRD has the same parts: purpose and users, the concepts it uses, numbered requirements (each one testable), lifecycles, permissions, events, the contract it offers to other modules, what is explicitly out of scope, open questions, and an **Enforced by** section that names the executable checks that keep the code in line with it. A requirement that no check enforces says so.

| PRD | Module | Status |
|---|---|---|
| [Parties](parties.md) | `parties`: companies, people and who works where | Draft |
