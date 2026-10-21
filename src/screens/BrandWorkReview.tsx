import { useLiveEffect } from "../liveUpdates";
import { submissionHistory } from '../submissionHistory';
import { Alert } from '../components/AppAlert';
/**
 * Work Review — the native replacement for the web
 * /dashboard/business/work-review page. Lists the submissions waiting on the
 * brand from GET /api/work/pending-review, with the metadata strip and action
 * row from the design. Both decisions are native: Approve confirms first and
 * posts to POST /api/work/{work_id}/approve, and Request Revision opens the
 * structured composer in WorkRevisionRequest.
 *
 * Like the website, tabs also show what is no longer pending, from
 * GET /api/business/work-review: approved work (with Download) and work sent
 * back for a revision. That list also carries the per-deal revision counters
 * (used, free limit, fee) the pending-review rows lack, so they are merged on.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import ChoiceSheet from '../components/ChoiceSheet';
import RateCreatorSheet from '../components/RateCreatorSheet';
import ReviewPlayer from '../components/ReviewPlayer';
import { SkeletonList } from '../components/Skeleton';
import WorkRevisionRequest from './WorkRevisionRequest';
import {
  approveWork,
  BACKEND_URL,
  getPendingWork,
  getBusinessDeals,
  getWorkDownloadLink,
  getWorkReview,
  postReview,
} from '../api';
import {
  REVIEW_PAGE_SIZES,
  approveConfirm,
  approveLabel,
  approveMessage,
  canReviewAfterApprove,
  fileExt,
  paginate,
  revisionCounterFields,
} from '../brandHiring';
import { errorMessage } from '../payoutRules';
import { CONTENT_MAX_WIDTH, NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
  /** Opens the native chat with one creator; without it Message falls back to the inbox. */
  onOpenThread?: (userId: string, name: string) => void;
};

type Work = Record<string, any> & { id: string };

// Same tabs as the website's Work Review. "All" is the default there too.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'revision_requested', label: 'Revision' },
];
const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  revision_requested: 'Revision',
  awaiting_edit: 'With UGC.ad Editors',
  awaiting_edited: 'Creator Editing',
};

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const mediaUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

const isVideoUrl = (u: string | null) =>
  !!u && (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u));

// Still poster frame for a submitted video, so the card shows a real image
// instead of a blank tile (an <Image> can't render an .mp4 URL). Cloudinary
// videos get a `so_0` JPG; a non-video URL is already an image.
const posterUrl = (u: string | null): string | null => {
  if (!u) return null;
  if (!isVideoUrl(u)) return u;
  const m = u.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i);
  if (m) return `${m[1]}so_0/${m[2].replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg')}`;
  return null;
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
      {name === 'download' && (
        <Path d="M12 4v11m0 0-4-4m4 4 4-4M5 19.5h14" {...line} />
      )}
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
  onOpenThread,
}: Props) {
  const [items, setItems] = useState<Work[]>([]);
  // Everything that is NOT awaiting review (approved, revision requested, with
  // editors), from the all-statuses list. Pending rows keep coming from
  // `items`, whose ids are what approve / request-revision expect.
  const [others, setOthers] = useState<Array<Record<string, any>>>([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The submission whose revision composer is open.
  const [revising, setRevising] = useState<Work | null>(null);
  // The video playing in the full-screen player (watermarked until approved).
  const [previewing, setPreviewing] = useState<{
    id?: string;
    uri: string;
    watermark: boolean;
    title?: string;
  } | null>(null);
  // The just-approved submission whose creator the brand is being asked to
  // rate. Null hides the sheet.
  const [rating, setRating] = useState<Work | null>(null);
  // Why the last load failed ('' when it worked), shown with a Retry.
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(REVIEW_PAGE_SIZES[0]);
  const [perPageOpen, setPerPageOpen] = useState(false);
  // Real length (seconds) of videos the brand has opened; the brief's requested
  // length is shown until then.
  const [durations, setDurations] = useState<Record<string, number>>({});
  // Row id being downloaded, to block a double tap.
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, review, deals] = await Promise.all([
        getPendingWork(token),
        // Optional extra: if it fails the pending list still works as before.
        getWorkReview(token).catch(() => []),
        getBusinessDeals(token).catch(() => []),
      ]);
      // pending-review rows carry no revision counters; the work-review row for
      // the same (campaign, creator) does, so the composer can warn about fees.
      const counters = new Map<string, Record<string, any>>();
      review.forEach(row =>
        counters.set(`${row.campaignId}:${row.creatorId}`, revisionCounterFields(row)),
      );
      setItems(
        list.map((work, index) => ({
          ...work,
          id: String(work.id ?? index),
          ...counters.get(`${work.campaign_id}:${work.creator_id}`),
        })),
      );
      setOthers([...review.filter(row => row.status !== 'pending_review'), ...submissionHistory(deals)]);
      setLoadError('');
    } catch (error) {
      // Keep whatever is on screen and say why it is stale, with a Retry.
      setLoadError(errorMessage(error, 'Could not load submissions.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useLiveEffect(() => {
    load();
  }, [load]);

  /**
   * Approving releases escrow to the creator and cannot be undone (PRD 8.6),
   * so it is confirmed first. `approving` holds the work id mid-request so the
   * card's button can show progress and block a double tap.
   */
  const [approving, setApproving] = useState<string | null>(null);
  const approvingRef = useRef(false);

  const runApprove = useCallback(
    async (work: Work) => {
      if (approvingRef.current) return;
      approvingRef.current = true;
      setApproving(work.id);
      try {
        // approveWork throws with the backend's own `detail` message, which
        // explains refusals (open dispute, already approved).
        const result = await approveWork(token, work.id);
        // The deal leaves AWAITING_REVIEW, so it drops off this list.
        load();
        // Rating the creator is the web's next step, but only once the creator
        // was actually paid: the server refuses a review after a raw or partial
        // approval. Skipping is fine, the review is optional too.
        const canRate =
          !!work.creator_id &&
          !!work.campaign_id &&
          canReviewAfterApprove(result as any, work);
        Alert.alert('Approved', approveMessage(result as any, work), [
          { text: canRate ? 'Continue' : 'OK', onPress: () => canRate && setRating(work) },
        ]);
      } catch (err: any) {
        Alert.alert('Not approved', errorMessage(err, 'Could not approve this work.'));
      } finally {
        approvingRef.current = false;
        setApproving(null);
      }
    },
    [token, load],
  );

  /** Posts the rating; the sheet shows any failure inline and stays open. */
  const submitRating = useCallback(
    async (stars: number, review: string) => {
      if (!rating) return;
      await postReview(token, {
        campaign_id: rating.campaign_id,
        creator_id: rating.creator_id,
        rating: stars,
        review,
      });
      setRating(null);
      Alert.alert('Review submitted', 'Thanks for the feedback!');
    },
    [rating, token],
  );

  const confirmApprove = useCallback(
    (work: Work) => {
      const { title, body } = approveConfirm(work, text(work.creator_name, 'the creator'));
      Alert.alert(title, body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => runApprove(work) },
      ]);
    },
    [runApprove],
  );

  /** Chat with the creator of a submission (native thread when wired). */
  const message = useCallback(
    (creatorId: unknown, name: string) => {
      if (creatorId && onOpenThread) onOpenThread(String(creatorId), name);
      else onNavigate('/messages');
    },
    [onNavigate, onOpenThread],
  );

  /**
   * Downloads an approved delivery through GET /work/{id}/download?as_link=1:
   * the server only unlocks it after approval and names the file with its real
   * extension. `kind` picks the raw or edited file when both exist.
   */
  const download = useCallback(
    async (row: Record<string, any>, kind?: string) => {
      const key = `${row.id}:${kind || ''}`;
      if (downloading) return;
      setDownloading(key);
      try {
        const link = await getWorkDownloadLink(token, String(row.id), kind);
        const url = mediaUrl(link?.url);
        if (!url) throw new Error('The download link is unavailable.');
        await Linking.openURL(url);
      } catch (err: any) {
        Alert.alert('Download failed', errorMessage(err, 'Download failed'));
      } finally {
        setDownloading(null);
      }
    },
    [downloading, token],
  );

  const pendingShown = tab === 'all' || tab === 'pending_review' ? items : [];
  const othersShown =
    tab === 'all' ? others : others.filter(row => row.status === tab);

  // One list over both sources, pending first, so the footer counts every row.
  const combined = [
    ...pendingShown.map(work => ({ kind: 'pending' as const, work })),
    ...othersShown.map(row => ({ kind: 'other' as const, row })),
  ];
  const paged = paginate(combined, page, perPage);
  const pagePending = paged.rows.flatMap(entry =>
    entry.kind === 'pending' ? [entry.work] : [],
  );
  const pageOthers = paged.rows.flatMap(entry =>
    entry.kind === 'other' ? [entry.row] : [],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
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
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" color="#FFFFFF" size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onMessages}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
            >
              {TABS.map(t => {
                const count =
                  t.key === 'all'
                    ? items.length + others.length
                    : t.key === 'pending_review'
                    ? items.length
                    : others.filter(row => row.status === t.key).length;
                const on = tab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tab, on && styles.tabOn]}
                    onPress={() => {
                      setTab(t.key);
                      setPage(1);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>
                      {t.label} {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!!loadError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setRefreshing(true);
                    load();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading submissions"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!pendingShown.length && !othersShown.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {loadError ? "Couldn't load submissions" : 'Nothing here'}
                </Text>
                <Text style={styles.emptyText}>
                  {loadError
                    ? 'Pull down or tap Retry to try again.'
                    : "Submissions from creators appear here when they're ready for your approval."}
                </Text>
              </View>
            ) : (
              pagePending.map(work => {
                const files = Array.isArray(work.work_files) ? work.work_files : [];
                const rawPlayable =
                  work.watermarked_url ||
                  work.preview_url ||
                  work.video_url ||
                  files[0];
                const playable = mediaUrl(rawPlayable as string);
                // Prefer a real thumbnail; if the only source is a video URL,
                // derive a poster frame so the card isn't blank.
                const thumb = mediaUrl(
                  (work.thumbnail_url as string) ||
                    posterUrl(mediaUrl(work.preview_url as string) || playable),
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
                      onPress={() =>
                        setPreviewing({
                          id: work.id,
                          uri: playable as string,
                          watermark: true,
                          title: campaign || undefined,
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Play preview"
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.mediaImg}
                          resizeMode="cover"
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
                          <Text style={styles.pendingText}>
                            {work.stage === 'raw' ? 'Raw video' : work.stage === 'edited' ? 'Edited video' : 'Pending Review'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.byline}>
                        by {who} · Submitted on{' '}
                        {formatDate(work.submitted_at || work.created_at)}
                      </Text>

                      <View style={styles.metaGrid}>
                        <View style={styles.metaItem}>
                          <Icon name="clock" color="#9498B0" size={13} />
                          <View style={styles.metaCopy}>
                            <Text style={styles.metaLabel}>
                              {durations[work.id] ? 'Duration' : 'Duration (brief)'}
                            </Text>
                            <Text style={styles.metaValue}>
                              {durations[work.id] || work.duration_seconds
                                ? duration(durations[work.id] || work.duration_seconds)
                                : '-'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon name="file" color="#9498B0" size={13} />
                          <View style={styles.metaCopy}>
                            <Text style={styles.metaLabel}>File type</Text>
                            <Text style={styles.metaValue}>
                              {fileExt(rawPlayable) || '-'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon name="calendar" color="#9498B0" size={13} />
                          <View style={styles.metaCopy}>
                            <Text style={styles.metaLabel}>Submitted</Text>
                            <Text style={styles.metaValue}>
                              {formatDate(
                                work.submitted_at || work.created_at,
                              ) || '-'}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.metaItem}
                          disabled={!work.campaign_id}
                          onPress={() => onNavigate(`/campaigns/${work.campaign_id}`)}
                          accessibilityRole="link"
                          accessibilityLabel={`Open campaign ${campaign || ''}`}
                        >
                          <Icon name="campaign" color="#4C5BF3" size={13} />
                          <View style={styles.metaCopy}>
                            <Text style={styles.metaLabel}>Campaign</Text>
                            <Text style={styles.metaLinkValue} numberOfLines={1}>
                              {campaign || '-'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Every submitted file (raw AND edited), each playable. */}
                      {Array.isArray(work.files) && work.files.length > 1 && (
                        <View style={styles.secondaryRow}>
                          {work.files.map((f: any) => (
                            <TouchableOpacity
                              key={`${f.kind}-${f.url}`}
                              style={styles.secondaryBtn}
                              onPress={() =>
                                setPreviewing({
                                  uri: mediaUrl(f.url) as string,
                                  watermark: true,
                                  title: `${campaign} - ${f.label}`,
                                })
                              }
                              accessibilityRole="button"
                            >
                              <Icon name="play" color="#5C6180" size={14} />
                              <Text style={styles.secondaryText}>{f.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <TouchableOpacity style={styles.secondaryBtn}
                        onPress={() =>
                          setPreviewing({
                            id: work.id,
                            uri: playable as string,
                            watermark: true,
                            title: campaign || undefined,
                          })
                        }
                        disabled={!playable} accessibilityRole="button" accessibilityLabel="Open full-screen video">
                        <Text style={styles.secondaryText}>View full video</Text>
                      </TouchableOpacity>
                      <View style={styles.decisionRow}>
                      <TouchableOpacity
                        style={[
                          styles.approveBtn,
                          styles.decisionButton,
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
                            <Text style={styles.approveText}>
                              {approveLabel(work)}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.secondaryBtn, styles.decisionButton]}
                          disabled={approving === work.id}
                          onPress={() => setRevising(work)}
                          accessibilityRole="button"
                        >
                          <Icon name="revision" color="#5C6180" size={14} />
                          <Text style={styles.secondaryText}>
                            Request Revision
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.secondaryRow}>
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => message(work.creator_id, who)}
                          accessibilityRole="button"
                          accessibilityLabel={`Message ${who}`}
                        >
                          <Icon name="chat" color="#5C6180" size={14} />
                          <Text style={styles.secondaryText}>Message creator</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {pageOthers.map(row => {
              const urls: string[] = Array.isArray(row.files) ? row.files : [];
              const playable = mediaUrl(
                urls.find(u => isVideoUrl(mediaUrl(u))) || urls[0],
              );
              const thumb = posterUrl(playable);
              const approved = row.status === 'approved' && !row.historical;
              return (
                <View key={`other-${row.id}`} style={styles.card}>
                  <TouchableOpacity
                    style={styles.media}
                    disabled={!playable}
                    onPress={() =>
                      setPreviewing({
                        id: String(row.id),
                        uri: playable as string,
                        watermark: row.status !== 'approved',
                        title: text(row.title) || undefined,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Play video"
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.mediaImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.mediaFallback} />
                    )}
                    <View style={styles.playBtn}>
                      <Icon name="play" color="#15163F" size={20} />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text style={styles.title} numberOfLines={1}>
                        {text(row.title, 'Submission')}
                      </Text>
                      <View style={styles.pendingChip}>
                        <Text style={styles.pendingText}>
                          {row.historical ? 'Previous upload' : STATUS_LABEL[row.status] || 'Submitted'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.byline}>
                      by {text(row.creator, 'Creator')} · Submitted on{' '}
                      {formatDate(row.submittedAt)}
                    </Text>

                    {approved ? (
                      (Array.isArray(row.labeledFiles) && row.labeledFiles.length > 1
                        ? row.labeledFiles
                        : [{ kind: undefined, label: '' }]
                      ).map((file: any) => (
                        <TouchableOpacity
                          key={file.kind || 'file'}
                          style={[
                            styles.approveBtn,
                            downloading === `${row.id}:${file.kind || ''}` &&
                              styles.approveBtnOff,
                          ]}
                          disabled={!!downloading}
                          onPress={() => download(row, file.kind)}
                          accessibilityRole="button"
                        >
                          {downloading === `${row.id}:${file.kind || ''}` ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <>
                              <Icon name="download" color="#FFFFFF" size={16} />
                              <Text style={styles.approveText}>
                                {file.label ? `Download ${file.label}` : 'Download'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={styles.waitingNote}>
                        {row.historical ? 'Previous upload - retained for comparison.' : row.status === 'revision_requested'
                          ? "Awaiting resubmit - the creator's new cut will appear under Pending."
                          : row.status === 'awaiting_edit'
                          ? "UGC.ad's editors are working on this video."
                          : 'The creator is editing this video.'}
                      </Text>
                    )}

                    <View style={styles.secondaryRow}>
                      {!!row.campaignId && (
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => onNavigate(`/campaigns/${row.campaignId}`)}
                          accessibilityRole="link"
                          accessibilityLabel="Open campaign"
                        >
                          <Icon name="campaign" color="#5C6180" size={14} />
                          <Text style={styles.secondaryText}>Campaign</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() =>
                          message(row.creatorId, text(row.creator, 'the creator'))
                        }
                        accessibilityRole="button"
                      >
                        <Icon name="chat" color="#5C6180" size={14} />
                        <Text style={styles.secondaryText}>Message creator</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {paged.total > 0 && (
              <View style={styles.pager}>
                <Text style={styles.pagerCount}>
                  Showing {paged.from}-{paged.to} of {paged.total} results
                </Text>
                <View style={styles.pagerRow}>
                  <TouchableOpacity
                    style={[styles.pagerBtn, paged.page <= 1 && styles.pagerBtnOff]}
                    disabled={paged.page <= 1}
                    onPress={() => setPage(paged.page - 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Previous page"
                  >
                    <Text style={styles.pagerBtnText}>Previous</Text>
                  </TouchableOpacity>
                  <Text style={styles.pagerPage}>
                    {paged.page} / {paged.pageCount}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.pagerBtn,
                      paged.page >= paged.pageCount && styles.pagerBtnOff,
                    ]}
                    disabled={paged.page >= paged.pageCount}
                    onPress={() => setPage(paged.page + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Next page"
                  >
                    <Text style={styles.pagerBtnText}>Next</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.pagerBtn}
                  onPress={() => setPerPageOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Rows per page"
                >
                  <Text style={styles.pagerBtnText}>{perPage} per page</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <ChoiceSheet
        visible={perPageOpen}
        title="Rows per page"
        options={REVIEW_PAGE_SIZES.map(size => ({
          label: `${size} per page`,
          onPress: () => {
            setPerPage(size);
            setPage(1);
          },
        }))}
        onClose={() => setPerPageOpen(false)}
      />

      {/* The structured composer replaces the old text-only sheet: comments
          pinned to a video timestamp, a deadline, and an optional note. */}
      <Modal
        visible={!!revising}
        animationType="slide"
        onRequestClose={() => setRevising(null)}
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
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

      {/* Rate the creator, offered right after an approval that paid them; the
          web does the same, and it is the one moment a brand will do it. */}
      <RateCreatorSheet
        visible={!!rating}
        creatorName={text(rating?.creator_name, 'this creator')}
        onSubmit={submitRating}
        onClose={() => setRating(null)}
      />

      <ReviewPlayer
        uri={previewing ? previewing.uri : null}
        watermark={!!previewing?.watermark}
        title={previewing?.title}
        onDuration={seconds => {
          const id = previewing?.id;
          if (id) setDurations(prev => ({ ...prev, [id]: seconds }));
        }}
        onClose={() => setPreviewing(null)}
      />
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
    // Flat 44 so the touch target holds on a 320dp phone too.
    width: 44,
    height: 44,
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
  // Capped and centred so a tablet gets a column, not a stretched phone.
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(16),
    paddingTop: scale(16),
    paddingBottom: scale(30) + NAV_CLEARANCE,
  },

  errorBanner: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  errorText: { flex: 1, fontSize: fontScale(14), color: '#B3261E' },
  retryBtn: {
    minHeight: scale(44),
    minWidth: scale(60),
    paddingHorizontal: scale(12),
    borderRadius: scale(10),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#B3261E',
  },
  metaLinkValue: {
    marginTop: scale(1),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },

  pager: { marginTop: scale(4), alignItems: 'center', gap: scale(10) },
  pagerCount: { fontSize: fontScale(13), color: '#777B96' },
  pagerRow: { flexDirection: 'row', alignItems: 'center', gap: scale(14) },
  pagerBtn: {
    minHeight: scale(44),
    minWidth: scale(88),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnOff: { opacity: 0.4 },
  pagerBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  pagerPage: { fontSize: fontScale(13), color: '#15163F' },

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
    fontSize: fontScale(11),
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
    flexShrink: 0,
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
  byline: { marginTop: scale(5), fontSize: fontScale(13), color: '#777B96' },

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
  // The text block beside each icon: lets a long campaign name ellipsize
  // instead of pushing the grid wider than the card.
  metaCopy: { flexShrink: 1, minWidth: 0 },
  metaLabel: { fontSize: fontScale(11), color: '#8A8FA8' },
  metaValue: {
    marginTop: scale(1),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },

  decisionRow: { flexDirection: 'row', gap: scale(10), marginTop: scale(12) },
  decisionButton: { flex: 1, marginTop: 0, minHeight: 48, height: 'auto', paddingVertical: scale(10) },
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
    flexShrink: 1,
    textAlign: 'center',
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  secondaryRow: { marginTop: scale(9), flexDirection: 'row', gap: scale(9) },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: scale(8),
    paddingHorizontal: scale(8),
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
    flexShrink: 1,
    textAlign: 'center',
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },

  empty: { marginTop: scale(30), padding: scale(22), alignItems: 'center' },
  tabs: { gap: scale(8), paddingBottom: scale(12) },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
    borderRadius: scale(18),
    backgroundColor: '#F1F2F8',
  },
  tabOn: { backgroundColor: '#15163F' },
  tabText: { fontSize: fontScale(13), fontWeight: '700', color: '#5C6180' },
  tabTextOn: { color: '#FFFFFF' },
  waitingNote: {
    marginTop: scale(10),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7C819C',
  },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(14),
    color: '#858AA3',
    textAlign: 'center',
  },

  // Rate-the-creator sheet, shown once an approval lands.
  ratingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  ratingSheet: {
    width: '100%',
    maxWidth: scale(360),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(18),
  },
  ratingTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-Medium',
    color: '#25274C',
  },
  ratingBody: {
    marginTop: scale(5),
    fontSize: fontScale(12),
    color: '#858AA3',
  },
  stars: {
    flexDirection: 'row',
    gap: scale(8),
    marginTop: scale(14),
    marginBottom: scale(4),
  },
  star: { fontSize: fontScale(30), color: '#DCDEEB' },
  starOn: { color: '#F5B301' },
  ratingInput: {
    marginTop: scale(10),
    minHeight: scale(78),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    padding: scale(12),
    fontSize: fontScale(13),
    color: '#25274C',
    textAlignVertical: 'top',
  },
  ratingActions: {
    flexDirection: 'row',
    gap: scale(10),
    marginTop: scale(14),
  },
  ratingSkip: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSkipText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  ratingSend: {
    flex: 1.4,
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSendText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default BrandWorkReview;
