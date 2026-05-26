// Only accept a contiguous run of ASCII digits. Applied to the trimmed input,
// this is what pins validation to real digit strings — no parseInt truncation.
const DIGIT_ONLY_REGEX = /^[0-9]+$/;

/**
 * Validates the input card/sin number is a valid Luhn Number.
 *
 * The mod-10 sum runs over the input's digit *characters* (no parseInt / float
 * division), so it stays exact for PANs longer than `Number.MAX_SAFE_INTEGER`
 * (17–19 digit cards) and never silently truncates trailing non-digits.
 *
 * @see https://github.com/chrisbuttery/luhn/blob/master/index.js
 */
export const isLuhnValid = (numberToCheck: string): boolean => {
  if (!numberToCheck) {
    return false;
  }

  const trimmed = numberToCheck.trim();

  // Rejects empty, blank, and any non-digit input (incl. internal whitespace).
  if (!DIGIT_ONLY_REGEX.test(trimmed)) {
    return false;
  }

  let sum = 0;
  let double = false;

  // Traverse digits right-to-left: the rightmost digit is never doubled, every
  // second digit from the right is doubled (subtract 9 when the result > 9).
  for (let i = trimmed.length - 1; i >= 0; i--) {
    let digit = trimmed.charCodeAt(i) - 48; // '0' === 48

    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
};
