/**
 * My Deals — native screen replacing the web /my-deals page inside the shell.
 * Lists the signed-in creator's deals from GET /api/deals/my, which the backend
 * already serializes for the viewer's side (see utils/dealStateMachine.js), so
 * `primary_next_action` and the countdown are ready to display as-is.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import DealDetails from './DealDetails';
import { SkeletonList } from '../components/Skeleton';
import { getMyDeals, type Deal } from '../api';
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
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/**
 * Colour for a deal state. The backend's state machine uses long labels like
 * "Paid - Complete", so match loosely rather than enumerating every state.
 */
function stateTint(state: string): { bg: string; fg: string } {
  const s = state.toLowerCase();
  if (s.includes('paid') || s.includes('complete')) {
    return { bg: '#E2F7EE', fg: '#1FA971' };
  }
  if (s.includes('dispute') || s.includes('cancel')) {
    return { bg: '#FDE8E8', fg: '#C0392B' };
  }
  if (s.includes('revision') || s.includes('await')) {
    return { bg: '#FFF4DE', fg: '#B4790B' };
  }
  return { bg: '#EEEFFF', fg: '#5B5CF6' };
}

/** "in 12h" / "in 3d" — how long until the current step is due. */
function countdown(hours: unknown): string {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 24) return `in ${Math.round(n)}h`;
  return `in ${Math.round(n / 24)}d`;
}

function MyDeals({ token, onBack, onMessages, onOpenThread, unread }: Props) {
  const [openDeal, setOpenDeal] = useState<Deal | null>(null);
  const [items, setItems] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await getMyDeals(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your deals.');
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
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Deals"
        onBack={onBack}
        onChat={onMessages}
        unread={unread}
      />
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!error && !items.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No deals yet</Text>
                <Text style={styles.emptyBody}>
                  Apply to a campaign from Browse Campaigns — accepted
                  applications turn into deals and show up here.
                </Text>
              </View>
            ) : null}

            {items.map((deal, index) => {
              const state = String(deal.current_state || '');
              const tint = stateTint(state);
              const title =
                (deal.campaign?.title as string) || 'Untitled campaign';
              const brand =
                ((deal.brand as Record<string, unknown>)?.name as string) || '';
              const amount = (deal.my_bid as Record<string, unknown>)?.amount;
              const due = countdown(deal.deadline_countdown_hours);
              return (
                <TouchableOpacity
                  key={deal.deal_id || `deal-${index}`}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => setOpenDeal(deal)}
                  accessibilityRole="button"
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.title} numberOfLines={2}>
                      {title}
                    </Text>
                    <View style={[styles.chip, { backgroundColor: tint.bg }]}>
                      <Text style={[styles.chipText, { color: tint.fg }]}>
                        {state}
                      </Text>
                    </View>
                  </View>

                  {brand ? (
                    <Text style={styles.brand} numberOfLines={1}>
                      {brand}
                    </Text>
                  ) : null}

                  <View style={styles.meta}>
                    <View>
                      <Text style={styles.metaLabel}>Your bid</Text>
                      <Text style={styles.metaValue}>{money(amount)}</Text>
                    </View>
                    {deal.primary_next_action ? (
                      <View style={styles.metaRight}>
                        <Text style={styles.metaLabel}>Next step</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {String(deal.primary_next_action)}
                          {due ? ` · ${due}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </View>
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
  chipText: { fontSize: fontScale(9), fontFamily: 'Inter-ExtraBold', fontWeight: '800' },
  brand: { marginTop: scale(5), fontSize: fontScale(11), color: '#7E829D' },
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
});

export default MyDeals;
