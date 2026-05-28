#!/usr/bin/env node

/**
 * Emit the per-target build matrix for the Release workflow.
 *
 * Scans `packages-rust/*`. For each package whose `package.json` `version`
 * field was bumped in the merge commit at HEAD, expands its `napi.targets`
 * into one matrix entry per target. Maps each target triple to the GitHub
 * runner that can compile it natively.
 *
 * Outputs (in $GITHUB_OUTPUT format):
 *
 *   matrix          = { "include": [{ pkg, pkgName, os, target, jsLoader }, ...] }
 *   changedPackages = ["platform-keystore", ...]
 *   nativeChanged   = "true" | "false"
 *
 * Run with no $GITHUB_OUTPUT (local invocation) to print the same data as
 * pretty JSON for debugging.
 */

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type NapiConfig = {
  binaryName: string;
  targets: string[];
};

type PackageJson = {
  name: string;
  napi?: NapiConfig;
};

type MatrixEntry = {
  /** Directory name under `packages-rust/` (e.g. "platform-keystore"). */
  pkg: string;
  /** npm name (e.g. "@noem/platform-keystore"). */
  pkgName: string;
  /** GitHub Actions runner image. */
  os: string;
  /** Rust target triple. */
  target: string;
  /**
   * True for one entry per package — that job additionally uploads the
   * shared JS loader / `.d.ts` (identical across targets).
   */
  jsLoader: boolean;
};

// Rust target triple suffix → GitHub Actions runner that can build it.
// Add entries here when introducing a new platform (e.g. Linux:
// `['unknown-linux-gnu', 'ubuntu-latest']`).
const TARGET_TO_RUNNER: ReadonlyArray<readonly [string, string]> = [
  ['apple-darwin', 'macos-latest'],
  ['pc-windows-msvc', 'windows-latest'],
];

function targetToRunner(target: string): string {
  for (const [suffix, runner] of TARGET_TO_RUNNER) {
    if (target.endsWith(suffix)) {
      return runner;
    }
  }
  throw new Error(
    `No runner mapping for target "${target}". Add it to TARGET_TO_RUNNER in scripts/release-matrix.mts.`,
  );
}

function versionBumpedInHead(relPath: string): boolean {
  // `git show HEAD --format='' -- <file>` prints just the diff of that file
  // in the current commit. We look for an added `"version":` line — that's
  // what Changesets emits when bumping.
  const diff = execSync(
    `git show HEAD --format= -- '${relPath}/package.json'`,
    {
      encoding: 'utf-8',
    },
  );
  return /^\+\s+"version":/m.test(diff);
}

const repoRoot = resolve(import.meta.dirname, '..');
const rustRoot = resolve(repoRoot, 'packages-rust');

const matrix: MatrixEntry[] = [];
const changed: string[] = [];

if (existsSync(rustRoot)) {
  for (const entry of readdirSync(rustRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const pkgJsonPath = resolve(rustRoot, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      continue;
    }

    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as PackageJson;
    const targets = pkg.napi?.targets ?? [];
    if (targets.length === 0) {
      continue;
    }

    if (!versionBumpedInHead(`packages-rust/${entry.name}`)) {
      continue;
    }

    changed.push(entry.name);

    for (const [index, target] of targets.entries()) {
      matrix.push({
        pkg: entry.name,
        pkgName: pkg.name,
        os: targetToRunner(target),
        target,
        jsLoader: index === 0,
      });
    }
  }
}

const matrixJson = JSON.stringify({ include: matrix });
const changedJson = JSON.stringify(changed);
const nativeChanged = changed.length > 0 ? 'true' : 'false';

const ghOutput = process.env.GITHUB_OUTPUT;
if (ghOutput) {
  appendFileSync(ghOutput, `matrix=${matrixJson}\n`, 'utf-8');
  appendFileSync(ghOutput, `changedPackages=${changedJson}\n`, 'utf-8');
  appendFileSync(ghOutput, `nativeChanged=${nativeChanged}\n`, 'utf-8');
} else {
  // Local debugging: pretty-print everything.
  console.log(
    JSON.stringify(
      {
        matrix: { include: matrix },
        changedPackages: changed,
        nativeChanged,
      },
      undefined,
      2,
    ),
  );
}
