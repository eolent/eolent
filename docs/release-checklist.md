# Release checklist

> **Status:** first version. The release process, publishing workflows, SBOM and signing are built later, and this checklist is refined then. Until the first release, it is a list of gates that must be checked by hand.

A release is a version tag of a repository (`eolent`, `eolent-dotnet`, `eolent-react`) and the packages published from it. The maintainer who prepares the release works through this list and records the result in the release notes. A step that does not apply is marked as such, not skipped silently.

## 1. Before anything is published

- [ ] **Trademark gate (first public package only).** The trademark clearance for the name is done, and the package names and organisation names are reserved. Nothing is published to NuGet or npm under the name before then.
- [ ] **Scope.** The release matches the milestone it claims. Anything outside it is marked as not included in the release notes.
- [ ] **The default branch is green.** All required checks pass on the commit that is tagged (`validate`, `DCO sign-off`, `Runner self-test`, `ReviewBot` (a GitHub app check, not a workflow in this repository), and the code repositories' own checks).

## 2. Licence re-check

[ADR 0005](adr/0005-technology-choices-and-dependency-policy.md) requires dependency licences to be checked when a dependency is added and re-checked before each release. The maintainer who prepares the release runs the re-check.

- [ ] Run the licence scan of the repository in CI and read its result. A repository that has run a scan job since its bootstrap must have that job green. Before bootstrap, or where the repository has no runtime dependencies, record that in the release notes and check each dependency's licence by hand. Every runtime dependency is permissive (Apache-2.0, MIT, BSD or similar, including the PostgreSQL licence) and allows redistribution in a commercial product, except the named exceptions that ADR 0005 records for optional, separate packages (today the two Microsoft-licensed binaries of the SQL Server package); say in the release notes which optional packages carry them.
- [ ] No dependency of a core package is copyleft, source-available or paid. Such a library is allowed only in an optional, separate package that users choose knowingly.
- [ ] Compare the dependency list with the table in ADR 0005. A new dependency is added to the table with its version, licence and exit option, in a pull request. A dependency whose licence changed since the last release is replaced or reviewed before the release.
- [ ] Record in the release notes: the date of the re-check, the repository commit, and the result (no change, or the changes made).
- [ ] The versions and licences in the ADR table are refreshed, since the table is a snapshot.

## 3. Specification and conformance

- [ ] The specification versions (manifest, API conventions, error format, tenancy, permissions, audit, events, localization) are the ones the release claims, and the changelog in `spec/README.md` has an entry for each change since the last release (for the first release, since the start of the changelog).
- [ ] The conformance suite passes against the release on every database the release claims to support. The result is attached to the release notes.
- [ ] The examples in `spec/examples/` validate, and `npm run validate` passes in `eolent`.
- [ ] No pull request that changes the specification is open and unmerged for this release.

## 4. Security and supply chain

- [ ] Known vulnerabilities of dependencies are checked, and none that affects the release is left open without a note.
- [ ] A software bill of materials is produced for each package. _(Built with the release process.)_
- [ ] Packages are signed. _(Built with the release process.)_

## 5. Packages and documentation

- [ ] The versions follow [ADR 0004](adr/0004-naming-and-versioning-conventions.md), and packages depend on each other with compatible version ranges.
- [ ] The release notes list what changed, what broke, and what must be done to upgrade.
- [ ] The documentation and `llms.txt` describe this release.

## 6. After the release

- [ ] The tag is pushed and the packages are published from the tagged commit.
- [ ] The release notes are published, and the roadmap is updated.
- [ ] Anything found during the release that could not be fixed is recorded as an issue.
