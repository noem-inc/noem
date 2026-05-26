import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { LuhnSchema } from './schema.js';

describe('LuhnSchema', () => {
  it('parses a valid Luhn string and returns it', () => {
    expect(v.parse(LuhnSchema, '4532015112830366')).toBe('4532015112830366');
  });

  it('rejects an invalid Luhn string', () => {
    expect(v.is(LuhnSchema, '79927398714')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(v.is(LuhnSchema, '')).toBe(false);
  });

  it('rejects a non-string input at the type guard', () => {
    expect(v.is(LuhnSchema, 4532015112830366)).toBe(false);
  });
});
