# Error format profile

> **Status:** draft `0.1`. Everything here can change until the first release.

This profile defines how an Eolent API reports errors: the response shape, the status codes, the error code registry and the rules that keep error responses safe and translatable. It builds on [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (Problem Details for HTTP APIs) and on the [API conventions](api-conventions.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Response shape

Every error response with a status of `400` or higher that the application produces has the media type `application/problem+json` and a body that is a problem details object. This includes errors raised by the framework itself, such as authentication failures, routing errors (`404`, `405`) and unhandled exceptions (`500`).

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | string (URI) | yes | `urn:eolent:error:` followed by the error `code`, for example `urn:eolent:error:Identity.Users.EmailTaken` |
| `title` | string | yes | Short, human-readable summary, the same for every occurrence of the code. Localized (section 5) |
| `status` | integer | yes | The HTTP status code, equal to the status line |
| `detail` | string | no | Explanation of this occurrence. Localized |
| `instance` | string | no | A URI reference for this occurrence. Implementations MAY omit it |
| `code` | string | yes | Stable, machine-readable error code (section 3). Clients branch on `code`, never on `title` or `detail` |
| `traceId` | string | yes | Identifier that correlates the response with server logs and traces. It MUST be the W3C trace id of the request when one exists |
| `errors` | array | no | Per-field problems, only for validation errors (section 4) |
| `errorsTruncated` | boolean | no | `true` only when `errors` was capped and omits some violations (section 4) |

Responses MAY carry extension properties beyond these. Clients MUST ignore properties they do not know. A module that defines extension properties for its own codes documents them with the code.

Example:

```json
{
  "type": "urn:eolent:error:Identity.Users.EmailTaken",
  "title": "Email address already in use",
  "status": 409,
  "detail": "A user with this email address already exists in this tenant.",
  "code": "Identity.Users.EmailTaken",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

## 2. Status codes

| Status | Meaning in Eolent | Platform code |
|---|---|---|
| `400` | The request is malformed or fails validation, including unsupported filter, sort or `q` parameters | `Eolent.Validation` |
| `400` | A tenant-scoped operation was called and no tenant can be resolved | `Eolent.TenantRequired` |
| `401` | Missing, invalid or expired credentials. The response carries a `WWW-Authenticate: Bearer` header | `Eolent.Unauthenticated` |
| `403` | The caller is authenticated but lacks the required permission | `Eolent.Forbidden` |
| `403` | The tenant claim, header and host name identify different tenants, or the resolved tenant is suspended | `Eolent.TenantMismatch`, `Eolent.TenantSuspended` |
| `403` | The operation is gated by a feature that is off for the tenant (see the [permission contract](permissions.md)) | `Eolent.FeatureDisabled` |
| `404` | The resource or route does not exist, or is not visible to the caller (section 6) | `Eolent.NotFound` |
| `404` | A tenant identified by header or host name does not exist (see the [tenancy contract](tenancy.md)) | `Eolent.TenantNotFound` |
| `405` | The path exists but not for this method. The response carries an `Allow` header | `Eolent.MethodNotAllowed` |
| `406` | The `Accept` header allows no representation the API can produce | `Eolent.NotAcceptable` |
| `409` | The request conflicts with the current state of the resource, for example a duplicate | module code |
| `412` | `If-Match` does not match the current version | `Eolent.PreconditionFailed` |
| `413` | The request body exceeds the allowed size | `Eolent.PayloadTooLarge` |
| `415` | The request `Content-Type` is not supported for this operation | `Eolent.UnsupportedMediaType` |
| `422` | The request is well-formed but reuses an `Idempotency-Key` with a different body | `Eolent.IdempotencyKeyReuse` |
| `422` | A business rule rejects the request. Modules choose `409` or `422` and use `422` only for rules that are not a state conflict | module code |
| `428` | `If-Match` is required and missing | `Eolent.PreconditionRequired` |
| `429` | Rate limit exceeded. The response carries a `Retry-After` header | `Eolent.RateLimited` |
| `500` | Unhandled failure | `Eolent.Internal` |
| other `4xx` | Any other framework-emitted client error with no row above | `Eolent.BadRequest` |
| `503` | The application or a required dependency is temporarily unavailable. The response SHOULD carry `Retry-After` | `Eolent.Unavailable` |

Notes:

- Validation failures use `400` only. `422` is never used for ordinary validation, so a client can treat `400` as "fix the request".
- A framework-emitted response with a `4xx` status that has no row above uses `Eolent.BadRequest`, and one with a `5xx` status that has no row above uses `Eolent.Internal`. Both still use the problem details shape and `status` carries the actual status. Module code is used for module-defined conditions, that is, the `409` and business-rule `422` rows; every other status listed in the table uses its platform code, whichever component emits it.

## 3. Error codes

A code is a dotted name. Each segment is PascalCase ASCII letters and digits, starting with a letter. A code is stable: once released, its meaning and its status never change, and removing a code is a breaking change.

- **Platform codes** have the single namespace `Eolent`. Response-level platform codes have exactly two segments (`Eolent.Validation`); validation item codes (section 4) have three (`Eolent.Validation.Required`). They are defined by this profile, and the table in section 2 and the item list in section 4 are their registry. New platform codes are added to this document with a changelog entry.
- **Module codes** begin with the module's PascalCase name, the same prefix used for permission names, followed by at least one more segment, for example `Identity.Users.EmailTaken`. A module MUST NOT define codes outside its own prefix, and no module may use the prefix `Eolent`.
- A code identifies one failure condition and maps to one status. A condition that can arise with different statuses uses different codes.

A module declares its codes in the `errors` property of its manifest, with the status of each. Every code that one of its operations returns SHOULD be declared there. The manifest does not list the codes of each operation, so this cannot be checked from the manifest alone.

## 4. Validation errors

A response with code `Eolent.Validation` carries an `errors` array with at least one item. Every violation found is reported in one response, with one exception: implementations MAY cap the list at 100 items. When the list is capped, the response carries the extension property `errorsTruncated` set to `true`; otherwise `errorsTruncated` is absent and the list is complete.

Each item is an object:

| Property | Type | Required | Description |
|---|---|---|---|
| `code` | string | yes | A code following section 3 that names the violated rule, for example `Eolent.Validation.Required` or `Identity.Users.PasswordTooWeak` |
| `pointer` | string | no | A [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) to the offending value in the request body |
| `parameter` | string | no | The name of the offending query parameter or header |
| `detail` | string | no | Localized explanation of this violation |

An item has exactly one of `pointer` and `parameter` when the violation concerns a single input, and neither when it concerns the request as a whole. The following platform codes are defined for items: `Eolent.Validation.Required`, `Eolent.Validation.Invalid` (wrong type or format), `Eolent.Validation.OutOfRange`, `Eolent.Validation.TooLong`, `Eolent.Validation.TooShort`, `Eolent.Validation.UnknownValue` (including unsupported filter and sort properties) and `Eolent.Validation.Malformed` (the body is not parseable).

Example:

```json
{
  "type": "urn:eolent:error:Eolent.Validation",
  "title": "The request is not valid",
  "status": 400,
  "code": "Eolent.Validation",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "errors": [
    { "code": "Eolent.Validation.Required", "pointer": "/email", "detail": "Email is required." },
    { "code": "Eolent.Validation.UnknownValue", "parameter": "sort", "detail": "Cannot sort by 'passwordHash'." }
  ]
}
```

## 5. Localization

- The `code` and `errors[].code` values are never translated.
- `title` and `detail` are localized using the request's `Accept-Language` header, falling back as defined by the [localization contract](localization.md) (section 5). The response carries `Content-Language` with the language used. How localization resources are supplied is defined by the [localization contract](localization.md).
- Messages for a code are keyed by the code (`<code>.Title` and `<code>.Detail`), so a translation can be added without changing the API. A code with no `Detail` message in any culture has no `detail` in the response.

## 6. Safety rules

- A `500` response MUST NOT include stack traces, exception messages, SQL, file paths or any other internal detail. The `traceId` is the only handle; operators use it to find the cause in logs.
- A caller MUST NOT be able to learn that a resource exists in another tenant. A request for a resource that exists only in another tenant returns `404 Eolent.NotFound`, identical to the response for a resource that does not exist anywhere. `403` is used for resources the caller can see but lacks permission to act on, and for the tenancy conditions in the [tenancy contract](tenancy.md) (section 5). `Eolent.TenantMismatch` is returned identically whether or not the other tenant exists, so it reveals nothing. The one deliberate exception to the no-existence-leak rule is that an unauthenticated caller can test whether a tenant slug exists, as stated in the tenancy contract.
- `401` and `403` responses MUST NOT name the missing permission or say why the credentials were rejected beyond the code and title.
- Error responses are not cached: they carry `Cache-Control: no-store`.
- `detail` values MUST NOT echo secrets, such as passwords, tokens or keys, even when the request contained them.

## 7. Description in OpenAPI

The OpenAPI description declares the problem details schema once, under `components.schemas.Problem`, and each operation references it for the error statuses it can return. Operations list the statuses they can return in addition to the framework-wide ones in section 2, which do not need to be repeated on every operation: `401`, `403`, `404`, `405`, `429`, `500` and `503`. The media type for all of them is `application/problem+json`.

## 8. Conformance

The conformance suite checks, against a running backend, that:

- every error response has media type `application/problem+json` and the required properties `type`, `title`, `status`, `code` and `traceId`
- `status` equals the HTTP status, `type` equals `urn:eolent:error:` followed by `code`, and `code` follows the code grammar
- a malformed body, a missing required field and an unsupported filter or sort property each return `400` with `Eolent.Validation` and an `errors` array that points at the offending input
- an unauthenticated request returns `401` with a `WWW-Authenticate: Bearer` header, and a request without the required permission returns `403`
- a resource that exists only in another tenant returns a response identical in shape, status and code to a nonexistent resource
- an unknown path returns `404` and a disallowed method returns `405` with an `Allow` header, both as problem details
- an induced server failure returns `500` with no stack trace or internal message in the body
- a missing or stale `If-Match` returns `428` or `412` with the codes above, and a reused `Idempotency-Key` with a different body returns `422` with `Eolent.IdempotencyKeyReuse`
- `Accept-Language` changes `title` and `detail` but not `code`, and the response carries `Content-Language`
- error responses carry `Cache-Control: no-store`
