module.exports = {
  extends: ['mantine'],
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['unused-imports', 'playwright'],
  rules: {
    'arrow-body-style': 'off',
    'react/react-in-jsx-scope': 'off',
    'import/extensions': 'off',
    'consistent-return': 'off',
    'no-promise-executor-return': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-continue': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
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
            ],
          },
        ],
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
