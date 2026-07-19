import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        document: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        KeyboardEvent: 'readonly',
        React: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Allow intentionally-unused vars/params/caught-errors prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Design tokens: warn on raw Tailwind palette / arbitrary-hex colors in className.
  // Semantic tokens (bg-surface, text-text-muted, …) live in src/index.css.
  // viz components excluded — chart series legitimately need raw hex.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/viz/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|[\\s:])(bg|text|border|ring|divide|from|via|to|fill|stroke|outline|accent|caret|decoration|placeholder|shadow)-(white|black|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3})([\\s\\/]|$)/]",
          message:
            'Raw Tailwind color class. Use semantic tokens from src/index.css (bg-surface, text-text-muted, border-border, …).',
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            'Arbitrary hex color in className. Use semantic tokens from src/index.css; raw hex belongs only in index.css and chart fill props.',
        },
      ],
    },
  },
);
