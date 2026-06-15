import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../noem-virtual-keyboard.js';

import type { KeyboardLayout } from '../../layouts/index.js';
import type { NoemVirtualKeyboard } from './noem-virtual-keyboard.js';

const renderKeyboard = async (
  props: Partial<NoemVirtualKeyboard> = {},
): Promise<NoemVirtualKeyboard> => {
  const el = document.createElement('noem-virtual-keyboard');
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

const setProps = async (
  el: NoemVirtualKeyboard,
  props: Partial<NoemVirtualKeyboard>,
): Promise<void> => {
  Object.assign(el, props);
  await el.updateComplete;
};

const getButtons = (el: NoemVirtualKeyboard): HTMLButtonElement[] =>
  Array.from(el.shadowRoot?.querySelectorAll('button') ?? []);

const findKey = (
  el: NoemVirtualKeyboard,
  ariaLabel: string,
): HTMLButtonElement => {
  const button = getButtons(el).find(
    (b) => b.getAttribute('aria-label') === ariaLabel,
  );
  if (!button) {
    throw new Error(`No key with aria-label "${ariaLabel}"`);
  }
  return button;
};

const tap = (button: HTMLButtonElement): void => {
  button.dispatchEvent(
    new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
};

const spyOnEvent = (el: NoemVirtualKeyboard, name: string) => {
  const listener = vi.fn();
  el.addEventListener(name, listener);
  return {
    get length() {
      return listener.mock.calls.length;
    },
    get firstEvent(): CustomEvent | undefined {
      return listener.mock.calls[0]?.[0] as CustomEvent | undefined;
    },
    get lastEvent(): CustomEvent | undefined {
      return listener.mock.lastCall?.[0] as CustomEvent | undefined;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.style.paddingBottom = '';
});

describe('noem-virtual-keyboard', () => {
  describe('rendering', () => {
    it('renders the normal-keyboard template by default', async () => {
      const el = await renderKeyboard();

      expect(el.shadowRoot?.querySelectorAll('.row')).toHaveLength(4);
      expect(findKey(el, 'q')).toBeDefined();
      expect(findKey(el, 'Shift')).toBeDefined();
      expect(findKey(el, 'Backspace')).toBeDefined();
      expect(findKey(el, 'Space')).toBeDefined();
      expect(findKey(el, 'Enter')).toBeDefined();
    });

    it('renders the telephone template', async () => {
      const el = await renderKeyboard({ template: 'telephone' });

      expect(getButtons(el)).toHaveLength(13);
      expect(findKey(el, '#')).toBeDefined();
      expect(findKey(el, '*')).toBeDefined();
      expect(findKey(el, 'Backspace')).toBeDefined();
      expect(
        getButtons(el).some((b) => b.getAttribute('aria-label') === 'Shift'),
      ).toBe(false);
    });

    it('renders a custom layout over the template', async () => {
      const el = await renderKeyboard();
      const layout: KeyboardLayout = {
        layers: {
          default: [['x', { label: 'GO', value: 'go', action: 'custom' }]],
        },
      };

      await setProps(el, { layout });

      expect(getButtons(el).map((b) => b.getAttribute('aria-label'))).toEqual([
        'x',
        'GO',
      ]);
    });
  });

  describe('events', () => {
    it('emits noemKeyPress with the resolved key', async () => {
      const el = await renderKeyboard();
      const spy = spyOnEvent(el, 'noemKeyPress');

      tap(findKey(el, 'q'));

      expect(spy.length).toBe(1);
      expect(spy.firstEvent?.detail).toMatchObject({
        key: { value: 'q', label: 'q', action: 'char' },
        layer: 'default',
        shiftState: 'off',
      });
    });

    it('emits noemEnter on the enter key', async () => {
      const el = await renderKeyboard();
      const spy = spyOnEvent(el, 'noemEnter');

      tap(findKey(el, 'Enter'));

      expect(spy.length).toBe(1);
      expect(spy.firstEvent?.detail.key.action).toBe('enter');
    });

    it('emits noemLayerChange on layer switch', async () => {
      const el = await renderKeyboard();
      const spy = spyOnEvent(el, 'noemLayerChange');

      tap(findKey(el, 'Symbols'));

      expect(spy.firstEvent?.detail).toEqual({
        layer: 'symbols',
        shiftState: 'off',
      });
    });

    it('emits no events while disabled', async () => {
      const el = await renderKeyboard();
      const spy = spyOnEvent(el, 'noemKeyPress');
      await setProps(el, { disabled: true });

      tap(findKey(el, 'q'));

      expect(spy.length).toBe(0);
    });
  });

  describe('shift', () => {
    it('shows the shift layer after a shift tap and reverts after a character', async () => {
      const el = await renderKeyboard();
      const spy = spyOnEvent(el, 'noemKeyPress');

      tap(findKey(el, 'Shift'));
      await el.updateComplete;
      expect(findKey(el, 'Q')).toBeDefined();
      expect(findKey(el, 'Shift').getAttribute('aria-pressed')).toBe('true');

      tap(findKey(el, 'Q'));
      await el.updateComplete;

      expect(spy.lastEvent?.detail.key.value).toBe('Q');
      expect(findKey(el, 'q')).toBeDefined();
      expect(findKey(el, 'Shift').getAttribute('aria-pressed')).toBe('false');
    });

    it('locks caps on a double tap and unlocks on a third', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const el = await renderKeyboard();

      tap(findKey(el, 'Shift'));
      await el.updateComplete;
      tap(findKey(el, 'Shift'));
      await el.updateComplete;

      tap(findKey(el, 'Q'));
      await el.updateComplete;
      expect(findKey(el, 'Q')).toBeDefined();

      tap(findKey(el, 'Shift'));
      await el.updateComplete;
      expect(findKey(el, 'q')).toBeDefined();
    });
  });

  describe('layers', () => {
    it('switches to symbols and back', async () => {
      const el = await renderKeyboard();

      tap(findKey(el, 'Symbols'));
      await el.updateComplete;
      expect(findKey(el, '1')).toBeDefined();

      tap(findKey(el, 'Letters'));
      await el.updateComplete;
      expect(findKey(el, 'q')).toBeDefined();
    });
  });

  describe('target integration', () => {
    const createTarget = (): HTMLInputElement => {
      const input = document.createElement('input');
      input.id = 'kb-target';
      input.value = '';
      document.body.appendChild(input);
      return input;
    };

    it('types into the target resolved from a selector', async () => {
      const input = createTarget();
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'q'));
      tap(findKey(el, 'w'));

      expect(input.value).toBe('qw');
    });

    it('dispatches a native input event on the target', async () => {
      const input = createTarget();
      const onInput = vi.fn();
      input.addEventListener('input', onInput);
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'q'));

      expect(onInput).toHaveBeenCalledTimes(1);
      expect(onInput.mock.calls[0][0].inputType).toBe('insertText');
    });

    it('inserts a space for the space key', async () => {
      const input = createTarget();
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'Space'));

      expect(input.value).toBe(' ');
    });

    it('deletes with backspace', async () => {
      const input = createTarget();
      input.value = 'ab';
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'Backspace'));

      expect(input.value).toBe('a');
    });

    it('empties the target for a clear key', async () => {
      const input = createTarget();
      input.value = '1234';
      const onInput = vi.fn();
      input.addEventListener('input', onInput);
      const el = await renderKeyboard({
        target: '#kb-target',
        template: 'pin',
      });

      tap(findKey(el, 'Clear'));

      expect(input.value).toBe('');
      expect(onInput).toHaveBeenCalledTimes(1);
    });

    it('dispatches change on the target for enter', async () => {
      const input = createTarget();
      const onChange = vi.fn();
      input.addEventListener('change', onChange);
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'Enter'));

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('skips the target mutation when noemKeyPress is prevented', async () => {
      const input = createTarget();
      const el = await renderKeyboard({ target: '#kb-target' });
      el.addEventListener('noemKeyPress', (event) => event.preventDefault());

      tap(findKey(el, 'q'));

      expect(input.value).toBe('');
    });
  });

  describe('field type / inputmode detection', () => {
    const createTarget = (
      attrs: Record<string, string> = {},
    ): HTMLInputElement => {
      const input = document.createElement('input');
      input.id = 'kb-target';
      for (const [k, v] of Object.entries(attrs)) {
        input.setAttribute(k, v);
      }
      document.body.appendChild(input);
      return input;
    };

    it('uses the telephone keypad for type="tel"', async () => {
      createTarget({ type: 'tel' });
      const el = await renderKeyboard({ target: '#kb-target' });

      expect(findKey(el, '#')).toBeDefined();
      expect(findKey(el, '*')).toBeDefined();
    });

    it('uses the numeric pad for type="number"', async () => {
      createTarget({ type: 'number' });
      const el = await renderKeyboard({ target: '#kb-target' });

      expect(findKey(el, '1')).toBeDefined();
      expect(
        getButtons(el).some((b) => b.getAttribute('aria-label') === 'q'),
      ).toBe(false);
    });

    it('prefers inputmode over type', async () => {
      createTarget({ type: 'text', inputmode: 'tel' });
      const el = await renderKeyboard({ target: '#kb-target' });

      expect(findKey(el, '#')).toBeDefined();
    });

    it('lets an explicit template win over the field type', async () => {
      createTarget({ type: 'tel' });
      const el = await renderKeyboard({
        target: '#kb-target',
        template: 'normal-keyboard',
      });

      expect(findKey(el, 'q')).toBeDefined();
    });

    it('re-derives the template when the target changes', async () => {
      const text = createTarget();
      const phone = document.createElement('input');
      phone.id = 'kb-phone';
      phone.type = 'tel';
      document.body.appendChild(phone);
      const el = await renderKeyboard({ target: '#kb-target' });

      expect(findKey(el, 'q')).toBeDefined();

      await setProps(el, { target: phone });
      expect(findKey(el, '#')).toBeDefined();
      void text;
    });
  });

  describe('enter in a form', () => {
    const createFormTargets = (
      fieldCount: number,
    ): [HTMLFormElement, HTMLInputElement[]] => {
      const form = document.createElement('form');
      const inputs = Array.from({ length: fieldCount }, (_, i) => {
        const input = document.createElement('input');
        if (i === 0) {
          input.id = 'kb-target';
        }
        form.appendChild(input);
        return input;
      });
      document.body.appendChild(form);
      return [form, inputs];
    };

    it('advances to the next field and retargets typing', async () => {
      const [, [first, second]] = createFormTargets(2);
      const el = await renderKeyboard({ target: '#kb-target' });

      // A next field exists, so the enter key reads "Next" with a → label.
      const enterKey = findKey(el, 'Next');
      expect(enterKey.textContent?.trim()).toBe('→');

      tap(enterKey);
      await el.updateComplete;

      expect(document.activeElement).toBe(second);
      tap(findKey(el, 'q'));
      expect(second.value).toBe('q');
      expect(first.value).toBe('');

      // Last field now: the key reverts to a plain enter key.
      expect(findKey(el, 'Enter').textContent?.trim()).toBe('⏎');
    });

    it('submits the form on enter at the last field', async () => {
      const [form] = createFormTargets(1);
      const requestSubmit = vi.fn();
      form.requestSubmit = requestSubmit;
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'Enter'));

      expect(requestSubmit).toHaveBeenCalledTimes(1);
    });

    it('follows manual focus to a sibling field for the enter label', async () => {
      const [, [, second]] = createFormTargets(2);
      const el = await renderKeyboard({ target: '#kb-target' });

      // Initially on the first field, so the enter key advances ("Next").
      expect(findKey(el, 'Next').textContent?.trim()).toBe('→');

      // User taps the last field directly: keyboard follows focus and the
      // enter key reverts to a plain enter ("⏎"), not "Next".
      second.focus();
      await el.updateComplete;

      expect(findKey(el, 'Enter').textContent?.trim()).toBe('⏎');
      tap(findKey(el, 'q'));
      expect(second.value).toBe('q');
    });

    it('ignores focus on fields outside the target form', async () => {
      await createFormTargets(2);
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      const el = await renderKeyboard({ target: '#kb-target' });

      outside.focus();
      await el.updateComplete;

      // Still targeting the first field of the form: enter advances.
      expect(findKey(el, 'Next').textContent?.trim()).toBe('→');
    });

    it('dispatches change before advancing', async () => {
      const [, [first]] = createFormTargets(2);
      const onChange = vi.fn();
      first.addEventListener('change', onChange);
      const el = await renderKeyboard({ target: '#kb-target' });

      tap(findKey(el, 'Next'));

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-attach (kiosk) mode', () => {
    const makeInput = (
      attrs: Record<string, string> = {},
    ): HTMLInputElement => {
      const input = document.createElement('input');
      input.className = 'kiosk';
      for (const [k, v] of Object.entries(attrs)) {
        input.setAttribute(k, v);
      }
      document.body.appendChild(input);
      return input;
    };

    it('stays hidden and untargeted until a matching field is focused', async () => {
      const input = makeInput();
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      expect(el.open).toBe(false);
      expect(el.hasAttribute('open')).toBe(false);

      input.focus();
      await el.updateComplete;

      expect(el.open).toBe(true);
      expect(el.target).toBe(input);
      tap(findKey(el, 'q'));
      expect(input.value).toBe('q');
    });

    it('ignores focus on non-matching fields', async () => {
      const other = document.createElement('input');
      document.body.appendChild(other);
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      other.focus();
      await el.updateComplete;

      expect(el.open).toBe(false);
      expect(el.target).toBeUndefined();
    });

    it('hides when focus leaves for a non-served, non-keyboard element', async () => {
      const input = makeInput();
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      input.focus();
      await el.updateComplete;
      expect(el.open).toBe(true);

      input.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
      );
      await el.updateComplete;

      expect(el.open).toBe(false);
    });

    it('stays open while moving between served fields', async () => {
      const first = makeInput();
      const second = makeInput();
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      first.focus();
      await el.updateComplete;

      first.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: second }),
      );
      second.focus();
      await el.updateComplete;

      expect(el.open).toBe(true);
      expect(el.target).toBe(second);
    });

    it('applies per-field template from data-keyboard-template', async () => {
      const input = makeInput({ 'data-keyboard-template': 'telephone' });
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      input.focus();
      await el.updateComplete;

      expect(findKey(el, '#')).toBeDefined();
      expect(findKey(el, '*')).toBeDefined();
    });

    it('derives the template from a field type with no override', async () => {
      const input = makeInput({ type: 'tel' });
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      input.focus();
      await el.updateComplete;

      expect(findKey(el, '#')).toBeDefined();
      expect(findKey(el, '*')).toBeDefined();
    });

    // happy-dom has no layout engine, so drive geometry by hand: a 300px dock
    // in a 600px viewport puts the dock top at 600 - 300 - 8(gap) = 292.
    const stubGeometry = (
      el: NoemVirtualKeyboard,
      input: HTMLInputElement,
      fieldBottom: number,
    ): ReturnType<typeof vi.fn> => {
      Object.defineProperty(el, 'offsetHeight', {
        configurable: true,
        get: () => 300,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 600,
      });
      input.getBoundingClientRect = () => ({ bottom: fieldBottom }) as DOMRect;
      const scrollBy = vi.fn();
      const root = (document.scrollingElement ??
        document.documentElement) as HTMLElement;
      root.scrollBy = scrollBy as unknown as Element['scrollBy'];
      return scrollBy;
    };

    it('scrolls the field clear and pads only the deficit when the dock overlaps', async () => {
      const input = makeInput();
      const el = await renderKeyboard({ autoAttach: '.kiosk' });
      const scrollBy = stubGeometry(el, input, 500); // overlap = 500 - 292 = 208

      input.focus();
      await el.updateComplete;

      // No scroll room in happy-dom, so the whole overlap becomes padding.
      expect(document.body.style.paddingBottom).toBe('208px');
      expect(scrollBy).toHaveBeenCalledWith({ top: 208, behavior: 'smooth' });
    });

    it('does nothing when the field is already above the dock', async () => {
      const input = makeInput();
      const el = await renderKeyboard({ autoAttach: '.kiosk' });
      const scrollBy = stubGeometry(el, input, 100); // overlap = 100 - 292 < 0

      input.focus();
      await el.updateComplete;

      expect(document.body.style.paddingBottom).toBe('');
      expect(scrollBy).not.toHaveBeenCalled();
    });

    it('releases the reserved space when it hides', async () => {
      const input = makeInput();
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      const el = await renderKeyboard({ autoAttach: '.kiosk' });
      stubGeometry(el, input, 500);

      input.focus();
      await el.updateComplete;
      expect(document.body.style.paddingBottom).toBe('208px');

      input.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
      );
      await el.updateComplete;

      expect(document.body.style.paddingBottom).toBe('');
    });

    it('does not reserve space when keepVisible is false', async () => {
      const input = makeInput();
      const el = await renderKeyboard({
        autoAttach: '.kiosk',
        keepVisible: false,
      });

      input.focus();
      await el.updateComplete;

      expect(document.body.style.paddingBottom).toBe('');
    });

    it('reverts to the default template for a field without an override', async () => {
      const phone = makeInput({ 'data-keyboard-template': 'telephone' });
      const plain = makeInput();
      const el = await renderKeyboard({ autoAttach: '.kiosk' });

      phone.focus();
      await el.updateComplete;
      expect(findKey(el, '#')).toBeDefined();

      plain.focus();
      await el.updateComplete;
      // A plain text field falls back to the full QWERTY keyboard.
      expect(findKey(el, 'q')).toBeDefined();
      expect(findKey(el, 'Space')).toBeDefined();
    });

    it('lets an explicit template override field type detection', async () => {
      const input = makeInput({ type: 'tel' });
      const el = await renderKeyboard({
        autoAttach: '.kiosk',
        template: 'numeric',
      });

      input.focus();
      await el.updateComplete;

      // Numeric pad, not the telephone keypad the `tel` type would pick.
      expect(findKey(el, '1')).toBeDefined();
      expect(
        getButtons(el).some((b) => b.getAttribute('aria-label') === '#'),
      ).toBe(false);
    });
  });
});
