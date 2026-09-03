/** "Create account" screen: role choice, email + password, Google alternative. */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import AuthInput from '../components/AuthInput';
import RoleSelector, { type Role } from '../components/RoleSelector';
import {
  GoogleButton,
  OrDivider,
  PrimaryButton,
  SwitchPrompt,
} from '../components/AuthParts';

type Props = {
  /** Switches the shell over to the log-in screen. */
  onGoToLogin: () => void;
  /** Receives the completed form; AuthFlow posts it to /api/auth/signup. */
  onSubmit?: (values: {
    role: Role;
    email: string;
    password: string;
  }) => Promise<void>;
  /**
   * Google sign-in. The button only renders when this is provided.
   *
   * Receives the selected role: the backend needs it to decide whether a
   * brand-new Google account is a creator or a business, and the role selector
   * lives in this form's own state.
   */
  onGoogle?: (role: Role) => void;
};

export function SignUpForm({ onGoToLogin, onSubmit, onGoogle }: Props) {
  const [role, setRole] = useState<Role>('creator');
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
      await onSubmit?.({ role, email, password });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <RoleSelector value={role} onChange={setRole} compact />

      <AuthInput
        label="Email"
        icon="mail"
        placeholder="your@email.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        compact
      />

      <AuthInput
        label="Password"
        icon="lock"
        placeholder="••••••••"
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
        compact
      />

      <PrimaryButton
        label="Create Account"
        onPress={submit}
        loading={loading}
        compact
      />

      {/* Only rendered once a Google flow exists — a styled button that
          silently does nothing reads as the app being broken. */}
      {!!onGoogle && (
        <>
          <OrDivider compact />
          <GoogleButton onPress={() => onGoogle(role)} compact />
        </>
      )}

      <SwitchPrompt
        question="Already have an account?"
        action="Sign In"
        onPress={onGoToLogin}
        compact
      />
    </>
  );
}

function SignUpScreen(props: Props) {
  return (
    <AuthLayout
      title="Create account"
      subtitle="Join thousands of creators and brands on UGCad.io"
      compact
    >
      <SignUpForm {...props} />
    </AuthLayout>
  );
}

export default SignUpScreen;
