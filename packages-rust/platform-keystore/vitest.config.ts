import { defineConfig } from 'vitest/config';

import rootConfig from '../../vitest.config';

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    coverage: {
      ...rootConfig.test?.coverage,
      enabled: false,
    },
  },
});
