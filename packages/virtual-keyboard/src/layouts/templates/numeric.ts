import type { KeyboardLayout } from '../types.js';

import { backspaceKey, enterKey } from './shared.js';

/**
 * Number pad with decimal point: amounts, quantities, measurements.
 */
export const numericLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['.', '0', backspaceKey(1)],
      [enterKey(1)],
    ],
  },
};
