import type { KeyboardTemplateName } from './templates/index.js';

/**
 * Maps an input's `inputmode` to a keyboard template. `inputmode` is the more
 * specific authoring hint, so it is consulted before `type`.
 */
const INPUTMODE_TEMPLATES: Record<string, KeyboardTemplateName> = {
  numeric: 'numeric',
  decimal: 'numeric',
  tel: 'telephone',
  email: 'email',
  url: 'url',
  search: 'normal-keyboard',
  text: 'normal-keyboard',
};

/**
 * Maps an `<input type>` to a keyboard template. Types with no sensible
 * on-screen keyboard (checkbox, range, color, ...) are intentionally absent.
 */
const TYPE_TEMPLATES: Record<string, KeyboardTemplateName> = {
  tel: 'telephone',
  number: 'numeric',
  email: 'email',
  url: 'url',
  text: 'normal-keyboard',
  search: 'normal-keyboard',
  password: 'normal-keyboard',
  date: 'date',
  'datetime-local': 'date',
  month: 'date',
  week: 'date',
};

/**
 * Derives the keyboard template a field asks for from its `inputmode` and
 * `type` attributes, or `undefined` when neither maps to a template (so the
 * caller can fall back to its configured default).
 *
 * `inputmode` wins over `type`: e.g. `<input type="text" inputmode="tel">`
 * yields the telephone keypad.
 */
export const templateForField = (
  el: HTMLInputElement | HTMLTextAreaElement,
): KeyboardTemplateName | undefined => {
  const inputMode = el.getAttribute('inputmode')?.toLowerCase();
  if (inputMode && inputMode in INPUTMODE_TEMPLATES) {
    return INPUTMODE_TEMPLATES[inputMode];
  }

  // `type` is meaningful only for inputs; textareas report `"textarea"`.
  const type = el.tagName === 'INPUT' ? el.type.toLowerCase() : undefined;
  if (type && type in TYPE_TEMPLATES) {
    return TYPE_TEMPLATES[type];
  }

  return undefined;
};
