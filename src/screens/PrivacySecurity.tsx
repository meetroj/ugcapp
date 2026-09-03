/**
 * Privacy & Security — native settings screen reached from the profile menu.
 * Sections: Security (account rows), Privacy (marked "Coming soon" until a
 * creator-preferences endpoint exists), Legal & Policies (native documents),
 * Account (deactivate / delete via the account settings screen).
 */
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import ScreenHeader from '../components/ScreenHeader';
import { scale, fontScale } from '../theme';

type RowIconName =
  | 'lock'
  | 'shield'
  | 'eye'
  | 'rupee'
  | 'chat'
  | 'policy'
  | 'terms'
  | 'community'
  | 'cookie'
  | 'pause'
  | 'trash';

/** Row glyphs on a 24x24 grid with a 1.8 stroke, matching `components/icons`. */
function RowIcon({ name, color }: { name: RowIconName; color: string }) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      {name === 'lock' && (
        <>
          <Rect x={4.5} y={10.5} width={15} height={10} rx={2.5} {...line} />
          <Path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" {...line} />
        </>
      )}
      {name === 'shield' && (
        <>
          <Path
            d="M12 3l7 2.8v5.4c0 4.2-2.9 7.7-7 9.3-4.1-1.6-7-5.1-7-9.3V5.8L12 3Z"
            {...line}
          />
          <Path d="m9 12 2 2 4-4" {...line} />
        </>
      )}
      {name === 'eye' && (
        <>
          <Path
            d="M2.8 12S6.1 6 12 6s9.2 6 9.2 6-3.3 6-9.2 6-9.2-6-9.2-6Z"
            {...line}
          />
          <Circle cx={12} cy={12} r={2.8} {...line} />
        </>
      )}
      {name === 'rupee' && (
        <Path d="M8 5h8M8 9h8M14.5 5c0 4-2.4 4.6-6.5 4.6L15 19" {...line} />
      )}
      {name === 'chat' && <Path d="M4.5 5h15v10.5h-9L4.5 19V5Z" {...line} />}
      {name === 'policy' && (
        <>
          <Path d="M6 3.5h7.5L18 8v12.5H6V3.5Z" {...line} />
          <Path d="M13 3.5V8h5" {...line} />
        </>
      )}
      {name === 'terms' && (
        <>
          <Path d="M6 3.5h7.5L18 8v12.5H6V3.5Z" {...line} />
          <Path d="M9 12h6M9 15.5h4" {...line} />
        </>
      )}
      {name === 'community' && (
        <>
          <Circle cx={9} cy={8.5} r={2.8} {...line} />
          <Circle cx={16.5} cy={9.5} r={2.2} {...line} />
          <Path
            d="M3.8 19a5.2 5.2 0 0 1 10.4 0M14 14.6a4.3 4.3 0 0 1 6.2 3.8"
            {...line}
          />
        </>
      )}
      {name === 'cookie' && (
        <>
          <Circle cx={12} cy={12} r={8.6} {...line} />
          <Circle cx={9.6} cy={10} r={1} fill={color} />
          <Circle cx={14.4} cy={13} r={1} fill={color} />
          <Circle cx={10.4} cy={15} r={1} fill={color} />
        </>
      )}
      {name === 'pause' && (
        <>
          <Circle cx={12} cy={12} r={8.6} {...line} />
          <Path d="M10.3 9.4v5.2M13.7 9.4v5.2" {...line} />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path d="M4.8 6.8h14.4M9.5 6.8V4.6h5v2.2" {...line} />
          <Path
            d="M6.6 6.8 7.6 20h8.8l1-13.2M10.3 10.4v6M13.7 10.4v6"
            {...line}
          />
        </>
      )}
    </Svg>
  );
}

/** Right chevron closing every tappable row. */
function Chevron() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9.5 6.5 5.5 5.5-5.5 5.5"
        stroke="#B4B8CC"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * One settings row. `value` renders a trailing pill (e.g. "Off"), `toggle`
 * swaps the chevron for a Switch, `danger` paints the destructive label.
 */
function Row({
  icon,
  iconTint,
  iconBg,
  label,
  hint,
  value,
  toggle,
  on,
  onToggle,
  onPress,
  danger,
  last,
}: {
  icon: RowIconName;
  iconTint: string;
  iconBg: string;
  label: string;
  hint: string;
  value?: string;
  toggle?: boolean;
  on?: boolean;
  onToggle?: (next: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const body = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <RowIcon name={icon} color={iconTint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>
          {label}
        </Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {value ? (
        <View style={styles.valuePill}>
          <Text style={styles.valuePillText}>{value}</Text>
        </View>
      ) : null}
      {toggle ? (
        <Switch
          value={on}
          onValueChange={onToggle}
          accessibilityLabel={label}
          trackColor={{ false: '#E3E5EF', true: '#4D57E3' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#E3E5EF"
        />
      ) : onPress ? (
        <Chevron />
      ) : null}
    </>
  );

  // Toggle rows are not pressable themselves — only the Switch reacts. Rows
  // with no handler (e.g. "Coming soon") render inert rather than as a button
  // that looks tappable but does nothing.
  if (toggle || !onPress) {
    return <View style={[styles.row, last && styles.rowLast]}>{body}</View>;
  }
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.6}
    >
      {body}
    </TouchableOpacity>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function PrivacySecurity({
  onBack,
  onNavigate,
  unread = 0,
}: {
  onBack: () => void;
  onNavigate: (path: string) => void;
  unread?: number;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Privacy & Security"
        onBack={onBack}
        onChat={() => onNavigate('/messages')}
        unread={unread}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle>Security</SectionTitle>
        <View style={styles.card}>
          <Row
            icon="lock"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Change Password"
            hint="Update your account password"
            onPress={() => onNavigate('/settings')}
          />
          <Row
            icon="shield"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Two-Factor Authentication"
            hint="Managed on ugcad.io — the app can't read or change it"
            onPress={() =>
              Linking.openURL('https://www.ugcad.io/settings').catch(() => {})
            }
            last
          />
        </View>

        {/* The backend has no privacy-preferences endpoint yet. These render
            as "Coming soon" rather than as switches that silently reset —
            flipping a privacy control that saves nothing is worse than none. */}
        <SectionTitle>Privacy</SectionTitle>
        <View style={styles.card}>
          <Row
            icon="eye"
            iconTint="#12B76A"
            iconBg="#E7F8F0"
            label="Public Profile"
            hint="Let brands discover your profile"
            value="Coming soon"
          />
          <Row
            icon="rupee"
            iconTint="#F79009"
            iconBg="#FEF4E6"
            label="Show Earnings"
            hint={'Display total earned on\nyour public profile'}
            value="Coming soon"
          />
          <Row
            icon="chat"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Allow Direct Messages"
            hint={'Let brands message you\nwithout a deal'}
            value="Coming soon"
            last
          />
        </View>

        <SectionTitle>Legal &amp; Policies</SectionTitle>
        <View style={styles.card}>
          <Row
            icon="policy"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Privacy Policy"
            hint="How we collect, use and protect your data"
            onPress={() => onNavigate('/privacy-policy')}
          />
          <Row
            icon="terms"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Terms and Conditions"
            hint="The rules for using the UGCad.io platform"
            onPress={() => onNavigate('/terms')}
          />
          <Row
            icon="community"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Community Guidelines"
            hint="Standards for creators and brands"
            onPress={() => onNavigate('/community-guidelines')}
          />
          <Row
            icon="cookie"
            iconTint="#5B5CF6"
            iconBg="#EEEFFF"
            label="Cookie Policy"
            hint="How cookies and tracking are used"
            onPress={() => onNavigate('/cookie-policy')}
            last
          />
        </View>

        <SectionTitle>Account</SectionTitle>
        <View style={styles.card}>
          <Row
            icon="pause"
            iconTint="#F79009"
            iconBg="#FEF4E6"
            label="Deactivate Account"
            hint="Temporarily hide your profile"
            onPress={() => onNavigate('/settings')}
          />
          <Row
            icon="trash"
            iconTint="#E5484D"
            iconBg="#FDECEC"
            label="Delete Account"
            hint={'Permanently remove your account\nand all data'}
            onPress={() => onNavigate('/settings')}
            danger
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  // The page sits on a light sheet, rounded at the top only.
  body: {
    flex: 1,
    backgroundColor: '#F5F6FB',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { paddingTop: scale(4), paddingBottom: scale(26) },
  sectionTitle: {
    marginTop: scale(18),
    marginBottom: scale(9),
    marginHorizontal: scale(20),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#7A7F99',
  },
  card: {
    marginHorizontal: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9EAF3',
    overflow: 'hidden',
  },
  row: {
    minHeight: scale(64),
    paddingVertical: scale(11),
    paddingHorizontal: scale(13),
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EAF3',
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, marginLeft: scale(12), marginRight: scale(8) },
  rowLabel: {
    fontSize: fontScale(13.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1E2044',
  },
  rowLabelDanger: { color: '#E5484D' },
  rowHint: { marginTop: scale(2), fontSize: fontScale(11), lineHeight: fontScale(15), color: '#8A8FA8' },
  valuePill: {
    marginRight: scale(8),
    paddingHorizontal: scale(9),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#F0F1F7',
  },
  valuePillText: {
    fontSize: fontScale(10),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#7A7F99',
  },
});

export default PrivacySecurity;
