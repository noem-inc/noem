export type KeyboardTarget = HTMLInputElement | HTMLTextAreaElement;

// Tag-name checks instead of instanceof: works across realms and in test
// environments that lack the HTMLTextAreaElement global.
const isKeyboardTarget = (el: Element | null): el is KeyboardTarget =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

/**
 * Resolves a target prop (element or document-level CSS selector) to an
 * input/textarea element, or null when absent or not a text field.
 */
export const resolveTarget = (
  target: KeyboardTarget | string | undefined,
): KeyboardTarget | null => {
  if (!target) {
    return null;
  }

  const el =
    typeof target === 'string' ? document.querySelector(target) : target;
  return isKeyboardTarget(el) ? el : null;
};

const setNativeValue = (el: KeyboardTarget, value: string): void => {
  // Use the prototype setter so frameworks that patch the instance value
  // property (React controlled inputs) still observe the change.
  let proto = Object.getPrototypeOf(el);

  while (proto && !Object.getOwnPropertyDescriptor(proto, 'value')) {
    proto = Object.getPrototypeOf(proto);
  }

  const setter = proto
    ? Object.getOwnPropertyDescriptor(proto, 'value')?.set
    : undefined;

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
};

const setCaret = (el: KeyboardTarget, position: number): void => {
  try {
    el.setSelectionRange?.(position, position);
  } catch {
    // Input types without selection support (e.g. number) throw.
  }
};

const dispatchInput = (
  el: KeyboardTarget,
  inputType: string,
  data: string | null,
): void => {
  const event: Event = new InputEvent('input', {
    bubbles: true,
    inputType,
    data,
  });

  el.dispatchEvent(event);
};

const getSelection = (el: KeyboardTarget): [number, number] => {
  const length = el.value.length;

  return [el.selectionStart ?? length, el.selectionEnd ?? length];
};

const splice = (el: KeyboardTarget, text: string, inputType: string): void => {
  const [start, end] = getSelection(el);

  setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
  setCaret(el, start + text.length);
  dispatchInput(el, inputType, text || null);
};

/**
 * Inserts text at the caret, replacing any selection, and dispatches a
 * native `input` event.
 */
export const insertText = (el: KeyboardTarget, text: string): void => {
  splice(el, text, 'insertText');
};

/**
 * Deletes the selection, or the character before the caret, and dispatches
 * a native `input` event.
 */
export const deleteBackward = (el: KeyboardTarget): void => {
  const [start, end] = getSelection(el);

  if (start === end && start === 0) {
    return;
  }

  const from = start === end ? start - 1 : start;
  setNativeValue(el, el.value.slice(0, from) + el.value.slice(end));
  setCaret(el, from);
  dispatchInput(el, 'deleteContentBackward', null);
};

const NON_TYPEABLE_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'checkbox',
  'radio',
  'file',
  'image',
  'range',
  'color',
]);

const isAdvanceTarget = (el: Element): el is KeyboardTarget => {
  if (!isKeyboardTarget(el) || el.disabled || el.readOnly) {
    return false;
  }

  return !(
    el.tagName === 'INPUT' &&
    NON_TYPEABLE_INPUT_TYPES.has((el as HTMLInputElement).type)
  );
};

/**
 * Returns the next editable text field after `el` in its form, or null
 * when `el` has no form or is the last editable field.
 */
export const findNextField = (el: KeyboardTarget): KeyboardTarget | null => {
  const form = el.form;
  if (!form) {
    return null;
  }

  const elements = Array.from(form.elements);
  const index = elements.indexOf(el);
  if (index < 0) {
    return null;
  }

  for (const candidate of elements.slice(index + 1)) {
    if (isAdvanceTarget(candidate)) {
      return candidate;
    }
  }

  return null;
};

/**
 * Enter behavior: inserts a line break in textareas; dispatches a `change`
 * event on inputs (no form submission).
 */
export const applyEnter = (el: KeyboardTarget): void => {
  if (el.tagName === 'TEXTAREA') {
    splice(el, '\n', 'insertLineBreak');
    return;
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
};
