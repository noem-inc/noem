import type { KeyboardLayout } from '../types.js';

import { backspaceKey, enterKey } from './shared.js';

/**
 * Hexadecimal pad (0-9, A-F) with `:` and `-` separators for MAC
 * addresses and serial numbers.
 */
export const hexLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3', 'A'],
      ['4', '5', '6', 'B'],
      ['7', '8', '9', 'C'],
      ['0', 'D', 'E', 'F'],
      [':', '-', backspaceKey(1), enterKey(1)],
    ],
  },
};
