/**
 * Work Review — the native replacement for the web
 * /dashboard/business/work-review page. Lists the submissions waiting on the
 * brand from GET /api/work/pending-review, with the metadata strip and action
 * row from the design. Both decisions are native: Approve confirms first and
 * posts to POST /api/work/{work_id}/approve, and Request Revision opens the
 * structured composer in WorkRevisionRequest.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Video from 'react-native-video';
import { SkeletonList } from '../components/Skeleton';
import WorkRevisionRequest from './WorkRevisionRequest';
import { approveWork, BACKEND_URL, getPendingWork } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
};

type Work = Record<string, any> & { id: string };

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const mediaUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/** Seconds -> "0:32", the length badge on the thumbnail. */
function duration(seconds: unknown): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** ISO stamp -> "27 Aug 2026". Empty when the date is missing or unparseable. */
function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Icon({
  name,
  color = '#7C819C',
  size = 20,
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
      {name === 'bell' && (
        <>
          <Path
            d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z"
            {...line}
          />
          <Path d="M10.5 18a1.8 1.8 0 0 0 3 0" {...line} />
        </>
      )}
      {name === 'chat' && (
        <Path d="M4.5 6.5h15v10h-8l-4.5 3.5v-3.5h-2.5z" {...line} />
      )}
      {/* Filled triangle — it sits on the thumbnail's play button. */}
      {name === 'play' && <Path d="M9 6.5 18 12l-9 5.5z" fill={color} />}
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
      {name === 'file' && (
        <>
          <Path d="M6.5 3.5h7l4.5 4.5v12h-11.5z" {...line} />
          <Path d="M13.5 3.5V8H18" {...line} />
        </>
      )}
      {name === 'campaign' && (
        <>
          <Path d="M4.5 9.5v5h3l6 3.5v-12l-6 3.5z" {...line} />
          <Path d="M17 9.5a3.5 3.5 0 0 1 0 5" {...line} />
        </>
      )}
      {name === 'approve' && <Path d="m5.5 12.5 4 4 9-9" {...line} />}
      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" {...line} />}
      {name === 'revision' && (
        <>
          <Path d="M4.5 12a7.5 7.5 0 1 1 2.4 5.5" {...line} />
          <Path d="M4.5 18v-4.5H9" {...line} />
        </>
      )}
    </Svg>
  );
}

function BrandWorkReview({
  token,
  onBack,
  onNavigate,
  onNotifications,
  onMessages,
}: Props) {
  const [items, setItems] = useState<Work[]>([]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The submission whose revision composer is open.
  const [revising, setRevising] = useState<Work | null>(null);
  // The submission playing in the full-screen preview player.
  const [previewing, setPreviewing] = useState<Work | null>(null);
  const [previewPaused, setPreviewPaused] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getPendingWork(token);
      setItems(
        list.map((work, index) => ({ ...work, id: String(work.id ?? index) })),
      );
    } catch {
      // Backend unreachable — keep whatever is on screen; pull-to-refresh
      // retries the real request.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * POST /api/work/{campaignId}/request-revision — the campaign-id form, which
   * is what GET /api/work/pending-review returns as each row's `id`. (The
   * /api/deals/{dealId}/... route is the deal-id form and would 404 on these
   * ids.) The server syncs the underlying deal to REVISION_REQUESTED itself.
   */
  /**
   * Approving releases escrow to the creator and cannot be undone (PRD 8.6),
   * so it is confirmed first. `approving` holds the work id mid-request so the
   * card's button can show progress and block a double tap.
   */
  const [approving, setApproving] = useState<string | null>(null);

  const runApprove = useCallback(
    async (work: Work) => {
      setApproving(work.id);
      try {
        // approveWork throws with the backend's own `detail` message, which
        // explains refusals (open dispute, already approved).
        await approveWork(token, work.id);
        // The deal leaves AWAITING_REVIEW, so it drops off this list.
        load();
      } catch (err: any) {
        Alert.alert('Not approved', String(err?.message || err));
      } finally {
        setApproving(null);
      }
    },
    [token, load],
  );

  const confirmApprove = useCallback(
    (work: Work) => {
      const who = text(work.creator_name, 'the creator');
      Alert.alert(
        'Approve this work?',
        `Payment will be released to ${who} and the files unlocked. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Approve', onPress: () => runApprove(work) },
        ],
      );
    },
    [runApprove],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#FFFFFF" size={22} />
        </TouchableOpacity>

        {/* Absolutely positioned so the title stays optically centred no
            matter how wide the back arrow and the action pair are. */}
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>
            Work Review
          </Text>
          {items.length > 0 && (
            <View style={styles.headerCount}>
              <Text style={styles.headerCountText}>{items.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onNotifications}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" color="#FFFFFF" size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onMessages}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Icon name="chat" color="#FFFFFF" size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sheet}>
        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={4} lines={2} footer />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
              />
            }
          >
            {!items.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing to review</Text>
                <Text style={styles.emptyText}>
                  Submissions from creators appear here when they're ready for
                  your approval.
                </Text>
              </View>
            ) : (
              items.map(work => {
                const thumb = mediaUrl(
                  work.preview_url ||
                    work.thumbnail_url ||
                    work.watermarked_url,
                );
                const playable = mediaUrl(
                  work.watermarked_url || work.preview_url || work.video_url,
                );
                const who = text(work.creator_name, 'Creator');
                const campaign = text(
                  work.campaign_title || work.campaign_name,
                  '',
                );
                return (
                  <View key={work.id} style={styles.card}>
                    {/* Watermarked preview only — the backend withholds raw files
                      until the work is approved. */}
                    <TouchableOpacity
                      style={styles.media}
                      disabled={!playable}
                      onPress={() => {
                        setPreviewPaused(false);
                        setPreviewing(work);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Play preview"
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.mediaImg}
                        />
                      ) : (
                        <View style={styles.mediaFallback} />
                      )}
                      <View style={styles.playBtn}>
                        <Icon name="play" color="#15163F" size={20} />
                      </View>
                      {!!work.duration_seconds && (
                        <View style={styles.durationChip}>
                          <Text style={styles.durationText}>
                            {duration(work.duration_seconds)}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    <View style={styles.cardBody}>
                      <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={1}>
                          {campaign || 'Submission'}
                        </Text>
                        <View style={styles.pendingChip}>
                          <Text style={styles.pendingText}>Pending Review</Text>
                        </View>
                      </View>
                      <Text style={styles.byline}>
                        by {who} · Submitted on{' '}
                        {formatDate(work.submitted_at || work.created_at)}
                      </Text>

                      <View style={styles.metaGrid}>
                        <View style={styles.metaItem}>
                          <Icon name="clock" color="#9498B0" size={13} />
                          <View>
                            <Text style={styles.metaLabel}>Duration</Text>
                            <Text style={styles.metaValue}>
                              {duration(work.duration_seconds)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon name="file" color="#9498B0" size={13} />
                          <View>
                            <Text style={styles.metaLabel}>File type</Text>
                            <Text style={styles.metaValue}>
                              {text(work.file_type, 'MP4').toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon name="calendar" color="#9498B0" size={13} />
                          <View>
                            <Text style={styles.metaLabel}>Submitted</Text>
                            <Text style={styles.metaValue}>
                              {formatDate(
                                work.submitted_at || work.created_at,
                              ) || '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon name="campaign" color="#9498B0" size={13} />
                          <View>
                            <Text style={styles.metaLabel}>Campaign</Text>
                            <Text style={styles.metaValue} numberOfLines={1}>
                              {campaign || '—'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Confirmed first — approving releases escrow and is
                        final. */}
                      <TouchableOpacity
                        style={[
                          styles.approveBtn,
                          approving === work.id && styles.approveBtnOff,
                        ]}
                        onPress={() => confirmApprove(work)}
                        disabled={approving === work.id}
                        accessibilityRole="button"
                      >
                        {approving === work.id ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <Icon name="approve" color="#FFFFFF" size={16} />
                            <Text style={styles.approveText}>Approve</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <View style={styles.secondaryRow}>
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => setRevising(work)}
                          accessibilityRole="button"
                        >
                          <Icon name="revision" color="#5C6180" size={14} />
                          <Text style={styles.secondaryText}>
                            Request Revision
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => onNavigate('/messages')}
                          accessibilityRole="button"
                        >
                          <Icon name="chat" color="#5C6180" size={14} />
                          <Text style={styles.secondaryText}>Message</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      {/* The structured composer replaces the old text-only sheet: comments
          pinned to a video timestamp, a deadline, and an optional note. */}
      <Modal
        visible={!!revising}
        animationType="slide"
        onRequestClose={() => setRevising(null)}
        statusBarTranslucent
      >
        {!!revising && (
          <WorkRevisionRequest
            token={token}
            work={revising}
            onClose={() => setRevising(null)}
            onDone={load}
          />
        )}
      </Modal>

      {/* Full-screen watermarked preview. Tap the video to pause/resume. */}
      <Modal
        visible={!!previewing}
        animationType="fade"
        onRequestClose={() => setPreviewing(null)}
        statusBarTranslucent
      >
        {!!previewing && (
          <View style={styles.previewScreen}>
            <TouchableOpacity
              style={styles.previewVideoHit}
              activeOpacity={1}
              onPress={() => setPreviewPaused(p => !p)}
              accessibilityRole="button"
              accessibilityLabel={previewPaused ? 'Play' : 'Pause'}
            >
              <Video
                source={{
                  uri: mediaUrl(
                    previewing.watermarked_url ||
                      previewing.preview_url ||
                      previewing.video_url,
                  ) as string,
                }}
                style={styles.previewVideo}
                paused={previewPaused}
                resizeMode="contain"
                repeat
                controls={false}
              />
              {previewPaused && (
                <View style={styles.previewPlay}>
                  <Icon name="play" color="#FFFFFF" size={26} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.previewClose}
              onPress={() => setPreviewing(null)}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" color="#FFFFFF" size={20} />
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the rounded sheet below covers the rest,
  // matching Creator Bids.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the navy backdrop shows through, as on Creator Bids.
    backgroundColor: 'transparent',
  },
  // Spans the whole bar so the title centres on the screen, not on the space
  // left over between the back arrow and the buttons.
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerCount: {
    minWidth: scale(22),
    height: scale(22),
    paddingHorizontal: scale(7),
    borderRadius: scale(11),
    // Lifted off the navy backdrop rather than the old cream-on-white chip.
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCountText: {
    fontSize: fontScale(11),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  loading: { marginTop: scale(40) },
  content: { padding: scale(16), paddingTop: scale(16), paddingBottom: scale(30) },

  // Full-screen preview player.
  previewScreen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideoHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewPlay: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: scale(48),
    right: scale(20),
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    marginBottom: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    overflow: 'hidden',
  },
  media: {
    height: scale(180),
    backgroundColor: '#EFEFF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaImg: { width: '100%', height: '100%' },
  mediaFallback: { width: '100%', height: '100%', backgroundColor: '#E7E8F2' },
  playBtn: {
    position: 'absolute',
    width: scale(46),
    height: scale(46),
    borderRadius: scale(23),
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChip: {
    position: 'absolute',
    right: scale(10),
    bottom: scale(10),
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(6),
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  durationText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  cardBody: { padding: scale(14) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: scale(9) },
  title: {
    flex: 1,
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  pendingChip: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
    borderRadius: scale(8),
    backgroundColor: '#FFF3DF',
  },
  pendingText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#B4741B',
  },
  byline: { marginTop: scale(5), fontSize: fontScale(11), color: '#777B96' },

  metaGrid: {
    marginTop: scale(13),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
    padding: scale(11),
    borderRadius: scale(12),
    backgroundColor: '#FBFBFE',
    borderWidth: 1,
    borderColor: '#F1F2F8',
  },
  metaItem: {
    width: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
  },
  metaLabel: { fontSize: fontScale(9), color: '#9498B0' },
  metaValue: {
    marginTop: scale(1),
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },

  approveBtn: {
    marginTop: scale(13),
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
  },
  approveBtnOff: { backgroundColor: '#6FBF8E' },
  approveText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  secondaryRow: { marginTop: scale(9), flexDirection: 'row', gap: scale(9) },
  secondaryBtn: {
    flex: 1,
    height: scale(42),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  secondaryText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },

  empty: { marginTop: scale(30), padding: scale(22), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(12),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandWorkReview;
