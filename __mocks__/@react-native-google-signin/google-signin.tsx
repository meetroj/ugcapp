/**
 * Google Sign-In touches native Play Services on import and ships untranspiled
 * ESM, so Jest cannot parse the real package. Tests only need the surface
 * googleSignIn.ts calls.
 */
export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async () => ({
    type: 'success',
    data: { idToken: 'test-google-id-token' },
  })),
  signOut: jest.fn(async () => {}),
};
