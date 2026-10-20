/**
 * Small self-dismissing message for quick feedback ("Saved to your list").
 * `useToast()` hands back the text to render and a `show` function; render
 * `<ToastBar message={...} />` once near the bottom of the screen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

const SHOW_MS = 2400;

export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(''), SHOW_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { message, show };
}

export function ToastBar({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={styles.bar}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits above the floating bottom nav so it is never hidden behind it.
  wrap: { position: 'absolute', left: 0, right: 0, bottom: NAV_CLEARANCE + scale(8), alignItems: 'center', paddingHorizontal: scale(20) },
  bar: { maxWidth: '100%', paddingHorizontal: scale(16), paddingVertical: scale(11), borderRadius: scale(12), backgroundColor: '#15163F' },
  text: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
});
