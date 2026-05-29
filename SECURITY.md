# Security Policy

Thank you for helping keep Noem and its users safe. This policy applies to all packages published from the [`noem-inc/noem`](https://github.com/noem-inc/noem) monorepo under the MIT license.

## Scope

### In scope

This policy covers the latest published version of **every npm package published from this repository under the `@noem/*` scope** (see the [Packages table in the README](README.md#packages) for the current list), along with the source code and release tooling in this repository that produces those packages — including `.github/workflows/` and any platform-specific N-API sidecars published alongside a primary package.

### Out of scope

The following are **not** covered by this policy. Please use a normal public issue or PR, or report directly to the responsible vendor:

- Example, demo, or fixture code that is not published to npm.
- `devDependencies` and build-only tooling that does not ship in published tarballs.
- Archived branches and tags that are no longer the latest release of their package.
- Any package or release explicitly marked `deprecated` on npm.
- Vulnerabilities in third-party services (npm registry, GitHub, etc.) — report to the respective vendor.
- Findings that require physical access to a user's machine, root/administrator privileges already on the host, or social engineering of a maintainer.

## Supported Versions

Noem packages follow [Semantic Versioning](https://semver.org/). Security fixes are issued only against the **latest published version** of each package. Older releases are not backported; users are expected to upgrade.

If you depend on an older release and cannot upgrade, please open a public discussion before reporting — we may be able to advise on a mitigation, but cannot guarantee a backport.

## Reporting a Vulnerability

**Please do not open public GitHub issues, discussions, or pull requests for security vulnerabilities.**

Report privately through GitHub Security Advisories:

> **Report a vulnerability:** <https://github.com/noem-inc/noem/security/advisories/new>

You can also reach the form from the repository UI:

1. Open the **Security** tab at the top of the repository.
2. Select **Advisories** in the left sidebar.
3. Click the **Report a vulnerability** button.

### Backup contact

If GitHub Security Advisories is unavailable, email **security@noem.io**. This mailbox is monitored by the maintainers and reports are treated as confidential.

### What to include

To help us triage quickly, please include:

- The affected package(s) and version(s).
- A description of the issue and its impact.
- Reproduction steps, a proof of concept, or a failing test if possible.
- Any known mitigations or workarounds.
- Whether the issue is already public or shared with other parties.

## Coordinated Disclosure & Response SLA

We follow coordinated disclosure. Once you report an issue, you can expect:

| Stage                                      | Target                                |
| ------------------------------------------ | ------------------------------------- |
| Acknowledgement of receipt                 | within **72 hours**                   |
| Initial triage and severity assessment     | within **7 calendar days**            |
| Fix, mitigation, or detailed status update | within **90 calendar days** of triage |
| Public advisory / CVE published            | coordinated with the reporter         |

If we cannot meet a milestone we will tell you why and propose a new date. For critical issues with active exploitation, we will prioritize a same-week mitigation over the 90-day target.

We use the [GitHub Security Advisories](https://github.com/noem-inc/noem/security/advisories) workflow to request CVE identifiers and to publish advisories once a fixed release is available.

## Credit & Recognition

Unless you ask us not to, we will credit you by name and (optionally) a link of your choice in the published advisory and release notes. We do not currently operate a paid bug bounty program.

## Supply Chain Security

This project enforces strict supply-chain security standards to prevent malicious package injections:

- **Zero long-lived tokens.** Releases authenticate to npm via **Trusted Publishing** with OpenID Connect (OIDC). No long-lived npm tokens or passwords are stored in CI.
- **Mandatory 2FA.** Every npm package published from this repo requires _"Require two-factor authentication and disallow tokens"_ for all maintainer accounts.
- **Cryptographic build provenance.** All releases are signed and bound to the exact GitHub Actions run that produced them (see [`publishConfig.provenance`](https://docs.npmjs.com/generating-provenance-statements) in each package).
- **Automated code scanning.** Every push and pull request is scanned by [CodeQL](.github/workflows/codeql.yml).
- **Supply-chain posture monitoring.** The repository is continuously evaluated by the [OpenSSF Scorecard](.github/workflows/openssf.yml), which also gates pull requests via [Dependency Review](https://github.com/actions/dependency-review-action) with `fail-on-severity: high`.
