/**
 * Native Google Sign-In, wrapped so screens never touch the SDK directly.
 *
 * The flow is: the SDK returns a Google ID token, which `googleAuth()` in
 * api.ts posts to /api/auth/google. The backend verifies that token against its
 * own GOOGLE_CLIENT_ID and returns a normal UGCad session — so from the app's
 * point of view this is just another way to obtain the same AuthUser.
 */
import { Platform } from 'react-native';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/**
 * The WEB OAuth client id, not an Android one.
 *
 * The backend calls verifyIdToken({ audience: GOOGLE_CLIENT_ID }) with this
 * exact value, and a token minted for a different client has a different `aud`
 * claim — which fails verification with "Invalid or expired Google credential".
 * The Android OAuth client still has to exist in Google Cloud Console (matched
 * by package name + signing SHA-1) for the SDK to work at all, but it is not
 * the id named here.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '193113275370-c3or5lgj2m92qgc364hvu45tbiflj470.apps.googleusercontent.com';

let configured = false;

/**
 * The iOS OAuth client id.
 *
 * iOS cannot infer its client the way Android does. Android matches the app by
 * package name + signing SHA-1, so the SDK finds its client without being told;
 * iOS has no equivalent lookup, so the id has to be passed in or read from a
 * GoogleService-Info.plist. Without it the SDK throws
 * "failed to determine clientID" before the account picker ever opens.
 *
 * This is a THIRD client, distinct from the web and Android ones: create an
 * "iOS" OAuth client in the same Google Cloud project, with the app's bundle
 * identifier. The backend still verifies against GOOGLE_WEB_CLIENT_ID, which is
 * why that stays the audience below.
 */
export const GOOGLE_IOS_CLIENT_ID =
  '193113275370-rnctnc7p6bma4kve8p0hrqbc0b1c9al2.apps.googleusercontent.com';

/** Configures the SDK once. Safe to call repeatedly. */
export function configureGoogleSignIn() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // Passed only when set: handing the SDK an empty string reads as a real
    // (invalid) id, which fails later and less clearly than not setting it.
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : null),
    // We only need identity, so no Drive/Calendar scopes are requested. The
    // backend reads email, name and picture off the verified token.
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
  configured = true;
}

/**
 * True when Google sign-in can actually run on this platform.
 *
 * On iOS that needs GOOGLE_IOS_CLIENT_ID; Android only needs the OAuth client
 * registered in Cloud Console, which the app cannot see from here.
 *
 * A function rather than a constant: evaluated at module load it would freeze
 * whatever Platform.OS said at import time, which import hoisting makes
 * impossible to control from a test.
 */
export function googleSignInAvailable() {
  return Platform.OS !== 'ios' || !!GOOGLE_IOS_CLIENT_ID;
}

/** Raised when the user backs out of the Google sheet — not a real failure. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'GoogleSignInCancelled';
  }
}

/**
 * Opens the Google account picker and returns the ID token.
 *
 * Throws GoogleSignInCancelled when the user dismisses the sheet, so callers
 * can stay silent rather than showing an error for a deliberate action.
 */
export async function getGoogleIdToken(): Promise<string> {
  configureGoogleSignIn();

  // Surfaces a clear message on devices without a current Play Services,
  // instead of an opaque failure from the sign-in call itself.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const result = await GoogleSignin.signIn();

    // v13+ returns { type: 'success' | 'cancelled', data }, while older
    // versions resolved straight to the user object. Read both shapes so a
    // minor SDK bump cannot silently break sign-in.
    const anyResult = result as any;
    if (anyResult?.type === 'cancelled') throw new GoogleSignInCancelled();

    const idToken: string | undefined =
      anyResult?.data?.idToken ?? anyResult?.idToken;

    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }
    return idToken;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (
      code === statusCodes.SIGN_IN_CANCELLED ||
      error instanceof GoogleSignInCancelled
    ) {
      throw new GoogleSignInCancelled();
    }
    if (code === statusCodes.IN_PROGRESS) {
      throw new Error('A Google sign-in is already in progress.');
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error(
        'Google Play Services is not available on this device. Sign in with your email and password instead.',
      );
    }
    throw error;
  }
}

/**
 * Clears the cached Google account so the next sign-in shows the picker again.
 * Called on logout — without it, signing out and back in silently reuses the
 * previous account.
 */
export async function signOutGoogle() {
  try {
    configureGoogleSignIn();
    await GoogleSignin.signOut();
  } catch {
    // Never block logout on this: the UGCad session is already being cleared,
    // and a stale Google cache is a minor annoyance next sign-in at worst.
  }
}
