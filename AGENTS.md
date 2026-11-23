# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this repository is

The language-neutral hub of Eolent: specification (`spec/`), conformance suite (`spec/conformance/`), documentation (`docs/`) and architecture decision records (`docs/adr/`). It contains no application code.

## Layout

- `spec/module.schema.json`: JSON Schema for the module manifest (draft).
- `spec/examples/`: example manifests. Every example must validate against the schema.
- `spec/conformance/`: description and layout of the black-box conformance tests.
- `docs/`: vision, architecture, AI-friendliness, multi-language approach, roadmap.
- `.github/`: CI workflows (validation, DCO), issue and PR templates, CODEOWNERS.
- `docs/adr/`: one file per decision, numbered `NNNN-title.md`.
- `docs/erd/`: one entity-relationship design per module (the data it keeps and the rules the database enforces), following its PRD.
- `docs/prd/`: one product requirements document per module (what it must do, who uses it, what is out of scope, which checks enforce it).
- `scripts/validate.mjs`: the validation run by `npm run validate` and by CI (`.github/workflows/validate.yml`).

## Rules

1. Keep the specification language-neutral. Do not add C#-, Node- or Java-specific concepts to `spec/`.
2. A change to the manifest schema needs an ADR or a changelog entry in `spec/README.md`, and every example must still validate.
3. Prefer small, focused pull requests.
4. Documentation is Markdown. Keep headings stable so links do not break.
5. Sign off every commit (`git commit -s`); the DCO check in CI rejects unsigned commits. See [ADR 0002](docs/adr/0002-developer-certificate-of-origin.md).
6. Never commit secrets, credentials, tokens or personal data.
7. Use neutral, factual wording, and keep this repository to public project material only.

## Standards rules

Some decisions here bind the implementation repositories (`eolent-dotnet`, `eolent-react`). Those decisions carry a short list of checkable **rules** in the YAML frontmatter of the document they come from, next to their rationale, so a rule and its reason change in the same commit. [`standards/rules.yaml`](standards/rules.yaml) is generated from them, and ReviewBot reads it to review pull requests in the other repositories against these rules.

```yaml
---
id: ADR-0009
rules:
  - id: ADR-0009-R1
    severity: error # error or warning
    appliesTo: ['src/**/*.cs']
    text: A module must not read, join, write or reference another module's tables.
---
```

- The `appliesTo` globs are relative to the root of the implementation repository being reviewed, not to this one, and match the files that repository holds (for example `src/**/*.cs` in `eolent-dotnet`). Scope a rule to the files it is about: a module's layer projects, not every project. The module layer projects live at `src/<Module>/<Project>/`, one folder deeper than the kernel packages, which a rule about modules must not match.
- A rule must be checkable from a diff. "Keep things simple" is not a rule. Write one sentence of at least eight words, and one or more `appliesTo` globs for the files in the implementing repositories it applies to.
- `severity: error` means the most serious label a finding may carry. It does not block a merge: standards findings are advice from ReviewBot, not a gate.
- The document needs an `id`, and each rule id is `<document id>-R<number>`, for example `ADR-0009-R1`. The generator checks this.
- A superseded or deprecated document contributes no rules. The generator reads the status from the `status` key of the frontmatter when there is one, and otherwise from the ADR's own `- **Status:**` line, so marking an ADR superseded in its body is enough.
- Keep each rule's text as strong as the sentence it comes from, qualifiers and exceptions included. A rule that is stricter than its ADR makes ReviewBot report compliant code.
- After changing a rule, run `node scripts/generate-standards.mjs` and commit `standards/rules.yaml`. `npm run validate` fails when it is out of date.
- The rules file format is the one ReviewBot enforces. Its schema is vendored in `scripts/standards/` and must not be edited here: a change to the format is made in the ReviewBot repository first.
- Implementation repositories pin a **tag** of this repository in their `.reviewbot.yaml` (`standards-v1`, `standards-v2`, ...), so a new tag is a deliberate upgrade for them. Tag a release when the rules change in a way they should adopt.

## Checks before proposing a change

- Run `npm ci && npm run validate`. It checks that JSON files parse, that `standards/rules.yaml` is up to date with the rules in the documents, that `spec/examples/*.json` validate against `spec/module.schema.json`, and that relative links in Markdown files resolve. The same check runs in CI on every pull request.
