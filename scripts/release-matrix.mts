#!/usr/bin/env node

/**
 * Emit the per-target build matrix for the Release workflow.
 *
 * Scans `packages-rust/*`. A package enters the matrix when either:
 *   1. Its `package.json` `version` was bumped in the HEAD commit (the
 *      usual Version-Packages-merge flow), OR
 *   2. One of its per-platform sub-packages on npm trails the parent
 *      version — i.e. a prior release run failed mid-flight and never
 *      called `napi pre-publish`. Recovering this state without (2)
 *      would require a fresh version bump every time.
 * Then expands its `napi.targets` into one matrix entry per target and
 * maps each target triple to the GitHub runner that can compile it
 * natively.
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

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type NapiConfig = {
  binaryName: string;
  targets: string[];
};

type PackageJson = {
  name: string;
  version: string;
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

/**
 * Latest version of `pkgName` published to npm, or `null` if the package
 * has never been published. `npm view` exits non-zero on E404; we treat
 * that as "needs publishing".
 */
function npmPublishedVersion(pkgName: string): string | null {
  try {
    return execFileSync('npm', ['view', pkgName, 'version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Strict greater-than for `X.Y.Z` versions (no prerelease/build metadata
 * — our internal crates don't use them). Returns false if either side
 * fails to parse, so we never falsely flag a package as ahead.
 */
function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  if (
    pa.length !== 3 ||
    pb.length !== 3 ||
    pa.some(Number.isNaN) ||
    pb.some(Number.isNaN)
  ) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Returns true if any of the `packages-rust/<pkg>/npm/<triple>/package.json`
 * sub-packages is on npm at a version older than the parent crate (or has
 * never been published). Used to detect a stranded release: parent main
 * pkg published, sub-pkgs never made it because the build matrix failed.
 *
 * Logs a warning for each stranded sub-pkg so the workflow log explains
 * why the matrix is non-empty without an in-commit version bump.
 */
function hasStrandedSubpackage(pkgDir: string, parent: PackageJson): boolean {
  const npmDir = resolve(rustRoot, pkgDir, 'npm');
  if (!existsSync(npmDir)) return false;

  let stranded = false;
  for (const sub of readdirSync(npmDir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const subPkgJsonPath = resolve(npmDir, sub.name, 'package.json');
    if (!existsSync(subPkgJsonPath)) continue;
    const subPkg = JSON.parse(readFileSync(subPkgJsonPath, 'utf-8')) as {
      name: string;
    };
    const subNpmVersion = npmPublishedVersion(subPkg.name);
    if (subNpmVersion === null || semverGt(parent.version, subNpmVersion)) {
      console.warn(
        `[release-matrix] ${subPkg.name}@${subNpmVersion ?? 'unpublished'} is behind ${parent.name}@${parent.version} — recovering stranded release.`,
      );
      stranded = true;
    }
  }
  return stranded;
}

function versionBumpedInHead(relPath: string): boolean {
  // Diff the file between the previous main tip (HEAD~1) and the new tip
  // (HEAD), looking for an added `"version":` line — that's what Changesets
  // emits when bumping. We can't use `git show HEAD` here: when the Version
  // Packages PR lands as a merge commit, `git show` defaults to the combined
  // (--cc) diff, which suppresses hunks that match either parent and so
  // prints nothing for the version bump. `git diff HEAD~1 HEAD` works
  // identically for merge, squash, and rebase merges. The Release workflow
  // sets `fetch-depth: 2` on the checkout so HEAD~1 resolves on CI.
  const diff = execFileSync(
    'git',
    ['diff', 'HEAD~1', 'HEAD', '--', `${relPath}/package.json`],
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

    // Two reasons to include a package in the build matrix:
    //   1. Its `package.json` version was bumped in HEAD (normal
    //      Version-Packages-merge flow).
    //   2. One of its per-platform sub-packages on npm lags the main
    //      package version — a prior release run failed mid-flight (e.g.
    //      Windows build crashed) and `napi pre-publish` never ran, so
    //      `@noem/<pkg>-<triple>` is stuck behind `@noem/<pkg>`. Without
    //      this branch, a subsequent push that doesn't bump the version
    //      would skip the build matrix and ship a headless main again.
    const bumpedInHead = versionBumpedInHead(`packages-rust/${entry.name}`);
    const stranded = !bumpedInHead && hasStrandedSubpackage(entry.name, pkg);

    if (!bumpedInHead && !stranded) {
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
