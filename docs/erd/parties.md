# ERD: Parties

- **Module:** `parties`, tenant-scoped (every table has a `tenantId`)
- **PRD:** [Parties](../prd/parties.md). Requirement ids (C2, M3 and so on) refer to it.
- **Status:** Draft
- **Date:** 2026-11-22

## 1. Diagram

```mermaid
erDiagram
    Company ||--o{ CompanyAddress : has
    Company |o--o| Person : "naturalPerson links to"
    Company ||--o{ Membership : employs
    Person ||--o{ Membership : "is in"
    RelationshipName ||--o{ Membership : "named by"
    RelationshipName ||--o{ RelationshipNameText : "shown as"
    Membership |o--o{ Membership : "reports to"
    Person ||--o{ PersonDistinctPair : "A or B"
```

`LegacyTombstone` stands alone (it holds hashes, not references). Nothing in this module has a foreign key to another module, and no other module has one to this module (ADR 0009, rule 1).

## 2. Conventions of every table

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | Primary key, time-ordered (version 7) |
| `tenantId` | uuid | The tenant. Part of every unique index. Every query filters by it |
| `createdAt`, `updatedAt` | timestamp (UTC) | Maintained by the platform |
| `version` | text | Concurrency token (X1). On every table that users change |
| `legacyId` | text(100), null | Identifier in the source system, prefixed with the system (G1). Unique per tenant where not null. Internal, never in the API |

**Tenant boundary in the keys.** Every table has a unique key `(tenantId, id)`, and **every foreign key between tables of this module includes `tenantId`** (for example `(tenantId, companyId)` references `Company(tenantId, id)`), so the database refuses a row that points at another tenant's record (C5). The foreign keys below are written without it for readability; the implementation adds it.

Text columns hold Unicode. **Comparison keys are computed by the application** and stored (`nameKey`, normalised e-mail, normalised numbers), so the rules do not depend on the collation or case behaviour of a database.

## 3. Tables

### Company

| Column | Type | Null | Notes |
|---|---|---|---|
| `kind` | text | no | `legalEntity` or `naturalPerson` |
| `name` | text(255) | no | |
| `registrationNumber` | text(50) | yes | Stored with spaces and separators removed |
| `taxNumber` | text(50) | yes | Same |
| `country` | text(2) | yes | ISO 3166-1 alpha-2 |
| `email` | text(320) | yes | |
| `phone` | text(50) | yes | |
| `language` | text(10) | yes | Preferred language, a BCP 47 tag |
| `note` | text(2000) | yes | |
| `personId` | uuid | yes | The same human as a Person (C4). Foreign key to Person |
| `status` | text | no | `active` or `deactivated` |
| `erasedAt` | timestamp | yes | Set by erasure (D3); an erased company is also `deactivated` |

Constraints: `kind` and `status` in their sets; `personId` is null when `kind` is `legalEntity` (C4); `country` is not null when a registration or tax number is given; `erasedAt` not null implies `status` `deactivated`.
Indexes: unique `(tenantId, country, registrationNumber)` and unique `(tenantId, country, taxNumber)`, each only where the number is not null (C3); unique `(tenantId, legacyId)` where not null; `(tenantId, name)` for search; unique `(tenantId, personId)` where not null (a person is linked to at most one company record, C4); `(tenantId, email)` for search by e-mail.

### CompanyAddress

| Column | Type | Null | Notes |
|---|---|---|---|
| `tenantId` | uuid | no | As in every table |
| `companyId` | uuid | no | Foreign key to Company |
| `type` | text | no | `registeredOffice`, `postal`, `delivery`, `other` |
| `line1`, `line2` | text(255) | line2 yes | |
| `city`, `postalCode` | text(100), text(20) | city no, postalCode yes | |
| `region` | text(100) | yes | |
| `country` | text(2) | no | |
| `isPrimary` | boolean | no | |
| `primaryMarker` | boolean | yes | `true` for the primary address and null for every other one: what the unique index below is built on |
| `createdAt` | timestamp (UTC) | no | When the address was added; decides which remaining address becomes primary when the primary is removed |

Indexes: unique `(tenantId, companyId, primaryMarker)` (C2, at most one primary): a null never equals another null in a unique index of PostgreSQL, and the SQL Server provider filters the nulls out, so the one index serves both products without a filtered-index syntax of its own; `(tenantId, companyId)`.
The application makes the first address primary and moves the flag in two saves, **clearing the current primary first and then setting the new one** (the unique index is checked per statement, so the other order fails); an interrupted move leaves no primary address, never two. Removing the primary address promotes the oldest remaining address. Erasure deletes the address rows of an erased company (D3).

### Person

| Column | Type | Null | Notes |
|---|---|---|---|
| `firstName`, `lastName` | text(100) | no | |
| `title` | text(50) | yes | |
| `email` | text(320) | yes | Stored lower-cased |
| `phone` | text(50) | yes | |
| `language` | text(10) | yes | |
| `note` | text(2000) | yes | |
| `nameKey` | text(200) | no | Normalised full name: lower case, accents removed, whitespace collapsed, the two names sorted (P3, M2a). For an erased person it holds the record's own placeholder, so it never matches another |
| `status`, `erasedAt` | as in Company | | |

Indexes: unique `(tenantId, email)` where not null (P3); `(tenantId, nameKey)` for the namesake check; unique `(tenantId, legacyId)` where not null; `(tenantId, lastName, firstName)` for search.

### RelationshipName and RelationshipNameText

`RelationshipName`: `code` (text 50, required), `isActive` (boolean). Unique `(tenantId, code)`; unique `(tenantId, legacyId)` where not null. The starting set (R2) is inserted when the module is installed for a tenant.

`RelationshipNameText`: `tenantId`, `relationshipNameId` (foreign key), `language` (text 10), `text` (text 100). Primary key `(tenantId, relationshipNameId, language)`.

### Membership

| Column | Type | Null | Notes |
|---|---|---|---|
| `tenantId` | uuid | no | As in every table |
| `companyId` | uuid | no | Foreign key to Company |
| `personId` | uuid | no | Foreign key to Person |
| `relationshipNameId` | uuid | no | Foreign key to RelationshipName |
| `position` | text(100) | yes | Free text |
| `validFrom` | date | no | A calendar date, no time zone |
| `validTo` | date | yes | |
| `reportsToMembershipId` | uuid | yes | The manager's membership (M3) |

Constraints:
- `validTo` is null or not before `validFrom`.
- `reportsToMembershipId` is not equal to `id`.
- **Same company and same tenant, enforced by the database:** a unique key `(tenantId, companyId, id)` and a composite foreign key `(tenantId, companyId, reportsToMembershipId)` to it, so a manager can only be a membership of the same company (M3). The key is declared as a simple match: a null `reportsToMembershipId` (a root of the tree) skips the check, which is intended.
Indexes: `(companyId)`; `(personId)`; `(reportsToMembershipId)`; `(tenantId, relationshipNameId)` for the "name in use" check (R1); unique `(tenantId, legacyId)` where not null.
**Rules the database cannot express** (the PRD's "Enforced by" says they run in the domain layer, in a serialisable transaction): no loop in the tree (M4); no overlap for the same person, company and relationship name (M2); no overlap for two persons with the same `nameKey` in the same company and relationship name unless a PersonDistinctPair exists (M2a); a membership with current subordinates cannot end (M6).

### PersonDistinctPair

`tenantId`, `personAId`, `personBId` (foreign keys to Person), `confirmedBy` (uuid of the user, no foreign key: users belong to another module), `confirmedAt` (timestamp). A confirmed pair is stored **in both directions** (A,B and B,A) in one transaction, and deleted the same way, so no ordering of uuids is needed (it differs between PostgreSQL and SQL Server) and a lookup by either person finds it. Check `personAId` is not equal to `personBId`. The primary key `(tenantId, personAId, personBId)` makes each stored direction unique. Written only under the permission `Parties.People.ConfirmDistinct` and always together with an audit event (P3).

### LegacyTombstone

`entityType` (`company`, `person`, `membership`, `relationshipName`), `keyHash` (text, the HMAC of the legacy key, D3), `erasedAt`. Unique `(tenantId, entityType, keyHash)`. Read only by the migration check (G3).

## 4. What is erased, and how

Erasure (D3) updates the row in place. For a Person: `firstName` and `lastName` become a placeholder that is unique to the record, `title`, `email`, `phone`, `language`, `note` and `legacyId` become null, `nameKey` takes the placeholder, `status` becomes `deactivated`, `erasedAt` is set, and the person's PersonDistinctPair rows are deleted. If a Company of kind `naturalPerson` is linked to the person (the same human, C4), **that company is erased in the same transaction** as described next, so no personal data of the human remains. For a Company: `name` becomes a placeholder, `registrationNumber`, `taxNumber`, `email`, `phone`, `language`, `note`, `legacyId` and `personId` become null, its CompanyAddress rows are deleted (D3 says addresses are removed; the lookup of an erased company then returns none), `status` becomes `deactivated`, `erasedAt` is set. Erasing such a company erases the linked person too, for the same reason; the link is nulled last. The operation is **idempotent and guarded**: it works on the pair in one transaction, skips a record whose `erasedAt` is already set, and writes at most one tombstone per record, so the two directions never recurse. In both cases a LegacyTombstone row is written when a `legacyId` existed. Memberships are not changed (D3). Because the erased values are null, the unique indexes above never block a new record.

## 5. Lookups and the contract (ADR 0009)

| Lookup | Served by |
|---|---|
| Get by id, get many by ids | primary key |
| Search companies | `(tenantId, name)`, the two number indexes, `email` |
| Search people | `(tenantId, lastName, firstName)`, `email` |
| Resolve by legacy id (migration only) | the `(tenantId, legacyId)` indexes |
| Tree of a company, direct reports, chain of managers | `Membership` by `companyId` and `reportsToMembershipId`; the chain and the loop check use a recursive query, depth bounded by the number of memberships of the company |

Every result carries the state (`status`, and whether `erasedAt` is set), never the `legacyId`.

## 6. Notes for the implementations

- **PostgreSQL and SQL Server.** The partial (filtered) unique indexes above exist in both. The unique indexes treat several nulls as allowed because they filter on "not null", which avoids the difference in how the two products treat nulls in a unique index. The domain-layer rules take a serialisable transaction so that the same code serves both products: SQL Server has no exclusion constraint for period overlap. PostgreSQL has one (an exclusion constraint over a date range, which needs the `btree_gist` extension for the equality columns), which an implementation MAY add as a second line of defence for M2 (the same person); M2a compares different person rows by `nameKey` with an exception table, which no constraint expresses, so the domain check stays the rule on both.
- **No deletes.** The application never physically deletes a Company, Person, Membership or RelationshipName (D1, M6, R1). Address rows and distinct pairs can be deleted.
- **Events and audit** are written through the platform's outbox in the same transaction as the change; this module has no event table of its own.
