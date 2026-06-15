import type { KeyboardLayout } from '../types.js';

import { backspaceKey, enterKey } from './shared.js';

/**
 * Date entry pad: digits plus `/` and `-` separators.
 */
export const dateLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['/', '0', '-'],
      [backspaceKey(1), enterKey(1)],
    ],
  },
};
