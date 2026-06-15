import type {
  KeyboardKeyInput,
  KeyboardLayout,
  ResolvedKey,
  ResolvedLayout,
} from './types.js';

const resolveKey = (key: KeyboardKeyInput): ResolvedKey => {
  if (typeof key === 'string') {
    return { value: key, label: key, action: 'char', width: 1 };
  }

  const value = key.value ?? '';
  return {
    value,
    label: key.label ?? value,
    action: key.action ?? 'char',
    width: key.width ?? 1,
    layer: key.layer,
    ariaLabel: key.ariaLabel,
  };
};

/**
 * Normalizes a layout: expands string shorthands, applies defaults and
 * validates layer references. Throws on invalid layouts.
 */
export const resolveLayout = (layout: KeyboardLayout): ResolvedLayout => {
  const defaultLayer = layout.defaultLayer ?? 'default';
  const layerNames = Object.keys(layout.layers);

  if (!layerNames.includes(defaultLayer)) {
    throw new Error(
      `Virtual keyboard layout has no layer named "${defaultLayer}" ` +
        `(available layers: ${layerNames.join(', ') || 'none'})`,
    );
  }

  const layers: Record<string, ResolvedKey[][]> = {};
  for (const [name, rows] of Object.entries(layout.layers)) {
    layers[name] = rows.map((row) => row.map(resolveKey));
  }

  for (const [name, rows] of Object.entries(layers)) {
    for (const row of rows) {
      for (const key of row) {
        if (key.action === 'layer' && !key.layer) {
          throw new Error(
            `Virtual keyboard key "${key.label}" in layer "${name}" has ` +
              `action "layer" but no target layer`,
          );
        }
        if (key.layer && !layerNames.includes(key.layer)) {
          throw new Error(
            `Virtual keyboard key "${key.label}" in layer "${name}" ` +
              `references unknown layer "${key.layer}"`,
          );
        }
      }
    }
  }

  return { defaultLayer, layers };
};
