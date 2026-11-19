import test from "node:test";
import assert from "node:assert/strict";
import { checkManifest } from "./manifest-checks.mjs";

const base = () => ({
  name: "billing-core",
  permissions: [
    { name: "BillingCore.Invoices", scope: "host" },
    { name: "BillingCore.Invoices.Read", parent: "BillingCore.Invoices", scope: "host" }
  ],
  features: [{ name: "BillingCore.Pdf", valueType: "boolean" }],
  entities: [{ name: "Invoice" }],
  operations: [
    { operationId: "billingCoreInvoicesList", method: "GET", path: "/api/v1/invoices", permission: "BillingCore.Invoices.Read", entity: "Invoice" },
    { operationId: "billingCoreInvoicesDelete", method: "DELETE", path: "/api/v1/invoices/{invoiceId}", permission: "BillingCore.Invoices", feature: "BillingCore.Pdf", entity: "Invoice" }
  ],
  agentTools: [
    { operation: "billingCoreInvoicesList", risk: "low" },
    { operation: "billingCoreInvoicesDelete", risk: "high", requiresApproval: true }
  ],
  errors: [{ code: "BillingCore.Invoices.Locked", status: 409 }]
});

const problems = (mutate) => {
  const m = base();
  mutate(m);
  return checkManifest(m);
};

test("a consistent manifest has no problems", () => assert.deepEqual(checkManifest(base()), []));

test("rejects names without the module prefix", () => {
  assert.match(problems((m) => (m.permissions[0].name = "Other.Invoices"))[0], /must start with "BillingCore\."/);
  assert.match(problems((m) => (m.operations[0].operationId = "otherInvoicesList"))[0], /must start with "billingCore"/);
});

test("rejects the reserved Eolent namespace", () => {
  assert.match(problems((m) => (m.errors[0].code = "Eolent.Custom"))[0], /reserved namespace/);
  assert.match(problems((m) => (m.name = "eolent")).join("\n"), /reserved namespace/);
});

test("rejects undeclared references", () => {
  assert.match(problems((m) => (m.operations[0].permission = "BillingCore.Nope"))[0], /undeclared permission/);
  assert.match(problems((m) => (m.operations[0].entity = "Nope"))[0], /undeclared entity/);
  assert.match(problems((m) => (m.agentTools[0].operation = "nope"))[0], /undeclared operation/);
  assert.match(problems((m) => (m.permissions[1].parent = "BillingCore.Nope"))[0], /undeclared parent/);
});

test("rejects a non-boolean feature on an operation", () => {
  assert.match(problems((m) => (m.features[0].valueType = "integer"))[0], /not boolean/);
});

test("agent risk rules", () => {
  assert.match(problems((m) => (m.agentTools[1].risk = "low"))[0], /cannot have risk "low"/);
  assert.match(problems((m) => (m.agentTools[1].risk = "medium"))[0], /must have risk "high"/);
});

test("rejects duplicates", () => {
  assert.match(problems((m) => m.operations.push({ ...m.operations[0] }))[0], /duplicate operationId/);
});

test("operation tenancy must match its entity", () => {
  assert.match(problems((m) => (m.operations[0].tenancy = "none"))[0], /but its entity/);
  assert.match(problems((m) => (m.entities[0].tenancy = "none"))[0], /but its entity/);
});

test("cyclic permission parents are reported without hanging", () => {
  assert.match(problems((m) => (m.permissions[0].parent = "BillingCore.Invoices.Read")).join("\n"), /cyclic parent chain/);
});

test("module names with repeated hyphens do not throw", () => {
  assert.doesNotThrow(() => checkManifest({ ...base(), name: "billing--core-" }));
});

test("operationId prefix needs a segment boundary", () => {
  assert.match(problems((m) => (m.operations[0].operationId = "billingCorex"))[0], /followed by a capital letter/);
});

test("a multi-level permission chain and a hyphenated module pass", () => {
  const m = base();
  m.permissions.push({ name: "BillingCore.Invoices.Read.Export", parent: "BillingCore.Invoices.Read", scope: "host" });
  assert.deepEqual(checkManifest(m), []);
});
