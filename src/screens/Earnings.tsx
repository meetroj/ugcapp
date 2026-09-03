/**
 * Creator earnings screen. Replaces the WebView's /withdrawal route.
 *
 * There is no single creator-earnings endpoint on the backend, so the figures
 * are assembled client-side from three existing sources:
 *   - /api/auth/me            -> available balance (users.balance)
 *   - /api/deals/my           -> per-deal escrow: held (pending) vs released
 *   - /api/withdrawal/history -> withdrawal totals and the Withdrawals tab
 *
 * "Money In" rows are the released escrows; "Withdrawals" are the payout
 * requests. Both lists are sorted newest first and share one row component.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Path, Rect } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import {
  BACKEND_URL,
  getMe,
  getMyDeals,
  getWithdrawalHistory,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  session: AuthUser;
  /** Opens the site's withdrawal form in the WebView. */
  onRequestWithdrawal: () => void;
  /** Opens the Messages page from the header chat button. */
  onMessages?: () => void;
  /** Opens the notification feed from the header bell. */
  onNotifications?: () => void;
  /** Unread count for the header chat badge. */
  unread?: number;
};

type Deal = {
  deal_id?: string;
  current_state?: string;
  brand?: { name?: string; logo_url?: string };
  escrow?: {
    status?: 'held' | 'released' | 'on_hold';
    held_amount?: number;
    net_payable?: number;
    estimated_payout_at?: string;
  };
  campaign?: { title?: string; completed_at?: string; updated_at?: string };
};

type Withdrawal = {
  id?: string;
  amount?: number;
  status?: string;
  requested_at?: string;
  payment_method?: string;
};

/** One row in either transaction list, normalised from a deal or a withdrawal. */
type Entry = {
  key: string;
  title: string;
  subtitle: string;
  amount: number;
  /** Money in is credited (+), withdrawals are debited (-). */
  credit: boolean;
  status: string;
  /** ISO string kept for sorting; formatted only at render time. */
  timestamp: string;
  logo?: string | null;
};

const money = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

const toNumber = (value: unknown) => Number(value || 0) || 0;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) {
    return null;
  }
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "29 Aug 2026". Empty string when the date is missing or unparseable. */
const formatDate = (value: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** Newest first; entries without a usable date sink to the bottom. */
const byNewest = (a: Entry, b: Entry) => {
  const left = parseDate(a.timestamp)?.getTime() || 0;
  const right = parseDate(b.timestamp)?.getTime() || 0;
  return right - left;
};

const STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  completed: { bg: '#E7F7EE', fg: '#12854A' },
  released: { bg: '#E7F7EE', fg: '#12854A' },
  approved: { bg: '#E7F7EE', fg: '#12854A' },
  paid: { bg: '#E7F7EE', fg: '#12854A' },
  pending: { bg: '#FFF4E0', fg: '#A96A05' },
  processing: { bg: '#FFF4E0', fg: '#A96A05' },
  held: { bg: '#FFF4E0', fg: '#A96A05' },
  rejected: { bg: '#FDECEC', fg: '#C33A3A' },
  failed: { bg: '#FDECEC', fg: '#C33A3A' },
};

/** Statuses that mean the money actually left escrow and reached the creator. */
const SETTLED = ['approved', 'completed', 'paid'];

function WalletIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={6}
        width={18}
        height={13}
        rx={3}
        stroke="#FFFFFF"
        strokeWidth={1.7}
      />
      <Path
        d="M3 10h18M16.5 14.5h1.5"
        stroke="#FFFFFF"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function UploadIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17"
        stroke="#2C2FB4"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** One of the three small stat tiles under the balance card. */
function StatTile({
  tint,
  glyph,
  label,
  value,
  caption,
}: {
  tint: string;
  glyph: React.ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statGlyph, { backgroundColor: tint }]}>{glyph}</View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

function TransactionRow({ entry }: { entry: Entry }) {
  const tint = STATUS_TINT[entry.status.toLowerCase()] || {
    bg: '#EEF0F6',
    fg: '#5A6072',
  };
  const uri = photoUrl(entry.logo);
  const date = formatDate(entry.timestamp);

  return (
    <View style={styles.txRow}>
      <View style={styles.txLogo}>
        {uri ? (
          <Image source={{ uri }} style={styles.txLogoImage} />
        ) : (
          <Text style={styles.txLogoText}>
            {entry.title.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.txCopy}>
        <Text style={styles.txTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.txSubtitle} numberOfLines={1}>
          {entry.subtitle}
        </Text>
        {!!date && <Text style={styles.txDate}>{date}</Text>}
      </View>

      <View style={styles.txRight}>
        <Text style={[styles.txAmount, !entry.credit && styles.txAmountDebit]}>
          {entry.credit ? '+' : '-'}
          {money(entry.amount)}
        </Text>
        <View style={[styles.txBadge, { backgroundColor: tint.bg }]}>
          <Text style={[styles.txBadgeText, { color: tint.fg }]}>
            {entry.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Earnings({
  token,
  session,
  onRequestWithdrawal,
  onMessages,
  onNotifications,
  unread = 0,
}: Props) {
  const [profile, setProfile] = useState<AuthUser>(session);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Settled, not raced: a missing withdrawal history must still leave the
    // balance and the deal list on screen.
    const results = await Promise.allSettled([
      getMe(token),
      getMyDeals(token),
      getWithdrawalHistory(token),
    ]);

    if (results[0].status === 'fulfilled') {
      setProfile(results[0].value as AuthUser);
    }
    if (results[1].status === 'fulfilled') {
      setDeals(results[1].value as Deal[]);
    }
    if (results[2].status === 'fulfilled') {
      setWithdrawals(results[2].value as Withdrawal[]);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    load().finally(() => {
      if (active) {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  // Released escrows are money the creator has earned; held ones are still
  // locked against an in-flight deal.
  const released = useMemo(
    () => deals.filter(deal => deal.escrow?.status === 'released'),
    [deals],
  );

  const pendingRelease = useMemo(
    () =>
      deals
        .filter(deal => deal.escrow?.status === 'held')
        .reduce((sum, deal) => sum + toNumber(deal.escrow?.held_amount), 0),
    [deals],
  );

  const moneyIn = useMemo<Entry[]>(
    () =>
      released
        .map((deal, index) => ({
          key: deal.deal_id || `deal-${index}`,
          title: deal.campaign?.title || deal.brand?.name || 'Campaign',
          subtitle: deal.current_state || 'Payment released',
          amount: toNumber(
            deal.escrow?.net_payable ?? deal.escrow?.held_amount,
          ),
          credit: true,
          status: 'Completed',
          timestamp:
            deal.escrow?.estimated_payout_at ||
            deal.campaign?.completed_at ||
            deal.campaign?.updated_at ||
            '',
          logo: deal.brand?.logo_url,
        }))
        .sort(byNewest),
    [released],
  );

  const moneyOut = useMemo<Entry[]>(
    () =>
      withdrawals
        .map((item, index) => ({
          key: item.id || `wd-${index}`,
          title: 'Withdrawal',
          subtitle: item.payment_method
            ? String(item.payment_method).toUpperCase()
            : 'Payout request',
          amount: toNumber(item.amount),
          credit: false,
          status: item.status ? String(item.status) : 'pending',
          timestamp: item.requested_at || '',
          logo: null,
        }))
        .sort(byNewest),
    [withdrawals],
  );

  const allTime = useMemo(
    () => moneyIn.reduce((sum, entry) => sum + entry.amount, 0),
    [moneyIn],
  );

  // Only settled payouts count as withdrawn; pending ones are still in flight.
  const paidWithdrawals = useMemo(
    () =>
      withdrawals.filter(item =>
        SETTLED.includes(String(item.status || '').toLowerCase()),
      ),
    [withdrawals],
  );

  const totalWithdrawn = useMemo(
    () => paidWithdrawals.reduce((sum, item) => sum + toNumber(item.amount), 0),
    [paidWithdrawals],
  );

  // Calendar month to date, matching how the web dashboard reports it.
  const thisMonth = useMemo(() => {
    const now = new Date();
    const rows = moneyIn.filter(entry => {
      const date = parseDate(entry.timestamp);
      return (
        !!date &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
    return {
      total: rows.reduce((sum, entry) => sum + entry.amount, 0),
      count: rows.length,
    };
  }, [moneyIn]);

  const balance = toNumber(profile.balance);
  const entries = tab === 'in' ? moneyIn : moneyOut;

  return (
    <View style={styles.screen}>
      {/* Earnings is a bottom-nav destination, not a pushed screen, so it has
          no back arrow and no overflow menu — the app logo sits left and
          Notifications + Messages sit right. The page title lives at the top of
          the sheet below, matching the other tabs. */}
      <AppHeader
        title="Earnings"
        onNotifications={onNotifications}
        onMessages={onMessages}
        unreadMessages={unread}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <View style={styles.flex}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceValue}>{money(balance)}</Text>
              <Text style={styles.balanceHint}>Ready to withdraw</Text>
            </View>
            <View style={styles.walletBadge}>
              <WalletIcon />
            </View>
          </View>

          <View style={styles.balanceBottom}>
            <TouchableOpacity
              style={styles.withdrawButton}
              onPress={onRequestWithdrawal}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <UploadIcon />
              <Text style={styles.withdrawText}>Request Withdrawal</Text>
            </TouchableOpacity>

            <View style={styles.pendingBlock}>
              <Text style={styles.pendingLabel}>Pending Release</Text>
              <Text style={styles.pendingValue}>{money(pendingRelease)}</Text>
              <Text style={styles.pendingHint}>In escrow</Text>
            </View>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatTile
            tint="#EDEBFF"
            glyph={<Text style={styles.statRupee}>{'₹'}</Text>}
            label="Paid This Month"
            value={money(thisMonth.total)}
            caption={`${thisMonth.count} deal${
              thisMonth.count === 1 ? '' : 's'
            } paid`}
          />
          <StatTile
            tint="#E6F7EE"
            glyph={<Text style={styles.statTrend}>{'↗'}</Text>}
            label="All-Time Earnings"
            value={money(allTime)}
            caption="Lifetime"
          />
          <StatTile
            tint="#FFF2DF"
            glyph={<Text style={styles.statCal}>{'▤'}</Text>}
            label="Total Withdrawn"
            value={money(totalWithdrawn)}
            caption={`${paidWithdrawals.length} withdrawal${
              paidWithdrawals.length === 1 ? '' : 's'
            }`}
          />
        </View>

        <View style={styles.tabs}>
          {(['in', 'out'] as const).map(key => {
            const active = tab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(key)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key === 'in' ? 'Money In' : 'Withdrawals'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Recent Transactions</Text>
        </View>

        {loading ? (
          <SkeletonList count={5} avatar lines={0} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'in' ? 'No earnings yet' : 'No withdrawals yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {tab === 'in'
                ? 'Completed deals show up here once payment is released.'
                : 'Your payout requests will appear here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {entries.map(entry => (
              <TransactionRow key={entry.key} entry={entry} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingTop: scale(8),
    paddingBottom: scale(12),
  },
  appLogo: { width: scale(120), height: scale(21) },
  // Title now sits at the top of the sheet, like the other tabs, instead of
  // being centred in the header bar.
  headerBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: scale(18),
    height: scale(18),
    borderRadius: scale(9),
    paddingHorizontal: scale(4),
    backgroundColor: '#E23B3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  // The white card the whole page sits on, rounded at the top only.
  body: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { padding: scale(14), paddingBottom: scale(28) + NAV_CLEARANCE },
  flex: { flex: 1 },

  balanceCard: {
    borderRadius: scale(20),
    padding: scale(18),
    backgroundColor: '#171A5C',
    overflow: 'hidden',
  },
  balanceTop: { flexDirection: 'row', alignItems: 'flex-start' },
  balanceLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B9BEEA',
  },
  balanceValue: {
    marginTop: scale(8),
    fontSize: fontScale(34),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  balanceHint: { marginTop: scale(4), fontSize: fontScale(11), color: '#A7ADE0' },
  walletBadge: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  balanceBottom: {
    marginTop: scale(18),
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    height: scale(42),
    paddingHorizontal: scale(16),
    borderRadius: scale(10),
    backgroundColor: '#FFFFFF',
  },
  withdrawText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#2C2FB4',
  },
  pendingBlock: { alignItems: 'flex-end' },
  pendingLabel: { fontSize: fontScale(11), color: '#B9BEEA' },
  pendingValue: {
    marginTop: scale(4),
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pendingHint: { marginTop: scale(2), fontSize: fontScale(10), color: '#A7ADE0' },

  statRow: { marginTop: scale(14), flexDirection: 'row', gap: scale(10) },
  statTile: {
    flex: 1,
    padding: scale(11),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
  },
  statGlyph: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRupee: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#6658F5',
  },
  statTrend: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#12854A',
  },
  statCal: { fontSize: fontScale(13), color: '#C07A12' },
  statLabel: {
    marginTop: scale(9),
    fontSize: fontScale(10),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#7E829D',
  },
  statValue: {
    marginTop: scale(3),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  statCaption: { marginTop: scale(3), fontSize: fontScale(9), color: '#A0A3B5' },

  tabs: {
    marginTop: scale(16),
    padding: scale(4),
    flexDirection: 'row',
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E8F4',
  },
  tab: {
    flex: 1,
    height: scale(36),
    borderRadius: scale(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#EEF0FE' },
  tabText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#8B8FA6',
  },
  tabTextActive: {
    color: '#3D4FD8',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },

  listHeader: {
    marginTop: scale(18),
    marginBottom: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },

  loading: { marginTop: scale(40) },
  empty: {
    marginTop: scale(12),
    padding: scale(26),
    borderRadius: scale(16),
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
  },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  emptyBody: {
    marginTop: scale(6),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#8B8FA6',
    textAlign: 'center',
  },

  txList: {
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: scale(13),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF6',
  },
  txLogo: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  txLogoImage: { width: '100%', height: '100%' },
  txLogoText: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  txCopy: { flex: 1, marginLeft: scale(11) },
  txTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  txSubtitle: { marginTop: scale(2), fontSize: fontScale(11), color: '#8B8FA6' },
  txDate: { marginTop: scale(3), fontSize: fontScale(10), color: '#A0A3B5' },
  txRight: { alignItems: 'flex-end' },
  txAmount: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#12854A',
  },
  txAmountDebit: { color: '#11123D' },
  txBadge: {
    marginTop: scale(5),
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(6),
  },
  txBadgeText: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});

export default Earnings;
