/** "Welcome back" screen: email + password, Google alternative. */
import React, { useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
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
};

export function LoginForm({
  onGoToSignUp,
  onSubmit,
  onGoogle,
  onForgotPassword,
  onApple,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || loading) return;
    if (password.length < 6) {
      Alert.alert(
        'Password too short',
        'Password must contain at least 6 characters.',
      );
      return;
    }
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
        label="Email"
        icon="mail"
        placeholder="your@email.com"
        keyboardType="email-address"
        textContentType="emailAddress"
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
      />

      {/* Sits above the button, where it is found when the password has just
          been rejected. Without it the only way back into a locked-out
          account was the website. */}
      {!!onForgotPassword && (
        <View style={styles.forgotRow}>
          <TouchableOpacity
            onPress={onForgotPassword}
            accessibilityRole="button"
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
    fontSize: fontScale(12),
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
