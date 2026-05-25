# @noem/luhn

Luhn algorithm validation for card / SIN numbers. ESM-only.

## Install

```bash
pnpm add @noem/luhn
```

## Usage

```ts
import { isLuhnValid } from '@noem/luhn';

isLuhnValid('79927398713'); // true
isLuhnValid(79927398713); // true
isLuhnValid('79927398714'); // false
```

## Notes

Validation operates on the numeric value of the input, so reliability is bound to
`Number.MAX_SAFE_INTEGER` (~16 digits) and leading zeros are not significant.
