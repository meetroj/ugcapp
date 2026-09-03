/** "Welcome back" screen: email + password, Google alternative. */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import AuthInput from '../components/AuthInput';
import {
  GoogleButton,
  OrDivider,
  PrimaryButton,
  SwitchPrompt,
} from '../components/AuthParts';

type Props = {
  /** Switches the shell over to the sign-up screen. */
  onGoToSignUp: () => void;
  /** Receives the completed form; AuthFlow posts it to /api/auth/login. */
  onSubmit?: (values: { email: string; password: string }) => Promise<void>;
  /** Google sign-in. The button only renders when this is provided. */
  onGoogle?: () => void;
};

export function LoginForm({ onGoToSignUp, onSubmit, onGoogle }: Props) {
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

      <PrimaryButton label="Log In" onPress={submit} loading={loading} />

      {/* Only rendered once a Google flow exists — a styled button that
          silently does nothing reads as the app being broken. */}
      {!!onGoogle && (
        <>
          <OrDivider />
          <GoogleButton onPress={onGoogle} />
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

function LoginScreen(props: Props) {
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue on UGCad.io">
      <LoginForm {...props} />
    </AuthLayout>
  );
}

export default LoginScreen;
