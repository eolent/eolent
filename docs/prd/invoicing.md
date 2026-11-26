# PRD: Invoicing

- **Module:** `invoicing`
- **Status:** Draft
- **ERD:** [Invoicing](../erd/invoicing.md)
- **Date:** 2026-11-24
- **Depends on:** `parties` (a customer and a seller are companies there), per [ADR 0009](../adr/0009-cross-module-references.md).
- **Used by:** later modules that read issued invoices: tax reporting (VAT per period), cash planning and matching, payments. They use the module's Contracts, not its tables.
- **Source:** the clean-room description of the owner's current invoicing area (`area-inv.md` and the INV data dictionary of the strategy repository). This PRD states the behaviour to keep, the rules to fix, and the one-way migration; nothing here was taken from the old code.

## 1. Purpose

Issue sales invoices on behalf of one or several selling organisations of a tenant: customers, products and customer-specific prices, VAT per rate, a gap-free document number per series, a frozen record of what was issued, and a printable invoice. The old design (a bare counter as the document number, floating-point money, no keys, a confirmed invoice that the database still lets anyone change) is replaced by a module whose rules are enforced in the data and tested.

## 2. Users

| Who | What they do |
|---|---|
| Invoicing staff | Create draft invoices, add lines, confirm, print, duplicate |
| Product administrators | Keep tax rates, units, products, customer groups, price lists and prices |
| The tenant administrator | Registers the selling organisations, their bank accounts and number series, and decides who may do what |
| Other modules | Read issued invoices through the Contracts: totals, VAT per rate, parties as they were, the document number |
| Migration | Loads the old invoices and master data once, keyed by the old identifier |

## 3. Concepts

- **Seller.** A selling organisation of the tenant: a Parties company plus invoicing settings (default currency, accounting currency, default payment term, default print language) and **bank accounts**. A seller can issue invoices only when it has an active **number series**.
- **Number series.** What a document number comes from. A seller has a series for invoices; its **format** says how the number is written (for example `{yyyy}{counter:0000}`), and the counter **restarts every year** when the format has `{yyyy}`.
- **Customer.** A Parties company. Invoicing keeps its own facts about a customer in **customer settings**: the customer group and the e-mail the invoices are sent to.
- **Catalog.** Tax rates, units of measurement, products, customer groups, price lists (valid for a period, belonging to one group) and product prices (the price of **one unit**, in one currency or in any).
- **Invoice.** A header with the seller, the customer, the currency, three dates (issue, tax point, due), the payment term, the print language, a reverse-charge flag, a bank account and a conversion rate to the seller's accounting currency; **lines**; and, once confirmed, the totals, the **VAT rows** and a **snapshot** of the seller and the customer.
- **Draft and confirmed.** A draft can be changed. Confirming computes the totals, takes the document number, freezes the invoice and publishes an event. A confirmed invoice never changes.

## 4. Requirements

### Sellers and numbering

- **S1.** The tenant administrator registers a seller by choosing a Parties company. A seller has a default currency, an accounting currency, a default payment term in days and a default print language, and can be deactivated. A seller that is deactivated or has no active number series cannot be chosen for a new invoice.
- **S2.** A seller has any number of **bank accounts** (name, IBAN, SWIFT, account number); at most one is the default. An invoice names one of its seller's bank accounts or none.
- **N1.** A seller has at most one active invoice series, and never two series with the same format (the numbers of a format belong to one series). A series has a **format** and a **first counter**. The format must contain exactly one `{counter:0000}` (the zeros give the padding: four zeros pad to four digits) and may contain `{yyyy}` (the year of the issue date) and fixed text. With `{yyyy}` the counter restarts at the first counter every year.
- **N2.** The document number is taken when an invoice is confirmed, **inside the transaction that confirms it**: either the invoice is confirmed and the number is used, or neither happens. A failed confirmation leaves no gap. Two confirmations at once get different numbers. The counter is a row that the platform's sequence service updates inside that transaction (not a database sequence object, which would not roll back), so a rollback gives the number back. The order inside the transaction is fixed: the reads and checks, the number from the series, the invoice and its event data written, then the commit; the event of K2 is built after the number is taken (the platform guarantees that order).
- **N3.** A document number is unique per seller. Two invoices of one seller never share one, whatever created them.
- **N4.** An invoice that carries a document number from before the migration keeps it as text, exactly. It does not use the series and does not move its counter. Because the number is unique per seller (N3), the migration also **sets the first counter of the new series above the highest legacy number of the same format and year** (G2), and a migration check lists every legacy number that the series could produce again.

### Customers and the catalog

- **C1.** The customer of an invoice is an **active** company of Parties. A customer belongs to at most one **customer group** and has at most one invoicing e-mail (up to 320 characters).
- **C2.** The tenant keeps **customer groups** (a name, up to 255 characters). A group that has customers or price lists cannot be deleted; it can be deactivated.
- **T1.** The tenant keeps **tax rates**: a name, a rate in percent (0 to 100, up to two decimals), an optional validity period and a flag for the standard rate. A tax rate that a line uses is never deleted. VAT is grouped by the **rate**, so two tax rates with the same percent give one VAT row.
- **U1.** The tenant keeps **units of measurement** (a name). A unit that active products use cannot be deleted.
- **P1.** The tenant keeps **products** (a name, an optional SKU, a unit that is active). The SKU is unique within the tenant when given.
- **P2.** A **price list** has a name, belongs to one customer group, and has an optional valid-from and valid-to date (an open end is open); valid-from is not after valid-to. A price list with prices cannot be deleted.
- **P3.** A **product price** is the price of **one unit** of a product in a price list, not negative, in one currency or in any currency (an empty currency means any). There is at most one price per product, price list and currency.
- **P4.** **Price resolution.** When an invoice's customer has a group, and a price list of that group is valid on the invoice's tax point date (the issue date when there is none), and has a price for the product, the line's unit price is that price and **the client cannot override it**. Several qualifying prices: a price whose currency equals the invoice currency wins over a price for any currency; then the price list with the latest valid-from; then the price that was created last (by creation time, then by id). Without such a price, or without a customer group, the unit price is typed.
- **P5.** A query tells a client which price would apply to a product on an invoice, and from which price list, so that a screen can show it before the line is saved.

### Invoices

- **I1.** A user creates a **draft** with a seller, a customer, a currency, the issue date, the tax point date and the due date. Missing seller defaults (currency, payment term, print language) are filled from the seller. The conversion rate to the accounting currency is 1 when the currency is the accounting currency, and **required** and greater than zero otherwise. The totals and the document number are not set by the client.
- **I2.** A draft has **lines**. A line has a position, an optional product, a narration, a quantity (up to four decimals), a unit price, a tax rate and a **line total**. When a price applies (P4) or the line has a unit price, the line total is `quantity × unit price`, rounded to the decimals of the currency, **half away from zero**. A line may instead carry a typed total and no unit price (the way the old data has it).
- **I3.** A user **confirms** a draft. The invoice must have at least one line. Confirmation computes, in this order: the line totals; the **total of the lines**; the **VAT rows**, one per rate: the base is the sum of the line totals of that rate, the VAT is `base × rate / 100` rounded to the currency's decimals half away from zero (VAT is per rate group, never per line); the **grand total** = total of lines + the sum of the VAT rows. Then it converts to the accounting currency, row by row: `baseAccounting = round(base × rate)`, `vatAccounting = round(vat × rate)`, `totalAccounting = baseAccounting + vatAccounting`; and `totalLinesAccounting = Σ baseAccounting`, `grandTotalAccounting = Σ totalAccounting = totalLinesAccounting + Σ vatAccounting`, so the parts add up exactly.
- **I3a.** The reverse-charge flag (`isReverseCharge`) is a statement on the invoice: it changes **no arithmetic** in v1 (the VAT rows are computed as for any invoice, and a user who charges no VAT uses a tax rate of 0) and the printed invoice says that the customer accounts for the VAT. Whether reverse charge needs rules of its own (a fixed rate, a text per country) is an open question for the owner.
- **I4.** Confirming takes the document number (N2), stores a **snapshot** of the seller and the customer as they are at that moment (name, registration and tax numbers, address, e-mail, bank account), sets the status, and publishes `invoicing.invoice.confirmed`. The snapshot is the invoice's own data: a later change of the company in Parties does not change an issued invoice (ADR 0009, rule 4).
- **I5.** A confirmed invoice is **final**: any change to its header or lines, adding or removing a line, or confirming it again, is refused with a conflict. The status cannot be set by a client.
- **I6.** A user can **duplicate** any invoice into a new draft: the header (with today's dates and no number) and the lines are copied.
- **I7.** A user can **preview** the totals of a draft or a confirmed invoice without saving anything or taking a number. The preview uses exactly the rules of I3.
- **I8.** Dates are calendar dates (no time zone). The due date defaults to the issue date plus the payment term; the tax point date defaults to the last day of the previous month. A client may send other values.
- **I9.** A deactivated tax rate, product or unit cannot be chosen for a new line. An invoice draft whose customer is deactivated cannot be confirmed (K4 of the Parties PRD).
- **I10.** A user can read an invoice, with lines, VAT rows and, when confirmed, the snapshot; and list invoices filtered by seller, customer, status, issue date, tax point date and number, and found by document number.
- **I11.** The invoice is shown as a printable page (HTML that prints to PDF from the browser). The print uses the invoice's currency, its bank account, the snapshot of the parties and the print language; the document number is also the variable symbol.
- **I12.** A browser tab cannot send a bearer header, so a user who may read invoices can ask for a **print link** to the printable page (I11) of a confirmed invoice. The link is a URL on the API's own origin and a credential of its own, covered by the rules below.
- **I12a.** Asking for a print link needs the permission to read invoices and names a **confirmed** invoice of the caller's tenant; a draft, an invoice of another tenant and an unknown invoice have no print link (conflict, not found, not found).
- **I12b.** The link is valid for **one minute from the moment it is created** (the clock is the server's time at creation, not a date of the invoice), for **that one invoice and that tenant only**, and opens the page without any other credential. The secret part of the URL has at least 128 bits of randomness and is stored only as a hash.
- **I12c.** The link is **single-use**, and consuming it is **one atomic step**: of two requests for the same link that arrive together (a viewer's prefetch and the user's own load), exactly one gets the page and the other `410 Gone`. A later request (a reload) is `410` too, and so is a request that finds the link expired. There is no retry within the window; the user asks for a new link, which is cheap.
- **I12d.** The link never leaks: the full URL is **never written to a log or an audit entry** (only a prefix of the hash), and the page is served with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **I12e.** The page is served with a strict Content-Security-Policy that allows no script, no frames and no outside resources (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`: the three directives that do not fall back to `default-src` are named), so nothing in it can run code or reach the application's storage.

### Concurrency, repeats and permissions

- **X1.** Every change of a draft, every confirmation and every change of a catalog record requires the version the user last saw; a stale change is refused (`412`/`428`, as the API conventions define).
- **X2.** Creating a draft, a line, a seller or any catalog record, and confirming, can be repeated safely with an idempotency key. A repeated confirmation never takes a second number.
- **X3.** A user sees and changes only what their permissions allow, in their tenant (the platform's tenant isolation applies to every table). There is **no row-level restriction per seller** in v1: a user who may read invoices reads the invoices of every seller of the tenant.

### Contract offered to other modules (ADR 0009)

- **K1.** The module's Contracts offer, for confirmed invoices: **get by id**, **get many by ids**, **search** by document number, and **list by tax point date range** (what tax reporting needs). A result carries the document number, the seller and customer ids, the snapshot, the currency, the dates, the conversion rate, the total of lines, the VAT rows (rate, base, VAT, and the accounting amounts) and the grand total, in both currencies. Drafts are never returned.
- **K2.** The event `invoicing.invoice.confirmed` carries the id, the seller, the customer, the document number and the grand total with its currency; a consumer that needs more asks the lookup. The event is recorded **in the same transaction that confirms the invoice and takes its number** (N2): there is no moment in which the invoice is confirmed and the event is lost. The platform builds the event data after the number is taken and before the transaction commits.

### Migration

- **G1.** Every master record and every invoice carries a nullable **legacy identifier** (text, up to 100 characters, prefixed with the system), unique within the tenant per type. It is internal: never in the API and never in a lookup result.
- **G2.** The old data is loaded once by a migration run in this order: currencies are not loaded (the new module keys currencies by ISO code, the legacy duplicate "CZ" becomes CZK), then tax rates, units, customer groups, products, price lists and prices, sellers with bank accounts and series, customer settings, invoices with lines and VAT rows. A run can be repeated (upsert by legacy identifier) and reports every row it cannot load; it never guesses. It creates the seller's series last and with a first counter above the highest legacy number (N4).
- **G3.** A loaded confirmed invoice keeps its **stored totals and VAT rows exactly as the old system stored them**, rounded to two decimals; it is not recomputed. A migration check lists the invoices whose stored totals differ from the recomputation by the rules of I3 by more than one smallest unit.
- **G4.** A loaded invoice has no snapshot of its own: the migration freezes the **current** values of the seller and the customer into it, and marks the snapshot as taken at migration time.

## 5. Lifecycles

| Entity | States | Transitions |
|---|---|---|
| Invoice | draft, confirmed | draft → confirmed (once, final). A draft can be deleted (it has no number) |
| Seller, customer group, tax rate, unit, product, price list | active, deactivated | active ⇄ deactivated |
| Number series | active, retired | active → retired when a new series replaces it; a retired series keeps its counter and its numbers |

## 6. Permissions

All permissions follow the [permission contract](../../spec/permissions.md).

| Permission | Allows |
|---|---|
| `Invoicing.Invoices.Read` / `Create` / `Update` / `Delete` | read and list; create a draft and its lines; change a draft and its lines; delete a draft |
| `Invoicing.Invoices.Confirm` | confirm a draft (separate on purpose: it takes a number and freezes the invoice) |
| `Invoicing.Sellers.Manage` | register and change sellers, their bank accounts and series |
| `Invoicing.Catalog.Read` / `Manage` | read the catalog; change tax rates, units, products, groups, price lists, prices and customer settings |
| `Invoicing.Migration.Resolve` (scope `host`) | the migration-only lookup |

## 7. Events

`invoicing.invoice.created`, `.updated`, `.confirmed`, `.deleted` (a draft); `invoicing.seller.deactivated`, `.reactivated` (a seller's id is handed out in the result of an issued invoice, so ADR 0009 requires them; published). `invoicing.seller.created` and `.updated` are **planned, not yet published**. An event carries identifiers and what a consumer needs to keep a cache in step; `confirmed` carries the facts of K2. The exact data of each is fixed in the module's manifest.

## 8. Out of scope for v1

- **Credit notes and other corrections** of a confirmed invoice. The schema has a document type and a link to the invoice that is corrected, so they can be added without a migration; no operation creates them yet.
- Sending an invoice by e-mail, payment matching, reminders, recurring invoices, a PDF generator on the server.
- Exchange-rate tables: the conversion rate is typed on the invoice.
- Discounts, price quantities and price tiers; a line has a unit price or a typed total.
- Row-level restriction per seller.
- Fiscal receipts, e-invoicing formats (ISDOC, Peppol), advance payments.

## 9. Decisions of the design

1. **One rounding rule.** Half away from zero everywhere, on decimals. The old system rounded line totals this way and VAT and totals to even; the difference appears only at an exact midpoint and is at most one smallest unit. Old invoices keep their stored figures (G3).
2. **Money is decimal.** Amounts are decimals in the currency's decimals; quantities have four decimals; the conversion rate has up to six.
3. **Accounting totals add up.** The accounting grand total is the total of lines in the accounting currency plus the sum of the accounting VAT (the formula is in I3); the old system converted the grand total on its own and could differ by one smallest unit.
4. **The document number is a series, a year and a counter**, not a bare integer. Old numbers are kept as text (N4).
5. **Currencies are ISO codes**, not rows; the duplicate legacy currency disappears in the migration.
6. **Snapshots** of the parties are taken at confirmation (I4), not read live.
7. **No reopen.** A confirmed invoice is final; a correction will be a credit note (out of scope for v1).
8. **A confirmed invoice with no lines is refused**; the old system allowed it and consumed a number.

## 10. Open questions

None blocks the design. The build records the questions it could not settle in the strategy repository's open-questions list for the owner: the format of the real document numbers, the tenant boundary of the selling organisations, what reverse charge needs beyond the flag (I3a), and whether foreign-currency invoices are issued at all.

## 11. Enforced by

This section lists the checks that keep the code in line with this PRD. The module does not exist yet, so every check below is **planned, not running**; the section is updated as each one is built. A requirement that is not listed has **no check yet**.

| Requirement | Check |
|---|---|
| N1, N3, T1 (rate), P2, P3, S2 (one default account) | Constraints and unique indexes in the persistence layer, and a contract test on PostgreSQL and SQL Server |
| N2, N4 | The platform's sequence service (gap-free inside the unit of work); a concurrency contract test on both databases |
| I3, I7 and the rounding rule (design decision 1) | Domain tests with the worked examples of the old data dictionary, including the cases where the old rounding differed |
| I5, I2 (line changes), I6 | Domain and acceptance tests; a conformance test for the conflict on a confirmed invoice |
| P4, P5 | Domain tests of the price resolution with every tie-break |
| K2 (atomic with N2) | The platform's outbox with data built after numbering; a data contract test that a confirmed invoice and its event exist together, and that a failed confirmation leaves neither |
| I12, I12a to I12e | HTTP tests: a draft, another tenant's invoice and an unknown invoice have no link (a); a link opens the page, expires one minute after creation (a fake clock), belongs to one invoice and tenant (b); a second request is `410` and so is an expired one, and of two requests at once exactly one gets the page (c); the response carries `Referrer-Policy`, `Cache-Control` and the Content-Security-Policy, and a test of the log capture finds no full URL in the log, in the audit entry, nor in the output of the `410` path (d, e); the response carries `base-uri`, `form-action` and `frame-ancestors` too (e). The operation joins the module manifest with the others (generated by the module's tests) |
| I4, K1, K2 | Acceptance tests: the snapshot does not change when the Parties company changes; the lookup returns only confirmed invoices |
| X1, X2, X3 | The platform's conformance suite and the module's HTTP tests |
| G1 to G4 | The migration tests of the module and the migration check |
