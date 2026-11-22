# ADR 0009: Cross-module references and shared concepts

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

The first real module, sales invoicing, needs customers. A later CRM module will also have a customer concept, and so will purchasing, tax and cashflow. Without a rule, each module keeps its own copy of people and companies, or reaches into another module's tables, and both end in a data migration that nobody wants: the copies drift apart, and a module cannot be changed, replaced or removed without the others breaking.

[ADR 0001](0001-repository-structure.md) and the [architecture](../architecture.md) already make the framework a modular monolith whose modules are sets of projects (Domain, Application, Contracts, Infrastructure, Api) with boundaries enforced by architecture tests, and the manifest lets a module declare `dependencies` on other modules. What is missing is the rule for **data** that crosses a module boundary. Applications also migrate data from older systems, where every row has an identifier that the new system does not use.

## Decision

1. **A module owns its data.** The tables of a module are private to it, even when all modules share one database. No module reads, joins, writes or references another module's tables; there are no foreign keys across modules and no query that spans them. A module reads another module's data only through that module's Contracts (a lookup interface, an operation of its API, or events).
2. **Other modules' entities are referenced by id.** A reference is a column holding the other entity's identifier (named `<entity>Id`, for example `customerId`), with no foreign key. The owning module's Contracts offer a lookup (get by id, get many by ids, search), and the referencing module checks that the id exists when it writes, through that lookup. Referential integrity across modules is kept by the owner and by events: an entity that other modules may reference is never deleted, only deactivated or marked deleted, and its module publishes `<module>.<entity>.deactivated` (and `updated` where others cache its data), so a consumer can block, mark or update.
3. **A concept that two modules need gets a module of its own.** When a second module needs what the first one defined (people and companies, addresses, products, currencies), the concept moves to a small module that both depend on, declared in their manifests. It is better to start it as its own module when the second user is already known (customers: invoicing now, CRM later) than to move it later. A shared-concept module stays small and stable: identity of the thing and the facts everybody needs; the modules that depend on it add their own data **keyed by its id** and never copy its data back into their tables, except as a snapshot (rule 4).
4. **A document that must not change takes a snapshot.** A record that becomes legally or commercially fixed when it is issued (an invoice, an order confirmation, a contract) copies the facts it needs from the referenced entities (names, addresses, identifiers, tax numbers, bank details) into itself at that moment. The reference stays for navigation and reporting; later edits of the referenced entity never change the issued document. The snapshot is part of the owning module's data and is described in its documentation.
5. **Data from a legacy system keeps its old identifier.** An entity that is migrated from another system carries a nullable `legacyId` (text, up to 100 characters, indexed, unique within the tenant and the entity when present) next to its new identifier. A migration loads modules in dependency order and resolves every reference through the `legacyId` of the referenced entity, so the migration of a module does not need the new identifiers of the others in advance, and a module can be migrated, checked and re-run on its own. `legacyId` is internal data of the module: it is not part of an API unless the module has a reason to expose it.
6. **Composition across modules is done at the edges.** A screen or a report that shows data of several modules gets it by calling each module's operations (the frontend composes, or an application service composes through Contracts), or from a read model that is built from events. It does not run a query over the modules' tables.

## Not decided here

- The contents of the first shared-concept module (Parties) and of the invoicing module are decisions of those modules and are recorded with them.
- Reporting that spans many modules at volume (a data warehouse, or read models built from events) is left to the module that needs it first.

## Consequences

- A module can be developed, tested, versioned, replaced or removed without touching the data of another. The CRM module can be added later without a change to invoicing: both use the same party identifiers.
- Writing a reference costs a lookup, and showing a list that includes data of another module costs calls or a read model. This is accepted for the sake of the boundary; hot paths are handled by the owning module's lookup by many ids.
- Rule 2 needs the owner to publish events and to deactivate instead of delete, so a module that is referenced is designed with that from the start.
- The architecture tests that already forbid a reference between a module's layers and between modules' internals gain a rule: no module's Infrastructure refers to another module's entities or its tables (checked by the table owner of every entity type in the model, which the data layer already knows for the tenant check).
- A document is bigger by its snapshot, and the snapshot has to be kept in step with what the issued document must show; the owning module tests it.
- Migrating from a legacy system adds a column per migrated entity and a lookup per reference, in return for migrations that are small, repeatable and in any order.
