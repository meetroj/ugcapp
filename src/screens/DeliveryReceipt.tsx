/**
 * "Mark received" sheet for the creator's Deal Room. Mirrors the site's
 * Shipping / Receipt block and ShipmentTracking's receive form: an unboxing
 * video is required (POST /deals/{id}/receipt answers 400 without one) and the
 * creator can tick "Report damaged or wrong items" with a description, which
 * the backend turns into an open damage report.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Text, TextInput } from '../components/Text';
import { Alert } from '../components/AppAlert';
import UploadProgressBar from '../components/UploadProgressBar';
import { confirmDealReceipt, uploadMedia, MAX_VIDEO_UPLOAD_MB } from '../api';
import { fontScale, scale } from '../theme';

type Picked = { uri: string; fileName?: string | null; type?: string | null; fileSize?: number | null };

/** What stops the creator from submitting, in her words; '' when it is ready. */
export function receiptProblem(opts: { canMark: boolean; hasVideo: boolean; damaged: boolean; description: string }): string {
  if (!opts.canMark) return 'You can mark the product received only after the brand ships it.';
  if (!opts.hasVideo) return 'Upload an unboxing video before marking received.';
  if (opts.damaged && !opts.description.trim()) return 'Describe what is damaged or wrong.';
  return '';
}

type Props = {
  visible: boolean;
  token: string;
  dealId: string;
  /** deal.can_mark_received */
  canMark: boolean;
  onClose: () => void;
  /** Receipt saved on the server; refetch the deal. */
  onDone: () => void;
};

export default function DeliveryReceipt({ visible, token, dealId, canMark, onClose, onDone }: Props) {
  const [video, setVideo] = useState<Picked | null>(null);
  const [damaged, setDamaged] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const pick = async () => {
    setError('');
    try {
      // Video only: a photo cannot stand in for the unboxing clip.
      const picked = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 });
      const asset = picked.assets?.[0];
      if (asset?.uri) {
        setVideo({ uri: asset.uri, fileName: asset.fileName, type: asset.type, fileSize: asset.fileSize });
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not open your gallery.');
    }
  };

  const submit = async () => {
    if (lock.current) return;
    const problem = receiptProblem({ canMark, hasVideo: !!video, damaged, description });
    if (problem) {
      setError(problem);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setPercent(0);
    try {
      const url = await uploadMedia(token, video as Picked, 'file', setPercent);
      if (!url) throw new Error('The upload did not return a file URL.');
      await confirmDealReceipt(token, dealId, url, {
        items_damaged: damaged,
        damage_report: damaged ? description.trim() : null,
      });
      Alert.alert(
        damaged ? 'Receipt submitted' : 'Receipt confirmed',
        damaged
          ? 'Your damage report was sent to the brand and our team.'
          : 'Thanks. You can now start your content.',
      );
      setVideo(null);
      setDamaged(false);
      setDescription('');
      onDone();
      onClose();
    } catch (e) {
      // Stays open so a dropped connection is just a retry, not a lost video pick.
      setError(e instanceof Error && e.message ? e.message : 'Receipt submission failed');
    } finally {
      lock.current = false;
      setBusy(false);
      setPercent(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.title}>Mark product received</Text>
            <Text style={styles.sub}>
              Upload a short unboxing video showing the package, opening and the product. The delivery clock starts from here.
            </Text>

            <TouchableOpacity style={styles.pick} onPress={pick} disabled={busy} accessibilityRole="button" accessibilityLabel="Choose unboxing video">
              <Text style={styles.pickText}>
                {video ? `Selected: ${video.fileName || 'unboxing video'}` : 'Choose unboxing video'}
              </Text>
              <Text style={styles.pickHint}>{`MP4 or MOV, up to ${MAX_VIDEO_UPLOAD_MB} MB`}</Text>
            </TouchableOpacity>
            <UploadProgressBar percent={busy ? percent : null} />

            <TouchableOpacity
              style={styles.check}
              onPress={() => setDamaged(v => !v)}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: damaged }}
            >
              <View style={[styles.box, damaged && styles.boxOn]}>{damaged && <Text style={styles.tick}>{'✓'}</Text>}</View>
              <Text style={styles.checkText}>Report damaged or wrong items</Text>
            </TouchableOpacity>

            {damaged && (
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue"
                placeholderTextColor="#A9ADC2"
                multiline
                editable={!busy}
              />
            )}

            {!!error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={close} disabled={busy} accessibilityRole="button">
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.primary]} onPress={submit} disabled={busy} accessibilityRole="button" accessibilityLabel="Mark received">
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryText}>Mark received</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,22,58,0.5)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    backgroundColor: '#FFFFFF',
  },
  body: { padding: scale(18), paddingBottom: scale(28) },
  title: { fontSize: fontScale(17), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  sub: { marginTop: scale(6), fontSize: fontScale(13), lineHeight: fontScale(19), color: '#6B7094' },
  pick: {
    marginTop: scale(14),
    minHeight: scale(64),
    padding: scale(12),
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9CFFF',
    backgroundColor: '#F7F8FF',
    justifyContent: 'center',
  },
  pickText: { fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#3D4FD8' },
  pickHint: { marginTop: scale(3), fontSize: fontScale(12), color: '#9296BA' },
  check: { flexDirection: 'row', alignItems: 'center', minHeight: scale(48), marginTop: scale(10) },
  box: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(6),
    borderWidth: 1.5,
    borderColor: '#B7BCD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#C0392B', borderColor: '#C0392B' },
  tick: { color: '#FFFFFF', fontSize: fontScale(14), fontWeight: '800' },
  checkText: { marginLeft: scale(10), fontSize: fontScale(14), color: '#15163A' },
  input: {
    minHeight: scale(84),
    marginTop: scale(6),
    padding: scale(12),
    borderRadius: scale(10),
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    textAlignVertical: 'top',
    fontSize: 16,
    color: '#15163A',
  },
  error: { marginTop: scale(10), fontSize: fontScale(13), color: '#C0392B' },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: scale(16) },
  btn: { flex: 1, minHeight: scale(48), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#F1F2F9' },
  primary: { backgroundColor: '#4452F0' },
  ghostText: { color: '#4A5568', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
  primaryText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
});
