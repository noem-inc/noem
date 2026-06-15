import type { KeyboardLayout, KeyboardRow } from '../types.js';

import {
  enterKey,
  letterBlock,
  lowerLetterRows,
  symbolRows,
  toLettersKey,
  toSymbolsKey,
  upperLetterRows,
} from './shared.js';

// No space key: spaces are never valid in email addresses.
const bottomRow = (layerSwitch: KeyboardRow[number]): KeyboardRow => [
  layerSwitch,
  '@',
  '.',
  { value: '.com', width: 1.5 },
  enterKey(),
];

/**
 * Email-optimized QWERTY: prominent `@`, `.` and `.com` keys, no space
 * key.
 */
export const emailLayout: KeyboardLayout = {
  layers: {
    default: [...letterBlock(lowerLetterRows), bottomRow(toSymbolsKey())],
    shift: [...letterBlock(upperLetterRows), bottomRow(toSymbolsKey())],
    symbols: [...symbolRows(), bottomRow(toLettersKey())],
  },
};
