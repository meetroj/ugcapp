/**
 * Two-up segmented control choosing whether the new account is a Creator or a
 * Brand. Selection tints the chip and its icon with the brand blue.
 */
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import { colors, radius, scale, fontScale } from '../theme';
import { BuildingIcon, PersonIcon } from './icons';

export type Role = 'creator' | 'brand';

type Props = {
  value: Role;
  onChange: (role: Role) => void;
  compact?: boolean;
};

function RoleSelector({ value, onChange, compact = false }: Props) {
  const chips: { role: Role; label: string }[] = [
    { role: 'creator', label: 'Creator' },
    { role: 'brand', label: 'Brand' },
  ];

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {chips.map(({ role, label }) => {
        const selected = value === role;
        const tint = selected ? colors.brand : colors.muted;

        return (
          <TouchableOpacity
            key={role}
            style={[
              styles.chip,
              compact && styles.chipCompact,
              selected && styles.chipSelected,
            ]}
            onPress={() => onChange(role)}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            {role === 'creator' ? (
              <PersonIcon color={tint} />
            ) : (
              <BuildingIcon color={tint} />
            )}
            <Text style={[styles.label, { color: tint }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: scale(12), marginTop: scale(20) },
  rowCompact: { marginTop: scale(14) },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    height: scale(48),
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  chipCompact: { height: scale(44) },
  label: { fontSize: fontScale(14), fontFamily: 'Inter-SemiBold', fontWeight: '600' },
});

export default RoleSelector;
