module.exports = {
  extends: ['mantine', 'plugin:react-hooks/recommended'],
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['unused-imports', 'playwright', 'local-rules'],
  rules: {
    'arrow-body-style': 'off',
    'react/react-in-jsx-scope': 'off',
    'import/extensions': 'off',
    'consistent-return': 'off',
    'no-promise-executor-return': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'group', 'groupEnd'] }],
    'no-continue': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
    'unused-imports/no-unused-imports': 'error',
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
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      // Apply these rules only to Playwright test files
      files: ['tests/**/*.ts'],
      extends: ['plugin:playwright/recommended'],
      rules: {
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
      // Apply custom rules only to integration test files
      files: ['tests/integration/**/*.ts'],
      rules: {
        'local-rules/no-playwright-page-methods': 'error',
      },
    },
  ],
  settings: {
    playwright: {
      globalAliases: {
        test: ['baseTest'],
      },
    },
  },
};
