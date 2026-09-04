import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

/**
 * ESLint 9 flat configuration for the Next.js application.
 *
 * eslint-config-next@15.5 still exposes the legacy `.eslintrc` shape and
 * loads `@rushstack/eslint-patch`, which is not compatible with the current
 * ESLint runtime. Compose the same core rules from the plugins' native flat
 * exports instead, keeping lint usable without a compatibility shim.
 */
export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'public/libreoffice-wasm/**',
      'public/pdfjs/**',
    ],
  },
  tsPlugin.configs['flat/base'],
  reactPlugin.configs.flat.recommended,
  reactHooksPlugin.configs['recommended-latest'],
  nextPlugin.flatConfig.coreWebVitals,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/no-unknown-property': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-assign-module-variable': 'warn',
    },
  },
];
