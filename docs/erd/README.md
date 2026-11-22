# Entity-relationship designs (ERDs)

An ERD states **which data a module keeps and which rules the database itself enforces**, in logical types that do not depend on a database product. It follows the module's [PRD](../prd/) and the [ADRs](../adr/), above all [ADR 0009](../adr/0009-cross-module-references.md) (a module owns its data; other modules are referenced by id, with no foreign key across modules). An implementation maps the logical types to its databases and keeps the constraints and indexes listed here.

| ERD | Module | PRD |
|---|---|---|
| [Parties](parties.md) | `parties` | [Parties](../prd/parties.md) |
