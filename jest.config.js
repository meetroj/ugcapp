module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // react-native-webview ships untranspiled ESM, so it must not be ignored.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-webview|react-native-safe-area-context)/)',
  ],
};
