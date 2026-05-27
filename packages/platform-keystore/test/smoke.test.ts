import { expect, test } from 'vitest';

import { helloWorld } from '../dist/index.js';

test('helloWorld returns greeting from native addon', () => {
  expect(helloWorld()).toBe('hello world');
});
