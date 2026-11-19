# ADR 0006: Tenant isolation modes

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The [tenancy contract](../../spec/tenancy.md) defines what a tenant is and how requests are bound to one, independently of storage. Implementations still have to choose how tenant data is kept apart in the database. There are three common modes, and PostgreSQL and SQL Server (the tier 1 databases, see [ADR 0005](0005-technology-choices-and-dependency-policy.md) and [architecture](../architecture.md)) support them differently.

## Decision

### The modes

| Mode | Isolation | Cost and limits |
|---|---|---|
| `shared` | One database and schema. Every tenant-scoped table has a tenant column. The implementation filters by it on every query | Cheapest, simplest migrations, scales to many small tenants. A filter bug leaks data, so defence in depth is advised |
| `schema` | One schema per tenant in one database | Stronger separation. Migrations run once per tenant. Practical on PostgreSQL; on SQL Server schemas are possible but not supported in 0.1 |
| `database` | One database per tenant | Strongest separation and per-tenant backup and restore. Highest operational cost; migrations run per tenant |

### Support by tier

| Mode | PostgreSQL | SQL Server | Release |
|---|---|---|---|
| `shared` | supported | supported | 0.1 |
| `schema` | planned | not planned | after 0.1 |
| `database` | planned | planned | after 0.1 |

Only the `shared` mode is part of 0.1. The other modes are designed for now but not built until the first release is out and there is demand. An implementation MUST state which modes it supports and MUST NOT claim a mode it has not run the conformance suite against.

### Rules that hold in every mode

- The tenancy contract and its conformance checks are the same in all modes. A mode is an implementation detail behind the contract.
- In `shared` mode the tenant filter is applied by the framework, not by module code, so a module author cannot forget it. Raw SQL in modules must include the tenant condition; the conformance suite and code review are the checks.
- Where the database offers it, row-level security SHOULD be enabled as a second barrier (PostgreSQL row-level security, SQL Server security policies). It is optional in 0.1 and does not replace the application filter.
- The mode is chosen per deployment, not per request. Switching a deployment between modes is a data migration, not a configuration change, and is out of scope for 0.1.
- Tenant-aware caches, search indexes, file storage paths and job queues key on the tenant id in every mode.

## Consequences

- 0.1 can be validated against two databases with one mode, which keeps the conformance matrix small.
- Customers who need hard isolation have a documented path, but not before the first release.
- The contract does not change when new modes are added, so existing modules and clients keep working.
- Defence in depth through row-level security is a recommendation, not a requirement, so the first release does not depend on dialect-specific features.

## Alternatives considered

- **Support all three modes in 0.1.** Rejected: three times the migration and test surface before the contract has been exercised once.
- **Database per tenant only.** Rejected: too costly for the small-tenant SaaS case that is the main target.
- **Make row-level security mandatory.** Rejected for 0.1: different on each database, and hard to test across the matrix before the base model works.
