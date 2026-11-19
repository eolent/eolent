# ADR 0008: Agent posture

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The specification reserves what AI agents need: an agent principal and the `onBehalfOf` field in the [audit log](../../spec/audit.md), the intersection rule in the [permission contract](../../spec/permissions.md), and `agentTools` with a risk class and an approval flag in the [manifest](../../spec/module.schema.json) ([ADR 0007](0007-manifest-0-2.md)). Three questions were still open: what an agent without a user is, how untrusted text that reaches an agent is treated, and what the full tool contract is. The runtime (D23, D24) and the contract (H18) come later; the safety posture has to be fixed before they are designed, because the contract and the runtime must not be able to contradict it.

## Decision

Three rules hold for every agent in every implementation. They are the posture, and the later contract may only add to them.

1. **An agent acts for a user and never exceeds that user.** Every agent call has a user it acts for, recorded as `onBehalfOf` in the audit entry. The agent's effective permissions are the intersection of that user's effective permissions and the permissions explicitly granted to the agent, so an agent is never an administrator and never holds a permission that no one granted to it. An agent with no user is not defined: there are no autonomous or background agents until a later decision (H18, D24) defines them.
2. **Medium and high risk tools need approval for every call.** A tool whose `risk` is `medium` or `high` runs only after a person has approved that call. The manifest says so with `requiresApproval`, which must be `true` for both classes and is checked by the schema. A tenant administrator may relax the approval of a `medium` tool for the tenant, tool by tool; this is a setting that is defined with the contract (H18) and recorded in the audit log like any change. The approval of a `high` tool can never be relaxed, by anyone. A low risk tool runs without approval unless its manifest asks for it.
3. **Untrusted input is data, never authority.** Text that reaches an agent from outside the platform's own definitions, such as a tool result, a stored record, a document, an email or a web page, only ever informs the agent's answer. It never changes the permissions of the agent, never counts as approval, never changes the user the agent acts for, and never adds or removes tools. Approval comes only from an authenticated person, through a channel that an agent cannot call with its own token: the approval of a call is rejected when it arrives with the agent's own credentials. The descriptions of tools come from the manifest and are trusted; the content that a tool returns is not.

The audit entry of an approved call records who approved it and when, in the `approval` object of the [audit log](../../spec/audit.md).

## Not decided here

- Autonomous agents, such as a nightly report agent with no user, are left to H18 and D24. They would need a decision on identity, an accountable owner and approval for unattended runs.
- The full agent tool contract (how tools are listed and called, the format of tool results and approvals, usage metering, the tenant setting that relaxes medium risk approval) is written in H18, with its conformance category, and implemented in D23 and D24.

## Consequences

- The first release can carry agents safely and without a new principal kind, and the fields reserved in the audit log and the manifest are used as designed.
- Every medium risk write by an agent costs a person's approval until an administrator relaxes it. This is intentional and is the price of keeping a prompt injection from changing data silently. Background automation has to wait for the later decision. A deployment's own service account that calls the ordinary API is not an agent: it is governed by the permissions of that account like any API client, and it is outside this posture.
- The manifest schema now requires `requiresApproval` to be `true` for `medium` and `high`. An implementation cannot lower the baseline that a module declares.
- Conformance for agent actions (H18) tests these three rules.
