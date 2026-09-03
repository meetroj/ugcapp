/**
 * Creator Bids — the native replacement for the web
 * /dashboard/business/pending-bids page. Campaigns are the outer group and
 * each bid is a row underneath, matching the reference design. Read-only:
 * Accept / Decline / Profile all hand off to the existing web flow, because
 * accepting a bid moves money into escrow.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import { declineBid, getCampaigns, selectCreator } from '../api';
import AppHeader from '../components/AppHeader';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
};

type Campaign = Record<string, any> & { id: string };
type Bid = Record<string, any>;

/** Tabs mirror the bid lifecycle the backend stores on each bid. */
const TABS = [
  { key: 'all', label: 'All', statuses: null as string[] | null },
  {
    key: 'responded',
    label: 'Responded',
    statuses: ['pending', 'submitted', 'responded'],
  },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted', 'selected'] },
  { key: 'declined', label: 'Declined', statuses: ['declined', 'rejected'] },
];

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const rupees = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

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
      {/* Group header disclosure — points down when the group is open. */}
      {name === 'caret' && <Path d="m7 10 5 5 5-5" {...line} />}
      {name === 'chevron' && <Path d="m9.5 5 6 7-6 7" {...line} />}
      {/* Filled, since it sits inside the rating pill. */}
      {name === 'star' && (
        <Path
          d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"
          fill={color}
        />
      )}
    </Svg>
  );
}

function BrandBids({
  token,
  onBack,
  onNavigate,
  onNotifications,
  onMessages,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Campaign ids the user collapsed. Everything starts expanded, as in the design.
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await getCampaigns(token);
      // Only campaigns that actually received applications are worth a group.
      setCampaigns(
        list
          .map((campaign, index) => ({
            ...campaign,
            id: String(campaign.id ?? index),
          }))
          .filter(
            campaign =>
              Array.isArray(campaign.bids) && campaign.bids.length > 0,
          ) as Campaign[],
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
   * Accepting hires the creator and moves money into escrow, and declining is
   * visible to them — both are one-way, so each is confirmed first. `acting`
   * holds the bid id mid-request so its buttons can be disabled.
   */
  const [acting, setActing] = useState<string | null>(null);

  const runAction = useCallback(
    async (action: () => Promise<void>, failure: string) => {
      try {
        await action();
        // Re-read from the server so the row shows the persisted status.
        await load();
      } catch (error) {
        // The helpers throw carrying the backend's own `detail` (already
        // hired, view-only team role, …), which is more useful than `failure`.
        Alert.alert(
          'Could not complete',
          text(error instanceof Error ? error.message : '', failure),
        );
      } finally {
        setActing(null);
      }
    },
    [load],
  );

  const confirmAccept = useCallback(
    (campaign: Campaign, bid: Bid, who: string) => {
      const amount = rupees(bid.amount || bid.price);
      Alert.alert(
        `Accept ${who}?`,
        `${amount} will be moved into escrow and ${who} will be hired for this campaign. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: () => {
              const id = String(bid.id ?? bid.creator_id ?? '');
              setActing(id);
              runAction(
                () =>
                  selectCreator(
                    token,
                    campaign.id,
                    String(bid.creator_id ?? ''),
                  ),
                'The bid could not be accepted.',
              );
            },
          },
        ],
      );
    },
    [runAction, token],
  );

  const confirmDecline = useCallback(
    (campaign: Campaign, bid: Bid, who: string) => {
      Alert.alert(
        `Decline ${who}?`,
        `${who} will be told their application was not selected.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Decline',
            style: 'destructive',
            onPress: () => {
              const id = String(bid.id ?? bid.creator_id ?? '');
              setActing(id);
              // Keyed on creator_id: a bid is a plain sub-object on the
              // campaign and has no id of its own.
              runAction(
                () =>
                  declineBid(token, campaign.id, String(bid.creator_id ?? '')),
                'The bid could not be declined.',
              );
            },
          },
        ],
      );
    },
    [runAction, token],
  );

  const matchesTab = useCallback(
    (bid: Bid) => {
      const spec = TABS.find(item => item.key === tab);
      const statuses = spec?.statuses;
      if (!statuses) return true;
      // A bid with no status yet is still awaiting a response.
      const status = String(bid.status || 'pending').toLowerCase();
      return statuses.includes(status);
    },
    [tab],
  );

  const groups = useMemo(
    () =>
      campaigns
        .map(campaign => ({
          campaign,
          bids: (campaign.bids as Bid[]).filter(matchesTab),
        }))
        .filter(group => group.bids.length > 0),
    [campaigns, matchesTab],
  );

  const totalFor = useCallback(
    (key: string) => {
      const spec = TABS.find(item => item.key === key);
      const statuses = spec?.statuses;
      return campaigns.reduce((sum, campaign) => {
        const bids = (campaign.bids as Bid[]) || [];
        if (!statuses) return sum + bids.length;
        return (
          sum +
          bids.filter(bid =>
            statuses.includes(String(bid.status || 'pending').toLowerCase()),
          ).length
        );
      }, 0);
    },
    [campaigns],
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Creator Bids"
        onBack={onBack}
        onNotifications={onNotifications}
        onMessages={onMessages}
      />

      <View style={styles.sheet}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsBar}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map(item => {
            const active = tab === item.key;
            const count = totalFor(item.key);
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(item.key)}
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {item.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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
            {!groups.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No applications</Text>
                <Text style={styles.emptyText}>
                  {tab === 'all'
                    ? 'Creator applications appear here once your briefs go live.'
                    : 'Nothing in this state right now.'}
                </Text>
              </View>
            ) : (
              groups.map(({ campaign, bids }) => {
                const open = !collapsed.includes(campaign.id);
                return (
                  <View key={campaign.id} style={styles.group}>
                    <TouchableOpacity
                      style={styles.groupHead}
                      onPress={() =>
                        setCollapsed(prev =>
                          prev.includes(campaign.id)
                            ? prev.filter(id => id !== campaign.id)
                            : [...prev, campaign.id],
                        )
                      }
                      accessibilityRole="button"
                    >
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>
                          {text(campaign.title, 'C').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.groupCopy}>
                        <Text style={styles.groupTitle} numberOfLines={1}>
                          {text(campaign.title, 'Untitled campaign')}
                        </Text>
                        <Text style={styles.groupMeta}>
                          Budget:{' '}
                          {rupees(campaign.budget || campaign.budget_max)} ·{' '}
                          {bids.length}{' '}
                          {bids.length === 1 ? 'application' : 'applications'}
                        </Text>
                      </View>
                      <Icon name="caret" color="#9498B0" size={18} />
                    </TouchableOpacity>

                    {open &&
                      bids.map((bid, index) => {
                        const who = text(
                          bid.creator_name || bid.creator_nickname,
                          'Creator',
                        );
                        const rating = Number(bid.creator_rating) || 0;
                        const bidId = String(bid.id ?? bid.creator_id ?? index);
                        const status = String(
                          bid.status || 'pending',
                        ).toLowerCase();
                        // Accept/Decline only make sense while a bid is open.
                        const settled =
                          status === 'accepted' ||
                          status === 'selected' ||
                          status === 'declined' ||
                          status === 'rejected';
                        const busy = acting === bidId;
                        return (
                          <View key={bidId} style={styles.bidRow}>
                            <View style={styles.bidTop}>
                              <View style={styles.bidAvatar}>
                                <Text style={styles.bidAvatarText}>
                                  {who.charAt(0).toUpperCase()}
                                </Text>
                              </View>

                              <View style={styles.bidCopy}>
                                <View style={styles.bidNameRow}>
                                  <Text
                                    style={styles.bidName}
                                    numberOfLines={1}
                                  >
                                    {who}
                                  </Text>
                                  {!!bid.top_match && (
                                    <View style={styles.topMatch}>
                                      <Text style={styles.topMatchText}>
                                        TOP MATCH
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                {rating > 0 && (
                                  <View style={styles.ratingChip}>
                                    <Icon name="star" size={10} />
                                    <Text style={styles.ratingText}>
                                      {rating.toFixed(1)}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {/* Price and delivery read as labelled columns. */}
                              <View style={styles.statCol}>
                                <Text style={styles.statValue}>
                                  {rupees(bid.amount || bid.price)}
                                </Text>
                                <Text style={styles.statLabel}>
                                  Price / video
                                </Text>
                              </View>
                              {!!bid.delivery_days && (
                                <View style={styles.statCol}>
                                  <Text style={styles.statValue}>
                                    {bid.delivery_days} Days
                                  </Text>
                                  <Text style={styles.statLabel}>Delivery</Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.actions}>
                              <TouchableOpacity
                                style={styles.ghostBtn}
                                onPress={() =>
                                  onNavigate(`/creator/${bid.creator_id}`)
                                }
                                accessibilityRole="button"
                                accessibilityLabel={`View profile of ${who}`}
                              >
                                <Text style={styles.ghostBtnText}>Profile</Text>
                              </TouchableOpacity>

                              {settled ? (
                                // Not tappable — the outcome is final — but it
                                // carries the same pill shape as the buttons it
                                // replaces so the row doesn't look half-empty.
                                <View
                                  style={[
                                    styles.settledPill,
                                    (status === 'declined' ||
                                      status === 'rejected') &&
                                      styles.settledPillDeclined,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.settledText,
                                      (status === 'declined' ||
                                        status === 'rejected') &&
                                        styles.settledDeclined,
                                    ]}
                                  >
                                    {status === 'declined' ||
                                    status === 'rejected'
                                      ? 'Declined'
                                      : 'Accepted'}
                                  </Text>
                                </View>
                              ) : (
                                <>
                                  <TouchableOpacity
                                    style={[
                                      styles.acceptBtn,
                                      busy && styles.btnBusy,
                                    ]}
                                    disabled={busy}
                                    onPress={() =>
                                      confirmAccept(campaign, bid, who)
                                    }
                                    accessibilityRole="button"
                                    accessibilityLabel={`Accept bid from ${who}`}
                                  >
                                    <Text style={styles.acceptBtnText}>
                                      Accept
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.declineBtn}
                                    disabled={busy}
                                    onPress={() =>
                                      confirmDecline(campaign, bid, who)
                                    }
                                    accessibilityRole="button"
                                    accessibilityLabel={`Decline bid from ${who}`}
                                  >
                                    <Text style={styles.declineBtnText}>
                                      Decline
                                    </Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                        );
                      })}

                    {open && (
                      <TouchableOpacity
                        style={styles.groupFooter}
                        onPress={() => onNavigate(`/campaigns/${campaign.id}`)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.groupFooterText}>
                          View campaign
                        </Text>
                        <Icon name="chevron" color="#4C5BF3" size={14} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the rounded sheet below covers the rest,
  // matching the creator tabs.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },

  tabsBar: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: scale(16), gap: scale(8), paddingTop: scale(14), paddingBottom: scale(12) },
  tab: {
    height: scale(34),
    paddingHorizontal: scale(14),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  tabActive: { backgroundColor: '#15163F', borderColor: '#15163F' },
  tabText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#6E7391',
  },
  tabTextActive: { color: '#FFFFFF' },

  loading: { marginTop: scale(40) },
  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(30) + NAV_CLEARANCE },

  group: {
    marginBottom: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    overflow: 'hidden',
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(13),
    gap: scale(11),
  },
  groupBadge: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(10),
    backgroundColor: '#EEEFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBadgeText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  groupCopy: { flex: 1 },
  groupTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  groupMeta: { marginTop: scale(3), fontSize: fontScale(11), color: '#777B96' },

  bidRow: {
    paddingHorizontal: scale(13),
    paddingVertical: scale(11),
    borderTopWidth: 1,
    borderTopColor: '#F1F2F8',
  },
  bidTop: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  bidAvatar: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    backgroundColor: '#EEEFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidAvatarText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  bidCopy: { flex: 1, minWidth: 0 },
  bidNameRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  bidName: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
    flexShrink: 1,
  },
  topMatch: {
    paddingHorizontal: scale(6),
    paddingVertical: scale(2),
    borderRadius: scale(5),
    backgroundColor: '#E8F7EE',
  },
  topMatchText: {
    fontSize: fontScale(8),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#18A957',
    letterSpacing: 0.3,
  },
  ratingChip: {
    marginTop: scale(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
  },
  ratingText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8A8FA8',
  },

  // Price and delivery, each with its label underneath.
  statCol: { alignItems: 'center' },
  statValue: {
    fontSize: fontScale(12.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  statLabel: { marginTop: scale(2), fontSize: fontScale(9), color: '#9BA0B8' },

  // The buttons share the row's full width rather than bunching on the right,
  // which used to leave a dead gap on the left of every card.
  actions: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  ghostBtn: {
    flex: 1,
    height: scale(32),
    paddingHorizontal: scale(12),
    borderRadius: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E4F0',
  },
  ghostBtnText: {
    fontSize: fontScale(11.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  acceptBtn: {
    flex: 1,
    height: scale(32),
    paddingHorizontal: scale(16),
    borderRadius: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15163F',
  },
  acceptBtnText: {
    fontSize: fontScale(11.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnBusy: { opacity: 0.5 },
  declineBtn: {
    flex: 1,
    height: scale(32),
    paddingHorizontal: scale(8),
    borderRadius: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3D2D3',
  },
  declineBtnText: {
    fontSize: fontScale(11.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#E5484D',
  },
  // flex 2 because it stands in for both action buttons — that keeps Profile
  // the same one-third width whether a bid is settled or still open.
  settledPill: {
    flex: 2,
    height: scale(32),
    borderRadius: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF8F0',
    borderWidth: 1,
    borderColor: '#BFE7D0',
  },
  settledPillDeclined: {
    backgroundColor: '#F4F5F8',
    borderColor: '#E2E4F0',
  },
  settledText: {
    textAlign: 'center',
    fontSize: fontScale(11.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#18A957',
  },
  settledDeclined: { color: '#9BA0B8' },

  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
    paddingVertical: scale(11),
    borderTopWidth: 1,
    borderTopColor: '#F1F2F8',
    backgroundColor: '#FBFBFE',
  },
  groupFooterText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
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

export default BrandBids;
