import { Alert } from '../components/AppAlert';
/**
 * Request Revision — the structured, Frame.io-style revision composer from the
 * design. Comments are pinned to a moment in the submitted video, the brand
 * picks a deadline, and everything posts in one request to
 * POST /api/work/{work_id}/request-revision.
 *
 * The backend (RevisionRequestIn) takes `items` (1-5, each with description +
 * severity + timestamp_seconds), an optional `notes` string, and `deadline_at`.
 * The legacy free-text `feedback` field is only used when no items are sent.
 * The creator is only shown the items, so a typed note travels as the last
 * item as well (see buildRevisionPayload).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Video, { type VideoRef } from 'react-native-video';
import { BACKEND_URL, getCampaignWork, requestWorkRevision } from '../api';
import {
  MAX_REVISION_ITEMS,
  buildRevisionPayload,
  findContactInfo,
  revisionCounters,
  revisionItemCount,
  revisionNotice,
  revisionSentMessage,
  type RevisionCounters,
} from '../brandHiring';
import { errorMessage } from '../payoutRules';
import { scale, fontScale } from '../theme';

type Work = Record<string, any> & { id: string };

type Props = {
  token: string;
  work: Work;
  onClose: () => void;
  /** Called after a revision posts, so the list behind can refresh. */
  onDone: () => void;
};

/** A pending comment, before it is sent as a RevisionItemIn. */
type Comment = {
  key: string;
  description: string;
  timestamp_seconds: number;
};

/** The backend rejects anything outside 1-5 items; a typed note takes one of them. */
const MAX_ITEMS = MAX_REVISION_ITEMS;

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const mediaUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/** Seconds -> "00:05", the timestamp badge format in the design. */
function stamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Seconds -> "0:05", the elapsed/total readout over the scrubber. */
function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function Icon({
  name,
  color = '#8B90AE',
  size = 18,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'close' && (
        <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...line} />
      )}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...line} />
          <Path d="M12 7.5V12l3 1.8" {...line} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect x={4} y={5.5} width={16} height={14} rx={2.5} {...line} />
          <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...line} />
        </>
      )}
      {name === 'trash' && (
        <Path
          d="M5.5 7h13M10 7V5.5h4V7M7 7l.8 12h8.4l.8-12M10.5 10.5v5M13.5 10.5v5"
          {...line}
        />
      )}
      {name === 'send' && <Path d="M4.5 12 20 4.5l-4 15-4.5-5.5z" {...line} />}
      {name === 'sort' && (
        <Path d="M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0-3 3m3-3 3 3" {...line} />
      )}
      {name === 'note' && (
        <>
          <Path d="M6.5 3.5h7l4.5 4.5v12h-11.5z" {...line} />
          <Path d="M13.5 3.5V8H18" {...line} />
        </>
      )}
      {name === 'chevron' && <Path d="m7 10 5 5 5-5" {...line} />}
      {name === 'expand' && (
        <Path
          d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"
          {...line}
        />
      )}
      {name === 'play' && <Path d="M9 6.5v11l9-5.5z" fill={color} />}
      {name === 'pause' && (
        <Path d="M9.5 6v12M14.5 6v12" {...line} strokeWidth={2.2} />
      )}
    </Svg>
  );
}

function WorkRevisionRequest({ token, work, onClose, onDone }: Props) {
  const videoRef = useRef<VideoRef>(null);
  // Track width, needed to turn a touch x into a seek ratio.
  const trackWidth = useRef(1);

  const source = mediaUrl(
    work.preview_url ||
      work.watermarked_url ||
      work.video_url ||
      (Array.isArray(work.work_files) ? work.work_files[0] : undefined),
  );
  // Before approval the brand only gets a watermark-protected preview, so the
  // player carries a "UGCad · SAMPLE" overlay. approved work clears the flag.
  const watermarked = work.watermark_protected !== false && work.status !== 'approved';

  const [playing, setPlaying] = useState(false);
  // A video that fails to load says so and offers a retry (re-mounts the player).
  const [videoError, setVideoError] = useState(false);
  const [videoKey, setVideoKey] = useState(0);

  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState(0);
  // Falls back to the duration the list already knew until the player reports its own.
  const [length, setLength] = useState(Number(work.duration_seconds) || 0);

  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [newest, setNewest] = useState(false);

  const [deadline, setDeadline] = useState<'24' | '48' | 'custom'>('48');
  const [customDays, setCustomDays] = useState('3');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [sending, setSending] = useState(false);

  /**
   * Revisions are counted per deal and only the backend can count across
   * resubmissions. The numbers (free limit, used, fee) ride on the row that was
   * opened; when it carries none, they are read from the submission itself.
   * Nothing is guessed: with no count there is simply no fee warning, and the
   * server still enforces the limit and the charge.
   */
  const [counters, setCounters] = useState<RevisionCounters | null>(() =>
    revisionCounters(work),
  );
  useEffect(() => {
    if (counters || !work.campaign_id) return undefined;
    let live = true;
    (async () => {
      try {
        const rows = await getCampaignWork(
          token,
          String(work.campaign_id),
          work.creator_id ? String(work.creator_id) : undefined,
        );
        const mine = rows.find(row => String(row.id) === String(work.id)) || rows[0];
        const found = revisionCounters(mine);
        if (live && found) setCounters(found);
      } catch {
        // Offline or not allowed: send without a pre-warning.
      }
    })();
    return () => {
      live = false;
    };
  }, [counters, token, work.campaign_id, work.creator_id, work.id]);

  const notice = useMemo(() => revisionNotice(counters), [counters]);
  const freeLeft = counters?.freeLeft ?? null;

  // The brand must be told BEFORE sending the last free revision that the next one is paid.
  const noticeKind = notice?.kind;
  useEffect(() => {
    if (noticeKind === 'last' && notice) {
      Alert.alert(notice.title, notice.body, [{ text: 'Got it' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeKind]);

  const ordered = useMemo(() => {
    const list = [...comments];
    list.sort((a, b) =>
      newest
        ? b.timestamp_seconds - a.timestamp_seconds
        : a.timestamp_seconds - b.timestamp_seconds,
    );
    return list;
  }, [comments, newest]);

  const addComment = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    if (revisionItemCount(comments.length, note) >= MAX_ITEMS) {
      Alert.alert(
        'Five changes maximum',
        `A revision request can carry up to ${MAX_ITEMS} changes${
          note.trim() ? ', and your note counts as one' : ''
        }. Combine a few, or send these and follow up.`,
      );
      return;
    }
    setComments(list => [
      ...list,
      {
        // Index-suffixed so two notes on the same frame stay distinct.
        key: `${Math.floor(position)}-${list.length}`,
        description: body,
        timestamp_seconds: Math.floor(position),
      },
    ]);
    setDraft('');
  }, [draft, position, comments.length, note]);

  const removeComment = useCallback((key: string) => {
    setComments(list => list.filter(item => item.key !== key));
  }, []);

  /** The chosen window as an absolute ISO string, which is what the API stores. */
  const deadlineAt = useCallback(() => {
    const hours =
      deadline === '24'
        ? 24
        : deadline === '48'
        ? 48
        : Math.max(1, Number(customDays) || 1) * 24;
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }, [deadline, customDays]);

  // Phone numbers and emails are blocked by the server too; saying so before
  // sending saves a round trip.
  const contactHit =
    !!findContactInfo(draft) ||
    !!findContactInfo(note) ||
    comments.some(item => !!findContactInfo(item.description));
  const sendingRef = useRef(false);

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    if (!comments.length) {
      Alert.alert(
        'Add a change first',
        'Note at least one thing that needs fixing so the creator knows what to redo.',
      );
      return;
    }
    if (contactHit) {
      Alert.alert(
        'Remove contact details',
        'Please remove phone numbers and email addresses. Keep all communication on-platform.',
      );
      return;
    }
    if (revisionItemCount(comments.length, note) > MAX_ITEMS) {
      Alert.alert(
        'Five changes maximum',
        `Your note counts as one of the ${MAX_ITEMS} changes. Remove a comment or shorten it into the note.`,
      );
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      // Throws carrying the backend's own `detail`, which explains refusals
      // precisely: revision limit hit, wallet short for a paid round, contact
      // details in the text, or a race with an approval.
      const result = await requestWorkRevision(
        token,
        work.id,
        buildRevisionPayload(comments, note, deadlineAt()),
      );
      // Say so when money moved: a bare "requested" would hide the debit.
      Alert.alert('Revision sent', revisionSentMessage(result as any));
      onDone();
      onClose();
    } catch (err: any) {
      Alert.alert('Revision not sent', errorMessage(err, 'Please try again.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [comments, contactHit, note, deadlineAt, work.id, token, onDone, onClose]);

  const progress = length > 0 ? Math.min(1, position / length) : 0;

  /** Tapping anywhere on the track seeks there, which also sets the timestamp. */
  const seekTo = useCallback(
    (ratio: number) => {
      if (!length) return;
      const next = Math.max(0, Math.min(length, ratio * length));
      setPosition(next);
      videoRef.current?.seek(next);
    },
    [length],
  );

  const who = text(work.creator_name, 'Creator');

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + scale(10) }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#FFFFFF" size={22} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {who}
          </Text>
          {freeLeft != null && (
            <Text style={styles.headerSub}>
              {freeLeft > 0
                ? `${freeLeft} free revision${
                    freeLeft === 1 ? '' : 's'
                  } remaining`
                : 'Next revision is chargeable'}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" color="#FFFFFF" size={18} />
        </TouchableOpacity>
      </View>

      {/* The comment composer and note field sit low in the sheet; without
          this the iOS keyboard covers them (Android resizes the window). */}
      <KeyboardAvoidingView
        style={styles.flexGrow}
        behavior="padding"
      >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: scale(36) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Watermarked preview only — raw files stay withheld until approval. */}
        <View style={styles.player}>
          {source ? (
            <Video
              key={videoKey}
              ref={videoRef}
              source={{ uri: source }}
              style={styles.video}
              paused={!playing}
              resizeMode="cover"
              repeat
              onLoad={meta => {
                setVideoError(false);
                setLength(meta?.duration || 0);
              }}
              onProgress={p => setPosition(p?.currentTime || 0)}
              onError={() => {
                setPlaying(false);
                setVideoError(true);
              }}
            />
          ) : work.thumbnail_url ? (
            <Image
              source={{ uri: mediaUrl(work.thumbnail_url) as string }}
              style={styles.video}
            />
          ) : (
            <View style={[styles.video, styles.videoFallback]} />
          )}

          {videoError && (
            <View style={styles.videoErr}>
              <Text style={styles.videoErrTitle}>Video could not be loaded</Text>
              <Text style={styles.videoErrText}>
                Check your connection and try again. You can still write your
                changes without the video.
              </Text>
              <TouchableOpacity
                style={styles.videoErrBtn}
                onPress={() => {
                  setVideoError(false);
                  setVideoKey(k => k + 1);
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading video"
              >
                <Text style={styles.videoErrBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.playHit}
            onPress={() => setPlaying(p => !p)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {!playing && (
              <View style={styles.playBtn}>
                <Icon name="play" color="#FFFFFF" size={22} />
              </View>
            )}
          </TouchableOpacity>

          {watermarked && (
            <View style={styles.watermark} pointerEvents="none">
              {Array.from({ length: 4 }).map((_, r) => (
                <Text key={r} style={styles.watermarkText} numberOfLines={1}>
                  UGCad · SAMPLE   UGCad · SAMPLE   UGCad · SAMPLE
                </Text>
              ))}
            </View>
          )}

          <View style={styles.timeChip}>
            <Text style={styles.timeChipText}>
              {clock(position)} / {clock(length)}
            </Text>
          </View>
        </View>

        {/* Scrubber. Where it sits is the timestamp a new comment attaches to. */}
        <View
          style={styles.track}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={e => {
            const { locationX } = e.nativeEvent;
            seekTo(locationX / Math.max(1, trackWidth.current));
          }}
          onResponderMove={e => {
            const { locationX } = e.nativeEvent;
            seekTo(locationX / Math.max(1, trackWidth.current));
          }}
          onLayout={e => {
            trackWidth.current = e.nativeEvent.layout.width;
          }}
        >
          <View style={styles.trackBase} />
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
          {/* A marker per pinned comment, as the website's player draws them. */}
          {length > 0 &&
            comments.map(item => (
              <View
                key={`mark-${item.key}`}
                pointerEvents="none"
                style={[
                  styles.trackMark,
                  {
                    left: `${Math.min(
                      100,
                      (item.timestamp_seconds / length) * 100,
                    )}%`,
                  },
                ]}
              />
            ))}
          <View style={[styles.trackKnob, { left: `${progress * 100}%` }]} />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            Comments <Text style={styles.count}>{comments.length}</Text>
          </Text>
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setNewest(v => !v)}
            accessibilityRole="button"
          >
            <Icon name="sort" color="#8C93FF" size={14} />
            <Text style={styles.sortText}>
              {newest ? 'Sort by latest' : 'Sort by time'}
            </Text>
            <Icon name="chevron" color="#8C93FF" size={14} />
          </TouchableOpacity>
        </View>

        {ordered.map(item => (
          <View key={item.key} style={styles.comment}>
            <TouchableOpacity
              style={styles.stampChip}
              onPress={() =>
                seekTo(item.timestamp_seconds / Math.max(1, length))
              }
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${stamp(item.timestamp_seconds)}`}
            >
              <Text style={styles.stampText}>
                {stamp(item.timestamp_seconds)}
              </Text>
            </TouchableOpacity>
            <Text style={styles.commentText}>{item.description}</Text>
            <TouchableOpacity
              onPress={() => removeComment(item.key)}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="trash" color="#8B90AE" size={16} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Composer. The stamp shows where this note will land. */}
        <View style={styles.composer}>
          <View style={styles.composerRow}>
            <View style={styles.stampChip}>
              <Text style={styles.stampText}>{stamp(position)}</Text>
            </View>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColor="#6B7091"
              editable={!sending}
              onSubmitEditing={addComment}
              returnKeyType="done"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendChip, !draft.trim() && styles.sendChipOff]}
              onPress={addComment}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add comment"
            >
              <Icon name="send" color="#FFFFFF" size={15} />
            </TouchableOpacity>
          </View>
          <Text style={styles.composerHint}>{clock(position)}</Text>
        </View>

        <Text style={styles.blockTitle}>Revision Deadline</Text>
        <View style={styles.deadlineRow}>
          <TouchableOpacity
            style={[styles.chip, deadline === '24' && styles.chipOn]}
            onPress={() => setDeadline('24')}
            accessibilityRole="button"
          >
            <Icon
              name="clock"
              color={deadline === '24' ? '#FFFFFF' : '#8B90AE'}
              size={15}
            />
            <Text
              style={[styles.chipText, deadline === '24' && styles.chipTextOn]}
            >
              24 hours
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, deadline === '48' && styles.chipOn]}
            onPress={() => setDeadline('48')}
            accessibilityRole="button"
          >
            <Icon
              name="clock"
              color={deadline === '48' ? '#FFFFFF' : '#8B90AE'}
              size={15}
            />
            <Text
              style={[styles.chipText, deadline === '48' && styles.chipTextOn]}
            >
              48 hours
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, deadline === 'custom' && styles.chipOn]}
            onPress={() => setDeadline('custom')}
            accessibilityRole="button"
          >
            <Icon
              name="calendar"
              color={deadline === 'custom' ? '#FFFFFF' : '#8B90AE'}
              size={15}
            />
            <Text
              style={[
                styles.chipText,
                deadline === 'custom' && styles.chipTextOn,
              ]}
            >
              Custom days
            </Text>
          </TouchableOpacity>
        </View>

        {/* No date-picker dependency in the app, so a custom window is entered
            in days — it resolves to the same absolute deadline_at. */}
        {deadline === 'custom' && (
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Due in</Text>
            <TextInput
              style={styles.customInput}
              value={customDays}
              onChangeText={v => setCustomDays(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
              editable={!sending}
            />
            <Text style={styles.customLabel}>
              day{Number(customDays) === 1 ? '' : 's'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.noteBtn}
          onPress={() => setNoteOpen(v => !v)}
          accessibilityRole="button"
        >
          <Icon name="note" color="#8C93FF" size={16} />
          <Text style={styles.noteBtnText}>Add a note (optional)</Text>
          <Icon name="chevron" color="#8B90AE" size={16} />
        </TouchableOpacity>

        {noteOpen && (
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Anything else the creator should know?"
            placeholderTextColor="#6B7091"
            multiline
            textAlignVertical="top"
            editable={!sending}
            maxLength={500}
          />
        )}
        {noteOpen && (
          <Text style={styles.noteHint}>
            The creator sees your note as the last change in the list.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.submit, (sending || contactHit) && styles.submitOff]}
          onPress={send}
          disabled={sending || contactHit}
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitText}>Send Changes</Text>
          )}
        </TouchableOpacity>

        {contactHit && (
          <Text style={styles.contactWarn}>
            Please remove phone numbers and email addresses. Keep all
            communication on-platform; sharing contact details isn't allowed.
          </Text>
        )}
        {!!notice && notice.kind !== 'free' && (
          <Text style={styles.feeWarn}>
            {notice.title}. {notice.body}
          </Text>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F27' },
  flexGrow: { flex: 1 },

  header: {
    // No fixed height: the status-bar inset is added on top via paddingTop, so a
    // fixed 60px box clipped the "N free revisions remaining" sub-line under the
    // translucent status bar. Let it size to its content instead.
    minHeight: scale(56),
    paddingHorizontal: scale(10),
    paddingBottom: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  headerBtn: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    marginTop: scale(2),
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#4ADE80',
  },
  closeBtn: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    backgroundColor: '#1A1F3D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: scale(14), paddingBottom: scale(36) },

  player: {
    height: scale(208),
    borderRadius: scale(14),
    overflow: 'hidden',
    backgroundColor: '#151A33',
  },
  watermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-around',
    transform: [{ rotate: '-24deg' }],
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.16)',
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    letterSpacing: 1,
  },
  video: { ...StyleSheet.absoluteFill },
  videoFallback: { backgroundColor: '#1A1F3D' },
  playHit: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: scale(54),
    height: scale(54),
    borderRadius: scale(27),
    backgroundColor: 'rgba(11,15,39,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: scale(3),
  },
  timeChip: {
    position: 'absolute',
    left: scale(10),
    bottom: scale(10),
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(7),
    backgroundColor: 'rgba(11,15,39,0.78)',
  },
  timeChipText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  expandChip: {
    position: 'absolute',
    right: scale(10),
    bottom: scale(10),
    width: scale(28),
    height: scale(28),
    borderRadius: scale(8),
    backgroundColor: 'rgba(11,15,39,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  track: { height: scale(28), justifyContent: 'center', marginTop: scale(4) },
  trackBase: {
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: '#252B4A',
  },
  trackFill: {
    position: 'absolute',
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: '#5B63F5',
  },
  trackMark: {
    position: 'absolute',
    top: scale(5),
    width: scale(4),
    height: scale(18),
    marginLeft: scale(-2),
    borderRadius: scale(2),
    backgroundColor: '#F0B45E',
  },
  videoErr: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    padding: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,15,39,0.92)',
  },
  videoErrTitle: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  videoErrText: {
    marginTop: scale(6),
    fontSize: fontScale(12),
    color: '#B9BED6',
    textAlign: 'center',
  },
  videoErrBtn: {
    marginTop: scale(12),
    minHeight: scale(44),
    paddingHorizontal: scale(22),
    borderRadius: scale(12),
    backgroundColor: '#5B63F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoErrBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  trackKnob: {
    position: 'absolute',
    width: scale(13),
    height: scale(13),
    marginLeft: scale(-6),
    borderRadius: scale(7),
    backgroundColor: '#8C93FF',
  },

  sectionRow: {
    marginTop: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  count: { color: '#8B90AE' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  sortText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8C93FF',
  },

  comment: {
    marginTop: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#151A33',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  commentText: { flex: 1, fontSize: fontScale(13), color: '#E6E8F5' },
  stampChip: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(4),
    borderRadius: scale(6),
    backgroundColor: '#232949',
  },
  stampText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#8C93FF',
  },

  composer: {
    marginTop: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#151A33',
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  composerInput: {
    flex: 1,
    maxHeight: scale(90),
    fontSize: fontScale(13),
    color: '#FFFFFF',
    padding: 0,
  },
  sendChip: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(9),
    backgroundColor: '#5B63F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendChipOff: { backgroundColor: '#2C3157' },
  composerHint: { marginTop: scale(8), fontSize: fontScale(11), color: '#6B7091' },

  blockTitle: {
    marginTop: scale(20),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  deadlineRow: { marginTop: scale(10), flexDirection: 'row', gap: scale(8) },
  chip: {
    flex: 1,
    height: scale(44),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#252B4A',
    backgroundColor: '#151A33',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
  },
  chipOn: { borderColor: '#5B63F5', backgroundColor: '#1E2450' },
  chipText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8B90AE',
  },
  chipTextOn: { color: '#FFFFFF' },

  customRow: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  customLabel: { fontSize: fontScale(12), color: '#8B90AE' },
  customInput: {
    width: scale(54),
    height: scale(40),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#252B4A',
    backgroundColor: '#151A33',
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    paddingVertical: 0,
  },

  noteBtn: {
    marginTop: scale(12),
    height: scale(48),
    paddingHorizontal: scale(13),
    borderRadius: scale(12),
    backgroundColor: '#151A33',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  noteBtnText: {
    flex: 1,
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#8C93FF',
  },
  noteInput: {
    marginTop: scale(9),
    minHeight: scale(84),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#151A33',
    color: '#FFFFFF',
    fontSize: fontScale(13),
  },

  noteHint: { marginTop: scale(6), fontSize: fontScale(11), color: '#6B7091' },

  submit: {
    marginTop: scale(18),
    height: scale(52),
    borderRadius: scale(13),
    backgroundColor: '#5B63F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { backgroundColor: '#3A4090' },
  submitText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  feeWarn: {
    marginTop: scale(10),
    fontSize: fontScale(11),
    color: '#F0B45E',
    textAlign: 'center',
  },
  contactWarn: {
    marginTop: scale(10),
    fontSize: fontScale(11.5),
    color: '#FF8A8A',
    textAlign: 'center',
  },
});

export default WorkRevisionRequest;
