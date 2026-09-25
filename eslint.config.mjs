// Shared ESLint flat config for the whole monorepo (ESLint 10).
// .mjs because the root package.json is CommonJS (no "type": "module").
// Run from the repo root: `npm run lint`.
//
// Philosophy: this codebase was never linted before, so only rules that find
// real bugs are errors (everything in js.configs.recommended, plus
// react-hooks/rules-of-hooks). Noisy style / dead-code rules are warnings so
// they are visible without blocking CI.
//
// Note: ESLint 10's scope analysis understands JSX natively, so `no-undef`
// catches undefined components and `no-unused-vars` counts JSX usage without
// needing eslint-plugin-react.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const noisyAsWarnings = {
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': 'warn',
  // Flags dead initial values like `let x = null` that are always overwritten
  // before use; harmless, so a warning rather than an error.
  'no-useless-assignment': 'warn',
}

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/android/**',
      '**/public/**',
    ],
  },

  // React frontends (Vite, ESM, React 18 automatic JSX runtime)
  {
    files: ['frontend-*/src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...noisyAsWarnings,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Express backend (CommonJS, Node)
  {
    files: ['backend/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...noisyAsWarnings,
    },
  },
]
