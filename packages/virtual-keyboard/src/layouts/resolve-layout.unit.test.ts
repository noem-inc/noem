import { describe, expect, it } from 'vitest';
import { resolveLayout } from './resolve-layout.js';
import { keyboardTemplates } from './templates/index.js';

describe('resolveLayout', () => {
  it('expands string shorthand keys', () => {
    const resolved = resolveLayout({ layers: { default: [['a', 'b']] } });

    expect(resolved.layers.default[0]).toEqual([
      { value: 'a', label: 'a', action: 'char', width: 1 },
      { value: 'b', label: 'b', action: 'char', width: 1 },
    ]);
  });

  it('applies defaults to object keys', () => {
    const resolved = resolveLayout({
      layers: { default: [[{ value: 'a' }]] },
    });

    expect(resolved.layers.default[0][0]).toEqual({
      value: 'a',
      label: 'a',
      action: 'char',
      width: 1,
      layer: undefined,
      ariaLabel: undefined,
    });
  });

  it('keeps explicit label, width and ariaLabel', () => {
    const resolved = resolveLayout({
      layers: {
        default: [
          [
            {
              label: '⌫',
              action: 'backspace',
              width: 2,
              ariaLabel: 'Backspace',
            },
          ],
        ],
      },
    });

    expect(resolved.layers.default[0][0]).toMatchObject({
      value: '',
      label: '⌫',
      action: 'backspace',
      width: 2,
      ariaLabel: 'Backspace',
    });
  });

  it('uses "default" as the default layer', () => {
    const resolved = resolveLayout({ layers: { default: [] } });
    expect(resolved.defaultLayer).toBe('default');
  });

  it('respects an explicit defaultLayer', () => {
    const resolved = resolveLayout({
      defaultLayer: 'main',
      layers: { main: [] },
    });
    expect(resolved.defaultLayer).toBe('main');
  });

  it('throws when the default layer is missing', () => {
    expect(() => resolveLayout({ layers: { other: [] } })).toThrow(
      /no layer named "default"/,
    );
  });

  it('throws when a layer key has no target layer', () => {
    expect(() =>
      resolveLayout({
        layers: { default: [[{ label: '?123', action: 'layer' }]] },
      }),
    ).toThrow(/no target layer/);
  });

  it('throws when a key references an unknown layer', () => {
    expect(() =>
      resolveLayout({
        layers: {
          default: [[{ label: '?123', action: 'layer', layer: 'symbols' }]],
        },
      }),
    ).toThrow(/unknown layer "symbols"/);
  });

  it('resolves all built-in templates', () => {
    for (const layout of Object.values(keyboardTemplates)) {
      expect(() => resolveLayout(layout)).not.toThrow();
    }
  });

  it('resolves the shift layer of the normal keyboard template', () => {
    const resolved = resolveLayout(keyboardTemplates['normal-keyboard']);

    expect(Object.keys(resolved.layers)).toEqual([
      'default',
      'shift',
      'symbols',
    ]);
    expect(resolved.layers.shift[0][0].value).toBe('Q');
  });

  it('registers all template names', () => {
    expect(Object.keys(keyboardTemplates).sort()).toEqual([
      'compact',
      'currency',
      'date',
      'email',
      'hex',
      'normal-keyboard',
      'numeric',
      'pin',
      'telephone',
      'url',
    ]);
  });

  it('email and url templates have no space key', () => {
    for (const name of ['email', 'url'] as const) {
      const resolved = resolveLayout(keyboardTemplates[name]);
      const keys = Object.values(resolved.layers).flat(2);

      expect(keys.some((key) => key.action === 'space')).toBe(false);
    }
  });

  it('compact template has no symbols layer', () => {
    const resolved = resolveLayout(keyboardTemplates.compact);

    expect(Object.keys(resolved.layers)).toEqual(['default', 'shift']);
  });

  it('pin template exposes a clear key', () => {
    const resolved = resolveLayout(keyboardTemplates.pin);
    const keys = resolved.layers.default.flat();

    expect(keys).toContainEqual(
      expect.objectContaining({ action: 'clear', ariaLabel: 'Clear' }),
    );
  });

  it('hex template includes the hex digits', () => {
    const resolved = resolveLayout(keyboardTemplates.hex);
    const values = resolved.layers.default.flat().map((key) => key.value);

    for (const digit of ['0', '9', 'A', 'F']) {
      expect(values).toContain(digit);
    }
  });
});
