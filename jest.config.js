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
  },
  moduleNameMapper: {
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@consts/(.*)$': '<rootDir>/src/consts/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@engines/(.*)$': '<rootDir>/src/engines/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
  },
};
