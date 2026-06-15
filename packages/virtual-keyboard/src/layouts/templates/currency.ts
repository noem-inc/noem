import type { KeyboardLayout } from '../types.js';

import { backspaceKey, enterKey } from './shared.js';

/**
 * Builds a currency/POS pad for the given currency symbol: digits,
 * double-zero, decimal point.
 */
export const createCurrencyLayout = (symbol = '$'): KeyboardLayout => ({
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['.', '0', '00'],
      [symbol, backspaceKey(1), enterKey(1)],
    ],
  },
});

/**
 * Currency/POS pad with `$`. Use `createCurrencyLayout('€')` (etc.) with
 * the `layout` property for other currencies.
 */
export const currencyLayout: KeyboardLayout = createCurrencyLayout();
