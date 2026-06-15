import type { KeyboardLayout } from '../types.js';

import { backspaceKey, clearKey, enterKey } from './shared.js';

/**
 * PIN entry pad: digits only plus clear and backspace.
 *
 * The `C` key has `action: 'clear'`, so when a `target` is set the component
 * empties the field (and dispatches a native `input` event) on tap.
 */
export const pinLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [clearKey(1), '0', backspaceKey(1)],
      [enterKey(1)],
    ],
  },
};
