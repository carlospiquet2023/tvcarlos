import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Providers intentionally colocate their hook with the provider. This is
      // the standard Context API shape and does not affect production bundles.
      'react-refresh/only-export-components': 'off',
      // This codebase loads remote data and resets route-scoped state from
      // effects. The compiler rule rejects those valid synchronization cases.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
