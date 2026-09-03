/**
 * Holds the sign-up / log-in pair and toggles between them. The shared
 * AuthLayout stays mounted while only the form content changes, allowing
 * LayoutAnimation to resize the card without animating the whole screen.
 */
import React, { useCallback, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StatusBar,
  StyleSheet,
  UIManager,
  View,
  Alert,
} from 'react-native';
import { LoginForm } from './LoginScreen';
import { SignUpForm } from './SignUpScreen';
import AuthLayout from '../components/AuthLayout';
import type { Role } from '../components/RoleSelector';
import { googleAuth, login, signUp, type AuthUser } from '../api';
import {
  GoogleSignInCancelled,
  getGoogleIdToken,
  googleSignInAvailable,
} from '../googleSignIn';
import { colors } from '../theme';

// LayoutAnimation is opt-in on old-architecture Android. Harmless elsewhere:
// the flag only exists when the legacy UIManager is in play.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  /** Called once the user finishes (or skips past) authentication. */
  onAuthenticated: (session: AuthUser) => void;
};

type Mode = 'signup' | 'login';

function AuthFlow({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login');

  const switchTo = useCallback(
    (next: Mode) => {
      if (next === mode) {
        return;
      }

      // Only the card's layout change animates. The full-screen photo and
      // backdrop stay opaque, preventing a white frame during the swap.
      LayoutAnimation.configureNext({
        duration: 260,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setMode(next);
    },
    [mode],
  );

  const handleSignUp = async (values: {
    role: Role;
    email: string;
    password: string;
  }) => {
    try {
      onAuthenticated(await signUp(values.role, values.email, values.password));
    } catch (error) {
      Alert.alert(
        'Could not create account',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const handleLogin = async (values: { email: string; password: string }) => {
    try {
      onAuthenticated(await login(values.email, values.password));
    } catch (error) {
      Alert.alert(
        'Could not log in',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  /**
   * Google sign-in. One handler for both modes: /api/auth/google signs in an
   * existing account and creates a new one, so the only difference is the role
   * carried over from the sign-up form's selector.
   */
  const handleGoogle = async (role: Role = 'creator') => {
    try {
      const idToken = await getGoogleIdToken();
      onAuthenticated(await googleAuth(idToken, role));
    } catch (error) {
      // Backing out of the account picker is a deliberate action, not a
      // failure — showing an alert for it would be noise.
      if (error instanceof GoogleSignInCancelled) return;
      Alert.alert(
        'Could not continue with Google',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  return (
    <View style={styles.root}>
      {/* Light glyphs read better against the dark photo at the top. */}
      <StatusBar barStyle="light-content" />

      <View style={styles.flex}>
        <AuthLayout
          compact={mode === 'signup'}
          title={mode === 'signup' ? 'Create account' : 'Welcome back'}
          subtitle={
            mode === 'signup'
              ? 'Join thousands of creators and brands on UGCad.io'
              : 'Log in to continue on UGCad.io'
          }
        >
          {mode === 'signup' ? (
            <SignUpForm
              onGoToLogin={() => switchTo('login')}
              onSubmit={handleSignUp}
              onGoogle={googleSignInAvailable() ? handleGoogle : undefined}
            />
          ) : (
            <LoginForm
              onGoToSignUp={() => switchTo('signup')}
              onSubmit={handleLogin}
              onGoogle={googleSignInAvailable() ? () => handleGoogle() : undefined}
            />
          )}
        </AuthLayout>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backdrop },
  flex: { flex: 1 },
});

export default AuthFlow;
