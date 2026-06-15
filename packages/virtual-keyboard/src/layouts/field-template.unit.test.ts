import { describe, expect, it } from 'vitest';

import { templateForField } from './field-template.js';

const input = (attrs: Record<string, string>): HTMLInputElement => {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
};

describe('templateForField', () => {
  it.each([
    ['tel', 'telephone'],
    ['number', 'numeric'],
    ['email', 'email'],
    ['url', 'url'],
    ['date', 'date'],
    ['datetime-local', 'date'],
    ['month', 'date'],
    ['week', 'date'],
    ['password', 'normal-keyboard'],
    ['search', 'normal-keyboard'],
    ['text', 'normal-keyboard'],
  ])('maps type="%s" to %s', (type, expected) => {
    expect(templateForField(input({ type }))).toBe(expected);
  });

  it.each([
    ['numeric', 'numeric'],
    ['decimal', 'numeric'],
    ['tel', 'telephone'],
    ['email', 'email'],
    ['url', 'url'],
    ['search', 'normal-keyboard'],
    ['text', 'normal-keyboard'],
  ])('maps inputmode="%s" to %s', (inputmode, expected) => {
    expect(templateForField(input({ inputmode }))).toBe(expected);
  });

  it('prefers inputmode over type', () => {
    expect(templateForField(input({ type: 'text', inputmode: 'tel' }))).toBe(
      'telephone',
    );
  });

  it('is case-insensitive', () => {
    expect(templateForField(input({ type: 'TEL' }))).toBe('telephone');
    expect(templateForField(input({ inputmode: 'NUMERIC' }))).toBe('numeric');
  });

  it('returns undefined for types with no on-screen keyboard', () => {
    expect(templateForField(input({ type: 'checkbox' }))).toBeUndefined();
    expect(templateForField(input({ type: 'range' }))).toBeUndefined();
    expect(templateForField(input({ type: 'color' }))).toBeUndefined();
  });

  it('returns undefined for a textarea', () => {
    expect(
      templateForField(document.createElement('textarea')),
    ).toBeUndefined();
  });

  it('falls back from an unmapped inputmode to the type', () => {
    expect(templateForField(input({ type: 'tel', inputmode: 'none' }))).toBe(
      'telephone',
    );
  });
});
