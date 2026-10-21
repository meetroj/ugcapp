/**
 * Two small sheets for the creator's Deal Room: "Need help?" (the site's
 * Get Help dialog: email / call / WhatsApp) and "Rate the brand" (the site's
 * ReviewModal -> POST /reviews once a deal is Paid - Complete).
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import { Alert } from '../components/AppAlert';
import { postReview } from '../api';
import { CONTENT_MAX_WIDTH, fontScale, scale } from '../theme';

// Same contacts as the website's HoverSideRail help dialog.
export const SUPPORT_EMAIL = 'support@ugcad.io';
export const SUPPORT_PHONE = '+919000000000';
export const SUPPORT_WHATSAPP = 'https://wa.me/919000000000';

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const rows = [
    { label: 'Email', value: SUPPORT_EMAIL, url: `mailto:${SUPPORT_EMAIL}` },
    { label: 'Call', value: SUPPORT_PHONE, url: `tel:${SUPPORT_PHONE}` },
    { label: 'WhatsApp', value: 'Chat with us', url: SUPPORT_WHATSAPP },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(scale(28), insets.bottom + scale(12)) }]}>
          <Text style={styles.title}>Need help?</Text>
          <Text style={styles.sub}>Our team is here for you.</Text>
          {rows.map(row => (
            <TouchableOpacity
              key={row.label}
              style={styles.helpRow}
              onPress={() => Linking.openURL(row.url).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`${row.label}: ${row.value}`}
            >
              <Text style={styles.helpLabel}>{row.label}</Text>
              <Text style={styles.helpValue}>{row.value}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.note}>Support hours: Mon-Fri, 10:00 AM - 7:00 PM IST</Text>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} accessibilityRole="button">
            <Text style={styles.ghostText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

type RateProps = {
  visible: boolean;
  token: string;
  campaignId: string;
  businessId: string;
  brandName: string;
  onClose: () => void;
  /** Review stored; the row stops asking. */
  onDone: () => void;
};

export function RateBrandSheet({ visible, token, campaignId, businessId, brandName, onClose, onDone }: RateProps) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const submit = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await postReview(token, { campaign_id: campaignId, business_id: businessId, rating, review: review.trim() });
      Alert.alert('Thanks', 'Review submitted. Thanks for the feedback!');
      onDone();
      onClose();
    } catch (e) {
      // e.g. 409 "You have already reviewed this" is shown as the backend words it.
      setError(e instanceof Error && e.message ? e.message : 'Could not submit your review');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      {/* Lifts the sheet above the keyboard (padding works on Android too under edge-to-edge). */}
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={[styles.sheet, { paddingBottom: Math.max(scale(28), insets.bottom + scale(12)) }]}>
          <Text style={styles.title}>Rate the brand</Text>
          <Text style={styles.sub}>{`How was working with ${brandName || 'this brand'}?`}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                style={styles.star}
                onPress={() => setRating(n)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: rating === n }}
                accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
              >
                <Text style={[styles.starGlyph, rating >= n && styles.starOn]}>{'★'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={review}
            onChangeText={setReview}
            placeholder="Share how the collaboration went (optional)"
            placeholderTextColor="#A9ADC2"
            multiline
            editable={!busy}
          />
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={submit} disabled={busy} accessibilityRole="button" accessibilityLabel="Submit review">
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryText}>Submit review</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,22,58,0.5)' },
  sheet: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(18),
    paddingBottom: scale(28),
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: fontScale(17), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  sub: { marginTop: scale(4), marginBottom: scale(10), fontSize: fontScale(14), color: '#6B7094' },
  helpRow: {
    minHeight: scale(52),
    marginTop: scale(8),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#EEF0F6',
    justifyContent: 'center',
  },
  helpLabel: { fontSize: fontScale(13), color: '#7A7F9C' },
  helpValue: { fontSize: fontScale(15), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#15163A' },
  note: { marginTop: scale(12), textAlign: 'center', fontSize: fontScale(13), color: '#7A7F9C' },
  stars: { flexDirection: 'row', justifyContent: 'center', marginVertical: scale(8) },
  star: { width: scale(48), height: scale(48), alignItems: 'center', justifyContent: 'center' },
  starGlyph: { fontSize: fontScale(32), color: '#C7CBE0' },
  starOn: { color: '#F5B301' },
  input: {
    minHeight: scale(88),
    padding: scale(12),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E6E8F3',
    textAlignVertical: 'top',
    fontSize: 16,
    color: '#15163A',
  },
  error: { marginTop: scale(8), fontSize: fontScale(14), color: '#C0392B' },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: scale(14) },
  btn: { flex: 1, minWidth: 0, minHeight: scale(48), marginTop: scale(4), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#F1F2F9' },
  primary: { backgroundColor: '#4452F0' },
  ghostText: { color: '#4A5568', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
  primaryText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
});
