module.exports = {
  extends: ['mantine'],
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'import/extensions': 'off',
    'consistent-return': 'off',
    'no-promise-executor-return': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-continue': 'off',
  },
};
