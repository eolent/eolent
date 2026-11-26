---
id: ADR-0010
rules:
  - id: ADR-0010-R1
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: A page that lists records and opens one registers both /things and /things/:id for the same component, and the name in a row is a real link, not a button. A list whose rows are edited in a dialog and have no detail page is the exception.
  - id: ADR-0010-R2
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: An action that deletes, erases, deactivates or removes a record asks the user to confirm before it sends the request, the question says what will happen, and erasing personal data asks for the record's name to be typed.
  - id: ADR-0010-R3
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: A form marks the fields that the API requires, and after a refused submit it moves focus to the first field with an error, where each such field has aria-invalid and aria-describedby pointing to its message, and the form-level error is shown at the top of the form.
  - id: ADR-0010-R4
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: Each page component registered as a route renders exactly one h1, the title of its main content, and sets the document title for the page. A shared component that is not a page renders no h1 of its own.
  - id: ADR-0010-R5
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: The filters of a list are kept in the query string of the address, so that a reload, a shared link and the Back button keep them, and a record opened from a list keeps the filters of that list.
  - id: ADR-0010-R6
    severity: warning
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: Dates, numbers and amounts shown to the user are formatted with Intl for the user's culture, never by hand with string concatenation or fixed patterns.
  - id: ADR-0010-R7
    severity: error
    appliesTo:
      - 'packages/**/*.tsx'
      - 'apps/**/*.tsx'
    text: Development aids such as the test-token picker and the API address box are rendered only behind a development-build check, so that a production build cannot show them.
---
# ADR 0010: Frontend interface conventions

- **Status:** Proposed (accepted when the pull request that adds it is merged)
- **Date:** 2026-11-26

## Context

On 2026-11-25 the sales invoicing screens of `eolent-react` were clicked through end to end and compared with how modern cloud products behave (the review is in the strategy repository, `briefs/sales-invoicing-ui-review-2026-11-25.md`). About 40 findings came out, and most of the react-only ones were built the same day. Several are not one-off defects but gaps that every module's screens will have again unless they are written down: a record that opens as local state and has no address (P0), a form that shows its errors off-screen, a destructive button without a question.

One of them was already turned into a rule of its own after the review: rule 9 of the `eolent-react` AGENTS.md, "every record has its own address". That file is read by ReviewBot in that repository only. The frontend kit is the base of other applications and, later, of other implementations of the kit, so the conventions belong in the hub next to the ADRs that bind the backend, where `standards/rules.yaml` is generated from them.

[ADR 0005](0005-technology-choices-and-dependency-policy.md) fixes the technology (Tailwind, components in the style of shadcn/ui, ICU messages behind the kit's `Translator`, forms that show the backend's errors). This ADR does not change it. It states the behaviour that screens built with it must have.

## Decision

**Scope.** These conventions are about screens, so the rules apply to the React component files (`.tsx`) in `packages/` and `apps/` of the frontend repositories, and not to the plain TypeScript there (the API client, the core's registry and auth code, formatting helpers, test fixtures). A rule about a screen is checked where the screen is written.

1. **Every record has its own address.** A page that lists records and opens one (a company, a person, an invoice, a seller) registers two routes for the same component, `/things` and `/things/:id`. The name in a row is a real link (an `<a href>`), so a record can be linked, opened in a new tab, reloaded into and left with Back. A record that opens only as local state is a defect, not a style choice. Master-data lists whose rows are edited in a dialog have no detail page and are the exception.
2. **A destructive action asks first.** Deleting, erasing, deactivating or removing a record asks the user to confirm before the request is sent, and the question says what happens (for example that a deactivated record can come back and an erased one cannot). Erasing personal data asks for the name of the record to be typed. The confirm button inside the dialog is the only red-filled control; the actions that open it use a quieter style. (How an undo would work instead of a question is not decided here; until it is, the confirmation is required and there is no exception.)
3. **A form helps the user find what is wrong.** The fields the API requires are marked. A form shows the errors the backend returns; client-side validation from a shared schema is a separate decision. After a refused submit, focus moves to the first field with an error, each such field has `aria-invalid` and `aria-describedby` pointing to its message, and the form-level error (with the support reference of the problem response) is at the top of the form, scrolled into view, not below the fold of a dialog.
4. **A page says what it is.** Each page, that is a component registered as a route, renders exactly one `h1`, the title of its main content, and sets the document title (`Invoices - Eolent`, not the same title everywhere); a shared component that is not a page renders no `h1` of its own. This way a screen reader, a browser tab and a history entry all name the page.
5. **List state is in the address.** The filters of a list live in the query string, so a reload, a link and Back keep them, and a record that opens keeps the filters of the list it came from. A "Clear filters" control resets them.
6. **Formatting follows the user's culture.** Dates, numbers and amounts are formatted with `Intl.DateTimeFormat`, `Intl.NumberFormat` or the kit's wrapper of them, for the culture the user chose, one way on every screen. Display text is not formatted by hand with string concatenation or fixed patterns such as `dd.mm.yyyy`.
7. **Development aids do not ship.** The test-token picker, the box that shows the API address and any other control that exists only to develop against a backend are rendered behind a development-build check, so a production build cannot show them. This is the one rule with severity `error`: a test-token picker in a production build is a security defect, not a style gap. `error` is only the most serious label a finding may carry; as AGENTS.md ("Standards rules") defines it, it does not block a merge, and ADR 0006 and ADR 0009 use it the same way.

**Left as prose.** The following came out of the same review and are decisions too, but a reviewer cannot tell them from a pull request's diff, so they have no rule id: the layout works from 375 px wide (the menu becomes a drawer, tables scroll inside their container, no page-wide sideways scroll); controls that belong to the page are not `position: fixed` over its content; toasts and form-level errors are announced through a live region; and each module's screens are tested at 375, 768 and 1280 px.

## Not decided here

- Client-side validation from a schema shared with the API (it needs validators in the OpenAPI description) and closed lists for country, currency and language (the backend owns what is valid).
- Interaction designs the review proposed and that need their own plan: an inline editable line grid, a side summary of totals, a global search and "Create" menu, saved list views, row menus and bulk actions, undo instead of confirmation, keyboard shortcuts beyond the command palette.
- Product questions that came out of the review: the default tax point date of an invoice, plain names for memberships and relationship names, which fields a new company needs.
- An accessibility check in CI (axe), which adds a development dependency and needs its row in ADR 0005.

## Consequences

- ReviewBot holds pull requests in `eolent-react` and in any other repository that adopts `standards-v2` to these seven rules and cites the rule id, as advice. The rules are written to be checked from a diff, which means they are narrower than the good practice they come from; a screen can break the practice and pass the rules.
- A new module's screens start with these conventions (addresses, confirmations, form errors, titles, filters, formatting, development aids) instead of getting them in a later rework, which is what most of the review's pull requests were.
- Rule 9 of the `eolent-react` AGENTS.md becomes a pointer to rule 1 here, so a rule and its reason live in one place. The repositories that pin `standards-v1` are not affected until they move to the new tag.
- Rule 2 adds a dialog to every destructive action; for a screen where this is too heavy (removing a line of a draft), an undo is the likely replacement, and it is a separate decision.
- A rule here that proves to be a judgement and not a check (a false finding in many reviews) is removed and its number left unused, as the other ADRs do.
