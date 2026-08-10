const baseConfig = require('./jest.config.js');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'component',
  roots: ['<rootDir>/tests/component'],
  testEnvironment: 'jsdom',
  setupFiles: [],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: undefined,
};
