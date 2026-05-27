import { expect, test } from 'vitest';

import { getProviderStatus } from '../dist/index.js';

test('getProviderStatus reports an available backend', () => {
  const status = getProviderStatus();
  expect(status.available).toBe(true);
  expect(status.backend).not.toBe('none');
});
