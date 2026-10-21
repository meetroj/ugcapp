module.exports = {
  preset: '@react-native/jest-preset',
  // The first test of a suite pays for importing a whole screen; under a parallel full run that
  // can pass the 5 s default and fail a correct test.
  testTimeout: 20000,
  // The picker's own mock of its native module (the package.json `exports` map hides this
  // path from require, so it is wired here by file path).
  setupFiles: [
    '<rootDir>/node_modules/@react-native-documents/picker/jest/build/jest/setup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // react-native-webview ships untranspiled ESM, so it must not be ignored.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-webview|react-native-safe-area-context|@react-native-documents)/)',
  ],
};
