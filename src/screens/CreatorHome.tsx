import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
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
import Svg, { Path, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { SkeletonBlock } from '../components/Skeleton';
import {
  BACKEND_URL,
  getCampaigns,
  getMe,
  getTopEarners,
  getUnreadCount,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

// Mirrors GET /api/business/creator-directory in the live Node backend
// (ugc-b/Backend/server.js). That route returns a FLAT array of these.
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

// Portfolio previews are real .mp4 files served from the backend's /uploads.
// The app has no native video package, so the clip is played inside the WebView
// that already ships with the app — this needs no extra native rebuild.
// `muted` + `playsinline` are required for autoplay to be allowed.
// Origin of the clip itself, so the inline page and the video share a scheme.
const videoOrigin = (uri: string) => {
  const match = /^(https?:\/\/[^/]+)/i.exec(uri);
  return match ? match[1] : BACKEND_URL;
};

function VideoPreview({ uri }: { uri: string }) {
  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#DBDDF0;overflow:hidden}
video{width:100vw;height:100vh;object-fit:cover;display:block}</style>
</head><body>
<video src="${uri}" autoplay muted loop playsinline webkit-playsinline
       preload="auto" disableremoteplayback></video>
<script>
  // Android blocks autoplay until the element is explicitly told to play, and
  // silently ignores the attribute when the WebView had no user gesture.
  var v = document.querySelector('video');
  v.muted = true;
  var go = function () { var p = v.play(); if (p) { p.catch(function () {}); } };
  go();
  document.addEventListener('visibilitychange', go);
  v.addEventListener('canplay', go);
</script>
</body></html>`;

  return (
    <WebView
      // `baseUrl` gives the inline document a real origin (a null origin makes
      // Android refuse the remote .mp4). It must match the video's scheme:
      // BACKEND_URL is http://localhost, and an http page loading an https
      // video is mixed content, which Android blocks -> empty src.
      source={{ html, baseUrl: videoOrigin(uri) }}
      // An explicit pixel size is required: a percentage-sized WebView collapses
      // to zero height inside the centered parent, so nothing would render.
      style={styles.creatorVideo}
      scrollEnabled={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo={false}
      // Lets the http(s) video load from the inline document.
      mixedContentMode="always"
      javaScriptEnabled
      domStorageEnabled
      androidLayerType="hardware"
    />
  );
}

// Card + media dimensions. The WebView needs these as real numbers (not '100%'),
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
}: Props) {
  const [profile, setProfile] = useState<AuthUser>(session);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [completedDeals, setCompletedDeals] = useState(0);
  const [loading, setLoading] = useState(true);
  // Real unread-notification count for the header bell (was hardcoded to 1).
  const [notifications, setNotifications] = useState(0);

  useEffect(() => {
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
    ]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        setProfile(results[0].value as AuthUser);
      }
      if (results[1].status === 'fulfilled') {
        setCompletedDeals(results[1].value.length);
      }
      if (results[2].status === 'fulfilled') {
        // Top-earners uses different field names than the directory did, so
        // normalise here and the card markup below stays untouched.
        setCreators(
          results[2].value.slice(0, TOP_N).map((earner, index) => ({
            id: String(earner.name || index),
            name: earner.name,
            primary_category: earner.category,
            deliverables_completed: earner.deals,
            // The showreel is a Cloudinary .mp4; VideoPreview handles it and
            // isVideo() detects it from the /video/upload/ path.
            portfolio_preview: earner.video_url,
          })) as Creator[],
        );
      }
      setLoading(false);
    });

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

  const earnings = profile.total_earned || profile.balance || 0;
  const deals = Number(profile.completed_deals || completedDeals || 0);

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
      >
        <View style={styles.hero}>
          <View style={styles.heroIntro}>
            <Text style={styles.greeting}>Hi, {displayName(profile)}</Text>
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
          <Text style={styles.emptyText}>
            Top creators aren't available right now.
          </Text>
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
});

export default CreatorHome;
