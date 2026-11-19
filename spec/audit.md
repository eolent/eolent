# Audit log contract

> **Status:** draft `0.1`. Everything here can change until the first release.

This contract defines what an audit entry records, which actions produce one, who may read them and how they are protected. It also reserves the fields that identify an AI agent acting for a user, so runtime agents can be added later without a breaking change. It builds on the [tenancy contract](tenancy.md), the [permission contract](permissions.md), the [error format profile](error-format.md) and the [API conventions](api-conventions.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. What is audited

An implementation MUST write an audit entry for each of these:

- a successful create, update, delete or restore of an entity whose manifest `auditing` is `true` (the default)
- any other successful mutating operation on such an entity, including custom actions ([API conventions](api-conventions.md)), recorded with `kind` `action`
- every request, reads included, in which a host principal acts within a tenant by the tenant-switching permission (`Tenants.Tenants.Switch`), whichever way the tenant was resolved: header, host name or fixed tenant. The trigger is a `tenantScoped` operation; a `none` operation never produces a `tenantSwitch` entry, even when tenant resolution succeeds. The entry has `kind` `tenantSwitch`, and a mutation made this way also produces its ordinary entry

An implementation MUST also write an entry with outcome `denied` for each of these attempts, whether the request is a read or a change, subject to the rate limit below:

- a request rejected with `Eolent.Forbidden` because the caller lacks the permission of the operation, or with `Eolent.FeatureDisabled` because a gated feature is off. The entry has the `kind` of the attempted operation (`create`, `update`, `delete`, `restore`, `action`, or `read` for a get or a list). Its `tenantId` is the resolved tenant, or `null` for an operation that has no tenant (`none`)
- a refused tenant switch: a host principal that names a tenant by header or host name without holding the tenant-switching permission (`Eolent.Forbidden`). The entry has `kind` `tenantSwitch` and `actor.level` `host`. Its `tenantId` is the id of the named tenant when that tenant exists, and `null` otherwise, so the entry reveals nothing about a tenant that does not exist. The entry is visible to the named tenant's administrators in their audit log: a tenant can see that a host principal tried to enter it and was refused. This is intended transparency about operator access. The response is the same whether or not the tenant exists and is sent before the lookup: the implementation looks the tenant up and writes the entry after the response has been sent, off the request path, so the response time does not depend on the tenant's existence

Other rejections are not recorded as denied entries in 0.1: authentication failures (`401`), `Eolent.TenantMismatch`, `Eolent.TenantSuspended`, validation and conflict errors. Authentication belongs to the identity provider's own log.

**Rate limit.** An implementation MUST limit denied entries per actor so that a misbehaving client cannot flood the log: at most a configured number per actor per minute (the default is 30), after which it counts further attempts and writes one summary entry for the actor when the window ends, or, if the implementation has no timer, on the actor's next denied attempt after the window. The summary has outcome `denied`, the `kind`, `operation` and `tenantId` of the last attempt that was not recorded, no `resource`, and the property `suppressed` set to the number of attempts that were not recorded. No summary is written when that number is zero. If the actor sends no further attempt and there is no timer, the count is lost; the conformance suite does not require a summary in that case. Writing the entries of an attempt never changes the response: if a denied entry cannot be written, the failure is logged and the `403` is returned as usual. This is deliberately unlike audited reads below, which fail closed: a denied attempt changed nothing and returned nothing, so losing its entry costs a record of a refusal, while an unrecorded audited read would return protected data with no trace.

**Read auditing (optional per entity, defined now).** An entity whose manifest sets `auditReads` to `true` has its successful reads recorded: each get by id and each list produces one entry with `kind` `read`, `outcome` `succeeded` and a `resource` whose `id` is absent for a list. A read entry is written before the response is released; if it cannot be written, the request fails with `503 Eolent.Unavailable`, so an audited read is never returned unrecorded. `auditReads` requires `auditing` to be `true` and defaults to `false`. Support for `auditReads` is optional in 0.1: an implementation that does not support it MUST refuse to load a module whose manifest sets it, so data is never believed to be audited when it is not. Reads of entities without `auditReads` are not recorded. A read by a host principal acting in a tenant produces its `tenantSwitch` entry, and also a `read` entry when the entity has `auditReads`; the two do not replace each other.

A `tenantSwitch` entry for an accepted switch has outcome `succeeded`. It is written once the permission check has passed and the tenant is resolved, before the response is sent, independently of any unit of work, so a read produces one too. A request rejected before that point, for example because the named tenant does not exist, produces no entry; a refused switch produces the `denied` entry described above.

An entry is written in the same unit of work as the change it describes: either both are committed or neither is. A change that is rolled back leaves no entry, and a committed change always has one. An entry with outcome `denied` has no change to commit with, a `read` entry has none, and a `tenantSwitch` entry records the switch and not a change, so these three are written independently of any unit of work. A `tenantSwitch` entry therefore remains when the mutation in the same request is rolled back. Apart from these kinds, the rule above holds.

## 2. Entry

An audit entry is a JSON object. Property names are `camelCase`.

| Property | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | yes | Unique, never reused |
| `occurredAt` | string (`date-time`, UTC) | yes | When the change was committed, or, for an entry with no change, when the action happened |
| `tenantId` | string (UUID) or `null` | yes | The tenant the entry concerns. `null` only for changes to data that is not tenant-scoped, for a denied attempt on an operation with no tenant, and for a refused tenant switch that names a tenant that does not exist |
| `actor` | object | yes | Who performed the action (section 3) |
| `onBehalfOf` | object | when `actor.type` is `agent` | The user the agent acted for (section 4). Absent otherwise |
| `kind` | string | yes | `create`, `update`, `delete`, `restore`, `action`, `read` or `tenantSwitch` |
| `outcome` | string | yes | `succeeded` or `denied`. For `tenantSwitch` it is `succeeded` when the switch was made, and the result of the request is not part of the entry, or `denied` for a refused switch |
| `operation` | string | no | The `operationId` of the API operation, when the action came through the API |
| `action` | string | for `kind` `action` | The custom action name as in its path. For another mutating operation, the `operationId` |
| `resource` | object | for all kinds except `tenantSwitch` and the rate-limit summary entry (section 1), and for a `denied` entry other than that summary when the operation names an entity; the summary never carries one; a `denied` entry on an operation that names no entity (for example a `none` operation) omits it | `type` (the module's PascalCase name, a dot, then the manifest entity name, for example `Identity.User` for entity `User` in module `identity`) and `id`. `id` is absent for a `denied` create, which has no resource yet, for a list, and when the request named an id that is not visible in the current tenant |
| `changes` | array | no | The change set (section 5) |
| `changesTruncated` | boolean | no | `true` only when `changes` was capped and omits some items |
| `suppressed` | integer | no | Only on a `denied` entry written at the end of a rate-limit window: the number of denied attempts of the actor that were counted and not recorded (section 1) |
| `approval` | object | no | Reserved for agent actions that needed approval (section 4) |
| `traceId` | string | yes | The W3C trace id of the request, or of the job that made the change. The same value appears in error responses and logs |
| `client` | object | no | Optional request metadata: `ip` and `userAgent`. Implementations MAY omit it, for example for privacy reasons |

An entry, and each object inside it (such as `actor`), carries no property that is not listed here except those that begin with `x-`. Readers MUST ignore properties they do not know.

Example, an agent changing a user's name on behalf of an administrator:

```json
{
  "id": "0f9d3c5e-5a77-4f86-9d1c-2f1b2f0c9a11",
  "occurredAt": "2026-11-19T09:30:12Z",
  "tenantId": "6b1f0f7e-3b0e-4b8c-8f6f-1a2d6f7c9e10",
  "actor": { "type": "agent", "id": "b7a0c4d2-8e11-4a47-9c52-3d6f2a9e0b77" },
  "onBehalfOf": { "type": "user", "id": "2c4e6a80-1f3b-4d5c-8e7a-9b0c1d2e3f40" },
  "kind": "update",
  "outcome": "succeeded",
  "operation": "identityUsersUpdate",
  "resource": { "type": "Identity.User", "id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" },
  "changes": [
    { "path": "/displayName", "old": "J. Novak", "new": "Jana Novakova" }
  ],
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

## 3. Actor

`actor` identifies the principal that performed the action.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | `user`, `agent` or `system` |
| `id` | string (UUID) | for `user` and `agent` | The principal's id. Absent for `system` |
| `level` | string | no | `tenant` or `host`. Defaults to `tenant`. `host` marks a host principal ([tenancy contract](tenancy.md), section 1) |
| `name` | string | no | A display name captured at the time of the action. It is a convenience and may become stale; `id` is authoritative |

`system` is used for changes made with no request principal: background jobs, event handlers, migrations and seeding. A `system` actor SHOULD name the component that acted in an `x-component` property of `actor`. `onBehalfOf` is not used with `system` in 0.1.

The `actor` and `onBehalfOf` identifiers are the same identifiers used in tokens and in the permission contract. They are never reused, so an entry stays interpretable after the principal is deleted.

## 4. Agents acting for a user

An AI agent is a principal of its own. When it acts for a user:

- `actor` is the agent (`type` `agent`, `id` the agent identity)
- `onBehalfOf` is an object with `type` `user` and `id` the user. It is required for every entry whose actor is an agent. An agent with no user to act for is not defined in 0.1
- the permissions that were checked are those of the permission contract: the intersection of the user's and the agent's permissions, so an entry whose outcome is `succeeded` implies that the user could have performed the same action

A user acting directly never has `onBehalfOf`, and neither does a `system` actor. Readers MUST NOT infer from a missing `onBehalfOf` anything other than that the actor did not act for another principal.

The optional `approval` object records that a human approved the action before it ran, for operations an agent may only perform with approval (`requiresApproval` of an entry in `agentTools` in the manifest):

| Property | Type | Description |
|---|---|---|
| `approvedBy` | object | `type` `user` and `id` of the approver |
| `approvedAt` | string (`date-time`, UTC) | When the approval was given |

The `approval` property is reserved. Implementations that have no approval flow omit it.

## 5. Change set

`changes` lists what a change did to the resource, as an array of items:

| Property | Type | Description |
|---|---|---|
| `path` | string | A [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) into the resource representation of the API, for example `/displayName` |
| `old` | any | The value before the change. Absent when the property had no value before, as for `create`; a value that was JSON `null` is recorded as `null` |
| `new` | any | The value after the change. Absent when the property has no value afterwards, because it was removed; a value set to JSON `null` is recorded as `null`, so a removed value and a null value can be told apart |
| `redacted` | boolean | `true` when the value is sensitive: `old` and `new` are then both absent and the item records only that the property changed |

Rules:

- for `create`, `changes` contains one item per property that has a value, with `new` only, except that a secret property is recorded with `redacted` `true` and no `new`
- for `update`, `changes` contains one item per property whose value changed, and none for a property whose value did not change
- for `delete` and `restore`, `changes` MAY be absent. A soft delete is recorded as `delete` and its restore as `restore`
- a property MUST be recorded with `redacted` `true`, never with its value, when its name, compared without case, ends with `password`, `secret`, `token`, `apikey` or `privatekey`, and also when the entity lists it in `sensitiveProperties` in the manifest. An implementation MAY treat more properties as secret
- `path` uses the property names of the API representation, not storage names, so entries read the same in every implementation

An implementation MAY cap the number of items in one entry. When it does, it sets the entry property `changesTruncated` to `true`, as the error format does with `errorsTruncated`; otherwise the property is absent and the list is complete.

## 6. Reading the log

The audit log is exposed as a read-only collection by the audit module. The operations follow the [API conventions](api-conventions.md):

| Operation | `operationId` | Permission |
|---|---|---|
| `GET /api/v1/audit-logs` | `auditAuditLogsList` | `Audit.AuditLogs.Read` |
| `GET /api/v1/audit-logs/{id}` | `auditAuditLogsGet` | `Audit.AuditLogs.Read` |

Both are `tenantScoped` and return only entries whose `tenantId` is the current tenant. A request for the identifier of another tenant's entry returns `404 Eolent.NotFound`, as for any tenant-scoped entity. Entries with a `null` `tenantId` are not exposed by the API in 0.1; deployments read them from their own store. This is a known gap: host administrators have no API way to read the audit trail of host-level changes.

The list operation supports `limit`, `cursor`, `sort` and `includeTotal` as in the API conventions. It declares `x-eolent-filterable` with `occurredAt` (range filters `gte`, `gt`, `lte`, `lt`), `actor.id`, `actor.type`, `onBehalfOf.id`, `kind`, `outcome`, `operation`, `resource.type`, `resource.id` and `traceId`, and `x-eolent-sortable` with `occurredAt`; it is not searchable. Dotted names address nested properties of the entry, so filters take the form `filter[actor.id]=...`. This is a deliberate extension of the property naming in the API conventions. Results are sorted by `occurredAt` descending unless the client sorts otherwise. The collection has no create, update or delete operation.

## 7. Integrity and retention

- Entries are append-only. No API operation, and no application code path outside retention, can change or delete an entry
- A tenant's entries are tenant-scoped data. They follow the isolation rules of the [tenancy contract](tenancy.md), including that they never appear in another tenant's results
- Retention is set per deployment. Removing entries because their retention period ended is not an audit event, but the deployment MUST keep an operational record of it (what range was removed and when); this contract defines no format for that record
- `tenantSwitch` entries for host reads can be numerous. Deployments SHOULD give them their own retention period. They MUST NOT be sampled or dropped before that period ends; the retention rule above is the only reason to remove them. The write volume is a known cost of the rule
- A deployment MAY forward entries to an external store. Entries are exported in the form in section 2

## 8. Conformance

The conformance suite checks that:

- creating, updating and deleting an audited entity each produce one entry with the right `kind`, `tenantId`, `actor`, `resource` and `traceId`, and that the `traceId` equals the trace id in the request's `traceparent` header
- an update records exactly the changed properties in `changes`, with `old` and `new`
- a host mutation that is rolled back leaves its `tenantSwitch` entry and no ordinary entry
- a failed request that changed nothing leaves no `succeeded` entry, other than a `tenantSwitch` entry, which records the switch and not the outcome of the request
- a property that matches the secret-name rule in section 5, such as `password`, or that the entity lists in `sensitiveProperties`, is recorded with `redacted` `true` and no values
- a request without the permission, and a request to a feature-gated operation with the feature off, each produce one `denied` entry with the `kind` of the attempted operation, the caller as `actor` and the resolved tenant, for a read and for a change, and the response is the same `403` as without auditing
- a host principal without the tenant-switching permission that names a tenant produces a `denied` `tenantSwitch` entry with `tenantId` set to the tenant when it exists and `null` when it does not, and the two responses are identical
- repeated denied attempts by one actor beyond the limit are counted, and one entry with `suppressed` is written at the end of the window
- an implementation that supports `auditReads` records each get and list of such an entity as a `read` entry, fails the request with `503 Eolent.Unavailable` when the entry cannot be written, and one that does not support it refuses to load a manifest that sets it
- a call made with an agent token on behalf of a user produces an entry with `actor.type` `agent` and `onBehalfOf` set to that user, and a call made by the user directly has no `onBehalfOf`
- a host principal acting within a tenant, for a read and for a mutation, produces a `tenantSwitch` entry with `actor.level` `host`, and a tenant principal's read produces none
- the list operation returns only the current tenant's entries, including under filters, and a request for another tenant's entry returns the same response as for a nonexistent one
- the log has no operation that creates, updates or deletes an entry
- every entry has the required properties for its `kind` and `actor.type`
