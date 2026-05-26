# @noem/luhn

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@noem/luhn.svg)](https://www.npmjs.com/package/@noem/luhn)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Luhn algorithm validation for card / SIN numbers. ESM-only.

## Install

```bash
pnpm add @noem/luhn
```

## Usage

```ts
import { isLuhnValid } from "@noem/luhn";

isLuhnValid("79927398713"); // true
isLuhnValid(79927398713); // true
isLuhnValid("79927398714"); // false
```

## Notes

Validation operates on the numeric value of the input, so reliability is bound to
`Number.MAX_SAFE_INTEGER` (~16 digits) and leading zeros are not significant.
