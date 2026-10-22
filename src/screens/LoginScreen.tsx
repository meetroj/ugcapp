import { Alert } from '../components/AppAlert';
/** "Welcome back" screen: email or phone number + password, Google alternative. */
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import AuthLayout from '../components/AuthLayout';
import AuthInput from '../components/AuthInput';
import {
  OrDivider,
  PrimaryButton,
  SocialRow,
  SwitchPrompt,
} from '../components/AuthParts';
import { colors, fontScale, scale } from '../theme';

type Props = {
  /** Switches the shell over to the sign-up screen. */
  onGoToSignUp: () => void;
  /** Receives the completed form; AuthFlow posts it to /api/auth/login. */
  onSubmit?: (values: { email: string; password: string }) => Promise<void>;
  /** Google sign-in. The button only renders when this is provided. */
  onGoogle?: () => void;
  /** Opens password recovery. */
  onForgotPassword?: () => void;
  /** Sign in with Apple. iOS only; the button hides when absent. */
  onApple?: () => void;
  /** Email kept by the parent so it carries over to the other auth forms. */
  email?: string;
  onEmailChange?: (email: string) => void;
};

export function LoginForm({
  onGoToSignUp,
  onSubmit,
  onGoogle,
  onForgotPassword,
  onApple,
  email: emailProp,
  onEmailChange,
}: Props) {
  const [localEmail, setLocalEmail] = useState('');
  const email = emailProp ?? localEmail;
  const setEmail = (value: string) => {
    setLocalEmail(value);
    onEmailChange?.(value);
  };
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    // Saying nothing on an empty form read as a dead button.
    if (!email.trim() || !password) {
      Alert.alert('Enter your details', 'Enter your email or phone number and password to log in.');
      return;
    }
    // No length rule here: the website only checks length at sign-up, and an
    // older account may have a shorter password that must still be able to log in.
    setLoading(true);
    try {
      await onSubmit?.({ email, password });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AuthInput
        label="Email or phone number"
        icon="mail"
        placeholder="Email or phone number"
        keyboardType="email-address"
        // 'username' (not 'emailAddress') is what makes iOS Passwords offer the
        // saved login, whichever of email / phone it was saved under; with
        // 'emailAddress' it only suggested the phone from the contact card.
        textContentType="username"
        autoComplete="username"
        value={email}
        onChangeText={setEmail}
      />

      <AuthInput
        label="Password"
        icon="lock"
        placeholder="••••••••"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        // Enter on the keyboard logs in, like pressing Enter on the website.
        onSubmitEditing={submit}
      />

      {/* Sits above the button, where it is found when the password has just
          been rejected. Without it the only way back into a locked-out
          account was the website. */}
      {!!onForgotPassword && (
        <View style={styles.forgotRow}>
          <TouchableOpacity
            onPress={onForgotPassword}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      )}

      <PrimaryButton label="Log In" onPress={submit} loading={loading} />

      {/* Only rendered once a Google flow exists — a styled button that
          silently does nothing reads as the app being broken. */}
      {(!!onGoogle || !!onApple) && (
        <>
          <OrDivider />
          {/* On iPhone both sit side by side at equal width; on Android the
              Google button keeps its full-width labelled form. */}
          <SocialRow onGoogle={onGoogle} onApple={onApple} />
        </>
      )}

      <SwitchPrompt
        question="Don't have an account?"
        action="Sign Up"
        onPress={onGoToSignUp}
      />
    </>
  );
}

const styles = StyleSheet.create({
  forgotRow: { alignItems: 'flex-end', marginBottom: scale(14) },
  forgotText: {
    fontSize: fontScale(14),
    color: colors.brand,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
});

function LoginScreen(props: Props) {
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue on UGCad.io">
      <LoginForm {...props} />
    </AuthLayout>
  );
}

export default LoginScreen;
