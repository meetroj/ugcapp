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
import { GoogleIcon } from './icons';

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
}: {
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.google, compact && styles.googleCompact]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <GoogleIcon size={20} />
      <Text style={styles.googleText}>Continue with Google</Text>
    </TouchableOpacity>
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
