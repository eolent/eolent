# Product requirements (PRDs)

A PRD states **what a module is for and what it must do**, in the words of its users, before it is designed or built. It is the place for product decisions. How the module is built is decided in its ERD and in [architecture decision records](../adr/).

Each PRD has the same parts: purpose and users, the concepts it uses, numbered requirements (each one testable), lifecycles, permissions, events, the contract it offers to other modules, what is explicitly out of scope, open questions, and an **Enforced by** section that names the executable checks that keep the code in line with it. A requirement that no check enforces says so.

| PRD | Module | Status |
|---|---|---|
| [Parties](parties.md) | `parties`: companies, people and who works where | Draft |

## Tests name the requirement they prove

A test is tagged with the id of the requirement it proves, in its source: in .NET an xunit trait, `[Trait("requirement", "C1")]` (several ids in one tag: `"C1,M2"`; the id of another module's PRD gets the module as a prefix: `"parties/C1"`); in other languages the same two words as two string literals, `"requirement", "C1"`. The tag is plain text, so any language and any test runner can carry it.

`node scripts/requirements-check.mjs docs/prd/<module>.md <tests folder>...` lists the requirements of the PRD that no test is tagged with, and fails when a test names a requirement the PRD does not have. With `--fail-on-missing` it fails on a requirement without a test, except the ids named by `--allow-missing` (requirements that a database constraint or a platform check enforces, as the PRD's *Enforced by* section says). `--json` prints the result for an agent. The module repository runs it in its CI against the PRD of the hub.

