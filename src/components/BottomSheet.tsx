/**
 * Bottom sheet for filters, pickers and short notices that need more room than
 * ChoiceSheet's centred card: a title, scrolling content and a pinned footer.
 * The device's bottom inset is applied once, to the footer.
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { CONTENT_COLUMN, scale, fontScale } from '../theme';

export default function BottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling content (primary and secondary buttons). */
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Live height so a rotation re-caps the sheet (landscape is ~390 tall).
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      {/* Padding on both platforms: RN 0.87 is edge-to-edge, so the keyboard does
          not resize the window and would cover a filter field in the sheet. */}
      <KeyboardAvoidingView style={styles.dock} behavior="padding" pointerEvents="box-none">
        <View style={[styles.sheet, { maxHeight: height * 0.85 }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {!!footer && <View style={[styles.footer, { paddingBottom: scale(14) + insets.bottom }]}>{footer}</View>}
          {!footer && <View style={{ height: insets.bottom }} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,13,35,0.45)' },
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Centred, phone-width column on tablets.
    ...CONTENT_COLUMN,
    // Shrinks with the keyboard-padded dock instead of running off the top
    // (maxHeight is 85% of the full window, taller than what is left above the
    // keyboard); the scroll area below gives up the height.
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    marginTop: scale(8),
    width: scale(38),
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: '#DADCE8',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(18),
    paddingTop: scale(10),
    paddingBottom: scale(6),
  },
  title: { flex: 1, fontSize: fontScale(17), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163F' },
  close: { width: scale(44), height: scale(44), alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: fontScale(16), color: '#5C6079' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: scale(18), paddingBottom: scale(12) },
  footer: {
    flexDirection: 'row',
    gap: scale(10),
    paddingHorizontal: scale(18),
    paddingTop: scale(10),
    borderTopWidth: 1,
    borderTopColor: '#ECEDF5',
    backgroundColor: '#FFFFFF',
  },
});
