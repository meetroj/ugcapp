/**
 * Skeleton placeholders — the grey shapes a screen shows while its data loads.
 *
 * Two problems these solve. First, a small centred spinner occupies almost no
 * height, so when the real list arrives the page grows and everything visibly
 * jumps. A skeleton reserves roughly the height the content will take, so the
 * swap is a fade rather than a shift. Second, some screens used to seed their
 * state with hard-coded SAMPLE rows, which meant the user briefly read fake
 * data before it was replaced; skeletons say "loading" without inventing
 * content.
 *
 * Shapes here mirror the real cards on each screen. Keep them in sync when a
 * card's layout changes, otherwise the jump comes back.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { scale } from '../theme';

/**
 * Under the test renderer there is no frame clock, so an Animated.loop never
 * settles and Jest cannot tear the environment down. Rendering the blocks
 * static in tests keeps the shipped shimmer intact while letting suites exit.
 * `jest` is injected as a global only by the test runner, so this is false in
 * every real build (dev and release alike).
 */
const ANIMATE = typeof jest === 'undefined';

/**
 * One shimmering grey block. Everything else in this file is composed of these.
 * `width` accepts a number or a percentage string, matching RN's own sizing.
 */
export function SkeletonBlock({
  width = '100%',
  height = 12,
  radius = 6,
  raw = false,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  /**
   * Opts out of scaling, for callers whose numbers are already screen-relative
   * (e.g. a tile sized as a fraction of the window). Scaling those a second
   * time would compound the two adjustments.
   */
  raw?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  // One driver per block. Pulsing opacity rather than a sliding gradient keeps
  // this dependency-free and cheap enough to run on the native thread.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ANIMATE) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  // Dimensions are scaled here rather than at each of the ~60 call sites, so a
  // placeholder keeps matching the real card it stands in for on every screen
  // size. Percentage widths are already relative and pass through untouched.
  // `raw` covers the box only: a corner radius is a fixed detail of the shape,
  // not a proportion of the caller's measurement, so it scales either way.
  const size = (n: number) => (raw ? n : scale(n));
  const w = typeof width === 'number' ? size(width) : width;

  return (
    <Animated.View
      style={[
        styles.block,
        {
          width: w as ViewStyle['width'],
          height: size(height),
          borderRadius: scale(radius),
          opacity,
        },
        style as ViewStyle,
      ]}
    />
  );
}

/** A circle — avatars, logos, icon slots. */
export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <SkeletonBlock width={size} height={size} radius={size / 2} />;
}

/**
 * Generic list card: optional avatar, a title line, and `lines` body lines.
 * Covers most of the list screens (deals, bids, messages, campaigns).
 */
export function SkeletonCard({
  avatar = false,
  lines = 2,
  footer = false,
}: {
  avatar?: boolean;
  lines?: number;
  footer?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {avatar ? <SkeletonCircle size={44} /> : null}
        <View style={styles.grow}>
          <SkeletonBlock width="65%" height={14} />
          <SkeletonBlock width="35%" height={10} style={styles.gapSm} />
        </View>
        <SkeletonBlock width={58} height={22} radius={11} />
      </View>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          // Taper the last line so the block reads as text, not a slab.
          width={index === lines - 1 ? '55%' : '90%'}
          height={10}
          style={styles.gapMd}
        />
      ))}
      {footer ? (
        <View style={[styles.row, styles.gapLg]}>
          <SkeletonBlock width={96} height={32} radius={8} />
          <View style={styles.grow} />
          <SkeletonBlock width={72} height={32} radius={8} />
        </View>
      ) : null}
    </View>
  );
}

/** `count` list cards in a column. The default for any plain list screen. */
export function SkeletonList({
  count = 4,
  avatar = false,
  lines = 2,
  footer = false,
}: {
  count?: number;
  avatar?: boolean;
  lines?: number;
  footer?: boolean;
}) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard
          key={index}
          avatar={avatar}
          lines={lines}
          footer={footer}
        />
      ))}
    </View>
  );
}

/**
 * A row of small stat tiles — the summary strip at the top of the dashboards
 * and the wallet.
 */
export function SkeletonStats({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.stats}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.stat}>
          <SkeletonBlock width="55%" height={10} />
          <SkeletonBlock width="75%" height={20} style={styles.gapMd} />
        </View>
      ))}
    </View>
  );
}

/** A wide hero/balance panel, as on Earnings and the brand wallet. */
export function SkeletonBanner({ height = 120 }: { height?: number }) {
  return <SkeletonBlock height={height} radius={16} />;
}

/** Horizontal chip strip standing in for a filter/tab row. */
export function SkeletonChips({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.chips}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} width={78} height={32} radius={16} />
      ))}
    </View>
  );
}

/** Avatar + name + meta lines, for profile headers. */
export function SkeletonProfile() {
  return (
    <View style={styles.profile}>
      <SkeletonCircle size={84} />
      <SkeletonBlock width={160} height={16} style={styles.gapLg} />
      <SkeletonBlock width={110} height={11} style={styles.gapMd} />
      <SkeletonBlock width={220} height={10} style={styles.gapMd} />
    </View>
  );
}

/**
 * The brand Wallet page: indigo balance hero, the Quick Recharge card (amount
 * field, preset chips, Add Funds button), an optional bonus-tier card, and the
 * Recent Activity list. The old placeholder used a generic banner + a two-tile
 * stat strip the page doesn't have, and omitted the recharge form entirely, so
 * roughly half the screen appeared only after loading finished.
 *
 * The hero keeps its dark fill rather than the grey block: it is the page's
 * anchor, and fading it in from grey reads as a flash.
 */
export function SkeletonWallet({ tiers = true }: { tiers?: boolean }) {
  return (
    <View>
      {/* Balance hero — label over the big figure, chat pill on the right. */}
      <View style={styles.walletHero}>
        <SkeletonBlock width={104} height={15} style={styles.walletOnDark} />
        <View style={styles.walletHeroRow}>
          <SkeletonBlock width={168} height={37} style={styles.walletOnDark} />
          <SkeletonBlock
            width={112}
            height={24}
            radius={9}
            style={styles.walletOnDark}
          />
        </View>
      </View>

      {/* Quick Recharge: title, field label, input, three presets, button. */}
      <View style={styles.walletCard}>
        <SkeletonBlock width={132} height={20} />
        <SkeletonBlock width={92} height={13} style={styles.walletFieldLabel} />
        <SkeletonBlock height={46} radius={11} style={styles.walletInput} />
        <View style={styles.walletPresets}>
          {[0, 1, 2].map(index => (
            <View key={index} style={styles.grow}>
              <SkeletonBlock height={40} radius={10} />
            </View>
          ))}
        </View>
        <SkeletonBlock height={46} radius={12} style={styles.walletAddBtn} />
        <SkeletonBlock width={210} height={13} style={styles.walletHint} />
      </View>

      {/* Bonus tiers — only when the wallet actually returns any. */}
      {tiers ? (
        <View style={styles.walletCard}>
          <SkeletonBlock width={124} height={20} />
          <SkeletonBlock width="72%" height={15} style={styles.walletCardSub} />
          <View style={styles.walletTiers}>
            {[0, 1, 2].map(index => (
              <View key={index} style={styles.grow}>
                <SkeletonBlock height={61} radius={11} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Recent Activity: icon tile, type + date, amount + status badge. */}
      <View style={styles.walletCard}>
        <SkeletonBlock width={118} height={20} />
        {[0, 1, 2].map(index => (
          <View key={index} style={styles.walletTx}>
            <SkeletonBlock width={34} height={34} radius={10} />
            <View style={styles.grow}>
              <SkeletonBlock width="55%" height={12} />
              <SkeletonBlock width="38%" height={10} style={styles.gapXs} />
            </View>
            <View style={styles.walletTxRight}>
              <SkeletonBlock width={74} height={12} />
              <SkeletonBlock width={52} height={15} radius={7} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The brand Campaigns card: square-ish avatar tile, title + creator count, a
 * status chip, one meta line, then a divider above the budget / "View Details"
 * footer. The generic SkeletonCard draws a round avatar and two body lines,
 * which is a different silhouette and a different height, so the list visibly
 * re-flowed when the real campaigns arrived.
 */
export function SkeletonCampaignCard() {
  return (
    <View style={styles.campaignCard}>
      <View style={styles.campaignTop}>
        {/* Rounded square, not a circle — matches the card's tinted tile. */}
        <SkeletonBlock width={38} height={38} radius={12} />
        <View style={styles.grow}>
          <SkeletonBlock width="60%" height={14} />
          <SkeletonBlock width="30%" height={10} style={styles.gapSm} />
        </View>
        <SkeletonBlock width={62} height={21} radius={7} />
      </View>

      {/* Single meta row: the calendar icon, the format line, and the date. */}
      <View style={styles.campaignMeta}>
        <SkeletonBlock width={14} height={14} radius={4} />
        <SkeletonBlock width="45%" height={11} />
        <View style={styles.grow} />
        <SkeletonBlock width={86} height={11} />
      </View>

      <View style={styles.campaignDivider} />

      <View style={styles.campaignFooter}>
        <SkeletonBlock width={110} height={15} />
        <SkeletonBlock width={112} height={32} radius={10} />
      </View>
    </View>
  );
}

/** `count` campaign cards, stacked as the Campaigns tab stacks them. */
export function SkeletonCampaignList({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCampaignCard key={index} />
      ))}
    </View>
  );
}

/**
 * A horizontal strip of tall 9:16 reel tiles — the brand-side Creators tab,
 * whose cards are portrait video tiles with an avatar / name / rate footer
 * rather than the full-width rows SkeletonList draws. Geometry is passed in by
 * the screen so the placeholder occupies exactly the tile's height and the real
 * reels drop in without a shift.
 */
export function SkeletonReelRow({
  count = 3,
  tileWidth,
  tileHeight,
  footerHeight = 46,
  gap = 12,
}: {
  count?: number;
  tileWidth: number;
  tileHeight: number;
  footerHeight?: number;
  gap?: number;
}) {
  return (
    <View style={[styles.reelRow, { gap }]}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={{ width: tileWidth }}>
          {/* tileWidth/tileHeight arrive already sized against the window. */}
          <SkeletonBlock
            width={tileWidth}
            height={tileHeight}
            radius={16}
            raw
          />
          <View style={[styles.reelFooter, { height: footerHeight }]}>
            <SkeletonCircle size={24} />
            <View style={styles.grow}>
              <SkeletonBlock width="70%" height={10} />
              <SkeletonBlock width="45%" height={9} style={styles.gapSm} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A settings/detail form: repeated label + field pairs. */
export function SkeletonForm({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index}>
          <SkeletonBlock width="30%" height={10} />
          <SkeletonBlock height={44} radius={12} style={styles.gapMd} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** The shared grey fill; size and radius come from the caller. */
  block: { backgroundColor: '#E4E6F0' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#EEEFF5',
    padding: scale(16),
  },
  list: { gap: scale(12) },
  row: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  grow: { flex: 1 },
  gapXs: { marginTop: scale(2) },
  gapSm: { marginTop: scale(6) },
  gapMd: { marginTop: scale(10) },
  gapLg: { marginTop: scale(16) },
  stats: { flexDirection: 'row', gap: scale(12) },
  stat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#EEEFF5',
    padding: scale(16),
  },
  chips: { flexDirection: 'row', gap: scale(8) },
  // ---- Wallet. Metrics mirror BrandWallet's `hero`, `card`, `inputWrap`,
  // `presetRow`, `addBtn`, `tierRow` and `txRow` so nothing re-flows. ----
  walletHero: {
    padding: scale(18),
    borderRadius: scale(18),
    backgroundColor: '#181C6B',
    overflow: 'hidden',
  },
  // The hero is dark, so its blocks are a translucent white rather than the
  // grey used everywhere else — grey on indigo reads as a rendering fault.
  walletOnDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  walletHeroRow: {
    marginTop: scale(5),
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: scale(10),
  },
  walletCard: {
    marginTop: scale(12),
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
  },
  walletCardSub: { marginTop: scale(3) },
  walletFieldLabel: { marginTop: scale(14) },
  walletInput: { marginTop: scale(7) },
  walletPresets: { marginTop: scale(9), flexDirection: 'row', gap: scale(8) },
  walletAddBtn: { marginTop: scale(11) },
  // Centred, matching the hint line's `textAlign: 'center'`.
  walletHint: { marginTop: scale(9), alignSelf: 'center' },
  walletTiers: { marginTop: scale(12), flexDirection: 'row', gap: scale(8) },
  walletTx: {
    marginTop: scale(11),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  walletTxRight: { alignItems: 'flex-end', gap: scale(4) },
  // Mirrors BrandCampaigns' `card` metrics exactly — padding, radius, border
  // and the 10px stacking gap — so the swap to real cards doesn't re-flow.
  campaignCard: {
    marginBottom: scale(10),
    padding: scale(13),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  campaignTop: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  campaignMeta: {
    marginTop: scale(18),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  campaignDivider: { height: 1, backgroundColor: '#F0F1F7', marginTop: scale(16) },
  campaignFooter: {
    marginTop: scale(10),
    height: scale(32),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(10),
  },
  // Mirrors BrandCreators' `row` + `tileFooter`: tiles run off the right edge,
  // so the strip is clipped rather than wrapped.
  reelRow: { flexDirection: 'row', overflow: 'hidden' },
  reelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: scale(8),
    gap: scale(6),
  },
  profile: { alignItems: 'center', paddingVertical: scale(12) },
});

export default SkeletonList;
