#!/usr/bin/env node

/**
 * Sync napi-rs per-platform subpackage versions to match their parent package.
 *
 * For each `packages-rust/<pkg>/` that has an `npm/<triple>/package.json`
 * (created by `napi create-npm-dirs`), rewrite every
 * `npm/<triple>/package.json`'s `version` to the parent's `version`.
 *
 * Runs as part of `pnpm run version` so the "Version Packages" PR raised by
 * Changesets shows the correct future state for every subpackage, not the
 * stale `0.0.0` placeholder.
 *
 * The parent's `optionalDependencies[<subpackage-name>]` use the `link:`
 * protocol so the lockfile resolves locally without registry lookups (the
 * sub-packages aren't published yet at install time). `napi pre-publish`
 * rewrites them to concrete versions on the publish runner, so we don't
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

const SYNCED_FIELDS = [
  'version',
  'description',
  'keywords',
  'author',
  'homepage',
  'license',
  'engines',
  'repository',
  'bugs',
  'publishConfig',
] as const satisfies ReadonlyArray<keyof PackageJson>;

// Direct `dst[key] = src[key]` where `key` is a union of literals collapses
// the LHS to the intersection of every field's value type (write position),
// which clashes with the union from the RHS. A generic preserves the link
// between both sides — TS sees `dst[K]` and `src[K]` as the same slot.
function copyField<K extends keyof PackageJson>(
  dst: PackageJson,
  src: PackageJson,
  key: K,
): void {
  dst[key] = src[key];
}

const repoRootDir = resolve(import.meta.dirname, '..');
const packagesRootDir = resolve(repoRootDir, 'packages-rust');

for (const entry of readdirSync(packagesRootDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = resolve(packagesRootDir, entry.name);
  const packageJsonPath = resolve(packageDir, 'package.json');
  const npmDir = resolve(packageDir, 'npm');

  // Skip packages that aren't napi-rs hybrids with per-platform sub-packages.
  if (!existsSync(packageJsonPath) || !existsSync(npmDir)) {
    continue;
  }

  const parentPkg = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageJson;

  console.log(
    `Syncing napi sub-packages for ${entry.name} → version=(${parentPkg.version})`,
  );

  for (const triple of readdirSync(npmDir, { withFileTypes: true })) {
    if (!triple.isDirectory()) {
      continue;
    }

    const subPkgPath = resolve(npmDir, triple.name, 'package.json');
    if (!existsSync(subPkgPath)) {
      continue;
    }

    const subPkg: PackageJson = JSON.parse(
      readFileSync(subPkgPath, 'utf-8'),
    ) as PackageJson;

    // Sync the correct properties
    for (const property of SYNCED_FIELDS) {
      copyField(subPkg, parentPkg, property);
    }

    // Preserve JSON style: 2-space indent + trailing newline. Matches the
    // output that `napi create-npm-dirs` produces.
    writeFileSync(
      subPkgPath,
      `${JSON.stringify(subPkg, undefined, 2)}\n`,
      'utf-8',
    );
  }
}
