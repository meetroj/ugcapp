import { Alert } from '../components/AppAlert';
/** "Create account" screen: role choice, email + mobile + password, Google alternative. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AuthLayout from '../components/AuthLayout';
import AuthInput from '../components/AuthInput';
import ChoiceSheet from '../components/ChoiceSheet';
import RoleSelector, { type Role } from '../components/RoleSelector';
import { SIGNUP_DIAL_CODE } from '../api';
import { scale } from '../theme';
import {
  OrDivider,
  PrimaryButton,
  SocialRow,
  SwitchPrompt,
} from '../components/AuthParts';

/**
 * Mobile number rules, matching the backends normalize_signup_phone():
 * it stores the national number and the dial code separately, and for +91 it
 * requires exactly 10 digits. There is no OTP - the number is contact detail
 * the ops team reads on the application, not a verified second factor.
 *
 * The same four dial codes and lengths as the website (and the backend's
 * SIGNUP_PHONE_LEN). Checking the length here means a wrong number is caught
 * before the request instead of coming back as a 400.
 */
export const DIAL_CODES = ['+91', '+1', '+44', '+61'];
const PHONE_LEN: Record<string, number> = {
  '+91': 10,
  '+1': 10,
  '+44': 10,
  '+61': 9,
};

/** National-number length for a dial code. */
export function phoneLength(dial: string = SIGNUP_DIAL_CODE): number {
  return PHONE_LEN[dial] || 10;
}

/**
 * Digits only. A pasted "+91 98765 43210" arrives with the country code merged
 * in, so drop it when that is the only reason the number is too long - the same
 * rule the backend applies.
 */
export function normalizePhone(
  raw: string,
  dial: string = SIGNUP_DIAL_CODE,
): string {
  const digits = String(raw || '').replace(/\D/g, '');
  const cc = dial.replace(/\D/g, '');
  if (digits.startsWith(cc) && digits.length > phoneLength(dial)) {
    return digits.slice(cc.length);
  }
  return digits;
}

export function isValidPhone(
  raw: string,
  dial: string = SIGNUP_DIAL_CODE,
): boolean {
  return normalizePhone(raw, dial).length === phoneLength(dial);
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
    dialCode: string;
  }) => Promise<void>;
  /** Email kept by the parent so it carries over to the other auth forms. */
  email?: string;
  onEmailChange?: (email: string) => void;
  /** Role preselected by a link such as /auth?mode=signup&role=business. */
  initialRole?: Role;
  /**
   * Google sign-in. The button only renders when this is provided.
   *
   * Receives the selected role: the backend needs it to decide whether a
   * brand-new Google account is a creator or a business, and the role selector
   * lives in this form's own state.
   */
  onGoogle?: (role: Role) => void;
  /** Sign in with Apple. iOS only; the button hides when absent. */
  onApple?: (role: Role) => void;
};

export function SignUpForm({
  onGoToLogin,
  onSubmit,
  onGoogle,
  onApple,
  email: emailProp,
  onEmailChange,
  initialRole = 'creator',
}: Props) {
  const [role, setRole] = useState<Role>(initialRole);
  const [localEmail, setLocalEmail] = useState('');
  const email = emailProp ?? localEmail;
  const setEmail = (value: string) => {
    setLocalEmail(value);
    onEmailChange?.(value);
  };
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState(SIGNUP_DIAL_CODE);
  const [dialOpen, setDialOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const digits = phoneLength(dialCode);
  // Shown under the field as soon as something is typed, like the website.
  const phoneError =
    phone.trim() && !isValidPhone(phone, dialCode)
      ? `Enter a valid ${digits}-digit mobile number.`
      : undefined;

  const submit = async () => {
    if (!email.trim() || !phone.trim() || !password || loading) return;
    if (!isValidPhone(phone, dialCode)) {
      Alert.alert(
        'Check your mobile number',
        `Enter a valid ${digits}-digit mobile number.`,
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
      await onSubmit?.({
        role,
        email,
        password,
        phone: normalizePhone(phone, dialCode),
        dialCode,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <RoleSelector value={role} onChange={setRole} compact />

      {/* No name here: creators and brands give it in the profile form. */}
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
        placeholder={`${digits}-digit number`}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={20}
        value={phone}
        onChangeText={setPhone}
        prefixLabel={`${dialCode} \u25BE`}
        onPrefixPress={() => setDialOpen(true)}
        error={phoneError}
        compact
      />
      <ChoiceSheet
        visible={dialOpen}
        title="Country code"
        options={DIAL_CODES.map(code => ({
          label: code,
          onPress: () => {
            setDialCode(code);
            // Re-trim a number typed for the previous country's length.
            setPhone(cur => normalizePhone(cur, code).slice(0, phoneLength(code)));
          },
        }))}
        onClose={() => setDialOpen(false)}
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
      {(!!onGoogle || !!onApple) && (
        <>
          <OrDivider compact />
          {/* Side by side on iPhone, full-width Google alone on Android. The
              role chosen above carries through to whichever is tapped. */}
          <SocialRow
            onGoogle={onGoogle ? () => onGoogle(role) : undefined}
            onApple={onApple ? () => onApple(role) : undefined}
            compact
          />
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

const styles = StyleSheet.create({
  appleGap: { marginTop: scale(10) },
});

export default SignUpScreen;
