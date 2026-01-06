module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/__tests__/',
  ],
  // Test timeout configurable via JEST_TIMEOUT env var (default: 15s for network operations)
  testTimeout: process.env.JEST_TIMEOUT ? parseInt(process.env.JEST_TIMEOUT, 10) : 15000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Coverage reporters: text for console, lcov for CI/codecov integration
  // Note: html and cobertura removed to speed up tests - add back if needed
  coverageReporters: [
    'text',
    'lcov',
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true,
    }],
  ],
};
