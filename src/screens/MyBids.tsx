/**
 * My Bids — native screen replacing the web /my-bids page inside the shell.
 * Reads GET /api/bids/my, which returns each campaign the creator has bid on
 * as { campaign, my_bid, bid_status, submitted_at }. Like the website it lists
 * every bid (pending, won and rejected) under All / Shortlisted / Accepted /
 * Rejected tabs, opens a bid's detail on tap, and sends a won bid to its Deal
 * Room.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import BottomSheet from '../components/BottomSheet';
import { SkeletonList } from '../components/Skeleton';
import { getCampaign, getMyBids, type MyBid } from '../api';
import {
  BID_TABS,
  WON_STATUSES,
  bidStatusLabel,
  bidStatusOf,
  loadErrorText,
  stripBrandOnlyLines,
  type BidTabKey,
} from '../briefs';
import { CONTENT_MAX_WIDTH, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onMessages?: () => void;
  unread?: number;
  /** Deal Room (`/my-deals?campaign=<id>`) and the empty-state Browse button. */
  onNavigate?: (path: string) => void;
  /** Opens the chat with this user; without it Message Brand opens the inbox. */
  onOpenThread?: (userId: string, name: string) => void;
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/** Colour for a bid status: won, rejected, shortlisted or still pending. */
function statusTint(status: string): { bg: string; fg: string } {
  if (WON_STATUSES.includes(status)) return { bg: '#E2F7EE', fg: '#1FA971' };
  if (status === 'rejected' || status === 'declined') return { bg: '#FDE8E8', fg: '#C0392B' };
  if (status === 'shortlisted') return { bg: '#E6EEFF', fg: '#3A55C8' };
  return { bg: '#FFF4DE', fg: '#B4790B' };
}

/** "23 Aug 2026" — matches the date format used elsewhere in the app. */
function formatDate(value: unknown): string {
  if (!value) return 'Recent';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** The brand's company name, never the "@nickname" handle. */
const brandOf = (c: Record<string, any>) =>
  String(
    c.brand_name || c.business_name || c.company_name || c.business_nickname || c.brand_handle || '',
  )
    .replace(/^@+/, '')
    .trim() || 'Brand';

function MyBids({ token, onBack, onMessages, unread, onNavigate, onOpenThread }: Props) {
  const [items, setItems] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<BidTabKey>('all');
  const [selected, setSelected] = useState<MyBid | null>(null);
  // Full campaign fetched when a bid is opened; the row's own copy is the fallback.
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  // True once a load has succeeded: a failed 10 s background poll then keeps the list instead of flashing an error.
  const loaded = useRef(false);

  const load = useCallback(async (quiet = false) => {
    const current = ++requestId.current;
    const isCurrent = () => mounted.current && current === requestId.current;
    try {
      const fresh = await getMyBids(token);
      if (isCurrent()) {
        loaded.current = true;
        setError('');
        setItems(fresh);
      }
    } catch (e) {
      if (isCurrent() && !(quiet && loaded.current)) setError(loadErrorText(e, 'your bids'));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    mounted.current = true;
    load();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') load(true);
    }, 10000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') load(true);
    });
    return () => {
      mounted.current = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    BID_TABS.forEach(t => {
      out[t.key] = items.filter(item => t.match(bidStatusOf(item))).length;
    });
    return out;
  }, [items]);

  const activeTab = BID_TABS.find(t => t.key === tab) || BID_TABS[0];
  const rows = useMemo(
    () => items.filter(item => activeTab.match(bidStatusOf(item))),
    [items, activeTab],
  );

  const openBid = (item: MyBid) => {
    setSelected(item);
    setDetail(null);
    const id = String(item.campaign?.id || '');
    if (!id) return;
    setDetailLoading(true);
    Promise.resolve()
      .then(() => getCampaign(token, id))
      .then(full => setDetail(full as Record<string, any>))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const messageBrand = (c: Record<string, any>) => {
    const id = c.business_id || c.business?.id;
    setSelected(null);
    if (id && onOpenThread) onOpenThread(String(id), brandOf(c));
    else onMessages?.();
  };

  const dealRoom = (c: Record<string, any>) => {
    setSelected(null);
    onNavigate?.(`/my-deals?campaign=${encodeURIComponent(String(c.id || ''))}`);
  };

  const sel = selected;
  // The full campaign wins, but the row's own copy fills any field it leaves out.
  const selCampaign = { ...(sel?.campaign || {}), ...(detail || {}) } as Record<string, any>;
  const selBid = (sel?.my_bid || {}) as Record<string, any>;
  const selStatus = sel ? bidStatusOf(sel) : 'pending';
  const selTint = statusTint(selStatus);
  const budget =
    selCampaign.budget_min || selCampaign.budget_max
      ? `${money(selCampaign.budget_min || selCampaign.budget_max)}${
          selCampaign.budget_max && selCampaign.budget_max !== selCampaign.budget_min
            ? ` - ${money(selCampaign.budget_max)}`
            : ''
        }`
      : money(selBid.amount);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Bids"
        onBack={onBack}
        onChat={onMessages}
        unread={unread}
      />
      <View style={styles.sheet}>
        <View style={styles.column}>
        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={4} lines={2} />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabScroll}
              contentContainerStyle={styles.tabs}
            >
              {BID_TABS.map(t => {
                const on = t.key === tab;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tab, on && styles.tabOn]}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t.label} (${counts[t.key] || 0})`}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>
                      {t.label} ({counts[t.key] || 0})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.error}>{error}</Text>
                  <TouchableOpacity
                    style={styles.retry}
                    onPress={() => {
                      setLoading(true);
                      load();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!error && !rows.length ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No bids in “{activeTab.label}”</Text>
                  <Text style={styles.emptyBody}>
                    Browse open campaigns and submit a proposal to start winning brand deals.
                  </Text>
                  {onNavigate ? (
                    <TouchableOpacity
                      style={styles.cta}
                      onPress={() => onNavigate('/browse-briefs')}
                      accessibilityRole="button"
                      accessibilityLabel="Browse Campaigns"
                    >
                      <Text style={styles.ctaText}>Browse Campaigns</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {rows.map((item, index) => {
                const c = (item.campaign || item) as Record<string, any>;
                const status = bidStatusOf(item);
                const tint = statusTint(status);
                const brand = brandOf(c);
                const won = WON_STATUSES.includes(status);
                return (
                  <TouchableOpacity
                    key={String(item.my_bid?.id || c.id || `bid-${index}`)}
                    style={styles.card}
                    onPress={() => openBid(item)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.title || 'Campaign'}, ${bidStatusLabel(status)}`}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.title} numberOfLines={2}>
                        {c.title || 'Untitled campaign'}
                      </Text>
                      <View style={[styles.chip, { backgroundColor: tint.bg }]}>
                        <Text style={[styles.chipText, { color: tint.fg }]}>
                          {bidStatusLabel(status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.brand} numberOfLines={1}>
                      {brand}
                    </Text>

                    <View style={styles.meta}>
                      <View>
                        <Text style={styles.metaLabel}>Your bid</Text>
                        <Text style={styles.metaValue}>
                          {money(item.my_bid?.amount || c.budget_max || c.budget)}
                        </Text>
                      </View>
                      <View style={styles.metaRight}>
                        <Text style={styles.metaLabel}>Submitted</Text>
                        <Text style={styles.metaValue}>
                          {formatDate(item.submitted_at || item.my_bid?.submitted_at)}
                        </Text>
                      </View>
                    </View>

                    {won && onNavigate ? (
                      <TouchableOpacity
                        style={styles.dealRoom}
                        onPress={() => dealRoom(c)}
                        accessibilityRole="button"
                        accessibilityLabel="Deal Room"
                      >
                        <Text style={styles.dealRoomText}>Deal Room →</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
        </View>
      </View>

      <BottomSheet
        visible={!!sel}
        title={String(selCampaign.title || 'Campaign')}
        onClose={() => setSelected(null)}
        footer={
          <>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              onPress={() => setSelected(null)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetBtnGhostText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnPrimary]}
              onPress={() => messageBrand(selCampaign)}
              accessibilityRole="button"
              accessibilityLabel="Message Brand"
            >
              <Text style={styles.sheetBtnPrimaryText}>Message Brand</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={styles.sheetBrand}>{brandOf(selCampaign)}</Text>
        <View style={styles.sheetMeta}>
          <View style={[styles.chip, { backgroundColor: selTint.bg }]}>
            <Text style={[styles.chipText, { color: selTint.fg }]}>{bidStatusLabel(selStatus)}</Text>
          </View>
          {!!selCampaign.category && (
            <View style={[styles.chip, { backgroundColor: '#E6EEFF' }]}>
              <Text style={[styles.chipText, { color: '#3A55C8' }]}>{String(selCampaign.category)}</Text>
            </View>
          )}
        </View>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={styles.metaLabel}>Brief Budget</Text>
            <Text style={styles.statValue}>{budget}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.metaLabel}>Your Bid</Text>
            <Text style={styles.statValue}>{money(selBid.amount)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.metaLabel}>Delivery</Text>
            <Text style={styles.statValue}>
              {selBid.estimated_delivery_days ? `${selBid.estimated_delivery_days} days` : '-'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.metaLabel}>Submitted</Text>
            <Text style={styles.statValue}>
              {formatDate(sel?.submitted_at || selBid.submitted_at)}
            </Text>
          </View>
        </View>

        <Text style={styles.sheetHead}>BRIEF</Text>
        {detailLoading && !detail ? (
          <Text style={styles.sheetText}>Loading brief…</Text>
        ) : (
          <Text style={styles.sheetText}>
            {stripBrandOnlyLines(String(selCampaign.brief_text || selCampaign.deliverables || '')) ||
              'No brief details provided.'}
          </Text>
        )}

        {Array.isArray(selCampaign.objectives) && selCampaign.objectives.length > 0 && (
          <>
            <Text style={styles.sheetHead}>OBJECTIVES</Text>
            <View style={styles.objectives}>
              {selCampaign.objectives.map((o: string, i: number) => (
                <Text key={`${o}-${i}`} style={styles.objective}>
                  {o}
                </Text>
              ))}
            </View>
          </>
        )}

        {!!selBid.proposal && (
          <>
            <Text style={styles.sheetHead}>YOUR PROPOSAL</Text>
            <Text style={styles.sheetText}>{String(selBid.proposal)}</Text>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    overflow: 'hidden',
  },
  // Tablet: a centred, readable column (no-op on phones).
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  tabScroll: { flexGrow: 0 },
  tabs: { paddingHorizontal: scale(14), paddingTop: scale(12), gap: scale(8) },
  tab: {
    minHeight: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E1E2ED',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { borderColor: '#4943EB', backgroundColor: '#EEEEFF' },
  tabText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4A4F72' },
  tabTextOn: { color: '#4943EB' },
  content: { padding: scale(14), paddingBottom: scale(28) },
  errorBox: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  error: { flex: 1, minWidth: 0, fontSize: fontScale(13), fontFamily: 'Inter-SemiBold', fontWeight: '600', color: '#B03030' },
  retry: { minHeight: scale(44), minWidth: scale(60), alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#B03030' },
  empty: { marginTop: scale(50), paddingHorizontal: scale(28), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: scale(8),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7E829D',
    textAlign: 'center',
  },
  cta: {
    marginTop: scale(16),
    minHeight: scale(46),
    paddingHorizontal: scale(22),
    borderRadius: scale(13),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: fontScale(13), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#FFFFFF' },
  card: {
    padding: scale(14),
    marginBottom: scale(11),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  brand: { marginTop: scale(4), fontSize: fontScale(13), color: '#7E829D' },
  chip: {
    flexShrink: 0,
    marginLeft: scale(9),
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(9),
  },
  chipText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  meta: {
    marginTop: scale(13),
    paddingTop: scale(11),
    borderTopWidth: 1,
    borderTopColor: '#F0F0F7',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaRight: { alignItems: 'flex-end' },
  metaLabel: { fontSize: fontScale(11), color: '#8A8EA6' },
  metaValue: {
    marginTop: scale(3),
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  dealRoom: {
    marginTop: scale(12),
    minHeight: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#12124F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealRoomText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#FFFFFF' },
  sheetBtn: { flex: 1, minHeight: scale(48), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  sheetBtnGhost: { borderWidth: 1, borderColor: '#DFE1EC', backgroundColor: '#FFF' },
  sheetBtnGhostText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#17193F' },
  sheetBtnPrimary: { backgroundColor: '#4842E8' },
  sheetBtnPrimaryText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#FFF' },
  sheetBrand: { fontSize: fontScale(13), color: '#8A8FB5' },
  sheetMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginTop: scale(10), marginLeft: scale(-9) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(14) },
  stat: {
    width: '47%',
    flexGrow: 1,
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#F6F7FC',
    borderWidth: 1,
    borderColor: '#E9EBF4',
  },
  statValue: { marginTop: scale(3), fontSize: fontScale(14), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  sheetHead: {
    marginTop: scale(18),
    marginBottom: scale(6),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#5854EF',
    letterSpacing: 0.4,
  },
  sheetText: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#585C7E' },
  objectives: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(7) },
  objective: {
    paddingHorizontal: scale(11),
    paddingVertical: scale(5),
    borderRadius: scale(14),
    overflow: 'hidden',
    backgroundColor: '#F1F3FA',
    fontSize: fontScale(13),
    color: '#585C7E',
  },
});

export default MyBids;
