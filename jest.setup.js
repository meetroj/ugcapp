/* eslint-env jest */
// The webview package touches native modules on import; route it to __mocks__.
jest.mock('react-native-webview');
// The image picker reaches for the native gallery on import; route it too.
jest.mock('react-native-image-picker');
// Video reaches for native playback on import; route it to __mocks__ too.
jest.mock('react-native-video');
// AsyncStorage does the same, and ships untranspiled ESM on top of it.
jest.mock('@react-native-async-storage/async-storage');
// Google Sign-In reaches for Play Services on import and ships ESM; route it too.
jest.mock('@react-native-google-signin/google-signin');
// SafeAreaProvider withholds children until it gets native layout metrics,
// which never arrive under the test renderer; the shipped mock supplies them.
// That mock omits SafeAreaView, so add a plain View stand-in for it.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const {View} = require('react-native');
  // The shipped mock is transpiled ESM, so its exports sit under `.default`.
  const shipped = require('react-native-safe-area-context/jest/mock');
  return {
    ...shipped,
    ...(shipped.default || {}),
    SafeAreaView: ({children, ...props}) =>
      React.createElement(View, props, children),
  };
});
