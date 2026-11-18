# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this repository is

The language-neutral hub of Eolent: specification (`spec/`), conformance suite (`spec/conformance/`), documentation (`docs/`) and architecture decision records (`docs/adr/`). It contains no application code.

## Layout

- `spec/module.schema.json`: JSON Schema for the module manifest (draft).
- `spec/examples/`: example manifests. Every example must validate against the schema.
- `spec/conformance/`: description and layout of the black-box conformance tests.
- `docs/`: vision, architecture, AI-friendliness, multi-language approach, roadmap.
- `docs/adr/`: one file per decision, numbered `NNNN-title.md`.

## Rules

1. Keep the specification language-neutral. Do not add C#-, Node- or Java-specific concepts to `spec/`.
2. A change to the manifest schema needs an ADR or a changelog entry in `spec/README.md`, and every example must still validate.
3. Prefer small, focused pull requests.
4. Documentation is Markdown. Keep headings stable so links do not break.
5. Never commit secrets, credentials, tokens or personal data.
6. Use neutral, factual wording, and keep this repository to public project material only.

## Checks before proposing a change

- Validate JSON files parse, and that `spec/examples/*.json` validate against `spec/module.schema.json`.
- Check relative links in Markdown files still resolve.
