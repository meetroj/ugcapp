/**
 * Withdrawal request - the native twin of the website's "Request Withdrawal"
 * modal (PayoutWithLayout.js).
 *
 * POST /api/withdrawal/request is real: it checks approval, KYC, the 2,500
 * minimum and the balance, deducts the amount and writes a `withdrawals`
 * record. So this screen reads the creator's FRESH figures from
 * GET /api/payout/overview (never the balance captured at login), blocks the
 * form until KYC is verified, lets the creator pick UPI or bank and see or
 * change the payout account, and sends the same body the website sends.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLiveEffect } from '../liveUpdates';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonBlock } from '../components/Skeleton';
import { getPayoutOverview, requestWithdrawal } from '../api';
import { CONTENT_MAX_WIDTH, scale, fontScale } from '../theme';
import {
  MIN_WITHDRAWAL_AMOUNT,
  amountIssue,
  cleanAmount,
  errorMessage,
  inr,
  withdrawalIssue,
  withdrawalPayload,
} from '../payoutRules';

type Props = {
  token: string;
  /**
   * Still passed by WebShell but no longer read: it is the balance from login
   * time and goes stale after every payout. The form loads its own.
   */
  available?: number;
  onBack: () => void;
  /** Opens KYC when it is not verified (before or after the request). */
  onVerifyKyc: () => void;
};

type Overview = {
  balance: number;
  kyc_status: string;
  kyc_rejection_reason?: string | null;
  bank_details?: Record<string, string>;
  upi_id?: string;
};

const GATE_COPY: Record<string, { title: string; body: string; cta: string }> = {
  not_submitted: {
    title: 'Verify your identity first',
    body: 'Withdrawals need a verified KYC. It only takes a couple of minutes.',
    cta: 'Start KYC',
  },
  pending: {
    title: 'KYC is under review',
    body: 'You can withdraw as soon as our team verifies your documents.',
    cta: 'View KYC status',
  },
  rejected: {
    title: 'KYC was not approved',
    body: 'Fix the issue and submit your KYC again to withdraw.',
    cta: 'Update KYC',
  },
};

function WithdrawalRequest({ token, onBack, onVerifyKyc }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [upi, setUpi] = useState('');
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');

  const [busy, setBusy] = useState(false);
  // Ref guard: state alone lets a fast double tap send two requests.
  const sending = useRef(false);
  const prefilled = useRef(false);
  const [error, setError] = useState('');
  const [needsKyc, setNeedsKyc] = useState(false);
  const [done, setDone] = useState<{ amount: number; message: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = (await getPayoutOverview(token)) as unknown as Overview;
      setOverview({ ...data, balance: Number(data?.balance || 0) });
      // Prefill the saved payout account once, so a creator who already has
      // one on file just confirms it, and anyone can change it.
      if (!prefilled.current) {
        prefilled.current = true;
        const bank = data?.bank_details || {};
        const hasBank = !!(bank.account_number || '').trim();
        setUpi(String(data?.upi_id || ''));
        setHolder(bank.account_holder_name || '');
        setAccount(bank.account_number || '');
        setIfsc(bank.ifsc_code || '');
        if (!data?.upi_id && hasBank) setMethod('bank');
      }
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not load your balance.'));
    }
  }, [token]);

  useLiveEffect(() => {
    let active = true;
    load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const retry = () => {
    setLoading(true);
    load().finally(() => setLoading(false));
  };

  const balance = overview?.balance ?? 0;
  const kycStatus = overview?.kyc_status || 'not_submitted';
  const kycOk = kycStatus === 'verified';
  const canWithdrawAll = balance >= MIN_WITHDRAWAL_AMOUNT;
  const liveAmountIssue = amount ? amountIssue(amount, balance) : '';

  const form = { amount, balance, method, upi, holder, account, ifsc };

  const onSubmit = useCallback(async () => {
    if (sending.current || !overview) return;
    const issue = withdrawalIssue(form);
    if (issue) {
      setError(issue);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    setNeedsKyc(false);
    try {
      const message = await requestWithdrawal(token, withdrawalPayload(form));
      setDone({
        amount: Number(amount),
        message: message || 'Withdrawal request submitted.',
      });
      // Show the reduced balance, not the one from before the request.
      load();
    } catch (e) {
      const text = errorMessage(e, 'Could not request the withdrawal.');
      // The backend answers 403 with a KYC message until identity is verified.
      if (/kyc/i.test(text)) setNeedsKyc(true);
      setError(text);
    } finally {
      sending.current = false;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, overview, amount, method, upi, holder, account, ifsc, balance, load]);

  const gate = GATE_COPY[kycStatus] || GATE_COPY.not_submitted;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Withdraw" onBack={onBack} />
      <KeyboardAvoidingView style={styles.sheet} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available balance</Text>
            {loading ? (
              <SkeletonBlock width={140} height={28} />
            ) : (
              <Text style={styles.balanceValue}>
                {overview ? inr(balance) : '-'}
              </Text>
            )}
          </View>

          {loadError && !loading ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{loadError}</Text>
              <TouchableOpacity
                style={styles.retry}
                onPress={retry}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {done ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneTitle}>Withdrawal requested</Text>
              <Text style={styles.doneBody}>
                {inr(done.amount)} is on its way. {done.message} You can follow
                it under Withdrawals in Earnings.
              </Text>
              <TouchableOpacity
                style={styles.submit}
                onPress={onBack}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>Back to Earnings</Text>
              </TouchableOpacity>
            </View>
          ) : overview && !kycOk ? (
            <View style={styles.gateCard}>
              <Text style={styles.gateTitle}>{gate.title}</Text>
              <Text style={styles.gateBody}>{gate.body}</Text>
              {kycStatus === 'rejected' && overview.kyc_rejection_reason ? (
                <Text style={styles.gateReason}>
                  Reason: {overview.kyc_rejection_reason}
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.submit}
                onPress={onVerifyKyc}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>{gate.cta}</Text>
              </TouchableOpacity>
            </View>
          ) : overview ? (
            <>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={text => {
                  setError('');
                  setAmount(cleanAmount(text));
                }}
                keyboardType="decimal-pad"
                placeholder={`Minimum ${inr(MIN_WITHDRAWAL_AMOUNT)}`}
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Withdrawal amount"
              />
              <View style={styles.amountRow}>
                <Text style={styles.hint}>
                  Minimum {inr(MIN_WITHDRAWAL_AMOUNT)}
                </Text>
                {canWithdrawAll ? (
                  <TouchableOpacity
                    style={styles.maxBtn}
                    onPress={() => {
                      setError('');
                      setAmount(String(Number(balance.toFixed(2))));
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.max}>Withdraw all</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {liveAmountIssue ? (
                <Text style={styles.error}>{liveAmountIssue}</Text>
              ) : null}

              <Text style={styles.label}>Payment method</Text>
              <View style={styles.chips}>
                {(['upi', 'bank'] as const).map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.chip, method === option && styles.chipOn]}
                    onPress={() => {
                      setError('');
                      setMethod(option);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: method === option }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        method === option && styles.chipTextOn,
                      ]}
                    >
                      {option === 'upi' ? 'UPI' : 'Bank Transfer'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {method === 'upi' ? (
                <>
                  <Text style={styles.label}>UPI ID</Text>
                  <TextInput
                    style={styles.input}
                    value={upi}
                    onChangeText={text => {
                      setError('');
                      setUpi(text.trim());
                    }}
                    placeholder="name@bank"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Account holder name</Text>
                  <TextInput
                    style={styles.input}
                    value={holder}
                    onChangeText={text => {
                      setError('');
                      setHolder(text);
                    }}
                    placeholder="Full name"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  <Text style={styles.label}>Account number</Text>
                  <TextInput
                    style={styles.input}
                    value={account}
                    onChangeText={text => {
                      setError('');
                      setAccount(text.replace(/\D/g, '').slice(0, 18));
                    }}
                    keyboardType="number-pad"
                    placeholder="Account number"
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text style={styles.label}>IFSC code</Text>
                  <TextInput
                    style={styles.input}
                    value={ifsc}
                    onChangeText={text => {
                      setError('');
                      setIfsc(
                        text
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                          .slice(0, 11),
                      );
                    }}
                    autoCapitalize="characters"
                    placeholder="e.g. HDFC0001234"
                    placeholderTextColor="#9CA3AF"
                  />
                </>
              )}

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
                style={[styles.submit, (busy || !amount) && styles.submitOff]}
                onPress={onSubmit}
                disabled={busy || !amount}
                accessibilityRole="button"
              >
                <Text style={styles.submitText}>
                  {busy ? 'Requesting…' : 'Request withdrawal'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.note}>
                Payouts are processed in about 7 business days after the team
                reviews your request. The platform fee and any TDS are already
                taken from each payment before it reaches your balance, so you
                receive the full amount you request.
              </Text>
            </>
          ) : null}
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
  // Centred, capped column so the form does not stretch edge to edge on a tablet.
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(16),
    paddingBottom: scale(32),
  },
  balanceCard: {
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#EEEFFF',
    borderWidth: 1,
    borderColor: '#E1E2F8',
  },
  balanceLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#7E829D',
  },
  balanceValue: {
    marginTop: scale(8),
    fontSize: fontScale(24),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  label: {
    marginTop: scale(24),
    marginBottom: scale(8),
    fontSize: fontScale(12),
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { flexShrink: 1, fontSize: fontScale(12), color: '#9295AA' },
  maxBtn: {
    minHeight: scale(44),
    paddingHorizontal: scale(4),
    justifyContent: 'center',
  },
  max: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  chips: { flexDirection: 'row', gap: scale(10) },
  chip: {
    flex: 1,
    minHeight: scale(46),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  chipOn: { backgroundColor: '#5B5CF6', borderColor: '#5B5CF6' },
  chipText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  chipTextOn: { color: '#FFFFFF' },
  error: {
    marginTop: scale(12),
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
  errorBox: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
  },
  errorBoxText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B3261E',
  },
  retry: {
    marginTop: scale(8),
    minHeight: scale(44),
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
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
    marginTop: scale(16),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
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
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7E829D',
  },
  gateCard: {
    marginTop: scale(18),
    padding: scale(18),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  gateTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  gateBody: {
    marginTop: scale(8),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7E829D',
  },
  gateReason: {
    marginTop: scale(8),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
});

export default WithdrawalRequest;
