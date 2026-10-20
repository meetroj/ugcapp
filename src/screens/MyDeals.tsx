import { useLiveEffect } from "../liveUpdates";
/**
 * My Deals — native screen replacing the web /my-deals page inside the shell.
 * Lists the signed-in creator's deals from GET /api/deals/my, which the backend
 * (server.py) already serializes for the viewer's side, so `primary_next_action`
 * and the countdown are ready to display as-is.
 *
 * Like the website hub (MyDealsHubPage.js) it has three tabs: Active Deals,
 * Requested Deals (direct bookings waiting for the creator's answer) and
 * My Bids. Declined and cancelled deals are not listed under Active.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import DealDetails from './DealDetails';
import MyBids from './MyBids';
import { SkeletonList } from '../components/Skeleton';
import { BACKEND_URL, getMyDeals, type Deal } from '../api';
import {
  activeMeta,
  bookingStage,
  dealAmount,
  findDeal,
  HUB_TABS,
  parseHubTab,
  splitHub,
  type HubTab,
} from '../dealRoom';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  /** Header chat button; also used by the detail view. */
  onMessages?: () => void;
  /**
   * Opens the chat thread with a specific user, so the deal detail's Chat
   * button lands on the brand's conversation rather than the inbox.
   */
  onOpenThread?: (userId: string, name: string) => void;
  unread?: number;
  /**
   * Open straight into this deal's detail once the list loads. Set when the
   * user arrived from a notification or a website link that named a deal
   * ('/my-deals?campaign=<id>'), which used to drop them on the bare list.
   * Accepts the campaign id (campaign.id) or the DEAL-xxxx id.
   */
  focusDealId?: string;
  /**
   * Tab to start on, for '/my-deals?tab=requested' (booking-request
   * notifications): 'active' | 'requested' | 'bids'.
   */
  initialTab?: HubTab | string;
  /** Empty-state "Browse Campaigns" button; hidden when not provided. */
  onBrowse?: () => void;
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/** "in 12h" / "in 3d" — how long until the current step is due. */
function countdown(hours: unknown): string {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 24) return `in ${Math.round(n)}h`;
  return `in ${Math.round(n / 24)}d`;
}

// A raw Mongo ObjectId is never a real name; never show one as the brand.
const isObjectId = (value: string) => /^[0-9a-f]{24}$/i.test(value);

function brandName(deal: Deal): string {
  const raw = String(
    (deal.brand as Record<string, any>)?.name ||
      (deal.campaign as Record<string, any>)?.brand_name ||
      '',
  )
    .replace(/^@+/, '')
    .trim();
  return raw && !isObjectId(raw) ? raw : 'Brand';
}

function BrandAvatar({ deal }: { deal: Deal }) {
  const logo = String((deal.brand as Record<string, any>)?.logo_url || '');
  const uri = logo ? (/^https?:\/\//i.test(logo) ? logo : `${BACKEND_URL}${logo}`) : '';
  return (
    <View style={styles.avatar}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImg} />
      ) : (
        <Text style={styles.avatarText}>{brandName(deal).charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

function MyDeals({
  token,
  onBack,
  onMessages,
  onOpenThread,
  unread,
  focusDealId,
  initialTab,
  onBrowse,
}: Props) {
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);
  const [tab, setTab] = useState<HubTab>(parseHubTab(initialTab));
  // A deep link names the deal before the list exists, so the open is deferred
  // until the fetch lands. Cleared once used so closing the detail returns to
  // the list rather than immediately reopening it.
  const [pendingFocus, setPendingFocus] = useState(focusDealId);
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // The route can change tab while this screen stays mounted.
  useEffect(() => {
    if (initialTab) setTab(parseHubTab(initialTab));
  }, [initialTab]);

  // Returns the list it fetched so a caller can pick a deal straight out of
  // it; reading `items` after calling this would see the pre-fetch state.
  const load = useCallback(async (): Promise<Deal[]> => {
    try {
      setError('');
      const fresh = await getMyDeals(token);
      setItems(fresh);
      return fresh;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your deals.');
      return [];
    }
  }, [token]);

  useLiveEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // The link names the campaign uuid (campaign.id) or "DEAL-xxxx". The payload
  // has no top-level campaign_id, so findDeal matches every id a deal exposes.
  useEffect(() => {
    if (!pendingFocus || !items.length) return;
    const hit = findDeal(items, pendingFocus);
    setPendingFocus(undefined);
    if (hit) setOpenDeal(hit);
  }, [items, pendingFocus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  // Detail view replaces the list in place, matching ActiveWork — no navigator
  // is installed, and it keeps the /my-deals route unchanged.
  if (openDeal) {
    return (
      <DealDetails
        deal={openDeal}
        token={token}
        unread={unread}
        onBack={() => setOpenDeal(null)}
        onChat={() => {
          // Chat with the brand on this deal; the inbox is the fallback when
          // the payload carries no brand id.
          const brand = (openDeal.brand || {}) as Record<string, any>;
          if (brand.id && onOpenThread) {
            onOpenThread(String(brand.id), String(brand.name || 'Brand'));
          } else {
            onMessages?.();
          }
        }}
        // A deal action (receipt, revision reply, booking answer) changes the
        // deal on the server. Refetch and hand the detail view the fresh copy,
        // or it keeps rendering the state the action just moved past.
        onChanged={async () => {
          const fresh = await load();
          setOpenDeal(current => {
            if (!current) return current;
            const id = String(current.deal_id);
            return fresh.find(deal => String(deal.deal_id) === id) || current;
          });
        }}
        onArchived={() => setOpenDeal(null)}
      />
    );
  }

  // My Bids is its own screen; it replaces the hub in place, like a deal does.
  if (tab === 'bids') {
    return (
      <MyBids
        token={token}
        unread={unread}
        onBack={() => setTab('active')}
        onMessages={onMessages}
      />
    );
  }

  const { active, requested } = splitHub(items);
  const rows = tab === 'requested' ? requested : active;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Deals"
        onBack={onBack}
        onChat={onMessages}
        unread={unread}
      />
      <View style={styles.sheet}>
        <View style={styles.tabs}>
          {HUB_TABS.map(item => {
            const on = tab === item.key;
            const count =
              item.key === 'active' ? active.length : item.key === 'requested' ? requested.length : null;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.tab, on && styles.tabOn]}
                onPress={() => setTab(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={item.label}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                  {item.label}
                  {count !== null && !loading ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={4} lines={2} footer />
          </View>
        ) : (
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
                <TouchableOpacity style={styles.retry} onPress={retry} accessibilityRole="button" accessibilityLabel="Retry">
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!error && !rows.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {tab === 'requested' ? 'No requests right now' : 'No active deals yet'}
                </Text>
                <Text style={styles.emptyBody}>
                  {tab === 'requested'
                    ? 'When a brand books you directly or proposes a custom deal, the invite lands here to accept, decline, or counter.'
                    : 'Once you accept a booking or a brand picks your bid, your live deals show up here.'}
                </Text>
                {tab === 'active' && !!onBrowse && (
                  <TouchableOpacity style={styles.cta} onPress={onBrowse} accessibilityRole="button">
                    <Text style={styles.ctaText}>Browse Campaigns</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {rows.map((deal, index) => {
              const title =
                (deal.campaign?.title as string) || 'Untitled campaign';
              const brand = brandName(deal);
              const meta = activeMeta(deal);
              const stage = bookingStage(deal);
              const countered = stage === 'counter_sent';
              const due = countdown(deal.deadline_countdown_hours);
              const priv = !!(deal.campaign as Record<string, any>)?.direct_booking;
              const requestCard = tab === 'requested';
              const videos = Number((deal.campaign as Record<string, any>)?.video_count) || 1;
              return (
                <TouchableOpacity
                  key={deal.deal_id || `deal-${index}`}
                  style={[styles.card, { borderLeftColor: requestCard ? '#4452f0' : meta.color }]}
                  activeOpacity={0.85}
                  onPress={() => setOpenDeal(deal)}
                  accessibilityRole="button"
                >
                  <View style={styles.cardTop}>
                    <BrandAvatar deal={deal} />
                    <View style={styles.cardLead}>
                      <View style={styles.badges}>
                        {requestCard ? (
                          <View style={[styles.chip, countered ? styles.chipWarn : styles.chipInfo]}>
                            <Text style={[styles.chipText, countered ? styles.chipWarnText : styles.chipInfoText]} numberOfLines={1}>
                              {countered ? 'Counter sent - awaiting brand' : 'Awaiting your response'}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.chip, { backgroundColor: `${meta.color}22` }]}>
                            <Text style={[styles.chipText, { color: meta.color }]} numberOfLines={1}>
                              {meta.label}
                            </Text>
                          </View>
                        )}
                        {(priv || requestCard) && (
                          <View style={styles.privChip}>
                            <Text style={styles.privText}>
                              {requestCard ? (countered ? 'Custom price' : 'Private invite') : 'Private'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.title} numberOfLines={2}>
                        {title}
                      </Text>
                      <Text style={styles.brand} numberOfLines={1}>
                        {requestCard ? `${brand} · ${videos} video(s)` : brand}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.meta}>
                    <View>
                      <Text style={styles.metaLabel}>
                        {requestCard ? (countered ? 'You countered' : "You'll get") : 'Escrow'}
                      </Text>
                      <Text style={styles.metaValue}>
                        {money(
                          countered
                            ? (deal.campaign as Record<string, any>)?.proposed_amount
                            : dealAmount(deal),
                        )}
                      </Text>
                    </View>
                    {!requestCard && deal.primary_next_action ? (
                      <View style={styles.metaRight}>
                        <Text style={styles.metaLabel}>Next step</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {String(deal.primary_next_action)}
                          {due ? ` · ${due}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {requestCard && (
                    <View style={styles.review}>
                      <Text style={styles.reviewText}>
                        {countered ? 'View counter' : 'Accept · decline · counter'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
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
  tabs: {
    flexDirection: 'row',
    gap: scale(6),
    paddingHorizontal: scale(14),
    paddingTop: scale(12),
  },
  tab: {
    flex: 1,
    minHeight: scale(44),
    paddingHorizontal: scale(6),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E5E6F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: '#171A5C', borderColor: '#171A5C' },
  tabText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#626784',
  },
  tabTextOn: { color: '#FFFFFF' },
  content: { padding: scale(14), paddingBottom: scale(28) },
  loading: { marginTop: scale(40) },
  errorBox: { margin: scale(12), alignItems: 'center' },
  error: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
    textAlign: 'center',
  },
  retry: {
    marginTop: scale(10),
    minWidth: scale(110),
    minHeight: scale(44),
    paddingHorizontal: scale(18),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#3D4FD8' },
  empty: { marginTop: scale(60), paddingHorizontal: scale(28), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  emptyBody: {
    marginTop: scale(8),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
    textAlign: 'center',
  },
  cta: {
    marginTop: scale(16),
    minHeight: scale(46),
    paddingHorizontal: scale(22),
    borderRadius: scale(12),
    backgroundColor: '#171A5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#FFFFFF' },
  card: {
    padding: scale(14),
    marginBottom: scale(11),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    borderLeftWidth: scale(4),
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardLead: { flex: 1, marginLeft: scale(11) },
  avatar: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(12),
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: fontScale(18), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#4452F0' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginBottom: scale(6) },
  title: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  chip: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(9),
    maxWidth: '100%',
  },
  chipText: { fontSize: fontScale(10), fontFamily: 'Inter-ExtraBold', fontWeight: '800' },
  chipInfo: { backgroundColor: '#EEF0FF' },
  chipInfoText: { color: '#3730A3' },
  chipWarn: { backgroundColor: '#FFF7ED' },
  chipWarnText: { color: '#B45309' },
  privChip: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(9),
    backgroundColor: '#F1F3FA',
  },
  privText: { fontSize: fontScale(10), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#64748B' },
  brand: { marginTop: scale(3), fontSize: fontScale(11), color: '#7E829D' },
  meta: {
    marginTop: scale(13),
    paddingTop: scale(11),
    borderTopWidth: 1,
    borderTopColor: '#F0F0F7',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaRight: { flex: 1, marginLeft: scale(16), alignItems: 'flex-end' },
  metaLabel: { fontSize: fontScale(9), color: '#A0A3B5' },
  metaValue: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  review: {
    marginTop: scale(12),
    minHeight: scale(44),
    borderRadius: scale(10),
    backgroundColor: '#07074E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#FFFFFF' },
});

export default MyDeals;
