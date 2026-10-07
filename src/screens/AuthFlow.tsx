import { Alert } from '../components/AppAlert';
/**
 * Holds the sign-up / log-in pair and toggles between them. The shared
 * AuthLayout stays mounted while only the form content changes, allowing
 * LayoutAnimation to resize the card without animating the whole screen.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  View,
  } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { LoginForm } from './LoginScreen';
import { SignUpForm } from './SignUpScreen';
import ForgotPasswordForm from './ForgotPasswordScreen';
import AuthLayout from '../components/AuthLayout';
import type { Role } from '../components/RoleSelector';
import {
  appleAuth,
  googleAuth,
  login,
  signUp,
  TwoFactorRequired,
  type AuthUser,
} from '../api';
import {
  GoogleSignInCancelled,
  getGoogleIdToken,
  googleSignInAvailable,
} from '../googleSignIn';
import {
  AppleSignInCancelled,
  appleSignInAvailable,
  getAppleCredential,
} from '../appleSignIn';
import { colors, fontScale, scale } from '../theme';

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

type Mode = 'signup' | 'login' | 'forgot';

function AuthFlow({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  /**
   * Credentials held between the two halves of a 2FA login. The password is
   * kept only in memory and only until the code is accepted or the sheet is
   * dismissed — the retry has to send it again.
   */
  const [pending, setPending] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [totp, setTotp] = useState('');
  const [verifying, setVerifying] = useState(false);

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
    phone: string;
  }) => {
    try {
      onAuthenticated(
        await signUp(values.role, values.email, values.password, values.phone),
      );
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
      // An account with 2FA on answers the first request with
      // {requires_2fa:true} and no token. That is a second step, not a
      // failure — the app used to report it as "complete this on ugcad.io".
      if (error instanceof TwoFactorRequired) {
        setPending(values);
        setTotp('');
        return;
      }
      Alert.alert(
        'Could not log in',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  /** Retries the login with the authenticator code appended. */
  const submitTotp = async () => {
    if (!pending || totp.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const session = await login(pending.email, pending.password, totp);
      setPending(null);
      onAuthenticated(session);
    } catch (error) {
      Alert.alert(
        'Code not accepted',
        error instanceof Error ? error.message : 'Check the 6 digits.',
      );
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Sign in with Apple. Same shape as the Google handler — one endpoint signs
   * in and signs up — but the display name only exists on the very first
   * authorization, so it is forwarded when present and never again.
   */
  const handleApple = async (role: Role = 'creator') => {
    try {
      const { identityToken, fullName } = await getAppleCredential();
      onAuthenticated(await appleAuth(identityToken, role, fullName));
    } catch (error) {
      // Dismissing the Apple sheet is a deliberate action, not a failure.
      if (error instanceof AppleSignInCancelled) return;
      Alert.alert(
        'Could not continue with Apple',
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
          title={
            mode === 'signup'
              ? 'Create account'
              : mode === 'forgot'
              ? 'Reset password'
              : 'Welcome back'
          }
          subtitle={
            mode === 'signup'
              ? 'Join thousands of creators and brands on UGCad.io'
              : mode === 'forgot'
              ? 'We will email you a code to set a new one'
              : 'Log in to continue on UGCad.io'
          }
        >
          {mode === 'signup' ? (
            <SignUpForm
              onGoToLogin={() => switchTo('login')}
              onSubmit={handleSignUp}
              onGoogle={googleSignInAvailable() ? handleGoogle : undefined}
              onApple={appleSignInAvailable() ? handleApple : undefined}
            />
          ) : mode === 'forgot' ? (
            <ForgotPasswordForm onDone={() => switchTo('login')} />
          ) : (
            <LoginForm
              onGoToSignUp={() => switchTo('signup')}
              onSubmit={handleLogin}
              onGoogle={googleSignInAvailable() ? () => handleGoogle() : undefined}
              onApple={appleSignInAvailable() ? () => handleApple() : undefined}
              onForgotPassword={() => switchTo('forgot')}
            />
          )}
        </AuthLayout>
      </View>

      {/* Second factor. Shown over the card rather than as another mode: the
          email and password are already accepted, this is the same login
          finishing. */}
      <Modal
        visible={!!pending}
        transparent
        animationType="fade"
        onRequestClose={() => setPending(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Two-factor code</Text>
            <Text style={styles.sheetBody}>
              Enter the 6-digit code from your authenticator app.
            </Text>
            <TextInput
              style={styles.code}
              value={totp}
              onChangeText={text => setTotp(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetGhost}
                onPress={() => setPending(null)}
                accessibilityRole="button"
              >
                <Text style={styles.sheetGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sheetPrimary,
                  totp.length !== 6 && styles.sheetPrimaryOff,
                ]}
                onPress={submitTotp}
                disabled={totp.length !== 6 || verifying}
                accessibilityRole="button"
              >
                {verifying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sheetPrimaryText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backdrop },
  flex: { flex: 1 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  sheet: {
    width: '100%',
    maxWidth: scale(340),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(18),
  },
  sheetTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-Medium',
    color: '#15163F',
  },
  sheetBody: {
    marginTop: scale(6),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: colors.muted,
  },
  code: {
    marginTop: scale(14),
    height: scale(50),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(14),
    fontSize: fontScale(20),
    // Wide tracking so the six digits read as a code rather than a number.
    letterSpacing: scale(6),
    color: '#15163F',
  },
  sheetActions: { flexDirection: 'row', gap: scale(10), marginTop: scale(14) },
  sheetGhost: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGhostText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  sheetPrimary: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryOff: { opacity: 0.5 },
  sheetPrimaryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AuthFlow;
