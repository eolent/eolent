# API conventions (OpenAPI profile)

> **Status:** draft `0.1`, part of the [Eolent specification](README.md). Everything here can change until the first release.

This profile defines how an Eolent backend describes and shapes its HTTP API. An implementation exposes an OpenAPI 3.1 description of its API, and the description follows these conventions. The frontend kit and API client generators rely on them, so that one generated client works against any conforming backend.

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). Error responses are defined by the [error format profile](error-format.md) and tenancy and permissions by their own contracts (planned); this document only states how they appear in the API description.

## 1. Description and versioning

- The API description MUST be OpenAPI 3.1 and MUST be served as JSON at `/openapi/v1.json`, where `v1` is the API major version.
- The API major version MUST appear in the path: `/api/v1/...`. A breaking change to an operation requires a new major version. Adding optional request fields, response fields, operations or enum values is not breaking, so clients MUST ignore unknown response fields and MUST tolerate unknown values of a response enum, for example by displaying them as raw strings. Removing or renaming an enum value is breaking.
- Each module's operations are tagged with the module's manifest `name`.

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| Path segments | plural nouns, lowercase, hyphen-separated | `/api/v1/users`, `/api/v1/audit-logs` |
| Path parameters | `camelCase` | `/api/v1/users/{userId}` |
| JSON properties and query parameters | `camelCase` | `createdAt`, `includeTotal` |
| Enum values | `camelCase` strings | `"pendingApproval"` |
| `operationId` | `camelCase`: module, resource, action | `identityUsersList`, `identityUsersCreate` |
| Schema names | `PascalCase` | `User`, `UserCreateRequest` |

`operationId` values MUST be unique across the whole description, which is why they start with the module name. Generated clients use them as function names.

The module part of an `operationId` is the manifest module name in `camelCase`: dots and hyphens are removed and the following letter is capitalised, and the first letter is lowercase (`identity` stays `identity`, `user-admin` becomes `userAdmin`, `billing.invoices` becomes `billingInvoices`). The resource and action parts are `PascalCase`, so the result is `<module><Resource><Action>`. Tags use the module name exactly as in the manifest. The conversion is not injective (for example `user-admin` and `user.admin` both give `userAdmin`), so two modules whose names convert to the same prefix MUST NOT be installed in the same application, and the uniqueness check in section 9 detects a collision.

## 3. Standard operations

For a resource `users` in module `identity`:

| Operation | Method and path | Success | Notes |
|---|---|---|---|
| List | `GET /api/v1/users` | `200` | Paginated, see section 5 |
| Get | `GET /api/v1/users/{userId}` | `200` | |
| Create | `POST /api/v1/users` | `201` | Returns the created resource and a `Location` header |
| Update | `PATCH /api/v1/users/{userId}` | `200` | JSON Merge Patch ([RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)) |
| Replace | `PUT /api/v1/users/{userId}` | `200` | Optional |
| Delete | `DELETE /api/v1/users/{userId}` | `204` | For entities with `softDelete: true`, the resource is soft-deleted and hidden from all other operations. Otherwise it is removed |
| Custom action | `POST /api/v1/users/{userId}/actions/deactivate` (one literal path per action) | `200` or `202` | Each action is its own path with its own `operationId`, `x-eolent-permission` and responses. Action names are lowercase, hyphen-separated verbs. Use `202` when the work continues asynchronously |

Nested resources are used only when the child cannot exist without its parent: `/api/v1/roles/{roleId}/permissions`.

## 4. Representations

- Request and response bodies are `application/json`, except `PATCH` request bodies, which are JSON Merge Patch documents sent as `application/merge-patch+json`. Errors use `application/problem+json`.
- Resource identifiers are UUIDs, serialised as lowercase hyphenated strings, with `format: uuid` in the description.
- Timestamps are [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) strings in UTC, with `format: date-time`. Dates without a time use `format: date`.
- In responses, an optional value that is absent is omitted or `null`, and clients MUST treat both the same. In `PATCH` request bodies the difference is meaningful, as defined by JSON Merge Patch: an absent property is left unchanged and an explicit `null` clears the value. In `POST` and `PUT` request bodies, an omitted optional property and `null` are treated the same.
- Every persisted resource includes `id`, `createdAt` and `updatedAt`. Resources that support optimistic concurrency also include a `version` string, which is their concurrency token, see section 7.

## 5. Pagination, sorting and filtering

List operations MUST support `limit`, `cursor`, `sort` and `includeTotal`. They support `filter[<property>]` and `q` where the operation declares them with the extensions described below. The parameters are:

| Parameter | Meaning | Default |
|---|---|---|
| `limit` | Maximum items to return, `1` to `200` | `50` |
| `cursor` | Opaque token from a previous response's `nextCursor` | none (first page) |
| `sort` | Comma-separated property names; a leading `-` means descending | the resource's documented default order |
| `filter[<property>]` | Equality filter; a comma-separated list means "any of" | none |
| `q` | Free-text search, when the resource supports it | none |
| `includeTotal` | Boolean. When `true`, the response includes `totalCount` | `false` |

The response is an envelope:

```json
{
  "items": [ { "id": "...", "name": "..." } ],
  "nextCursor": "opaque-token-or-null",
  "totalCount": 123
}
```

The `totalCount` property in this example is present only when the request sets `includeTotal=true`; generated clients MUST treat it as optional.

- `nextCursor` is `null` or absent on the last page. Cursors are opaque and expire; clients MUST NOT parse them.
- `totalCount` is present only when the request sets `includeTotal=true`, because counting can be expensive.
- Range filters use `filter[<property>][gte]`, `[gt]`, `[lte]` and `[lt]`. A list operation declares what it supports with three extensions: `x-eolent-filterable` and `x-eolent-sortable`, each an array of property names, and `x-eolent-searchable`, a boolean. A request that filters or sorts by a property not in the declared array MUST return a validation error and MUST NOT be silently ignored. `q` is accepted only where the operation declares `x-eolent-searchable: true`.

## 6. Tenancy, authentication and permissions in the description

- Authentication is OAuth 2.0 / OpenID Connect bearer tokens, declared as a security scheme named `bearerAuth` of type `http` and scheme `bearer`.
- Every operation that requires a permission declares it with the extension `x-eolent-permission`, whose value is a permission name from the module manifest (for example `Identity.Users.Create`). The permission MUST be declared in the manifest of the module the operation belongs to, that is, the module named by the operation's tag. An operation cannot reference a permission declared by another module.
- Every operation declares `x-eolent-tenancy` with the same vocabulary as the manifest's entity `tenancy`: `tenantScoped` for operations that act within one tenant, and `none` for operations that are not tenant-scoped (for example host administration or public endpoints). Unlike the manifest's entity `tenancy`, the operation-level value has no default: an operation without `x-eolent-tenancy` does not conform. How the tenant is identified is defined by the tenancy contract (planned).

## 7. Concurrency and idempotency

- A resource that supports optimistic concurrency exposes a `version` property in its body. The `ETag` response header carries the same value as a strong entity tag: `ETag: "<version>"`. The body property is authoritative, and clients that cannot read headers can use it. The `version` value is an opaque, non-empty string of visible ASCII characters (`0x21` to `0x7E`) other than the double quote, which is the character set of an entity tag in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-etag) restricted to ASCII.
- For such a resource, `PATCH` and `DELETE`, and `PUT` where the resource offers it, MUST be sent with `If-Match: "<version>"`. A request without `If-Match` returns `428 Precondition Required`; a stale value returns `412 Precondition Failed`. Request bodies do not carry `version`. The operation's description declares the `If-Match` header as required, so generated clients send it.
- Resources without a `version` property do not support optimistic concurrency, and `If-Match` is ignored for them.
- Operations that create resources or trigger side effects MAY accept an `Idempotency-Key` header. A repeated request with the same key and the same body returns the original result; the same key with a different body returns `422`.

## 8. Example

A fragment of a conforming description (abridged). `info.version` is the version of the application's own API, not of this specification:

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Eolent API", "version": "1.0.0" },
  "paths": {
    "/api/v1/users": {
      "get": {
        "operationId": "identityUsersList",
        "tags": ["identity"],
        "x-eolent-permission": "Identity.Users",
        "x-eolent-tenancy": "tenantScoped",
        "security": [{ "bearerAuth": [] }],
        "x-eolent-sortable": ["createdAt", "name"],
        "x-eolent-filterable": ["status"],
        "parameters": [
          { "name": "limit", "in": "query", "schema": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 } },
          { "name": "cursor", "in": "query", "schema": { "type": "string" } },
          { "name": "sort", "in": "query", "schema": { "type": "string" } },
          { "name": "includeTotal", "in": "query", "schema": { "type": "boolean", "default": false } }
        ],
        "responses": { "200": { "description": "A page of users" } }
      }
    }
  }
}
```

## 9. Conformance

The conformance suite checks, against a running backend, that:

- the description is served at `/openapi/v1.json` and is valid OpenAPI 3.1
- `operationId` values are unique and follow the naming rules, including the module conversion above
- every custom action is a literal path with its own unique `operationId`; templated verb paths are rejected
- `x-eolent-tenancy` is present on every operation and has a value of `tenantScoped` or `none`
- list operations accept `limit`, `cursor`, `sort` and `includeTotal`, return the envelope, and include `totalCount` only when `includeTotal=true`
- `filter` parameters are accepted exactly for the properties in `x-eolent-filterable`, `sort` for those in `x-eolent-sortable`, and `q` only where `x-eolent-searchable` is `true`; anything else returns a validation error
- a create operation returns `201` with a `Location` header
- for a resource that exposes `version`, `PATCH` and `DELETE`, and `PUT` where that operation exists, return `428` without `If-Match` and `412` for a stale value, and the `ETag` header equals `"<version>"` (the `version` value in double quotes)
- every `x-eolent-permission` value is declared in the manifest of the module named by the operation's tag
- a request with an unsupported filter or sort property returns a validation error
