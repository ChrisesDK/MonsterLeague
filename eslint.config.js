import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Hard rule: the engine and the spawn rules are pure and deterministic (no Node, browser or
 * UI APIs, no clock, no Math.random). The spawn package may use h3-js, which is pure math.
 */
function purity(uiPackages) {
  return {
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'path', 'os', 'crypto', 'util', 'child_process', 'events', 'buffer'].map(
            (name) => ({ name, message: 'Pure packages must not use Node APIs.' }),
          ),
          patterns: [
            { group: ['node:*'], message: 'Pure packages must not use Node APIs.' },
            { group: uiPackages, message: 'Pure packages must not depend on UI or map code.' },
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
        ].map((name) => ({ name, message: 'Pure packages must not use runtime globals.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG (engine rng.ts).' },
        { object: 'Date', property: 'now', message: 'Pure packages must be deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Pure packages must be deterministic.',
        },
      ],
    },
  };
}

const UI = ['react', 'react-dom', 'react/*', 'maplibre-gl', 'pmtiles', 'idb-keyval'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.wrangler/**'] },
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
  { files: ['packages/engine/src/**/*.ts'], ...purity([...UI, 'h3-js']) },
  { files: ['packages/spawn/src/**/*.ts'], ...purity(UI) },
  { files: ['packages/game/src/**/*.ts'], ...purity(UI) },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
