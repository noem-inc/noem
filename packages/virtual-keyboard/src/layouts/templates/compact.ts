import type { KeyboardLayout, KeyboardRow } from '../types.js';

import {
  enterKey,
  letterBlock,
  lowerLetterRows,
  spaceKey,
  upperLetterRows,
} from './shared.js';

// Apostrophe and hyphen cover names like O'Brien and Smith-Jones.
const bottomRow = (): KeyboardRow => ["'", spaceKey(), '-', enterKey()];

/**
 * Letters-only QWERTY (no symbols layer): name and free-text entry.
 */
export const compactLayout: KeyboardLayout = {
  layers: {
    default: [...letterBlock(lowerLetterRows), bottomRow()],
    shift: [...letterBlock(upperLetterRows), bottomRow()],
  },
};
