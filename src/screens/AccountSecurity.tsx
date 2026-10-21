import { Alert } from '../components/AppAlert';
/**
 * Account Security — change password, two-factor, deactivate.
 *
 * All three were website-only. The app's Privacy & Security screen listed
 * them but sent you to ugcad.io (or nowhere), which meant an app-only user
 * could never rotate their password or turn 2FA on.
 *
 * Enabling 2FA is the three-step flow the web uses: POST /2fa/setup returns a
 * shared secret, the user adds it to their authenticator, and POST /2fa/verify
 * with a working code is what actually switches it on.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import {
  changePassword,
  deactivateAccount,
  deleteAccount,
  disableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
  verifyTwoFactor,
} from '../api';
import { CONTENT_COLUMN, INPUT_FONT_SIZE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  /** Deactivating ends the session, so the shell has to drop the user out. */
  onLogout?: () => void;
};

/** Mirrors the backend's own minimum (server.py change_password: 8 characters). */
export const MIN_PASSWORD = 8;

/** The word a user must type before the account is permanently deleted. */
export const DELETE_CONFIRM_WORD = 'DELETE';

function AccountSecurity({ token, onBack, onLogout }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [twoFactorOn, setTwoFactorOn] = useState<boolean | null>(null);
  /** The secret from /2fa/setup, held while the user enters their first code. */
  const [secret, setSecret] = useState('');
  /** otpauth:// link from /2fa/setup: opens the authenticator with the key filled in. */
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy2fa, setBusy2fa] = useState(false);

  const fail = (error: unknown, fallback: string) =>
    Alert.alert(
      'Could not complete',
      error instanceof Error && error.message ? error.message : fallback,
    );

  useEffect(() => {
    let active = true;
    getTwoFactorStatus(token)
      .then(status => {
        if (active) setTwoFactorOn(!!status?.enabled);
      })
      // Unknown is rendered as off with the row still usable, rather than
      // blocking the whole screen on one optional read.
      .catch(() => {
        if (active) setTwoFactorOn(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const savePassword = useCallback(async () => {
    if (savingPassword) return;
    if (!current) {
      Alert.alert('Current password needed', 'Enter your current password.');
      return;
    }
    if (next.length < MIN_PASSWORD) {
      Alert.alert(
        'Password too short',
        `The new password must contain at least ${MIN_PASSWORD} characters.`,
      );
      return;
    }
    if (next !== confirm) {
      Alert.alert('Passwords do not match', 'Retype the new password.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(token, current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      Alert.alert('Password changed', 'Use the new password next time.');
    } catch (error) {
      fail(error, 'Could not change the password.');
    } finally {
      setSavingPassword(false);
    }
  }, [confirm, current, next, savingPassword, token]);

  const beginTwoFactor = useCallback(async () => {
    if (busy2fa) return;
    setBusy2fa(true);
    try {
      const result = await setupTwoFactor(token);
      setSecret(String(result?.secret || ''));
      setOtpauthUrl(String(result?.otpauth_url || ''));
      setCode('');
    } catch (error) {
      fail(error, 'Could not start two-factor setup.');
    } finally {
      setBusy2fa(false);
    }
  }, [busy2fa, token]);

  const confirmTwoFactor = useCallback(async () => {
    if (busy2fa || code.length !== 6) return;
    setBusy2fa(true);
    try {
      await verifyTwoFactor(token, code);
      setSecret('');
      setCode('');
      setTwoFactorOn(true);
      Alert.alert(
        'Two-factor is on',
        'You will be asked for a code from your authenticator the next time you log in.',
      );
    } catch (error) {
      fail(error, 'That code was not accepted.');
    } finally {
      setBusy2fa(false);
    }
  }, [busy2fa, code, token]);

  /** Password prompt shown while switching 2FA off. */
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const turnOffTwoFactor = useCallback(() => {
    Alert.alert(
      'Turn off two-factor?',
      'Your account will be protected by the password alone.',
      [
        { text: 'Cancel', style: 'cancel' },
        // Disabling needs the password, which is the one thing someone with a
        // borrowed unlocked phone would not have.
        { text: 'Continue', onPress: () => setDisabling(true) },
      ],
    );
  }, []);

  const submitDisable = useCallback(async () => {
    if (busy2fa || !disablePassword) return;
    setBusy2fa(true);
    try {
      await disableTwoFactor(token, disablePassword);
      setDisabling(false);
      setDisablePassword('');
      setTwoFactorOn(false);
      Alert.alert('Two-factor is off');
    } catch (error) {
      fail(error, 'Could not turn two-factor off.');
    } finally {
      setBusy2fa(false);
    }
  }, [busy2fa, disablePassword, token]);

  /** Typed confirmation for the permanent delete (required by the app stores). */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deleteRef = useRef(false);

  const submitDelete = useCallback(async () => {
    if (deleteRef.current || deleteText.trim() !== DELETE_CONFIRM_WORD) return;
    deleteRef.current = true;
    setDeleting(true);
    try {
      await deleteAccount(token);
      // The account row is gone server-side; dropping the session returns the
      // user to the login screens.
      onLogout?.();
    } catch (error) {
      fail(
        error,
        'Could not delete the account right now. Please email support@ugcad.io.',
      );
    } finally {
      deleteRef.current = false;
      setDeleting(false);
    }
  }, [deleteText, onLogout, token]);

  const confirmDeactivate = useCallback(() => {
    Alert.alert(
      'Deactivate account',
      'Your profile is hidden until you log back in. You can reactivate at any time by logging in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateAccount(token);
              onLogout?.();
            } catch (error) {
              fail(error, 'Could not deactivate the account.');
            }
          },
        },
      ],
    );
  }, [onLogout, token]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Account Security" onBack={onBack} />
      {/* Android is edge-to-edge (the keyboard does not resize the window), so
          the lower fields (2FA code, delete confirmation) need this padding to
          stay above the keyboard; iOS insets the ScrollView itself. */}
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior="padding"
        enabled={Platform.OS === 'android'}
      >
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.content, CONTENT_COLUMN]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section}>Change password</Text>
        <TextInput
          style={styles.input}
          value={current}
          onChangeText={setCurrent}
          placeholder="Current password"
          placeholderTextColor="#A9ADC2"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
        />
        <TextInput
          style={[styles.input, styles.stacked]}
          value={next}
          onChangeText={setNext}
          placeholder="New password"
          placeholderTextColor="#A9ADC2"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <TextInput
          style={[styles.input, styles.stacked]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor="#A9ADC2"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          onSubmitEditing={savePassword}
        />
        <TouchableOpacity
          style={styles.primary}
          onPress={savePassword}
          disabled={savingPassword}
          accessibilityRole="button"
        >
          {savingPassword ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Update password</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.section}>Two-factor authentication</Text>
        {twoFactorOn === null ? (
          <ActivityIndicator size="small" color="#4C5BF3" />
        ) : twoFactorOn ? (
          <>
            <Text style={styles.body}>
              On. You are asked for a 6-digit code when you log in.
            </Text>
            {disabling ? (
              <>
                <TextInput
                  style={[styles.input, styles.stacked]}
                  value={disablePassword}
                  onChangeText={setDisablePassword}
                  placeholder="Confirm your password"
                  placeholderTextColor="#A9ADC2"
                  secureTextEntry
                  autoFocus
                />
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.ghost, styles.flex]}
                    onPress={() => {
                      setDisabling(false);
                      setDisablePassword('');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.danger, styles.flex]}
                    onPress={submitDisable}
                    disabled={busy2fa || !disablePassword}
                    accessibilityRole="button"
                  >
                    {busy2fa ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryText}>Turn off</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.ghost}
                onPress={turnOffTwoFactor}
                accessibilityRole="button"
              >
                <Text style={styles.ghostText}>Turn off two-factor</Text>
              </TouchableOpacity>
            )}
          </>
        ) : secret ? (
          <>
            <Text style={styles.body}>
              Add this key to your authenticator app, then enter the code it
              shows.
            </Text>
            {!!otpauthUrl && (
              <TouchableOpacity
                style={[styles.primary, styles.stacked]}
                onPress={() =>
                  Linking.openURL(otpauthUrl).catch(() =>
                    Alert.alert(
                      'No authenticator app found',
                      'Install Google Authenticator or Authy, or copy the key below into the app you use.',
                    ),
                  )
                }
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Open in authenticator app</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.secretBox}
              onPress={() => {
                Clipboard.setString(secret);
                Alert.alert('Copied', 'The key is on your clipboard.');
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy the setup key"
            >
              <Text style={styles.secretText} selectable>
                {secret}
              </Text>
              <Text style={styles.secretHint}>Tap to copy</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.input, styles.stacked, styles.code]}
              value={code}
              onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor="#A9ADC2"
              keyboardType="number-pad"
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.ghost, styles.flex]}
                onPress={() => {
                  setSecret('');
                  setCode('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primary, styles.flex, styles.noTop]}
                onPress={confirmTwoFactor}
                disabled={busy2fa || code.length !== 6}
                accessibilityRole="button"
              >
                {busy2fa ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Verify and enable</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Off. Adding a second factor means a stolen password is not enough
              on its own.
            </Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={beginTwoFactor}
              disabled={busy2fa}
              accessibilityRole="button"
            >
              {busy2fa ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Set up two-factor</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.section}>Account</Text>
        <Text style={styles.body}>
          Deactivating hides your profile and signs you out. Log in again at any
          time to reactivate it. Open deals and payouts are unaffected.
        </Text>
        <TouchableOpacity
          style={styles.danger}
          onPress={confirmDeactivate}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Deactivate my account</Text>
        </TouchableOpacity>

        <Text style={[styles.body, styles.deleteIntro]}>
          Deleting permanently removes your account and all your data. This
          cannot be undone.
        </Text>
        {deleteOpen ? (
          <>
            <Text style={styles.body}>
              Type {DELETE_CONFIRM_WORD} to confirm.
            </Text>
            <TextInput
              style={styles.input}
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder={DELETE_CONFIRM_WORD}
              placeholderTextColor="#A9ADC2"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={`Type ${DELETE_CONFIRM_WORD} to confirm account deletion`}
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.ghost, styles.flex]}
                onPress={() => {
                  setDeleteOpen(false);
                  setDeleteText('');
                }}
                disabled={deleting}
                accessibilityRole="button"
              >
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.danger,
                  styles.flex,
                  (deleting || deleteText.trim() !== DELETE_CONFIRM_WORD) &&
                    styles.disabled,
                ]}
                onPress={submitDelete}
                disabled={deleting || deleteText.trim() !== DELETE_CONFIRM_WORD}
                accessibilityRole="button"
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Delete permanently</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity
            style={styles.danger}
            onPress={() => setDeleteOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Delete my account</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },
  flex1: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
  },
  content: { padding: scale(16), paddingBottom: scale(40) },
  section: {
    marginTop: scale(22),
    marginBottom: scale(10),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  body: {
    marginBottom: scale(12),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7E829D',
  },
  input: {
    height: scale(48),
    minHeight: 44,
    paddingHorizontal: scale(13),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    // 16 or more so the keyboard does not zoom/crop the field on focus.
    fontSize: INPUT_FONT_SIZE,
    color: '#181943',
  },
  stacked: { marginTop: scale(10) },
  code: { fontSize: Math.max(INPUT_FONT_SIZE, fontScale(18)), letterSpacing: scale(5) },
  row: { flexDirection: 'row', gap: scale(10), marginTop: scale(12) },
  flex: { flex: 1 },
  noTop: { marginTop: 0 },
  disabled: { opacity: 0.5 },
  deleteIntro: { marginTop: scale(22) },

  primary: {
    marginTop: scale(14),
    height: scale(48),
    minHeight: 44,
    borderRadius: scale(13),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ghost: {
    marginTop: scale(4),
    height: scale(48),
    minHeight: 44,
    borderRadius: scale(13),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  danger: {
    marginTop: scale(4),
    height: scale(48),
    minHeight: 44,
    borderRadius: scale(13),
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secretBox: {
    padding: scale(14),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  secretText: {
    fontSize: fontScale(15),
    // Wide tracking so the key can be read back character by character.
    letterSpacing: scale(2),
    color: '#181943',
  },
  secretHint: {
    marginTop: scale(6),
    fontSize: fontScale(12),
    color: '#8A8FA8',
  },
});

export default AccountSecurity;
