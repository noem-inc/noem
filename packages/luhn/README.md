# @noem/luhn

[![Release](https://github.com/noem-inc/noem/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/noem-inc/noem/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@noem/luhn.svg)](https://www.npmjs.com/package/@noem/luhn)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Luhn algorithm validation for card / SIN numbers.

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

### With valibot

Luhn is a checksum algorithm, so valibot hosts it as a `check` action you can
compose into any string pipe. Use the ready-made `LuhnSchema`
to build your own.

```ts
import * as v from "valibot";
import { LuhnSchema } from "@noem/luhn";

v.parse(LuhnSchema, "4532015112830366"); // "4532015112830366"
v.safeParse(LuhnSchema, "79927398714").success; // false
```

## Notes

Validation runs over the input's digit characters, so it stays exact for PANs
longer than `Number.MAX_SAFE_INTEGER` (17–19 digit cards) and preserves leading
zeros. Pass card numbers as **strings** to avoid precision loss; numeric input
is supported for back-compat but is limited by JavaScript number precision.
