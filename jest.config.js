module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/helpers/env.js'],
  testTimeout: 60000,
  testPathIgnorePatterns: ['/node_modules/', '/tests/helpers/'],
  moduleNameMapper: {
    // expo-server-sdk ships ESM-only; no test should hit real Expo push
    // infra anyway, so stub it out at the module boundary.
    '^expo-server-sdk$': '<rootDir>/tests/helpers/mocks/expo-server-sdk.js',
  },
};
