import test from "node:test";
import assert from "node:assert/strict";
import { bracesBalanced, checkLocalization } from "./localization-checks.mjs";

const manifest = () => ({
  name: "billing-core",
  ui: { routes: [{ path: "/x", titleKey: "BillingCore.Invoices" }] },
  errors: [{ code: "BillingCore.Invoices.Locked", status: 409 }],
  localization: { defaultCulture: "en", resources: ["i18n/en.json", "i18n/cs.json"] }
});
const files = () =>
  new Map([
    ["i18n/en.json", { "BillingCore.Invoices": "Invoices", "BillingCore.Invoices.Locked.Title": "Locked" }],
    ["i18n/cs.json", { "BillingCore.Invoices": "Faktury" }]
  ]);
const run = (mutate) => {
  const m = manifest();
  const f = files();
  mutate(m, f);
  return checkLocalization(m, f);
};

test("a consistent set has no problems", () => assert.deepEqual(run(() => {}), []));
test("ICU braces and quoting", () => {
  assert.equal(bracesBalanced("Hello {name}"), true);
  assert.equal(bracesBalanced("{count, plural, one {# user} other {# users}}"), true);
  assert.equal(bracesBalanced("It''s '{literal}'"), true);
  assert.equal(bracesBalanced("Hello {name"), false);
  assert.equal(bracesBalanced("Hello name}"), false);
});
test("rejects bad keys, values and prefixes", () => {
  assert.match(run((m, f) => f.get("i18n/en.json")["other.key"] = "x").join("\n"), /not a dotted PascalCase/);
  assert.match(run((m, f) => f.get("i18n/en.json")["Other.Key"] = "x").join("\n"), /must start with "BillingCore\."/);
  assert.match(run((m, f) => f.get("i18n/en.json")["BillingCore.Nested"] = { a: "b" }).join("\n"), /must be a string/);
  assert.match(run((m, f) => f.get("i18n/en.json")["BillingCore.Bad"] = "Hello {name").join("\n"), /unbalanced braces or an unterminated quote/);
});
test("the default culture file must exist and name every manifest key", () => {
  assert.match(run((m) => (m.localization.defaultCulture = "de")).join("\n"), /has no file/);
  assert.match(run((m, f) => delete f.get("i18n/en.json")["BillingCore.Invoices"]).join("\n"), /lacks the key "BillingCore\.Invoices"/);
  assert.match(run((m, f) => delete f.get("i18n/en.json")["BillingCore.Invoices.Locked.Title"]).join("\n"), /Locked\.Title/);
});
test("title keys or errors without a localization block are reported", () => {
  assert.match(run((m) => delete m.localization).join("\n"), /no localization block/);
  assert.deepEqual(checkLocalization({ name: "x" }, new Map()), []);
});
test("a missing defaultCulture is reported", () => {
  assert.match(run((m) => delete m.localization.defaultCulture).join("\n"), /defaultCulture is missing/);
});
test("a missing file is reported", () => assert.match(run((m, f) => f.set("i18n/cs.json", undefined)).join("\n"), /missing or not valid JSON/));

test("reserved prefix and orphan keys in other cultures", () => {
  assert.match(run((m, f) => (f.get("i18n/en.json")["Eolent.Custom"] = "x")).join("\n"), /reserved prefix/);
  assert.match(run((m, f) => (f.get("i18n/cs.json")["BillingCore.Extra"] = "x")).join("\n"), /no counterpart/);
});
