import type { KeyboardKey, KeyboardRow } from '../types.js';

/**
 * Default shift-key label (shift off).
 */
export const SHIFT_LABEL = '⇧';
/**
 * Shift-key label while single-shot shift is engaged.
 */
export const SHIFT_SINGLE_LABEL = '⇪';
/**
 * Shift-key label while caps lock is engaged.
 */
export const SHIFT_LOCKED_LABEL = '⬆';

/**
 * Enter-key label when pressing it advances to the next form field
 * instead of submitting.
 */
export const ENTER_NEXT_LABEL = '→';

/**
 * QWERTY letter rows (lowercase) without action keys.
 */
export const lowerLetterRows: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export const upperLetterRows: string[][] = lowerLetterRows.map((row) =>
  row.map((letter) => letter.toUpperCase()),
);

export const shiftKey = (width = 1.5): KeyboardKey => ({
  label: SHIFT_LABEL,
  action: 'shift',
  width,
  ariaLabel: 'Shift',
});

export const backspaceKey = (width = 1.5): KeyboardKey => ({
  label: '⌫',
  action: 'backspace',
  width,
  ariaLabel: 'Backspace',
});

export const enterKey = (width = 1.5): KeyboardKey => ({
  value: '\n',
  label: '⏎',
  action: 'enter',
  width,
  ariaLabel: 'Enter',
});

export const spaceKey = (width = 5): KeyboardKey => ({
  value: ' ',
  label: '',
  action: 'space',
  width,
  ariaLabel: 'Space',
});

export const layerKey = (
  label: string,
  layer: string,
  ariaLabel: string,
  width = 1.5,
): KeyboardKey => ({ label, action: 'layer', layer, width, ariaLabel });

export const toSymbolsKey = (): KeyboardKey =>
  layerKey('?123', 'symbols', 'Symbols');

export const toLettersKey = (): KeyboardKey =>
  layerKey('ABC', 'default', 'Letters');

/**
 * The three QWERTY letter rows: two plain rows plus the shift/backspace
 * row.
 */
export const letterBlock = (rows: string[][]): KeyboardRow[] => [
  rows[0],
  rows[1],
  [shiftKey(), ...rows[2], backspaceKey()],
];

/**
 * The three symbol rows used by QWERTY-based templates.
 */
export const symbolRows = (): KeyboardRow[] => [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '-', '_', '+', '(', ')'],
  ['!', '"', "'", ':', ';', '/', '?', backspaceKey()],
];
