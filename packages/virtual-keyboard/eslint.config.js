import tsParser from '@typescript-eslint/parser';
import litPlugin from 'eslint-plugin-lit';
import litA11yPlugin from 'eslint-plugin-lit-a11y';
import wcPlugin from 'eslint-plugin-wc';

// Biome owns generic TS linting; eslint exists solely for the lit/wc/a11y
// rules biome cannot see inside tagged templates.
export default [
  { ignores: ['dist/**', '.turbo/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      lit: litPlugin,
      wc: wcPlugin,
      'lit-a11y': litA11yPlugin,
    },
    rules: {
      ...litPlugin.configs.recommended.rules,
      ...wcPlugin.configs.recommended.rules,
      ...litA11yPlugin.configs.recommended.rules,
    },
  },
];
