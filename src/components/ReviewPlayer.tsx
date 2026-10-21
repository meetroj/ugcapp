/**
 * Full-screen video player for a brand reviewing a submission (the website's
 * Work Review video modal). Unlike the shared VideoPreview it can carry the
 * UGCad sample watermark until the work is approved, and it says so when the
 * video fails to load, with a Retry. The native player has no download
 * action, so a watermarked preview cannot be saved from here.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { Text } from './Text';
import { bodyFont, fontScale, scale } from '../theme';

type Props = {
  uri: string | null;
  /** Show the sample watermark (anything not yet approved). */
  watermark?: boolean;
  title?: string;
  /** Reports the real length (seconds) once the player knows it. */
  onDuration?: (seconds: number) => void;
  onClose: () => void;
};

export default function ReviewPlayer({
  uri,
  watermark = false,
  title,
  onDuration,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A different video starts from a clean error state.
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [uri]);

  return (
    <Modal
      visible={!!uri}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        {!!uri && !failed && (
          <Video
            key={attempt}
            source={{ uri }}
            style={styles.video}
            resizeMode="contain"
            controls
            paused={false}
            repeat={false}
            onLoad={meta => {
              if (meta?.duration > 0) onDuration?.(meta.duration);
            }}
            onError={() => setFailed(true)}
          />
        )}

        {!!uri && !failed && watermark && (
          <View style={styles.mark} pointerEvents="none">
            {Array.from({ length: 5 }).map((_, row) => (
              <Text key={row} style={styles.markText} numberOfLines={1} ellipsizeMode="clip">
                UGCad · SAMPLE   UGCad · SAMPLE   UGCad · SAMPLE
              </Text>
            ))}
          </View>
        )}

        {failed && (
          <View style={styles.error}>
            <Text style={styles.errorTitle}>Video could not be loaded</Text>
            <Text style={styles.errorText}>
              Check your connection and retry loading the video.
            </Text>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => {
                setFailed(false);
                setAttempt(count => count + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry video"
            >
              <Text style={styles.retryText}>Retry video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top-left, level with Close: the bottom edge belongs to the native
            player controls and the title used to sit on top of them. */}
        {!!title && (
          <Text
            style={[
              styles.title,
              { top: insets.top + scale(12), left: insets.left + scale(16) },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.close,
            { top: insets.top + scale(12), right: insets.right + scale(16) },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close full-screen video"
          onPress={onClose}
        >
          <Text style={styles.label}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  video: { flex: 1 },
  mark: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'space-around',
    transform: [{ rotate: '-24deg' }],
  },
  markText: {
    color: 'rgba(255,255,255,0.16)',
    fontSize: fontScale(18),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    letterSpacing: 1,
  },
  error: {
    ...StyleSheet.absoluteFill,
    padding: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: fontScale(16),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorText: {
    marginTop: scale(6),
    fontSize: fontScale(14),
    color: '#B9BED6',
    textAlign: 'center',
  },
  retry: {
    marginTop: scale(14),
    minHeight: 44,
    paddingHorizontal: scale(22),
    borderRadius: scale(12),
    backgroundColor: '#5B63F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...bodyFont(700), fontSize: fontScale(14), color: '#FFFFFF' },
  title: {
    position: 'absolute',
    // Leaves room for the Close pill on the right.
    right: scale(120),
    height: 44,
    lineHeight: 44,
    fontSize: fontScale(14),
    color: 'rgba(255,255,255,0.85)',
  },
  close: {
    position: 'absolute',
    minHeight: 44,
    paddingHorizontal: scale(18),
    justifyContent: 'center',
    borderRadius: scale(22),
    backgroundColor: 'rgba(21,22,63,0.85)',
  },
  label: { ...bodyFont(600), fontSize: fontScale(14), color: '#FFFFFF' },
});
