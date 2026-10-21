import { useLiveEffect } from "../liveUpdates";
/**
 * Creator earnings screen. Replaces the WebView's /withdrawal route.
 *
 * Same three sources as the website's Earnings page (PayoutWithLayout.js), so
 * the figures cannot disagree between the two:
 *   - /api/payout/overview    -> balance, pending release (net of fees),
 *                                paid this month, all-time earnings
 *   - /api/payouts/receipts   -> "Money In" rows with the fee / TDS / penalty
 *                                breakdown (type "earning")
 *   - /api/withdrawal/history -> the Withdrawals tab (searchable, filterable)
 *
 * Money In and Withdrawals are both sorted newest first.
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
import Svg, { Path, Rect } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import {
  getPayoutOverview,
  getPayoutReceipts,
  getWithdrawalHistory,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import { CONTENT_MAX_WIDTH, NAV_CLEARANCE, scale, fontScale } from '../theme';
import {
  MIN_WITHDRAWAL_AMOUNT,
  WITHDRAWAL_FILTERS,
  errorMessage,
  filterWithdrawals,
  inr as money,
  receiptBreakdown,
  withdrawalCode,
  withdrawalMethodLabel,
  withdrawalStatusLabel,
} from '../payoutRules';

type Props = {
  token: string;
  /** Kept for the caller; balances now come from /api/payout/overview. */
  session?: AuthUser;
  /** Opens the native withdrawal form. */
  onRequestWithdrawal: () => void;
  /** Opens the Messages page from the header chat button. */
  onMessages?: () => void;
  /** Opens the notification feed from the header bell. */
  onNotifications?: () => void;
  /** Opens Browse Campaigns; the empty Money In state offers it as the next step. */
  onBrowse?: () => void;
  /** Unread count for the header chat badge. */
  unread?: number;
};

type Overview = {
  balance?: number;
  pending_release?: number;
  paid_this_month?: number;
  all_time_earnings?: number;
  deals_paid?: number;
  deals_paid_this_month?: number;
};

type Receipt = Record<string, any> & { id?: string; type?: string };

type Withdrawal = {
  id?: string;
  amount?: number;
  status?: string;
  requested_at?: string;
  payment_method?: string;
};

/** One row in either transaction list, normalised from a receipt or a withdrawal. */
type Entry = {
  key: string;
  title: string;
  subtitle: string;
  amount: number;
  /** Money in is credited (+), withdrawals are debited (-). */
  credit: boolean;
  /** Label shown in the badge (Paid, Processing, Pending, Disputed). */
  status: string;
  /** ISO string kept for sorting; formatted only at render time. */
  timestamp: string;
  /** Tap-to-expand lines (fee, TDS, penalty) for Money In rows. */
  details?: Array<[string, string]>;
};

const toNumber = (value: unknown) => Number(value || 0) || 0;

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
  Paid: { bg: '#E7F7EE', fg: '#12854A' },
  Pending: { bg: '#FFF4E0', fg: '#A96A05' },
  Processing: { bg: '#E8F0FE', fg: '#2C5BC4' },
  Disputed: { bg: '#FDECEC', fg: '#C33A3A' },
};

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
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statCaption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

function TransactionRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const tint = STATUS_TINT[entry.status] || {
    bg: '#EEF0F6',
    fg: '#5A6072',
  };
  const date = formatDate(entry.timestamp);
  const expandable = !!entry.details;

  return (
    <View style={styles.txItem}>
      <TouchableOpacity
        style={styles.txRow}
        onPress={() => setOpen(value => !value)}
        disabled={!expandable}
        activeOpacity={0.8}
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={
          expandable ? `${entry.title}, ${entry.subtitle}. Show breakdown` : undefined
        }
      >
        <View style={styles.txLogo}>
          <Text style={styles.txLogoText}>
            {entry.title.charAt(0).toUpperCase()}
          </Text>
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
      </TouchableOpacity>

      {open && entry.details ? (
        <View style={styles.txDetails}>
          {entry.details.map(([label, value]) => (
            <View key={label} style={styles.txDetailRow}>
              <Text style={styles.txDetailLabel}>{label}</Text>
              <Text style={styles.txDetailValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Earnings({
  token,
  onRequestWithdrawal,
  onMessages,
  onNotifications,
  onBrowse,
  unread = 0,
}: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Set when any source failed, so a missing figure is never shown as 0.
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const load = useCallback(async () => {
    // Settled, not raced: one failing source must not blank the other two.
    const results = await Promise.allSettled([
      getPayoutOverview(token),
      getPayoutReceipts(token),
      getWithdrawalHistory(token),
    ]);

    if (results[0].status === 'fulfilled') {
      setOverview(results[0].value as Overview);
    }
    if (results[1].status === 'fulfilled') {
      // Receipts cover both directions; Money In only wants earnings.
      setReceipts(
        (results[1].value as Receipt[]).filter(r => r.type === 'earning'),
      );
    }
    if (results[2].status === 'fulfilled') {
      setWithdrawals(results[2].value as unknown as Withdrawal[]);
    }
    const failed = results.find(r => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    setLoadError(
      failed ? errorMessage(failed.reason, 'Could not load your earnings.') : '',
    );
  }, [token]);

  useLiveEffect(() => {
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

  const onRetry = useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const moneyIn = useMemo<Entry[]>(
    () =>
      receipts
        .map((r, index) => ({
          key: r.id || `receipt-${index}`,
          title: r.brand_name || 'Brand',
          subtitle: r.campaign_title || 'Campaign',
          amount: toNumber(r.net_amount),
          credit: true,
          status: 'Paid',
          timestamp: r.created_at || '',
          details: receiptBreakdown(r),
        }))
        .sort(byNewest),
    [receipts],
  );

  const visibleWithdrawals = useMemo(
    () => filterWithdrawals(withdrawals, statusFilter, search),
    [withdrawals, statusFilter, search],
  );

  const moneyOut = useMemo<Entry[]>(
    () =>
      visibleWithdrawals
        .map((item, index) => ({
          key: item.id || `wd-${index}`,
          title: `Withdrawal ${withdrawalCode(item.id)}`,
          subtitle: withdrawalMethodLabel(item.payment_method),
          amount: toNumber(item.amount),
          credit: false,
          status: withdrawalStatusLabel(item.status),
          timestamp: item.requested_at || '',
        }))
        .sort(byNewest),
    [visibleWithdrawals],
  );

  // Only settled payouts count as withdrawn; pending ones are still in flight.
  const paidWithdrawals = useMemo(
    () =>
      withdrawals.filter(
        item => withdrawalStatusLabel(item.status) === 'Paid',
      ),
    [withdrawals],
  );

  const totalWithdrawn = useMemo(
    () => paidWithdrawals.reduce((sum, item) => sum + toNumber(item.amount), 0),
    [paidWithdrawals],
  );

  const entries = tab === 'in' ? moneyIn : moneyOut;
  // No overview means the figures are unknown, which is not the same as 0.
  const fig = (value: unknown) => (overview ? money(value) : '-');
  const paidThisMonthDeals = toNumber(overview?.deals_paid_this_month);
  const filtering = tab === 'out' && (!!search.trim() || statusFilter !== 'All');

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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loadError && !loading ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={onRetry}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <View style={styles.flex}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text
                style={styles.balanceValue}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fig(overview?.balance)}
              </Text>
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
              <Text
                style={styles.pendingValue}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fig(overview?.pending_release)}
              </Text>
              <Text style={styles.pendingHint}>In escrow</Text>
            </View>
          </View>
        </View>

        <View style={styles.feeNote}>
          <Text style={styles.feeNoteText}>
            UGC.ad charges a <Text style={styles.feeNoteBold}>20% platform fee</Text>{' '}
            on every campaign/brief. Withdrawals start at{' '}
            {money(MIN_WITHDRAWAL_AMOUNT)}.
          </Text>
        </View>

        <View style={styles.statRow}>
          <StatTile
            tint="#EDEBFF"
            glyph={<Text style={styles.statRupee}>{'₹'}</Text>}
            label="Paid This Month"
            value={fig(overview?.paid_this_month)}
            caption={`${paidThisMonthDeals} deal${
              paidThisMonthDeals === 1 ? '' : 's'
            } paid`}
          />
          <StatTile
            tint="#E6F7EE"
            glyph={<Text style={styles.statTrend}>{'↗'}</Text>}
            label="All-Time Earnings"
            value={fig(overview?.all_time_earnings)}
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

        {tab === 'out' ? (
          <View style={styles.filters}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search withdrawal ID"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search withdrawal ID"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
              keyboardShouldPersistTaps="handled"
            >
              {WITHDRAWAL_FILTERS.map(option => {
                const on = statusFilter === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() => setStatusFilter(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={[styles.filterText, on && styles.filterTextOn]}
                    >
                      {option === 'All' ? 'All Status' : option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Recent Transactions</Text>
        </View>

        {loading ? (
          <SkeletonList count={5} avatar lines={0} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'in'
                ? 'No payments yet'
                : filtering
                ? 'No matching withdrawals'
                : 'No withdrawals yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {tab === 'in'
                ? "When a brand's payment for a completed deal is released, it shows up here with who paid and how much."
                : filtering
                ? 'Try a different ID or status.'
                : 'Money you move to your bank or UPI will appear here.'}
            </Text>
            {filtering ? (
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={() => {
                  setSearch('');
                  setStatusFilter('All');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
            {tab === 'in' && onBrowse ? (
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={onBrowse}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Browse campaigns</Text>
              </TouchableOpacity>
            ) : null}
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
  // Centred column on tablets; phones are narrower than the cap so nothing changes.
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(16),
    paddingBottom: scale(24) + NAV_CLEARANCE,
  },
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
  balanceHint: { marginTop: scale(4), fontSize: fontScale(12), color: '#A7ADE0' },
  walletBadge: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  // Wraps at 320dp, where the button and the pending figure do not fit side by side.
  balanceBottom: {
    marginTop: scale(16),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: scale(12),
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    height: scale(44),
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
  pendingBlock: { alignItems: 'flex-end', flexShrink: 1, minWidth: 0 },
  pendingLabel: { fontSize: fontScale(12), color: '#B9BEEA' },
  pendingValue: {
    marginTop: scale(4),
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pendingHint: { marginTop: scale(2), fontSize: fontScale(11), color: '#A7ADE0' },

  statRow: { marginTop: scale(16), flexDirection: 'row', gap: scale(8) },
  statTile: {
    flex: 1,
    minWidth: 0,
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
  // Two lines reserved so the three values line up even when one label wraps.
  statLabel: {
    marginTop: scale(8),
    minHeight: fontScale(11) * 2.6,
    fontSize: fontScale(11),
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
  statCaption: { marginTop: scale(4), fontSize: fontScale(11), color: '#A0A3B5' },

  tabs: {
    marginTop: scale(24),
    padding: scale(4),
    flexDirection: 'row',
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E8F4',
  },
  tab: {
    flex: 1,
    height: scale(44),
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
    marginTop: scale(24),
    marginBottom: scale(12),
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

  errorBox: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
  },
  errorText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B3261E',
  },
  retryBtn: {
    marginTop: scale(4),
    minHeight: scale(44),
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  feeNote: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#F3F3FF',
    borderWidth: 1,
    borderColor: '#E9EBEF',
  },
  feeNoteText: { fontSize: fontScale(14), lineHeight: fontScale(20), color: '#4A5568' },
  feeNoteBold: { fontFamily: 'Inter-Bold', fontWeight: '700', color: '#07074E' },
  filters: { marginTop: scale(12) },
  search: {
    height: scale(46),
    paddingHorizontal: scale(13),
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E8F4',
    // 16 stops the iOS zoom-on-focus.
    fontSize: 16,
    color: '#181943',
  },
  filterChips: { gap: scale(8), paddingTop: scale(10) },
  filterChip: {
    minHeight: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E8F4',
  },
  filterChipOn: { backgroundColor: '#EEF0FE', borderColor: '#3D4FD8' },
  filterText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#8B8FA6',
  },
  filterTextOn: { color: '#3D4FD8', fontFamily: 'Inter-ExtraBold', fontWeight: '800' },
  emptyAction: { marginTop: scale(6), minHeight: scale(44), justifyContent: 'center' },
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
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
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
  txItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF6',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: scale(13),
  },
  txDetails: {
    paddingHorizontal: scale(14),
    paddingBottom: scale(12),
    backgroundColor: '#FAFAFF',
  },
  txDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: scale(12),
    paddingTop: scale(8),
  },
  txDetailLabel: { flexShrink: 1, fontSize: fontScale(12), color: '#8B8FA6' },
  txDetailValue: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#181943',
  },
  txLogo: {
    flexShrink: 0,
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  txLogoText: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  txCopy: { flex: 1, minWidth: 0, marginLeft: scale(12) },
  txTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  txSubtitle: { marginTop: scale(2), fontSize: fontScale(12), color: '#8B8FA6' },
  txDate: { marginTop: scale(3), fontSize: fontScale(11), color: '#A0A3B5' },
  txRight: { alignItems: 'flex-end', flexShrink: 0, marginLeft: scale(8) },
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
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});

export default Earnings;
