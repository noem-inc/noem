import type { KeyboardLayout } from '../types.js';

import { backspaceKey, enterKey } from './shared.js';

/**
 * PIN entry pad: digits only plus clear and backspace.
 *
 * The `C` key has `action: 'custom'` with `value: 'clear'` — the component
 * never touches the target for custom keys, so consumers clear the field
 * themselves in a `noemKeyPress` listener.
 */
export const pinLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [
        { label: 'C', value: 'clear', action: 'custom', ariaLabel: 'Clear' },
        '0',
        backspaceKey(1),
      ],
      [enterKey(1)],
    ],
  },
};
