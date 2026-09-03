/**
 * My Bids — native screen replacing the web /my-bids page inside the shell.
 * Reads GET /api/bids/my, which returns each campaign the creator has bid on
 * with the creator's own bid flattened onto it as `my_bid` / `bid_status`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { getMyBids, type MyBid } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  onMessages?: () => void;
  unread?: number;
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/** Colour for a bid status: accepted, rejected, or still pending. */
function statusTint(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s.includes('accept') || s.includes('select')) {
    return { bg: '#E2F7EE', fg: '#1FA971' };
  }
  if (s.includes('reject') || s.includes('declin')) {
    return { bg: '#FDE8E8', fg: '#C0392B' };
  }
  return { bg: '#FFF4DE', fg: '#B4790B' };
}

/** "23 Aug 2026" — matches the date format used elsewhere in the app. */
function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function MyBids({ token, onBack, onMessages, unread }: Props) {
  const [items, setItems] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await getMyBids(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your bids.');
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Bids"
        onBack={onBack}
        onChat={onMessages}
        unread={unread}
      />
      <View style={styles.sheet}>
        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={4} lines={2} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!error && !items.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No bids yet</Text>
                <Text style={styles.emptyBody}>
                  Bids you place from Browse Campaigns show up here with their
                  status.
                </Text>
              </View>
            ) : null}

            {items.map((item, index) => {
              const status = String(item.bid_status || 'pending');
              const tint = statusTint(status);
              const title =
                (item.title as string) ||
                ((item.campaign?.title as string) ?? 'Untitled campaign');
              const when = formatDate(item.submitted_at);
              return (
                <View
                  key={String(item.id) || `bid-${index}`}
                  style={styles.card}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.title} numberOfLines={2}>
                      {title}
                    </Text>
                    <View style={[styles.chip, { backgroundColor: tint.bg }]}>
                      <Text style={[styles.chipText, { color: tint.fg }]}>
                        {status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.meta}>
                    <View>
                      <Text style={styles.metaLabel}>Your bid</Text>
                      <Text style={styles.metaValue}>
                        {money(item.my_bid?.amount)}
                      </Text>
                    </View>
                    {when ? (
                      <View style={styles.metaRight}>
                        <Text style={styles.metaLabel}>Submitted</Text>
                        <Text style={styles.metaValue}>{when}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
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
  content: { padding: scale(14), paddingBottom: scale(28) },
  loading: { marginTop: scale(40) },
  error: {
    margin: scale(12),
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
    textAlign: 'center',
  },
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
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  chip: {
    marginLeft: scale(9),
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(9),
  },
  chipText: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    textTransform: 'capitalize',
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
  metaLabel: { fontSize: fontScale(9), color: '#A0A3B5' },
  metaValue: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
});

export default MyBids;
