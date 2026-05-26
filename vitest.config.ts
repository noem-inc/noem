import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Set provider to 'v8' or 'istanbul'
      provider: 'v8',

      // Specify types of reports to generate
      reporter: ['text', 'json', 'html'],

      // Target specific source directories to include
      include: ['src/**/*.{ts,tsx}'],

      // Exclude test or configuration files from your report
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    },
  },
});
