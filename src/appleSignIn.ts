/**
 * Sign in with Apple, wrapped so screens never touch the SDK directly.
 *
 * Required by App Store guideline 4.8: an app offering a third-party login
 * (here, Google) must offer an equivalent that limits collection to name and
 * email, lets the user hide their email, and does not track for ads. Our
 * 1.1 (2) submission was rejected for exactly this.
 *
 * The flow mirrors googleSignIn.ts: the SDK returns an identity token, which
 * `appleAuth()` in api.ts posts to /api/auth/apple. The backend verifies it
 * against Apple's public keys and returns a normal UGCad session.
 */
import { Platform } from 'react-native';
import appleAuthSdk, {
  appleAuthAndroid,
} from '@invertase/react-native-apple-authentication';

/** Raised when the user backs out of the Apple sheet — not a real failure. */
export class AppleSignInCancelled extends Error {
  constructor() {
    super('Apple sign-in was cancelled.');
    this.name = 'AppleSignInCancelled';
  }
}

/**
 * Whether the button should render at all.
 *
 * iOS 13+ only. Apple's own guidance is to hide the button entirely where the
 * API is unavailable rather than show one that fails on tap. Android could use
 * the web fallback (`appleAuthAndroid`), but guideline 4.8 is an App Store
 * rule and Google sign-in already covers that platform — so this stays iOS.
 *
 * A function, not a constant: evaluated at module load it would freeze
 * whatever Platform.OS said at import time, which import hoisting makes
 * impossible to control from a test.
 */
export function appleSignInAvailable(): boolean {
  return Platform.OS === 'ios' && appleAuthSdk.isSupported;
}

/** What Apple hands back. `fullName` is present only on first authorization. */
export type AppleCredential = {
  identityToken: string;
  fullName?: string;
};

/**
 * Opens the Apple sheet and returns the identity token.
 *
 * Apple discloses the name exactly once, at the first authorization for this
 * app, and never puts it in the token — so it is read here and passed on to
 * the backend, which stores it. Miss it and the only way to get it back is for
 * the user to revoke the app under Settings > Apple ID > Sign in with Apple.
 *
 * Throws AppleSignInCancelled when the user dismisses the sheet, so callers
 * can stay silent rather than showing an error for a deliberate action.
 */
export async function getAppleCredential(): Promise<AppleCredential> {
  try {
    const response = await appleAuthSdk.performRequest({
      requestedOperation: appleAuthSdk.Operation.LOGIN,
      // Exactly what 4.8 allows us to ask for, and no more.
      requestedScopes: [
        appleAuthSdk.Scope.FULL_NAME,
        appleAuthSdk.Scope.EMAIL,
      ],
    });

    if (!response.identityToken) {
      throw new Error('Apple did not return an identity token. Please try again.');
    }

    const given = response.fullName?.givenName?.trim() || '';
    const family = response.fullName?.familyName?.trim() || '';
    const fullName = [given, family].filter(Boolean).join(' ');

    return { identityToken: response.identityToken, fullName: fullName || undefined };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    // 1001 is the raw ASAuthorizationError.canceled, which the SDK surfaces
    // directly on some iOS versions instead of its own constant.
    if (
      code === appleAuthSdk.Error.CANCELED ||
      code === '1001' ||
      error instanceof AppleSignInCancelled
    ) {
      throw new AppleSignInCancelled();
    }
    throw error;
  }
}

/**
 * Apple has no sign-out to call: the credential lives with the system account,
 * not in the app. Exported so the logout path can treat both providers alike.
 */
export async function signOutApple(): Promise<void> {
  // Intentionally empty — see above.
}

// Referenced so the Android import is not flagged as unused; the web fallback
// is deliberately not wired (see appleSignInAvailable).
void appleAuthAndroid;
