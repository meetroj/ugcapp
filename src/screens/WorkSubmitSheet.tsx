/**
 * Submit-work sheet for the creator's Deal Room (the site's WorkSubmission
 * page): several files, a required work description, separate edited / raw
 * zones when the brief asks for an edited cut, files that can be removed
 * before sending, and the brand's requested changes on top of a revision.
 * When the brief requires a caption / script or a thumbnail (the deal's
 * content_submission.required_assets, as on the website's Content Submission
 * card) those get their own upload tiles and go along as caption_url /
 * thumbnail_url. Posts POST /api/work/submit (api.submitWork). The backend
 * writes the same per-version record /deals/{id}/content does.
 */
import React, { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { Text, TextInput } from '../components/Text';
import { Alert } from '../components/AppAlert';
import ChoiceSheet from '../components/ChoiceSheet';
import UploadProgressBar from '../components/UploadProgressBar';
import { submitWork, uploadMedia } from '../api';
import { parseChange, stateKey, toChangeItems } from '../dealRoom';
import { MB, afterSheetCloses, pickDocuments } from '../documentPicker';
import { CONTENT_MAX_WIDTH, fontScale, scale } from '../theme';

export type WorkEntry = { url: string; name: string; isVideo: boolean };
type ZoneKey = 'files' | 'edited' | 'raw';
type Kind = 'raw' | 'edited' | 'both' | 'single';
type Zone = { key: ZoneKey; title: string; hint: string; media: 'video' | 'mixed' };
type Slot = 'caption' | 'thumbnail';
/** What the brief asks for beyond the video, and what has been uploaded for it. */
export type ExtraAssets = {
  needCaption: boolean;
  needThumbnail: boolean;
  caption: WorkEntry | null;
  thumbnail: WorkEntry | null;
};

/** The server rejects images over 10 MB (validate_upload_payload); keep the same cap for both tiles. */
const EXTRA_MAX_BYTES = 10 * MB;

/** Caption / script and thumbnail flags from the deal (GET /deals/{id} content_submission.required_assets). */
export function requiredExtras(deal: Record<string, any>): { caption: boolean; thumbnail: boolean } {
  const required = deal?.content_submission?.required_assets;
  return { caption: !!required?.caption_script, thumbnail: !!required?.thumbnail };
}

/**
 * Which upload zones a deal needs. The deal's edit_flow stage wins (raw first,
 * then the edited cut); otherwise a brief with an "edited required"
 * deliverable owes both an edited and a raw file; otherwise one free zone.
 */
export function workKind(deal: Record<string, any>): Kind {
  const stage = deal?.edit_flow?.stage;
  if (stage === 'raw' || stage === 'edited') return stage;
  const items = deal?.campaign?.deliverable_items;
  if (Array.isArray(items) && items.some((d: any) => d && d.edited_required)) return 'both';
  return 'single';
}

export function zonesFor(kind: Kind): Zone[] {
  if (kind === 'raw') return [{ key: 'raw', title: 'Raw video', hint: 'The unedited footage. The brand approves this first.', media: 'video' }];
  if (kind === 'edited') return [{ key: 'edited', title: 'Edited video', hint: 'The finished cut, ready to publish.', media: 'video' }];
  if (kind === 'both') {
    return [
      { key: 'edited', title: 'Edited file', hint: 'The finished cut, ready to publish. This brief asks for one.', media: 'video' },
      { key: 'raw', title: 'Raw file', hint: 'The unedited source footage the cut was made from.', media: 'video' },
    ];
  }
  return [{ key: 'files', title: 'Upload files', hint: 'Videos, images, or any deliverables', media: 'mixed' }];
}

/** '' when the submission can go, else the message the creator sees. */
export function submitProblem(
  kind: Kind,
  files: Record<ZoneKey, WorkEntry[]>,
  description: string,
  uploading: boolean,
  extras?: ExtraAssets,
): string {
  if (uploading) return 'Please wait. A file is still uploading.';
  if (kind === 'both') {
    if (!files.edited.length) return 'This brief needs an edited file. Upload the finished cut.';
    if (!files.raw.length) return 'Upload the raw footage as well.';
  } else if (kind === 'raw') {
    if (!files.raw.length) return 'Upload your raw video.';
  } else if (kind === 'edited') {
    if (!files.edited.length) return 'Upload your edited video.';
  } else if (!files.files.length) {
    return 'Please upload at least one file.';
  }
  if (extras?.needCaption && !extras.caption) return 'This brief needs a caption or script. Upload it.';
  if (extras?.needThumbnail && !extras.thumbnail) return 'This brief needs a thumbnail. Upload it.';
  if (!description.trim()) return 'Add a short work description.';
  return '';
}

/**
 * Body for POST /work/submit. work_files[0] is the primary video (it gets the
 * watermark and plays in the brand's review), so the edited cut leads and, in
 * the free zone, videos go before images.
 */
export function buildWorkPayload(kind: Kind, files: Record<ZoneKey, WorkEntry[]>, description: string, extras?: ExtraAssets) {
  return {
    ...videoPayload(kind, files, description),
    ...(extras?.caption ? { caption_url: extras.caption.url } : {}),
    ...(extras?.thumbnail ? { thumbnail_url: extras.thumbnail.url } : {}),
  };
}

function videoPayload(kind: Kind, files: Record<ZoneKey, WorkEntry[]>, description: string) {
  const urls = (list: WorkEntry[]) => list.map(e => e.url);
  const note = description.trim();
  if (kind === 'raw') return { work_files: urls(files.raw), raw_files: urls(files.raw), description: note };
  if (kind === 'edited') return { work_files: urls(files.edited), edited_files: urls(files.edited), description: note };
  if (kind === 'both') {
    return {
      work_files: [...urls(files.edited), ...urls(files.raw)],
      edited_files: urls(files.edited),
      raw_files: urls(files.raw),
      description: note,
    };
  }
  const ordered = [...files.files.filter(e => e.isVideo), ...files.files.filter(e => !e.isVideo)];
  return { work_files: urls(ordered), edited_files: [], raw_files: [], description: note };
}

const EMPTY_FILES = (): Record<ZoneKey, WorkEntry[]> => ({ files: [], edited: [], raw: [] });

type Props = {
  visible: boolean;
  token: string;
  deal: Record<string, any>;
  onClose: () => void;
  /** Work saved on the server; refetch the deal. */
  onSubmitted: () => void;
};

export default function WorkSubmitSheet({ visible, token, deal, onClose, onSubmitted }: Props) {
  const kind = workKind(deal);
  const zones = zonesFor(kind);
  const revising = stateKey(deal.current_state).includes('revision');
  const changes = revising ? toChangeItems(deal.revision_tracker) : [];
  const [files, setFiles] = useState<Record<ZoneKey, WorkEntry[]>>(EMPTY_FILES());
  const [description, setDescription] = useState('');
  const [caption, setCaption] = useState<WorkEntry | null>(null);
  const [thumbnail, setThumbnail] = useState<WorkEntry | null>(null);
  const [thumbSource, setThumbSource] = useState(false);
  const insets = useSafeAreaInsets();
  const needs = requiredExtras(deal);
  const [uploading, setUploading] = useState('');
  const [percent, setPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const campaignId = String(deal.campaign?.id || deal.campaign_id || '');
  const busy = !!uploading || submitting;

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const addFiles = async (zone: Zone) => {
    if (busy) return;
    setError('');
    let picked;
    try {
      picked = await launchImageLibrary({ mediaType: zone.media === 'video' ? 'video' : 'mixed', selectionLimit: 0 });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not open your gallery.');
      return;
    }
    const assets = (picked.assets || []).filter(a => a.uri);
    if (!assets.length) return;
    let added = 0;
    try {
      for (const asset of assets) {
        const name = asset.fileName || `file ${files[zone.key].length + added + 1}`;
        setUploading(name);
        setPercent(0);
        // uploadMedia refuses an oversized video up front with a readable message.
        const url = await uploadMedia(
          token,
          { uri: asset.uri as string, fileName: asset.fileName, type: asset.type, fileSize: asset.fileSize },
          'file',
          setPercent,
        );
        if (!url) throw new Error('The upload did not return a file URL.');
        const isVideo = String(asset.type || '').startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp|mkv)(\?|$)/i.test(String(asset.uri));
        setFiles(prev => ({ ...prev, [zone.key]: [...prev[zone.key], { url, name, isVideo }] }));
        added += 1;
      }
    } catch (e) {
      // Files that already finished stay; only the failing one is lost.
      setError(e instanceof Error && e.message ? e.message : 'Failed to upload files');
    } finally {
      setUploading('');
      setPercent(null);
    }
  };

  const remove = (zone: ZoneKey, index: number) =>
    setFiles(prev => ({ ...prev, [zone]: prev[zone].filter((_, i) => i !== index) }));

  /** Uploads one caption / script / thumbnail file (already type- and size-checked). */
  const uploadExtra = async (slot: Slot, file: { uri: string; name: string; type: string; size: number }) => {
    setUploading(file.name);
    setPercent(0);
    try {
      const url = await uploadMedia(
        token,
        { uri: file.uri, fileName: file.name, type: file.type, fileSize: file.size },
        'file',
        setPercent,
      );
      if (!url) throw new Error('The upload did not return a file URL.');
      (slot === 'caption' ? setCaption : setThumbnail)({ url, name: file.name, isVideo: false });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to upload file');
    } finally {
      setUploading('');
      setPercent(null);
    }
  };

  /** Caption / script: a PDF or image from Files. Thumbnail: an image from the photo library or Files. */
  const pickExtra = async (slot: Slot, from: 'photos' | 'files') => {
    if (busy) return;
    setError('');
    if (from === 'photos') {
      let picked;
      try {
        picked = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      } catch {
        setError('Could not open your gallery. Check the photo permission and try again.');
        return;
      }
      if (picked.errorMessage) {
        setError(picked.errorMessage);
        return;
      }
      const asset = (picked.assets || []).find(a => a.uri);
      if (!asset) return;
      const name = asset.fileName || 'thumbnail.jpg';
      if (asset.fileSize && asset.fileSize > EXTRA_MAX_BYTES) {
        setError(`"${name}" is larger than 10 MB. Choose a smaller file.`);
        return;
      }
      await uploadExtra(slot, { uri: asset.uri as string, name, type: asset.type || 'image/jpeg', size: asset.fileSize || 0 });
      return;
    }
    try {
      const [doc] = await pickDocuments({
        types: slot === 'caption' ? ['pdf', 'image'] : ['image'],
        maxBytes: EXTRA_MAX_BYTES,
      });
      if (doc) await uploadExtra(slot, doc);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not open your files.');
    }
  };

  const submit = async () => {
    if (lock.current) return;
    const extras: ExtraAssets = { needCaption: needs.caption, needThumbnail: needs.thumbnail, caption, thumbnail };
    const problem = submitProblem(kind, files, description, !!uploading, extras);
    if (problem) {
      setError(problem);
      return;
    }
    if (!campaignId) {
      setError('This deal has no campaign to submit to.');
      return;
    }
    lock.current = true;
    setSubmitting(true);
    setError('');
    try {
      await submitWork(token, campaignId, buildWorkPayload(kind, files, description, extras));
      Alert.alert(
        kind === 'raw' ? 'Raw video submitted' : kind === 'edited' ? 'Edited video submitted' : revising ? 'Revision submitted' : 'Work submitted',
        kind === 'raw'
          ? 'Your raw video was sent to the brand. Once they approve it, ' +
              (deal.edit_flow?.mode === 'ugc' ? "you're paid and UGC.ad edits it." : 'you can upload the edited video.')
          : 'Your work was sent to the brand for review. It now shows under Deliverables.',
      );
      setFiles(EMPTY_FILES());
      setDescription('');
      setCaption(null);
      setThumbnail(null);
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to submit work');
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  /** A caption / script / thumbnail tile: the same dashed picker as the video zones, one file. */
  const renderExtra = (slot: Slot, title: string, hint: string, entry: WorkEntry | null, onPick: () => void, onClear: () => void) => (
    <View style={styles.zone}>
      <Text style={[styles.zoneTitle, styles.zoneTitleFirst]}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TouchableOpacity style={styles.pick} onPress={onPick} disabled={busy} accessibilityRole="button" accessibilityLabel={`${entry ? 'Replace' : 'Add'} ${title}`} testID={`add-${slot}`}>
        <Text style={styles.pickText}>{entry ? 'Replace file' : 'Choose file'}</Text>
      </TouchableOpacity>
      {!!entry && (
        <View style={styles.file}>
          <Text style={styles.fileName} numberOfLines={1}>{entry.name}</Text>
          <TouchableOpacity style={styles.removeBtn} onPress={onClear} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${entry.name}`}>
            <Text style={styles.removeText}>{'×'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      {/* The description box is at the bottom of the sheet: lift the sheet with the keyboard. */}
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: scale(28) + insets.bottom }]}>
            <Text style={styles.title}>{revising ? 'Submit your revision' : 'Submit your work'}</Text>
            <Text style={styles.sub}>{`Campaign: ${deal.campaign?.title || ''}`}</Text>

            {revising && (
              <View style={styles.callout} testID="revision-callout">
                <Text style={styles.calloutTitle}>The brand asked for changes</Text>
                {changes.map((line, i) => {
                  const c = parseChange(line);
                  return (
                    <Text key={`${line}-${i}`} style={styles.change}>
                      {`• ${c.timestamp ? `[${c.timestamp}] ` : ''}${c.severity === 'must-fix' ? 'Must-fix: ' : c.severity ? 'Preference: ' : ''}${c.text}`}
                    </Text>
                  );
                })}
                {!changes.length && (
                  <Text style={styles.change}>The brand did not leave any notes. Message them if you are unsure what to change.</Text>
                )}
              </View>
            )}

            {zones.map(zone => (
              <View key={zone.key} style={styles.zone}>
                <Text style={[styles.zoneTitle, styles.zoneTitleFirst]}>{zone.title}</Text>
                <Text style={styles.hint}>{zone.hint}</Text>
                <TouchableOpacity style={styles.pick} onPress={() => addFiles(zone)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Add files to ${zone.title}`} testID={`add-${zone.key}`}>
                  <Text style={styles.pickText}>{files[zone.key].length ? 'Add more files' : 'Choose files'}</Text>
                </TouchableOpacity>
                {files[zone.key].map((file, index) => (
                  <View key={`${file.url}-${index}`} style={styles.file}>
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <TouchableOpacity style={styles.removeBtn} onPress={() => remove(zone.key, index)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`}>
                      <Text style={styles.removeText}>{'×'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
            {needs.caption &&
              renderExtra('caption', 'Caption / script', 'A PDF or image of the caption or script this brief asks for. Up to 10 MB.', caption, () => pickExtra('caption', 'files'), () => setCaption(null))}
            {needs.thumbnail &&
              renderExtra('thumbnail', 'Thumbnail', 'The cover image for the video (JPG or PNG). Up to 10 MB.', thumbnail, () => setThumbSource(true), () => setThumbnail(null))}
            {!!uploading && <Text style={styles.hint}>{`Uploading ${uploading}`}</Text>}
            <UploadProgressBar percent={uploading ? percent : null} />

            <Text style={styles.zoneTitle}>Work description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your work, highlight key features, mention any special considerations"
              placeholderTextColor="#A9ADC2"
              multiline
              editable={!submitting}
              testID="work-description"
            />

            {!!error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={close} disabled={busy} accessibilityRole="button">
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.primary]} onPress={submit} disabled={busy} accessibilityRole="button" accessibilityLabel="Submit work for review">
                {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryText}>{revising ? 'Submit revision' : 'Submit for review'}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        <ChoiceSheet
          visible={thumbSource}
          title="Add a thumbnail"
          options={[
            { label: 'Photo library', onPress: () => afterSheetCloses(() => pickExtra('thumbnail', 'photos')) },
            { label: 'Files', onPress: () => afterSheetCloses(() => pickExtra('thumbnail', 'files')) },
          ]}
          onClose={() => setThumbSource(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,22,58,0.5)' },
  sheet: {
    width: '100%',
    // A tablet keeps the sheet a phone-width column instead of stretching it edge to edge.
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '92%',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    backgroundColor: '#FFFFFF',
  },
  body: { padding: scale(18), paddingBottom: scale(28) },
  title: { fontSize: fontScale(17), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  sub: { marginTop: scale(4), fontSize: fontScale(14), color: '#6B7094' },
  callout: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFF8ED',
    borderWidth: 1.5,
    borderColor: '#FCD9A4',
  },
  calloutTitle: { fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#92400E' },
  change: { marginTop: scale(5), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#7C4A09' },
  zone: { marginTop: scale(14) },
  zoneTitle: { marginTop: scale(14), fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#15163A' },
  // Inside a zone the zone's own margin already spaces it.
  zoneTitleFirst: { marginTop: 0 },
  hint: { marginTop: scale(3), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#9296BA' },
  pick: {
    marginTop: scale(8),
    minHeight: scale(48),
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9CFFF',
    backgroundColor: '#F7F8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickText: { fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#3D4FD8' },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: scale(44),
    marginTop: scale(6),
    paddingLeft: scale(12),
    borderRadius: scale(10),
    backgroundColor: '#F5F6FB',
  },
  fileName: { flex: 1, minWidth: 0, fontSize: fontScale(14), color: '#25274C' },
  removeBtn: { width: scale(44), height: scale(44), alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: fontScale(22), color: '#C0392B' },
  input: {
    minHeight: scale(96),
    marginTop: scale(6),
    padding: scale(12),
    borderRadius: scale(10),
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    textAlignVertical: 'top',
    fontSize: 16,
    color: '#15163A',
  },
  error: { marginTop: scale(10), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#C0392B' },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: scale(16) },
  btn: { flex: 1, minHeight: scale(48), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#F1F2F9' },
  primary: { backgroundColor: '#4452F0' },
  ghostText: { color: '#4A5568', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
  primaryText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700' },
});
