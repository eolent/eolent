# Event envelope

> **Status:** draft `0.1`. Everything here can change until the first release.

This profile defines the envelope of an Eolent event: the attributes every event carries, how tenant and trace context travel with it, and the delivery rules consumers can rely on. It is a profile of [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md). It does not define a transport or a message broker; those are implementation choices ([ADR 0005](../docs/adr/0005-technology-choices-and-dependency-policy.md)). It builds on the [module manifest](module.schema.json) (`events`), the [tenancy contract](tenancy.md) and the [audit log contract](audit.md).

The key words MUST, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Event types

The `type` of an event is the event `name` declared in the publishing module's manifest, for example `identity.user.created`. Rules:

- the name is lowercase, dot-separated, as the manifest schema requires. By convention it is the module's manifest name, then the entity in lowercase, then a past-tense verb: `identity.user.created`, `billing.invoices.invoice.paid`
- only the module that declares an event as `publishes` may publish it, and the name begins with the module's manifest name followed by a dot (`user-admin.user.created`, `billing.invoices.invoice.paid`)
- an event type is stable. Adding optional properties to `data` is compatible. Any other change to `data` is breaking and is published as a new type that ends in a version segment, for example `identity.user.created.v2`. Each type, including every `.vN` type, has its own `events` entry in the manifest. Both types are published during a deprecation period set by the module and stated in the module's documentation; 0.1 has no manifest field for it

## 2. Attributes

Events use the CloudEvents attributes below. "Required" is stricter than CloudEvents where noted.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | `1.0` |
| `id` | string | yes | A UUID, unique per event. With `source` it identifies the event; a redelivery carries the same `id` |
| `source` | URI reference | yes | `urn:eolent:module:` followed by the module's manifest name, for example `urn:eolent:module:identity` |
| `type` | string | yes | The event type (section 1) |
| `time` | timestamp | yes (CloudEvents: optional) | When the change that caused the event was committed, [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) in UTC |
| `datacontenttype` | string | yes | `application/json` |
| `dataschema` | URI | no | The schema of `data`, from the `dataSchema` of the manifest event. It MUST be an absolute URI: a relative manifest path is resolved against a schema base URI that the deployment configures, and a deployment where any module uses a relative `dataSchema` MUST configure one |
| `subject` | string | no | The identifier of the entity the event is about, when there is one |
| `data` | object | yes (CloudEvents: optional; an event with no facts carries `{}`) | The payload. A JSON object, valid against the declared `dataSchema` |

An event carries only the attributes in this document (including the optional `tracestate`, listed in section 3) and, in addition, extension attributes that a module defines for its own events. The names of module-defined attributes begin with the module's manifest name with dots and hyphens removed, for example `identityscope`; a module-defined name MUST NOT equal any attribute name defined by CloudEvents or by this document (for example `tenantid`), and modules whose names reduce to the same prefix MUST NOT define attributes with the same name. Attribute names follow CloudEvents: lowercase letters and digits only. Consumers MUST ignore attributes they do not know.

## 3. Context extensions

These extension attributes carry the context of the request or job that caused the event. They have the same meaning as the corresponding fields of the [audit log](audit.md), under names that CloudEvents requires to be lowercase letters and digits:

| Event attribute | Audit field |
|---|---|
| `tenantid` | `tenantId` |
| `actortype`, `actorid` | `actor.type`, `actor.id` |
| `onbehalfof` | `onBehalfOf.id` (the `type` is always `user`) |
| `traceparent` | `traceId`: the audit `traceId` equals the trace id inside `traceparent`; the other `traceparent` fields (parent id, flags) have no audit counterpart |

The attributes are:

| Attribute | Type | Required | Description |
|---|---|---|---|
| `tenantid` | string (UUID) | yes, except for events about data that is not tenant-scoped | The tenant the event concerns ([tenancy contract](tenancy.md)). Absent only for events about data that is not tenant-scoped, such as host administration |
| `traceparent` | string | yes | The [W3C trace context](https://www.w3.org/TR/trace-context/) of the causing request or job. It follows the CloudEvents distributed tracing extension. `tracestate` MAY accompany it |
| `tracestate` | string | no | The W3C `tracestate` that accompanies `traceparent` |
| `actortype` | string | yes | `user`, `agent` or `system`, as for the audit `actor` |
| `actorid` | string (UUID) | for `user` and `agent` | The principal that caused the event |
| `onbehalfof` | string (UUID) | when `actortype` is `agent` | The id of the user the agent acted for. Absent otherwise |

An event is about data that is not tenant-scoped when its manifest `events` entry names an `entity` of the module whose `tenancy` is `none`. Every published event declares an `entity`, and an entity the module does not declare is a manifest error that the validation and the conformance suite reject. The manifest decides the classification, and an event whose entity is declared with `tenancy` `none` has no `tenantid`. Only when an implementation meets an event with an undeclared entity at run time, which is not a conforming state, does it treat it as tenant-scoped, so that a mistake never drops `tenantid` from tenant-scoped data. An event about host-level data names an entity whose `tenancy` is `none`. `tenantid` is thus present on every event except those about data that is not tenant-scoped, and a conformance check covers both cases (section 8).

## 4. Data

- `data` is a JSON object described by the `dataSchema` of the manifest event. An event without a `dataSchema` is not conformant in 0.1 if it carries data other than an empty object
- `data` SHOULD carry the facts a consumer needs, not a copy of the whole entity. This is a rule for event payloads, separate from the change-set redaction in the [audit log](audit.md). It MUST NOT contain a property that the audit log redacts: any property whose name ends with `password`, `secret`, `token`, `apikey` or `privatekey` (compared without case), and any property the entity lists in `sensitiveProperties` in the manifest. An implementation MAY exclude more
- property names are `camelCase`, timestamps are RFC 3339 in UTC, and identifiers are strings, as in the [API conventions](api-conventions.md)

`data` can contain personal data, such as the email address in the example below. It is subject to the same tenant isolation as any tenant-scoped data, and the deployment decides which fields are published.

Example:

```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-0000-4000-8000-000000000001",
  "source": "urn:eolent:module:identity",
  "type": "identity.user.created",
  "time": "2026-11-19T09:30:12Z",
  "datacontenttype": "application/json",
  "subject": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  "tenantid": "6b1f0f7e-3b0e-4b8c-8f6f-1a2d6f7c9e10",
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "actortype": "user",
  "actorid": "2c4e6a80-1f3b-4d5c-8e7a-9b0c1d2e3f40",
  "data": { "email": "jana@example.com", "displayName": "Jana Novakova" }
}
```

## 5. Delivery

- **Atomic with the change.** An event caused by a change is recorded in the same unit of work as the change (a transactional outbox or an equivalent): either both are committed or neither is. A change that is rolled back publishes nothing, and a committed change that declares the event always publishes it
- **At least once.** An event can be delivered more than once. Consumers MUST be idempotent and can detect a repeat by `source` and `id`
- **No ordering guarantee.** 0.1 gives no ordering across events. Consumers that need an order use `time` and `subject` and tolerate gaps
- **Tenant context.** A consumer that handles an event with `tenantid` MUST set the tenant context to that tenant before touching tenant-scoped data, and, as the [tenancy contract](tenancy.md) requires, has no ambient tenant otherwise. An event handler that needs a tenant and receives an event without `tenantid` fails and does not guess one
- **Isolation.** An event with a `tenantid` MUST NOT be delivered to a subscriber configured for another tenant, including webhook subscriptions or tenant-specific queues

## 6. Encoding

Events are exchanged as CloudEvents in the JSON structured mode: media type `application/cloudevents+json`, with the attributes above as top-level members and `data` as a JSON object. Transports MAY use the CloudEvents binary mode where they define one (for example the HTTP binding), with the same attributes. How events reach consumers (in-process, a broker, webhooks) is not part of this profile.

## 7. AsyncAPI

The manifest remains the source of truth for what a module publishes and subscribes to. A module MAY also publish an [AsyncAPI](https://www.asyncapi.com/docs/reference/specification/v3.0.0) 3.0 document generated from its manifest, with one message per event, for tools that read AsyncAPI. It is informational in 0.1: the conformance suite does not check it, and where it differs from the manifest the manifest wins.

## 8. Conformance

The conformance suite will observe published events through a means the implementation provides for conformance runs. That mechanism is not defined yet; it is defined with the conformance runner (planned), and until then these checks cannot be run. Once it exists, the suite checks that:

- every observed event has the required attributes, `specversion` `1.0`, a `source` that matches its module, a `type` that the manifest declares as published, and `data` valid against the declared `dataSchema`
- after de-duplicating by `source` and `id`, a change that declares an event produces exactly one such event, with the `tenantid`, `actortype`, `actorid` (for `user` and `agent` actors) and `traceparent` of the request, and, when a request caused the event, the `traceparent` trace id equals that of the request's own `traceparent` header
- an agent acting for a user produces events with `actortype` `agent` and `onbehalfof` set to the user
- a change that is rolled back publishes no event
- events about tenant-scoped data carry `tenantid`, events about data that is not tenant-scoped have none, and an event for tenant A is never delivered to a subscriber of tenant B
- a redelivered event keeps the same `id`
- the published event types are exactly those the manifest declares, and every `entity` named by a manifest event is declared in that module's `entities` (the validation of the manifests in this repository checks the same)
