import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { createRequire } from 'node:module';

// Files that already had design-token violations when the ratchet went in
// (A6). They stay at `warn`; everywhere else the rules are `error`, so new
// drift fails the build. Shrink the list by fixing files — never grow it.
// `node scripts/update-design-debt.mjs` enforces that in CI.
const designDebt = createRequire(import.meta.url)('./eslint.design-debt.json').files;

const DESIGN_TOKEN_RULES = [
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
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Repo tooling runs under Node, not the browser. `npm run lint` is
  // `eslint .`, so these are linted too — the globals block above only
  // covers **/*.{ts,tsx} and left `process`/`console` undefined here.
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
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
  // Design tokens: forbid raw Tailwind palette / arbitrary-hex colors in className.
  // Semantic tokens (bg-surface, text-text-muted, …) live in src/index.css.
  // viz components excluded — chart series legitimately need raw hex.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/viz/**'],
    rules: {
      'no-restricted-syntax': ['error', ...DESIGN_TOKEN_RULES],
    },
  },
  // The debt side of the ratchet. These files pre-date the rule being
  // enforced; they stay visible as warnings so the count keeps shrinking,
  // without holding the build hostage to 1083 pre-existing violations.
  // The selectors are repeated deliberately — `'no-restricted-syntax': 'warn'`
  // with no options carries no restrictions at all and would silence them.
  {
    files: designDebt,
    rules: {
      'no-restricted-syntax': ['warn', ...DESIGN_TOKEN_RULES],
    },
  },
);
