# PRD: Parties

- **Module:** `parties`
- **Status:** Draft
- **ERD:** [Parties](../erd/parties.md)
- **Date:** 2026-11-22
- **Depends on:** nothing. It is a shared-concept module under [ADR 0009](../adr/0009-cross-module-references.md), rule 3.
- **Used by:** sales invoicing (first), a later CRM module, and every module that needs "who is the customer, the supplier or the contact".

## 1. Purpose

Several modules need to know who a company or a person is. If each keeps its own copy, the copies drift apart, and a customer edited in one place stays wrong in another. Parties is the single place where **companies**, **people** and **the relationships between them** are kept. It stays small: the identity of the thing and the facts everybody needs. A module that needs more (an invoicing e-mail, a price group, a sales stage) keeps that in its own tables, keyed by the party's id, as ADR 0009 requires.

## 2. Users

| Who | What they do |
|---|---|
| Office staff | Create and correct companies and people, record who works for which company and in what role |
| Sales and invoicing staff | Find a company when they issue an invoice or open a deal; they rarely edit it |
| The tenant administrator | Maintains the list of relationship names and decides who may edit |
| Other modules | Look up parties by id through the module's Contracts; never read its tables |
| Migration | Loads parties from an older system once, keyed by the old identifier |

## 3. Concepts

- **Company.** A legal entity that can be a customer, a seller, a supplier or a partner. It has a **kind**: `legalEntity` (an organisation with its own registration) or `naturalPerson` (a real person who acts as a legal entity: a sole trader, or a private customer who is invoiced). Both kinds are the same record type, so every module that points at a "customer" points at a company.
- **Person.** A real human being, kept once. A person is not owned by a company: the same person can be linked to many companies.
- **Membership.** The link between one person and one company, with a **relationship name** (for example owner, director, employee, contact, accountant), an optional position text and a period. It also says **who the person reports to** in that company.
- **Relationship name.** A value from a list kept per tenant. The module ships with a starting set that the tenant can extend and deactivate.

A company of kind `naturalPerson` may point at a person record (the same human), so contact details are not typed twice. The link is optional.

## 4. Requirements

### Companies

- **C1.** A user can create, read, change and deactivate a company. A company has a **name** (required), a **kind** (required, `legalEntity` or `naturalPerson`), a **company registration number**, a **tax (VAT) number**, a **country**, a **general e-mail**, a **phone**, a **preferred language** and a **note**. Only the name and kind are required.
- **C2.** A company has **any number of addresses**. Each has a type (for example registered office, postal, delivery), the usual postal fields, and a flag for **primary**. **At most one address of a company is primary**; setting a new primary replaces the old one. The first address becomes primary.
- **C3.** The company registration number is unique per country within a tenant when it is given, and so is the tax (VAT) number, so the same company is not entered twice. A violation is reported as a validation error that names the existing company's id. Both numbers are searchable (K1). Groups of companies that share a tax number are not supported in v1 (there are no groups). How near-duplicates are detected and merged is not part of v1.
- **C4.** A company of kind `naturalPerson` can be linked to a person, and a person is linked to at most one company record. A company of kind `legalEntity` cannot.
- **C5.** Every company, person and membership belongs to exactly one tenant, and a tenant never sees another tenant's parties.

### People

- **P1.** A user can create, read, change and deactivate a person. A person has a **first name** and a **last name** (both required), a **title**, an **e-mail**, a **phone**, a **preferred language** and a **note**.
- **P2.** A person can be found by a search over name and e-mail, and the result shows which companies they are linked to.
- **P3.** **A person is not entered twice.** A person's **e-mail**, when given, is unique within the tenant, and a second person with the same e-mail is refused. A second person whose **normalised full name** (ignoring case, accents, extra spaces and the order of first and last name) equals an existing one is also refused with an error that names the existing person, **unless the user confirms that it is a different human** (a deliberate, audited choice, because two real people can share a name). The confirmation needs its own permission (`Parties.People.ConfirmDistinct`), is stored as a **pair of person ids marked distinct** (so the check does not ask again for the same two people), and is written to the audit log with who confirmed it and when. Erased people (D3) are left out of both name checks.

### Memberships and the hierarchy

- **M1.** A user can link a person to a company with a **relationship name** from the list, an optional **position text** (free text, for example "Head of finance"), and a **valid-from** date and an optional **valid-to** date. Valid-from is required.
- **M2.** **One person can have many memberships**, in the same or in different companies, with the same or different relationship names. Two memberships of the same person in the same company with the same relationship name **cannot overlap in time**.
- **M2a.** **The same name cannot hold the same role twice at the same time.** Within one company, two memberships with the same relationship name whose periods overlap cannot belong to two persons with the same normalised full name (P3), even when they are separate person records. The attempt is refused with an error that names the existing membership. Erased people are not compared (D3). The refusal can be overridden only when the two persons were confirmed as different humans (P3). This stops "two Jan Nowak as director in the same period" without forbidding two genuinely different people who share a name.
- **M3.** A membership can name **one other membership of the same company as the one it reports to**. This gives a **tree** per company: each membership has at most one manager, and the manager is a membership of the **same company**. A membership with no manager is a root. A company can have several roots.
- **M4.** A membership cannot report to itself or, through any chain, to one of its own subordinates. An attempt to create such a loop is refused with a validation error.
- **M5.** The hierarchy can be read as a whole tree for a company (each node: person, relationship, position, period, manager), as the direct reports of one membership, and as the chain of managers above one.
- **M6.** A membership **ends**, it is not deleted: setting a valid-to date closes it, and it stays visible in the history. A membership that still has **current subordinates** (their own membership is current and points at it) **cannot be ended** until each is pointed at another manager or itself ended; the refusal lists them. This keeps the tree free of orphans.
- **M7.** Reading a company or a person can be limited to the memberships that are current on a given date (default: today) or show the whole history.

### Relationship names

- **R1.** The tenant administrator can add a relationship name (a code and a display name in every language the tenant uses), rename it and **deactivate** it. A name that a membership uses cannot be removed; it can only be deactivated, and a deactivated name is not offered for new memberships but stays on the existing ones.
- **R2.** The module installs with a starting set so that it works at once: `owner`, `director`, `employee`, `contact`, `accountant`.

### Deactivation and erasure

- **D1.** Companies and people that other modules may point at are **never physically deleted**. A user **deactivates** them. A deactivated company or person stays readable and resolvable by id, appears in searches only when asked for, and **cannot be chosen for a new reference**. It can be **reactivated**.
- **D2.** Deactivating a company does not change its memberships. Deactivating a person does not end their memberships.
- **D3.** A company or a person can be **erased** (a data-protection request) by a user with a separate permission. Erasure is done in place: the personal facts are replaced by placeholders, the legacy identifier is removed and a tombstone of it is kept (D3 below), the record is deactivated, its id is kept so that references stay valid, and an `erased` event is published. Memberships of an erased person stay, showing the placeholder name; each erased record gets its own placeholder, and **erased people and companies are excluded from the duplicate checks P3 and M2a**, so two erased directors never collide. Erasing a person erases the company of kind `naturalPerson` linked to them, and the other way round, in one operation, because both records hold the same human's data. Erasing a **company** keeps its memberships as they are and does not end them: they show the company's placeholder name, and the people stay untouched. Erasure **clears to null** the e-mail, phone, preferred language, notes and registration and tax numbers of the record and **removes its addresses** (these are the values the unique indexes of C3 and P3 ignore when null, so an erased record never blocks a new one), and replaces the names by a placeholder that is unique to that record. The tombstone of the legacy key is a **keyed hash (HMAC) made with an installation secret**, not a plain hash, because legacy keys are often sequential and a plain hash could be reversed by trying them all. Erasure cannot be undone.
- **D4.** Documents in other modules that took a snapshot of a party are the documents' own data (ADR 0009, rule 4). Parties does not reach into them.

### Concurrency and repeats

- **X1.** Every operation that changes a company, a person, a membership or a relationship name requires the version the user last saw, including ending a membership, deactivating, reactivating and erasing; a stale change is refused (`412`/`428` as the API conventions define).
- **X2.** Creating a company, a person, a membership or a relationship name, and erasing, can be repeated safely with an idempotency key.

### Contract offered to other modules (ADR 0009)

- **K1.** The module's Contracts offer, for companies and for people: **get by id**, **get many by ids**, and **search** by name, registration number, tax number and e-mail. Every result carries the **state** (active or deactivated, erased or not).
- **K2.** A company lookup returns the facts other modules snapshot into their documents: name, kind, registration number, tax number, country, general e-mail, language, the primary address and the other addresses. Nothing else is promised.
- **K3.** A lookup by the **legacy identifier** exists for migrations only, guarded by the permission `Parties.Migration.Resolve`. The permission has scope `host` in the manifest, so the permission contract keeps it out of every tenant role and out of the tenant administrator: only a host principal can hold it, through a host-level role (for example `migration`) that the installation grants to the migration run. It is not reachable over HTTP.
- **K4.** Before it stores a reference to a company or a person, a consuming module checks through the lookup that the party exists and is active.

### Migration

- **G1.** Companies, people, memberships and relationship names each carry a nullable **legacy identifier** (`legacyId`: text, up to 100 characters), the identifier the record had in the system it came from. It is **unique within the tenant** per entity, and when several source systems are loaded the migration **prefixes it with the system** (for example `erp:1234`, `crm:1234`). It is internal: it is not shown or set through the HTTP API and is not part of the lookup results, and its only reader outside the module is the migration-only lookup (K3).
- **G2.** Migration order is people and companies first, then memberships (which refer to both and to each other for the hierarchy), upserting by legacy identifier, so a run can be repeated. A membership whose person or company is not loaded yet is reported, never guessed.
- **G3.** A record whose legacy key was erased (D3) is skipped and reported as erased, never inserted again. Erasure removes the legacy identifier from the record and keeps a keyed hash (HMAC with an installation secret) of it for this check.

## 5. Lifecycles

| Entity | States | Transitions |
|---|---|---|
| Company, Person | active, deactivated | active → deactivated, deactivated → active (reactivate); either → erased (final, also deactivated) |
| Membership | current, ended | current → ended (by setting valid-to). Clearing valid-to again reopens it only if the overlap rule (M2) still holds |
| Relationship name | active, deactivated | active ⇄ deactivated |

## 6. Permissions

All permissions follow the [permission contract](../../spec/permissions.md).

| Permission | Allows |
|---|---|
| `Parties.Companies.Read` / `Create` / `Update` / `Deactivate` | company operations |
| `Parties.People.Read` / `Create` / `Update` / `Deactivate` | person operations |
| `Parties.Memberships.Read` / `Create` / `Update` / `End` | membership and hierarchy operations |
| `Parties.RelationshipNames.Manage` | relationship names |
| `Parties.People.ConfirmDistinct` | confirm that two people with the same name are different humans (P3) |
| `Parties.Erase` | erase a company or a person (separate on purpose) |
| `Parties.Migration.Resolve` (scope `host`) | the migration-only lookup (K3) |

There is no row-level restriction in v1: a user who may read companies reads all companies of the tenant.

## 7. Events

`parties.company.created`, `.updated`, `.deactivated`, `.reactivated`, `.erased`; the same five for `parties.person`; `parties.membership.created`, `.updated`, `.ended`. An event carries the id, the tenant and what changed, and only what a consumer needs to keep a cache or a block in step (names and identifiers, not contact details of a person). The exact data of each is fixed in the module's manifest.

## 8. Out of scope for v1

- Relationships **between companies** (parent group, branch, supplier of). Expected to be a CRM extension.
- Bank accounts of a party. They are kept by the module that needs them (invoicing keeps the seller's accounts).
- Detecting and merging duplicates beyond the unique registration number (C3).
- Sales or marketing data (stages, segments, consent records). CRM adds them, keyed by the party id.
- Import from a spreadsheet and any external register lookup.
- Credentials, user accounts and login. People here are contacts, not users; the identity module owns users.

## 9. Decisions on the open questions

1. **Tax number:** unique per country within a tenant, like the registration number (C3), because v1 has no company groups.
2. **Language:** one preferred language per person and per company is enough.
3. **Position text:** free text (M1), not a controlled list.
4. **Date of birth:** not stored in v1; the confirmation in P3 is the only way to tell namesakes apart.
5. **Primary contact:** no flag. "The first current membership with the relationship `contact`" is the primary contact, by the order in which the memberships were created.

No open questions remain for v1.

## 10. Enforced by

This section lists the checks that keep the code in line with this PRD. **The module does not exist yet, so every check below is planned, not running.** The section is updated when each one is built. A requirement that is not listed has **no check yet**, and the table says so.

| Requirement | Check |
|---|---|
| C2 (one primary address), C3 (registration and tax number), P3 (e-mail) | Unique indexes in the persistence layer: a partial index on the company id where the address is primary (C2), and indexes on tenant, country and number (C3) and tenant and e-mail (P3) that ignore null values, and a contract test run against PostgreSQL and SQL Server |
| M3 (manager in the same company) | A composite foreign key on the membership table (see the [ERD](../erd/parties.md)) |
| M2, M2a, P3 (name), M4, M6 (on PostgreSQL a database exclusion constraint MAY back M2 as well; SQL Server has none) | Checks in the domain layer, run in a serialisable transaction because SQL Server has no exclusion constraint and these rules span rows (overlap, namesakes, recursion), plus domain tests and a concurrent-writers contract test on both databases |
| C4, M1, R1, R2, M5, M7 | Domain and acceptance tests of the module |
| C5 | The platform's tenant-isolation checks, and a conformance test that a second tenant sees none of the first tenant's parties |
| P1, P2, C1 | Acceptance tests of the module (create, read, change, search) |
| D1, D2, D3, D4 | Domain tests of deactivation and erasure; a test that erasure leaves memberships, excludes the record from P3 and M2a, and stores a keyed tombstone |
| K1, K2, K4 | The module's Contracts tests (what a lookup returns, state included) |
| K3, G1–G3 | A test that the manifest declares `Parties.Migration.Resolve` with scope `host`, that no tenant role or administrator holds it and that no HTTP route reaches the lookup, plus migration tests of order, upsert and the erased skip |
| X1, X2 | The black-box conformance suite for concurrency and idempotency |
| Permissions, events | The module manifest, validated by `npm run validate` and by the manifest checks |
