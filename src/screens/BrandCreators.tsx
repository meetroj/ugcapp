import { reconcileDirectory, visibleCreatorRow, type RowLayout } from '../creatorDirectoryPerformance';
import { useLiveEffect } from "../liveUpdates";
/**
 * Brand creator directory. Rows are virtualized and swipeable; no JS-driven marquee.
 * One visible preview decoder is mounted across the whole screen. Original uploads
 * are loaded only when explicitly requested, and live data refreshes keep rows mounted.
 */
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';

import Svg, { Circle, Path } from 'react-native-svg';
import Video, { ViewType } from 'react-native-video';
import AppHeader from '../components/AppHeader';
import BottomSheet from '../components/BottomSheet';
import { SkeletonReelRow } from '../components/Skeleton';
import { BACKEND_URL, NetworkError, getCreatorDirectory, getSavedCreators, saveCreator, unsaveCreator } from '../api';
import { ToastBar, useToast } from '../components/Toast';
import { clipKey, playableVideoUrl, previewOf } from '../mediaPreview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
  /** Unread chat count for the header badge (same source as the other tabs). */
  unread?: number;
  /**
   * Opens the full-screen public profile. The directory record is handed over
   * rather than an id: this tab already loaded every field that page shows, so
   * passing it through saves a refetch.
   */
  onOpenCreator?: (creator: Creator) => void;
};

type Creator = Record<string, any> & { id: string };

// Every category a creator picked (the directory's `categories`, else their first),
// lowercased - the same rule the website's Browse Creators filter uses.
export const categoriesOf = (creator: Creator): string[] =>
  (Array.isArray(creator.categories) && creator.categories.length ? creator.categories : [creator.primary_category])
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
const categoryLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

/**
 * Price text, same rule as the website card and quick preview (priceTextOf in
 * pages/BrandCreators.js). The directory API sends the creator's rate as
 * `budget_range` (server.py creator_directory_public_view); it never sends
 * price_per_video.
 */
export const priceTextOf = (creator: Creator): string => {
  const raw = String(
    creator.budget_range ||
      creator.price ||
      creator.rate ||
      creator.expected_payout ||
      (creator.rate_card || {}).expected_payout ||
      '',
  ).trim();
  if (raw) {
    // A bare numeric range ("1500-3000") still reads as money.
    const range = /^(\d[\d,]*)\s*[-\u2013]\s*(\d[\d,]*)$/.exec(raw);
    if (range) {
      const money = (digits: string) => Number(digits.replace(/,/g, '')).toLocaleString('en-IN');
      return `Rs. ${money(range[1])} - ${money(range[2])} / video`;
    }
    if (/[a-zA-Z\u20B9]/.test(raw) || raw.includes('-')) return raw;
    const num = raw.replace(/[^0-9]/g, '');
    if (num) return `Rs. ${Number(num).toLocaleString('en-IN')} / video`;
  }
  // No real rate set by the creator: don't fabricate a price.
  return 'Rate on request';
};

/** "★ 4.5 (12)" from the API's `avg_rating` + `review_count`, else "New". */
export const ratingText = (creator: Creator): string => {
  const rating = Number(creator.avg_rating ?? creator.rating);
  const count = Number(creator.review_count) || 0;
  return rating > 0 ? `\u2605 ${rating.toFixed(1)}${count ? ` (${count})` : ''}` : 'New';
};

/** Location shown on the preview: the API's `city_tier`, else region, else India. */
export const locationOf = (creator: Creator): string =>
  text(creator.city_tier) || text(creator.location_region) || 'India';

// One decoder for the entire directory, mounted only in the vertically visible row.
const PREVIEW_BUFFER = {
  minBufferMs: 1000, maxBufferMs: 3000,
  bufferForPlaybackMs: 350, bufferForPlaybackAfterRebufferMs: 700,
};
const ROW_PADDING = scale(16);

// Tile geometry. Roughly 42% of the screen puts two full tiles plus a sliver
// of the third on screen, which reads as a scrollable row rather than a grid.
const GRID_GAP = scale(12);
// Short edge, so an app opened in landscape does not get 350pt-wide, 620pt-tall tiles.
const TILE_WIDTH = Math.round(Math.min(Dimensions.get('window').width, Dimensions.get('window').height) * 0.42);
// 9:16, matching the reel format the tiles play.
const TILE_HEIGHT = Math.round((TILE_WIDTH * 16) / 9);
// Name + category/rate lines under each tile.
const FOOTER_HEIGHT = scale(46);
// One tile plus its gap — the distance the row travels per creator, and the
// width the drift wraps on.
const TILE_STRIDE = TILE_WIDTH + GRID_GAP;

// Playback resumes only after a gesture settles; no per-frame JS scroll commands.
const SETTLE_MS = 200;

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

// Portfolio previews are real files served from the backend's /uploads and are
// frequently .mp4, so the tile checks this before choosing a poster image.
const isVideo = (uri: string | null) =>
  !!uri &&
  !/\.(jpe?g|png|gif|webp|avif|svg|bmp|heic)(?:[?#]|$)/i.test(uri) &&
  (/\.(mp4|mov|webm|m4v|avi|mkv|3gp)(?:[?#]|$)/i.test(uri) ||
    /\/video\/upload\//i.test(uri));

const creatorVideoUrl = (creator: Creator): string | null => {
  const explicit = text(creator.portfolio_video);
  if (explicit) return explicit;
  if (isVideo(creator.portfolio_preview || null)) return creator.portfolio_preview || null;
  const portfolio = Array.isArray(creator.portfolio) ? creator.portfolio : [];
  for (const item of portfolio) {
    const url =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
        ? text(
            (item as Record<string, unknown>).video_url ||
              (item as Record<string, unknown>).videoUrl ||
              (item as Record<string, unknown>).link ||
              (item as Record<string, unknown>).original_url ||
              (item as Record<string, unknown>).url,
          )
        : '';
    if (isVideo(url)) return url;
  }
  return null;
};

// The same clip can arrive under two URLs (cloudinary + bucket copy): keep one.
const uniqueClips = (urls: string[]): string[] => {
  const seen = new Set<string>();
  return urls.filter(url => {
    const key = clipKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const cloudinaryVideoPoster = (uri: string | null): string => {
  if (!uri) return '';
  const match = uri.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i,
  );
  if (!match) return '';
  const rest = match[2].replace(/\.(mp4|mov|webm|m4v|avi|mkv|3gp)(\?.*)?$/i, '.jpg');
  return `${match[1]}so_0/${rest}`;
};

// A STILL poster frame for a video, so a list of dozens of creators renders as
// cheap cached <Image>s instead of dozens of live players. Mounting a real
// react-native-video (ExoPlayer) per tile is what froze the phone / ANR'd the
// app: each instance holds a decoder + surface, and this screen duplicates its
// rows for the marquee, so it could mount 40-80 players at once.
//
// Cloudinary can render a JPG frame from any video URL — insert `so_0` (start
// offset 0) and swap the extension to .jpg. For non-Cloudinary videos there is
// no cheap frame, so we return '' and the caller shows a neutral placeholder;
// real playback still happens on the full profile / deal room when tapped.
const videoPoster = (uri: string | null): string => {
  if (!uri) return '';
  if (!isVideo(uri)) return uri; // already an image
  const m = uri.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i);
  if (m) {
    const rest = m[2].replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
    return `${m[1]}so_0/${rest}`;
  }
  // Our own bucket keeps a poster still next to each preview clip.
  return previewOf(uri)?.poster ?? '';
};

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
      {name === 'verified' && (
        <>
          <Path
            d="m12 3.2 2.2 1.6 2.7-.1.8 2.6 2.2 1.6-1 2.5 1 2.5-2.2 1.6-.8 2.6-2.7-.1L12 19.6l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6 1-2.5-1-2.5 2.2-1.6.8-2.6 2.7.1Z"
            {...line}
          />
          <Path d="m9.3 11.9 1.9 1.9 3.5-3.7" {...line} />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
      {name === 'tag' && (
        <>
          <Path d="M3.5 11V4.5H10l10 10-6.5 6.5-10-10Z" {...line} />
          <Circle cx="7.5" cy="8.5" r="1.3" {...line} />
        </>
      )}
      {name === 'star' && (
        <Path d="m12 4 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8L12 4Z" {...line} />
      )}
      {name === 'box' && (
        <>
          <Path d="M20.5 7.5v9l-8.5 4.5-8.5-4.5v-9L12 3l8.5 4.5Z" {...line} />
          <Path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" {...line} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21Z" {...line} />
          <Circle cx="12" cy="10.6" r="2.4" {...line} />
        </>
      )}
      {name === 'chat' && (
        <Path d="M20.5 12.2c0 3.9-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 20.5l1.4-4A6.6 6.6 0 0 1 3.5 12c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" {...line} />
      )}
      {name === 'chevron' && <Path d="m9.5 6 6 6-6 6" {...line} />}
      {name === 'filter' && (
        <>
          <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...line} />
          <Circle cx="16" cy="7" r="2" {...line} />
          <Circle cx="10" cy="17" r="2" {...line} />
        </>
      )}
      {name === 'back' && <Path d="m14.5 6-6 6 6 6" {...line} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...line} />}
      {name === 'play' && <Path d="M8 5.5v13l11-6.5-11-6.5Z" fill={color} />}
      {name === 'bookmark' && (
        <Path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z" {...line} />
      )}
      {name === 'bookmarkFilled' && (
        <Path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z" {...line} fill={color} />
      )}
      {name === 'sound' && (
        <>
          <Path d="M11 5 6.5 8.5H3.5v7h3L11 19V5Z" {...line} />
          <Path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a8 8 0 0 1 0 10.8" {...line} />
        </>
      )}
      {name === 'muted' && (
        <>
          <Path d="M11 5 6.5 8.5H3.5v7h3L11 19V5Z" {...line} />
          <Path d="m16 9.5 5 5m0-5-5 5" {...line} />
        </>
      )}
    </Svg>
  );
}

/**
 * Memoized card: a poster by default and one native preview when selected.
 * Original uploads require an explicit play tap; unavailable small clips never
 * silently start full-resolution downloads while the user scrolls.
 */
const ReelTile = React.memo(function ReelTileContent({
  creator,
  onOpen,
  onMessage,
  onRequestPlay,
  onToggleSave,
  saved,
  saving,
  index,
  play,
  allowOriginal,
  soundOn,
  onSound,
}: {
  creator: Creator;
  onOpen: (creator: Creator) => void;
  onMessage: (creator: Creator) => void;
  onRequestPlay: (index: number) => void;
  onToggleSave: (creator: Creator) => void;
  /** In this brand's saved list, and a save/unsave request still running. */
  saved: boolean;
  saving: boolean;
  index: number;
  allowOriginal: boolean;
  /** True for the few tiles currently in the middle of the screen. */
  play: boolean;
  /** This tile's preview is unmuted. Only one tile at a time has sound. */
  soundOn: boolean;
  /** Takes the sound for this creator's id, or gives it up with null. */
  onSound: (id: string | null) => void;
}) {
  // Upstream's lookup finds a clip anywhere in the portfolio, not just the preview.
  const videoUrl = creatorVideoUrl(creator);
  const previewUrl = text(creator.portfolio_preview);
  const media = photoUrl(videoUrl || previewUrl);
  const avatar = photoUrl(creator.profile_photo);
  const name = text(creator.name || creator.nickname, 'Creator');
  const category = text(creator.primary_category);
  const rate = priceTextOf(creator);
  // Every category the creator picked, like the website card: first one plus a count.
  const cats = categoriesOf(creator);
  const video = !!videoUrl;
  // Prefer the small preview, but uploads are playable even before a preview exists.
  const small = video ? previewOf(media) : null;
  const [smallFailed, setSmallFailed] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const useSmall = !!small && !clipFailed;
  const playbackUrl = useSmall ? small!.clip : allowOriginal ? media : null;
  const source = useMemo(() => ({ uri: playbackUrl || '', bufferConfig: PREVIEW_BUFFER }), [playbackUrl]);
  // A photo preview the creator chose beats a generated frame.
  const photoPreview = previewUrl && !isVideo(previewUrl) ? photoUrl(previewUrl) : '';
  const poster = small && !smallFailed
    ? small.poster
    : photoPreview || cloudinaryVideoPoster(media) || videoPoster(media) || avatar;
  const showClip = video && play && !!playbackUrl && !videoFailed;

  useEffect(() => {
    setSmallFailed(false);
    setClipFailed(false);
    setVideoFailed(false);
    setReady(false);
  }, [media]);
  useEffect(() => { setReady(false); }, [showClip, playbackUrl]);
  // The clip stopped (scrolled away, a sheet opened): give the sound back.
  useEffect(() => { if (soundOn && !showClip) onSound(null); }, [soundOn, showClip, onSound]);

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => onOpen(creator)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${category || 'creator'}`}
    >
      <View style={styles.reel}>
        {poster ? (
          // The picture is always there: it shows while a clip loads and for
          // every tile that isn't one of the few playing.
          <Image
            source={{ uri: poster }}
            style={styles.reelMedia}
            onError={() => setSmallFailed(true)}
          />
        ) : (
          <View style={styles.reelEmpty}>
            <Text style={styles.reelEmptyText}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {showClip && (
          <Video
            key={playbackUrl}
            source={source}
            style={[styles.reelClip, ready ? styles.clipReady : styles.clipLoading]}
            resizeMode="cover"
            repeat
            // Muted until the brand taps the speaker; one tile at a time.
            muted={!soundOn}
            // Texture view, because a surface view ignores opacity and would
            // flash black over the picture until the first frame.
            viewType={ViewType.TEXTURE}
            maxBitRate={800000}
            progressUpdateInterval={1000}
            reportBandwidth={false}
            playInBackground={false}
            playWhenInactive={false}
            // A silent preview must not steal the phone's audio focus; the
            // one with sound does (Android). iOS plays through the silent switch.
            disableFocus={!soundOn}
            ignoreSilentSwitch="ignore"
            onReadyForDisplay={() => setReady(true)}
            onError={() => useSmall ? setClipFailed(true) : setVideoFailed(true)}
          />
        )}

        {/* 44px touch target in the top-right corner; the tier badge is top-left. */}
        <TouchableOpacity
          style={[styles.reelSave, saving && styles.reelSaving]}
          onPress={event => { event.stopPropagation(); onToggleSave(creator); }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${name} from saved creators` : `Save ${name}`}
          accessibilityState={{ selected: saved, busy: saving }}
          testID={`creator-save-${creator.id}`}
        >
          <View style={styles.reelSaveDot}>
            <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} color={saved ? '#4C4DD6' : '#15163F'} size={15} />
          </View>
        </TouchableOpacity>

        {!!text(creator.level_label) && (
          <View style={styles.reelBadge}>
            <Text style={styles.reelBadgeText}>
              {text(creator.level_label).toUpperCase()}
            </Text>
          </View>
        )}
        {!!cats.length && (
          <View style={styles.reelCats} pointerEvents="none">
            <Text style={styles.reelCatsText} numberOfLines={1}>
              {categoryLabel(cats[0])}
              {cats.length > 1 ? ` +${cats.length - 1}` : ''}
            </Text>
          </View>
        )}
        {showClip && ready && (
          <TouchableOpacity style={styles.mutedPill}
            accessibilityRole="button"
            accessibilityLabel={soundOn ? `Mute ${name}'s preview` : `Unmute ${name}'s preview`}
            accessibilityState={{ selected: soundOn }}
            testID={`creator-sound-${creator.id}`}
            hitSlop={scale(10)}
            onPress={event => { event.stopPropagation(); onSound(soundOn ? null : creator.id); }}>
            <Icon name={soundOn ? 'sound' : 'muted'} color="#FFFFFF" size={14} />
          </TouchableOpacity>
        )}
        {video && !(showClip && ready) && (
          <TouchableOpacity style={styles.reelPlay}
            accessibilityRole="button" accessibilityLabel={`Play ${name}'s preview`}
            hitSlop={scale(10)}
            onPress={event => { event.stopPropagation(); setVideoFailed(false); onRequestPlay(index); }}>
            <Icon name="play" color="#FFFFFF" size={14} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tileFooter}>
        <View style={styles.tileAvatar}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.tileAvatarImg} />
          ) : (
            <Text style={styles.tileAvatarText}>
              {name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.tileCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.tileName} numberOfLines={2}>
              {name}
            </Text>
            {!!creator.kyc_verified && (
              <Icon name="verified" color="#1FA971" size={13} />
            )}
          </View>
          <Text style={styles.tileRate} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {rate}
          </Text>
        </View>
        {/* Message straight from the card, as on the website. */}
        <TouchableOpacity
          style={styles.tileMessage}
          onPress={() => onMessage(creator)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Message ${name}`}
          testID={`creator-message-${creator.id}`}
        >
          <Icon name="chat" color="#4C4DD6" size={15} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});


/** Swipeable, virtualized row. Scrolling releases the decoder until settling. */
const ReelRow = React.memo(function ReelRowContent({ creators, active, onActivate, onOpen, onMessage, savedIds, savingIds, onToggleSave, soundId, onSound }: {
  creators: Creator[];
  active: boolean;
  onActivate: () => void;
  onOpen: (creator: Creator) => void;
  onMessage: (creator: Creator) => void;
  savedIds: Set<string>;
  savingIds: Set<string>;
  onToggleSave: (creator: Creator) => void;
  /** The one creator whose preview currently has sound. */
  soundId: string | null;
  onSound: (id: string | null) => void;
}) {
  const [scrolling, setScrolling] = useState(false);
  const [playingSlot, setPlayingSlot] = useState<number | null>(null);
  const [requestedSlot, setRequestedSlot] = useState<number | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatorRef = useRef(creators);
  creatorRef.current = creators;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { isViewable: boolean; index?: number | null }[] }) => {
    const slots = viewableItems.filter(item => item.isViewable && item.index != null)
      .map(item => item.index!).sort((a, b) => a - b);
    setPlayingSlot(current => current != null && slots.includes(current) ? current : (
      slots.find(index => {
        const creator = creatorRef.current[index];
        return creator && (!!creator.portfolio_video || isVideo(photoUrl(creator.portfolio_preview)));
      }) ?? null
    ));
    setRequestedSlot(current => current != null && slots.includes(current) ? current : null);
  }).current;
  const stop = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    setScrolling(true);
  }, []);
  const settle = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = setTimeout(() => { settling.current = null; setScrolling(false); }, SETTLE_MS);
  }, []);
  useEffect(() => () => { if (settling.current) clearTimeout(settling.current); }, []);
  const rowIdentity = useMemo(() => creators.map(creator => creator.id).join('|'), [creators]);
  useEffect(() => { setPlayingSlot(null); setRequestedSlot(null); }, [rowIdentity]);
  const requestPlay = useCallback((index: number) => {
    onActivate();
    setRequestedSlot(index);
    setPlayingSlot(index);
    setScrolling(false);
  }, [onActivate]);
  // FlatList only re-renders tiles when extraData changes, so the save state is part of it.
  const saveKey = useMemo(() => `${[...savedIds].join(',')}|${[...savingIds].join(',')}`, [savedIds, savingIds]);
  const renderItem = useCallback(({ item, index }: { item: Creator; index: number }) => (
    <ReelTile creator={item} index={index} onOpen={onOpen} onMessage={onMessage} onRequestPlay={requestPlay}
      onToggleSave={onToggleSave} saved={savedIds.has(item.id)} saving={savingIds.has(item.id)}
      play={active && !scrolling && playingSlot === index} allowOriginal={requestedSlot === index}
      soundOn={soundId === item.id} onSound={onSound} />
  ), [active, scrolling, playingSlot, requestedSlot, onOpen, onMessage, requestPlay, onToggleSave, savedIds, savingIds, soundId, onSound]);
  if (!creators.length) return null;
  return <FlatList horizontal data={creators} renderItem={renderItem}
    keyExtractor={creator => creator.id}
    extraData={`${active}-${scrolling}-${playingSlot}-${requestedSlot}-${saveKey}-${soundId}`}
    initialNumToRender={3} maxToRenderPerBatch={3} windowSize={3}
    getItemLayout={(_, index) => ({ length: TILE_STRIDE, offset: ROW_PADDING + index * TILE_STRIDE, index })}
    viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged}
    showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}
    onScrollBeginDrag={() => { onActivate(); stop(); }} onScrollEndDrag={settle}
    onMomentumScrollBegin={stop} onMomentumScrollEnd={settle}
    keyboardShouldPersistTaps="handled" />;
});

/** One "Price / Rating / Deliverables / Location" row inside the peek sheet. */
function PeekRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.peekRow}>
      <Icon name={icon} size={17} />
      <Text style={styles.peekLabel}>{label}</Text>
      <Text style={styles.peekValue} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="chevron" color="#C3C6D8" size={15} />
    </View>
  );
}

/**
 * The quick-preview sheet a brand gets when it taps a creator tile: identity,
 * the four headline stats, and a strip of recent work. It is a summary, not the
 * whole profile — "View full details" opens CreatorPublicProfile.
 *
 * Everything shown comes from the directory record the tab already loaded, so
 * opening the sheet costs no network request.
 */
function CreatorPeekSheet({
  creator,
  onClose,
  onOpenFull,
  onMessage,
}: {
  creator: Creator | null;
  onClose: () => void;
  onOpenFull: () => void;
  onMessage: () => void;
}) {
  // A centred dialog rather than a bottom sheet: it reads as a preview OF the
  // tile that was tapped, so it grows from the middle of the screen instead of
  // sliding up over the grid. Driven manually to keep the app's motion curve.
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!creator) return;
    pop.setValue(0);
    Animated.timing(pop, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [creator, pop]);

  // The clip being watched full-screen. It is its own Modal, opened ON TOP of this
  // card, so the video is never underneath it and the card never has to be dismissed first.
  const [watching, setWatching] = useState<string | null>(null);
  const [watchFailed, setWatchFailed] = useState(false);
  useEffect(() => { setWatching(null); setWatchFailed(false); }, [creator]);
  const insets = useSafeAreaInsets();

  if (!creator) return null;

  const name = text(creator.full_name || creator.name || creator.nickname, 'Creator');
  const category = text(creator.primary_category);
  const bio = text(creator.bio);
  const avatar = photoUrl(creator.profile_photo);
  // Field names the directory API really returns (server.py:4425-4431, 4573-4574):
  // budget_range, avg_rating, review_count, city_tier, categories.
  const delivered = Number(creator.deliverables_completed) || 0;
  const location = locationOf(creator);
  const peekCats = categoriesOf(creator);
  const clips = uniqueClips(
      [
        creatorVideoUrl(creator),
        ...(Array.isArray(creator.portfolio) ? creator.portfolio : []).map(item =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object'
            ? text(
                (item as Record<string, unknown>).video_url ||
                  (item as Record<string, unknown>).videoUrl ||
                  (item as Record<string, unknown>).url,
              )
            : '',
        ),
      ].filter((url): url is string => !!url),
  )
    .map(photoUrl)
    .filter(Boolean)
    .slice(0, 6) as string[];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the dimmed backdrop closes the dialog. */}
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.peekCentre} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.peek,
            {
              opacity: pop,
              transform: [
                {
                  // Starts a touch small and settles at full size — the same
                  // "grow into place" motion the rest of the app uses.
                  scale: pop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.peekClose}
            onPress={onClose}
            hitSlop={scale(6)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" color="#6B7092" size={18} />
          </TouchableOpacity>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.peekBody}
        >
          <View style={styles.peekIdentity}>
            <View style={styles.peekAvatar}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.peekAvatarImg} />
              ) : (
                <Text style={styles.peekAvatarText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.peekCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.peekName} numberOfLines={1}>
                  {name}
                </Text>
                {!!creator.kyc_verified && (
                  <Icon name="verified" color="#1FA971" size={15} />
                )}
              </View>
              {(peekCats.length > 0 || !!category) && (
                <View style={styles.peekTags}>
                  {(peekCats.length ? peekCats.map(categoryLabel) : [category]).map(label => (
                    <View key={label} style={styles.peekTag}>
                      <Text style={styles.peekTagText}>{label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {!!bio && (
            <Text style={styles.peekBio} numberOfLines={3}>
              {bio}
            </Text>
          )}

          <View style={styles.peekCard}>
            <PeekRow icon="tag" label="Price" value={priceTextOf(creator)} />
            <PeekRow icon="star" label="Rating" value={ratingText(creator)} />
            <PeekRow icon="box" label="Deliverables" value={String(delivered)} />
            <PeekRow icon="pin" label="Location" value={location} />
          </View>

          {!!clips.length && (
            <>
              <View style={styles.peekWorkHead}>
                <Text style={styles.peekSection}>Recent work</Text>
                <TouchableOpacity onPress={onOpenFull} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.peekSeeAll}>See all</Text>
                </TouchableOpacity>
              </View>

              {/* Up to six clips, three across (the website shows six) - the work
                  the creator uploaded is what a brand is judging. Tapping a
                  video plays it full-screen with sound over this card; "See
                  all" opens the full profile. */}
              <View style={styles.peekWorkRow}>
                {clips.slice(0, 6).map((uri, index) => (
                  <TouchableOpacity
                    key={`${uri}-${index}`}
                    style={styles.peekClip}
                    onPress={() => {
                      if (isVideo(uri)) { setWatchFailed(false); setWatching(uri); } else onOpenFull();
                    }}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`Play clip ${index + 1}`}
                  >
                    {/* Still poster, not a live player — the modal used to mount
                        up to 3 videos on top of the marquee's players. */}
                    {(() => {
                      const p = cloudinaryVideoPoster(uri) || videoPoster(uri);
                      return p ? (
                        <>
                          <Image source={{ uri: p }} style={styles.peekClipMedia} />
                          {isVideo(uri) && (
                            <View style={styles.peekPlay}>
                              <Icon name="play" color="#FFFFFF" size={11} />
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={[styles.peekClipMedia, styles.reelEmpty]}>
                          <Icon name="play" color="#B9BDD4" size={14} />
                        </View>
                      );
                    })()}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>

          <View style={styles.peekActions}>
          <TouchableOpacity
            style={styles.peekGhostBtn}
            onPress={onMessage}
            accessibilityRole="button"
          >
            <Icon name="chat" color="#4C4DD6" size={15} />
            <Text style={styles.peekGhostText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.peekPrimaryBtn}
            onPress={onOpenFull}
            accessibilityRole="button"
          >
            <Text style={styles.peekPrimaryText}>View full details</Text>
            <Icon name="chevron" color="#FFFFFF" size={15} />
          </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {/* Nested inside the card's Modal on purpose: iOS can only present a second
          modal from the one already on screen, and on Android it stacks above it. */}
      {!!watching && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setWatching(null)}
        >
          <View style={styles.player}>
            {watchFailed ? (
              <Text style={styles.playerError}>This video can't be played right now.</Text>
            ) : (
              <Video
                source={{ uri: playableVideoUrl(watching) }}
                style={styles.playerVideo}
                resizeMode="contain"
                controls
                playInBackground={false}
                playWhenInactive={false}
                ignoreSilentSwitch="ignore"
                onError={() => setWatchFailed(true)}
              />
            )}
            <TouchableOpacity
              style={[styles.playerClose, { top: Math.max(insets.top, scale(24)) + scale(8) }]}
              onPress={() => setWatching(null)}
              hitSlop={scale(4)}
              accessibilityRole="button"
              accessibilityLabel="Close video"
            >
              <Icon name="close" color="#FFFFFF" size={18} />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

function BrandCreators({
  token,
  onNavigate,
  onNotifications,
  onMessages,
  unread = 0,
  onOpenCreator,
}: Props) {
  const [creators, setCreators] = useState<Creator[]>([]);
  // A failed load must not read as "No creators found".
  const [loadError, setLoadError] = useState('');
  // The creator whose quick-preview sheet is open; null when none is.
  const [peek, setPeek] = useState<Creator | null>(null);
  // The sort chips were removed from the UI; the directory always comes back
  // best-match ordered, which is what the endpoint defaults to anyway.
  const sort = 'best_match';
  const [query, setQuery] = useState('');
  // The team's hand-picked shortlist (admin: Users > creator > Mark UGCAD Approved),
  // same collection as the website's ?collection=ugcad-approved.
  const [approvedOnly, setApprovedOnly] = useState(false);
  // Android Back leaves the collection before it leaves the tab.
  useEffect(() => {
    if (!approvedOnly) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setApprovedOnly(false); return true; });
    return () => sub.remove();
  }, [approvedOnly]);
  // Category filter (website parity): 'all' or one lowercased category.
  const [category, setCategory] = useState('all');
  // The brand's saved shortlist (ids), shared with the website via the backend.
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [savedStatus, setSavedStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [savedOnly, setSavedOnly] = useState(false);
  const savingRef = useRef<Set<string>>(new Set());   // blocks double taps on one creator
  const toast = useToast();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [activeRow, setActiveRow] = useState(0);
  const activeRowRef = useRef(0);
  const [verticalScrolling, setVerticalScrolling] = useState(false);
  const viewport = useRef({ height: 0, offset: 0 });
  const rowLayouts = useRef<Array<RowLayout | undefined>>([]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const pending = useRef<string | null>(null);
  const activateRow = useCallback((index: number) => {
    if (activeRowRef.current !== index) { activeRowRef.current = index; setActiveRow(index); }
  }, []);
  const activateFirst = useCallback(() => activateRow(0), [activateRow]);
  const activateSecond = useCallback(() => activateRow(1), [activateRow]);
  const chooseVisibleRow = useCallback(() => {
    activateRow(visibleCreatorRow(rowLayouts.current, viewport.current.offset, viewport.current.height));
  }, [activateRow]);
  const stopVertical = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setVerticalScrolling(true);
  }, []);
  const settleVertical = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null; chooseVisibleRow(); setVerticalScrolling(false);
    }, SETTLE_MS);
  }, [chooseVisibleRow]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);


  const load = useCallback(async () => {
    if (pending.current === token) return;
    pending.current = token;
    const current = ++request.current;
    try {
      const list = await getCreatorDirectory(token, sort);
      if (!mounted.current || current !== request.current) return;
      const next = list.map((creator, index) => ({ ...creator, id: String(creator.id ?? index) })) as Creator[];
      setCreators(previous => reconcileDirectory(previous, next));
      setLoadError('');
    } catch (error) {
      // Keep loaded rows and playback intact on a failed background refresh, and
      // say the refresh failed (with Retry) instead of showing an empty list.
      if (mounted.current && current === request.current) {
        setLoadError(
          error instanceof NetworkError
            ? "You're offline. Check your connection and try again."
            : error instanceof Error && error.message
            ? error.message
            : 'Could not load creators. Please try again.',
        );
      }
    } finally {
      if (current === request.current) {
        pending.current = null;
        if (mounted.current) { setLoading(false); setRefreshing(false); }
      }
    }
  }, [sort, token]);

  useLiveEffect(() => { load(); }, [load]);

  const loadSaved = useCallback(async () => {
    setSavedStatus('loading');
    try {
      const ids = await getSavedCreators(token);
      if (!mounted.current) return;
      setSavedIds(new Set(ids));
      setSavedStatus('ready');
    } catch {
      if (mounted.current) setSavedStatus('error');
    }
  }, [token]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // Optimistic: the bookmark flips at once and is put back, with a toast, if the call fails.
  const toggleSave = useCallback(async (creator: Creator) => {
    const id = creator.id;
    if (savingRef.current.has(id)) return;
    const was = savedIds.has(id);
    savingRef.current.add(id);
    setSavingIds(prev => new Set(prev).add(id));
    const apply = (on: boolean) => setSavedIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
    apply(!was);
    try {
      if (was) await unsaveCreator(token, id); else await saveCreator(token, id);
      if (mounted.current) toast.show(was ? 'Removed from saved' : 'Creator saved to your list');
    } catch (error) {
      if (mounted.current) {
        apply(was);
        toast.show(error instanceof NetworkError
          ? "You're offline. Check your connection and try again."
          : error instanceof Error && error.message ? error.message : 'Could not update saved creators');
      }
    } finally {
      savingRef.current.delete(id);
      if (mounted.current) setSavingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, [savedIds, token, toast.show]);

  // Search is client-side: the directory endpoint takes filters, not a text
  // query, and the list is small enough to filter in place.
  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const pool = creators.filter(creator =>
      (!approvedOnly || !!creator.ugcad_approved) &&
      (!savedOnly || savedIds.has(creator.id)) &&
      (category === 'all' || categoriesOf(creator).includes(category)));
    if (!needle) return pool;
    return pool.filter(creator =>
      [
        creator.name,
        creator.nickname,
        creator.primary_category,
        // Every category picked, so searching "beauty" finds a creator whose
        // first category is fashion.
        ...(Array.isArray(creator.categories) ? creator.categories : []),
        creator.content_style,
        creator.city_tier,
      ]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle)),
    );
  }, [creators, deferredQuery, approvedOnly, category, savedOnly, savedIds]);
  // Categories present in the current collection, most creators first, with counts.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    (approvedOnly ? creators.filter(creator => !!creator.ugcad_approved) : creators)
      .forEach(creator => new Set(categoriesOf(creator)).forEach(value => counts.set(value, (counts.get(value) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [creators, approvedOnly]);
  const rows = useMemo(() => [
    visible.slice(0, Math.ceil(visible.length / 2)),
    visible.slice(Math.ceil(visible.length / 2)),
  ], [visible]);
  const messageCreator = useCallback(
    (creator: Creator) => onNavigate(`/messages/${creator.id}`),
    [onNavigate],
  );
  const retry = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);
  const playbackAllowed = foreground && !peek && !searchFocused && !verticalScrolling && query === deferredQuery;
  // The creator whose preview has sound (one at a time). Any pause of playback
  // (backgrounded, sheet open, scrolling) or a new list gives the sound back.
  const [soundId, setSoundId] = useState<string | null>(null);
  useEffect(() => { setSoundId(null); }, [playbackAllowed, query, category, approvedOnly, savedOnly]);

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Creators"
        onNotifications={onNotifications}
        onMessages={onMessages}
        unreadMessages={unread}
      />

      <View style={styles.sheet}>
        <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Icon name="search" color="#9498B0" size={17} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
            placeholder="Search by name, category or style"
            placeholderTextColor="#A9ADC2"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
          <TouchableOpacity testID="creator-filter-button" style={[styles.filterBtn, category !== 'all' && styles.filterBtnActive]}
            onPress={() => setFilterOpen(true)} accessibilityRole="button"
            accessibilityLabel={category === 'all' ? 'Filter by category' : `Filter: ${categoryLabel(category)}`}>
            <Icon name="filter" color={category === 'all' ? '#15163F' : '#4C4DD6'} size={19} />
            {category !== 'all' && <View style={styles.filterDot} />}
          </TouchableOpacity>
        </View>

        {category !== 'all' && (
          <View style={styles.activeFilterRow}>
            <TouchableOpacity testID="creator-filter-clear" style={styles.activeFilterChip} onPress={() => setCategory('all')}
              accessibilityRole="button" accessibilityLabel={`Remove filter ${categoryLabel(category)}`}>
              <Text style={styles.activeFilterText} numberOfLines={1}>{categoryLabel(category)}</Text>
              <Icon name="close" color="#4C4DD6" size={13} />
            </TouchableOpacity>
          </View>
        )}

        {approvedOnly ? (
          <View style={styles.approvedHead}>
            <TouchableOpacity style={styles.approvedBack} onPress={() => setApprovedOnly(false)}
              accessibilityRole="button" hitSlop={scale(8)}>
              <Icon name="back" color="#4C4DD6" size={15} />
              <Text style={styles.approvedBackText}>Back to All Creators</Text>
            </TouchableOpacity>
            <Text style={styles.approvedTitle}>Preferred Creators by the UGCAD Team</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.approvedLink} onPress={() => setApprovedOnly(true)}
            accessibilityRole="button">
            <Icon name="verified" color="#1FA971" size={17} />
            <Text style={styles.approvedLinkText} numberOfLines={1}>Meet Our Preferred Creators</Text>
            <Icon name="chevron" color="#FFFFFF" size={15} />
          </TouchableOpacity>
        )}

        {loading ? (
          // Two strips of 9:16 tiles, matching the reel rows below rather than
          // the full-width list cards the generic skeleton draws.
          <View style={styles.skeleton}>
            <SkeletonReelRow
              count={3}
              tileWidth={TILE_WIDTH}
              tileHeight={TILE_HEIGHT}
              footerHeight={FOOTER_HEIGHT}
              gap={GRID_GAP}
            />
            <SkeletonReelRow
              count={3}
              tileWidth={TILE_WIDTH}
              tileHeight={TILE_HEIGHT}
              footerHeight={FOOTER_HEIGHT}
              gap={GRID_GAP}
            />
          </View>
        ) : (
          <ScrollView testID="creator-directory-scroll"
            onLayout={event => { viewport.current.height = event.nativeEvent.layout.height; chooseVisibleRow(); }}
            onScroll={event => { viewport.current.offset = event.nativeEvent.contentOffset.y; chooseVisibleRow(); }}
            scrollEventThrottle={64}
            onScrollBeginDrag={stopVertical} onScrollEndDrag={settleVertical}
            onMomentumScrollBegin={stopVertical} onMomentumScrollEnd={settleVertical}
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
            {!!loadError && (
              <View style={styles.errorBox} testID="creators-error">
                <Text style={styles.errorText}>
                  {loadError}
                  {creators.length ? ' Showing the last list we loaded.' : ''}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={retry}
                  accessibilityRole="button"
                  testID="creators-retry"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {!visible.length && loadError && !creators.length ? null : !visible.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {savedOnly && savedStatus === 'ready' && !savedIds.size ? 'No saved creators yet'
                    : approvedOnly ? 'No preferred creators to show' : 'No creators found'}
                </Text>
                <Text style={styles.emptyText}>
                  {savedOnly && savedStatus === 'ready' && !savedIds.size
                    ? 'Tap the bookmark on a creator to save them here for later.'
                    : savedOnly && savedStatus === 'loading'
                    ? 'Loading your saved creators...'
                    : savedOnly && savedStatus === 'error'
                    ? "Couldn't load your saved creators. Tap the Saved chip to retry."
                    : category !== 'all'
                    ? `No creators in ${categoryLabel(category)}${query ? ' match your search' : ''}. Try another category or clear the filter.`
                    : approvedOnly
                    ? query
                      ? 'None of the preferred creators match your search.'
                      : 'The UGCAD team has not picked any preferred creators yet. Check back soon.'
                    : query
                    ? 'Try a different search term.'
                    : 'The directory is empty right now.'}
                </Text>
                {/* Next action for a filtered-out list; the approved collection has its own Back link. */}
                {(category !== 'all' || savedOnly || !!query) && (
                  <TouchableOpacity
                    style={[styles.retryBtn, styles.clearBtn]}
                    onPress={() => { setCategory('all'); setSavedOnly(false); setQuery(''); }}
                    accessibilityRole="button"
                    testID="creators-clear-filters"
                  >
                    <Text style={styles.retryText}>Clear filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.rows}>
                <View testID="creator-directory-row-0" onLayout={event => { rowLayouts.current[0] = event.nativeEvent.layout; chooseVisibleRow(); }}>
                  <ReelRow creators={rows[0]} active={playbackAllowed && activeRow === 0}
                    onActivate={activateFirst} onOpen={setPeek} onMessage={messageCreator}
                    savedIds={savedIds} savingIds={savingIds} onToggleSave={toggleSave}
                    soundId={soundId} onSound={setSoundId} />
                </View>
                <View testID="creator-directory-row-1" onLayout={event => { rowLayouts.current[1] = event.nativeEvent.layout; chooseVisibleRow(); }}>
                  <ReelRow creators={rows[1]} active={playbackAllowed && activeRow === 1}
                    onActivate={activateSecond} onOpen={setPeek} onMessage={messageCreator}
                    savedIds={savedIds} savingIds={savingIds} onToggleSave={toggleSave}
                    soundId={soundId} onSound={setSoundId} />
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <BottomSheet visible={filterOpen} title="Filter by category" onClose={() => setFilterOpen(false)}>
        {([['all', creators.length], ...categoryOptions] as [string, number][]).map(([value, count]) => {
          const on = category === value;
          return (
            <TouchableOpacity
              key={value}
              testID={`creator-filter-option-${value}`}
              style={[styles.catRow, on && styles.catRowOn]}
              onPress={() => { setCategory(value); setFilterOpen(false); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={styles.catCheck}>{on && <Icon name="check" color="#4C4DD6" size={17} />}</View>
              <Text style={[styles.catLabel, on && styles.catLabelOn]} numberOfLines={1}>
                {value === 'all' ? 'All categories' : categoryLabel(value)}
              </Text>
              <View style={[styles.catCount, on && styles.catCountOn]}>
                <Text style={[styles.catCountText, on && styles.catLabelOn]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <CreatorPeekSheet
        creator={peek}
        onClose={() => setPeek(null)}
        onOpenFull={() => {
          const creator = peek;
          // Close first: leaving the modal mounted would keep it stacked over
          // the profile that replaces this screen.
          setPeek(null);
          if (creator) onOpenCreator?.(creator);
        }}
        onMessage={() => {
          const creator = peek;
          setPeek(null);
          if (creator) onNavigate(`/messages/${creator.id}`);
        }}
      />
      <ToastBar message={toast.message} />
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
  header: {
    paddingHorizontal: scale(16),
    paddingTop: scale(8),
    paddingBottom: scale(12),
    // Transparent so the navy backdrop shows through, as on the creator tabs.
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: fontScale(21),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Search field + Filter button share one row.
  searchRow: {
    marginTop: scale(16),
    marginBottom: scale(12),
    marginHorizontal: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  filterBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { borderColor: '#C9CAF7', backgroundColor: '#EEEFFF' },
  filterDot: { position: 'absolute', top: scale(8), right: scale(8), width: scale(7), height: scale(7), borderRadius: scale(4), backgroundColor: '#4C4DD6' },
  activeFilterRow: { flexDirection: 'row', marginHorizontal: scale(16), marginTop: -scale(4), marginBottom: scale(12) },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    maxWidth: '100%',
    paddingHorizontal: scale(12),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: '#EEEFFF',
    borderWidth: 1,
    borderColor: '#C9CAF7',
  },
  activeFilterText: { fontSize: fontScale(13), fontFamily: 'Inter-SemiBold', fontWeight: '600', color: '#4C4DD6', flexShrink: 1 },
  searchWrap: {
    flex: 1,
    height: scale(44),
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
    minWidth: 0,
    // 16 stops iOS zooming the page when the field is focused.
    fontSize: 16,
    color: '#15163F',
    // Android's default vertical padding makes the row taller than 44.
    paddingVertical: 0,
  },

  // "Meet Our Preferred Creators" link and the collection's heading.
  // Same pill as the website on phones: dark indigo, white text, pushed to the right.
  approvedLink: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    paddingVertical: scale(10),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    backgroundColor: '#07074E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    shadowColor: '#07074E',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  approvedLinkText: {
    flexShrink: 1,
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Category filter sheet: left-aligned rows, a tick on the chosen one, the count in a pill.
  catRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(12),
    borderRadius: scale(12),
  },
  catRowOn: { backgroundColor: '#F0F1FF' },
  catCheck: { width: scale(20), alignItems: 'center' },
  catLabel: { flex: 1, fontSize: fontScale(15), fontFamily: 'Inter-Medium', fontWeight: '500', color: '#15163F' },
  catLabelOn: { fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4C4DD6' },
  catCount: {
    minWidth: scale(34),
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(10),
    backgroundColor: '#F2F3F8',
    alignItems: 'center',
  },
  catCountOn: { backgroundColor: '#E3E5FF' },
  catCountText: { fontSize: fontScale(12.5), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#5C6180' },
  approvedHead: { marginHorizontal: scale(16), marginBottom: scale(14) },
  approvedBack: { flexDirection: 'row', alignItems: 'center', gap: scale(4), alignSelf: 'flex-start' },
  approvedBackText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  approvedTitle: {
    marginTop: scale(10),
    fontSize: fontScale(18),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  loading: { marginTop: scale(40) },
  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(30) + NAV_CLEARANCE },

  // The loading state mirrors the loaded one: 16px in from the left like
  // `row`, no right padding so the third tile runs off the edge exactly as the
  // real reels do, and the same bottom clearance as `content`.
  skeleton: {
    paddingLeft: scale(16),
    paddingBottom: scale(30) + NAV_CLEARANCE,
    gap: GRID_GAP,
  },

  // The two rows stack vertically; each scrolls on its own axis.
  rows: { gap: GRID_GAP },
  // Padding sits on the content, not the ScrollView, so tiles can travel the
  // full width and still start clear of the edge.
  row: { paddingHorizontal: scale(16), gap: GRID_GAP },
  tile: { width: TILE_WIDTH },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  reel: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: scale(16),
    overflow: 'hidden',
    backgroundColor: '#0E1330',
  },
  reelMedia: { flex: 1, backgroundColor: '#0E1330' },
  clipReady: { opacity: 1 },
  clipLoading: { opacity: 0 },
  reelClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // 44x44 touch area; the visible dot inside is smaller.
  reelSave: { position: 'absolute', top: 0, right: 0, width: scale(44), height: scale(44), alignItems: 'center', justifyContent: 'center' },
  reelSaving: { opacity: 0.5 },
  reelSaveDot: { width: scale(30), height: scale(30), borderRadius: scale(15), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
  savedRow: { flexDirection: 'row', marginHorizontal: scale(16), marginBottom: scale(12) },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    minHeight: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(22),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C9CAF7',
  },
  savedChipOn: { backgroundColor: '#4C4DD6', borderColor: '#4C4DD6' },
  savedChipText: { fontSize: fontScale(13), fontFamily: 'Inter-SemiBold', fontWeight: '600', color: '#4C4DD6' },
  savedChipTextOn: { color: '#FFFFFF' },
  reelPlay: {
    position: 'absolute',
    right: scale(8),
    bottom: scale(8),
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,16,42,0.6)',
  },
  reelEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15163F',
  },
  reelEmptyText: {
    fontSize: fontScale(30),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  reelBadge: {
    position: 'absolute',
    top: scale(8),
    left: scale(8),
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    backgroundColor: '#2B2DCB',
  },
  reelBadgeText: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  mutedPill: {
    position: 'absolute',
    right: scale(8),
    bottom: scale(8),
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,16,42,0.55)',
  },

  tileFooter: {
    // minHeight: a long name wraps to a second line instead of being cut.
    minHeight: FOOTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: scale(8),
    gap: scale(6),
  },
  tileAvatar: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileAvatarImg: { width: '100%', height: '100%' },
  tileAvatarText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tileCopy: { flex: 1, minWidth: 0 },
  tileName: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    flexShrink: 1,
  },
  tileRate: {
    marginTop: scale(1),
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  tileMessage: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    backgroundColor: '#EEEFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Categories sit on the picture (bottom-left) so the footer keeps its height.
  reelCats: {
    position: 'absolute',
    left: scale(8),
    bottom: scale(8),
    maxWidth: TILE_WIDTH - scale(52),
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(7),
    backgroundColor: 'rgba(12,16,42,0.6)',
  },
  reelCatsText: {
    fontSize: fontScale(9.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorBox: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FEF3C7',
    gap: scale(8),
  },
  errorText: { fontSize: fontScale(12), color: '#92400E' },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: scale(44),
    paddingHorizontal: scale(18),
    borderRadius: scale(10),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: { alignSelf: 'center' },
  retryText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Creator quick-preview sheet ───────────────────────────────────────────
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(10,13,35,0.45)',
  },
  // Centres the dialog over the grid. box-none so taps outside the card still
  // reach the backdrop underneath and dismiss it.
  peekCentre: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(20),
  },
  peek: {
    width: '100%',
    // Capped so a creator with a long bio scrolls inside the card instead of
    // growing past the screen.
    maxHeight: '82%',
    maxWidth: scale(420),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(22),
    paddingTop: scale(8),
    overflow: 'hidden',
  },
  peekClose: {
    position: 'absolute',
    top: scale(10),
    right: scale(10),
    width: scale(32),
    height: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  peekBody: { padding: scale(18), paddingBottom: scale(6) },

  peekIdentity: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  peekAvatar: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: '#4C4DD6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  peekAvatarImg: { width: '100%', height: '100%' },
  peekAvatarText: {
    fontSize: fontScale(21),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  peekCopy: { flex: 1, minWidth: 0 },
  peekName: {
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    flexShrink: 1,
  },
  peekTags: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginTop: scale(6) },
  peekTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#FFF3E0',
  },
  peekTagText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#C97A16',
  },
  peekBio: {
    marginTop: scale(14),
    fontSize: fontScale(13),
    lineHeight: fontScale(20),
    color: '#5C6079',
  },

  // Rules top and bottom only. The rows inside are separated by their own
  // padding rather than a line each, which read as a dense table.
  peekCard: {
    marginTop: scale(16),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EDEEF6',
    backgroundColor: '#FFFFFF',
    paddingVertical: scale(4),
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    height: scale(46),
  },
  peekLabel: { flex: 1, fontSize: fontScale(13), color: '#5C6079' },
  peekValue: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
    flexShrink: 1,
  },

  peekWorkHead: {
    marginTop: scale(20),
    marginBottom: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peekSection: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  peekSeeAll: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  // Three clips across the card width, so each one keeps the 9:16 reel shape
  // without a fixed pixel width that would not divide evenly on every screen.
  peekWorkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  peekClip: {
    width: '31%',
    aspectRatio: 9 / 16,
    borderRadius: scale(12),
    overflow: 'hidden',
    backgroundColor: '#0E1330',
  },
  peekClipMedia: { flex: 1, backgroundColor: '#0E1330' },
  peekPlay: {
    position: 'absolute',
    left: scale(7),
    bottom: scale(7),
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,16,42,0.55)',
  },

  // Full-screen clip player, opened over the peek card.
  player: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  playerVideo: { width: '100%', height: '100%' },
  playerError: {
    color: '#FFFFFF',
    fontSize: fontScale(14),
    textAlign: 'center',
    paddingHorizontal: scale(32),
  },
  playerClose: {
    position: 'absolute',
    top: scale(44),
    right: scale(16),
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  peekActions: {
    flexDirection: 'row',
    gap: scale(10),
    paddingHorizontal: scale(18),
    paddingTop: scale(12),
    paddingBottom: scale(20),
    borderTopWidth: 1,
    borderTopColor: '#F0F1F8',
  },
  peekGhostBtn: {
    flex: 1,
    height: scale(48),
    borderRadius: scale(13),
    borderWidth: 1.5,
    borderColor: '#DCDDF6',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
  },
  peekGhostText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#4C4DD6',
  },
  peekPrimaryBtn: {
    flex: 1.35,
    height: scale(48),
    borderRadius: scale(13),
    backgroundColor: '#15163F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
  },
  peekPrimaryText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  empty: { marginTop: scale(30), padding: scale(22), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    marginBottom: scale(12),
    fontSize: fontScale(13),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandCreators;
