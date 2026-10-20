/**
 * The Deal Room's own chat (the site's floating deal chat). Messages come from
 * the deal payload (chat_summary.messages, refreshed with the deal) and a send
 * is POST /api/deals/{id}/chat, so the brand sees it inside their Deal Room too.
 * The header chat icon still opens the 1:1 thread; this is the per-deal one.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { sendDealMessage } from '../api';
import { fontScale, scale } from '../theme';

type Props = {
  visible: boolean;
  token: string;
  dealId: string;
  title: string;
  messages: any[];
  /** Text to put in the box when the sheet opens (e.g. the revision question). */
  prefill?: string;
  onClose: () => void;
  /** A message was stored; refetch the deal so it appears. */
  onSent: () => void;
};

export default function DealChat({ visible, token, dealId, title, messages, prefill = '', onClose, onSent }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (visible) setText(current => current || prefill);
  }, [visible, prefill]);

  const send = async () => {
    const body = text.trim();
    if (!body || lock.current) return;
    lock.current = true;
    setSending(true);
    setError('');
    try {
      await sendDealMessage(token, dealId, body);
      setText('');
      onSent();
    } catch (e) {
      // Kept in the box so the text survives a dropped connection or a contact-info block.
      setError(e instanceof Error && e.message ? e.message : 'Message failed');
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>{title || 'Deal chat'}</Text>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chat">
              <Text style={styles.closeText}>{'×'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={scroller}
            style={styles.list}
            contentContainerStyle={styles.listBody}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 && <Text style={styles.empty}>No messages yet. Say hello to the brand.</Text>}
            {messages.map((m, i) => {
              if (m.sender_type === 'system') {
                return (
                  <Text key={m.id || i} style={styles.system}>{String(m.message || '')}</Text>
                );
              }
              const mine = m.sender_type === 'creator';
              return (
                <View key={m.id || i} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {!mine && <Text style={styles.who}>{String(m.sender_name || 'Brand')}</Text>}
                    <Text style={mine ? styles.mineText : styles.theirText}>{String(m.message || '')}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message"
              placeholderTextColor="#A9ADC2"
              multiline
              editable={!sending}
              testID="deal-chat-input"
            />
            <TouchableOpacity
              style={[styles.send, (!text.trim() || sending) && styles.sendOff]}
              onPress={send}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.sendText}>Send</Text>}
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
    height: '80%',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: scale(16), borderBottomWidth: 1, borderBottomColor: '#EEF0F6' },
  title: { flex: 1, fontSize: fontScale(15), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  close: { width: scale(48), height: scale(48), alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: fontScale(26), color: '#15163A' },
  list: { flex: 1, backgroundColor: '#F5F6FB' },
  listBody: { padding: scale(12) },
  empty: { marginTop: scale(30), textAlign: 'center', fontSize: fontScale(13), color: '#9296BA' },
  system: { alignSelf: 'center', marginVertical: scale(6), paddingHorizontal: scale(12), textAlign: 'center', fontSize: fontScale(12), color: '#7E829D' },
  bubbleRow: { flexDirection: 'row', marginVertical: scale(3) },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: scale(12), paddingVertical: scale(8), borderRadius: scale(14) },
  mine: { backgroundColor: '#4452F0' },
  theirs: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEDF6' },
  who: { marginBottom: scale(2), fontSize: fontScale(11), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#7E829D' },
  mineText: { fontSize: fontScale(14), lineHeight: fontScale(20), color: '#FFFFFF' },
  theirText: { fontSize: fontScale(14), lineHeight: fontScale(20), color: '#15163A' },
  error: { paddingHorizontal: scale(14), paddingTop: scale(6), fontSize: fontScale(12), color: '#C0392B' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: scale(10), gap: scale(8), borderTopWidth: 1, borderTopColor: '#EEF0F6' },
  // 16px so iOS does not zoom the screen when the field is focused.
  input: {
    flex: 1,
    minHeight: scale(46),
    maxHeight: scale(110),
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#15163A',
  },
  send: { minWidth: scale(64), minHeight: scale(46), borderRadius: scale(12), backgroundColor: '#4452F0', alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.5 },
  sendText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
});
