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
  },
};
