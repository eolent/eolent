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

## Checks before proposing a change

- Run `npm ci && npm run validate`. It checks that JSON files parse, that `spec/examples/*.json` validate against `spec/module.schema.json`, and that relative links in Markdown files resolve. The same check runs in CI on every pull request.
