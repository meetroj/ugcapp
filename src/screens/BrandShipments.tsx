/**
 * Manage Shipment — the native replacement for the web
 * /dashboard/business/shipments page. There is no brand-wide shipments
 * endpoint, so this derives the list from the brand's campaigns that have a
 * selected creator and reads each one's shipment from
 * GET /api/shipment/{campaign_id}. Read-only: creating a shipment request
 * needs pickup addresses and product dimensions, so that stays on the web.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getCampaigns, getShipment } from '../api';
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
  title: string;
  budget: number;
  creators: number;
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

const rupees = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/** Maps a shipment doc onto the chip shown on the row. */
function statusOf(shipment: Record<string, any> | null): {
  key: string;
  label: string;
  bg: string;
  fg: string;
} {
  const raw = String(shipment?.status || '').toLowerCase();
  if (!shipment) {
    return {
      key: 'none',
      label: 'Not requested',
      bg: '#F1F2F8',
      fg: '#6E7391',
    };
  }
  if (raw === 'delivered' || shipment.received_at) {
    return {
      key: 'delivered',
      label: 'Delivered',
      bg: '#E2F7EE',
      fg: '#0F7B43',
    };
  }
  if (raw === 'shipped' || shipment.tracking_number) {
    return {
      key: 'transit',
      label: 'In transit',
      bg: '#E4F0FF',
      fg: '#1F62B8',
    };
  }
  return {
    key: 'awaiting',
    label: shipment.awaiting_creator_address
      ? 'Awaiting address'
      : 'Awaiting label',
    bg: '#FFF3DF',
    fg: '#B4741B',
  };
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

  const load = useCallback(async () => {
    try {
      const list = await getCampaigns(token);

      // Only campaigns with a creator on board can have a physical shipment.
      const shippable = list.filter(
        campaign =>
          campaign.selected_creator ||
          (Array.isArray(campaign.selected_creators) &&
            campaign.selected_creators.length > 0),
      );

      // The shipment lives on its own endpoint, one call per campaign. A 404
      // simply means nothing has been requested yet.
      const built = await Promise.all(
        shippable.map(async campaign => {
          const campaignId = String(campaign.id ?? '');
          let shipment: Record<string, any> | null = null;
          try {
            shipment = await getShipment(token, campaignId);
          } catch {
            shipment = null;
          }
          return {
            campaignId,
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (tab !== 'all' && statusOf(row.shipment).key !== tab) return false;
      if (!needle) return true;
      return row.title.toLowerCase().includes(needle);
    });
  }, [query, rows, tab]);

  const countFor = useCallback(
    (key: string) =>
      key === 'all'
        ? rows.length
        : rows.filter(row => statusOf(row.shipment).key === key).length,
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
            {!visible.length ? (
              <View style={styles.empty}>
                <Icon name="box" color="#C3C6D6" size={34} />
                <Text style={styles.emptyTitle}>No shipments</Text>
                <Text style={styles.emptyText}>
                  {tab === 'all'
                    ? 'Campaigns with a selected creator and a physical product appear here.'
                    : 'Nothing in this state right now.'}
                </Text>
              </View>
            ) : (
              visible.map(row => {
                const chip = statusOf(row.shipment);
                const tracking = text(row.shipment?.tracking_number);
                const courier = text(row.shipment?.courier_name);
                return (
                  <TouchableOpacity
                    key={row.campaignId}
                    style={styles.card}
                    onPress={() => onNavigate(`/shipment/${row.campaignId}`)}
                    accessibilityRole="button"
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
                        </Text>
                        <Icon name="chevron" color="#B9BCCC" size={14} />
                      </View>
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
