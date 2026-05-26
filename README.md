# noem

Monorepo of TypeScript packages published to npm under the `@noem` scope.

Built with [pnpm](https://pnpm.io/) workspaces, [Turborepo](https://turborepo.dev/),
[Changesets](https://github.com/changesets/changesets) for versioning/publishing, and
[Biome](https://biomejs.dev/) for linting and formatting.

## Packages

| Package                       | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| [`@noem/luhn`](packages/luhn) | Luhn algorithm validation for card / SIN numbers. |

New packages live under `packages/*`; apps under `apps/*` (see `pnpm-workspace.yaml`).

## Requirements

- Node `24` (see `.nvmrc` — run `nvm use`)
- pnpm `11.3.0` (declared in `packageManager`)

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

> The CI workflow (`.github/workflows/ci.yml`) gates PRs with
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

## Conventions

- ESM-only packages (`"type": "module"`).
- Build output goes to `dist/` via `tsc` (`tsconfig.build.json`).
- Formatting: 2-space indent, single quotes, trailing commas, semicolons (Biome).
