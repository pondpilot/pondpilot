/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\.tsx?$': ['ts-jest', {}],
  },
  roots: ['<rootDir>/tests/unit'],
  moduleNameMapper: {
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@consts/(.*)$': '<rootDir>/src/consts/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
  },
};
