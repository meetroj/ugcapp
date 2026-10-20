import { useLiveEffect } from "../liveUpdates";
/**
 * Manage Shipment — the native replacement for the web
 * /dashboard/business/shipments page. There is no brand-wide shipments
 * endpoint, so this derives the list from the brand's campaigns that have a
 * selected creator and reads each one's shipment from
 * GET /api/shipment/{campaign_id}. Like the website, it lists the campaigns
 * that need a shipment (requires_shipment); starting one happens on the
 * detail screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import AppHeader from '../components/AppHeader';
import { SkeletonList } from '../components/Skeleton';
import { ApiError, NetworkError, getCampaigns, getShipment } from '../api';
import { isMockShipment, needsShipment, shipmentStatus } from '../shipmentStatus';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
};

type Row = {
  campaignId: string;
  /** One row per hired creator: each gets their own shipment. */
  creatorId?: string;
  creatorName?: string;
  title: string;
  budget: number;
  creators: number;
  /** False until a creator is selected: nothing to ship yet. */
  hasCreator: boolean;
  /** null while loading or when the campaign has no shipment yet. */
  shipment: Record<string, any> | null;
};

/** Tabs mirror the shipment lifecycle. */
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
];

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

/** "29 Aug 2026" or ''. */
const shipDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const rupees = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/** Chip + action word per row, from the shared status mapping (see shipmentStatus.ts). */
const statusOf = (row: Row) => shipmentStatus(row.shipment, row.hasCreator);
const actionOf = (row: Row) => {
  const key = statusOf(row).key;
  return key === 'nocreator'
    ? 'Select'
    : key === 'delivered'
    ? 'View'
    : key === 'transit' || key === 'pickup'
    ? 'Track'
    : 'Ship';
};

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
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="6.5" {...line} />
          <Path d="m16 16 4 4" {...line} />
        </>
      )}
      {name === 'box' && (
        <>
          <Path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z" {...line} />
          <Path d="M4 7.5 12 11.5l8-4M12 11.5v9" {...line} />
        </>
      )}
      {name === 'chevron' && <Path d="m9.5 5 6 7-6 7" {...line} />}
      {name === 'truck' && (
        <>
          <Rect x={2.5} y={7} width={11} height={9} rx={1.8} {...line} />
          <Path d="M13.5 10.5H17l3 3v2.5h-6.5z" {...line} />
          <Circle cx="7" cy="18" r="1.8" {...line} />
          <Circle cx="16.5" cy="18" r="1.8" {...line} />
        </>
      )}
    </Svg>
  );
}

function BrandShipments({
  token,
  onBack,
  onNavigate,
  onNotifications,
  onMessages,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A failed load must not read as "No shipments".
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await getCampaigns(token);

      // Same set as the website: briefs that need a physical shipment. Ones
      // with no creator yet stay listed as "Awaiting creator".
      const shippable = list.filter(needsShipment);

      // One shipment per hired creator, each on its own endpoint call. A 404
      // simply means nothing has been requested yet. Single-creator briefs keep
      // the plain (creator-less) call, exactly as before.
      const pairs = shippable.flatMap(campaign => {
        const hired = Array.isArray(campaign.selected_creators)
          ? campaign.selected_creators.map(String)
          : [];
        const hasCreator = hired.length > 0 || !!campaign.selected_creator;
        return hired.length > 1
          ? hired.map((id: string) => ({ campaign, creatorId: id, hasCreator }))
          : [{ campaign, creatorId: undefined as string | undefined, hasCreator }];
      });
      const built = await Promise.all(
        pairs.map(async ({ campaign, creatorId, hasCreator }) => {
          const campaignId = String(campaign.id ?? '');
          let shipment: Record<string, any> | null = null;
          if (hasCreator) {
            try {
              shipment = await getShipment(token, campaignId, creatorId);
            } catch (error) {
              // 404 = nothing requested yet. Anything else is a real failure
              // (offline, server error): surface it instead of "Ready to ship".
              if (!(error instanceof ApiError && error.status === 404)) throw error;
            }
          }
          const bids: Record<string, any>[] = Array.isArray(campaign.bids)
            ? (campaign.bids as Record<string, any>[])
            : [];
          const bid = creatorId
            ? bids.find(b => String(b?.creator_id) === creatorId)
            : undefined;
          return {
            campaignId,
            creatorId,
            creatorName: bid
              ? text(bid.creator_name || bid.creator_nickname, 'Creator')
              : undefined,
            hasCreator,
            title: text(campaign.title, 'Untitled campaign'),
            budget: Number(campaign.budget || campaign.budget_max) || 0,
            creators: Array.isArray(campaign.selected_creators)
              ? campaign.selected_creators.length
              : campaign.selected_creator
              ? 1
              : 0,
            shipment,
          } as Row;
        }),
      );
      setRows(built);
      setLoadError('');
    } catch (error) {
      // Keep whatever is on screen and say the refresh failed.
      setLoadError(
        error instanceof NetworkError
          ? "You're offline. Check your connection and try again."
          : error instanceof Error && error.message
          ? error.message
          : 'Could not load shipments. Please try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useLiveEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (tab !== 'all' && statusOf(row).key !== tab) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        (row.creatorName || '').toLowerCase().includes(needle)
      );
    });
  }, [query, rows, tab]);

  const countFor = useCallback(
    (key: string) =>
      key === 'all'
        ? rows.length
        : rows.filter(row => statusOf(row).key === key).length,
    [rows],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <AppHeader
          title="Manage Shipment"
          onBack={onBack}
          onNotifications={onNotifications}
          onMessages={onMessages}
        />
      </View>

      <View style={styles.sheet}>
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
                hitSlop={{ top: 5, bottom: 5, left: 2, right: 2 }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {item.label} ({countFor(item.key)})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchWrap}>
          <Icon name="search" color="#9498B0" size={17} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search campaigns"
            placeholderTextColor="#A9ADC2"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={5} lines={2} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
            {!!loadError && (
              <View style={styles.errorBox} testID="shipments-error">
                <Text style={styles.errorText}>
                  {loadError}
                  {rows.length ? ' Showing the last list we loaded.' : ''}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setLoading(true);
                    load();
                  }}
                  accessibilityRole="button"
                  testID="shipments-retry"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {!visible.length && !loadError ? (
              <View style={styles.empty}>
                <Icon name="box" color="#C3C6D6" size={34} />
                <Text style={styles.emptyTitle}>No shipments</Text>
                <Text style={styles.emptyText}>
                  {tab === 'all'
                    ? 'Campaigns that need a physical product shipped appear here.'
                    : 'Nothing in this state right now.'}
                </Text>
              </View>
            ) : (
              visible.map(row => {
                const chip = statusOf(row);
                const tracking = text(row.shipment?.tracking_number);
                const courier = text(row.shipment?.courier_name);
                const eta = shipDate(row.shipment?.expected_delivery);
                const mock = isMockShipment(row.shipment);
                return (
                  <TouchableOpacity
                    key={`${row.campaignId}~${row.creatorId ?? ''}`}
                    style={styles.card}
                    onPress={() =>
                      onNavigate(
                        !row.hasCreator
                          ? `/campaigns/${row.campaignId}`
                          : row.creatorId
                          ? `/shipment/${row.campaignId}?creator=${encodeURIComponent(row.creatorId)}`
                          : `/shipment/${row.campaignId}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}, ${chip.label}, ${actionOf(row)}`}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {row.title.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {row.title}
                          {row.creatorName ? ` · ${row.creatorName}` : ''}
                        </Text>
                        <Text style={styles.cardMeta}>
                          Budget: {rupees(row.budget)} · {row.creators}{' '}
                          {row.creators === 1 ? 'creator' : 'creators'}
                        </Text>
                      </View>
                      <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                        <Text style={[styles.chipText, { color: chip.fg }]}>
                          {chip.label}
                        </Text>
                      </View>
                    </View>

                    {!!tracking && (
                      <View style={styles.trackRow}>
                        <Icon name="truck" color="#5C6180" size={15} />
                        <Text style={styles.trackText} numberOfLines={1}>
                          {courier ? `${courier} · ` : ''}
                          {tracking}
                          {eta ? ` · Est. ${eta}` : ''}
                        </Text>
                        <Text style={styles.actionText}>{actionOf(row)}</Text>
                        <Icon name="chevron" color="#B9BCCC" size={14} />
                      </View>
                    )}
                    {!tracking && (
                      <View style={styles.trackRow}>
                        <Text style={styles.trackText} numberOfLines={1}>
                          {eta
                            ? `Est. delivery ${eta}`
                            : row.hasCreator
                            ? 'No tracking yet'
                            : 'Select a creator to start shipping'}
                        </Text>
                        <Text style={styles.actionText}>{actionOf(row)}</Text>
                        <Icon name="chevron" color="#B9BCCC" size={14} />
                      </View>
                    )}
                    {mock && (
                      <Text style={styles.mockText} testID="mock-shipment">
                        Test label: this tracking number is not from a real courier.
                      </Text>
                    )}
                  </TouchableOpacity>
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
  // Wrapper for the shared AppHeader; transparent so the navy backdrop shows
  // through, matching the other brand tabs.
  topBar: { backgroundColor: 'transparent' },

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

  searchWrap: {
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    height: scale(42),
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    gap: scale(8),
  },
  search: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#15163F',
    paddingVertical: 0,
  },

  loading: { marginTop: scale(40) },
  // NAV_CLEARANCE keeps the last card clear of the floating nav pill, which is
  // absolutely positioned and would otherwise cover it.
  content: { paddingHorizontal: scale(16), paddingBottom: scale(30) + NAV_CLEARANCE },

  card: {
    marginBottom: scale(10),
    padding: scale(13),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: scale(11) },
  badge: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(10),
    backgroundColor: '#EEEFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  cardCopy: { flex: 1 },
  cardTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  cardMeta: { marginTop: scale(3), fontSize: fontScale(11), color: '#777B96' },
  chip: { paddingHorizontal: scale(9), paddingVertical: scale(5), borderRadius: scale(8) },
  chipText: { fontSize: fontScale(10), fontFamily: 'Inter-ExtraBold', fontWeight: '800' },

  trackRow: {
    marginTop: scale(11),
    paddingTop: scale(11),
    borderTopWidth: 1,
    borderTopColor: '#F1F2F8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  trackText: {
    flex: 1,
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#5C6180',
  },

  actionText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  mockText: { marginTop: scale(8), fontSize: fontScale(11), color: '#B4741B' },
  errorBox: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FEF3C7',
    gap: scale(8),
  },
  errorText: { fontSize: fontScale(12), color: '#92400E' },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: scale(44),
    paddingHorizontal: scale(18),
    borderRadius: scale(10),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  empty: { marginTop: scale(40), padding: scale(22), alignItems: 'center', gap: scale(4) },
  emptyTitle: {
    marginTop: scale(8),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: { fontSize: fontScale(12), color: '#858AA3', textAlign: 'center' },
});

export default BrandShipments;
