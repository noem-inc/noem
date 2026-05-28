#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'smol-toml';

type CargoTomlConfig = {
  package: {
    name: string;
    version: string;
    description: string;
    license: string;
    keywords: string[];
  };
};

const repoRootDir = resolve(import.meta.dirname, '..');
const packagesRootDir = resolve(repoRootDir, 'packages-rust');

for (const entry of readdirSync(packagesRootDir, { withFileTypes: true })) {
  // This entry is not a directory thus is invalid
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

  // Grab the elements which will be synced
  const { name, version, description, license, keywords } = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  );

  const tomlName = name.replace('@', '').replace(/\//g, '-');

  console.log(
    `Syncing ${entry.name} - name=(${tomlName}) version=(${version}) license=(${license})`,
  );

  const tomlContent: CargoTomlConfig = parse(
    readFileSync(cargoTomlPath, 'utf-8'),
  ) as CargoTomlConfig;

  tomlContent.package.name = tomlName;
  tomlContent.package.version = version;
  tomlContent.package.description = description;
  tomlContent.package.license = license;
  tomlContent.package.keywords = keywords?.slice(0, 5) || [];

  // Format the file a little bit to keep it inline with vscode autoformatter
  const stringifiedContent = stringify(tomlContent)
    .replace(/\[ /g, '[')
    .replace(/ \]/g, ']');

  writeFileSync(cargoTomlPath, stringifiedContent, 'utf-8');
}
