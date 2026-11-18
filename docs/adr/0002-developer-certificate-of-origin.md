# ADR 0002: Developer Certificate of Origin for contributions

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Eolent is licensed under the Apache License 2.0 and accepts outside contributions. The project needs a lightweight way to know that contributors have the right to submit their work under that licence. Two common mechanisms are a Contributor License Agreement (CLA) and the Developer Certificate of Origin (DCO).

A CLA gives the project the ability to relicense contributions later, but it adds friction: contributors must sign a legal document, and some will decline. The DCO is a short statement, [developercertificate.org](https://developercertificate.org), that a contributor affirms by adding a `Signed-off-by` line to each commit.

## Decision

Use the DCO. Every commit in a pull request must carry a `Signed-off-by: Name <email>` trailer, added with `git commit -s`. A GitHub Actions check (`.github/workflows/dco.yml`) fails a pull request that contains a commit without one. Merge commits are exempt.

Contributions remain under the Apache License 2.0. There is no CLA and no copyright assignment.

## Consequences

- Contributing is easy: no document to sign, and the sign-off is a single flag.
- Contributions cannot later be relicensed by the project without asking contributors, which is consistent with the commitment to keep the core permissively licensed.
- Commits made by automation or AI coding agents on behalf of a person need that person's sign-off, so the person remains responsible for the contribution.
- Existing commits can be fixed with `git rebase --signoff`.
