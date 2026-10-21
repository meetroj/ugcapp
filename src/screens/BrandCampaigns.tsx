import { useLiveEffect } from "../liveUpdates";
/**
 * Brand campaigns — the native replacement for the web
 * /dashboard/business/all-campaigns page. Lists the brand's campaigns from
 * GET /api/campaigns with the website's eight status tabs and counts. Opening
 * a campaign goes to its detail page; opening a draft resumes it in the brief
 * wizard; drafts and rejected briefs can be deleted (DELETE /api/campaigns/{id}).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { Alert } from '../components/AppAlert';
import Svg, { Path, Rect } from 'react-native-svg';
import AppHeader from '../components/AppHeader';
import { SkeletonCampaignList } from '../components/Skeleton';
import { deleteCampaign, getCampaigns } from '../api';
import { CONTENT_MAX_WIDTH, NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
};

type Campaign = Record<string, any> & { id: string };

type Tab = {
  key: string;
  label: string;
  statuses: string[];
  dot: string;
};

/**
 * The website's eight tabs (BrandCampaigns.js TABS), same order and status
 * mapping, so a paused / rejected brief is never invisible. Each carries the
 * colour of its status dot so the filter row reads as a legend too.
 * `awaiting_brand_confirmation` (script written, the brand must confirm) is on
 * no website tab and only shows under All there; here it sits under Pending
 * because the brief is still pre-approval and the brand has to act on it.
 */
export const TABS: Tab[] = [
  { key: 'all', label: 'All Campaigns', statuses: [], dot: '#12143A' },
  {
    key: 'pending',
    label: 'Pending',
    statuses: ['pending_approval', 'awaiting_brand_confirmation'],
    dot: '#8B5CF6',
  },
  { key: 'live', label: 'Live', statuses: ['active', 'in_progress'], dot: '#22C55E' },
  { key: 'review', label: 'In Review', statuses: ['work_submitted'], dot: '#F5A623' },
  { key: 'completed', label: 'Completed', statuses: ['completed'], dot: '#3B82F6' },
  { key: 'hold', label: 'On Hold', statuses: ['paused'], dot: '#F97316' },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'], dot: '#E11D48' },
  { key: 'drafts', label: 'Drafts', statuses: ['draft'], dot: '#9BA0B8' },
];

/** Colour per status chip, so state is readable at a glance. */
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> =
  {
    active: { bg: '#DCFCE7', fg: '#15803D', label: 'ACTIVE' },
    in_progress: { bg: '#DCFCE7', fg: '#15803D', label: 'ACTIVE' },
    pending_approval: { bg: '#EDE9FE', fg: '#6D28D9', label: 'PENDING' },
    // The website list shows "Live" here, which hides that the brand must act.
    awaiting_brand_confirmation: { bg: '#FEF3C7', fg: '#B45309', label: 'CONFIRM SCRIPT' },
    work_submitted: { bg: '#EDE9FE', fg: '#6D28D9', label: 'IN REVIEW' },
    completed: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'COMPLETED' },
    draft: { bg: '#EEEFF4', fg: '#6E7391', label: 'DRAFT' },
    rejected: { bg: '#FFE4E6', fg: '#BE123C', label: 'REJECTED' },
    // Admin moderation: an on-hold or removed brief must never read as live.
    paused: { bg: '#FFEDD5', fg: '#C2410C', label: 'ON HOLD' },
    banned: { bg: '#EEEFF4', fg: '#6E7391', label: 'REMOVED' },
    cancelled: { bg: '#FFE4E6', fg: '#BE123C', label: 'CANCELLED' },
  };

/**
 * Tint per avatar tile. Picked from the campaign title so a given campaign
 * keeps the same colour between renders and refreshes.
 */
const AVATAR_TINTS = [
  { bg: '#EDE9FE', fg: '#6D28D9' },
  { bg: '#DCFCE7', fg: '#15803D' },
  { bg: '#FCE7F3', fg: '#BE185D' },
  { bg: '#FEF3C7', fg: '#B45309' },
  { bg: '#DBEAFE', fg: '#1D4ED8' },
  { bg: '#E0F2FE', fg: '#0369A1' },
];

function tintFor(title: string) {
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

/** Rupee amounts print in full here — the mockup shows "Rs. 5,000". */
const money = (value: unknown) => {
  const amount = Number(value) || 0;
  if (!amount) return '-';
  return `Rs. ${amount.toLocaleString('en-IN')}`;
};

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

/**
 * Spend vs. allocated. The card shows "spent / total": the left figure is what
 * the campaign is committed to now, the right one its ceiling. A single-figure
 * budget repeats on both sides, which is what the web page does too.
 */
function budgetPair(campaign: Campaign): { spent: string; total: string } {
  const total =
    Number(campaign.total_budget) ||
    Number(campaign.budget) ||
    Number(campaign.budget_max) ||
    Number(campaign.budget_min) ||
    0;
  const spent =
    // The website's first choice; GET /campaigns does not send it yet.
    Number(campaign.escrow_amount) ||
    Number(campaign.spent) ||
    Number(campaign.amount_spent) ||
    Number(campaign.per_video_budget) ||
    Number(campaign.budget_min) ||
    total;
  return { spent: money(Math.min(spent, total) || total), total: money(total) };
}

/**
 * How many creators the campaign involves, the website's rule: the hired
 * creators once anyone is hired, otherwise how many have bid. The headcount the
 * brand asked for (creators_wanted) is not a count of creators on the brief.
 */
export function creatorCount(campaign: Campaign): number {
  if (Array.isArray(campaign.selected_creators) && campaign.selected_creators.length) {
    return campaign.selected_creators.length;
  }
  if (campaign.selected_creator) return 1;
  if (Array.isArray(campaign.bids)) return campaign.bids.length;
  return 0;
}

/** Newest first, like the website; the backend returns insertion order. */
const createdAtMs = (campaign: Campaign) =>
  new Date(String(campaign.createdAt || campaign.created_at || 0)).getTime() || 0;

/** True when a failure is the phone being offline rather than the API refusing. */
const isOffline = (err: unknown) => (err as { name?: string })?.name === 'NetworkError';

/**
 * The deliverable line, e.g. "Reel (9:16, 15-30s)". The backend usually stores
 * this pre-formatted in `video_format`; the pieces are assembled only when it
 * doesn't.
 */
function formatLine(campaign: Campaign): string {
  const preset = text(campaign.video_format);
  if (preset) return preset;
  const kind = text(campaign.content_type, 'Reel');
  const parts = [text(campaign.aspect_ratio)];
  const seconds = Number(campaign.duration_seconds) || 0;
  if (seconds) parts.push(`under ${seconds}s`);
  const detail = parts.filter(Boolean).join(', ');
  return detail ? `${kind} (${detail})` : kind;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "20 May 2024" — the date style the mockup uses. */
function prettyDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The date row changes meaning with the campaign's state: a finished campaign
 * shows when it completed, one under review when it was submitted, and a live
 * one when it ends.
 */
function dateInfo(campaign: Campaign): { label: string; value: string } | null {
  const status = String(campaign.status || '');
  if (status === 'completed') {
    const done = prettyDate(campaign.completed_at || campaign.updated_at);
    return done ? { label: 'Completed on', value: done } : null;
  }
  if (status === 'pending_approval' || status === 'work_submitted') {
    const sent = prettyDate(campaign.submitted_at || campaign.created_at);
    return sent ? { label: 'Submitted on', value: sent } : null;
  }
  const ends = prettyDate(campaign.deadline || campaign.due_date);
  return ends ? { label: 'Ends on', value: ends } : null;
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
      {name === 'calendar' && (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} {...line} />
          <Path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" {...line} />
        </>
      )}
      {name === 'arrow' && (
        <Path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" {...line} />
      )}
      {name === 'trash' && (
        <Path d="M5 7h14M10 7V5h4v2m-7 0 .8 12h6.4L17 7" {...line} />
      )}
      {name === 'dots' && (
        <Path d="M6 12h.01M12 12h.01M18 12h.01" {...line} strokeWidth={2.4} />
      )}
    </Svg>
  );
}

function BrandCampaigns({
  token,
  onNavigate,
  onNotifications,
  onMessages,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // All is the website's default tab; paused / rejected briefs only show there
  // or under their own tab, so starting on a narrower one would hide them.
  const [tab, setTab] = useState<string>('all');
  const listRef = useRef<FlatList<Campaign>>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Non-empty when the last load FAILED, so a broken request never passes for
  // an empty account.
  const [loadError, setLoadError] = useState('');
  // Id of the draft being deleted: shows a busy card and ignores repeat taps.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleting = useRef(false);

  const load = useCallback(async () => {
    try {
      // The backend scopes this to the signed-in brand's own briefs and
      // returns every status, which is what the tabs below filter on.
      setCampaigns(await getCampaigns(token));
      setLoadError('');
    } catch (err) {
      // Keep whatever was already loaded rather than blanking the list.
      setLoadError(
        isOffline(err)
          ? "You're offline. Check your connection and try again."
          : (err as Error)?.message || 'Could not load your campaigns.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useLiveEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const groups = useMemo(() => {
    const newestFirst = [...campaigns].sort((a, b) => createdAtMs(b) - createdAtMs(a));
    return Object.fromEntries(TABS.map(item => [
      item.key,
      item.statuses.length
        ? newestFirst.filter(campaign => item.statuses.includes(String(campaign.status)))
        : newestFirst,
    ]));
  }, [campaigns]);
  const visible = groups[tab] || campaigns;
  const tabLabel = TABS.find(item => item.key === tab)?.label || '';

  const selectTab = useCallback((key: string) => {
    setTab(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // A draft is not a real campaign yet (the detail page would show it half
  // empty and read-only), so it reopens in the brief wizard to be finished.
  const openCampaign = useCallback((campaign: Campaign) => {
    if (campaign.status === 'draft') {
      onNavigate(`/dashboard/business/post-brief?draft=${encodeURIComponent(campaign.id)}`);
      return;
    }
    onNavigate(`/campaigns/${campaign.id}`);
  }, [onNavigate]);

  // Only drafts / rejected briefs: nothing was ever held in escrow or shown to
  // creators, so the backend allows a hard delete. Ask first, then do it.
  const askDelete = useCallback((campaign: Campaign) => {
    if (deleting.current) return;
    const name = text(campaign.title, 'Untitled campaign');
    const kind = campaign.status === 'draft' ? 'draft' : 'brief';
    Alert.alert(
      `Delete this ${kind}?`,
      `"${name}" will be deleted permanently. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${kind}`,
          style: 'destructive',
          onPress: async () => {
            if (deleting.current) return;
            deleting.current = true;
            setDeletingId(campaign.id);
            try {
              await deleteCampaign(token, campaign.id);
              // Drop it now so the card disappears, then resync with the server.
              setCampaigns(current => current.filter(item => item.id !== campaign.id));
              load();
            } catch (err) {
              Alert.alert(
                `Could not delete the ${kind}`,
                isOffline(err)
                  ? "You're offline. Check your connection and try again."
                  : (err as Error)?.message || 'Please try again.',
              );
            } finally {
              deleting.current = false;
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, [load, token]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <AppHeader
          title="Campaigns"
          onNotifications={onNotifications}
          onMessages={onMessages}
        />
      </View>
      <View style={styles.sheet}>
          <View style={styles.stickyTop}>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              style={styles.tabsBar}
              contentContainerStyle={styles.tabs}
            >
              {TABS.map(item => {
                const active = tab === item.key;
                const count = (groups[item.key] || []).length;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => selectTab(item.key)}
                    accessibilityRole="tab"
                    accessibilityLabel={`Filter: ${item.label}`}
                    accessibilityValue={{ text: `${count} campaigns` }}
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {item.label} ({count})
                    </Text>
                    <View
                      style={[styles.tabDot, { backgroundColor: item.dot }]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        <FlatList
          ref={listRef}
          data={loading ? [] : visible}
          keyExtractor={campaign => campaign.id}
          extraData={`${tab}|${deletingId}`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.page, styles.content]}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              setRefreshing(true);
              load();
            }} />
          }
          // A refresh that failed while an older list is on screen: say so
          // instead of quietly showing stale rows.
          ListHeaderComponent={!loading && !!loadError && campaigns.length > 0 ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {loadError} Showing the last list we loaded.
              </Text>
              <TouchableOpacity
                onPress={retry}
                style={styles.retryLink}
                accessibilityRole="button"
                accessibilityLabel="Retry loading campaigns"
              >
                <Text style={styles.retryLinkText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : undefined}
          ListEmptyComponent={loading ? <SkeletonCampaignList count={4} /> : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {loadError
                  ? "Couldn't load your campaigns"
                  : tab === 'all'
                  ? 'No campaigns yet'
                  : `Nothing in "${tabLabel}"`}
              </Text>
              <Text style={styles.emptyText}>
                {loadError
                  ? loadError
                  : tab === 'all'
                  ? 'Launch your first campaign to start collaborating with creators and getting authentic content.'
                  : 'Campaigns will appear here once they reach this stage.'}
              </Text>
              {(!!loadError || tab === 'all' || campaigns.length > 0) && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={
                    loadError
                      ? retry
                      : tab === 'all'
                      ? () => onNavigate('/dashboard/business/post-brief')
                      : () => selectTab('all')
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyBtnText}>
                    {loadError
                      ? 'Try again'
                      : tab === 'all'
                      ? 'Post your first campaign'
                      : 'Show all campaigns'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          renderItem={({ item: campaign }) => {

                const status = String(campaign.status || '');
                const chip = STATUS_STYLE[status] || {
                  bg: '#EEEFF4',
                  fg: '#6E7391',
                  label: (status || 'UNKNOWN').toUpperCase(),
                };
                const title = text(campaign.title, 'Untitled campaign');
                const tint = tintFor(title);
                const count = creatorCount(campaign);
                const budget = budgetPair(campaign);
                const when = dateInfo(campaign);
                const isDraft = status === 'draft';
                const deletable = isDraft || status === 'rejected';
                const busyDelete = deletingId === campaign.id;
                return (
                  // The whole card opens the campaign (a draft reopens in the
                  // wizard), so the title row needs no "more" affordance.
                  <TouchableOpacity
                    key={campaign.id}
                    style={[styles.card, busyDelete && styles.cardBusy]}
                    onPress={() => openCampaign(campaign)}
                    disabled={busyDelete}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${chip.label}`}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardTop}>
                      <View
                        style={[styles.avatar, { backgroundColor: tint.bg }]}
                      >
                        <Text style={[styles.avatarText, { color: tint.fg }]}>
                          {title.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.cardHead}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <View style={styles.subRow}>
                          <Text style={styles.cardSub} numberOfLines={1}>
                            {count} {count === 1 ? 'creator' : 'creators'}
                          </Text>
                          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                            <Text style={[styles.chipText, { color: chip.fg }]}>
                              {chip.label}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {deletable && (
                        <TouchableOpacity
                          style={styles.trashBtn}
                          onPress={() => askDelete(campaign)}
                          disabled={busyDelete}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${isDraft ? 'draft' : 'rejected brief'} ${title}`}
                        >
                          <Icon name="trash" color="#BE123C" size={18} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Format on its own line, as before. */}
                    <View style={styles.metaRow}>
                      <Icon name="calendar" color="#9BA0B8" size={14} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {formatLine(campaign)}
                      </Text>
                      {!!when && (
                        <Text style={styles.metaDate} numberOfLines={1}>
                          {when.label} {when.value}
                        </Text>
                      )}
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.footer}>
                      <Text style={styles.budget} numberOfLines={1}>
                        {budget.spent}
                        <Text style={styles.budgetTotal}>
                          {'  / '}
                          {budget.total}
                        </Text>
                      </Text>
                      <View style={styles.detailBtn}>
                        <Text style={styles.detailBtnText}>
                          {isDraft ? 'Edit Draft' : 'View Details'}
                        </Text>
                        <Icon name="arrow" color="#3D4FD8" size={13} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );

          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy, like the other brand tabs: the sheet's rounded top corners are
  // transparent, so this is what shows through the curve under the header.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  // Navy strip behind the shared app header, matching the other tabs.
  topBar: { backgroundColor: '#0E1330' },
  // Content sheet: curves over the navy header strip like the other tabs.
  sheet: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  // Capped and centred so a tablet gets a column, not a stretched phone.
  page: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingBottom: scale(24) + NAV_CLEARANCE,
  },
  // Filters stay outside the list so scrolling never intercepts their taps.
  stickyTop: { backgroundColor: '#F7F8FC' },

  tabsBar: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: scale(18), gap: scale(9), paddingTop: scale(16), paddingBottom: scale(14) },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    minHeight: scale(44),
    paddingHorizontal: scale(16),
    borderRadius: scale(19),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E8F2',
  },
  tabActive: { backgroundColor: '#12143A', borderColor: '#12143A' },
  tabText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5A5F7D',
  },
  tabTextActive: { color: '#FFFFFF' },
  tabDot: { width: scale(7), height: scale(7), borderRadius: scale(4) },

  content: { paddingHorizontal: scale(18), paddingTop: scale(2) },

  card: {
    marginBottom: scale(10),
    padding: scale(13),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  cardBusy: { opacity: 0.5 },
  // 36 + hitSlop 4 each side = the 44 point touch target.
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  avatar: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontScale(16),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  cardHead: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontSize: fontScale(14.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#12143A',
  },
  subRow: {
    marginTop: scale(4),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: scale(8),
    rowGap: scale(4),
  },
  cardSub: { flexShrink: 1, fontSize: fontScale(13), color: '#8A8FA8' },
  chip: { paddingHorizontal: scale(8), paddingVertical: scale(4), borderRadius: scale(7) },
  chipText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Format line, on its own row under the title.
  metaRow: {
    marginTop: scale(16),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: scale(6),
    rowGap: scale(4),
  },
  // The date drops to its own line instead of squeezing the format at 320dp.
  metaText: { flexGrow: 1, flexShrink: 1, minWidth: scale(120), fontSize: fontScale(13), color: '#5A5F7D' },
  metaDate: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8A8FA8',
  },

  // Separates the price row from the details above it.
  divider: { height: 1, backgroundColor: '#F0F1F7', marginTop: scale(16) },

  footer: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(10),
  },
  budget: {
    flex: 1,
    fontSize: fontScale(14.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#12143A',
  },
  budgetTotal: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
    color: '#A3A7BD',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    height: scale(32),
    paddingHorizontal: scale(12),
    borderRadius: scale(10),
    backgroundColor: '#F4F5FC',
  },
  detailBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },

  empty: {
    marginTop: scale(30),
    padding: scale(22),
    alignItems: 'center',
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
  emptyBtn: {
    marginTop: scale(16),
    minHeight: scale(44),
    paddingHorizontal: scale(20),
    borderRadius: scale(13),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B2A6B',
  },
  emptyBtnText: {
    fontSize: fontScale(13.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorBanner: {
    marginBottom: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFE6E7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  errorBannerText: { flex: 1, fontSize: fontScale(14), color: '#C4373B' },
  retryLink: {
    minHeight: scale(44),
    paddingHorizontal: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLinkText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#C4373B',
  },
});

export default BrandCampaigns;
