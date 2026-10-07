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
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
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
  disableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
  verifyTwoFactor,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  /** Deactivating ends the session, so the shell has to drop the user out. */
  onLogout?: () => void;
};

/** Mirrors the backend's own minimum. */
const MIN_PASSWORD = 6;

function AccountSecurity({ token, onBack, onLogout }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [twoFactorOn, setTwoFactorOn] = useState<boolean | null>(null);
  /** The secret from /2fa/setup, held while the user enters their first code. */
  const [secret, setSecret] = useState('');
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

  const confirmDeactivate = useCallback(() => {
    Alert.alert(
      'Deactivate account',
      'Your profile stops appearing to brands and you are signed out. Contact support to reactivate.',
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
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
        />
        <TextInput
          style={[styles.input, styles.stacked]}
          value={next}
          onChangeText={setNext}
          placeholder="New password"
          placeholderTextColor="#A9ADC2"
          secureTextEntry
        />
        <TextInput
          style={[styles.input, styles.stacked]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor="#A9ADC2"
          secureTextEntry
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
          Deactivating hides your profile from brands and signs you out. Open
          deals and payouts are unaffected.
        </Text>
        <TouchableOpacity
          style={styles.danger}
          onPress={confirmDeactivate}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Deactivate my account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },
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
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
  },
  input: {
    height: scale(48),
    paddingHorizontal: scale(13),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    fontSize: fontScale(13),
    color: '#181943',
  },
  stacked: { marginTop: scale(10) },
  code: { fontSize: fontScale(18), letterSpacing: scale(5) },
  row: { flexDirection: 'row', gap: scale(10), marginTop: scale(12) },
  flex: { flex: 1 },
  noTop: { marginTop: 0 },

  primary: {
    marginTop: scale(14),
    height: scale(48),
    borderRadius: scale(13),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ghost: {
    marginTop: scale(4),
    height: scale(48),
    borderRadius: scale(13),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  danger: {
    marginTop: scale(4),
    height: scale(48),
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
    fontSize: fontScale(11),
    color: '#8A8FA8',
  },
});

export default AccountSecurity;
