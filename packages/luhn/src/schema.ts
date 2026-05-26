import * as v from 'valibot';

import { isLuhnValid } from './isLuhnValid.js';

/**
 * Ready-made schema for a non-empty, Luhn-valid string.
 *
 * String-based on purpose: PANs/SIN values must be validated as strings to
 * avoid the floating-point precision loss that affects 17–19 digit numbers.
 *
 * @example
 * v.parse(LuhnSchema, '4532015112830366');
 */
export const LuhnSchema = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.check((input: string) => isLuhnValid(input), 'Invalid Luhn number'),
);

export type LuhnInput = v.InferInput<typeof LuhnSchema>;
export type LuhnOutput = v.InferOutput<typeof LuhnSchema>;
