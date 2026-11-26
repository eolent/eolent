---
id: ADR-0009
rules:
  - id: ADR-0009-R1
    severity: error
    appliesTo: ['src/*/Eolent.*.{Domain,Application,Contracts,Infrastructure,Api}/**/*.cs']
    text: A module must not read, join, write or reference another module's tables, and reads another module's data only through that module's Contracts project, its lookup interfaces and its events.
  - id: ADR-0009-R2
    severity: error
    appliesTo: ['src/*/Eolent.*.{Domain,Application,Contracts,Infrastructure,Api}/**/*.cs']
    text: A reference to another module's entity is stored as an <entity>Id column and has no database foreign key to the other module.
  # Scope follows the Consequences section of this ADR, which names the Domain, Application and Infrastructure
  # projects. Extending the rule to Api would change the decision, so it needs an ADR amendment first.
  - id: ADR-0009-R3
    severity: error
    appliesTo:
      - 'src/*/Eolent.*.{Domain,Application,Infrastructure}/**/*.cs'
      - 'src/*/Eolent.*.{Domain,Application,Infrastructure}/*.csproj'
    text: The Domain, Application and Infrastructure projects of a module may reference another module only through its Contracts project, and only for a module named in its manifest dependencies.
  - id: ADR-0009-R4
    severity: error
    appliesTo: ['src/*/Eolent.*.{Domain,Application,Contracts,Infrastructure,Api}/**/*.cs']
    text: An entity that other modules may reference, which is one whose id the owning module's Contracts hand out in a lookup or inside a result, is never physically deleted; it is deactivated, and the owning module publishes deactivated and reactivated events. A record the Contracts have not handed out, such as a draft, may be deleted. Erasure of personal data is the one exception, done in place by anonymising the entity, deactivating it, and the owner then publishes an erased event.
  - id: ADR-0009-R6
    severity: warning
    appliesTo:
      - 'src/*/Eolent.*.{Domain,Application,Contracts,Infrastructure,Api}/**/*.cs'
      - 'packages/**/*.{ts,tsx}'
      - 'apps/**/*.{ts,tsx}'
    text: The legacyId of an entity is internal data of its module and is not part of the module's HTTP API, and its only cross-module use is the migrations-only resolve operation.
---
# ADR 0009: Cross-module references and shared concepts

- **Status:** Accepted
- **Date:** 2026-11-22
- **Amended:** 2026-11-26, rule 2 and `ADR-0009-R4`: what "an entity that other modules may reference" means (an id the owner's Contracts hand out, in a lookup or inside a result), and that a record the Contracts have not handed out, such as a draft invoice, may be deleted (clarification, to be approved as a decision change)

## Context

The first real module, sales invoicing, needs customers. A later CRM module will also have a customer concept, and so will purchasing, tax and cashflow. Without a rule, each module keeps its own copy of people and companies, or reaches into another module's tables, and both end in a data migration that nobody wants: the copies drift apart, and a module cannot be changed, replaced or removed without the others breaking.

[ADR 0001](0001-repository-structure.md) and the [architecture](../architecture.md) already make the framework a modular monolith whose modules are sets of projects (Domain, Application, Contracts, Infrastructure, Api) with boundaries enforced by architecture tests, and the manifest lets a module declare `dependencies` on other modules. What is missing is the rule for **data** that crosses a module boundary. Applications also migrate data from older systems, where every row has an identifier that the new system does not use.

## Decision

1. **A module owns its data.** The tables of a module are private to it, even when all modules share one database. No module reads, joins, writes or references another module's tables; there are no foreign keys across modules and no query that spans them. A module reads another module's data only through that module's Contracts project: its lookup interfaces and its events. The module's HTTP API is for clients outside the process and is not how modules call each other.
2. **Other modules' entities are referenced by id.**
   - A reference is a column holding the other entity's identifier (named `<entity>Id`, for example `customerId`), with no foreign key.
   - The owning module's Contracts offer lookups: get by id, get many by ids, search. For migrations only (rule 5) they also offer **resolve by legacy identifiers**, which returns the new ids for a list of `legacyId` values. It is not an HTTP operation; it is enforced by a permission the module declares in its manifest (`<Module>.Migration.Resolve`) with scope `host`, so only a host principal holds it, through a host-level role granted to the migration run, and a test of the module checks that no other principal and no HTTP route reaches it. The referencing module checks that the id exists when it writes, through the lookup.
   - A module that stores another module's entity id declares a dependency on that module in its manifest (`dependencies`); the dependencies a module declares are the modules whose Contracts it may use. **The dependencies form a graph without cycles.** If two modules would need each other, the part they share becomes a third module (rule 3).
   - Referential integrity across modules is kept by the owner and by events. An entity that other modules may reference is never physically deleted. It is **deactivated** (the only way such an entity stops being offered: there is no separate "deleted" state for it; data that nobody references may still use the soft delete of its manifest, which is a different thing), and the owning module publishes `<module>.<entity>.deactivated`, `<module>.<entity>.reactivated` when it comes back, and `updated` where others cache its data, so a consumer can block, mark or update.
   - **"May reference" means the id is handed out.** An entity is one that other modules may reference from the moment the owning module's Contracts hand out its id: in a lookup of it, or inside the result of another lookup (the seller id in an issued invoice's result is such a case, because a consumer can store it). From then on the rules above apply to it: it is never physically deleted, and its `deactivated` and `reactivated` events are published in the same change that hands the id out. A record whose id the Contracts never hand out is the owner's private data: it may be deleted or removed, or use a soft delete, as the module decides. A draft is such a record when the lookups return only what is issued (a draft invoice is never returned, so it can be deleted, as its `deleted` event says; once it is confirmed it is handed out, and is never deleted). Handing an id out is a decision of the owning module, made on purpose and not in passing.
   - A deactivated entity stays resolvable by id (the lookup returns it with its state). **New references to it are refused;** existing references and the documents that took a snapshot of it stay valid and readable, and the consumer decides what else changes (an invoicing module keeps showing an old invoice for a customer that is no longer active, and refuses a new invoice for it).
   - **Erasure of personal data is the one exception to "never deleted", and it is done in place:** the owning module anonymises the entity (replaces the personal facts with placeholders, **sets its `legacyId` to null** (the unique index allows many nulls; it can be a personal identifier or a link back to the erased record), keeps the id and the fact that it was erased, and records a **tombstone of the legacy key**: a one-way keyed hash (HMAC with an installation secret, so that sequential legacy keys cannot be recovered by trying them all) of the `legacyId` value, kept by the module. The tombstone is a pseudonym, so it stays protected data: the secret is handled like a credential, and the tombstone is dropped when the retention basis of the source system ends), deactivates it, and publishes `<module>.<entity>.erased`, so references stay valid and nothing dangles. Snapshots (rule 4) that an issued document took are the document's own data: whether they must be kept (a tax or accounting retention period for an invoice) or erased is decided by the module that owns the document, by its documented retention basis, and the owner of the erased entity does not reach into them.
3. **A concept that two modules need gets a module of its own.** When a second module needs what the first one defined (people and companies, addresses, products, currencies), the concept moves to a small module that both depend on, declared in their manifests. It is better to start it as its own module when the second user is already known (customers: invoicing now, CRM later) than to move it later. A shared-concept module stays small and stable: identity of the thing and the facts everybody needs; the modules that depend on it add their own data **keyed by its id** and never copy its data back into their tables, except as a snapshot (rule 4).
4. **A document that must not change takes a snapshot.** A record that becomes legally or commercially fixed when it is issued (an invoice, an order confirmation, a contract) copies the facts it needs from the referenced entities (names, addresses, identifiers, tax numbers, bank details) into itself at that moment. The reference stays for navigation and reporting; later edits of the referenced entity never change the issued document. The snapshot is part of the owning module's data and is described in its documentation.
5. **Data from a legacy system keeps its old identifier.** An entity that is migrated from another system carries a nullable `legacyId` (text, up to 100 characters, indexed) next to its new identifier. It is unique within the entity, and within the tenant for a tenant-scoped entity (a host-level entity, `tenancy: none`, has no tenant, so only the entity). The migration chooses the value: when more than one source system is migrated into the same entities, it qualifies the value with the system (`erp:1234`, `crm:1234`) so the identifier spaces cannot collide. **Migrations load modules in dependency order:** a module's migration resolves every reference through the `legacyId` of the referenced entity, so the modules it references must already be loaded; the new identifiers of other modules need not be known in advance, and a module that is loaded can be checked and re-run on its own (the migration upserts by `legacyId`). A reference whose target is not loaded is reported, never guessed. **A legacy record whose key has a tombstone (it was erased) is skipped and reported as erased, never inserted again**, because the legacy source still holds the data; so a re-run cannot bring an erased entity back. Dependency cycles are forbidden for migrations as for everything else (rule 2). `legacyId` is internal data of the module: it is not part of its HTTP API, and its only cross-module use is the migrations-only resolve operation of rule 2.
6. **Composition across modules is done at the edges.** A screen or a report that shows data of several modules gets it by calling each module's operations (the frontend composes, or an application service composes through Contracts), or from a read model that is built from events. It does not run a query over the modules' tables.

**Rules in this ADR's frontmatter.** `ADR-0009-R5` is left unused on purpose: it said that a record that becomes fixed when it is issued copies the facts it needs into itself, which cannot be told from a pull request's diff (rule 4 above says it in prose), so it stays prose.

## Not decided here

- The contents of the first shared-concept module (Parties) and of the invoicing module are decisions of those modules and are recorded with them.
- Reporting that spans many modules at volume (a data warehouse, or read models built from events) is left to the module that needs it first.

## Consequences

- A module can be developed, tested, versioned, replaced or removed without touching the data of another. The CRM module can be added later without a change to invoicing: both use the same party identifiers.
- Writing a reference costs a lookup, and showing a list that includes data of another module costs calls or a read model. This is accepted for the sake of the boundary; hot paths are handled by the owning module's lookup by many ids.
- Rule 2 needs the owner to publish events and to deactivate instead of delete, so a module that is referenced is designed with that from the start.
- The architecture tests that already forbid a reference between a module's layers and between modules' internals gain a rule, written with the first module that depends on another: a module's Domain, Application and Infrastructure projects reference another module only through its Contracts project and only for a module named in its manifest `dependencies`, and a module's data model maps no entity type that another module owns (checked from the assembly that defines each entity type).
- A document is bigger by its snapshot, and the snapshot has to be kept in step with what the issued document must show; the owning module tests it.
- Migrating from a legacy system adds a column per migrated entity and a lookup per reference, in return for migrations that are small and repeatable per module; the price is the fixed order (dependencies first), which is the order the dependencies already give.
