/**
 * Brand wallet — the native replacement for the web
 * /dashboard/business/wallet page. Shows the balance, chat-unlock state,
 * recharge-bonus tiers and transaction history from GET /api/business/wallet.
 *
 * Adding funds is NOT native: the recharge endpoint opens a Razorpay/Cashfree
 * order that needs a checkout SDK this app doesn't bundle, so "Add Funds"
 * carries the chosen amount over to the existing web flow.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Path, Rect } from 'react-native-svg';
import AppHeader from '../components/AppHeader';
import { SkeletonWallet } from '../components/Skeleton';
import { getWallet } from '../api';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
};

type Tier = { amount?: number; bonus_percent?: number; label?: string };

type Wallet = {
  available_balance?: number;
  minimum_chat_balance?: number;
  chat_unlocked?: boolean;
  plan_name?: string;
  /** From the backend's wallet_bonus_tiers(), ascending by amount. */
  bonus_tiers?: Tier[];
  transactions?: Record<string, any>[];
};

/** Mirrors the backend's WALLET_MIN_RECHARGE. */
const MIN_RECHARGE = 2500;

const rupees = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

/** "29 Aug 2026 • 10:14 AM" — the web page's activity-row format. */
function formatStamp(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} • ${time}`;
}

/** Tier chip label: 10000 -> "₹10K". Falls back to the backend's own label. */
function shortAmount(value: number): string {
  if (value >= 100000) return `₹${Math.round(value / 100000)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${value}`;
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
      {name === 'wallet' && (
        <>
          <Rect x={3.5} y={6} width={17} height={13} rx={2.5} {...line} />
          <Path d="M3.5 10.5h17M16 14.5h1.5" {...line} />
        </>
      )}
      {name === 'bolt' && (
        <Path d="M13 3 6 13.5h5L11 21l7-10.5h-5L13 3Z" {...line} />
      )}
      {name === 'up' && (
        <Path d="M12 18.5v-13M6.5 11 12 5.5 17.5 11" {...line} />
      )}
      {name === 'doc' && (
        <Path d="M6.5 3.5h7l4.5 4.5v12h-11.5zM13.5 3.5V8H18" {...line} />
      )}
      {name === 'caretDown' && <Path d="m6.5 9.5 5.5 5.5 5.5-5.5" {...line} />}
      {name === 'caretUp' && <Path d="m6.5 14.5 5.5-5.5 5.5 5.5" {...line} />}
      {name === 'lock' && (
        <Path
          d="M6 10.5h12V20H6zM8.6 10.5V7.8a3.4 3.4 0 0 1 6.8 0v2.7"
          {...line}
        />
      )}
    </Svg>
  );
}

function BrandWallet({
  token,
  onNavigate,
  onNotifications,
  onMessages,
}: Props) {
  const [wallet, setWallet] = useState<Wallet>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    try {
      setWallet(await getWallet(token));
    } catch {
      // Offline or the API is unreachable — keep whatever is on screen;
      // pull-to-refresh retries the real request.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const all = wallet.transactions || [];
  // Newest first — the backend merges several sources, so order isn't given.
  // It sends `date`; `created_at` is tolerated in case the shape changes.
  const sorted = [...all].sort((a, b) => {
    const left = new Date(String(a.date || a.created_at || '')).getTime() || 0;
    const right = new Date(String(b.date || b.created_at || '')).getTime() || 0;
    return right - left;
  });
  const visible = showAll ? sorted : sorted.slice(0, 3);

  // Drop malformed tiers rather than rendering "₹0 +0% bonus".
  const tiers = (wallet.bonus_tiers || []).filter(
    tier => Number(tier?.amount) > 0 && Number(tier?.bonus_percent) > 0,
  );
  // Presets follow the bonus tiers so the chips always land on a bonus.
  const presets = tiers.length
    ? tiers.map(tier => Number(tier.amount))
    : [10000, 25000, 50000];

  const typed = Number(amount) || 0;
  const canAdd = typed >= MIN_RECHARGE;

  /**
   * Hands off to the web wallet page. The recharge endpoint returns a payment
   * gateway order that needs a checkout SDK this app doesn't bundle, so the
   * amount travels as a query param for the web page to prefill.
   */
  const addFunds = () => {
    if (!canAdd) return;
    onNavigate(`/dashboard/business/wallet?amount=${typed}`);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <AppHeader
          title="Wallet"
          onNotifications={onNotifications}
          onMessages={onMessages}
        />
      </View>

      <View style={styles.sheet}>
        {loading ? (
          <View style={styles.content}>
            <SkeletonWallet />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flexOne}
            behavior="padding"
          >
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
            {/* ---- Hero balance ---- */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Available Balance</Text>

              {/* Balance and the chat-unlock pill share one row. */}
              <View style={styles.heroRow}>
                <Text style={styles.heroValue} numberOfLines={1}>
                  {rupees(wallet.available_balance)}
                </Text>

                <View
                  style={[
                    styles.chatPill,
                    !wallet.chat_unlocked && styles.chatPillLocked,
                  ]}
                >
                  <Icon
                    name="lock"
                    color={wallet.chat_unlocked ? '#4ADE80' : '#FCD34D'}
                    size={12}
                  />
                  <Text
                    style={[
                      styles.chatPillText,
                      !wallet.chat_unlocked && styles.chatPillTextLocked,
                    ]}
                    numberOfLines={1}
                  >
                    {wallet.chat_unlocked
                      ? 'Chat unlocked'
                      : `Add ${rupees(wallet.minimum_chat_balance)} to unlock`}
                  </Text>
                </View>
              </View>
            </View>

            {/* ---- Quick recharge ---- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Quick Recharge</Text>
              <Text style={styles.fieldLabel}>ENTER AMOUNT</Text>

              <View style={styles.inputWrap}>
                <Text style={styles.inputPrefix}>₹</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={value =>
                    setAmount(value.replace(/[^0-9]/g, ''))
                  }
                  placeholder="Enter amount"
                  placeholderTextColor="#9AA0C8"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.presetRow}>
                {presets.map(preset => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.preset,
                      typed === preset && styles.presetActive,
                    ]}
                    onPress={() => setAmount(String(preset))}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.presetText,
                        typed === preset && styles.presetTextActive,
                      ]}
                    >
                      Rs. {shortAmount(preset).replace('₹', '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.addBtn, !canAdd && styles.addBtnOff]}
                onPress={addFunds}
                disabled={!canAdd}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdd }}
              >
                <Icon name="bolt" color="#FFFFFF" size={16} />
                <Text style={styles.addBtnText}>Add Funds</Text>
              </TouchableOpacity>

              <Text style={styles.hint}>
                Minimum {rupees(MIN_RECHARGE)} • Instant credit after payment
                verification
              </Text>
            </View>

            {/* ---- Recharge bonus tiers ---- */}
            {tiers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Recharge Bonus</Text>
                <Text style={styles.cardSub}>
                  Bigger recharges earn a bigger instant bonus.
                </Text>

                <View style={styles.tierRow}>
                  {tiers.map((tier, index) => {
                    const value = Number(tier.amount);
                    const picked = typed === value;
                    return (
                      <TouchableOpacity
                        key={String(tier.label ?? index)}
                        style={[styles.tierBox, picked && styles.tierBoxActive]}
                        // Fills the Quick Recharge amount above, so a tier can
                        // be chosen without retyping the figure.
                        onPress={() => setAmount(String(value))}
                        accessibilityRole="button"
                        accessibilityLabel={`Recharge ${rupees(
                          value,
                        )} for ${Number(tier.bonus_percent)} percent bonus`}
                        accessibilityState={{ selected: picked }}
                      >
                        <Text
                          style={[
                            styles.tierAmount,
                            picked && styles.tierAmountActive,
                          ]}
                        >
                          {text(tier.label, shortAmount(value))}
                        </Text>
                        <Text
                          style={[
                            styles.tierBonus,
                            picked && styles.tierBonusActive,
                          ]}
                        >
                          +{Number(tier.bonus_percent)}% bonus
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ---- Recent activity ---- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Activity</Text>

              {!sorted.length ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No transactions yet</Text>
                  <Text style={styles.emptyText}>
                    Recharges, escrow locks and refunds will appear here.
                  </Text>
                </View>
              ) : (
                visible.map((row, index) => {
                  const credit =
                    String(row.direction || '').toLowerCase() === 'credit';
                  const status = text(row.status);
                  const key = status.toLowerCase();
                  const held = key === 'held' || key === 'hold';
                  const done =
                    key === 'success' || key === 'paid' || key === 'completed';
                  return (
                    <View key={String(row.id ?? index)} style={styles.txRow}>
                      <View
                        style={[
                          styles.txIcon,
                          credit ? styles.txIconCredit : styles.txIconDebit,
                        ]}
                      >
                        <Icon
                          name={credit ? 'up' : 'doc'}
                          color={credit ? '#4C5BF3' : '#C4373B'}
                          size={15}
                        />
                      </View>

                      <View style={styles.txCopy}>
                        <Text style={styles.txType} numberOfLines={1}>
                          {text(row.type, 'Transaction')}
                        </Text>
                        <Text style={styles.txDate}>
                          {formatStamp(row.date || row.created_at)}
                        </Text>
                      </View>

                      <View style={styles.txRight}>
                        <Text
                          style={[
                            styles.txAmount,
                            credit
                              ? styles.txAmountCredit
                              : styles.txAmountDebit,
                          ]}
                        >
                          {credit ? '+' : '-'}
                          {rupees(row.amount)}
                        </Text>
                        {!!status && (
                          <View
                            style={[
                              styles.badge,
                              held
                                ? styles.badgeHeld
                                : done
                                ? styles.badgeSuccess
                                : styles.badgeNeutral,
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                held
                                  ? styles.badgeHeldText
                                  : done
                                  ? styles.badgeSuccessText
                                  : styles.badgeNeutralText,
                              ]}
                            >
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}

              {sorted.length > 3 && (
                <TouchableOpacity
                  style={styles.viewAll}
                  onPress={() => setShowAll(value => !value)}
                  accessibilityRole="button"
                >
                  <Text style={styles.viewAllText}>
                    {showAll ? 'Show Less' : `View All (${sorted.length - 3})`}
                  </Text>
                  <Icon
                    name={showAll ? 'caretUp' : 'caretDown'}
                    color="#4C5BF3"
                    size={14}
                  />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the rounded sheet below covers the rest,
  // matching the creator tabs.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  flexOne: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: '#F4F5FB',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  // Navy strip behind the shared app header, matching the other tabs.
  topBar: { backgroundColor: '#0E1330' },
  content: { padding: scale(14), paddingBottom: scale(34) + NAV_CLEARANCE },

  // ---- Hero ----
  // Deep indigo — darker than the tier/preset accents so the balance reads as
  // the heaviest element on the screen.
  hero: {
    padding: scale(18),
    borderRadius: scale(18),
    backgroundColor: '#181C6B',
    overflow: 'hidden',
  },
  heroLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#A9AEE4',
  },
  // Balance and pill on one line; `flex-end` sits the pill on the number's
  // baseline rather than floating it beside the cap height.
  heroRow: {
    marginTop: scale(5),
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: scale(10),
  },
  // `flexShrink` so a long balance shrinks the number's box rather than
  // pushing the pill off the card.
  heroValue: {
    flexShrink: 1,
    fontSize: fontScale(31),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#FFFFFF',
  },
  chatPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    marginBottom: scale(4),
    paddingVertical: scale(5),
    paddingHorizontal: scale(9),
    borderRadius: scale(9),
    backgroundColor: 'rgba(74,222,128,0.16)',
  },
  chatPillLocked: { backgroundColor: 'rgba(252,211,77,0.18)' },
  chatPillText: {
    flexShrink: 1,
    fontSize: fontScale(10.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4ADE80',
  },
  chatPillTextLocked: { color: '#FCD34D' },

  // ---- Generic white card ----
  card: {
    marginTop: scale(12),
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
  },
  cardTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#15163F',
  },
  cardSub: { marginTop: scale(3), fontSize: fontScale(12), color: '#7C819C' },

  // ---- Quick recharge ----
  fieldLabel: {
    marginTop: scale(14),
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#7C819C',
  },
  inputWrap: {
    marginTop: scale(7),
    height: scale(46),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: scale(13),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#E3E5F3',
    backgroundColor: '#FAFAFE',
  },
  inputPrefix: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  // `padding: 0` strips Android's default TextInput inset so the text sits
  // vertically centred in the 46pt row.
  input: { flex: 1, padding: 0, fontSize: fontScale(14), color: '#15163F' },
  presetRow: { marginTop: scale(9), flexDirection: 'row', gap: scale(8) },
  preset: {
    flex: 1,
    height: scale(40),
    borderRadius: scale(10),
    backgroundColor: '#F0F1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: '#4C5BF3' },
  presetText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  presetTextActive: { color: '#FFFFFF' },
  addBtn: {
    marginTop: scale(11),
    height: scale(46),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    borderRadius: scale(12),
    backgroundColor: '#141A4F',
  },
  // Dimmed until the amount clears the backend's minimum.
  addBtnOff: { opacity: 0.45 },
  addBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hint: {
    marginTop: scale(9),
    fontSize: fontScale(10.5),
    color: '#9AA0C8',
    textAlign: 'center',
  },

  // ---- Bonus tiers ----
  tierRow: { marginTop: scale(12), flexDirection: 'row', gap: scale(8) },
  tierBox: {
    flex: 1,
    paddingVertical: scale(12),
    paddingHorizontal: scale(8),
    borderRadius: scale(11),
    // Transparent border matching tierBoxActive's width, so selecting a tier
    // doesn't nudge its contents or resize it against its neighbours.
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: '#F5F6FC',
  },
  // Selected tier: outlined rather than filled, so the green bonus figure
  // stays readable (a solid fill would force it to white).
  tierBoxActive: {
    borderColor: '#4C5BF3',
    backgroundColor: '#EEF0FE',
  },
  tierAmount: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  tierAmountActive: { color: '#4C5BF3' },
  tierBonus: {
    marginTop: scale(5),
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#16A34A',
  },
  tierBonusActive: { color: '#16A34A' },

  // ---- Recent activity ----
  // Full-width footer toggle under the list, replacing the old header link.
  viewAll: {
    marginTop: scale(14),
    height: scale(40),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(3),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#E3E5F3',
    backgroundColor: '#FAFAFE',
  },
  viewAllText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  txRow: {
    marginTop: scale(11),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  txIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconCredit: { backgroundColor: '#EEF0FE' },
  txIconDebit: { backgroundColor: '#FDECEC' },
  txCopy: { flex: 1 },
  txType: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  txDate: { marginTop: scale(2), fontSize: fontScale(10.5), color: '#9AA0C8' },
  txRight: { alignItems: 'flex-end', gap: scale(4) },
  txAmount: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  txAmountCredit: { color: '#16A34A' },
  txAmountDebit: { color: '#DC2626' },
  badge: { paddingVertical: scale(2), paddingHorizontal: scale(8), borderRadius: scale(7) },
  badgeText: { fontSize: fontScale(9.5), fontFamily: 'Inter-Bold', fontWeight: '700' },
  badgeHeld: { backgroundColor: '#EEF0FE' },
  badgeHeldText: { color: '#4C5BF3' },
  badgeSuccess: { backgroundColor: '#E7F8EE' },
  badgeSuccessText: { color: '#16A34A' },
  badgeNeutral: { backgroundColor: '#F0F1F6' },
  badgeNeutralText: { color: '#7C819C' },

  empty: {
    marginTop: scale(14),
    paddingVertical: scale(22),
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(11.5),
    color: '#7C819C',
    textAlign: 'center',
  },
});

export default BrandWallet;
