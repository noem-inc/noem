import { defineConfig } from 'tsup';

import * as tsconfig from './tsconfig.json';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  treeshake: true,
  clean: true,
  dts: tsconfig.compilerOptions.declaration,
  sourcemap: tsconfig.compilerOptions.sourceMap,
  target: tsconfig.compilerOptions.target,
  outDir: tsconfig.compilerOptions.outDir,
});
