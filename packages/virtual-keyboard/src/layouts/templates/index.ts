import type { KeyboardLayout } from '../types.js';

import { compactLayout } from './compact.js';
import { currencyLayout } from './currency.js';
import { dateLayout } from './date.js';
import { emailLayout } from './email.js';
import { hexLayout } from './hex.js';
import { normalKeyboardLayout } from './normal-keyboard.js';
import { numericLayout } from './numeric.js';
import { pinLayout } from './pin.js';
import { telephoneLayout } from './telephone.js';
import { urlLayout } from './url.js';

export type KeyboardTemplateName =
  | 'normal-keyboard'
  | 'telephone'
  | 'numeric'
  | 'pin'
  | 'email'
  | 'url'
  | 'compact'
  | 'currency'
  | 'date'
  | 'hex';

export const keyboardTemplates: Record<KeyboardTemplateName, KeyboardLayout> = {
  'normal-keyboard': normalKeyboardLayout,
  telephone: telephoneLayout,
  numeric: numericLayout,
  pin: pinLayout,
  email: emailLayout,
  url: urlLayout,
  compact: compactLayout,
  currency: currencyLayout,
  date: dateLayout,
  hex: hexLayout,
};

export { createCurrencyLayout } from './currency.js';
export * from './shared.js';
export {
  compactLayout,
  currencyLayout,
  dateLayout,
  emailLayout,
  hexLayout,
  normalKeyboardLayout,
  numericLayout,
  pinLayout,
  telephoneLayout,
  urlLayout,
};
