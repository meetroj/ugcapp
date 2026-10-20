module.exports = {
  preset: '@react-native/jest-preset',
  // The first test of a suite pays for importing a whole screen; under a parallel full run that
  // can pass the 5 s default and fail a correct test.
  testTimeout: 20000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // react-native-webview ships untranspiled ESM, so it must not be ignored.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-webview|react-native-safe-area-context)/)',
  ],
};
