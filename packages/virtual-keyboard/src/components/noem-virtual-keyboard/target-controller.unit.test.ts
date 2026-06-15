import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyEnter,
  deleteBackward,
  findNextField,
  insertText,
  type KeyboardTarget,
  resolveTarget,
} from './target-controller.js';

const createInput = (value = ''): HTMLInputElement => {
  const input = document.createElement('input');
  input.value = value;
  document.body.appendChild(input);
  return input;
};

const createTextarea = (value = ''): HTMLTextAreaElement => {
  const textarea = document.createElement('textarea') as HTMLTextAreaElement;
  textarea.value = value;
  document.body.appendChild(textarea);
  return textarea;
};

// The mock-doc test environment has no selection API, so selection state is
// stubbed onto the instance; the controller reads it the same way it would
// read the native properties.
const setSelection = (el: KeyboardTarget, start: number, end = start): void => {
  Object.defineProperty(el, 'selectionStart', {
    value: start,
    configurable: true,
  });
  Object.defineProperty(el, 'selectionEnd', {
    value: end,
    configurable: true,
  });
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveTarget', () => {
  it('returns null when no target is given', () => {
    expect(resolveTarget(undefined)).toBeNull();
  });

  it('returns the element when given directly', () => {
    const input = createInput();
    expect(resolveTarget(input)).toBe(input);
  });

  it('resolves a CSS selector', () => {
    const input = createInput();
    input.id = 'demo';
    expect(resolveTarget('#demo')).toBe(input);
  });

  it('returns null for non text-field elements', () => {
    const div = document.createElement('div');
    div.id = 'demo';
    document.body.appendChild(div);
    expect(resolveTarget('#demo')).toBeNull();
  });
});

describe('insertText', () => {
  it('appends at the end without selection state', () => {
    const input = createInput('ab');
    insertText(input, 'c');
    expect(input.value).toBe('abc');
  });

  it('inserts at the caret', () => {
    const input = createInput('ac');
    setSelection(input, 1);
    insertText(input, 'b');
    expect(input.value).toBe('abc');
  });

  it('replaces the selection', () => {
    const input = createInput('axxc');
    setSelection(input, 1, 3);
    insertText(input, 'b');
    expect(input.value).toBe('abc');
  });

  it('restores the caret after the inserted text', () => {
    const input = createInput('ac');
    setSelection(input, 1);
    const setSelectionRange = vi.fn();
    input.setSelectionRange = setSelectionRange;

    insertText(input, 'b');

    expect(setSelectionRange).toHaveBeenCalledWith(2, 2);
  });

  it('dispatches a native input event with insertText type', () => {
    const input = createInput();
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    insertText(input, 'a');

    expect(onInput).toHaveBeenCalledTimes(1);
    const event = onInput.mock.calls[0][0] as InputEvent;
    expect(event.inputType).toBe('insertText');
    expect(event.data).toBe('a');
    expect(event.bubbles).toBe(true);
  });
});

describe('deleteBackward', () => {
  it('deletes the character before the caret', () => {
    const input = createInput('abc');
    setSelection(input, 3);
    deleteBackward(input);
    expect(input.value).toBe('ab');
  });

  it('deletes in the middle of the value', () => {
    const input = createInput('abc');
    setSelection(input, 2);
    deleteBackward(input);
    expect(input.value).toBe('ac');
  });

  it('deletes the selection', () => {
    const input = createInput('abc');
    setSelection(input, 1, 3);
    deleteBackward(input);
    expect(input.value).toBe('a');
  });

  it('does nothing on an empty value', () => {
    const input = createInput('');
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    deleteBackward(input);

    expect(input.value).toBe('');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('dispatches a native input event with deleteContentBackward type', () => {
    const input = createInput('a');
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    deleteBackward(input);

    const event = onInput.mock.calls[0][0] as InputEvent;
    expect(event.inputType).toBe('deleteContentBackward');
  });
});

describe('findNextField', () => {
  const createForm = (
    ...fields: {
      tag?: string;
      type?: string;
      disabled?: boolean;
      readOnly?: boolean;
    }[]
  ): KeyboardTarget[] => {
    const form = document.createElement('form');
    document.body.appendChild(form);

    return fields.map((field) => {
      const el = document.createElement(
        field.tag ?? 'input',
      ) as HTMLInputElement;
      if (field.type) {
        el.type = field.type;
      }
      if (field.disabled) {
        el.disabled = true;
      }
      if (field.readOnly) {
        el.readOnly = true;
      }
      form.appendChild(el);
      return el;
    });
  };

  it('returns the next text field in form order', () => {
    const [first, second] = createForm({}, {});

    expect(findNextField(first)).toBe(second);
  });

  it('skips disabled, readonly and non-typeable fields', () => {
    const [first, , , , last] = createForm(
      {},
      { disabled: true },
      { readOnly: true },
      { type: 'checkbox' },
      {},
    );

    expect(findNextField(first)).toBe(last);
  });

  it('crosses into textareas', () => {
    const [first, second] = createForm({}, { tag: 'textarea' });

    expect(findNextField(first)).toBe(second);
  });

  it('returns null on the last editable field', () => {
    const [first, last] = createForm({}, {});

    expect(findNextField(last)).toBeNull();
    expect(findNextField(first)).not.toBeNull();
  });

  it('returns null without a form', () => {
    const input = createInput();

    expect(findNextField(input)).toBeNull();
  });
});

describe('applyEnter', () => {
  it('inserts a line break in textareas', () => {
    const textarea = createTextarea('ab');
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);

    applyEnter(textarea);

    expect(textarea.value).toBe('ab\n');
    const event = onInput.mock.calls[0][0] as InputEvent;
    expect(event.inputType).toBe('insertLineBreak');
  });

  it('dispatches change on inputs without changing the value', () => {
    const input = createInput('ab');
    const onChange = vi.fn();
    input.addEventListener('change', onChange);

    applyEnter(input);

    expect(input.value).toBe('ab');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
