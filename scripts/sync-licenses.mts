#!/usr/bin/env node

/**
 * Copy the license files to each sub-package which will be published.
 * Grab by package.json to know location
 */

import { copyFileSync, globSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const repoRootDir = resolve(import.meta.dirname, '..');

const targetDirectories = globSync(
  resolve(repoRootDir, '**', '*', 'package.json'),
)
  .filter((packageJsonPath) => {
    if (/node_modules/i.test(packageJsonPath)) {
      return false;
    }

    return true;
  })
  .map((packageJsonPath) => dirname(packageJsonPath));

const licenseFileNames = globSync(resolve(repoRootDir, 'LICENSE*')).map(
  (path) => basename(path),
);

if (licenseFileNames.length === 0) {
  throw new Error('No LICENSE* files found at repo root');
}

for (const targetDirectory of targetDirectories) {
  for (const licenseFileName of licenseFileNames) {
    const licenseFilePath = resolve(repoRootDir, licenseFileName);
    const outputLicenseFilePath = resolve(targetDirectory, licenseFileName);
    const relativePathForLog = relative(repoRootDir, targetDirectory);

    console.info(
      `Copying License file. license=(${licenseFileName}) target=(${relativePathForLog})`,
    );

    copyFileSync(licenseFilePath, outputLicenseFilePath);
  }
}
