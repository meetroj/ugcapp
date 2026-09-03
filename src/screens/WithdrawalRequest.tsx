/**
 * Withdrawal request — the native replacement for the web /withdrawal/new form,
 * the last step in Earnings that still handed the user to the website.
 *
 * Note on scope: POST /api/withdrawal/request is a STUB on the backend today.
 * Its KYC gate is real and enforced (no payout on an unverified identity), but
 * it ignores the amount and does not create a payout record — it just returns
 * "Withdrawal requested". This screen therefore collects the amount, enforces
 * the same client-side limits, and reports exactly what the backend did rather
 * than implying money is on its way.
 */
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { requestWithdrawal } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  /** Available balance, passed in from Earnings so the cap is accurate. */
  available: number;
  onBack: () => void;
  /** Opens KYC when the backend rejects the request as unverified. */
  onVerifyKyc: () => void;
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

function WithdrawalRequest({ token, available, onBack, onVerifyKyc }: Props) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsKyc, setNeedsKyc] = useState(false);
  const [done, setDone] = useState(false);

  const value = Number(amount || 0);
  const tooMuch = value > available;
  const valid = value > 0 && !tooMuch;

  const onSubmit = useCallback(async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    setNeedsKyc(false);
    try {
      await requestWithdrawal(token, value);
      setDone(true);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not request the withdrawal.';
      // The backend returns 403 with a KYC message until identity is verified.
      if (/kyc/i.test(message)) setNeedsKyc(true);
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, token, valid, value]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Withdraw" onBack={onBack} />
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available balance</Text>
            <Text style={styles.balanceValue}>{money(available)}</Text>
          </View>

          {done ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneTitle}>Request submitted</Text>
              <Text style={styles.doneBody}>
                Your withdrawal request for {money(value)} was received. Payouts
                are handled manually by the UGCad team — contact
                support@ugcad.io if you don't hear back.
              </Text>
              <TouchableOpacity
                style={styles.submit}
                onPress={onBack}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>Back to Earnings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={text => {
                  setError('');
                  setAmount(text.replace(/[^0-9]/g, ''));
                }}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                onPress={() => setAmount(String(Math.floor(available)))}
                accessibilityRole="button"
              >
                <Text style={styles.max}>Withdraw all</Text>
              </TouchableOpacity>

              {tooMuch ? (
                <Text style={styles.error}>
                  That's more than your available balance.
                </Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {needsKyc ? (
                <TouchableOpacity
                  style={styles.kycBtn}
                  onPress={onVerifyKyc}
                  accessibilityRole="button"
                >
                  <Text style={styles.kycText}>Verify KYC</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.submit, !valid && styles.submitOff]}
                onPress={onSubmit}
                disabled={!valid || busy}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>
                  {busy ? 'Requesting…' : 'Request withdrawal'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.note}>
                Withdrawals require a verified KYC and are reviewed by the UGCad
                team before payout.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    overflow: 'hidden',
  },
  content: { padding: scale(16), paddingBottom: scale(34) },
  balanceCard: {
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#EEEFFF',
    borderWidth: 1,
    borderColor: '#E1E2F8',
  },
  balanceLabel: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#7E829D',
  },
  balanceValue: {
    marginTop: scale(6),
    fontSize: fontScale(24),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  label: {
    marginTop: scale(20),
    marginBottom: scale(6),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#7E829D',
  },
  input: {
    height: scale(52),
    paddingHorizontal: scale(14),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    fontSize: fontScale(18),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#181943',
  },
  max: {
    marginTop: scale(8),
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  error: {
    marginTop: scale(12),
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
  kycBtn: {
    marginTop: scale(12),
    height: scale(46),
    borderRadius: scale(13),
    borderWidth: 1,
    borderColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  submit: {
    marginTop: scale(18),
    height: scale(52),
    borderRadius: scale(14),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { opacity: 0.5 },
  submitText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  note: {
    marginTop: scale(14),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#9295AA',
    textAlign: 'center',
  },
  doneCard: {
    marginTop: scale(18),
    padding: scale(18),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  doneTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#1FA971',
  },
  doneBody: {
    marginTop: scale(8),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
  },
});

export default WithdrawalRequest;
