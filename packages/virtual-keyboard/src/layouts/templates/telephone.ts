import type { KeyboardLayout } from '../types.js';

/**
 * Telephone pad: digits 1-9, *, 0, # and backspace.
 */
export const telephoneLayout: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [
        '*',
        '0',
        '#',
        {
          label: '⌫',
          action: 'backspace',
          ariaLabel: 'Backspace',
        },
      ],
    ],
  },
};
