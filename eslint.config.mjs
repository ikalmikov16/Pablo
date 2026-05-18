// Flat ESLint config for the Pablo monorepo.
//
// We're deliberately minimal here: TypeScript is the primary correctness check
// (tsc --noEmit runs in every workspace), Prettier owns formatting, and ESLint
// catches a small set of correctness issues that TS can't.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default [
  // CommonJS config files (babel.config.js, etc.) need `module` in scope.
  {
    files: ['**/*.config.js', '**/*.config.cjs'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'ios/**',
      'android/**',
      '**/*.lockb',
      'bun.lock',
      'bun.lockb',
      'supabase/.branches/**',
      'supabase/.temp/**',
      // Generated / external types
      'apps/mobile/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser + Node + Bun + Deno globals we care about
        console: 'readonly',
        process: 'readonly',
        Bun: 'readonly',
        Deno: 'readonly',
      },
    },
    rules: {
      // Engine rule: no Math.random anywhere — randomness is injected.
      // Scoped tighter for packages/engine via the override below.
      'no-console': 'off',

      // TypeScript handles unused vars better than the JS rule.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // We use `!` and `as` deliberately in places where we've proven the
      // invariant by surrounding logic. Don't make these hard errors.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // We sometimes need `any` in test infrastructure / interop. Warn, don't fail.
      '@typescript-eslint/no-explicit-any': 'warn',

      // We want explicit return types for engine public functions, but TS
      // already enforces this for exported declarations via tsconfig in most
      // cases. Keep as a warning so it's not noisy.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  // Engine package: strict no-Math.random / no-Date.now per docs/AGENTS.md.
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Math.random', message: 'engine must use the seeded RNG (internal/rng.ts)' },
        { name: 'Date', message: 'engine must not depend on wall-clock time' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'engine must use the seeded RNG (internal/rng.ts)',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'engine must not depend on wall-clock time',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['expo', 'expo/*'], message: 'engine must not import from expo' },
            { group: ['react', 'react/*'], message: 'engine must not import from react' },
            {
              group: ['react-native', 'react-native/*'],
              message: 'engine must not import from react-native',
            },
            { group: ['@supabase/*'], message: 'engine must not import from supabase' },
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'engine must not import node built-ins',
            },
          ],
        },
      ],
    },
  },
  // Test files: relax some rules.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
