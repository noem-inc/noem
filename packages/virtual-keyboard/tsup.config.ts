import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/noem-virtual-keyboard.ts'],
  format: ['esm'],
  // No splitting: keeps the customElements.define side effect inside the
  // predictable dist/noem-virtual-keyboard.js so package.json sideEffects
  // stays exact.
  splitting: false,
  treeshake: true,
  clean: true,
  dts: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
});
