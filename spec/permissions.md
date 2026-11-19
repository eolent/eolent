# Permission and feature contract

> **Status:** draft `0.1`. Everything here can change until the first release.

This contract defines how permissions and features are named, granted and checked, and the endpoint that tells a client what the current caller may do. Permissions and features are declared in the [module manifest](module.schema.json). It builds on the [API conventions](api-conventions.md), the [tenancy contract](tenancy.md) and the [error format profile](error-format.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Permissions

A permission is a named right to perform a kind of action, for example `Identity.Users.Create`.

- **Name.** Names follow [ADR 0004](../docs/adr/0004-naming-and-versioning-conventions.md): PascalCase segments separated by dots, starting with the module's PascalCase name, by convention `Module.Resource.Action`. A module declares only permissions with its own prefix.
- **Declaration.** A module declares every permission it checks in the `permissions` array of its manifest. A permission that is not declared does not exist: it cannot be granted and checking it is an error.
- **Hierarchy.** A permission can name a `parent` in the same module. The parent chain MUST NOT contain a cycle and MUST end at a permission with no parent.
- **Inheritance.** Holding a permission means holding every permission below it. A check for permission `P` succeeds if the caller holds `P` or any ancestor of `P`. So a caller who holds `Identity.Users` passes checks for `Identity.Users.Create`, and a caller who holds only `Identity.Users.Create` does not pass a check for `Identity.Users`.
- **Parent permissions as groups.** Because holding a parent grants everything below it, a parent permission is a convenient group, and should be declared with `displayName` and `description` that say so.

### Operation checks

An operation that declares `x-eolent-permission` requires the caller to pass a check for that permission. The checks run in this order, and the first failure decides the response:

1. authentication (`401`)
2. tenant resolution (tenancy contract)
3. the permission check (`403 Eolent.Forbidden`)
4. the feature check (section 3)

The permission is checked before the feature so that the response to a caller without the permission is the same whatever the feature state. Feature values are not secret from authenticated callers of a tenant: the access endpoint (section 4) returns them to every one of them.

## 2. Grants

- **Roles.** Permissions are granted to roles, and roles are assigned to users. In 0.1 there are no permissions granted directly to a user and no deny rules; grants are only additive. A user's effective permissions are the union of the permissions of all their roles, with inheritance applied.
- **Per tenant.** Roles, role assignments and therefore grants belong to a tenant. A user's permissions in tenant A say nothing about tenant B.
- **Host permissions.** A permission can be a host permission: one that only a host principal can hold, and that is not granted through tenant roles. Host permissions are declared like any other permission; marking a permission as host-only in the manifest is planned for manifest `0.2`. Until then, the host-only permissions defined by this contract are the ones in section 5.
- **Evaluated on the server.** Permissions are not carried in the access token. The server evaluates them for each request, so a change takes effect without waiting for a new token. Implementations MAY cache grants, and a change MUST take effect within 60 seconds.
- **Agents.** An agent acting for a user MUST NOT hold more permissions than that user. Its effective permissions are the intersection of the user's permissions and the permissions granted to the agent, each taken as the full set of permissions it passes checks for (inheritance applied, that is, the held permissions plus all their descendants), not as the raw grants. How agents are identified and audited is defined by the audit schema (planned).
- **System roles.** An implementation MAY provide built-in roles (for example an administrator role). They are ordinary roles, with grants the implementation documents, and they obey the same rules.

## 3. Features

A feature is a named capability or limit that can be switched or valued per tenant, for example by edition. Features are declared in the manifest `features` array, with a `valueType` of `boolean`, `integer` or `string` and an optional `default`.

- **Names** follow the same grammar as permissions, starting with the module's PascalCase name.
- **Value.** The value of a feature for a tenant is the tenant's override if one is set, otherwise the manifest `default`, otherwise `false` for `boolean`, `0` for `integer` and the empty string for `string`. Overrides are set by a host principal or by the commercial layer an implementation uses; how is out of scope here.
- **Gating operations.** An operation can declare the extension `x-eolent-feature`, whose value is the name of a `boolean` feature declared in the manifest of the module named by the operation's tag. When the feature is `false` for the tenant, the operation returns `403 Eolent.FeatureDisabled`. Gating by an `integer` or `string` feature is done in the module's own code and is reported with a module code.
- **Tenant context.** Features are evaluated for the resolved tenant. `x-eolent-feature` MUST only be used on `tenantScoped` operations.

## 4. The access endpoint

Clients, including the frontend `usePermission()` hook, learn what the caller may do from one endpoint, owned by the identity module:

`GET /api/v1/me/access`, `operationId` `identityMeAccessGet`, tag `identity`, `x-eolent-tenancy: tenantScoped`, `security: [{ "bearerAuth": [] }]`. It requires no permission: every authenticated caller may read their own access. `me` is the one singleton resource the API conventions allow, for the current caller.

The response is `200` with:

```json
{
  "tenantId": "0198c4a2-6f1e-7b3a-9c52-3d5e8f1a2b4c",
  "permissions": ["Identity.Users", "Identity.Users.Create"],
  "features": { "Identity.TwoFactor": true }
}
```

| Property | Description |
|---|---|
| `tenantId` | The resolved tenant |
| `permissions` | Every permission the caller passes a check for in that tenant, that is, the permissions they hold plus all their descendants, so a client tests membership and needs no hierarchy logic. Sorted, without duplicates |
| `features` | The effective value of every feature declared by the installed modules, by feature name |

The response carries `Cache-Control: private, no-store`. The endpoint is a convenience for the interface and not a security boundary: the server checks permissions again on every operation, and clients MUST NOT treat a permission in this response as authorisation.

A host principal calls the endpoint with a tenant context like any `tenantScoped` operation, and `permissions` then includes the host permissions the principal holds.

## 5. Platform permissions and codes

The tenants module declares the host permission `Tenants.Tenants.Switch`. A host principal needs it to act within a tenant, by header or by host name or through a fixed tenant, as defined by the [tenancy contract](tenancy.md). It is held only by host principals.

The platform codes `Eolent.Forbidden` (`403`, a missing permission) and `Eolent.FeatureDisabled` (`403`, a gated feature that is off) are defined by the [error format profile](error-format.md).

## 6. Conformance

The conformance suite checks, against a running backend, that:

- a caller without the permission declared by an operation's `x-eolent-permission` receives `403 Eolent.Forbidden`, and with it succeeds
- a caller holding a parent permission passes the check for a child, and a caller holding only the child does not pass the check for the parent
- permissions granted in tenant A do not apply in tenant B for the same user
- removing a permission from a role stops the user passing checks within 60 seconds, without a new token
- a request that fails authentication returns `401` before any permission or feature check, and a caller without the permission gets `403 Eolent.Forbidden` rather than `Eolent.FeatureDisabled` when both would fail
- an operation with `x-eolent-feature` returns `403 Eolent.FeatureDisabled` when the tenant's feature is `false`, and succeeds when it is `true`
- every `x-eolent-feature` value names a `boolean` feature declared by the module named by the operation's tag, and appears only on `tenantScoped` operations
- `GET /api/v1/me/access` returns the caller's own tenant, an expanded and sorted `permissions` list, and `features` for every installed module, with `Cache-Control: private, no-store`
- every permission in `permissions` is declared in some installed module's manifest, and the `parent` chains in the manifests have no cycles
- an agent acting for a user cannot pass a check the user could not pass
- a host principal without `Tenants.Tenants.Switch` cannot act within a tenant
