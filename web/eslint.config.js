import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import vitest from '@vitest/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // 7 pre-existing call sites (Admin.jsx, CarDetail.jsx, Cars.jsx) call
      // setState synchronously inside an effect — a real pattern worth
      // revisiting, but not something to hard-block CI over sight-unseen.
      // Keep it visible as a warning rather than silencing it outright.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // vitest.config.js sets test.globals: true, so describe/it/expect/vi/
    // beforeEach etc. are injected at runtime without an import — ESLint's
    // static analysis doesn't know that, so it needs these listed explicitly.
    files: ['**/__tests__/**', '**/*.test.{js,jsx}'],
    plugins: { vitest },
    languageOptions: {
      globals: globals.vitest,
    },
    rules: {
      // Every existing test file uses test(), never it() — a PR review once
      // caught a stray it() only because the reviewer happened to grep
      // sibling files for comparison. Make that mechanical instead.
      'vitest/consistent-test-it': ['error', { fn: 'test', withinDescribe: 'test' }],
    },
  },
])
