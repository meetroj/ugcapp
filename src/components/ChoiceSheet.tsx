/**
 * Styled choice/confirm dialog — the app's replacement for the raw
 * Alert.alert() menu, which renders as a bare system dialog that looks nothing
 * like the product. Use this for any confirm or multi-option prompt so every
 * dialog is a rounded, on-brand card.
 *
 * Usage:
 *   <ChoiceSheet
 *     visible={open}
 *     title="Report this user?"
 *     message="Our team reviews every report."
 *     options={[
 *       { label: 'Abusive or harassing', onPress: () => report('abuse') },
 *       { label: 'Sharing contact details', onPress: () => report('contact') },
 *     ]}
 *     onClose={() => setOpen(false)}
 *   />
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { scale, fontScale } from '../theme';

export type ChoiceOption = {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'destructive';
};

export default function ChoiceSheet({
  visible,
  title,
  message,
  options,
  cancelLabel = 'Cancel',
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  options: ChoiceOption[];
  cancelLabel?: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.centre} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.options}>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={styles.option}
                onPress={() => {
                  onClose();
                  opt.onPress();
                }}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.optionText,
                    opt.tone === 'destructive' && styles.destructive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.option} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,13,35,0.45)' },
  centre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: scale(24) },
  card: {
    width: '100%',
    maxWidth: scale(420),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(20),
    padding: scale(20),
  },
  title: { fontSize: fontScale(18), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163F' },
  message: { marginTop: scale(8), fontSize: fontScale(13.5), lineHeight: fontScale(20), color: '#5C6079' },
  options: { marginTop: scale(14), gap: scale(2) },
  option: { paddingVertical: scale(13), alignItems: 'center' },
  optionText: { fontSize: fontScale(15), fontFamily: 'ReadexPro-SemiBold', fontWeight: '700', color: '#4C4DD6' },
  destructive: { color: '#D6407F' },
  cancelText: { fontSize: fontScale(15), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#9295AA' },
});
