#!/usr/bin/env node

/**
 * Copy the license files to each sub-package which will be published.
 * Grab by package.json to know location
 */

import { copyFileSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const repoRootDir = resolve(import.meta.dirname, '..');

const targetPackageJsonPaths = globSync(
  resolve(repoRootDir, '**', '*', 'package.json'),
).filter((packageJsonPath) => {
  if (/node_modules/i.test(packageJsonPath)) {
    return false;
  }

  return true;
});

const licenseFileNames = globSync(resolve(repoRootDir, 'LICENSE*')).map(
  (path) => basename(path),
);

if (licenseFileNames.length === 0) {
  throw new Error('No LICENSE* files found at repo root');
}

const licensesLogString = licenseFileNames.join(', ');

for (const targetPackageJsonPath of targetPackageJsonPaths) {
  const targetDirectory = dirname(targetPackageJsonPath);
  const relativePathForLog = relative(repoRootDir, targetDirectory);
  const packageJson = JSON.parse(readFileSync(targetPackageJsonPath, 'utf-8'));

  packageJson.files = Array.from(
    new Set([...(packageJson.files || []), ...licenseFileNames]),
  );

  console.log(
    `Writting license files to package.json files array. licenses=(${licensesLogString}) target=(${relativePathForLog})`,
  );
  writeFileSync(
    targetPackageJsonPath,
    `${JSON.stringify(packageJson, undefined, 2)}\n`,
  );

  for (const licenseFileName of licenseFileNames) {
    const licenseFilePath = resolve(repoRootDir, licenseFileName);
    const outputLicenseFilePath = resolve(targetDirectory, licenseFileName);

    console.info(
      `Copying License file. license=(${licenseFileName}) target=(${relativePathForLog})`,
    );
    copyFileSync(licenseFilePath, outputLicenseFilePath);
  }
}
