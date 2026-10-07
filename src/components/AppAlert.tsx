import React, { useSyncExternalStore } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View,
  type AlertButton, type AlertOptions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from './Text';
import { bodyFont, displayFont, fontScale, scale } from '../theme';

type Dialog = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let sequence = 0;
let queue: Dialog[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => queue[0] || null;

/** Same call signature as native alerts, rendered by the app's shared host. */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue = [...queue, {
      id: ++sequence, title, message, options,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    }];
    emit();
  },
};

function finish(dialog: Dialog, button?: AlertButton) {
  // A rapid double tap must never approve/pay twice or dismiss the next dialog.
  if (queue[0]?.id !== dialog.id) return;
  queue = queue.slice(1);
  emit();
  if (button) button.onPress?.();
  else dialog.options?.onDismiss?.();
}

export default function AppAlertHost() {
  const dialog = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!dialog) return null;
  const destructive = dialog.buttons.some(button => button.style === 'destructive');
  const preferred = dialog.buttons.findIndex(button => button.isPreferred);
  const primary = preferred >= 0 ? preferred : dialog.buttons.reduce(
    (last, button, index) => button.style === 'cancel' ? last : index, -1,
  );
  const dismiss = () => {
    if (!dialog.options?.cancelable) return;
    finish(dialog);
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent
      onRequestClose={dismiss} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss}
          accessibilityLabel="Dismiss dialog" accessible={!!dialog.options?.cancelable} />
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={[styles.icon, destructive && styles.iconDanger]}>
              <Svg width={scale(25)} height={scale(25)} viewBox="0 0 24 24" fill="none">
                <Circle cx="12" cy="12" r="9" stroke={destructive ? '#D34550' : '#4C5BF3'} strokeWidth="1.7" />
                <Path d="M12 7v6m0 3h.01" stroke={destructive ? '#D34550' : '#4C5BF3'} strokeWidth="2" strokeLinecap="round" />
              </Svg>
            </View>
            <Text style={styles.title} accessibilityRole="header">{dialog.title}</Text>
            {!!dialog.message && <Text style={styles.message}>{dialog.message}</Text>}
            <View style={[styles.actions, dialog.buttons.length > 2 && styles.stacked]}>
              {dialog.buttons.map((button, index) => {
                const danger = button.style === 'destructive';
                const filled = index === primary && button.style !== 'cancel';
                return (
                  <TouchableOpacity key={`${dialog.id}-${index}`} accessibilityRole="button"
                    onPress={() => finish(dialog, button)}
                    style={[styles.button, filled && styles.primary, danger && styles.danger]}>
                    <Text style={[styles.buttonText, filled && styles.primaryText, danger && styles.primaryText]}>
                      {button.text || 'OK'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: scale(24), backgroundColor: 'rgba(10,13,35,0.55)' },
  card: { width: '100%', maxWidth: scale(380), maxHeight: '85%', padding: scale(24), borderRadius: scale(24), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECECF6', elevation: 12, shadowColor: '#0E1330', shadowOpacity: 0.16, shadowRadius: scale(24), shadowOffset: { width: 0, height: scale(8) } },
  icon: { width: scale(50), height: scale(50), borderRadius: scale(16), backgroundColor: '#EEEFFF', alignItems: 'center', justifyContent: 'center', marginBottom: scale(18) },
  iconDanger: { backgroundColor: '#FFF0F1' },
  title: { ...displayFont(600), fontSize: fontScale(20), lineHeight: fontScale(28), color: '#15163F' },
  message: { ...bodyFont(400), fontSize: fontScale(14), lineHeight: fontScale(22), color: '#737891', marginTop: scale(10) },
  actions: { flexDirection: 'row', gap: scale(10), marginTop: scale(24) },
  stacked: { flexDirection: 'column' },
  button: { flexGrow: 1, flexBasis: 0, minHeight: scale(48), paddingHorizontal: scale(14), paddingVertical: scale(13), borderRadius: scale(14), borderWidth: 1, borderColor: '#E5E6F0', backgroundColor: '#F7F8FC', alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  danger: { backgroundColor: '#D34550', borderColor: '#D34550' },
  buttonText: { ...bodyFont(600), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#595F80', textAlign: 'center' },
  primaryText: { color: '#FFFFFF' },
});
