import { describe, expect, it } from 'vitest';

import { isLuhnValid } from './isLuhnValid.js';

describe('isLuhnValid', () => {
  it('accepts valid Luhn strings', () => {
    expect(isLuhnValid('79927398713')).toBe(true);
    expect(isLuhnValid('4532015112830366')).toBe(true);
    expect(isLuhnValid('0')).toBe(true);
  });

  it('accepts valid Luhn CC numbers', () => {
    expect(isLuhnValid('378282246310005')).toBe(true);
    expect(isLuhnValid('371449635398431')).toBe(true);
    expect(isLuhnValid('378734493671000')).toBe(true);
    expect(isLuhnValid('5610591081018250')).toBe(true);
    expect(isLuhnValid('30569309025904')).toBe(true);
    expect(isLuhnValid('38520000023237')).toBe(true);
    expect(isLuhnValid('6011111111111117')).toBe(true);
    expect(isLuhnValid('6011000990139424')).toBe(true);
    expect(isLuhnValid('3530111333300000')).toBe(true);
    expect(isLuhnValid('3566002020360505')).toBe(true);
    expect(isLuhnValid('5555555555554444')).toBe(true);
    expect(isLuhnValid('5105105105105100')).toBe(true);
    expect(isLuhnValid('4111111111111111')).toBe(true);
    expect(isLuhnValid('4012888888881881')).toBe(true);
    expect(isLuhnValid('4222222222222')).toBe(true);
    expect(isLuhnValid('5019717010103742')).toBe(true);
    expect(isLuhnValid('6331101999990016')).toBe(true);
  });

  it('accepts valid Luhn canadian SSN numbers', () => {
    expect(isLuhnValid('137985263')).toBe(true);
    expect(isLuhnValid('611014259')).toBe(true);
    expect(isLuhnValid('144089844')).toBe(true);
    expect(isLuhnValid('918711763')).toBe(true);
    expect(isLuhnValid('238704985')).toBe(true);
    expect(isLuhnValid('530941715')).toBe(true);
    expect(isLuhnValid('547224493')).toBe(true);
    expect(isLuhnValid('305442709')).toBe(true);
    expect(isLuhnValid('506720408')).toBe(true);
    expect(isLuhnValid('301617908')).toBe(true);
    expect(isLuhnValid('365950690')).toBe(true);
    expect(isLuhnValid('159996115')).toBe(true);
    expect(isLuhnValid('177542172')).toBe(true);
    expect(isLuhnValid('276830965')).toBe(true);
    expect(isLuhnValid('551187974')).toBe(true);
    expect(isLuhnValid('486537319')).toBe(true);
    expect(isLuhnValid('203531025')).toBe(true);
    expect(isLuhnValid('389744897')).toBe(true);
    expect(isLuhnValid('470132739')).toBe(true);
    expect(isLuhnValid('628061541')).toBe(true);
    expect(isLuhnValid('446967754')).toBe(true);
    expect(isLuhnValid('747157261')).toBe(true);
    expect(isLuhnValid('556179554')).toBe(true);
    expect(isLuhnValid('929653178')).toBe(true);
    expect(isLuhnValid('196723985')).toBe(true);
    expect(isLuhnValid('714734902')).toBe(true);
    expect(isLuhnValid('682031430')).toBe(true);
    expect(isLuhnValid('142709773')).toBe(true);
    expect(isLuhnValid('310195771')).toBe(true);
    expect(isLuhnValid('573188026')).toBe(true);
    expect(isLuhnValid('920391430')).toBe(true);
    expect(isLuhnValid('584507933')).toBe(true);
    expect(isLuhnValid('215379603')).toBe(true);
    expect(isLuhnValid('932610850')).toBe(true);
    expect(isLuhnValid('770324135')).toBe(true);
    expect(isLuhnValid('693542508')).toBe(true);
    expect(isLuhnValid('101529956')).toBe(true);
    expect(isLuhnValid('379136997')).toBe(true);
    expect(isLuhnValid('418673778')).toBe(true);
    expect(isLuhnValid('623703121')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isLuhnValid('  79927398713 ')).toBe(true);
  });

  it('rejects invalid Luhn values', () => {
    expect(isLuhnValid('79927398714')).toBe(false);
    expect(isLuhnValid('1234567890')).toBe(false);
  });

  it('rejects empty, blank, and non-digit input', () => {
    expect(isLuhnValid('22222226')).toBe(false);
    expect(isLuhnValid('')).toBe(false);
    expect(isLuhnValid('   ')).toBe(false);
    expect(isLuhnValid('abc')).toBe(false);
  });

  // --- backward-compat baseline (characterization) ---
  it('accepts an all-zero string (sum 0)', () => {
    expect(isLuhnValid('00000000000')).toBe(true);
  });

  it('treats string and number forms of the same value alike', () => {
    expect(isLuhnValid('79927398713')).toBe(isLuhnValid('79927398713'));
    expect(isLuhnValid('79927398714')).toBe(isLuhnValid('79927398714'));
  });

  it('rejects internal whitespace', () => {
    expect(isLuhnValid('799 27398713')).toBe(false);
  });

  // --- intentional behavior changes (bug fixes vs. old parseInt path) ---
  it('rejects trailing non-digit characters', () => {
    // Old parseInt path truncated to "4532015112830366" and wrongly passed.
    expect(isLuhnValid('4532015112830366abc')).toBe(false);
  });

  it('validates a 19-digit PAN exactly (no float precision loss)', () => {
    // parseInt rounds this to ...366000; the digit-string path keeps it exact.
    expect(isLuhnValid('4532015112830366005')).toBe(true);
  });
});
