import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Hard rule: the engine is pure and deterministic.
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'crypto', 'util', 'child_process'],
              message: 'The engine must not use Node APIs.',
            },
            {
              group: ['react', 'react-*', 'maplibre-gl', 'pmtiles', 'idb-keyval', 'h3-js'],
              message: 'The engine must not depend on UI or map code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'navigator',
          'process',
          'setTimeout',
          'setInterval',
          'fetch',
          'performance',
          'crypto',
        ].map((name) => ({ name, message: 'The engine must be pure.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must be deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine must be deterministic.',
        },
      ],
    },
  },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
