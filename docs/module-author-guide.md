# Module author guide

How to write a module for Eolent, in the order you do it, with the lessons of the first two modules (Parties and Invoicing, in `eolent-dotnet`). The reference module is **Parties**: every pattern below appears in it once, and every requirement of its PRD except D4 (it says the module reaches into no document, so there is nothing of its own to test) has a test that names it. Read its [PRD](prd/parties.md), its [ERD](erd/parties.md) and its `AGENTS.md` first.

## 1. The order of work

1. **PRD** (`docs/prd/<module>.md`): purpose, users, concepts, numbered requirements (each testable, written as `- **C1.** ...`), lifecycles, permissions, events, what is out of scope, an *Enforced by* table. A requirement that nothing checks says so.
2. **ERD** (`docs/erd/<module>.md`): tables, types, keys, the rules the database enforces and the rules it cannot. Every foreign key inside the module includes `tenantId`. No foreign key to another module (ADR 0009).
3. **Code** from the template: `eolent module add <Name> --entity <Entity>` (or `dotnet new eolent-module`), then replace the placeholder entity. The five layers and their rules are in ADR 0004 and are checked by the architecture tests.
4. **Tests that name their requirement**: `[Trait("requirement", "C1")]`. `node scripts/requirements-check.mjs docs/prd/<module>.md <test folders> --module <name> --fail-on-missing [--allow-missing D4]` lists the requirements without a test and fails on one; `--allow-missing` names the ids that have no test of their own by design, each with its reason in the CI step (Parties: `--allow-missing D4`). Run it in the module repository's CI.
5. **Open the PR in slices** (one topic each: companies, then people, then memberships ...). Each slice ends with tests that run on PostgreSQL and SQL Server.

## 2. Recipes

**An entity.** Domain class with `ITenantScoped` and `IVersioned` (`Version` is set by the data layer, never by you); the EF configuration in `<Module>Model : IModuleModel` (table `module_entity`, keys, lengths, indexes); a store interface in Application and its EF store in Infrastructure; a service that validates, changes the entity and commits through `IUnitOfWork`; endpoints in Api; the entity in `module.json` (`entities`, with `sensitiveProperties` for personal data).

**An operation.** Declare it once with `EolentOperation` in the endpoint class, give it `RequirePermission`, then run the module's tests with `EOLENT_UPDATE_MANIFESTS=1`, build, and run again: in the C# reference implementation (`eolent-dotnet`) `module.json` `operations` is generated from the code and checked by a test, never written by hand (ADR 0007 states the rule; an implementation that has no generator yet checks the entries by hand). A change needs `RequiresIfMatch` and `CheckIfMatch` **before** the body is read; a create needs `Idempotent`; a read that returns a version needs `EmitsETag`. Handler parameters must be named like the route parameters, or carry `[FromRoute(Name = "...")]`: a mismatch becomes a bare 400.

**A change with a JSON Merge Patch.** An absent property is left alone, `null` clears it. Apply the checks on a **copy** of the entity and write the real one only when they pass, so a refused change leaves the loaded entity as it was. Read numbers through a helper that refuses a fraction and a value that does not fit (`Patch.WholeNumber`): a bare `(int)` cast of a `decimal` throws an `OverflowException` for a value out of range (conversions of `decimal` are always checked, so it is a 500) and silently drops a fraction.

**Uniqueness and other rules over rows.** A rule that two rows must not break needs a **database constraint**; the application check only gives a good error message first. The default isolation of both databases does not make "check, then insert" safe. Unique indexes over a nullable column work on both products without a filter of your own (PostgreSQL treats nulls as distinct, the SQL Server provider of EF Core makes the index filtered). For "at most one of a kind" use a nullable marker column that is `true` for the one and null for the rest, and move the flag in two saves (the old one first): a unique index is checked per statement. Rules that span rows and no constraint can express (overlapping periods, loops in a tree) run in the application layer today, without the serialisable transaction the unit of work does not offer yet: say so in the PRD.

**A number from a series.** Implement `IRequiresNumber` on the entity, make the sequence with `ISequenceAdmin.EnsureAsync(key, first)` (idempotent on PostgreSQL and SQL Server), call `RequestNumber`, and let the data layer take the counter inside the save. Put everything that makes a separate series in the key (seller, series id, year). The number exists only after the save: an event that must carry it is published in a second commit.

**A snapshot.** A document that must not change after it is issued takes what it needs from another module (ADR 0009, rule 4) into its own columns when it is confirmed. Reprinting reads the snapshot, never the live record.

**An event.** Declare it in `module.json` (`events`, `publishes`, with the `entity`), publish it with `IOutbox.Publish` inside the use case so it is saved with the change. The platform **refuses an event that carries a sensitive property**: keep names of people and contact data out, carry the id and ask the lookup.

**Messages.** Every error code a use case throws needs `<Code>.Detail` in `i18n/<culture>.json` (and a `localization` block in the manifest) or the response names no existing record and no argument. A validation item's `arguments` only reach the user through that message (`{existingId}`).

**Erasure and migration.** Personal data is erased in place (ADR 0009, rule 2): the record keeps its id and is **deactivated**, the personal values become placeholders unique to the record, `legacyId` is set to **null**, and the module keeps a separate **tombstone** with the HMAC of the legacy key (an installation secret), so a migration can see that the key was erased; the module publishes `<module>.<entity>.erased`. The hash never goes into the `legacyId` column. The migration side is a Contracts interface guarded by a **host-scoped** permission and is not reachable over HTTP. Loading old data keeps the stored figures; a check lists where they differ from the new rules.

## 3. Tests: three kinds, each with a job

- **Service tests** with the stores replaced by lists in memory: every rule, every refusal, every tie-break. Fast.
- **HTTP tests** in the real pipeline (tenancy, authentication, permissions, errors, ETags, idempotency, the data layer on the in-memory provider): version precondition, idempotent create, permission refusal, the tenant boundary, the shape of an error. They find what the service tests cannot: a handler whose parameters do not bind, an event the platform refuses, a message that is missing.
- **Data contracts** run on PostgreSQL and SQL Server (`tests/Shared/<Module>Contract`, linked into both provider test projects): unique indexes, checks, composite keys, the queries that must translate (case-insensitive search needs `ToLower()` on both sides; `Guid.CompareTo` paging works), concurrency of the number series. The in-memory provider enforces no index and no transaction.

## 4. Mistakes the first modules made (so you need not)

- A search for an empty text returned everything: a blank search finds nothing, a list lists.
- A GET that wrote (seeding the starting data): a read never writes; give the seeding an operation and let the first write call it too.
- Two requests creating the same sequence at the same moment collided on its unique key: creating must be idempotent in the database, not a check.
- An address "oldest first" ordered by a random-ish id: order by a creation time, then the id; version-7 ids made in one millisecond are not ordered.
- A reply that differs between the PATCH and the GET of the same resource: show the same fields from every operation that returns it.
- Enum-like text compared with case-sensitive keys while the database compares without case: normalise (language tags in lower case) before you store.
- Test databases (one per test) exhaust the connections of PostgreSQL: small pools that give idle connections back.

## 5. Checklist before a PR

`dotnet build` with warnings as errors; `dotnet test` of the module; the data contracts on both databases; `EOLENT_UPDATE_MANIFESTS=1` run and the manifest committed (in the C# implementation); `packages.lock.json` of every new project committed (restore is locked in CI); the requirements check without a missing requirement (and every `--allow-missing` id explained); the PRD's *Enforced by* section says what really runs.
