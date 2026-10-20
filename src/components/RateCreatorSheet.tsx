/**
 * Star rating + optional comment for a creator after a deal (the website's
 * ReviewModal). The caller owns the POST; this only collects rating and text,
 * blocks a double submit and shows the caller's error inline, so a failed
 * request never loses what was typed.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from './Text';
import { fontScale, scale } from '../theme';

type Props = {
  visible: boolean;
  /** Creator being rated, for the title. */
  creatorName: string;
  subtitle?: string;
  /** Throw to keep the sheet open with the message; resolve to close it. */
  onSubmit: (rating: number, review: string) => Promise<void>;
  onClose: () => void;
};

export default function RateCreatorSheet({
  visible,
  creatorName,
  subtitle,
  onSubmit,
  onClose,
}: Props) {
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  // A fresh sheet starts from five stars and no text.
  useEffect(() => {
    if (visible) {
      setStars(5);
      setReview('');
      setError('');
    }
  }, [visible]);

  const submit = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSubmit(stars, review.trim());
    } catch (err: any) {
      setError(String(err?.message || 'Could not submit your review.'));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>
            How was working with {creatorName || 'this creator'}?
          </Text>
          <Text style={styles.body}>
            {subtitle || 'Optional, and visible on their public profile.'}
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(value => (
              <TouchableOpacity
                key={value}
                style={styles.starHit}
                onPress={() => setStars(value)}
                accessibilityRole="button"
                accessibilityLabel={`${value} star${value > 1 ? 's' : ''}`}
                accessibilityState={{ selected: value <= stars }}
              >
                <Text style={[styles.star, value <= stars && styles.starOn]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={review}
            onChangeText={setReview}
            placeholder="What stood out? (optional)"
            placeholderTextColor="#A9ADC2"
            multiline
            editable={!busy}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.skip}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.send, busy && styles.sendOff]}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendText}>Submit review</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  sheet: {
    width: '100%',
    maxWidth: scale(360),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(18),
  },
  title: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-Medium',
    color: '#25274C',
  },
  body: { marginTop: scale(5), fontSize: fontScale(12), color: '#858AA3' },
  stars: { flexDirection: 'row', marginTop: scale(10), marginBottom: scale(4) },
  starHit: {
    minWidth: scale(44),
    minHeight: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: { fontSize: fontScale(30), color: '#DCDEEB' },
  starOn: { color: '#F5B301' },
  input: {
    marginTop: scale(10),
    minHeight: scale(78),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    padding: scale(12),
    fontSize: fontScale(16),
    color: '#25274C',
    textAlignVertical: 'top',
  },
  error: { marginTop: scale(8), fontSize: fontScale(12), color: '#B3261E' },
  actions: { flexDirection: 'row', gap: scale(10), marginTop: scale(14) },
  skip: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  send: {
    flex: 1.4,
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.6 },
  sendText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
