import type { KeyboardLayout, KeyboardRow } from '../types.js';

import {
  enterKey,
  letterBlock,
  lowerLetterRows,
  spaceKey,
  symbolRows,
  toLettersKey,
  toSymbolsKey,
  upperLetterRows,
} from './shared.js';

const bottomRow = (layerSwitch: KeyboardRow[number]): KeyboardRow => [
  layerSwitch,
  ',',
  spaceKey(),
  '.',
  enterKey(),
];

/**
 * Standard QWERTY keyboard with shift and symbols layers.
 */
export const normalKeyboardLayout: KeyboardLayout = {
  layers: {
    default: [...letterBlock(lowerLetterRows), bottomRow(toSymbolsKey())],
    shift: [...letterBlock(upperLetterRows), bottomRow(toSymbolsKey())],
    symbols: [...symbolRows(), bottomRow(toLettersKey())],
  },
};
