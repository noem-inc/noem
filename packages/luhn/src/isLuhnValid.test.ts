import { describe, expect, it } from 'vitest';

import { isLuhnValid } from './isLuhnValid.js';

describe('isLuhnValid', () => {
  it('accepts valid Luhn strings', () => {
    expect(isLuhnValid('79927398713')).toBe(true);
    expect(isLuhnValid('4532015112830366')).toBe(true);
  });

  it('accepts valid Luhn numbers', () => {
    expect(isLuhnValid(79927398713)).toBe(true);
    expect(isLuhnValid(4532015112830366)).toBe(true);
    expect(isLuhnValid('222222226')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isLuhnValid('  79927398713 ')).toBe(true);
  });

  it('rejects invalid Luhn values', () => {
    expect(isLuhnValid('79927398714')).toBe(false);
    expect(isLuhnValid('1234567890')).toBe(false);
  });

  it('rejects empty, blank, and non-digit input', () => {
    expect(isLuhnValid(22222226)).toBe(false);
    expect(isLuhnValid('')).toBe(false);
    expect(isLuhnValid('   ')).toBe(false);
    expect(isLuhnValid('abc')).toBe(false);
  });

  it('rejects falsy zero', () => {
    expect(isLuhnValid(0)).toBe(false);
  });
});
