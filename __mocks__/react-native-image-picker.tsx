/**
 * Test stand-in for react-native-image-picker. The real module touches native
 * modules on import and ships untranspiled ESM, so tests route to this instead.
 * Returns "user cancelled" — the screens treat that as a no-op, which keeps
 * onboarding renderable without a device gallery.
 */
export const launchImageLibrary = jest.fn(async () => ({
  didCancel: true,
  assets: [],
}));

export const launchCamera = jest.fn(async () => ({
  didCancel: true,
  assets: [],
}));
