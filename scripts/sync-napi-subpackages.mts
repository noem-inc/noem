#!/usr/bin/env node

/**
 * Sync napi-rs per-platform subpackage versions to match their parent package.
 *
 * For each `packages-rust/<pkg>/` that has an `npm/<triple>/package.json`
 * (created by `napi create-npm-dirs`), rewrite every
 * `npm/<triple>/package.json`'s `version` to the parent's `version`, and
 * ensure a `CHANGELOG.md` stub exists (required by `changesets/action` when
 * the subpackage dirs are part of the pnpm workspace).
 *
 * Runs as part of `pnpm run version` so the "Version Packages" PR raised by
 * Changesets shows the correct future state for every subpackage, not the
 * stale `0.0.0` placeholder.
 *
 * The parent's `optionalDependencies[<subpackage-name>]` use `workspace:*`
 * and are rewritten to concrete versions by pnpm at publish time, so we don't
 * touch them here.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PackageJson = {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  author: {
    name: string;
    url: string;
  };
  homepage: string;
  license: string;
  engines: {
    node: string;
  };
  repository: {
    type: string;
    url: string;
    directory: string;
  };
  bugs: {
    url: string;
  };
  publishConfig: {
    access: string;
    provenance?: boolean;
  };
};

const repoRootDir = resolve(import.meta.dirname, '..');
const packagesRootDir = resolve(repoRootDir, 'packages-rust');

for (const entry of readdirSync(packagesRootDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = resolve(packagesRootDir, entry.name);
  const packageJsonPath = resolve(packageDir, 'package.json');
  const npmDir = resolve(packageDir, 'npm');

  // Skip packages that aren't napi-rs hybrids with per-platform subpackages.
  if (!existsSync(packageJsonPath) || !existsSync(npmDir)) {
    continue;
  }

  const parentPkg = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageJson;

  console.log(
    `Syncing napi subpackages for ${entry.name} → version=(${parentPkg.version})`,
  );

  for (const triple of readdirSync(npmDir, { withFileTypes: true })) {
    if (!triple.isDirectory()) {
      continue;
    }

    const subPkgPath = resolve(npmDir, triple.name, 'package.json');
    if (!existsSync(subPkgPath)) {
      continue;
    }

    const subPkg = JSON.parse(readFileSync(subPkgPath, 'utf-8')) as PackageJson;

    // Sync the correct properties
    subPkg.version = parentPkg.version;
    subPkg.description = parentPkg.description;
    subPkg.keywords = parentPkg.keywords;
    subPkg.author = parentPkg.author;
    subPkg.homepage = parentPkg.homepage;
    subPkg.license = parentPkg.license;
    subPkg.engines = parentPkg.engines;
    subPkg.repository = parentPkg.repository;
    subPkg.bugs = parentPkg.bugs;
    subPkg.publishConfig = parentPkg.publishConfig;

    // Preserve JSON style: 2-space indent + trailing newline. Matches the
    // output that `napi create-npm-dirs` produces.
    writeFileSync(
      subPkgPath,
      `${JSON.stringify(subPkg, undefined, 2)}\n`,
      'utf-8',
    );

    // changesets/action reads CHANGELOG.md for every workspace package when
    // building the release PR body. Subpackages live under the workspace
    // glob `packages-rust/*/npm/*`, so a missing file ENOENTs the job even
    // though the subpackage is in the changeset `ignore` list.
    const changelogPath = resolve(npmDir, triple.name, 'CHANGELOG.md');
    if (!existsSync(changelogPath)) {
      writeFileSync(changelogPath, '# Changelog\n', 'utf-8');
    }
  }
}
