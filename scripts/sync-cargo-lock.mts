#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Cargo.lock pins every workspace member by version. `sync-cargo-package.mts`
// bumps the Cargo.toml version but leaves the lockfile stale, so the first
// `cargo` invocation on `main` after the Version Packages PR merges rewrites
// the lock and leaves a dirty working tree. Mirror the bump into Cargo.lock
// here so the diff lands in the Version Packages PR itself.
//
// Workspace-member entries have no `source = ...` line (they aren't fetched
// from a registry), so a targeted regex edit is enough — no need to round-trip
// the whole file through a TOML serializer and risk reformatting churn.

const repoRootDir = resolve(import.meta.dirname, '..');
const packagesRootDir = resolve(repoRootDir, 'packages-rust');
const cargoLockPath = resolve(repoRootDir, 'Cargo.lock');

if (!existsSync(cargoLockPath)) {
  console.error('No Cargo.lock found, something went wrong');
  process.exit(1);
}

let lockContent = readFileSync(cargoLockPath, 'utf-8');

for (const entry of readdirSync(packagesRootDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = resolve(packagesRootDir, entry.name);
  const packageJsonPath = resolve(packageDir, 'package.json');
  const cargoTomlPath = resolve(packageDir, 'Cargo.toml');

  // This package is not rust/npm hybrid
  if (!existsSync(packageJsonPath) || !existsSync(cargoTomlPath)) {
    continue;
  }

  const { name, version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const crateName = name.replace('@', '').replace(/\//g, '-');

  const escapedName = crateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(\\[\\[package\\]\\]\\nname = "${escapedName}"\\nversion = ")([^"]+)(")`,
    'g',
  );

  let matched = false;
  let bumped = false;
  lockContent = lockContent.replace(pattern, (_, prefix, currentVersion, suffix) => {
    matched = true;
    if (currentVersion !== version) {
      bumped = true;
    }
    return `${prefix}${version}${suffix}`;
  });

  if (!matched) {
    console.log(`Cargo.lock: no entry for ${crateName} (skipped)`);
  } else if (bumped) {
    console.log(`Cargo.lock: bumped ${crateName} → ${version}`);
  } else {
    console.log(`Cargo.lock: ${crateName} already at ${version}`);
  }
}

writeFileSync(cargoLockPath, lockContent, 'utf-8');
