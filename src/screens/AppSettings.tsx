/**
 * Settings — the hub reached from the Profile tab's Settings row. Four cards:
 * Profile, Notifications, Follow Us, Privacy. Each one just routes; the actual
 * screens already exist (NotificationSettings, FollowUs, PrivacySecurity) or
 * live on the web (/settings for editing profile fields).
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { scale, fontScale } from '../theme';

type Props = {
  onBack: () => void;
  onNavigate: (path: string) => void;
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
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8" r="3.6" {...line} />
          <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" {...line} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path
            d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
            {...line}
          />
          <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...line} />
        </>
      )}
      {name === 'share' && (
        <>
          <Circle cx="17.5" cy="6" r="2.5" {...line} />
          <Circle cx="6.5" cy="12" r="2.5" {...line} />
          <Circle cx="17.5" cy="18" r="2.5" {...line} />
          <Path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5" {...line} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Path
            d="M6 10.5h12V20H6zM8.6 10.5V7.8a3.4 3.4 0 0 1 6.8 0v2.7"
            {...line}
          />
          <Circle cx="12" cy="15" r="1.2" fill={color} />
        </>
      )}
    </Svg>
  );
}

const ITEMS = [
  {
    label: 'Profile',
    caption: 'Edit your profile information',
    icon: 'person',
    tint: '#5B5CF6',
    bg: '#EEEFFF',
    path: '/settings',
  },
  {
    label: 'Notifications',
    caption: 'Manage your notification preferences',
    icon: 'bell',
    tint: '#2F80ED',
    bg: '#E4F0FF',
    path: '/app/notification-settings',
  },
  {
    label: 'Follow Us',
    caption: 'Follow us on social media',
    icon: 'share',
    tint: '#1FA971',
    bg: '#E2F7EE',
    path: '/app/follow-us',
  },
  {
    label: 'Privacy',
    caption: 'Privacy policy and data settings',
    icon: 'lock',
    tint: '#E8833A',
    bg: '#FFEEDF',
    path: '/app/privacy-security',
  },
] as const;

function AppSettings({ onBack, onNavigate }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#15163F" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {ITEMS.map(item => (
          <TouchableOpacity
            key={item.path}
            style={styles.row}
            onPress={() => onNavigate(item.path)}
            accessibilityRole="button"
          >
            <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
              <Icon name={item.icon} color={item.tint} size={19} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowCaption}>{item.caption}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  content: { padding: scale(16), gap: scale(12) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  rowIcon: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, marginLeft: scale(13) },
  rowLabel: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  rowCaption: { marginTop: scale(3), fontSize: fontScale(12), color: '#777B96' },
  chevron: { fontSize: fontScale(24), color: '#B9BCCC' },
});

export default AppSettings;
