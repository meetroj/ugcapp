/**
 * Brand campaigns — the native replacement for the web
 * /dashboard/business/all-campaigns page. Lists the brand's campaigns from
 * GET /api/campaigns with status tabs. Read-only: opening a campaign or
 * posting a brief hands off to the existing web flow.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Path, Rect } from 'react-native-svg';
import AppHeader from '../components/AppHeader';
import { SkeletonCampaignList } from '../components/Skeleton';
import { getCampaigns } from '../api';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

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
 * Tabs map to the campaign statuses the backend stores. Each carries the
 * colour of its status dot so the filter row reads as a legend too.
 */
const TABS: Tab[] = [
  {
    key: 'active',
    label: 'Active',
    statuses: ['active', 'in_progress'],
    dot: '#22C55E',
  },
  {
    key: 'review',
    label: 'In Review',
    statuses: ['pending_approval', 'work_submitted'],
    dot: '#F5A623',
  },
  {
    key: 'completed',
    label: 'Complete',
    statuses: ['completed'],
    dot: '#3B82F6',
  },
  { key: 'draft', label: 'Draft', statuses: ['draft'], dot: '#9BA0B8' },
];

/** Colour per status chip, so state is readable at a glance. */
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> =
  {
    active: { bg: '#DCFCE7', fg: '#15803D', label: 'ACTIVE' },
    in_progress: { bg: '#DCFCE7', fg: '#15803D', label: 'ACTIVE' },
    pending_approval: { bg: '#EDE9FE', fg: '#6D28D9', label: 'IN REVIEW' },
    work_submitted: { bg: '#EDE9FE', fg: '#6D28D9', label: 'IN REVIEW' },
    completed: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'COMPLETED' },
    draft: { bg: '#EEEFF4', fg: '#6E7391', label: 'DRAFT' },
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
  if (!amount) return '—';
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
    Number(campaign.spent) ||
    Number(campaign.amount_spent) ||
    Number(campaign.per_video_budget) ||
    Number(campaign.budget_min) ||
    total;
  return { spent: money(Math.min(spent, total) || total), total: money(total) };
}

/**
 * How many creators the campaign involves. Prefers the accepted creators, then
 * the headcount asked for, then the bids received — whichever the document has.
 */
function creatorCount(campaign: Campaign): number {
  if (Array.isArray(campaign.selected_creators)) {
    return campaign.selected_creators.length;
  }
  if (campaign.selected_creator) return 1;
  if (Number(campaign.creators_needed)) return Number(campaign.creators_needed);
  if (Array.isArray(campaign.bids)) return campaign.bids.length;
  return Number(campaign.applications) || 0;
}

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
  // Active is the default view: it's the list a brand needs most often.
  const [tab, setTab] = useState<string>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Separates "no campaigns yet" from "the list could not be loaded".
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      // The backend scopes this to the signed-in brand's own briefs and
      // returns every status, which is what the tabs below filter on.
      setCampaigns(await getCampaigns(token));
      setFailed(false);
    } catch {
      // Offline or the API is down. Keep whatever was already loaded rather
      // than blanking the list; pull-to-refresh retries the real request.
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const statuses = TABS.find(item => item.key === tab)?.statuses;
    // Only reachable if `tab` somehow holds a key no longer in TABS.
    if (!statuses) return campaigns;
    return campaigns.filter(campaign =>
      statuses.includes(String(campaign.status)),
    );
  }, [campaigns, tab]);

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
        <ScrollView
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
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
          <View style={styles.stickyTop}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsBar}
              contentContainerStyle={styles.tabs}
            >
              {TABS.map(item => {
                const active = tab === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => setTab(item.key)}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {item.label}
                    </Text>
                    <View
                      style={[styles.tabDot, { backgroundColor: item.dot }]}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {loading ? (
            <View style={styles.content}>
              <SkeletonCampaignList count={4} />
            </View>
          ) : !visible.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {failed ? "Couldn't load campaigns" : 'Nothing here yet'}
              </Text>
              <Text style={styles.emptyText}>
                {failed
                  ? 'Check your connection and pull down to try again.'
                  : tab === 'all'
                  ? 'Post your first brief to start receiving applications.'
                  : 'No campaigns in this state right now.'}
              </Text>
            </View>
          ) : (
            <View style={styles.content}>
              {visible.map(campaign => {
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
                return (
                  // The whole card opens the campaign, so the title row no
                  // longer needs its own "more" affordance.
                  <TouchableOpacity
                    key={campaign.id}
                    style={styles.card}
                    onPress={() => onNavigate(`/campaigns/${campaign.id}`)}
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
                        <Text style={styles.cardSub} numberOfLines={1}>
                          {count} {count === 1 ? 'creator' : 'creators'}
                        </Text>
                      </View>

                      <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                        <Text style={[styles.chipText, { color: chip.fg }]}>
                          {chip.label}
                        </Text>
                      </View>
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
                        <Text style={styles.detailBtnText}>View Details</Text>
                        <Icon name="arrow" color="#3D4FD8" size={13} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
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
  page: { paddingBottom: scale(96) + NAV_CLEARANCE },
  // Header and filters travel together as one sticky block, so the tabs stay
  // reachable while a long campaign list scrolls under them.
  stickyTop: { backgroundColor: '#F7F8FC' },

  tabsBar: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: scale(18), gap: scale(9), paddingTop: scale(16), paddingBottom: scale(14) },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    height: scale(38),
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
  cardSub: { marginTop: scale(2), fontSize: fontScale(11.5), color: '#8A8FA8' },
  chip: { paddingHorizontal: scale(8), paddingVertical: scale(4), borderRadius: scale(7) },
  chipText: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Format line, on its own row under the title.
  metaRow: {
    marginTop: scale(18),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  metaText: { flex: 1, fontSize: fontScale(11.5), color: '#5A5F7D' },
  metaDate: {
    fontSize: fontScale(11),
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
    fontSize: fontScale(12),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandCampaigns;
