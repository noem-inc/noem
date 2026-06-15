import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  type KeyboardLayout,
  type KeyboardTemplateName,
  keyboardTemplates,
  type ResolvedKey,
  type ResolvedLayout,
  resolveLayout,
  type ShiftState,
  templateForField,
} from '../../layouts/index.js';
import {
  ENTER_NEXT_LABEL,
  SHIFT_LOCKED_LABEL,
  SHIFT_SINGLE_LABEL,
} from '../../layouts/templates/shared.js';
import {
  applyEnter,
  clearAll,
  deleteBackward,
  findNextField,
  insertText,
  type KeyboardTarget,
  resolveTarget,
} from './target-controller.js';

const REPEAT_DELAY_MS = 500;
const REPEAT_INTERVAL_MS = 60;

export interface NoemKeyPressDetail {
  /**
   * The resolved key that was pressed.
   */
  key: ResolvedKey;
  /**
   * Name of the layer the key was pressed on.
   */
  layer: string;
  shiftState: ShiftState;
}

export interface NoemLayerChangeDetail {
  /**
   * Name of the layer now rendered.
   */
  layer: string;
  shiftState: ShiftState;
}

/**
 * Configurable virtual keyboard for touch kiosks and desktops.
 *
 * Renders a named layout template (`normal-keyboard`, `telephone`) or a
 * custom `layout` object. Every tap emits `noemKeyPress`; when a `target`
 * input/textarea is provided the keyboard also edits its value and
 * dispatches native `input` events.
 *
 * @csspart keyboard - The keyboard container.
 * @csspart row - A row of keys.
 * @csspart key - Every key button.
 * @csspart key-char - Character keys (also key-space, key-backspace,
 * key-enter, key-shift, key-layer, key-custom for the other actions).
 * @csspart key-locked - The shift key while caps lock is engaged.
 *
 * @fires noemKeyPress - Every key tap, before the target is updated.
 * Cancelable: `preventDefault()` skips the target mutation.
 * @fires noemEnter - The enter key was tapped.
 * @fires noemLayerChange - The rendered layer changed (layer switch or
 * shift).
 */
@customElement('noem-virtual-keyboard')
export class NoemVirtualKeyboard extends LitElement {
  /**
   * Template name to use. Ignored when the `layout` property is passed.
   *
   * When unset the keyboard derives the template from the `target` field's
   * `inputmode` / `type` (e.g. `type="tel"` → telephone keypad), falling back
   * to `normal-keyboard`. Setting this explicitly overrides that detection; a
   * per-field `data-keyboard-template` attribute overrides it in turn.
   */
  @property() template?: KeyboardTemplateName;

  /**
   * Full KeyboardLayout to use, must define entire layout.
   */
  @property({ attribute: false }) layout?: KeyboardLayout;

  /**
   * Input or textarea the keyboard types into: an element reference or a
   * document-level CSS selector. Without it the keyboard only emits
   * events.
   *
   * When Enter advances to the next form field (see `pressKey` enter
   * handling), this property is updated to that field so the keyboard
   * keeps typing where the focus went.
   */
  @property() target?: KeyboardTarget | string;

  /**
   * Disables all keys.
   */
  @property({ type: Boolean, reflect: true }) disabled = false;

  /**
   * Global kiosk mode: a CSS selector for inputs/textareas this keyboard
   * should serve. When set, the keyboard docks (see the `:host([auto-attach])`
   * styles), follows focus to any matching field document-wide, and shows /
   * hides itself as those fields gain and lose focus. Each focused field
   * selects its template from its own `inputmode` / `type` (or an explicit
   * `data-keyboard-template` attribute); see `template`.
   *
   * Leave unset for the embedded one-keyboard-per-input pattern, which keeps
   * its in-flow layout and stays always visible.
   */
  @property({ attribute: 'auto-attach', reflect: true }) autoAttach?: string;

  /**
   * Whether the docked keyboard is shown. Only meaningful in `auto-attach`
   * mode, where it is toggled by focus; reflected so consumers can drive the
   * docking animation from CSS.
   */
  @property({ type: Boolean, reflect: true }) open = false;

  /**
   * In `auto-attach` mode, keep the focused field clear of the docked
   * keyboard. Does nothing unless the dock actually overlaps the field; when
   * it does, scrolls the field up by the overlap, adding `<body>` padding only
   * if the page cannot otherwise scroll far enough — so pages that already fit
   * never gain a scrollbar. Set to `false` to opt out (e.g. if the kiosk page
   * manages its own layout). The clearance above the dock (px) is tunable with
   * `--noem-vk-keep-visible-gap` (default 8).
   */
  @property({ type: Boolean, attribute: 'keep-visible' }) keepVisible = true;

  @state() private resolvedLayout!: ResolvedLayout;
  @state() private activeLayer!: string;
  @state() private shiftState: ShiftState = 'off';

  // private lastShiftTapAt = 0;
  private repeatTimeout?: ReturnType<typeof setTimeout>;
  private repeatInterval?: ReturnType<typeof setInterval>;
  /** Restores page scroll space reserved for the open dock, or undefined. */
  private releaseSpace?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('focusout', this.handleFocusOut);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearRepeat();
    this.releaseSpace?.();
    document.removeEventListener('focusin', this.handleFocusIn);
    document.removeEventListener('focusout', this.handleFocusOut);
  }

  /** Whether `el` is an input this keyboard's `auto-attach` selector serves. */
  private servesField(el: Element | null): el is KeyboardTarget {
    if (!this.autoAttach || !el) {
      return false;
    }
    try {
      return el.matches(this.autoAttach);
    } catch {
      // Invalid selector: serve nothing rather than throw on every focus.
      return false;
    }
  }

  /**
   * Follow the user's focus to the field the keyboard should serve.
   *
   * In `auto-attach` (kiosk) mode the keyboard adopts and shows itself for
   * any matching field document-wide. Otherwise it stays within the current
   * target's form, so the embedded pattern keeps typing where focus went.
   */
  private handleFocusIn = (event: FocusEvent): void => {
    const focused = resolveTarget(event.target as KeyboardTarget);
    if (!focused) {
      return;
    }

    if (this.autoAttach) {
      if (this.servesField(focused)) {
        this.attachTo(focused);
      }
      return;
    }

    const current = resolveTarget(this.target);
    if (current && focused.form && focused.form === current.form) {
      this.target = focused;
    }
  };

  /**
   * Hide the docked keyboard when focus leaves a served field for something
   * that is neither the keyboard itself nor another served field. Tapping a
   * key never blurs the input (pointerdown is prevented), so typing keeps the
   * keyboard open.
   */
  private handleFocusOut = (event: FocusEvent): void => {
    if (!this.autoAttach || !this.open) {
      return;
    }

    const next = event.relatedTarget as Element | null;
    if (next && (next === this || this.contains(next))) {
      return;
    }
    if (this.servesField(next)) {
      return;
    }
    this.open = false;
  };

  /** Adopt a field as the target and show. The template follows from the
   * field itself (see `effectiveTemplate`), so no per-field bookkeeping. */
  private attachTo(el: KeyboardTarget): void {
    this.target = el;
    this.open = true;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (
      changed.has('layout') ||
      changed.has('template') ||
      changed.has('target') ||
      !this.resolvedLayout
    ) {
      this.computeLayout();
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!this.keepVisible || !this.autoAttach) {
      return;
    }
    // Render is done, so the dock now has its final height; keep the focused
    // field clear of it (re-runs when focus moves between fields, since
    // `target` changes too).
    if (changed.has('open') || changed.has('target')) {
      if (this.open) {
        this.keepTargetClear();
      } else {
        this.releaseSpace?.();
        this.releaseSpace = undefined;
      }
    }
  }

  /**
   * Keep the focused field clear of the dock, doing nothing unless the dock
   * actually overlaps it. When it does, scroll the field up by just the
   * overlap; only when the page cannot scroll that far (field near the very
   * bottom) reserve the missing space as `<body>` padding, so pages that
   * already fit never gain a scrollbar.
   */
  private keepTargetClear(): void {
    const el = resolveTarget(this.target);
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return;
    }

    const extra =
      Number.parseFloat(
        getComputedStyle(this).getPropertyValue('--noem-vk-keep-visible-gap'),
      ) || 8;
    const dockTop = window.innerHeight - this.offsetHeight - extra;
    const overlap = el.getBoundingClientRect().bottom - dockTop;
    if (overlap <= 0) {
      // Field already above the dock: undo any space reserved for a prior one.
      this.releaseSpace?.();
      this.releaseSpace = undefined;
      return;
    }

    const root =
      (document.scrollingElement as HTMLElement | null) ??
      document.documentElement;
    // How much further the page can already scroll down before padding.
    const room = root.scrollHeight - root.clientHeight - root.scrollTop;
    const deficit = overlap - room;
    if (deficit > 0) {
      if (!this.releaseSpace) {
        const prev = document.body.style.paddingBottom;
        this.releaseSpace = () => {
          document.body.style.paddingBottom = prev;
        };
      }
      document.body.style.paddingBottom = `${Math.ceil(deficit)}px`;
    }

    root.scrollBy?.({ top: overlap, behavior: 'smooth' });
  }

  /**
   * The template actually rendered, in precedence order:
   * 1. a field's `data-keyboard-template` (per-field author override),
   * 2. the explicit `template` property,
   * 3. the target field's `inputmode` / `type` (e.g. `tel` → telephone),
   * 4. `normal-keyboard`.
   */
  private get effectiveTemplate(): KeyboardTemplateName {
    const field = resolveTarget(this.target);
    const override = field?.dataset.keyboardTemplate as
      | KeyboardTemplateName
      | undefined;
    return (
      override ??
      this.template ??
      (field ? templateForField(field) : undefined) ??
      'normal-keyboard'
    );
  }

  private computeLayout(): void {
    const template = this.effectiveTemplate;
    const layout = this.layout ?? keyboardTemplates[template];
    if (!layout) {
      throw new Error(
        `Unknown virtual keyboard template "${template}" (available: ` +
          `${Object.keys(keyboardTemplates).join(', ')})`,
      );
    }
    this.resolvedLayout = resolveLayout(layout);
    this.activeLayer = this.resolvedLayout.defaultLayer;
    this.shiftState = 'off';
  }

  private get renderedLayerName(): string {
    const { defaultLayer, layers } = this.resolvedLayout;
    const shifted =
      this.shiftState !== 'off' &&
      this.activeLayer === defaultLayer &&
      layers.shift;
    return shifted ? 'shift' : this.activeLayer;
  }

  private emit<T>(type: string, detail: T, cancelable = false): CustomEvent<T> {
    const event = new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
      cancelable,
    });
    this.dispatchEvent(event);
    return event;
  }

  private pressKey(key: ResolvedKey): void {
    if (this.disabled) {
      return;
    }

    const detail: NoemKeyPressDetail = {
      key,
      layer: this.renderedLayerName,
      shiftState: this.shiftState,
    };
    const event = this.emit('noemKeyPress', detail, true);

    if (key.action === 'shift') {
      this.handleShift();
      return;
    }
    if (key.action === 'layer') {
      this.switchLayer(key.layer);
      return;
    }

    const target = resolveTarget(this.target);
    if (target && !event.defaultPrevented) {
      switch (key.action) {
        case 'char':
          insertText(target, key.value);
          break;
        case 'space':
          insertText(target, key.value || ' ');
          break;
        case 'backspace':
          deleteBackward(target);
          break;
        case 'clear':
          clearAll(target);
          break;
        case 'enter':
          this.handleEnterTarget(target);
          break;
      }
    }

    if (key.action === 'enter') {
      this.emit('noemEnter', detail);
    }

    if (
      this.shiftState === 'single' &&
      (key.action === 'char' || key.action === 'space')
    ) {
      this.shiftState = 'off';
      this.emitLayerChange();
    }
  }

  /**
   * Phone-style Enter: textareas get a line break; inputs inside a form
   * advance to the next editable field (retargeting the keyboard) or
   * submit via `requestSubmit()` (validation + cancelable submit event)
   * when on the last field. Inputs without a form just get `change`.
   */
  private handleEnterTarget(target: KeyboardTarget): void {
    if (target.tagName === 'TEXTAREA' || !target.form) {
      applyEnter(target);
      return;
    }

    // A real Enter implies leaving the field; programmatic value edits
    // never mark it dirty, so dispatch the change a blur would produce.
    target.dispatchEvent(
      new Event('change', {
        bubbles: true,
      }),
    );

    const next = findNextField(target);
    if (next) {
      next.focus();
      this.target = next;
    } else {
      target.form.requestSubmit();
    }
  }

  private handleShift(): void {
    if (this.shiftState === 'off') {
      this.shiftState = 'single';
      // this.lastShiftTapAt = now;
    } else if (
      this.shiftState === 'single'
      // now - this.lastShiftTapAt <= SHIFT_DOUBLE_TAP_MS
    ) {
      this.shiftState = 'locked';
    } else {
      this.shiftState = 'off';
    }
    this.emitLayerChange();
  }

  private switchLayer(layer: string | undefined): void {
    if (!layer) {
      return;
    }
    this.activeLayer = layer;
    this.shiftState = 'off';
    this.emitLayerChange();
  }

  private emitLayerChange(): void {
    this.emit<NoemLayerChangeDetail>('noemLayerChange', {
      layer: this.renderedLayerName,
      shiftState: this.shiftState,
    });
  }

  private keyFromEvent(event: Event): ResolvedKey | undefined {
    let el = event.target as HTMLElement | null;
    while (el && !(el.tagName === 'BUTTON' && el.hasAttribute('data-row'))) {
      el = el.parentElement;
    }
    if (!el) {
      return undefined;
    }
    const row = Number(el.getAttribute('data-row'));
    const col = Number(el.getAttribute('data-col'));
    return this.resolvedLayout.layers[this.renderedLayerName]?.[row]?.[col];
  }

  private handlePointerDown(event: Event): void {
    // Keep focus (and the caret) on the target input while keys are
    // tapped.
    event.preventDefault();
    const key = this.keyFromEvent(event);
    if (!key) {
      return;
    }
    this.pressKey(key);
    if (key.action === 'backspace') {
      this.startRepeat(key);
    }
  }

  private handleClick(event: Event): void {
    // detail === 0 means a synthetic click from Enter/Space on a focused
    // button (keyboard accessibility); pointer taps are handled on
    // pointerdown.
    if ((event as MouseEvent).detail !== 0) {
      return;
    }
    const key = this.keyFromEvent(event);
    if (key) {
      this.pressKey(key);
    }
  }

  private startRepeat(key: ResolvedKey): void {
    this.clearRepeat();
    this.repeatTimeout = setTimeout(() => {
      this.repeatInterval = setInterval(
        () => this.pressKey(key),
        REPEAT_INTERVAL_MS,
      );
    }, REPEAT_DELAY_MS);
  }

  private clearRepeat(): void {
    clearTimeout(this.repeatTimeout);
    clearInterval(this.repeatInterval);
  }

  /**
   * Whether the enter key currently advances to a next form field
   * instead of submitting.
   */
  private get enterAdvances(): boolean {
    const target = resolveTarget(this.target);
    if (target?.tagName !== 'INPUT') {
      return false;
    }

    return findNextField(target) !== null;
  }

  private renderKey(
    key: ResolvedKey,
    row: number,
    col: number,
    enterAdvances: boolean,
  ) {
    const isAction = key.action !== 'char';
    const shiftEngaged = key.action === 'shift' && this.shiftState !== 'off';
    const ariaPressed =
      key.action === 'shift' ? (shiftEngaged ? 'true' : 'false') : undefined;
    const parts = ['key', `key-${key.action}`];

    if (isAction) {
      parts.push('key--action');
    }

    if (shiftEngaged) {
      parts.push('isActive');

      if (this.shiftState === 'locked') {
        parts.push('key-locked');
      }
    }

    let keyLabel = key.label;
    let keyAriaLabel = key.ariaLabel ?? key.label;
    if (key.action === 'shift') {
      if (this.shiftState === 'locked') {
        keyLabel = SHIFT_LOCKED_LABEL;
      } else if (this.shiftState === 'single') {
        keyLabel = SHIFT_SINGLE_LABEL;
      }
    } else if (key.action === 'enter' && enterAdvances) {
      keyLabel = ENTER_NEXT_LABEL;
      keyAriaLabel = 'Next';
    }

    return html`
      <button
        type="button"
        class=${classMap({
          key: true,
          'key--action': isAction,
          isActive: shiftEngaged,
        })}
        part=${parts.join(' ')}
        style=${styleMap({
          flexGrow: String(key.width),
        })}
        ?disabled=${this.disabled}
        aria-label=${keyAriaLabel}
        aria-pressed=${ifDefined(ariaPressed)}
        data-row=${row}
        data-col=${col}
      >
        ${keyLabel}
      </button>
    `;
  }

  protected override render() {
    const rows = this.resolvedLayout.layers[this.renderedLayerName] ?? [];
    const enterAdvances = this.enterAdvances;
    /* eslint-disable lit-a11y/click-events-have-key-events --
     * The @click on the fieldset only delegates synthetic clicks (detail === 0)
     * from the native <button> keys, which handle Enter/Space themselves. */
    return html`
      <fieldset
        class="keyboard"
        part="keyboard"
        aria-label="Virtual keyboard"
        ?disabled=${this.disabled}
        @pointerdown=${this.handlePointerDown}
        @pointerup=${this.clearRepeat}
        @pointerout=${this.clearRepeat}
        @pointercancel=${this.clearRepeat}
        @click=${this.handleClick}
      >
        ${rows.map(
          (row, rowIndex) => html`
            <div class="row" part="row">
              ${row.map((key, colIndex) =>
                this.renderKey(key, rowIndex, colIndex, enterAdvances),
              )}
            </div>
          `,
        )}
      </fieldset>
    `;
    /* eslint-enable lit-a11y/click-events-have-key-events */
  }

  /**
   * @cssprop --noem-vk-bg - Background of the keyboard container.
   * @cssprop --noem-vk-gap - Gap between keys and rows.
   * @cssprop --noem-vk-padding - Padding of the keyboard container.
   * @cssprop --noem-vk-radius - Border radius of the keyboard container.
   * @cssprop --noem-vk-key-bg - Background of character keys.
   * @cssprop --noem-vk-key-bg-active - Background of a pressed or engaged key.
   * @cssprop --noem-vk-key-color - Text color of character keys.
   * @cssprop --noem-vk-key-radius - Border radius of keys.
   * @cssprop --noem-vk-key-shadow - Box shadow of keys.
   * @cssprop --noem-vk-key-height - Minimum key height (touch target).
   * @cssprop --noem-vk-key-font-size - Font size of key labels.
   * @cssprop --noem-vk-action-key-bg - Background of action keys (shift,
   * enter, backspace, layer switches).
   * @cssprop --noem-vk-action-key-color - Text color of action keys.
   */
  static override styles = css`
    :host {
      display: block;
      touch-action: manipulation;
      user-select: none;
      font-family: inherit;
    }

    :host([disabled]) {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Kiosk dock: only when auto-attach is set, so the embedded
       (one-per-input) pattern keeps its in-flow layout. */
    :host([auto-attach]) {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      /* Cap width and center so the keys don't stretch on large screens.
         margin-inline:auto centers within the left:0/right:0 span. */
      max-width: var(--noem-vk-dock-max-width, 48rem);
      margin-inline: auto;
      z-index: var(--noem-vk-z-index, 1000);
      transform: translateY(100%);
      transition: var(--noem-vk-dock-transition, transform 0.2s ease);
      box-shadow: var(--noem-vk-dock-shadow, 0 -2px 12px rgb(0 0 0 / 20%));
    }

    :host([auto-attach][open]) {
      transform: translateY(0);
    }

    :host([auto-attach]:not([open])) {
      pointer-events: none;
    }

    /* Square off the dock so it meets the screen edges flush. */
    :host([auto-attach]) .keyboard {
      border-radius: var(--noem-vk-dock-radius, 0);
    }

    .keyboard {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      /* reset fieldset defaults */
      border: none;
      margin: 0;
      min-width: 0;
      gap: var(--noem-vk-gap, 0.375rem);
      padding: var(--noem-vk-padding, 0.5rem);
      background: var(--noem-vk-bg, #e2e4e8);
      border-radius: var(--noem-vk-radius, 0.5rem);
    }

    .row {
      display: flex;
      gap: var(--noem-vk-gap, 0.375rem);
    }

    .key {
      /* flex-basis 0 so inline flex-grow (key width units) is proportional */
      flex: 1 1 0;
      min-width: 0;
      min-height: var(--noem-vk-key-height, 3rem);
      padding: 0 0.25rem;
      border: none;
      border-radius: var(--noem-vk-key-radius, 0.375rem);
      background: var(--noem-vk-key-bg, #ffffff);
      color: var(--noem-vk-key-color, #1c1e21);
      box-shadow: var(--noem-vk-key-shadow, 0 1px 0 rgb(0 0 0 / 25%));
      font-family: inherit;
      font-size: var(--noem-vk-key-font-size, 1.125rem);
      line-height: 1;
      cursor: pointer;
    }

    .key:active,
    .key.isActive {
      background: var(--noem-vk-key-bg-active, #cdd0d5);
    }

    .key--action {
      background: var(--noem-vk-action-key-bg, #b6bac1);
      color: var(--noem-vk-action-key-color, #1c1e21);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'noem-virtual-keyboard': NoemVirtualKeyboard;
  }
  interface HTMLElementEventMap {
    noemKeyPress: CustomEvent<NoemKeyPressDetail>;
    noemEnter: CustomEvent<NoemKeyPressDetail>;
    noemLayerChange: CustomEvent<NoemLayerChangeDetail>;
  }
}
