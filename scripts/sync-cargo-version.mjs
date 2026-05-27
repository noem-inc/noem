#!/usr/bin/env node

// Sync each crate's Cargo.toml (and Cargo.lock) version to its package.json version.
//
// package.json is the source of truth — Changesets bumps it. This runs after
// `changeset version` so the "Version Packages" PR commits Cargo.toml + Cargo.lock
// already in sync. Pure string replacement: no Rust toolchain required.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const packagesDir = join(repoRoot, 'packages');

let changed = 0;

/** Replace the `version = "..."` line in the [package] section of a Cargo.toml. */
function setCargoTomlVersion(toml, version) {
  // Match within the [package] table only: from `[package]` up to the next `[` table header.
  return toml.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]*"/,
    `$1"${version}"`,
  );
}

/** Replace the version line of a specific crate's [[package]] block in a Cargo.lock. */
function setCargoLockVersion(lock, crateName, version) {
  const re = new RegExp(
    `(\\[\\[package\\]\\]\\nname = "${crateName}"\\nversion = )"[^"]*"`,
  );
  return lock.replace(re, `$1"${version}"`);
}

function write(path, before, after, label) {
  if (before === after) return;
  writeFileSync(path, after);
  console.log(`synced ${label}`);
  changed++;
}

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);
  const pkgPath = join(dir, 'package.json');
  const cargoTomlPath = join(dir, 'Cargo.toml');
  if (!existsSync(pkgPath) || !existsSync(cargoTomlPath)) continue;

  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!version) {
    console.warn(`skip ${entry.name}: package.json has no version`);
    continue;
  }

  const toml = readFileSync(cargoTomlPath, 'utf8');
  const crateName = toml.match(
    /\[package\][\s\S]*?\nname\s*=\s*"([^"]+)"/,
  )?.[1];
  write(
    cargoTomlPath,
    toml,
    setCargoTomlVersion(toml, version),
    `${entry.name}/Cargo.toml -> ${version}`,
  );

  const cargoLockPath = join(dir, 'Cargo.lock');
  if (crateName && existsSync(cargoLockPath)) {
    const lock = readFileSync(cargoLockPath, 'utf8');
    write(
      cargoLockPath,
      lock,
      setCargoLockVersion(lock, crateName, version),
      `${entry.name}/Cargo.lock -> ${version}`,
    );
  }
}

console.log(
  changed ? `done (${changed} file(s) updated)` : 'done (already in sync)',
);
