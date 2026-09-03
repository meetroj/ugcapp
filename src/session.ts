/**
 * Persisted login session.
 *
 * The app used to keep the logged-in user in React state only, so every cold
 * start dropped the user back on the auth screens. We now mirror that state
 * into AsyncStorage (a small on-device key/value store) and read it back before
 * the first render.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOutGoogle } from './googleSignIn';
import type { AuthUser } from './api';

const SESSION_KEY = 'ugcapp.session.v1';

/** Reads the saved session, or null when nobody is logged in. */
export async function loadSession(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    // Guard against a truncated/older payload: without a token the session is
    // useless, and every API call would 401.
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed as AuthUser;
  } catch {
    // Corrupt JSON or unavailable storage: treat as logged out rather than
    // crashing the app on launch.
    return null;
  }
}

/** Stores the session so the next cold start skips the login screen. */
export async function saveSession(session: AuthUser): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Persisting is best-effort; the in-memory session still works this run.
  }
}

/** Removes the saved session on logout. */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
  // Google caches the chosen account separately from our session. Without
  // clearing it, a user who logs out and taps "Continue with Google" is signed
  // straight back into the same account with no picker — which looks like
  // logout failed. This is the single path every logout goes through, so it
  // lives here rather than in each caller.
  await signOutGoogle();
}
