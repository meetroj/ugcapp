import { useLiveEffect } from "../liveUpdates";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Rect } from 'react-native-svg';
import Video from 'react-native-video';
import { SkeletonBlock } from '../components/Skeleton';
import {
  BACKEND_URL,
  getCampaigns,
  getMe,
  getPayoutOverview,
  getTopEarners,
  getUnreadCount,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import { isSelectedCreator, loadErrorText } from '../briefs';
import { profileNudge, profilePercent } from '../profileCompletion';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

// "Later" on the complete-your-profile pop-up hides it until the app restarts
// (the website hides it for the browser session).
let nudgeDismissed = false;

// Normalized shape for the home screen's "top creators" rail, populated from
// getTopEarners() (GET /api/home/top-earners) below — see the normalization
// in the effect's results[2] branch. Not the business creator-directory.
type Creator = {
  [key: string]: unknown;
  id?: string;
  name?: string;
  nickname?: string;
  username?: string;
  full_name?: string;
  profile_photo?: string;
  // First usable portfolio clip — in practice an .mp4 for every seeded creator.
  portfolio_preview?: string;
  // All usable clips, not just the first.
  portfolio?: string[];
  primary_category?: string;
  // Backend-computed: true when portfolio_preview is a video file.
  premium?: boolean;
  deliverables_completed?: number;
  earned?: number;
};

type Props = {
  token: string;
  session: AuthUser;
  onBrowse: () => void;
  onOpenNotifications: () => void;
  /** Opens Messages from the header icon (replaced the profile avatar). */
  onOpenMessages: () => void;
  /** Opens the Profile tab from the header's top-left button. */
  onOpenProfile: () => void;
  /** The hero stat rows: Total Earnings opens Earnings, Deals opens My Deals. */
  onOpenEarnings?: () => void;
  onOpenDeals?: () => void;
  /** Sends the "complete your profile" pop-up to /kyc when KYC is all that is left. */
  onNavigate?: (path: string) => void;
};

const money = (value: unknown) =>
  `₹ ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

const displayName = (value: Record<string, unknown>) =>
  String(
    value.name ||
      value.nickname ||
      value.username ||
      value.full_name ||
      value.email ||
      'Creator',
  ).replace(/^@/, '');

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

// The backend sends a single `portfolio_preview` URL (first portfolio item).
// It is frequently an .mp4, so callers must check isVideo() before rendering.
const creatorMedia = (creator: Creator) =>
  photoUrl(creator.portfolio_preview || creator.profile_photo);

// The backend already computes this as `premium`; the extension check is a
// fallback for Cloudinary URLs that omit a file extension.
const isVideo = (creator: Creator, uri: string | null) =>
  creator.premium === true ||
  (!!uri &&
    (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(uri) ||
      /\/video\/upload\//i.test(uri)));

// Portfolio previews are real .mp4 files served from the backend's /uploads,
// played by react-native-video -- the same native player the rest of the app
// uses. The inline-HTML web player this replaced was governed by the browser
// autoplay policy and needed a baseUrl to dodge a null origin; neither applies
// to the native player.
function VideoPreview({ uri }: { uri: string }) {
  return (
    <Video
      source={{ uri }}
      style={styles.creatorVideo}
      resizeMode="cover"
      repeat
      muted
      playInBackground={false}
      playWhenInactive={false}
      disableFocus
      ignoreSilentSwitch="ignore"
    />
  );
}

// Card + media dimensions. The player needs these as real numbers (not '100%'),
// so they are shared with the stylesheet to keep the two in sync.
const CARD_WIDTH = scale(238);
/**
 * Card width plus the 14px gap in `creatorRow` — one card's worth of travel.
 * The gap is scaled the same way the stylesheet scales it, otherwise the rail
 * would snap slightly off a card edge on any screen but the 390pt reference.
 */
const CARD_STRIDE = CARD_WIDTH + scale(14);
/** How long each card is held before the carousel advances. */
const AUTOSCROLL_MS = 3000;
/**
 * Quiet period after the user stops dragging before auto-scroll takes over
 * again. Long enough that it never fights someone still browsing.
 */
const RESUME_AFTER_MS = 5000;
/** The carousel shows the podium only. */
const TOP_N = 3;
const MEDIA_HEIGHT = scale(262);

const RANK_COLORS = ['#F5C542', '#B9C0CC', '#C9824B'];

function DealBagIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4}
        y={7.5}
        width={16}
        height={12}
        rx={2.5}
        stroke="#4D8BF5"
        strokeWidth={1.8}
      />
      <Path
        d="M9 7.5V6a3 3 0 0 1 6 0v1.5M4 12h16M10 12v2h4v-2"
        stroke="#4D8BF5"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CreatorHome({
  token,
  session,
  onBrowse,
  onOpenNotifications,
  onOpenMessages,
  onOpenProfile,
  onOpenEarnings,
  onOpenDeals,
  onNavigate,
}: Props) {
  const [profile, setProfile] = useState<AuthUser>(session);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [completedDeals, setCompletedDeals] = useState(0);
  // Lifetime released payouts from /payout/overview; null until it answers.
  const [allTimeEarned, setAllTimeEarned] = useState<number | null>(null);
  // The creator's first running deal, for the card under the hero.
  const [activeDeal, setActiveDeal] = useState<Record<string, any> | null>(null);
  // Why a card failed to load ('' = fine), so a failure is never shown as 0 or empty.
  const [loadError, setLoadError] = useState('');
  const [creatorsError, setCreatorsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Real unread-notification count for the header bell (was hardcoded to 1).
  const [notifications, setNotifications] = useState(0);
  // Private briefs already announced this session (the poll re-runs loadData).
  const announced = useRef(new Set<string>());
  // A ref, not a dependency: the parent passes an inline arrow, which would
  // rebuild loadData (and refetch) on every render.
  const openMessages = useRef(onOpenMessages);
  openMessages.current = onOpenMessages;

  const loadData = useCallback(() => {
    let active = true;

    // Each card fails independently: a stalled directory must not hide the
    // profile header, so these are settled rather than raced.
    Promise.allSettled([
      getMe(token),
      // A creator's "completed deals" = campaigns they were selected for that
      // have finished. The backend applies the creator_id filter itself.
      getCampaigns(token, { status: 'completed', creatorId: session.user_id }),
      // The SAME curated leaderboard the website's home page renders. The old
      // call here was getCreatorDirectory(), which is every approved creator in
      // arbitrary order — that is why the app's rail disagreed with the site.
      getTopEarners(token),
      // Lifetime earnings. Best effort: without it the hero falls back to the balance.
      getPayoutOverview(token),
    ]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        setProfile(results[0].value as AuthUser);
      }
      if (results[1].status === 'fulfilled') {
        // Deals closed = campaigns this creator was selected for that are completed.
        // Filtered here too in case the server's status filter is ignored.
        setCompletedDeals(
          results[1].value.filter(
            c =>
              isSelectedCreator(c, session.user_id) &&
              String(c.status).toLowerCase() === 'completed',
          ).length,
        );
      }
      if (results[3].status === 'fulfilled') {
        const earned = Number(
          (results[3].value as Record<string, unknown>).all_time_earnings,
        );
        setAllTimeEarned(Number.isFinite(earned) ? earned : null);
      }
      // One message for the first failure among the cards that matter.
      const failed = results.slice(0, 3).find(r => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      setLoadError(failed ? loadErrorText(failed.reason, 'your home page') : '');
      setCreatorsError(
        results[2].status === 'rejected'
          ? loadErrorText(results[2].reason, 'top creators')
          : '',
      );
      if (results[2].status === 'fulfilled') {
        // Top-earners uses different field names than the directory did, so
        // normalise here and the card markup below stays untouched.
        setCreators(
          results[2].value.slice(0, TOP_N).map((earner, index) => ({
            id: String(earner.name || index),
            name: earner.name,
            primary_category: earner.category,
            deliverables_completed: earner.deals,
            // The website's "TOP EARNER Rs. X on UGCad" figure.
            earned: earner.earned,
            // The showreel is a Cloudinary .mp4; VideoPreview handles it and
            // isVideo() detects it from the /video/upload/ path.
            portfolio_preview: earner.video_url,
          })) as Creator[],
        );
      }
      setLoading(false);
      setRefreshing(false);
    });

    // A private brief that just went live for this creator pops up once per brief.
    // Remembered in storage, not by the chat card: declining only closes the card
    // and the brief itself stays active.
    getCampaigns(token)
      .then(async list => {
        // The card under the hero: the first deal this creator is running.
        if (active) {
          setActiveDeal(
            list.find(
              c =>
                isSelectedCreator(c, session.user_id) &&
                (c.status === 'in_progress' || c.status === 'active'),
            ) || null,
          );
        }
        const brief = list.find(c =>
          c.visibility === 'private' && c.status === 'active' &&
          (c.selected_creator === session.user_id ||
            (c.selected_creators || []).includes(session.user_id)) &&
          !announced.current.has(c.id));
        if (!active || !brief) return;
        const key = `privateBriefSeen:${brief.id}`;
        announced.current.add(brief.id);
        if (await AsyncStorage.getItem(key).catch(() => null)) return;
        await AsyncStorage.setItem(key, '1').catch(() => {});
        const budget = Number(brief.budget_max || brief.budget_min || 0);
        Alert.alert(
          "You've received a private brief",
          `${String(brief.brand_name || 'A brand')} sent "${brief.title || 'a brief'}" to you only` +
            (budget ? ` (₹${budget.toLocaleString('en-IN')} per video)` : '') +
            '. Open Messages to accept or decline within 72 hours.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'View & respond', onPress: () => openMessages.current() },
          ],
        );
      })
      .catch(() => {});

    // Badge only — a failure here must not affect the rest of the screen.
    getUnreadCount(token)
      .then(count => {
        if (active) setNotifications(count);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [session.user_id, token]);

  useLiveEffect(() => loadData(), [loadData]);

  // Only ever show what the backend actually returned. (Previously this fell
  // back to the signed-in user's own profile, which made a failed request look
  // like a real leaderboard entry.)
  const topCreators = creators;
  const cards = topCreators.slice(0, TOP_N);

  // --- Top Creators carousel: auto-advances, and yields to manual swipes ---
  const railRef = useRef<ScrollViewInstance>(null);
  // Which card auto-scroll will show next. A ref, not state: the interval reads
  // it every tick, and re-rendering the rail mid-scroll would fight the user.
  const nextIndex = useRef(0);
  // Set while a finger is down, and for RESUME_AFTER_MS after it lifts.
  const paused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResume = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }, []);

  /** Finger down: stop advancing immediately. */
  const onTouchRail = useCallback(() => {
    paused.current = true;
    clearResume();
  }, [clearResume]);

  /** Finger up: stay put briefly, then hand control back to the timer. */
  const onReleaseRail = useCallback(() => {
    clearResume();
    resumeTimer.current = setTimeout(() => {
      paused.current = false;
    }, RESUME_AFTER_MS);
  }, [clearResume]);

  /**
   * Keeps the auto-scroll cursor in step with wherever the user swiped to, so
   * resuming continues from the visible card instead of jumping back.
   */
  const onRailScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = event.nativeEvent.contentOffset.x;
      nextIndex.current = Math.round(x / CARD_STRIDE);
    },
    [],
  );

  useEffect(() => {
    // Nothing to rotate through with 0 or 1 card.
    if (cards.length < 2) {
      return;
    }

    const id = setInterval(() => {
      if (paused.current) {
        return;
      }
      const target = (nextIndex.current + 1) % cards.length;
      nextIndex.current = target;
      railRef.current?.scrollTo({ x: target * CARD_STRIDE, animated: true });
    }, AUTOSCROLL_MS);

    return () => {
      clearInterval(id);
      clearResume();
    };
  }, [cards.length, clearResume]);

  // Released payouts to date; before that answers (or if it fails) the wallet balance.
  const earnings = allTimeEarned ?? (profile.total_earned || profile.balance || 0);
  const deals = Number(profile.completed_deals || completedDeals || 0);
  const percent = profilePercent(profile);
  const category = String(
    (profile as Record<string, any>).category ||
      (profile as Record<string, any>).profile?.category ||
      (profile as Record<string, any>).niche ||
      (profile as Record<string, any>).primary_category ||
      '',
  )
    .replace(/_/g, ' ')
    .trim();
  const rating = Number((profile as Record<string, any>).average_rating || 0);

  // Team-requested items (photo, intro video, KYC...) still missing: ask once.
  const nudge = profileNudge(profile);
  const nudgeShown = useRef(false);
  useEffect(() => {
    if (!nudge.left.length || nudgeDismissed || nudgeShown.current) return;
    nudgeShown.current = true;
    Alert.alert(
      'Complete your profile',
      `Add your ${nudge.text} to finish setting up. Brands check these first before sending you deals.`,
      [
        { text: 'Later', style: 'cancel', onPress: () => { nudgeDismissed = true; } },
        {
          text: 'Complete now',
          onPress: () => (nudge.to === '/kyc' && onNavigate ? onNavigate('/kyc') : onOpenProfile()),
        },
      ],
    );
  }, [nudge.left.length, nudge.text, nudge.to, onNavigate, onOpenProfile]);

  return (
    <View style={styles.screen}>
      <AppHeader
        onProfile={onOpenProfile}
        profilePhoto={photoUrl(profile.profile_photo)}
        onNotifications={onOpenNotifications}
        onMessages={onOpenMessages}
        notificationCount={notifications}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroIntro}>
            <Text style={styles.greeting}>Hi, {displayName(profile)}</Text>
            {(!!category || rating > 0) && (
              <View style={styles.metaRow}>
                {!!category && <Text style={styles.metaChip}>{category}</Text>}
                {rating > 0 && <Text style={styles.metaRating}>★ {rating.toFixed(1)}</Text>}
              </View>
            )}
            <Text style={styles.tagline}>Create more. Collaborate more.</Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={onBrowse}
              activeOpacity={0.85}
            >
              {/* The hero column is only about half the screen, so the label is
                allowed to shrink rather than wrap or clip. */}
              <Text
                style={styles.browseText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Browse Campaigns
              </Text>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.statColumn}>
            {/* The chevrons promise navigation, so the rows deliver it. */}
            <TouchableOpacity
              style={styles.statRow}
              onPress={onOpenEarnings}
              disabled={!onOpenEarnings}
              accessibilityRole="button"
              accessibilityLabel="Open Earnings"
            >
              <View style={[styles.statIcon, styles.rupeeIcon]}>
                <Text style={styles.rupee}>₹</Text>
              </View>
              <View style={styles.statCopy}>
                <Text style={styles.statLabel}>Total Earnings</Text>
                <Text style={styles.statValue}>{money(earnings)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statRow}
              onPress={onOpenDeals}
              disabled={!onOpenDeals}
              accessibilityRole="button"
              accessibilityLabel="Open My Deals"
            >
              <View style={[styles.statIcon, styles.dealIcon]}>
                <DealBagIcon />
              </View>
              <View style={styles.statCopy}>
                <Text style={styles.statLabel}>Deals Closed</Text>
                <Text style={styles.statValue}>{deals}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!loadError && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => {
                setRefreshing(true);
                loadData();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {percent < 100 && (
          <TouchableOpacity
            style={styles.progressCard}
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={`Profile ${percent}% complete. Finish it`}
          >
            <View style={styles.progressTop}>
              <Text style={styles.progressText}>Profile {percent}% complete</Text>
              <Text style={styles.progressCta}>Finish it ›</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
          </TouchableOpacity>
        )}

        {!!activeDeal && (
          <TouchableOpacity
            style={styles.dealCard}
            onPress={onOpenDeals}
            disabled={!onOpenDeals}
            accessibilityRole="button"
            accessibilityLabel="Open My Deals"
          >
            <Text style={styles.dealLabel}>ACTIVE DEAL</Text>
            <Text style={styles.dealTitle} numberOfLines={1}>
              {String(activeDeal.title || 'Active campaign')}
            </Text>
            <Text style={styles.dealMeta} numberOfLines={1}>
              {String(activeDeal.brand_name || activeDeal.business_name || 'Brand').replace(/^@+/, '')}
              {' · '}
              {activeDeal.status === 'in_progress' ? 'In progress' : 'Starting'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Creators</Text>
        </View>

        {loading ? (
          <View style={styles.creatorRow}>
            {[0, 1, 2].map(index => (
              // Mirrors creatorCard: the same 238x262 media block plus the name
              // and handle beneath it, so the rail keeps its height when the
              // real cards arrive.
              <View key={index} style={styles.creatorSkeleton}>
                <SkeletonBlock
                  width={CARD_WIDTH}
                  height={MEDIA_HEIGHT}
                  radius={20}
                />
                <SkeletonBlock
                  width={120}
                  height={12}
                  style={styles.skeletonGap}
                />
                <SkeletonBlock
                  width={80}
                  height={10}
                  style={styles.skeletonGap}
                />
              </View>
            ))}
          </View>
        ) : !topCreators.length ? (
          creatorsError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{creatorsError}</Text>
              <TouchableOpacity
                style={styles.retry}
                onPress={() => {
                  setRefreshing(true);
                  loadData();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry top creators"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Top creators aren't available right now.
            </Text>
          )
        ) : (
          <ScrollView
            ref={railRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.creatorRow}
            // Snapping to the card stride keeps manual swipes landing on a card
            // edge, so auto-scroll never resumes from a half-scrolled position.
            snapToInterval={CARD_STRIDE}
            decelerationRate="fast"
            disableIntervalMomentum
            scrollEventThrottle={16}
            onScroll={onRailScroll}
            onTouchStart={onTouchRail}
            onScrollBeginDrag={onTouchRail}
            onScrollEndDrag={onReleaseRail}
            onMomentumScrollEnd={onReleaseRail}
          >
            {cards.map((creator, index) => {
              const name = displayName(creator);
              const uri = creatorMedia(creator);
              return (
                <View
                  style={styles.creatorCard}
                  key={creator.id || `${name}-${index}`}
                >
                  <View
                    style={[
                      styles.rank,
                      { backgroundColor: RANK_COLORS[index] },
                    ]}
                  >
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.creatorPhoto}>
                    {uri ? (
                      isVideo(creator, uri) ? (
                        <VideoPreview uri={uri} />
                      ) : (
                        <Image source={{ uri }} style={styles.creatorImage} />
                      )
                    ) : (
                      <View style={styles.creatorFallback}>
                        <Text style={styles.creatorInitial}>
                          {name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    {/* The clip autoplays, so the play badge is only a hint for stills. */}
                    {!isVideo(creator, uri) && (
                      <View style={styles.play}>
                        <Text style={styles.playText}>▶</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.creatorDetails}>
                    <View style={styles.creatorIdentity}>
                      <View style={styles.creatorAvatarSmall}>
                        {photoUrl(creator.profile_photo) ? (
                          <Image
                            source={{ uri: photoUrl(creator.profile_photo)! }}
                            style={styles.creatorAvatarImage}
                          />
                        ) : (
                          <Text style={styles.creatorAvatarInitial}>
                            {name.charAt(0)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.creatorIdentityCopy}>
                        <Text style={styles.creatorName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.creatorHandle} numberOfLines={1}>
                          @
                          {String(
                            creator.username || creator.nickname || name,
                          ).replace(/^@/, '')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.creatorMetrics}>
                      <View>
                        <Text style={styles.metricLabel}>Total Earned</Text>
                        <Text style={styles.metricValue} numberOfLines={1}>
                          {money(creator.earned)}
                        </Text>
                      </View>
                      <View style={styles.metricRule} />
                      <View style={styles.metricShrink}>
                        <Text style={styles.metricLabel}>Category</Text>
                        <Text style={styles.metricValue} numberOfLines={1}>
                          {creator.primary_category || 'Creator'}
                        </Text>
                      </View>
                      <View style={styles.metricRule} />
                      <View>
                        <Text style={styles.metricLabel}>Deals Closed</Text>
                        <Text style={styles.metricValue}>
                          {Number(creator.deliverables_completed || 0)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest —
  // matching Earnings, ActiveWork and the other tabs.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  body: {
    flex: 1,
    backgroundColor: '#F8F8FF',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { paddingBottom: scale(24) + NAV_CLEARANCE },
  header: {
    height: scale(58),
    paddingHorizontal: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the navy backdrop shows through, as on the other tabs.
    backgroundColor: 'transparent',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  // white.png is a portrait mark (1485x1856). `contain` fits by height, so
  // the box is sized to its own 0.80 ratio — a wider box would just add
  // empty space, which is why widening it alone had no visible effect.
  logo: { width: scale(120), height: scale(21) },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  bell: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: scale(14),
    height: scale(14),
    borderRadius: scale(7),
    backgroundColor: '#FF4D5E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: fontScale(8),
    lineHeight: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  avatar: {
    width: scale(39),
    height: scale(39),
    borderRadius: scale(20),
    backgroundColor: '#171A49',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#EEF0FF',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: scale(20) },
  avatarText: {
    color: '#FFF',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  hero: {
    margin: scale(16),
    padding: scale(18),
    minHeight: scale(190),
    flexDirection: 'row',
    borderRadius: scale(20),
    backgroundColor: '#F1F1FF',
    borderWidth: 1,
    borderColor: '#E8E8FC',
  },
  heroIntro: { flex: 1.05, paddingRight: scale(14) },
  metaRow: { marginTop: scale(8), flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: scale(8) },
  metaChip: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    overflow: 'hidden',
    backgroundColor: '#E4E3FF',
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4D48EF',
    textTransform: 'capitalize',
  },
  metaRating: { fontSize: fontScale(12), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#B4790B' },
  errorBox: {
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  errorText: { flex: 1, fontSize: fontScale(12), color: '#B03030' },
  retry: { minHeight: scale(44), minWidth: scale(60), alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#B03030' },
  progressCard: {
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    minHeight: scale(44),
    borderRadius: scale(14),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9E9F4',
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#11123D' },
  progressCta: { fontSize: fontScale(12), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4D48EF' },
  progressTrack: { marginTop: scale(8), height: scale(6), borderRadius: scale(3), backgroundColor: '#E9EAF3', overflow: 'hidden' },
  progressFill: { height: scale(6), borderRadius: scale(3), backgroundColor: '#4C5BF3' },
  dealCard: {
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    padding: scale(14),
    minHeight: scale(44),
    borderRadius: scale(14),
    backgroundColor: '#F1F1FF',
    borderWidth: 1,
    borderColor: '#E8E8FC',
  },
  dealLabel: { fontSize: fontScale(10), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#6658F5', letterSpacing: 0.5 },
  dealTitle: { marginTop: scale(4), fontSize: fontScale(15), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#11123D' },
  dealMeta: { marginTop: scale(3), fontSize: fontScale(12), color: '#7E829D' },
  heroDivider: {
    width: 1,
    marginVertical: scale(4),
    marginRight: scale(14),
    backgroundColor: '#DDDDF0',
  },
  greeting: {
    fontSize: fontScale(21),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#10113E',
  },
  tagline: {
    marginTop: scale(9),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#737895',
  },
  browseButton: {
    marginTop: scale(18),
    height: scale(40),
    borderRadius: scale(8),
    paddingHorizontal: scale(10),
    backgroundColor: '#5B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flexShrink lets the longer label give way before it would clip the arrow.
  browseText: {
    fontSize: fontScale(12),
    color: '#FFF',
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    flexShrink: 1,
  },
  arrow: { fontSize: fontScale(19), color: '#FFF', marginLeft: scale(6) },
  statColumn: { flex: 1, justifyContent: 'center' },
  statRow: { minHeight: scale(70), flexDirection: 'row', alignItems: 'center' },
  statIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeIcon: { backgroundColor: '#EAE8FF' },
  dealIcon: { backgroundColor: '#E4F4FF' },
  rupee: {
    color: '#6658F5',
    fontSize: fontScale(20),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  statCopy: { flex: 1, marginLeft: scale(9) },
  statLabel: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#7E829D',
  },
  statValue: {
    marginTop: scale(4),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  chevron: { fontSize: fontScale(24), color: '#8A8EA7' },
  statDivider: { height: 1, marginLeft: scale(47), backgroundColor: '#E1E2F1' },
  sectionHeader: {
    paddingHorizontal: scale(17),
    marginTop: scale(4),
    marginBottom: scale(12),
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  loading: { marginTop: scale(50) },
  emptyText: {
    marginTop: scale(8),
    marginBottom: scale(24),
    paddingHorizontal: scale(17),
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#8A8EA7',
  },
  creatorRow: { paddingHorizontal: scale(16), paddingBottom: scale(12), gap: scale(14) },
  creatorSkeleton: { width: CARD_WIDTH },
  skeletonGap: { marginTop: scale(10) },
  creatorCard: {
    width: CARD_WIDTH,
    overflow: 'hidden',
    borderRadius: scale(20),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9E9F4',
    shadowColor: '#24245A',
    shadowOpacity: 0.08,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: scale(4) },
    elevation: 3,
  },
  rank: {
    position: 'absolute',
    zIndex: 2,
    top: scale(8),
    left: scale(8),
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  rankText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#434343',
  },
  creatorPhoto: {
    height: MEDIA_HEIGHT,
    backgroundColor: '#DBDDF0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorImage: { width: '100%', height: '100%' },
  // Matches creatorPhoto's fixed height; percentages collapse here (see above).
  creatorVideo: {
    width: CARD_WIDTH,
    height: MEDIA_HEIGHT,
    backgroundColor: '#DBDDF0',
  },
  creatorFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D8DBF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorInitial: {
    fontSize: fontScale(54),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#666BE0',
  },
  play: {
    position: 'absolute',
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    backgroundColor: 'rgba(20,20,40,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { fontSize: fontScale(13), color: '#FFF', marginLeft: scale(2) },
  creatorDetails: {
    marginTop: scale(-18),
    paddingTop: scale(14),
    backgroundColor: '#FFF',
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    overflow: 'hidden',
  },
  creatorIdentity: {
    paddingHorizontal: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorAvatarSmall: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    backgroundColor: '#E7E8F8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  creatorAvatarImage: { width: '100%', height: '100%' },
  creatorAvatarInitial: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  creatorIdentityCopy: { flex: 1, marginLeft: scale(9) },
  creatorName: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  creatorHandle: {
    marginTop: scale(2),
    fontSize: fontScale(10),
    color: '#9295AA',
  },
  creatorMetrics: {
    marginTop: scale(12),
    paddingHorizontal: scale(12),
    paddingVertical: scale(13),
    borderTopWidth: 1,
    borderTopColor: '#EFEFF6',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: { fontSize: fontScale(9), color: '#A0A3B5' },
  metricValue: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  metricRule: { width: 1, backgroundColor: '#ECECF4' },
  // Three metrics share the card; a long category truncates instead of pushing.
  metricShrink: { flexShrink: 1 },
});

export default CreatorHome;
