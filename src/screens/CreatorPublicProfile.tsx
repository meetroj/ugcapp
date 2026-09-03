/**
 * A creator's public profile, as a brand sees it — the native version of the
 * website's CreatorProfileModal. Reached from the quick-preview sheet on the
 * Creators tab ("View full details"); WebShell hides the bottom nav on this
 * route, so the header's back arrow is the single way out.
 *
 * Layout mirrors the web page: cover banner with the avatar overlapping it,
 * name + ID line, the deliverables/languages stat row, a Category / Price /
 * Delivery highlight strip, then Videos, Details and Reviews stacked under a
 * tab bar that scrolls to each section.
 *
 * Data comes from GET /api/profile/:id, which returns the backend's *redacted*
 * projection to anyone who isn't the user or an admin: the brand gets age,
 * city, skills, rate card and recording setup, but never the creator's phone,
 * address, bank details or KYC numbers. The directory record the Creators tab
 * already loaded is passed in as `seed` so the header renders immediately
 * instead of flashing empty while the request is in flight.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Text } from '../components/Text';
import { WebView } from 'react-native-webview';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  BACKEND_URL,
  getCreatorReviews,
  getPublicProfile,
  type CreatorReview,
  type DirectoryCreator,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  /** The creator whose profile to load. */
  creatorId: string;
  /**
   * The directory record tapped on the Creators tab, when there is one. It
   * only seeds the header while GET /api/profile/:id is in flight; a screen
   * that reaches here with just an id (Bids, Campaign detail) passes null and
   * the header fills in when the fetch lands.
   */
  seed?: DirectoryCreator | null;
  onBack: () => void;
  onMessage: () => void;
  /** Opens the post-a-brief flow with this creator in mind. */
  onSendBrief: () => void;
};

type Tab = 'videos' | 'details' | 'reviews';

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

const isVideo = (uri: string | null) =>
  !!uri &&
  (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(uri) || /\/video\/upload\//i.test(uri));

/** ₹ with Indian digit grouping, matching the web page's `inr()`. */
const inr = (value: number) => `₹${Number(value).toLocaleString('en-IN')}`;

/**
 * Portfolio items are stored either as a bare URL string or as an object whose
 * URL sits under one of several keys. The web view resolves them in this exact
 * order — picking a different order there made clips that played for the
 * creator resolve to a dead link on the brand's side.
 */
const itemUrl = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return /^https?:|^\//.test(item) ? item : '';
  return (
    item.url ||
    item.video ||
    item.videoUrl ||
    item.link ||
    item.original_url ||
    (Array.isArray(item.urls) && item.urls[0]) ||
    ''
  );
};

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
};

/** Same muted, looping inline player the Creators tab tiles use. */
const reelHtml = (src: string) => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#0E1330;overflow:hidden}
video{width:100vw;height:100vh;object-fit:cover;display:block}</style>
</head><body>
<video src="${src}" autoplay muted loop playsinline webkit-playsinline
       preload="auto" disableremoteplayback></video>
<script>
  var v = document.querySelector('video');
  v.muted = true;
  var play = function () { var p = v.play(); if (p) { p.catch(function () {}); } };
  play();
  v.addEventListener('canplay', play);
</script></body></html>`;

function Icon({ name, color = '#7C819C', size = 18 }: {
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
      {name === 'back' && <Path d="m14.5 6-5.5 6 5.5 6" {...line} />}
      {name === 'user' && (
        <>
          <Circle cx="12" cy="8.5" r="3.6" {...line} />
          <Path d="M4.8 20c.9-3.4 3.8-5.2 7.2-5.2s6.3 1.8 7.2 5.2" {...line} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21Z" {...line} />
          <Circle cx="12" cy="10.6" r="2.4" {...line} />
        </>
      )}
      {name === 'sparkle' && (
        <>
          <Path d="m12 3.5 1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9L12 3.5Z" {...line} />
          <Path d="M18.5 16.5 19.4 19l2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.5Z" {...line} />
        </>
      )}
      {name === 'clapper' && (
        <>
          <Path d="M3.5 9.5h17v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-10Z" {...line} />
          <Path d="m3.9 9.5 1.2-4.3 15.4 2.3-.6 2" {...line} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" {...line} />
          <Path d="M16.5 13.5h1.5" {...line} />
        </>
      )}
      {name === 'star' && (
        <Path
          d="m12 4 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8L12 4Z"
          {...line}
          fill={color === '#F5B301' ? color : 'none'}
        />
      )}
      {name === 'chat' && (
        <Path d="M20.5 12.2c0 3.9-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 20.5l1.4-4A6.6 6.6 0 0 1 3.5 12c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" {...line} />
      )}
      {name === 'verified' && (
        <>
          <Path
            d="m12 3.2 2.2 1.6 2.7-.1.8 2.6 2.2 1.6-1 2.5 1 2.5-2.2 1.6-.8 2.6-2.7-.1L12 19.6l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6 1-2.5-1-2.5 2.2-1.6.8-2.6 2.7.1Z"
            {...line}
          />
          <Path d="m9.3 11.9 1.9 1.9 3.5-3.7" {...line} />
        </>
      )}
      {name === 'bookmark' && <Path d="M6.5 3.8h11v16.4l-5.5-4-5.5 4V3.8Z" {...line} />}
      {name === 'camera' && (
        <>
          <Path d="M3.5 8.8h3.2l1.4-2.3h7.8l1.4 2.3h3.2v10.4h-17V8.8Z" {...line} />
          <Circle cx="12" cy="13.8" r="3.1" {...line} />
        </>
      )}
      {name === 'play' && <Path d="M8 5.5v13l11-6.5-11-6.5Z" fill={color} />}
    </Svg>
  );
}

/** A "LABEL / value" pair inside a Details card. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

/** A labelled row of pills (Skills, Languages, Core setup, …). */
function ChipField({ label, values }: { label: string; values: string[] }) {
  return (
    <View style={styles.chipField}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.chipRow}>
        {values.map(value => (
          <View key={value} style={styles.chip}>
            <Text style={styles.chipText}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One Details card: icon + title, then its fields. */
function DetailCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon name={icon} color="#4C4DD6" size={15} />
        </View>
        <Text style={styles.cardTitle}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

/** One portfolio clip with its category / price / delivery caption. */
function VideoCard({
  item,
  fallbackCategory,
  fallbackPrice,
  fallbackDelivery,
}: {
  item: { url: string; category: string; price: string; delivery: string };
  fallbackCategory: string;
  fallbackPrice: string;
  fallbackDelivery: string;
}) {
  const [failed, setFailed] = useState(false);
  const price = String(item.price || '').replace(/[^0-9]/g, '');
  const days = String(item.delivery || '').replace(/[^0-9]/g, '');

  return (
    <View style={styles.videoCard}>
      <View style={styles.videoFrame}>
        {failed || !item.url ? (
          // Matches the web's "Media unavailable" placeholder rather than a
          // black rectangle, so a dead link reads as missing, not broken.
          <View style={styles.videoMissing}>
            <Icon name="camera" color="#B9BDD4" size={22} />
            <Text style={styles.videoMissingText}>Media unavailable</Text>
          </View>
        ) : isVideo(item.url) ? (
          <>
            <WebView
              source={{ html: reelHtml(item.url) }}
              style={styles.videoMedia}
              scrollEnabled={false}
              pointerEvents="none"
              bounces={false}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled={false}
              androidLayerType="hardware"
              onError={() => setFailed(true)}
            />
            <View style={styles.playPill}>
              <Icon name="play" color="#FFFFFF" size={11} />
            </View>
          </>
        ) : (
          <Image
            source={{ uri: item.url }}
            style={styles.videoMedia}
            onError={() => setFailed(true)}
          />
        )}
      </View>

      <View style={styles.videoTag}>
        <Text style={styles.videoTagText} numberOfLines={1}>
          {item.category || fallbackCategory}
        </Text>
      </View>
      <View style={styles.videoMeta}>
        <View style={styles.videoMetaCol}>
          <Text style={styles.fieldLabel}>PRICE</Text>
          <Text style={styles.videoMetaValue}>
            {price ? inr(Number(price)) : fallbackPrice}
          </Text>
        </View>
        <View style={styles.videoMetaCol}>
          <Text style={styles.fieldLabel}>DELIVERED IN</Text>
          <Text style={styles.videoMetaValue}>
            {days ? `${days} day${Number(days) > 1 ? 's' : ''}` : fallbackDelivery}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CreatorPublicProfile({
  token,
  creatorId,
  seed,
  onBack,
  onMessage,
  onSendBrief,
}: Props) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [reviews, setReviews] = useState<CreatorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('videos');

  const scrollRef = useRef<ScrollViewInstance>(null);
  // Section offsets, measured on layout so a tab tap can scroll to one.
  const offsets = useRef<Record<Tab, number>>({ videos: 0, details: 0, reviews: 0 });
  // Set while a tab tap is animating, so the scroll handler doesn't fight it.
  const locked = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // The profile drives the page; reviews only fill their own section, so a
    // failure there must not blank the rest.
    getPublicProfile(token, creatorId)
      .then(result => {
        if (alive) setData(result as Record<string, any>);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    getCreatorReviews(token, creatorId)
      .then(list => {
        if (alive) setReviews(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [creatorId, token]);

  // The nested `profile` blob wins, but same-named keys stored at the user root
  // are used as a fallback so older records still render.
  const p: Record<string, any> = useMemo(
    () => ({ ...(data || {}), ...((data?.profile as object) || {}) }),
    [data],
  );

  const name = text(
    p.nickname || data?.nickname || seed?.name || seed?.nickname,
    'Creator',
  )
    .replace(/^@+/, '')
    .split(/\s+/)[0];
  const publicId = text(
    data?.public_creator_id || seed?.public_creator_id,
    creatorId.slice(0, 12),
  );
  const city = text(p.city || p.location);
  const country = text(p.country, 'India');
  const where = [city, country].filter(Boolean).join(', ');
  const avatar = photoUrl(
    data?.profile_photo || p.profile_photo || p.profile_picture || seed?.profile_photo,
  );
  const banner = photoUrl(data?.banner || p.banner);
  const verified = Boolean(data?.kyc_verified ?? seed?.kyc_verified);

  const skills = asList(p.skills || p.tags);
  const languages = asList(p.languages || p.content_languages);
  const deliverables = Number(
    data?.deliverables_completed ?? seed?.deliverables_completed ?? 0,
  );

  const rateCard: Record<string, any> = (p.rate_card as object) || {};
  const category = text(
    p.niche || p.category || p.primary_category || seed?.primary_category || skills[0],
    'General',
  ).replace(/_/g, ' ');

  const clips = useMemo(() => {
    const source = Array.isArray(data?.portfolio)
      ? data!.portfolio
      : Array.isArray(seed?.portfolio)
      ? seed!.portfolio
      : [];
    return (source as any[])
      .map(item => {
        const url = itemUrl(item);
        const meta = typeof item === 'string' ? ({} as any) : item;
        return {
          url: photoUrl(url) || '',
          category: text(meta.category),
          price: text(meta.price),
          delivery: text(meta.delivery),
        };
      })
      .filter(clip => clip.url && !clip.url.startsWith('blob:'));
  }, [data, seed]);

  // Price is the creator's OWN configured rate — never inferred from a clip's
  // price, which would quote a number the brief wouldn't actually charge.
  const priceDigits = String(
    rateCard.expected_payout || p.expectedPayout || seed?.price_per_video || '',
  ).replace(/[^0-9]/g, '');
  const price = priceDigits
    ? inr(Number(priceDigits))
    : text(data?.budget_range || p.budget_range, 'On Request');

  // Delivery: the creator's own typical-days field, else the slowest clip. The
  // old hardcoded 1 made every profile claim "1 Day".
  const clipDays = clips
    .map(clip => Number(clip.delivery.replace(/[^0-9]/g, '')))
    .filter(n => n > 0);
  const days =
    Number(p.delivery_days || p.avg_delivery_days || rateCard.delivery_days || 0) ||
    (clipDays.length ? Math.max(...clipDays) : 1);
  const delivery = `${days} day${days > 1 ? 's' : ''}`;

  const ratingCount = reviews.length;
  const avgRating = ratingCount
    ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / ratingCount
    : 0;

  const social = Object.entries((p.social_links as object) || {}).filter(
    ([, url]) => typeof url === 'string' && url.trim(),
  ) as [string, string][];

  const goTab = useCallback((next: Tab) => {
    setTab(next);
    locked.current = true;
    scrollRef.current?.scrollTo({ y: offsets.current[next], animated: true });
    setTimeout(() => {
      locked.current = false;
    }, 650);
  }, []);

  // Scroll-spy: highlight whichever section the reader is actually on.
  const onScroll = useCallback((y: number) => {
    if (locked.current) return;
    const { details, reviews: reviewsTop } = offsets.current;
    // +120 so a section counts as "reached" once it is properly on screen
    // rather than the instant its first pixel appears.
    const at = y + scale(120);
    setTab(at >= reviewsTop ? 'reviews' : at >= details ? 'details' : 'videos');
  }, []);

  // Cards are dropped entirely when they have nothing to show, so the Details
  // section never renders a wall of empty headings.
  const basicRows = [
    ['Age', text(p.age && String(p.age))],
    ['Gender', text(p.gender)],
    ['Body Type', text(p.bodyType || p.body_type)],
    ['Skin Tone', text(p.skinTone || p.skin_tone)],
    ['Primary Category', category],
  ].filter(([, value]) => !!value) as [string, string][];

  const locationRows = [
    ['Country', country],
    ['State', text(p.state)],
    ['City', city],
  ].filter(([, value]) => !!value) as [string, string][];

  const setupChips = [
    ['Core Setup', asList(p.coreSetup || p.core_setup)],
    ['Who Appears', asList(p.appearIn || p.appear_in)],
    ['Topics Avoided', asList(p.topics)],
  ].filter(([, values]) => (values as string[]).length) as [string, string[]][];
  const setupRows = [
    ['Can Bring', text(p.bring)],
    ['Weekly Availability', text(p.weekly)],
  ].filter(([, value]) => !!value) as [string, string][];

  const pricingRows = [
    ['Expected Payout', text(rateCard.expected_payout || p.expectedPayout)],
    ['Payout Period', text(rateCard.payout_period || p.payoutPeriod)],
    ['Budget Range', text(data?.budget_range || p.budget_range)],
  ].filter(([, value]) => !!value) as [string, string][];

  const hasDetails =
    basicRows.length ||
    locationRows.length ||
    skills.length ||
    languages.length ||
    setupChips.length ||
    setupRows.length ||
    pricingRows.length ||
    !!text(p.bio);

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={event => onScroll(event.nativeEvent.contentOffset.y)}
      >
        {/* Cover banner with the back arrow floating on it. */}
        <View style={styles.banner}>
          {banner ? (
            <Image source={{ uri: banner }} style={styles.bannerImg} />
          ) : (
            <View style={styles.bannerFallback} />
          )}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="back" color="#15163F" size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {/* Avatar overlaps the banner, as on the web page. */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {verified && (
                  <View style={styles.verifiedPill}>
                    <Icon name="verified" color="#1FA971" size={13} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.idLine} numberOfLines={1}>
                ID: {publicId}
                {where ? ` · ${where}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.briefBtn}
              onPress={onSendBrief}
              accessibilityRole="button"
            >
              <Text style={styles.briefText}>Send a Brief</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statText}>
              <Text style={styles.statNum}>{deliverables}</Text> deliverables
            </Text>
            <Text style={styles.statText}>
              <Text style={styles.statNum}>{languages.length}</Text> languages
            </Text>
          </View>

          {/* Category / Price / Delivery highlight strip. */}
          <View style={styles.highlights}>
            <View style={styles.highlight}>
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <Text style={styles.highlightValue} numberOfLines={1}>
                {category}
              </Text>
            </View>
            <View style={styles.highlight}>
              <Text style={styles.fieldLabel}>PRICE / VIDEO</Text>
              <Text style={styles.highlightValue} numberOfLines={1}>
                {price}
              </Text>
            </View>
            <View style={styles.highlight}>
              <Text style={styles.fieldLabel}>DELIVERY</Text>
              <Text style={styles.highlightValue} numberOfLines={1}>
                {delivery}
              </Text>
            </View>
          </View>

          {/* Tab bar — scrolls to a section rather than swapping the content,
              matching the web page's stacked layout + scroll-spy. */}
          <View style={styles.tabs}>
            {(['videos', 'details', 'reviews'] as Tab[]).map(key => (
              <TouchableOpacity
                key={key}
                style={[styles.tab, tab === key && styles.tabOn]}
                onPress={() => goTab(key)}
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
                  {key === 'videos'
                    ? 'Videos'
                    : key === 'details'
                    ? 'Details'
                    : `Reviews${ratingCount ? ` (${ratingCount})` : ''}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading && !data ? (
            <ActivityIndicator style={styles.loading} color="#4C4DD6" />
          ) : (
            <>
              {/* Videos */}
              <View
                onLayout={event => {
                  offsets.current.videos = event.nativeEvent.layout.y;
                }}
              >
                {clips.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.videoStrip}
                  >
                    {clips.map((clip, index) => (
                      <VideoCard
                        key={`${clip.url}-${index}`}
                        item={clip}
                        fallbackCategory={category}
                        fallbackPrice={price}
                        fallbackDelivery={delivery}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.emptyBox}>
                    <Icon name="camera" color="#B9BDD4" size={22} />
                    <Text style={styles.emptyTitle}>No videos yet</Text>
                    <Text style={styles.emptyText}>
                      This creator hasn't uploaded any work.
                    </Text>
                  </View>
                )}
              </View>

              {/* Details */}
              <View
                onLayout={event => {
                  offsets.current.details = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.sectionTitle}>Details</Text>
                {hasDetails ? (
                  <>
                    {(basicRows.length || !!text(p.bio)) && (
                      <DetailCard icon="user" title="Basic Information">
                        {!!text(p.bio) && (
                          <Text style={styles.bio}>{text(p.bio)}</Text>
                        )}
                        <View style={styles.fieldGrid}>
                          {basicRows.map(([label, value]) => (
                            <Field key={label} label={label} value={value} />
                          ))}
                        </View>
                      </DetailCard>
                    )}

                    {!!locationRows.length && (
                      <DetailCard icon="pin" title="Location">
                        <View style={styles.fieldGrid}>
                          {locationRows.map(([label, value]) => (
                            <Field key={label} label={label} value={value} />
                          ))}
                        </View>
                      </DetailCard>
                    )}

                    {(skills.length || languages.length || social.length) && (
                      <DetailCard icon="sparkle" title="Skills & Languages">
                        {!!skills.length && (
                          <ChipField label="Skills" values={skills} />
                        )}
                        {!!languages.length && (
                          <ChipField label="Languages" values={languages} />
                        )}
                        {social.map(([platform, url]) => (
                          <TouchableOpacity
                            key={platform}
                            style={styles.linkRow}
                            onPress={() => Linking.openURL(
                              /^https?:\/\//i.test(url) ? url : `https://${url}`,
                            ).catch(() => {})}
                            accessibilityRole="link"
                          >
                            <Text style={styles.fieldLabel}>
                              {platform.toUpperCase()}
                            </Text>
                            <Text style={styles.link} numberOfLines={1}>
                              {url}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </DetailCard>
                    )}

                    {(setupChips.length || setupRows.length) && (
                      <DetailCard icon="clapper" title="Recording Setup">
                        {setupChips.map(([label, values]) => (
                          <ChipField key={label} label={label} values={values} />
                        ))}
                        {!!setupRows.length && (
                          <View style={styles.fieldGrid}>
                            {setupRows.map(([label, value]) => (
                              <Field key={label} label={label} value={value} />
                            ))}
                          </View>
                        )}
                      </DetailCard>
                    )}

                    {!!pricingRows.length && (
                      <DetailCard icon="wallet" title="Pricing">
                        <View style={styles.fieldGrid}>
                          {pricingRows.map(([label, value]) => (
                            <Field key={label} label={label} value={value} />
                          ))}
                        </View>
                      </DetailCard>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No details yet</Text>
                    <Text style={styles.emptyText}>
                      This creator hasn't completed their profile.
                    </Text>
                  </View>
                )}
              </View>

              {/* Reviews */}
              <View
                onLayout={event => {
                  offsets.current.reviews = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.sectionTitle}>
                  Reviews{ratingCount ? ` (${ratingCount})` : ''}
                </Text>
                {ratingCount ? (
                  <>
                    <View style={styles.ratingRow}>
                      <Icon name="star" color="#F5B301" size={16} />
                      <Text style={styles.ratingValue}>
                        {avgRating.toFixed(1)}
                      </Text>
                      <Text style={styles.ratingCount}>
                        from {ratingCount} review{ratingCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                    {reviews.map((review, index) => (
                      <View key={index} style={styles.review}>
                        <View style={styles.reviewStars}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <Icon
                              key={star}
                              name="star"
                              color={
                                star <= (Number(review.rating) || 0)
                                  ? '#F5B301'
                                  : '#DCDEEC'
                              }
                              size={13}
                            />
                          ))}
                        </View>
                        {!!text(review.review) && (
                          <Text style={styles.reviewText}>
                            {text(review.review)}
                          </Text>
                        )}
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={styles.emptyBox}>
                    <Icon name="star" color="#B9BDD4" size={22} />
                    <Text style={styles.emptyTitle}>No reviews yet</Text>
                    <Text style={styles.emptyText}>
                      Reviews from brands appear here once a deal is completed.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Send Message stays pinned; this screen hides the bottom nav, so it is
          the only bar competing for the bottom edge. */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.messageBtn}
          onPress={onMessage}
          accessibilityRole="button"
        >
          <Icon name="chat" color="#FFFFFF" size={16} />
          <Text style={styles.messageText}>Send Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const AVATAR = scale(88);
const VIDEO_WIDTH = scale(150);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  content: { paddingBottom: scale(24) },

  banner: { height: scale(170), backgroundColor: '#DDE2F2' },
  bannerImg: { width: '100%', height: '100%' },
  bannerFallback: { flex: 1, backgroundColor: '#C9D2EC' },
  backBtn: {
    position: 'absolute',
    top: scale(44),
    left: scale(16),
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { paddingHorizontal: scale(16) },
  // Pulls the avatar up over the banner.
  avatarWrap: {
    marginTop: -AVATAR / 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#4C4DD6',
    borderWidth: scale(4),
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: fontScale(34),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  saveBtn: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    borderWidth: 1,
    borderColor: '#E7E9F4',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleRow: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  titleCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: scale(7) },
  name: {
    fontSize: fontScale(24),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    flexShrink: 1,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#E9F8F0',
  },
  verifiedText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1FA971',
  },
  idLine: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    color: '#858AA3',
  },
  briefBtn: {
    height: scale(38),
    paddingHorizontal: scale(16),
    borderRadius: scale(19),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefText: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  statRow: { marginTop: scale(14), flexDirection: 'row', gap: scale(18) },
  statText: { fontSize: fontScale(13), color: '#858AA3' },
  statNum: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },

  highlights: {
    marginTop: scale(16),
    flexDirection: 'row',
    borderRadius: scale(14),
    backgroundColor: '#F4F5FC',
    padding: scale(14),
    gap: scale(10),
  },
  highlight: { flex: 1, minWidth: 0 },
  highlightValue: {
    marginTop: scale(5),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  tabs: {
    marginTop: scale(22),
    flexDirection: 'row',
    gap: scale(20),
    borderBottomWidth: 1,
    borderBottomColor: '#EDEEF6',
  },
  tab: { paddingBottom: scale(9), borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: '#4C4DD6' },
  tabText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#858AA3',
  },
  tabTextOn: { color: '#15163F' },

  loading: { marginTop: scale(40) },

  videoStrip: { paddingTop: scale(18), paddingRight: scale(16), gap: scale(12) },
  videoCard: { width: VIDEO_WIDTH },
  videoFrame: {
    width: VIDEO_WIDTH,
    aspectRatio: 9 / 16,
    borderRadius: scale(14),
    overflow: 'hidden',
    backgroundColor: '#EEF0F9',
  },
  videoMedia: { flex: 1, backgroundColor: '#0E1330' },
  videoMissing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    backgroundColor: '#EEF0F9',
  },
  videoMissingText: { fontSize: fontScale(11), color: '#9498B0' },
  playPill: {
    position: 'absolute',
    left: scale(8),
    bottom: scale(8),
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,16,42,0.55)',
  },
  videoTag: {
    alignSelf: 'flex-start',
    marginTop: scale(9),
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#EFEFFD',
  },
  videoTagText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  videoMeta: { marginTop: scale(9), flexDirection: 'row', gap: scale(12) },
  videoMetaCol: { flex: 1, minWidth: 0 },
  videoMetaValue: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },

  sectionTitle: {
    marginTop: scale(26),
    marginBottom: scale(12),
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  card: {
    marginBottom: scale(12),
    padding: scale(14),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#EDEEF6',
    backgroundColor: '#FFFFFF',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
    marginBottom: scale(12),
  },
  cardIcon: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(9),
    backgroundColor: '#EFEFFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
    letterSpacing: 0.5,
  },
  bio: {
    marginBottom: scale(12),
    fontSize: fontScale(13),
    lineHeight: fontScale(20),
    color: '#5C6079',
  },
  // Two columns, matching the web's paired AGE / GENDER layout.
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: scale(14) },
  field: { width: '50%', paddingRight: scale(8) },
  fieldLabel: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#9498B0',
    letterSpacing: 0.5,
  },
  fieldValue: {
    marginTop: scale(4),
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  chipField: { marginBottom: scale(12) },
  chipRow: {
    marginTop: scale(7),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(7),
  },
  chip: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    borderRadius: scale(9),
    backgroundColor: '#EFEFFD',
  },
  chipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  linkRow: { marginTop: scale(4) },
  link: {
    marginTop: scale(3),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: scale(12),
  },
  ratingValue: {
    fontSize: fontScale(17),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  ratingCount: { fontSize: fontScale(12), color: '#858AA3' },
  review: {
    marginBottom: scale(10),
    padding: scale(14),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#EDEEF6',
    backgroundColor: '#FFFFFF',
  },
  reviewStars: { flexDirection: 'row', gap: scale(2) },
  reviewText: {
    marginTop: scale(7),
    fontSize: fontScale(13),
    lineHeight: fontScale(20),
    color: '#5C6079',
  },

  emptyBox: {
    alignItems: 'center',
    gap: scale(6),
    paddingVertical: scale(30),
    paddingHorizontal: scale(18),
    borderRadius: scale(14),
    backgroundColor: '#F7F7FD',
  },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    fontSize: fontScale(12),
    color: '#858AA3',
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: scale(16),
    paddingTop: scale(10),
    paddingBottom: scale(16),
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EDEEF6',
  },
  messageBtn: {
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: '#15163F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
  },
  messageText: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default CreatorPublicProfile;
