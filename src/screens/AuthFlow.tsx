import { Alert } from '../components/AppAlert';
/**
 * Holds the sign-up / log-in pair and toggles between them. The shared
 * AuthLayout stays mounted while only the form content changes, allowing
 * LayoutAnimation to resize the card without animating the whole screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
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
import type { DeepLink } from '../deepLink';
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
import { colors, fontScale, INPUT_FONT_SIZE, scale } from '../theme';

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
  /**
   * A link from an email or the website (/auth?view=reset&email=...,
   * /auth?mode=signup&role=...). Read once, when the screen first appears.
   */
  initialLink?: Extract<DeepLink, { kind: 'auth' }>;
};

type Mode = 'signup' | 'login' | 'forgot';

function AuthFlow({ onAuthenticated, initialLink }: Props) {
  const [mode, setMode] = useState<Mode>(
    initialLink?.view === 'reset'
      ? 'forgot'
      : initialLink?.mode === 'signup'
      ? 'signup'
      : 'login',
  );
  // The email typed on any of the three forms, shared like the website does, so
  // "Forgot password?" opens with the address already filled in.
  const [email, setEmail] = useState(initialLink?.email || '');
  /**
   * The sign-in to repeat once the user types their 2FA code. Email, Google and
   * Apple all answer {requires_2fa:true} first, and each retries by resending
   * what it sent the first time (password, or the Google/Apple token) plus the
   * code. Held only in memory until the code is accepted or the sheet closes.
   */
  const [pending, setPending] = useState<{
    retry: (code: string) => Promise<AuthUser>;
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

  // Android Back on Sign up / Reset password goes to Log in; quitting the app from
  // a form the user only meant to leave felt like a crash. Log in itself exits.
  useEffect(() => {
    if (mode === 'login') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switchTo('login');
      return true;
    });
    return () => sub.remove();
  }, [mode, switchTo]);

  const handleSignUp = async (values: {
    role: Role;
    email: string;
    password: string;
    phone: string;
    dialCode: string;
  }) => {
    try {
      onAuthenticated(
        await signUp(
          values.role,
          values.email,
          values.password,
          values.phone,
          undefined,
          undefined,
          values.dialCode,
        ),
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
        askForCode(code => login(values.email, values.password, code));
        return;
      }
      Alert.alert(
        'Could not log in',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const askForCode = (retry: (code: string) => Promise<AuthUser>) => {
    setPending({ retry });
    setTotp('');
  };

  /** Retries whichever sign-in asked for 2FA, with the code appended. */
  const submitTotp = async () => {
    if (!pending || totp.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const session = await pending.retry(totp);
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
      try {
        onAuthenticated(await appleAuth(identityToken, role, fullName));
      } catch (error) {
        if (!(error instanceof TwoFactorRequired)) throw error;
        // Apple's token lasts about 10 minutes, long enough to type a code.
        askForCode(code => appleAuth(identityToken, role, fullName, code));
      }
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
      try {
        onAuthenticated(await googleAuth(idToken, role));
      } catch (error) {
        if (!(error instanceof TwoFactorRequired)) throw error;
        askForCode(code => googleAuth(idToken, role, code));
      }
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
              email={email}
              onEmailChange={setEmail}
              initialRole={initialLink?.role === 'business' ? 'brand' : 'creator'}
              onGoToLogin={() => switchTo('login')}
              onSubmit={handleSignUp}
              onGoogle={googleSignInAvailable() ? handleGoogle : undefined}
              onApple={appleSignInAvailable() ? handleApple : undefined}
            />
          ) : mode === 'forgot' ? (
            <ForgotPasswordForm
              email={email}
              onEmailChange={setEmail}
              // The reset email lands on "enter the code" with the address known.
              startAtCode={initialLink?.view === 'reset' && !!initialLink.email}
              onDone={() => switchTo('login')}
            />
          ) : (
            <LoginForm
              email={email}
              onEmailChange={setEmail}
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
          password (or Google/Apple account) is already accepted, this is the
          same sign-in finishing. */}
      <Modal
        visible={!!pending}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPending(null)}
      >
        {/* Padding on both platforms so the keyboard never covers the code box. */}
        <KeyboardAvoidingView style={styles.backdropFill} behavior="padding">
          {/* Scrolls so the code box and Verify stay reachable in landscape or on a
              short phone with the keyboard open. */}
          <ScrollView
            contentContainerStyle={styles.backdrop}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                onSubmitEditing={submitTotp}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backdrop },
  flex: { flex: 1 },

  backdropFill: { flex: 1, backgroundColor: 'rgba(11,12,38,0.55)' },
  backdrop: {
    flexGrow: 1,
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
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: colors.muted,
  },
  code: {
    marginTop: scale(14),
    height: scale(50),
    minHeight: 48,
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(14),
    fontSize: Math.max(INPUT_FONT_SIZE, fontScale(20)),
    // Wide tracking so the six digits read as a code rather than a number.
    letterSpacing: scale(6),
    color: '#15163F',
  },
  sheetActions: { flexDirection: 'row', gap: scale(10), marginTop: scale(14) },
  sheetGhost: {
    flex: 1,
    height: scale(46),
    minHeight: 44,
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGhostText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  sheetPrimary: {
    flex: 1,
    height: scale(46),
    minHeight: 44,
    borderRadius: scale(12),
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryOff: { opacity: 0.5 },
  sheetPrimaryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AuthFlow;
