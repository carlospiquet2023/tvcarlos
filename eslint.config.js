import eslint from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            'site/vendor/**',
            '.artifacts/**',
            'playwright-report/**',
            'test-results/**',
        ],
    },
    eslint.configs.recommended,
    {
        files: ['site/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser,
        },
        rules: {
            eqeqeq: 'error',
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
    {
        files: ['qa/**/*.js', 'playwright.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            eqeqeq: 'error',
            'no-console': 'off',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
];
