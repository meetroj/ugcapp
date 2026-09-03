/**
 * Shared chrome for the auth screens: the signage photo sits at the top and the
 * rounded card floats below it, inset from the screen edges.
 *
 * The photo is absolutely positioned so the card can ride up over its bottom
 * edge. Its height is a share of the viewport, which keeps the composition
 * consistent from small phones to tablets. The screen is edge-to-edge on RN
 * 0.87, so the photo deliberately runs under the status bar, while a
 * SafeAreaView reserves the bottom inset to keep the card off the nav bar.
 */
import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from './Text';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { colors, radius, scale, fontScale } from '../theme';

/** Intrinsic pixel size of the signage photo, used to preserve its ratio. */
const IMAGE_W = 870;
const IMAGE_H = 1548;

/**
 * How far down the photo the card's top edge sits, as a fraction of the photo's
 * own rendered height. The photo is drawn whole at full screen width, so it is
 * taller than the space above the card; the card overlaps its lower part and
 * the screen scrolls, which is what keeps the signage large and uncropped.
 *
 * The signage occupies the top ~30% of this image (measured: rows 107-460 of
 * 1548), so anything above ~0.35 keeps the whole sign clear of the card.
 */
const CARD_OVERLAP_AT = 0.34;

/**
 * Nudges the photo down from the top of the screen. The strip it leaves above
 * is painted with colors.backdrop, sampled from the photo's own top edge, so
 * the join reads as one continuous field.
 */
const PHOTO_OFFSET_Y = scale(28);

/** Ceiling on how far down the screen the card may start. */
const MAX_SPACER_RATIO = 0.34;

/**
 * Floor for the bottom gap under the card. Android does not always report a
 * bottom inset (it depends on the window flags and on gesture-vs-button
 * navigation), and a reported 0 would drop the card straight onto the nav bar,
 * so the larger of this and the real inset is used.
 */
const MIN_BOTTOM_GAP = scale(48);

/** Gap between the card and the left/right screen edges. */
const CARD_INSET = scale(16);

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  compact?: boolean;
};

function AuthLayout({ title, subtitle, children, compact = false }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Keep the photo's natural height when it already fills the viewport. On
  // taller devices, extend its box to the full screen and use `cover` so the
  // card never reaches a differently coloured fallback strip at the bottom.
  const photoWidth = width;
  const photoHeight = photoWidth * (IMAGE_H / IMAGE_W);
  const backgroundHeight = Math.max(photoHeight, height) + PHOTO_OFFSET_Y;
  // Card starts partway down the photo and covers the rest of it. On wide
  // screens the photo grows very tall, so the start point is also capped as a
  // share of the viewport — otherwise the card would open below the fold.
  const spacer =
    Math.min(photoHeight * CARD_OVERLAP_AT, height * MAX_SPACER_RATIO) +
    PHOTO_OFFSET_Y;

  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'right', 'bottom', 'left']}
    >
      {/*
        The photo is drawn whole at full screen width — no crop, no side bars.
        It covers the entire auth viewport so the card cannot reach a separate
        solid-colour strip below it. Tall screens use a small centred crop.
      */}
      <Image
        source={require('../../assests/new-auth.png')}
        style={[
          styles.bg,
          { width: photoWidth, height: backgroundHeight, top: PHOTO_OFFSET_Y },
        ]}
        resizeMode="cover"
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={!compact}
        >
          <View style={{ height: spacer }} />

          {/*
            The gap lives on the card itself, not on the scroll content: content
            padding sits OUTSIDE the card, so it left the card's own bottom edge
            — and the "Sign In" row inside it — flush against the nav bar.
          */}
          <View
            style={[
              styles.card,
              compact && styles.cardCompact,
              { marginBottom: Math.max(insets.bottom, MIN_BOTTOM_GAP) },
            ]}
          >
            <Text style={[styles.title, compact && styles.titleCompact]}>
              {title}
            </Text>
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
              {subtitle}
            </Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Shows through in the gutters beside the card; matches the photo's blue.
  root: { flex: 1, backgroundColor: colors.backdrop },
  flex: { flex: 1 },
  bg: {
    position: 'absolute',
    // `top` is supplied inline: it carries PHOTO_OFFSET_Y.
    left: 0,
  },
  scroll: { flexGrow: 1 },
  card: {
    // Deliberately NOT flexGrow: growing to fill the leftover space would push
    // the card's rounded bottom edge past the scroll padding and under the
    // system nav bar. It sizes to its content instead.
    marginHorizontal: CARD_INSET,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: scale(20),
    paddingTop: scale(24),
    paddingBottom: scale(24),
    // Lifts the card off the photo/backdrop behind it.
    shadowColor: '#0B1030',
    shadowOpacity: 0.18,
    shadowRadius: scale(20),
    shadowOffset: { width: 0, height: scale(8) },
    elevation: 8,
  },
  cardCompact: { paddingTop: scale(17), paddingBottom: scale(16) },
  title: {
    fontSize: fontScale(24),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  titleCompact: { fontSize: fontScale(22) },
  subtitle: {
    marginTop: scale(6),
    fontSize: fontScale(13),
    color: colors.brand,
    textAlign: 'center',
  },
  subtitleCompact: { marginTop: scale(4), fontSize: fontScale(12) },
});

export default AuthLayout;
