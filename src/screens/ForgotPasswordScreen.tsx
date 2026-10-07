import { Alert } from '../components/AppAlert';
/**
 * Password recovery, in the three steps the website's Auth page uses:
 * ask for the email, check the emailed code, then set the new password.
 *
 * The app had none of this — a user who forgot their password could only get
 * back in by going to ugcad.io, which is exactly the moment they are least
 * likely to. Rendered inside the shared AuthLayout so it is the same card the
 * login and sign-up forms sit in.
 */
import React, { useState } from 'react';

import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import AuthInput from '../components/AuthInput';
import { PrimaryButton, SwitchPrompt } from '../components/AuthParts';
import { forgotPassword, resetPassword, verifyResetCode } from '../api';
import { colors, fontScale, scale } from '../theme';

type Step = 'email' | 'code' | 'password';

type Props = {
  /** Back to the login form, either on success or on "Log in" below. */
  onDone: () => void;
};

/** Mirrors the backend's own minimum, so a rejection is caught before the POST. */
const MIN_PASSWORD = 6;

function ForgotPasswordForm({ onDone }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = (error: unknown, fallback: string) =>
    Alert.alert(
      'Could not continue',
      error instanceof Error && error.message ? error.message : fallback,
    );

  const sendCode = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep('code');
      Alert.alert(
        'Check your email',
        `If an account exists for ${email.trim()}, a 6-digit code is on its way.`,
      );
    } catch (error) {
      fail(error, 'Could not send the reset code.');
    } finally {
      setLoading(false);
    }
  };

  const checkCode = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    try {
      await verifyResetCode(email.trim(), code);
      setStep('password');
    } catch (error) {
      fail(error, 'That code was not accepted.');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (loading) return;
    if (password.length < MIN_PASSWORD) {
      Alert.alert(
        'Password too short',
        `Password must contain at least ${MIN_PASSWORD} characters.`,
      );
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Retype the new password.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim(), code, password);
      Alert.alert(
        'Password changed',
        'Log in with your new password.',
        [{ text: 'OK', onPress: onDone }],
      );
    } catch (error) {
      fail(error, 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {step === 'email' && (
        <>
          <Text style={styles.hint}>
            Enter the email on your account and we will send a 6-digit code.
          </Text>
          <AuthInput
            label="Email"
            icon="mail"
            placeholder="your@email.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <PrimaryButton
            label="Send code"
            onPress={sendCode}
            loading={loading}
          />
        </>
      )}

      {step === 'code' && (
        <>
          <Text style={styles.hint}>
            Enter the 6-digit code sent to {email.trim()}.
          </Text>
          <AuthInput
            label="Reset code"
            icon="lock"
            placeholder="123456"
            keyboardType="number-pad"
            value={code}
            onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))}
          />
          <PrimaryButton
            label="Verify code"
            onPress={checkCode}
            loading={loading}
          />
          <View style={styles.resendRow}>
            <TouchableOpacity onPress={sendCode} accessibilityRole="button">
              <Text style={styles.link}>Send it again</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'password' && (
        <>
          <Text style={styles.hint}>Choose a new password.</Text>
          <AuthInput
            label="New password"
            icon="lock"
            placeholder="••••••••"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />
          <AuthInput
            label="Confirm new password"
            icon="lock"
            placeholder="••••••••"
            textContentType="newPassword"
            value={confirm}
            onChangeText={setConfirm}
          />
          <PrimaryButton
            label="Save password"
            onPress={save}
            loading={loading}
          />
        </>
      )}

      <SwitchPrompt
        question="Remembered it?"
        action="Log In"
        onPress={onDone}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginBottom: scale(14),
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: colors.muted,
  },
  resendRow: { alignItems: 'center', marginTop: scale(12) },
  link: {
    fontSize: fontScale(13),
    color: colors.brand,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
});

export default ForgotPasswordForm;
