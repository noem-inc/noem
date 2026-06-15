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

// No space key: spaces are never valid in URLs.
const bottomRow = (layerSwitch: KeyboardRow[number]): KeyboardRow => [
  layerSwitch,
  '/',
  '.',
  { value: '.com', width: 1.5 },
  enterKey(),
];

/**
 * URL-optimized QWERTY: prominent `/`, `.` and `.com` keys, no space key.
 */
export const urlLayout: KeyboardLayout = {
  layers: {
    default: [...letterBlock(lowerLetterRows), bottomRow(toSymbolsKey())],
    shift: [...letterBlock(upperLetterRows), bottomRow(toSymbolsKey())],
    symbols: [...symbolRows(), bottomRow(toLettersKey())],
  },
};
