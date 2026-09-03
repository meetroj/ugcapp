/**
 * Tells `npx react-native-asset` where the bundled fonts live so it can copy
 * them into android/app/src/main/assets/fonts and register them in the iOS
 * project's UIAppFonts. Without this the TTFs ship nowhere and every
 * `fontFamily` in the app silently falls back to the system face.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assests/fonts'],
};
