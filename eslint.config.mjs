import eslint from '@eslint/js';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import mantine from 'eslint-config-mantine';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import-x';
import playwright from 'eslint-plugin-playwright';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const typescriptFiles = ['**/*.{ts,tsx}'];
const nodeFiles = ['**/*.{js,mjs}', 'scripts/**/*.{js,mjs}'];

const localRules = {
  rules: {
    'no-playwright-page-methods': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Forbid direct usage of page.goto() and page.reload() in Playwright tests',
        },
        schema: [],
        messages: {
          noPageGoto:
            'Direct usage of page.goto() is forbidden. The app is automatically opened in our custom page fixture. Use page.goto() only if you need to navigate to a different URL, otherwise remove this call.',
          noPageReload:
            'Direct usage of page.reload() is forbidden. Use reloadPage() from the page fixture instead.',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type !== 'MemberExpression' ||
              node.callee.object.type !== 'Identifier' ||
              node.callee.object.name !== 'page' ||
              node.callee.property.type !== 'Identifier'
            ) {
              return;
            }

            if (node.callee.property.name === 'goto') {
              context.report({ node, messageId: 'noPageGoto' });
            } else if (node.callee.property.name === 'reload') {
              context.report({ node, messageId: 'noPageReload' });
            }
          },
        };
      },
    },
  },
};

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    ignores: [
      '**/*.cjs',
      '**/*.d.ts',
      '**/*.d.mts',
      'blob-report/**',
      'coverage/**',
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      'tests/test-tmp/**',
    ],
  },
  ...mantine.map((config) => ({ ...config, files: typescriptFiles })),
  {
    ...react.configs.flat.recommended,
    files: typescriptFiles,
  },
  ...tanstackQuery.configs['flat/recommended'].map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'arrow-body-style': 'off',
      'no-duplicate-imports': 'off',
      'no-param-reassign': 'off',
      'prefer-object-has-own': 'off',
      'consistent-return': 'off',
      'generator-star-spacing': 'off',
      'import/extensions': 'off',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'no-alert': 'warn',
      'no-console': ['error', { allow: ['warn', 'error', 'group', 'groupEnd'] }],
      'no-constant-condition': 'warn',
      'no-continue': 'off',
      'no-eval': 'error',
      'no-promise-executor-return': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/self-closing-comp': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'warn',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/integration/**/*.ts'],
    plugins: {
      ...playwright.configs['flat/recommended'].plugins,
      'local-rules': localRules,
    },
    settings: {
      playwright: {
        globalAliases: {
          test: ['baseTest'],
        },
      },
    },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'local-rules/no-playwright-page-methods': 'error',
      'playwright/no-standalone-expect': 'off',
      'playwright/expect-expect': [
        'error',
        {
          assertFunctionNames: [
            'assertDataTableMatches',
            'assertScriptExplorerItems',
            'assertScriptNodesSelected',
            'expectNotificationWithText',
            'expectErrorNotification',
            'expectSuccessNotification',
          ],
        },
      ],
    },
  },
  {
    ...eslint.configs.recommended,
    files: nodeFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'module',
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  prettier,
];
