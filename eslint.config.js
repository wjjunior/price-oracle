import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/*.tsbuildinfo',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/aggregator/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: 'apps/aggregator/src/domain', from: 'apps/aggregator/src/application' },
            { target: 'apps/aggregator/src/domain', from: 'apps/aggregator/src/infrastructure' },
            { target: 'apps/aggregator/src/domain', from: 'apps/aggregator/src/interface' },
            {
              target: 'apps/aggregator/src/application',
              from: 'apps/aggregator/src/infrastructure',
            },
            { target: 'apps/aggregator/src/application', from: 'apps/aggregator/src/interface' },
            { target: 'apps/aggregator/src/infrastructure', from: 'apps/aggregator/src/interface' },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/dashboard/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      boundaries,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      'import/resolver': {
        typescript: { project: 'frontend/dashboard/tsconfig.json' },
      },
      'boundaries/elements': [
        { type: 'app', mode: 'folder', pattern: 'frontend/dashboard/src/app' },
        {
          type: 'pages',
          mode: 'folder',
          pattern: 'frontend/dashboard/src/pages/*',
          capture: ['slice'],
        },
        {
          type: 'widgets',
          mode: 'folder',
          pattern: 'frontend/dashboard/src/widgets/*',
          capture: ['slice'],
        },
        {
          type: 'features',
          mode: 'folder',
          pattern: 'frontend/dashboard/src/features/*',
          capture: ['slice'],
        },
        {
          type: 'entities',
          mode: 'folder',
          pattern: 'frontend/dashboard/src/entities/*',
          capture: ['slice'],
        },
        { type: 'shared', mode: 'folder', pattern: 'frontend/dashboard/src/shared' },
      ],
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'boundaries/no-unknown': 'off',
      'boundaries/no-unknown-files': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: ['app'], allow: ['app', 'pages', 'widgets', 'features', 'entities', 'shared'] },
            {
              from: ['pages'],
              allow: [
                ['pages', { slice: '${from.slice}' }],
                'widgets',
                'features',
                'entities',
                'shared',
              ],
            },
            {
              from: ['widgets'],
              allow: [['widgets', { slice: '${from.slice}' }], 'features', 'entities', 'shared'],
            },
            {
              from: ['features'],
              allow: [['features', { slice: '${from.slice}' }], 'entities', 'shared'],
            },
            {
              from: ['entities'],
              allow: [['entities', { slice: '${from.slice}' }], 'shared'],
            },
            { from: ['shared'], allow: ['shared'] },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/dashboard/src/shared/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  prettier,
);
