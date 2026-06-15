# @noem/virtual-keyboard

Configurable virtual keyboard web component (`<noem-virtual-keyboard>`) for
touch kiosk and desktop machines, built with [Lit](https://lit.dev). ESM-only.

- Ten built-in layout templates (see [Templates](#templates)).
- Fully custom layouts via the `layout` property.
- Events-first API; optionally drives an `<input>`/`<textarea>` directly via
  the `target` prop (text insertion at the caret, backspace with key repeat,
  native `input` events so frameworks pick up changes).
- Themeable through CSS custom properties and `::part()`.

A machine-readable API description ships as `custom-elements.json`
(custom-elements manifest), consumed by IDE tooling like
[lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin).

## Usage

Importing the component subpath registers the custom element:

```ts
import '@noem/virtual-keyboard/noem-virtual-keyboard';
```

```html
<input id="kiosk-input" />
<noem-virtual-keyboard target="#kiosk-input"></noem-virtual-keyboard>

<noem-virtual-keyboard template="telephone"></noem-virtual-keyboard>
```

The package root is side-effect free — importing types, layouts or templates
from it never registers the element:

```ts
import type { KeyboardLayout, NoemKeyPressDetail } from '@noem/virtual-keyboard';
import { keyboardTemplates, resolveLayout } from '@noem/virtual-keyboard';
```

### Enter behavior (phone-style)

With a `target` set, the enter key behaves like a mobile keyboard:

- **textarea**: inserts a line break.
- **input inside a `<form>`**: dispatches `change`, then focuses the next
  editable field (the key shows `→` / "Next" and the keyboard retargets
  itself to that field) — or calls `form.requestSubmit()` when on the last
  field (runs validation and the cancelable `submit` event, like a real
  Enter).
- **input without a form**: dispatches `change` only.

`noemEnter` is emitted in every case. Calling `preventDefault()` on
`noemKeyPress` skips all of the above for that tap.

### Kiosk mode (one global docked keyboard)

For touch kiosks, place a single keyboard and give it an `auto-attach` CSS
selector instead of a `target`. It docks to the bottom of the viewport
(`position: fixed`), follows focus to any matching field document-wide, and
slides in/out as those fields gain and lose focus:

```html
<input class="kiosk-field" placeholder="Name" />
<input
  class="kiosk-field"
  data-keyboard-template="telephone"
  placeholder="Phone"
/>

<!-- placed once, anywhere -->
<noem-virtual-keyboard auto-attach=".kiosk-field"></noem-virtual-keyboard>
```

- A focused field may override the layout with `data-keyboard-template`.
- The docked styles (`position: fixed`, slide animation, shadow) apply **only**
  in `auto-attach` mode, so the embedded one-keyboard-per-input pattern above is
  unaffected. Tune them with `--noem-vk-z-index`, `--noem-vk-dock-transition`,
  `--noem-vk-dock-shadow`, `--noem-vk-dock-radius`, and
  `--noem-vk-dock-max-width` (default `48rem`) — the dock is capped and centered
  so keys don't stretch on large screens.
- The `open` attribute is reflected while shown — drive your own animation off
  `:host([open])` / `noem-virtual-keyboard[open]` if you prefer.
- **Fields stay visible.** If the dock would cover the focused field, the
  keyboard scrolls it up by just the overlap, adding `<body>` padding only when
  the page can't otherwise scroll far enough — so pages that already fit never
  gain a scrollbar, and fields already above the dock are left untouched. Tune
  the clearance with `--noem-vk-keep-visible-gap` (px, default `8`), or set
  `keep-visible` to `false` (property `keepVisible`) to manage layout yourself.

## Templates

Set via the `template` attribute/property:

| Template | Keys | Use case |
| --- | --- | --- |
| `normal-keyboard` | QWERTY + shift + symbols layers | General text |
| `compact` | QWERTY + shift, `'` `-`, no symbols layer | Name entry |
| `email` | QWERTY + `@` `.` `.com`, no space key | Email addresses |
| `url` | QWERTY + `/` `.` `.com`, no space key | URLs |
| `telephone` | 1-9, `*` `0` `#`, backspace | Phone numbers |
| `numeric` | digits, `.`, backspace, enter | Amounts, quantities |
| `pin` | digits, `C` (clear), backspace, enter | PIN codes |
| `currency` | digits, `.` `00` `$`, backspace, enter | POS amounts |
| `date` | digits, `/` `-`, backspace, enter | Dates |
| `hex` | 0-9 A-F, `:` `-`, backspace, enter | MAC/serial entry |

Notes:

- `pin`'s `C` key is `action: 'custom'` (`value: 'clear'`) — the component
  never mutates the target for custom keys; clear the field yourself in a
  `noemKeyPress` listener.
- `currency` defaults to `$`. Other currencies:
  `kb.layout = createCurrencyLayout('€')`.
- Layout objects (`emailLayout`, `telephoneLayout`, ...), the
  `keyboardTemplates` registry and the row/key helpers used to build them
  (`letterBlock`, `shiftKey`, `enterKey`, ...) are all exported for
  composing your own layouts.

## Events

```ts
const keyboard = document.querySelector('noem-virtual-keyboard');

keyboard.addEventListener('noemKeyPress', (event) => {
  // event.detail: { key, layer, shiftState }
  // event.preventDefault() skips the target mutation for this tap.
});
keyboard.addEventListener('noemEnter', () => submitForm());
keyboard.addEventListener('noemLayerChange', (event) => {
  console.log(event.detail.layer, event.detail.shiftState);
});
```

## Custom layouts

A layout is a set of named layers, each a list of rows. Keys are either a
string shorthand (`'a'` inserts `a`) or an object:

```ts
import type { KeyboardLayout } from '@noem/virtual-keyboard';

const pinPad: KeyboardLayout = {
  layers: {
    default: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [
        { label: 'C', value: 'clear', action: 'custom' },
        '0',
        { label: '⌫', action: 'backspace', ariaLabel: 'Backspace' },
      ],
    ],
  },
};

document.querySelector('noem-virtual-keyboard').layout = pinPad;
```

Key options: `value`, `label`, `action` (`char` | `space` | `backspace` |
`enter` | `shift` | `layer` | `custom`), `layer` (target layer for
`action: 'layer'`), `width` (flex units, default 1) and `ariaLabel`.

A layer named `shift` is rendered in place of the default layer while shift
is engaged (tap shift once for a single character, double-tap to lock).
`custom` keys only emit `noemKeyPress` — handle them in your app.

Templates are exported too (`normalKeyboardLayout`, `telephoneLayout`,
`keyboardTemplates`) if you want to extend one.

## Theming

```css
noem-virtual-keyboard {
  --noem-vk-bg: #1c1e21;
  --noem-vk-key-bg: #3a3d42;
  --noem-vk-key-color: #f5f6f7;
  --noem-vk-key-height: 4rem;
}

noem-virtual-keyboard::part(key-enter) {
  background: #2f6fed;
  color: white;
}
```

## Development

```sh
pnpm dev    # vite demo page with QWERTY, telephone and custom-layout examples
pnpm test   # unit tests (vitest + happy-dom)
pnpm build  # tsup dist + custom-elements.json manifest
pnpm lint   # biome + tsc + eslint (lit/wc/a11y) + prettier --check + lit-analyzer
```
