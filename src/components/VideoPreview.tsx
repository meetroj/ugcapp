import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { Text } from './Text';
import { bodyFont, fontScale, scale } from '../theme';

export default function VideoPreview({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
      <View style={styles.screen}>
        {!!uri && <Video source={{ uri }} style={styles.video} resizeMode="contain"
          controls paused={false} repeat={false} />}
        <TouchableOpacity style={[styles.close, { top: insets.top + scale(12) }]}
          accessibilityRole="button" accessibilityLabel="Close full-screen video" onPress={onClose}>
          <Text style={styles.label}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  video: { flex: 1 },
  close: { position: 'absolute', right: scale(16), minHeight: scale(44), paddingHorizontal: scale(18), justifyContent: 'center', borderRadius: scale(22), backgroundColor: 'rgba(21,22,63,0.85)' },
  label: { ...bodyFont(600), fontSize: fontScale(14), color: '#FFFFFF' },
});
