/**
 * Labelled text field used by both auth screens.
 * Draws its own leading icon and (for passwords) a trailing show/hide eye,
 * so the screens stay free of icon-library dependencies.
 */
import React, { useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { Text, TextInput } from './Text';
import { colors, radius, scale, fontScale } from '../theme';
import { EyeIcon, GlobeIcon, LockIcon, MailIcon, PersonIcon, PhoneIcon } from './icons';

type Props = TextInputProps & {
  label: string;
  /** Picks the leading glyph and turns on the eye toggle for 'lock'. */
  icon: 'mail' | 'lock' | 'phone' | 'person' | 'globe';
  compact?: boolean;
  /** Tappable text shown before the input, e.g. a country code picker. */
  prefixLabel?: string;
  onPrefixPress?: () => void;
  /** Inline message under the field; also turns the border red. */
  error?: string;
};

function AuthInput({
  label,
  icon,
  compact = false,
  prefixLabel,
  onPrefixPress,
  error,
  ...inputProps
}: Props) {
  const isPassword = icon === 'lock';
  const [hidden, setHidden] = useState(isPassword);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          compact && styles.fieldCompact,
          !!error && styles.fieldError,
        ]}
      >
        <View style={styles.leading}>
          {icon === 'lock' ? (
            <LockIcon />
          ) : icon === 'phone' ? (
            <PhoneIcon />
          ) : icon === 'person' ? (
            <PersonIcon />
          ) : icon === 'globe' ? (
            <GlobeIcon />
          ) : (
            <MailIcon />
          )}
        </View>

        {!!prefixLabel && (
          <TouchableOpacity
            style={styles.prefix}
            onPress={onPrefixPress}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Country code ${prefixLabel}`}
          >
            <Text style={styles.prefixText}>{prefixLabel}</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          {...inputProps}
          returnKeyType={isPassword ? 'done' : inputProps.returnKeyType}
          blurOnSubmit={isPassword}
          onSubmitEditing={event => {
            inputProps.onSubmitEditing?.(event);
            if (isPassword) Keyboard.dismiss();
          }}
        />

        {isPassword && (
          <TouchableOpacity
            style={styles.trailing}
            onPress={() => setHidden(h => !h)}
            // Small glyph, so widen the tap target rather than the icon.
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <EyeIcon crossed={!hidden} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: scale(16) },
  wrapCompact: { marginTop: scale(11) },
  label: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: colors.text,
    marginBottom: scale(6),
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scale(48),
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    paddingHorizontal: scale(12),
  },
  fieldCompact: { height: scale(44) },
  fieldError: { borderColor: '#E5484D' },
  prefix: {
    marginRight: scale(8),
    paddingRight: scale(8),
    borderRightWidth: 1,
    borderRightColor: colors.border,
    justifyContent: 'center',
    minHeight: 32,
  },
  prefixText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: colors.text,
  },
  error: {
    marginTop: scale(5),
    fontSize: fontScale(12),
    color: '#E5484D',
  },
  leading: { marginRight: scale(8) },
  trailing: { marginLeft: scale(8) },
  input: {
    flex: 1,
    fontSize: fontScale(15),
    color: colors.text,
    // Android adds its own vertical padding that misaligns the icon row.
    paddingVertical: 0,
  },
});

export default AuthInput;
