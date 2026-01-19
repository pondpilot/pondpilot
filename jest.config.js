/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
        },
      },
    ],
  },
  roots: ['<rootDir>/tests/unit'],
  setupFiles: ['<rootDir>/tests/unit/jest-setup.js'],
  globals: {
    'import.meta.env.DEV': false,
    'import.meta.env.PROD': true,
    'import.meta.env.VITE_CORS_PROXY_URL': undefined,
  },
  moduleNameMapper: {
    '^@pondpilot/flowscope-core$': '<rootDir>/tests/unit/__mocks__/flowscope-core.ts',
    '^.+/workers/flowscope-client$': '<rootDir>/tests/unit/__mocks__/flowscope-client.ts',
    '^@utils/env$': '<rootDir>/tests/unit/__mocks__/env.ts',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@consts/(.*)$': '<rootDir>/src/consts/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
  },
};
