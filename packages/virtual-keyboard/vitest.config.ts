import { defineConfig } from 'vitest/config';

import rootConfig from '../../vitest.config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],

    coverage: {
      ...rootConfig.test?.coverage,
    },
  },
});
