// regex
const DIGIT_ONLY_REGEX = /^[0-9]+$/;

function isANumber(num: number | string) {
  if (typeof num === 'string') {
    return DIGIT_ONLY_REGEX.test(num);
  }

  if (Number.isNaN(num)) {
    return false;
  }

  return true;
}

/**
 * Validates the input card/sin number is a valid Luhn Number
 *
 * @see https://github.com/chrisbuttery/luhn/blob/master/index.js
 */
export const isLuhnValid = (numberToCheck: string | number): boolean => {
  if (!numberToCheck) {
    return false;
  }

  if (typeof numberToCheck !== 'string') {
    numberToCheck = String(numberToCheck);
  }

  // trim the string and validate it has length
  const trimmed = numberToCheck.trim();
  const trimmedLength = trimmed.length;

  if (trimmedLength === 0) {
    return false;
  }

  // parse the string to an int and validate it's a number
  let cardNum = parseInt(trimmed, 10);
  if (!isANumber(cardNum)) {
    return false;
  }

  let total = 0;
  let calc1: number;
  let calc2: number;

  // traverse through card digits
  // starting from  the most right
  for (let i = trimmedLength; i > 0; i--) {
    // right most digit
    calc1 = Math.floor(cardNum) % 10;
    total += calc1;

    // move the decimal
    cardNum = cardNum / 10;

    // the next right most digit
    calc1 = Math.floor(cardNum) % 10;
    calc2 = calc1 * 2;

    switch (calc2) {
      case 10:
        calc2 = 1;
        break;
      case 12:
        calc2 = 3;
        break;
      case 14:
        calc2 = 5;
        break;
      case 16:
        calc2 = 7;
        break;
      case 18:
        calc2 = 9;
        break;
    }

    // move decimal
    cardNum = cardNum / 10;

    total += calc2;
    i--;
  }

  // return a boolean
  return total % 10 === 0;
};
