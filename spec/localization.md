# Localization contract

> **Status:** draft `0.1`. Everything here can change until the first release.

This contract defines how an Eolent module ships translatable text, how a culture is chosen, how missing text falls back, and how the frontend gets the texts it shows. It also defines the `llms.txt` file that a module ships so that AI tools can find its documentation. It builds on the [error format profile](error-format.md) (localized `title` and `detail`), the [module manifest](module.schema.json) (`localization`, `titleKey`) and the [API conventions](api-conventions.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. What is localized

- **Messages** are texts the system shows to a person: UI labels, menu titles, and the `title` and `detail` of error responses. They are translated and follow this contract
- **Data** is what users store: names, descriptions, documents. It is never translated by the framework, and an API returns it as stored
- **Codes and identifiers** (error codes, permission names, event types, enum values) are never translated

Formatting of numbers, dates and currencies follows the culture of the request and is done by the client or by the message itself (section 3), not stored in data. Dates and times in API data stay RFC 3339 in UTC ([API conventions](api-conventions.md)).

## 2. Cultures

A culture is a [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) language tag, for example `en`, `cs` or `pt-BR`. Matching drops subtags from the end: `zh-Hant-TW` matches `zh-Hant`, then `zh`. In the module manifest, `defaultCulture` is the culture the module's own texts are written in, and `localization.resources` lists one file per culture.

## 3. Resource files

A resource file is a UTF-8 JSON object that maps message keys to message strings. The file name is the culture followed by `.json`, for example `en.json` or `pt-BR.json`. In the manifest, `defaultCulture` and the file name use the same spelling, and are compared exactly.

- the object is flat: every value is a string, and there are no nested objects. Keys contain dots, so nesting would be ambiguous
- a key is a dotted name whose segments are PascalCase ASCII letters and digits, starting with a letter. It begins with the module's PascalCase name followed by a dot, the same prefix used for permission names ([ADR 0004](../docs/adr/0004-naming-and-versioning-conventions.md)), so keys of different modules never collide. The prefix `Eolent` is reserved for the platform's own messages
- a message is written in [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) (the stable syntax of ICU 4J and ICU 4C, also known as MessageFormat 1). Arguments are named, in `camelCase`: `Hello, {name}`. Plural and select forms use the culture's CLDR rules: `{count, plural, one {# user} other {# users}}`. Number and date arguments use the ICU styles. Custom formatting functions are not part of this contract
- the characters `{` and `}` in a literal text are quoted as in ICU (`'{'`). A message with unbalanced braces is invalid
- an argument that a message declares and the caller does not supply is a defect, and the message is not shown with a placeholder: it falls back (section 5) to the next culture, and finally to the key. This is a run-time requirement of implementations, which parse the messages; the static checks of this repository cannot see it

Example, `i18n/en.json` and `i18n/cs.json` of the identity module:

```json
{
  "Identity.Menu": "Identity",
  "Identity.Users": "Users",
  "Identity.Users.EmailTaken.Title": "Email address already in use",
  "Identity.Users.EmailTaken.Detail": "A user with the email {email} already exists in this tenant."
}
```

```json
{
  "Identity.Menu": "Identita",
  "Identity.Users": "Uživatelé",
  "Identity.Users.EmailTaken.Title": "E-mailová adresa se už používá",
  "Identity.Users.EmailTaken.Detail": "Uživatel s e-mailem {email} už v tomto tenantu existuje."
}
```

## 4. Keys the platform reads

| Use | Key |
|---|---|
| A route or menu `titleKey` in the manifest | The `titleKey` itself |
| Error `title` | `<code>.Title`, where `<code>` is the error code |
| Error `detail` | `<code>.Detail` |
| Detail of a validation item | `<item code>.Detail`, for example `Eolent.Validation.Required.Detail` |

A manifest that names `titleKey` values or declares `errors` MUST have a `localization` block. Every key that the manifest names (`titleKey` values) and every code the manifest declares in `errors` MUST exist in the file of the module's `defaultCulture`: the `Title` key for a code. A `Detail` key is optional, because the manifest does not say which codes have a detail; a `Detail` key in another culture must exist in the default culture (below). The `defaultCulture` file MUST be listed in `resources`. Other cultures are optional and may be incomplete, but a key in another culture file MUST also exist in the `defaultCulture` file, so a `Detail` or `Title` message cannot exist without its default.

The platform ships messages for its own codes (`Eolent.*`, see the [error format](error-format.md)) in English. Implementations MAY ship more cultures.

Values for named arguments in an error's `detail` are the properties that the module documents with the code. A code with a `Detail` message that uses an argument MUST document that argument.

## 5. Choosing a culture and falling back

For a request, the culture is chosen from the `Accept-Language` header, respecting quality values, as the first listed culture for which a resource file exists (a file of that culture or of a parent tag). The other listed cultures are not used for per-key fallback. Matching of a requested culture is case-insensitive: the implementation compares the requested tag with the file's culture after lowercasing both, and file names themselves keep their spelling. A requested culture matches a file with the same tag, or a file for the tag with its last subtags removed (`cs-CZ` matches `cs`).

For each message key, the text comes from the first of these that has the key:

1. the culture chosen for the request
2. the culture with its last subtag removed, repeated down to the language alone
3. the tenant's default culture, when a tenant is resolved: the tenant value of the setting `Localization.DefaultCulture`
4. the deployment's default culture: the global value of the same setting, which is `en` unless the deployment sets it
5. `en`
6. the module's own `defaultCulture`, which is guaranteed to have every key the manifest names

If no file has the key, the text is the key itself for UI labels. For an error `detail` there is no such fallback: a code with no `<code>.Detail` message in any culture has no `detail` in the problem details, which is allowed because `detail` is optional. A missing `Title` never happens for codes that satisfy section 4.

Responses that carry one localized message, such as error responses, set `Content-Language` to the culture that supplied the `title`. When parts come from different fallback cultures, `Content-Language` names the culture of the first part.

A user preference for the interface language is a client concern: the frontend sends it as `Accept-Language`. The setting `Localization.DefaultCulture` is declared by the localization module (a platform module, not yet written) with scope `tenant`, so a tenant can override its global value. Where the module is not installed, steps 3 and 4 use no setting and the deployment default is `en`.

## 6. Resources for the frontend

The frontend loads the messages for the interface from one operation instead of from each module:

| Operation | `operationId` | Notes |
|---|---|---|
| `GET /api/v1/localization/resources/{culture}` | `localizationResourcesGet` | Tenancy `none`, no permission, public |

It returns `200` with the media type `application/json` and an object `culture` (the culture the request resolved to under steps 1 and 2 of section 5, or the deployment's default culture when no file matches; it is also the `Content-Language`) and `messages` (a flat map of every message key of every installed module and the platform to its text, for that culture, with the fallback of section 5 already applied, except step 3, since the operation does not use a tenant). The client does not need to know the fallback chain. For this response, `Content-Language` is the resolved `culture`, not the culture of each message: the rule in section 5 for the culture of a single message does not apply to it.

The endpoint chooses the culture from the path parameter only and ignores `Accept-Language`. It also ignores the tenant, so a tenant whose default culture is `cs` gets error responses in Czech but this operation in the deployment default unless the shell asks for `cs`; the shell therefore passes the culture it wants explicitly. It exposes every message of every installed module, so message files MUST NOT contain internal or confidential wording; the operation is public by design, so a login page can be shown in the user's language. The response carries `Content-Language`, an `ETag`, and `Cache-Control: public, max-age=300`. A culture for which no file exists is served from the fallback chain, with `culture` naming the culture it resolved to, as above. Individual messages can still come from a later fallback step. A `culture` that is not a valid tag returns `400 Eolent.Validation` with an `Eolent.Validation.Invalid` item for the path parameter `culture`.

## 7. llms.txt

A module ships a file `llms.txt` at the root of its documentation, in the format of the [llms.txt proposal](https://llmstxt.org/), so that AI tools can find what to read:

- a first-level heading with the module's display name
- a short summary as a blockquote
- sections (`##`) of list items, each a Markdown link followed by a colon and a short note

An Eolent module's `llms.txt` MUST have these sections (the validation of this repository checks the heading, the summary and these two sections for the hub's own file, and a module's own checks are the module's responsibility): `Contract`, with links to the module manifest and the OpenAPI description; and `Docs`, with links to the module's documentation pages. It MAY have `Optional`, for links that a tool can skip when short of context. Links are relative to the file or absolute. The `llms.txt` of a release describes that release.

The hub repository has a root `llms.txt` that indexes the specification. Its links are checked by the validation of this repository, like the links in Markdown files.

## 8. Conformance

The conformance suite checks, against a running backend, that:

- an error response in a culture the platform has messages for has a `title` and `detail` in that culture, `Content-Language` names it, and `code` is unchanged
- a requested culture with a region that has no file is served from the file of its language, and an unsupported culture falls back to the default
- `Accept-Language` quality values are respected
- `GET /api/v1/localization/resources/{culture}` returns, for every module installed, all keys of its `defaultCulture` file, with `Content-Language`, an `ETag` and the `Cache-Control` above, and an invalid culture returns `400 Eolent.Validation`
- a message that declares an argument the caller does not supply falls back instead of showing a placeholder
- every `titleKey` and error code declared in a module manifest has its message in the module's default culture (the validation of manifests in this repository checks the same for the examples)
