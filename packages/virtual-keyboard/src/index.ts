/**
 * @fileoverview Side-effect-free entry: types, layouts and templates.
 *
 * Importing this module does NOT register the custom element — import
 * `@noem/virtual-keyboard/noem-virtual-keyboard` for that.
 */

export type {
  NoemKeyPressDetail,
  NoemLayerChangeDetail,
  NoemVirtualKeyboard,
} from './components/noem-virtual-keyboard/noem-virtual-keyboard.js';
export * from './layouts/index.js';
