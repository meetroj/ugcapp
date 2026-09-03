import { Dimensions, PixelRatio } from 'react-native';

/* ------------------------------------------------------------------ *
 * Responsive scaling
 * ------------------------------------------------------------------ */

/**
 * The screen every value in this file — and every hardcoded number that was
 * authored in the screens — was designed against. 390x844 is the iPhone 13/14
 * logical viewport, which is also what the Figma frames use.
 */
export const BASE_WIDTH = 390;
export const BASE_HEIGHT = 844;

/**
 * Layout is computed from the SHORT edge, not `width`. In landscape or on a
 * split-screen tablet pane, `width` balloons while the design's column still
 * wants phone-ish proportions; the short edge stays stable across rotation, so
 * a card sized from it does not jump when the device turns.
 */
function viewport() {
  const { width, height } = Dimensions.get('window');
  return { short: Math.min(width, height), long: Math.max(width, height), width, height };
}

/**
 * Raw, unclamped ratio of this device to the design reference.
 */
function rawRatio() {
  return viewport().short / BASE_WIDTH;
}

/**
 * How far sizes are allowed to drift from the design.
 *
 * Clamped deliberately: a linear scale would make a 1024pt iPad render 2.6x
 * everything, which does not look like a bigger phone — it looks like a phone
 * screenshot zoomed in. Capping at 1.25 keeps tablets readable while leaving
 * the extra width to the layout (wider gutters, centred content column) rather
 * than to inflated text. The 0.85 floor protects small phones (320pt) from
 * text so shrunken it fails legibility.
 */
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.25;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/**
 * Snap to the device's pixel grid. Fractional layout values make borders and
 * 1px hairlines render blurry or disappear entirely on some Android densities.
 */
function round(n: number) {
  return PixelRatio.roundToNearestPixel(n);
}

/**
 * Scale a horizontal / general size (padding, width, radius, icon box).
 *
 *   padding: scale(16)
 *
 * This is the default helper — reach for it unless you specifically need one
 * of the two below.
 */
export function scale(size: number) {
  return round(size * clamp(rawRatio(), MIN_SCALE, MAX_SCALE));
}

/**
 * Scale a vertical size against screen HEIGHT rather than width.
 *
 * Use for things that should breathe on a tall screen and compress on a short
 * one — hero minHeights, big vertical gaps, spacer blocks. Do NOT use it for
 * paddings that pair with a horizontal one, or square boxes: mixing the two on
 * the same element makes it visibly non-square on odd aspect ratios.
 */
export function verticalScale(size: number) {
  const { long } = viewport();
  return round(size * clamp(long / BASE_HEIGHT, MIN_SCALE, MAX_SCALE));
}

/**
 * Scale a font size.
 *
 * Type is scaled more gently than layout (`FONT_DAMPING`): at 1.25 layout
 * scale, text only grows ~1.15x. Large text in a proportionally-large box
 * reads as oversized, and headline sizes hit the point of diminishing returns
 * much faster than padding does.
 *
 * This handles SCREEN size only. The user's OS font-size preference is applied
 * separately by React Native at render time — see `MAX_FONT_SCALE` and the
 * `maxFontSizeMultiplier` prop wired up in `src/components/Text.tsx`.
 */
const FONT_DAMPING = 0.6;
export function fontScale(size: number) {
  const ratio = clamp(rawRatio(), MIN_SCALE, MAX_SCALE);
  const damped = 1 + (ratio - 1) * FONT_DAMPING;
  return round(size * damped);
}

/**
 * Ceiling on the OS accessibility font-size setting.
 *
 * The app honours the user's preference, but uncapped it overflows fixed-height
 * rows, badges and header bars — the layout is card-dense and many rows cannot
 * grow. 1.3 is the largest multiplier every screen was checked against.
 */
export const MAX_FONT_SCALE = 1.3;

/* ---- device class ------------------------------------------------- */

const { short: SHORT_EDGE, width: WINDOW_WIDTH } = viewport();

/** 320–359pt: iPhone SE 1st gen, small/old Androids. */
export const isSmallPhone = SHORT_EDGE < 360;
/** 600pt+ short edge is the conventional tablet breakpoint (Android's swXXXdp). */
export const isTablet = SHORT_EDGE >= 600;
/** True while the window is wider than it is tall. */
export const isLandscape = WINDOW_WIDTH > viewport().height;

/**
 * Widest a primary content column is allowed to get.
 *
 * On a tablet, full-bleed rows stretch a 3-word label across 900pt with an
 * ocean of whitespace between it and its value. Screens clamp their content to
 * this and centre it, so the layout reads as a well-proportioned column rather
 * than a stretched phone.
 */
export const CONTENT_MAX_WIDTH = 640;

/**
 * Horizontal page gutter. Tablets get a wider one — the extra screen width is
 * spent on margin, not on making every card bigger.
 */
export const GUTTER = isTablet ? scale(28) : scale(16);


/** Design tokens shared by the auth screens. Mirrors the ugcad.io web palette. */
export const colors = {
  /** Deep navy used for primary buttons and headings. */
  navy: '#1B2A6B',
  /** Brand blue from the signage photo; also the segmented-control accent. */
  brand: '#3D4FD8',
  /** Tint behind the selected role chip. */
  brandSoft: '#EEF0FE',
  /**
   * Fills any area the photo does not cover — the strip above it once shifted
   * down, and the gutters beside the card. Sampled from the photo's top edge
   * (#252E83) so the seam is invisible.
   */
  backdrop: '#252E83',
  /** Card surface — very light lilac-grey, not pure white. */
  card: '#F4F5FA',
  /** Input field surface. */
  field: '#FFFFFF',
  border: '#E2E4F0',
  text: '#111827',
  muted: '#6B7280',
  placeholder: '#9CA3AF',
  white: '#FFFFFF',
  danger: '#DC2626',
};

export const radius = {
  card: scale(28),
  field: scale(12),
  chip: scale(12),
  button: scale(12),
};

export const spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(16),
  lg: scale(24),
  xl: scale(32),
};

/**
 * Vertical space the floating bottom nav covers: the 62px pill plus its 10px
 * bottom inset. Scrollable tab screens add this to their content padding so
 * their last row is not trapped under the bar.
 *
 * The device's own safe-area inset is NOT included: tab screens render inside
 * SafeAreaView's bottom padding, so that space is already accounted for in
 * their layout. Only the nav dock — which is absolutely positioned and escapes
 * that padding — adds the inset back itself.
 */
export const NAV_CLEARANCE = scale(72);

/* ------------------------------------------------------------------ *
 * Typography
 * ------------------------------------------------------------------ */

/**
 * Readex Pro carries the display role: H1–H3, the logo wordmark, stat numbers
 * and screen titles. Just Sans carries body/UI: copy, labels, captions, table
 * cells and form inputs.
 *
 * IMPORTANT — Just Sans is a commercial licence and is NOT bundled. Every
 * `body.*` entry below therefore resolves to Inter, which the type spec names
 * as the sanctioned fallback. Drop the licensed JustSans-*.ttf files into
 * assests/fonts, rerun `npx react-native-asset`, and swap the postscript names
 * in `body` — nothing else in the app has to change, because no screen names a
 * font file directly.
 *
 * These strings are PostScript names read out of the TTFs themselves, not
 * filenames. React Native matches on the PostScript name, so a mismatch here
 * fails silently to the system face rather than throwing.
 */
const family = {
  display: {
    medium: 'ReadexPro-Medium', // 500
    bold: 'ReadexPro-SemiBold', // 600
  },
  body: {
    regular: 'Inter-Regular', // 400
    medium: 'Inter-Medium', // 500
    semibold: 'Inter-SemiBold', // 600
    bold: 'Inter-Bold', // 700
    extrabold: 'Inter-ExtraBold', // 800
  },
} as const;

export const fonts = family;

/**
 * Maps a numeric weight onto a concrete bundled face.
 *
 * Android cannot synthesise weights for a custom family: asking for
 * `fontFamily: 'Inter-Regular'` + `fontWeight: '800'` renders regular, not
 * bold. So weight has to be expressed by picking a different file, which is
 * exactly what these helpers do. Callers keep thinking in weights; the mapping
 * happens here in one place.
 *
 * The display face ships in two weights only (500/600), so anything 600+ lands
 * on SemiBold — matching the spec, which asks for no heavier display cut.
 */
export function displayFont(weight: 500 | 600 | 700 | 800 | 900 = 600) {
  return {
    fontFamily: weight >= 600 ? family.display.bold : family.display.medium,
  };
}

export function bodyFont(weight: 400 | 500 | 600 | 700 | 800 | 900 = 400): {
  fontFamily: string;
} {
  if (weight >= 800) return { fontFamily: family.body.extrabold };
  if (weight >= 700) return { fontFamily: family.body.bold };
  if (weight >= 600) return { fontFamily: family.body.semibold };
  if (weight >= 500) return { fontFamily: family.body.medium };
  return { fontFamily: family.body.regular };
}

/**
 * Ready-made text roles from the type scale. Spread one into a StyleSheet
 * entry and override colour/spacing alongside it:
 *
 *   title: { ...type.h2, color: colors.white }
 *
 * Display roles (h1–h3, screenTitle, stat, wordmark) are Readex Pro; the rest
 * are body/UI and resolve through `bodyFont`.
 */
export const type = {
  h1: { ...displayFont(600), fontSize: fontScale(28), lineHeight: fontScale(34) },
  h2: { ...displayFont(600), fontSize: fontScale(22), lineHeight: fontScale(28) },
  h3: { ...displayFont(600), fontSize: fontScale(18), lineHeight: fontScale(24) },
  /** Centred title in AppHeader / ScreenHeader. */
  screenTitle: {
    ...displayFont(600),
    fontSize: fontScale(15),
    lineHeight: fontScale(20),
  },
  /** Big numerals on the wallet, earnings and stat cards. */
  stat: { ...displayFont(600), fontSize: fontScale(20), lineHeight: fontScale(26) },
  wordmark: { ...displayFont(600), fontSize: fontScale(10), lineHeight: fontScale(14) },

  body: { ...bodyFont(400), fontSize: fontScale(14), lineHeight: fontScale(20) },
  bodyStrong: { ...bodyFont(600), fontSize: fontScale(14), lineHeight: fontScale(20) },
  label: { ...bodyFont(600), fontSize: fontScale(13), lineHeight: fontScale(18) },
  caption: { ...bodyFont(500), fontSize: fontScale(11), lineHeight: fontScale(15) },
  input: { ...bodyFont(400), fontSize: fontScale(15), lineHeight: fontScale(20) },
  button: { ...bodyFont(700), fontSize: fontScale(15), lineHeight: fontScale(20) },
} as const;
