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
| `401` | Missing, invalid or expired credentials. The response carries a `WWW-Authenticate: Bearer` header | `Eolent.Unauthenticated` |
| `403` | The caller is authenticated but lacks the required permission or feature | `Eolent.Forbidden` |
| `404` | The resource or route does not exist, or is not visible to the caller (section 6) | `Eolent.NotFound` |
| `405` | The path exists but not for this method. The response carries an `Allow` header | `Eolent.MethodNotAllowed` |
| `409` | The request conflicts with the current state of the resource, for example a duplicate | module code |
| `412` | `If-Match` does not match the current version | `Eolent.PreconditionFailed` |
| `422` | The request is well-formed but reuses an `Idempotency-Key` with a different body | `Eolent.IdempotencyKeyReuse` |
| `422` | A business rule rejects the request. Modules choose `409` or `422` and use `422` only for rules that are not a state conflict | module code |
| `428` | `If-Match` is required and missing | `Eolent.PreconditionRequired` |
| `429` | Rate limit exceeded. The response carries a `Retry-After` header | `Eolent.RateLimited` |
| `500` | Unhandled failure | `Eolent.Internal` |
| `503` | The application or a required dependency is temporarily unavailable. The response SHOULD carry `Retry-After` | `Eolent.Unavailable` |

Notes:

- Validation failures use `400` only. `422` is never used for ordinary validation, so a client can treat `400` as "fix the request".
- A response whose status has no row above (for example `415`) still uses the problem details shape, with a module or platform code that follows section 3.

## 3. Error codes

A code is a dotted name. Each segment is PascalCase ASCII letters and digits, starting with a letter. A code is stable: once released, its meaning and its status never change, and removing a code is a breaking change.

- **Platform codes** have the single namespace `Eolent` and exactly two segments, for example `Eolent.Validation`. They are defined by this profile, and the table in section 2 is their registry. New platform codes are added to this document with a changelog entry.
- **Module codes** begin with the module's PascalCase name, the same prefix used for permission names, followed by at least one more segment, for example `Identity.Users.EmailTaken`. A module MUST NOT define codes outside its own prefix, and no module may use the prefix `Eolent`.
- A code identifies one failure condition and maps to one status. A condition that can arise with different statuses uses different codes.

Code registration in the module manifest is planned for manifest `0.2`. Until then, modules document their codes next to the operations that return them.

## 4. Validation errors

A response with code `Eolent.Validation` carries an `errors` array with at least one item. Every violation found is reported in one response; implementations MAY cap the list at 100 items.

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
- `title` and `detail` are localized using the request's `Accept-Language` header, falling back to the tenant's default language and then to English. The response carries `Content-Language` with the language used. How localization resources are supplied is defined by the localization contract (planned).
- Messages for a code are keyed by the code, so a translation can be added without changing the API.

## 6. Safety rules

- A `500` response MUST NOT include stack traces, exception messages, SQL, file paths or any other internal detail. The `traceId` is the only handle; operators use it to find the cause in logs.
- A caller MUST NOT be able to learn that a resource exists in another tenant. A request for a resource that exists only in another tenant returns `404 Eolent.NotFound`, identical to the response for a resource that does not exist anywhere. `403` is used only for resources the caller can see but lacks permission to act on.
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
