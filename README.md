# noem

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![Security: Trusted Publisher](https://img.shields.io/badge/security-trusted--publisher-green?logo=github)](https://www.npmjs.com/org/noem)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/noem-inc/noem/badge)](https://securityscorecards.dev/viewer/?uri=github.com/noem-inc/noem)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Monorepo of TypeScript packages published to npm under the `@noem` scope.

Built with [pnpm](https://pnpm.io/) workspaces, [Turborepo](https://turborepo.dev/),
[Changesets](https://github.com/changesets/changesets) for versioning/publishing, and
[Biome](https://biomejs.dev/) for linting and formatting.

## Packages

| Package                                                                | Description                                                                  | Version                                                                                                                           | Build                                                                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@noem/encryption`](packages/encryption/README.md)                    | Isomorphic field-level encryption (WebCrypto AES-256-GCM) with key rotation. | [![npm version](https://img.shields.io/npm/v/@noem/encryption.svg)](https://www.npmjs.com/package/@noem/encryption)               | [![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml) |
| [`@noem/luhn`](packages/luhn/README.md)                                | Luhn algorithm validation for card / SIN numbers.                            | [![npm version](https://img.shields.io/npm/v/@noem/luhn.svg)](https://www.npmjs.com/package/@noem/luhn)                           | [![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml) |
| [`@noem/platform-keystore`](packages-rust/platform-keystore/README.md) | TPM-backed hardware key storage — seal/unseal via the Windows NCrypt KSP.    | [![npm version](https://img.shields.io/npm/v/@noem/platform-keystore.svg)](https://www.npmjs.com/package/@noem/platform-keystore) | [![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml) |

New packages live under `packages/*`; (see `pnpm-workspace.yaml`).

## Requirements

- Node `24` (see `.nvmrc` — run `nvm use`)
- pnpm `11.3.0` (declared in `packageManager`)
- rust `1.95.0` (declared in rust-toolchain.toml) (only for native packages)

## Building Rust Packages

### Prerequisites:

- **Rust `1.95.0`** — pinned in `rust-toolchain.toml`; install via
  [rustup](https://rustup.rs/), which reads the pin and the declared
  `targets` automatically (no manual `rustup target add` needed).
- **Windows: Visual Studio Build Tools with the "Desktop development with C++"
  workload.** This provides the MSVC linker `link.exe`. VS Code alone is **not**
  sufficient. Install via winget, then open a **fresh terminal** so `PATH`/env
  pick up the new tools:
  ```powershell
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```
- **Windows:** Install llvm-cov:
  ```powershell
  cargo install cargo-llvm-cov
  ```

> A build error like ``error: linker `link.exe` not found`` (often cascading
> across `serde_json`, `napi`, `proc-macro2`, …) means the C++ workload above is
> missing.

## Setup

```bash
pnpm install
```

## Common tasks

All tasks run through Turborepo from the repo root.

```bash
pnpm build       # build all packages
pnpm test        # run all tests (vitest)
pnpm lint        # check with Biome
pnpm lint:fix    # apply Biome fixes
pnpm dev         # watch mode across packages
```

Target a single package with a filter:

```bash
pnpm build --filter=@noem/luhn
pnpm test --filter=@noem/luhn
```

## Releasing a new version

Publishing is automated via Changesets + GitHub Actions
(`.github/workflows/release.yml`). Packages publish to npm using
[OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) — no npm token
is stored in the repo.

### 1. Add a changeset

For every change that should ship, add a changeset describing it:

```bash
pnpm changeset
```

Pick the affected package(s), choose the bump (`patch` / `minor` / `major`), and write
a summary. This creates a markdown file under `.changeset/`. Commit it with your change.

> The PR workflow (`.github/workflows/pr.yml`) gates PRs with
> `changeset status --since=origin/<base>` and fails when no changeset is present, so a
> change can't merge unversioned. The gate is skipped for the auto-generated
> "Version Packages" PR (which has no changesets by design).

### 2. Open a PR to `main`

Push your branch and open a PR. Merge it once approved. The changeset file rides along.

### 3. Merge the "Version Packages" PR

On every push to `main`, the Release workflow runs the Changesets action:

- If unreleased changesets exist, it opens/updates a **"Version Packages"** PR that
  bumps versions and updates each package's `CHANGELOG.md`.
- Review and merge that PR.

### 4. Automatic publish

Merging the "Version Packages" PR triggers the workflow again. With no pending
changesets left, it runs `pnpm run release` (`turbo run build --filter=./packages/* &&
changeset publish`), building the packages and publishing the bumped versions to npm.

> Publishing requires the package to be configured as a trusted publisher on npm for
> this repo/workflow. The workflow needs `id-token: write` (already set) and uses
> `npm@latest` because OIDC trusted publishing needs npm >= 11.5.1.

### Summary

```
add changeset → merge PR to main → merge "Version Packages" PR → npm publish (auto)
```

## Bootstrapping a new package (one-time)

OIDC trusted publishing can't create a package that doesn't exist yet — npm only lets
you configure a trusted publisher on a package that's already on the registry. So the
**first** publish of a new `@noem/*` package is a one-time manual step; every release
after that is automated (see above).

From the new package's directory (`packages/<name>`), signed in to an npm account in
the `@noem` org with 2FA enabled:

```bash
# 1. trusted-publisher config + --allow-publish need npm >= 11.15
npm install -g npm@latest

# 2. build so dist/ exists (the published tarball ships dist + src per "files")
pnpm build --filter=@noem/<name>

# 3. publish the initial 0.0.0 to create the package on the registry.
#    leave the version at 0.0.0 — your changeset bumps it to 0.0.1 in CI.
npm publish

# 4. register this repo's release workflow as a trusted publisher
npm trust github @noem/<name> --file release.yml --repo noem-inc/noem --allow-publish

# 5. confirm it stuck (prompts for an OTP)
npm trust list @noem/<name>
```

After this, the normal flow takes over: the pending changeset bumps `0.0.0 → 0.0.1`
and CI publishes it via OIDC — with provenance, no token.

> Gotchas: **don't** pass `--dry-run` on step 4 (it validates but persists nothing),
> and **don't** pass `--env` — `release.yml` declares no GitHub Actions environment, so
> pinning an environment claim the workflow never sends will make CI publishes fail.
> The manual `0.0.0` is the only version without a provenance attestation.

## Conventions

- ESM/CJS packages.
- Build output goes to `dist/` via `tsup`.
- Formatting: 2-space indent, single quotes, trailing commas, semicolons (Biome).
