# Permission and feature contract

> **Status:** draft `0.1`. Everything here can change until the first release.

This contract defines how permissions and features are named, granted and checked, and the endpoint that tells a client what the current caller may do. Permissions and features are declared in the [module manifest](module.schema.json). It builds on the [API conventions](api-conventions.md), the [tenancy contract](tenancy.md) and the [error format profile](error-format.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Permissions

A permission is a named right to perform a kind of action, for example `Identity.Users.Create`.

- **Name.** Names follow [ADR 0004](../docs/adr/0004-naming-and-versioning-conventions.md): PascalCase segments separated by dots, starting with the module's PascalCase name, by convention `Module.Resource.Action`. A module declares only permissions with its own prefix.
- **Declaration.** A module declares every permission it checks in the `permissions` array of its manifest. A permission that is not declared does not exist: it cannot be granted and checking it is an error.
- **Hierarchy.** A permission can name a `parent` in the same module. The parent chain MUST NOT contain a cycle and MUST end at a permission with no parent. The hierarchy groups permissions for the interface and for menus. It grants nothing.
- **Exact match.** A check for permission `P` succeeds only if the caller holds `P`. Holding a parent does not pass the check for a child, and holding a child does not pass the check for the parent. A permission added to a module in a later release therefore changes nobody's access until it is granted (the administrator role below is the one stated exception).
- **Groups in the interface.** An interface that grants a whole group (a parent and its children) expands it when the grant is made, to every permission below the group at any depth (children, grandchildren and so on) that exists then, as separate grants, so each one is a recorded decision. It grants only permissions whose scope suits the role: a tenant role never receives a host permission this way.

### Operation checks

An operation that declares `x-eolent-permission` requires the caller to pass a check for that permission. The checks run in this order, and the first failure decides the response:

1. authentication (`401`)
2. tenant resolution (tenancy contract)
3. the permission check (`403 Eolent.Forbidden`)
4. the feature check (section 3)

The permission is checked before the feature so that the response to a caller without the permission is the same whatever the feature state. Feature values are not secret from authenticated callers of a tenant: the access endpoint (section 4) returns them to every one of them.

## 2. Grants

- **Roles.** Permissions are granted to roles, and roles are assigned to users. In 0.1 there are no permissions granted directly to a user and no deny rules; grants are only additive. A user's effective permissions are the union of the permissions of all their roles.
- **Per tenant.** Roles, role assignments and therefore grants belong to a tenant. A user's permissions in tenant A say nothing about tenant B.
- **Host permissions.** A host permission is one that only a host principal can hold. Host principals are granted permissions through host-level roles, which exist outside every tenant and are managed by the tenants module; tenant roles never contain host permissions. A manifest marks a host permission with `scope` `host`; the platform host permissions are listed in section 5. An implementation MUST refuse to add a host permission to a tenant role, with `400 Eolent.Validation` and an `Eolent.Validation.UnknownValue` item for the permission, and MUST NOT let a tenant principal pass a check for one.
- **Evaluated on the server.** Permissions are not carried in the access token. The server evaluates them for each request, so a change takes effect without waiting for a new token. Implementations MAY cache grants, and a change MUST take effect within 60 seconds. The same bound applies to the administrator's computed set: a permission that a module installation or upgrade adds reaches administrators within 60 seconds.
- **Agents.** An agent acting for a user MUST NOT hold more permissions than that user. Its effective permissions are the intersection of the user's effective permissions and the permissions explicitly granted to the agent. The user's effective permissions include those of the tenant administrator role, so an agent acting for an administrator can hold at most what the agent itself was granted: an agent is never an administrator and never gains permissions that no one granted to it. The administrator's permission set is the one computed at check time from the installed modules, and it is that computed set, not stored grants, that the agent intersection and the access endpoint use for an administrator. How agents are identified and audited is defined by the [audit log contract](audit.md).
- **Tenant administrator.** Every tenant has a built-in system role, the tenant administrator. It holds every permission with scope `tenant` that the installed modules declare. This is evaluated when a check is made and is not stored as grants, so a permission added by an installed or upgraded module reaches administrators without a grant. Its permissions cannot be edited, and it cannot be deleted. It never holds a host permission. It is assigned to users only, never to agents, by a caller who may manage role assignments; the first administrator is assigned when the tenant is created, and the last administrator of a tenant cannot be removed. It is the only exception to "nothing changes until it is granted": every other role gains a permission only by a grant.
- **Other system roles.** An implementation MAY provide other built-in roles. They are ordinary roles with documented grants, and they obey the same rules.

## 3. Features

A feature is a named capability or limit that can be switched or valued per tenant, for example by edition. Features are declared in the manifest `features` array, with a `valueType` of `boolean`, `integer` or `string` and an optional `default`.

- **Names** follow the same grammar as permissions, starting with the module's PascalCase name.
- **Value.** The value of a feature for a tenant is the tenant's override if one is set, otherwise the manifest `default`, otherwise `false` for `boolean`, `0` for `integer` and the empty string for `string`. Overrides are set by a host principal or by the commercial layer an implementation uses; how is out of scope here.
- **Gating operations.** An operation can declare the extension `x-eolent-feature`, whose value is the name of a `boolean` feature declared in the manifest of the module named by the operation's tag. When the feature is `false` for the tenant, the operation returns `403 Eolent.FeatureDisabled`. Gating by an `integer` or `string` feature is done in the module's own code and is reported with a module code.
- **Tenant context.** Features are evaluated for the resolved tenant. `x-eolent-feature` MUST only be used on `tenantScoped` operations.

## 4. The access endpoint

Clients, including the frontend `usePermission()` hook, learn what the caller may do from one endpoint, owned by the identity module:

`GET /api/v1/me/access`, `operationId` `identityMeAccessGet`, tag `identity`, `x-eolent-tenancy: tenantScoped`, `security: [{ "bearerAuth": [] }]`. It requires no permission: every authenticated caller who has a tenant context may read their own access. A caller with no resolvable tenant, such as a host principal that sends no tenant, gets `400 Eolent.TenantRequired` like any `tenantScoped` operation. `me` is the one singleton resource the API conventions allow, for the current caller.

The response is `200` with:

```json
{
  "tenantId": "0198c4a2-6f1e-7b3a-9c52-3d5e8f1a2b4c",
  "tenantName": "Acme",
  "permissions": ["Identity.Users", "Identity.Users.Create"],
  "features": { "Identity.TwoFactor": true }
}
```

| Property | Description |
|---|---|
| `tenantId` | The resolved tenant |
| `tenantName` | Optional. The tenant's display name, so that an interface can say which tenant the person is working in. Omitted when the implementation does not know a name (a host whose tenant directory has none); a client MUST NOT require it, and an implementation MUST NOT put anything but the tenant's own name there |
| `permissions` | Every permission the caller holds in that tenant, including the permissions of the tenant administrator role, so a client tests membership and needs no hierarchy logic. Sorted, without duplicates |
| `features` | The effective value of every feature declared by the installed modules, by feature name |

The response carries `Cache-Control: private, no-store`. The endpoint is a convenience for the interface and not a security boundary: the server checks permissions again on every operation, and clients MUST NOT treat a permission in this response as authorisation.

A host principal calls the endpoint with a tenant context like any `tenantScoped` operation, and `permissions` then includes the host permissions the principal holds.

## 5. Platform permissions and codes

The tenants module declares the host permission `Tenants.Tenants.Switch`. A host principal needs it to act within a tenant, by header or by host name or through a fixed tenant, as defined by the [tenancy contract](tenancy.md). It is held only by host principals.

The platform codes `Eolent.Forbidden` (`403`, a missing permission) and `Eolent.FeatureDisabled` (`403`, a gated feature that is off) are defined by the [error format profile](error-format.md).

## 6. Conformance

The conformance suite checks, against a running backend, that:

- a caller without the permission declared by an operation's `x-eolent-permission` receives `403 Eolent.Forbidden`, and with it succeeds
- a caller holding a parent permission does not pass the check for a child, and a caller holding only the child does not pass the check for the parent
- the tenant administrator passes the check for every tenant permission that an installed module declares, including one that an upgrade adds afterwards, and a role created by an administrator does not pass the check for a permission added by an upgrade until it is granted
- a group grant in the interface creates one grant per permission below the group, at any depth, that exists at that time, and none for a permission whose scope does not suit the role (a host permission in a group is skipped for a tenant role)
- the tenant administrator role cannot be assigned to an agent, and the last administrator of a tenant cannot be removed
- an agent acting for a tenant administrator passes only the checks for permissions that were explicitly granted to the agent
- a permission added to a group after a group grant is not held by the role that received the group grant, until it is granted; grants made earlier are unchanged
- permissions granted in tenant A do not apply in tenant B for the same user
- removing a permission from a role stops the user passing checks within 60 seconds, without a new token
- a request that fails authentication returns `401` before any permission or feature check, and a caller without the permission gets `403 Eolent.Forbidden` rather than `Eolent.FeatureDisabled` when both would fail
- an operation with `x-eolent-feature` returns `403 Eolent.FeatureDisabled` when the tenant's feature is `false`, and succeeds when it is `true`
- every `x-eolent-feature` value names a `boolean` feature declared by the module named by the operation's tag, and appears only on `tenantScoped` operations
- `GET /api/v1/me/access` returns the caller's own tenant (and its name, when the implementation knows one), an expanded and sorted `permissions` list, and `features` for every installed module, with `Cache-Control: private, no-store`
- every permission in `permissions` is declared in some installed module's manifest, and the `parent` chains in the manifests have no cycles
- an agent acting for a user cannot pass a check the user could not pass
- a host principal without `Tenants.Tenants.Switch` cannot act within a tenant
- adding a host permission such as `Tenants.Tenants.Switch` to a tenant role is refused with `400 Eolent.Validation`, and no tenant principal, including a tenant administrator, passes a check for it
