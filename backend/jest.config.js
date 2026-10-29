module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/scripts/**',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Runs before the test framework and before any module import, so
  // @/config sees its required variables (it validates at import time).
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/models$': '<rootDir>/src/app/models/index.ts',
    '^@/config$': '<rootDir>/src/config/index.ts',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/utils$': '<rootDir>/src/core/utils/index.ts',
    '^@/utils/(.*)$': '<rootDir>/src/core/utils/$1',
    '^@/middleware$': '<rootDir>/src/core/middleware/index.ts',
    '^@/routes$': '<rootDir>/src/infrastructure/routes/index.ts',
    '^@/types$': '<rootDir>/src/types/index.ts',
    '^@/services/(.*)$': '<rootDir>/src/app/services/$1.ts',
    '^@/controllers/(.*)$': '<rootDir>/src/app/controllers/$1.ts',
    '^@/app/(.*)$': '<rootDir>/src/app/$1',
    '^@/core/(.*)$': '<rootDir>/src/core/$1',
    '^@/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  },
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  collectCoverage: false, // Enable only when running coverage command
  forceExit: true,
  detectOpenHandles: true,
};
