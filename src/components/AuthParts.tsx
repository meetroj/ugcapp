/** Small presentational pieces shared by both auth screens. */
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import { colors, radius, scale, fontScale } from '../theme';
import { AppleIcon, GoogleIcon } from './icons';

/** Filled navy call-to-action ("Create Account" / "Log In"). */
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.primary,
        compact && styles.primaryCompact,
        loading && styles.disabled,
      ]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

/** Hairline rules with a centred "OR". */
export function OrDivider({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.divider, compact && styles.dividerCompact]}>
      <View style={styles.rule} />
      <Text style={styles.or}>OR</Text>
      <View style={styles.rule} />
    </View>
  );
}

/** Outlined white button carrying the Google mark. */
export function GoogleButton({
  onPress,
  compact = false,
  iconOnly = false,
}: {
  onPress: () => void;
  compact?: boolean;
  /** Drops the label so the button can share a row. See SocialRow. */
  iconOnly?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.google, compact && styles.googleCompact]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      <GoogleIcon size={20} />
      {!iconOnly && (
        <Text style={styles.googleText}>Continue with Google</Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * Sign in with Apple.
 *
 * Apple's Human Interface Guidelines require the black-on-white or
 * white-on-black treatment, the official mark, and the exact wording "Sign in
 * with Apple" — a restyled button is itself a review rejection. Black fill is
 * used so it reads as at least as prominent as the Google button above it,
 * which guideline 4.8 requires ("equivalent" placement).
 */
export function AppleButton({
  onPress,
  compact = false,
  iconOnly = false,
}: {
  onPress: () => void;
  compact?: boolean;
  /**
   * Drops the label. Apple permits a logo-only button, but NOT a shortened
   * title — "Apple" on its own is not one of the sanctioned strings, so this
   * is the only compliant way to fit the button into a shared row.
   */
  iconOnly?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.apple, compact && styles.appleCompact]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Apple"
    >
      <AppleIcon size={iconOnly ? 20 : 18} />
      {!iconOnly && <Text style={styles.appleText}>Sign in with Apple</Text>}
    </TouchableOpacity>
  );
}

/**
 * Google and Apple side by side, one line, equal width.
 *
 * Only used when both are on offer — that is iPhone, since Apple sign-in is
 * iOS-only. On Android the Google button keeps the full-width labelled form,
 * because there is nothing to share the row with.
 *
 * Equal flex matters beyond looks: guideline 4.8 asks for the Apple option to
 * be presented as an equivalent, so neither may be visually subordinate.
 */
export function SocialRow({
  onGoogle,
  onApple,
  compact = false,
}: {
  onGoogle?: () => void;
  onApple?: () => void;
  compact?: boolean;
}) {
  const both = !!onGoogle && !!onApple;
  if (!onGoogle && !onApple) return null;

  return (
    <View style={both ? styles.socialRow : undefined}>
      {!!onGoogle && (
        <View style={both ? styles.socialItem : undefined}>
          <GoogleButton onPress={onGoogle} compact={compact} iconOnly={both} />
        </View>
      )}
      {!!onApple && (
        <View style={both ? styles.socialItem : undefined}>
          <AppleButton onPress={onApple} compact={compact} iconOnly={both} />
        </View>
      )}
    </View>
  );
}

/** "Already have an account? Sign In" trailer under the card. */
export function SwitchPrompt({
  question,
  action,
  onPress,
  compact = false,
}: {
  question: string;
  action: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.switchRow, compact && styles.switchRowCompact]}>
      <Text style={styles.switchText}>{question} </Text>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.switchAction}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: scale(50),
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(24),
  },
  primaryText: {
    color: colors.white,
    fontSize: fontScale(16),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  primaryCompact: { height: scale(46), marginTop: scale(16) },
  disabled: { opacity: 0.7 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: scale(18) },
  dividerCompact: { marginVertical: scale(12) },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  or: {
    marginHorizontal: scale(12),
    fontSize: fontScale(12),
    color: colors.muted,
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
  },

  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: scale(50),
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  googleText: {
    marginLeft: scale(10),
    fontSize: fontScale(15),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: colors.text,
  },
  googleCompact: { height: scale(46) },

  apple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: scale(50),
    borderRadius: radius.button,
    backgroundColor: '#000000',
  },
  appleText: {
    marginLeft: scale(8),
    fontSize: fontScale(15),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appleCompact: { height: scale(46) },

  socialRow: { flexDirection: 'row', gap: scale(10) },
  // Equal flex, so neither provider reads as the lesser option.
  socialItem: { flex: 1 },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: scale(20),
  },
  switchRowCompact: { marginTop: scale(13) },
  switchText: { fontSize: fontScale(13), color: colors.muted },
  switchAction: {
    fontSize: fontScale(13),
    color: colors.brand,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
});
