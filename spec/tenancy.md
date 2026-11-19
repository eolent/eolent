# Tenancy contract

> **Status:** draft `0.1`. Everything here can change until the first release.

This contract defines what a tenant is, how a request is bound to one, how tenant data is kept apart, and what happens when a tenant cannot be determined. It is independent of how an implementation stores the data; storage choices are in [ADR 0006](../docs/adr/0006-tenant-isolation-modes.md). It builds on the [API conventions](api-conventions.md) (`x-eolent-tenancy`) and the [error format profile](error-format.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Tenants

A tenant is an isolated customer space inside one deployment. A tenant has:

| Property | Description |
|---|---|
| `id` | Immutable UUID, never reused. This is the identifier used in tokens, headers, events and audit entries |
| `slug` | Unique DNS label (lowercase letters, digits and hyphens, 3 to 63 characters, not starting or ending with a hyphen). Used to select a tenant by host name. It can be changed by a host administrator |
| `name` | Display name |
| `status` | `active` or `suspended`. A suspended tenant keeps its data but its users cannot use the API |

The tenants module owns tenant management. There is also a **host** level above all tenants, for operators of the deployment. A caller is either a tenant principal (bound to one tenant) or a host principal (bound to none).

## 2. Tenant resolution

The tenant of a request is resolved in this order. Each step that applies yields a tenant; a host name label is first looked up by `slug` to find the tenant `id`. The first step that yields a tenant decides, and later steps are only used to detect conflicts by comparing tenant ids.

1. **Token claim.** An authenticated tenant principal carries the claim `tenant_id` in its access token, whose value is the tenant `id`. This is authoritative.
2. **Header.** `X-Eolent-Tenant`, whose value is a tenant `id`. A tenant principal MAY send it, but it MUST equal the token claim. A host principal MAY send it to act within that tenant, if it holds the host permission that allows switching tenants (defined by the permission contract). An unauthenticated request MAY send it for operations that are tenant-scoped and public.
3. **Host name.** The first label of the request host, when the deployment has a base domain configured and the host is `<label>.<base domain>`. Labels the deployment lists as reserved (for example `api` or `www`) are ignored and do not take part in resolution. Any other label is looked up as a tenant `slug`; one that matches no tenant is `Eolent.TenantNotFound`, except when the request carries a tenant principal's token: then a label that differs from the token's tenant, including one that matches no tenant, is `Eolent.TenantMismatch`. This is how unauthenticated tenant-scoped operations (for example a tenant's sign-in) find their tenant.

If more than one of these identifies a tenant and they identify different tenants, the request is rejected with `Eolent.TenantMismatch` (section 5). A request is never resolved by guessing, by a default tenant, or from request bodies or query parameters.

A deployment with a single tenant still has a tenant; it is resolved the same way, and a deployment MAY configure that tenant as the fixed one so clients need not send anything.

## 3. Operations and tenant context

Every operation declares `x-eolent-tenancy` ([API conventions](api-conventions.md)).

- `tenantScoped` operations require a resolved, active tenant. Without one the request fails (section 5).
- `none` operations do not use a tenant. A tenant claim or header on such a request is ignored, and the operation MUST NOT read or write tenant-scoped data. Operations of this kind that are not public require a host principal or an explicitly stated permission.
- A host principal with no tenant context calling a `tenantScoped` operation gets `Eolent.TenantRequired`. There is no "all tenants" mode in the API.

## 4. Data isolation

For every entity whose manifest `tenancy` is `tenantScoped`:

- every row belongs to exactly one tenant, recorded at creation from the current tenant context and immutable afterwards
- every read, update and delete is confined to the current tenant, whichever isolation mode the implementation uses
- a request for an identifier that exists only in another tenant is indistinguishable from a request for an identifier that does not exist ([error format](error-format.md), section 6)
- a request that refers to another tenant's entity by identifier in a body (for example a foreign key) is treated as referring to an entity that does not exist, and returns `400 Eolent.Validation` with an `Eolent.Validation.UnknownValue` item
- uniqueness rules (for example unique email) apply within a tenant unless the entity declares otherwise
- tenant-scoped data MUST NOT appear in the host's own listings, caches or search indexes without the tenant being part of the key

**Fail closed.** Code that runs without a request (background jobs, event handlers, migrations) has no ambient tenant. It MUST set the tenant context explicitly before touching tenant-scoped data. Access to tenant-scoped data with no tenant context is an error, never a query across all tenants. In 0.1 there is no cross-tenant exception: operations that must work across tenants, such as host administration, use only data that is not tenant-scoped or loop over tenants, setting the context for each.

Events and audit entries carry the `tenantId` of the tenant they concern, as defined by the event envelope and the audit schema (planned).

## 5. Errors

| Condition | Status | Code |
|---|---|---|
| A `tenantScoped` operation, and no tenant can be resolved | `400` | `Eolent.TenantRequired` |
| A tenant is identified by header or host name but does not exist, for an unauthenticated request or a host principal | `404` | `Eolent.TenantNotFound` |
| The token claim, header and host name identify different tenants, or a tenant principal's header or host label names any tenant other than their own, existing or not | `403` | `Eolent.TenantMismatch` |
| The resolved tenant is suspended | `403` | `Eolent.TenantSuspended` |
| The token claim names a tenant that does not exist | `401` | `Eolent.Unauthenticated` |

A tenant principal who sends an `X-Eolent-Tenant` value that differs from their own tenant receives `Eolent.TenantMismatch`, whether or not the other tenant exists. This keeps one tenant's users from probing which other tenants exist through their authenticated session. `Eolent.TenantNotFound` applies to unauthenticated requests and to host principals. For unauthenticated requests this does let anyone test whether a slug exists, which is accepted: slugs are public because they appear in host names. Tenant ids are unguessable UUIDs. This contract therefore gives no guarantee that tenant existence is secret from anonymous callers.

## 6. Conformance

The conformance suite creates at least two tenants with users and data, then checks that:

- tenant A's token cannot read, list, update or delete tenant B's entities, and each attempt returns the same response as a nonexistent identifier
- list responses for tenant A never contain tenant B's items, including under `q`, `filter` and `sort`
- creating an entity binds it to the caller's tenant, and a body that names another tenant's entity as a reference is rejected as above
- a token with `tenant_id` A and `X-Eolent-Tenant` B returns `403 Eolent.TenantMismatch`, whether or not tenant B exists
- an unauthenticated request to a public `tenantScoped` operation resolves the tenant from the header or host name, and an unknown tenant returns `404 Eolent.TenantNotFound`
- a `tenantScoped` operation with no resolvable tenant returns `400 Eolent.TenantRequired`
- a host principal without a tenant context calling a `tenantScoped` operation returns `400 Eolent.TenantRequired`
- a suspended tenant's users receive `403 Eolent.TenantSuspended`
- `none` operations ignore the tenant header and return no tenant-scoped data
- the same checks pass in every isolation mode the implementation claims to support
