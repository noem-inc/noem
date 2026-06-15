/**
 * The behavior of a key when pressed.
 *
 * - `char`: inserts `value` into the target / emits it.
 * - `space`: inserts a single space character.
 * - `backspace`: deletes backwards in the target.
 * - `enter`: emits `noemEnter`; inserts a line break in textarea targets.
 * - `shift`: toggles the shift state (tap once for single, double-tap to
 *   lock).
 * - `layer`: switches the active layer to `layer`.
 * - `custom`: emits `noemKeyPress` only; the consumer handles it.
 */
export type KeyAction =
  | 'char'
  | 'space'
  | 'backspace'
  | 'enter'
  | 'shift'
  | 'layer'
  | 'custom';

export interface KeyboardKey {
  /**
   * Text inserted for `char` keys; identifier for `custom` keys.
   */
  value?: string;
  /**
   * Visible label. Defaults to `value`.
   */
  label?: string;
  /**
   * Defaults to `char`.
   */
  action?: KeyAction;
  /**
   * Name of the layer to switch to. Required when `action` is `layer`.
   */
  layer?: string;
  /**
   * Width in flex units relative to sibling keys. Defaults to 1.
   */
  width?: number;
  /**
   * Accessibility label override (e.g. "Backspace" for a `⌫` glyph).
   */
  ariaLabel?: string;
}

/**
 * A key definition. The string shorthand `'a'` is equivalent to
 * `{ value: 'a', action: 'char' }`.
 */
export type KeyboardKeyInput = string | KeyboardKey;

export type KeyboardRow = KeyboardKeyInput[];

export interface KeyboardLayout {
  /**
   * Name of the layer rendered initially. Defaults to `default`.
   */
  defaultLayer?: string;
  /**
   * Named layers, each a list of rows. By convention a layer named `shift`
   * is rendered in place of the default layer while shift is engaged.
   */
  layers: Record<string, KeyboardRow[]>;
}

/**
 * A key with all defaults applied. Used for rendering and in event details.
 */
export interface ResolvedKey {
  value: string;
  label: string;
  action: KeyAction;
  width: number;
  layer?: string;
  ariaLabel?: string;
}

export interface ResolvedLayout {
  defaultLayer: string;
  layers: Record<string, ResolvedKey[][]>;
}

export type ShiftState = 'off' | 'single' | 'locked';
