/**
 * Booking request card for the creator's Deal Room (the site's
 * components/BookingCard.js, creator half). A direct booking is paid into
 * escrow by the brand up front, but the creator is not committed until they
 * answer here:
 *   pending_creator -> Accept / Decline (optional reason) / Propose another price
 *   price_revision  -> "Counter sent, waiting for the brand"
 *   accepted        -> "Waiting for the brand to send the brief"
 * Every answer is POST /api/bookings/{campaign.id}/respond.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { Alert } from '../components/AppAlert';
import { respondToBooking } from '../api';
import { bookingStage, validateCounter } from '../dealRoom';
import { dateLabel } from '../briefs';
import { fontScale, scale } from '../theme';

type Props = {
  deal: Record<string, any>;
  token: string;
  /** Refetch the deal after the booking changed on the server. */
  onDone: () => void;
};

const inr = (n: unknown) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const DONE_MESSAGE = {
  accept: 'Booking accepted. The brand will send the brief next.',
  decline: 'Booking declined. The brand has been refunded.',
  revise: 'Your price was sent to the brand.',
} as const;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

export default function DealBooking({ deal, token, onDone }: Props) {
  const stage = bookingStage(deal);
  const campaign = deal.campaign || {};
  const subtotal = Number(campaign.budget_max || campaign.budget_min || 0);
  const [mode, setMode] = useState<null | 'decline' | 'revise'>(null);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState(String(subtotal || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A ref as well as state: two quick taps land before the re-render disables the button.
  const lock = useRef(false);

  if (!stage) return null;
  const brandName = deal.brand?.name || campaign.brand_name || 'A brand';
  const campaignId = String(campaign.id || '');

  const respond = async (
    action: 'accept' | 'decline' | 'revise',
    extra: { amount?: number; message?: string } = {},
  ) => {
    if (lock.current || !campaignId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await respondToBooking(token, campaignId, { action, ...extra });
      Alert.alert('Done', DONE_MESSAGE[action]);
      setMode(null);
      onDone();
    } catch (e) {
      // Keeps the form open so the creator can retry (also after being offline).
      setError(e instanceof Error && e.message ? e.message : 'Something went wrong');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const sendCounter = () => {
    const problem = validateCounter(price);
    if (problem) {
      setError(problem);
      return;
    }
    respond('revise', { amount: Number(price.replace(/,/g, '')), message: note.trim() });
  };

  if (stage === 'counter_sent') {
    return (
      <View style={styles.card} testID="booking-counter-sent">
        <Text style={styles.wait}>
          You proposed <Text style={styles.waitBold}>{inr(campaign.proposed_amount)}</Text>. Waiting for the
          brand to accept or cancel.
        </Text>
      </View>
    );
  }
  if (stage === 'awaiting_brief') {
    return (
      <View style={styles.card} testID="booking-awaiting-brief">
        <Text style={styles.wait}>
          Booking confirmed. Waiting for the brand to send the brief. The work starts then.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="booking-request">
      <Text style={styles.tag}>BOOKING REQUEST</Text>
      <Text style={styles.title}>{brandName} wants to book you</Text>
      <Text style={styles.sub}>
        The payment is already held in escrow. Accept to lock it in, or tell them your price.
      </Text>
      <View style={styles.facts}>
        <Row label="Videos" value={String(campaign.video_count || 1)} />
        <Row label="Delivery" value={dateLabel(campaign.delivery_date) || '-'} />
        <Row label="You'll be paid" value={inr(subtotal)} strong />
      </View>

      {mode === 'decline' && (
        <View>
          <Text style={styles.fieldLabel}>Reason (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Let the brand know why"
            placeholderTextColor="#A9ADC2"
            multiline
            editable={!busy}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => { setMode(null); setError(''); }} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => respond('decline', { message: note.trim() })} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.solidText}>Confirm decline</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mode === 'revise' && (
        <View>
          <Text style={styles.fieldLabel}>Your price for this booking</Text>
          <TextInput
            style={styles.input}
            value={price}
            // Digits only: a stray letter would print "₹NaN" on the button.
            onChangeText={text => setPrice(text.replace(/[^0-9.,]/g, ''))}
            keyboardType="numeric"
            placeholder={String(subtotal)}
            placeholderTextColor="#A9ADC2"
            editable={!busy}
            testID="booking-price-input"
          />
          <Text style={styles.fieldLabel}>Message (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Why this price?"
            placeholderTextColor="#A9ADC2"
            multiline
            editable={!busy}
          />
          <Text style={styles.hint}>
            The brand pays the difference if it is higher, or gets a refund if it is lower. They can still cancel.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => { setMode(null); setError(''); }} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={sendCounter} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.solidText}>{`Propose ${inr(price || 0)}`}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!mode && (
        <View style={styles.stack}>
          <TouchableOpacity style={[styles.btn, styles.go]} onPress={() => respond('accept')} disabled={busy} accessibilityRole="button" accessibilityLabel="Accept booking">
            {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.solidText}>Accept booking</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => { setNote(''); setPrice(String(subtotal || '')); setError(''); setMode('revise'); }} disabled={busy} accessibilityRole="button" accessibilityLabel="Propose another price">
            <Text style={styles.ghostText}>Propose another price</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.dangerGhost]} onPress={() => { setNote(''); setError(''); setMode('decline'); }} disabled={busy} accessibilityRole="button" accessibilityLabel="Decline booking">
            <Text style={styles.dangerText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: scale(12),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8ECFF',
    borderLeftWidth: scale(4),
    borderLeftColor: '#4452F0',
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(10),
    overflow: 'hidden',
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4452F0',
    backgroundColor: '#EEF0FF',
  },
  title: {
    marginTop: scale(8),
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#07074E',
  },
  sub: { marginTop: scale(4), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#64748B' },
  facts: {
    marginTop: scale(12),
    marginBottom: scale(6),
    padding: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#EEF0F6',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: scale(12), paddingVertical: scale(3) },
  rowLabel: { flexShrink: 0, fontSize: fontScale(14), color: '#64748B' },
  rowValue: { flexShrink: 1, textAlign: 'right', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#07074E' },
  rowStrong: { fontSize: fontScale(16) },
  fieldLabel: {
    marginTop: scale(10),
    marginBottom: scale(5),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#2D3748',
  },
  // 16px so iOS does not zoom the screen when the field is focused.
  input: {
    minHeight: scale(46),
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
    borderRadius: scale(9),
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#15163A',
  },
  multiline: { minHeight: scale(72), textAlignVertical: 'top' },
  hint: { marginTop: scale(8), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#64748B' },
  stack: { marginTop: scale(8), gap: scale(8) },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: scale(12) },
  btn: {
    flex: 1,
    minWidth: 0,
    minHeight: scale(46),
    paddingHorizontal: scale(12),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  go: { backgroundColor: '#16A34A' },
  primary: { backgroundColor: '#4452F0' },
  danger: { backgroundColor: '#D64545' },
  ghost: { backgroundColor: '#F1F2F9' },
  dangerGhost: { backgroundColor: '#FFFFFF', borderColor: '#FECACA' },
  solidText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', textAlign: 'center' },
  ghostText: { color: '#4A5568', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', textAlign: 'center' },
  dangerText: { color: '#B91C1C', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', textAlign: 'center' },
  wait: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#475569' },
  waitBold: { fontFamily: 'Inter-Bold', fontWeight: '700', color: '#07074E' },
  error: { marginTop: scale(10), fontSize: fontScale(14), color: '#C0392B' },
});
