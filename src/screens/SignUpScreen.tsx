/** "Create account" screen: role choice, email + mobile + password, Google alternative. */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import AuthInput from '../components/AuthInput';
import RoleSelector, { type Role } from '../components/RoleSelector';
import { SIGNUP_DIAL_CODE } from '../api';
import {
  GoogleButton,
  OrDivider,
  PrimaryButton,
  SwitchPrompt,
} from '../components/AuthParts';

/**
 * Mobile number rules, matching the backends normalize_signup_phone():
 * it stores the national number and the dial code separately, and for +91 it
 * requires exactly 10 digits. There is no OTP - the number is contact detail
 * the ops team reads on the application, not a verified second factor.
 *
 * The form has no country picker, so every number is sent as +91. Checking the
 * length here means a wrong number is caught before the request instead of
 * coming back as a 400.
 */
const PHONE_DIGITS = 10;

/**
 * Digits only. A pasted "+91 98765 43210" arrives with the country code merged
 * in, so drop it when that is the only reason the number is too long - the same
 * rule the backend applies.
 */
export function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  const cc = SIGNUP_DIAL_CODE.replace(/\D/g, '');
  if (digits.startsWith(cc) && digits.length > PHONE_DIGITS) {
    return digits.slice(cc.length);
  }
  return digits;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).length === PHONE_DIGITS;
}

type Props = {
  /** Switches the shell over to the log-in screen. */
  onGoToLogin: () => void;
  /** Receives the completed form; AuthFlow posts it to /api/auth/signup. */
  onSubmit?: (values: {
    role: Role;
    email: string;
    password: string;
    phone: string;
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
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !phone.trim() || !password || loading) return;
    if (!isValidPhone(phone)) {
      Alert.alert(
        'Check your mobile number',
        `Enter a valid ${PHONE_DIGITS}-digit mobile number, for example 98765 43210.`,
      );
      return;
    }
    if (password.length < 6) {
      Alert.alert(
        'Password too short',
        'Password must contain at least 6 characters.',
      );
      return;
    }
    setLoading(true);
    try {
      await onSubmit?.({ role, email, password, phone: normalizePhone(phone) });
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

      {/* Required, and there is no verification step — see normalizePhone. */}
      <AuthInput
        label="Mobile number"
        icon="phone"
        placeholder="98765 43210"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={20}
        value={phone}
        onChangeText={setPhone}
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
