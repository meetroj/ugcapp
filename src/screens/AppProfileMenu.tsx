/**
 * The Profile tab: the account card, then the menu grouped into labelled
 * sections (Account, Campaigns/Work, Payments, Support) instead of one long
 * undifferentiated list — each section is its own rounded card, so related
 * destinations read as a set.
 *
 * The outer page is navy like the other tabs so the sheet's rounded top
 * corners actually show against it; painting the page light made the same
 * radius invisible.
 */
import React, { useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import AppHeader from '../components/AppHeader';
import type { AuthUser } from '../api';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  session: AuthUser;
  onNavigate: (path: string) => void;
  onNotifications?: () => void;
  onMessages?: () => void;
  onLogout?: () => void;
};

const ICON = '#5B5CF6';
// Shared stroke props for the row glyphs, so they all read at the same weight.
const S = {
  stroke: ICON,
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Each row's leading glyph, drawn at 20x20 inside the tinted tile. */
const icons = {
  settings: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.2} {...S} />
      <Path
        d="M12 3.2h0a1.7 1.7 0 0 1 1.7 1.7v.4a1.4 1.4 0 0 0 2.1 1.2l.3-.2a1.7 1.7 0 0 1 2.3 2.3l-.2.3a1.4 1.4 0 0 0 1.2 2.1h.4a1.7 1.7 0 0 1 0 3.4h-.4a1.4 1.4 0 0 0-1.2 2.1l.2.3a1.7 1.7 0 0 1-2.3 2.3l-.3-.2a1.4 1.4 0 0 0-2.1 1.2v.4a1.7 1.7 0 0 1-3.4 0v-.4a1.4 1.4 0 0 0-2.1-1.2l-.3.2a1.7 1.7 0 0 1-2.3-2.3l.2-.3a1.4 1.4 0 0 0-1.2-2.1h-.4a1.7 1.7 0 0 1 0-3.4h.4a1.4 1.4 0 0 0 1.2-2.1l-.2-.3a1.7 1.7 0 0 1 2.3-2.3l.3.2a1.4 1.4 0 0 0 2.1-1.2v-.4A1.7 1.7 0 0 1 12 3.2Z"
        {...S}
      />
    </Svg>
  ),
  star: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.8} {...S} />
      <Path
        d="m12 7.4 1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4L12 7.4Z"
        {...S}
      />
    </Svg>
  ),
  portfolio: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={7} width={18} height={13} rx={2.5} {...S} />
      <Path
        d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18"
        {...S}
      />
    </Svg>
  ),
  brief: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" {...S} />
      <Path d="M14 3.5V8h5M9 12.5h6M9 16h4" {...S} />
    </Svg>
  ),
  bids: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} {...S} />
      <Path d="M12 7.5V12l3 1.8" {...S} />
    </Svg>
  ),
  review: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={3} {...S} />
      <Path d="m8.5 12.2 2.4 2.3 4.6-4.8" {...S} />
    </Svg>
  ),
  work: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 6.5h10v9h-10z" {...S} />
      <Path d="M13.5 9.5H17l3.5 3v3h-7z" {...S} />
      <Circle cx={7.5} cy={17.6} r={1.7} {...S} />
      <Circle cx={16.5} cy={17.6} r={1.7} {...S} />
    </Svg>
  ),
  wallet: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={12.5} rx={2.5} {...S} />
      <Path d="M3 10.5h18" {...S} />
      <Circle cx={16.6} cy={14.6} r={1.1} fill={ICON} />
    </Svg>
  ),
  bell: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z" {...S} />
      <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...S} />
    </Svg>
  ),
  shield: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.2 19 6v6c0 4-3 7-7 8.8C8 19 5 16 5 12V6l7-2.8Z" {...S} />
      <Path d="m9 12 2.1 2.1L15.2 10" {...S} />
    </Svg>
  ),
  heart: () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 19.5S4.5 15.3 4.5 10.2a3.9 3.9 0 0 1 7.5-1.5 3.9 3.9 0 0 1 7.5 1.5c0 5.1-7.5 9.3-7.5 9.3Z"
        {...S}
      />
    </Svg>
  ),
};

type Item = {
  label: string;
  sub: string;
  path: string;
  icon: keyof typeof icons;
};
type Section = { title: string; items: Item[] };

const creatorSections: Section[] = [
  {
    title: 'ACCOUNT',
    items: [
      {
        label: 'Account Settings',
        sub: 'Manage your creator account',
        path: '/settings',
        icon: 'settings',
      },
      {
        label: 'Portfolio',
        sub: 'Showcase your best work',
        // The native settings screen manages portfolio videos; /portfolio
        // only exists on the website and would drop the user into the WebView.
        path: '/settings',
        icon: 'portfolio',
      },
      {
        label: 'Reviews',
        sub: 'See what brands say about you',
        path: '/reviews',
        icon: 'star',
      },
    ],
  },
  {
    title: 'WORK',
    items: [
      {
        label: 'My Bids',
        sub: 'Track your campaign bids',
        path: '/my-bids',
        icon: 'bids',
      },
      {
        label: 'Active Work',
        sub: 'Deliver your ongoing deals',
        path: '/my-active-work',
        icon: 'work',
      },
    ],
  },
  {
    title: 'PAYMENTS',
    items: [
      {
        label: 'Payout & Withdrawals',
        sub: 'Manage your earnings',
        path: '/withdrawal',
        icon: 'wallet',
      },
      {
        label: 'Notifications',
        sub: 'Manage your notification preferences',
        path: '/app/notification-settings',
        icon: 'bell',
      },
      {
        label: 'Privacy & Security',
        sub: 'Control your privacy and security',
        path: '/app/privacy-security',
        icon: 'shield',
      },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      {
        label: 'Follow Us',
        sub: 'Stay updated on our socials',
        path: '/app/follow-us',
        icon: 'heart',
      },
    ],
  },
];

const brandSections: Section[] = [
  {
    title: 'ACCOUNT',
    items: [
      {
        label: 'Account Settings',
        sub: 'Manage your brand account',
        path: '/settings',
        icon: 'settings',
      },
      {
        label: 'Reviews',
        sub: 'Manage creator reviews',
        path: '/reviews',
        icon: 'star',
      },
    ],
  },
  {
    title: 'CAMPAIGNS',
    items: [
      {
        label: 'Post a Brief',
        sub: 'Create a new campaign brief',
        path: '/dashboard/business/post-brief',
        icon: 'brief',
      },
      {
        label: 'Pending Bids',
        sub: 'Review creator submissions',
        path: '/dashboard/business/pending-bids',
        icon: 'bids',
      },
      {
        label: 'Work Review',
        sub: 'Review submitted content',
        path: '/dashboard/business/work-review',
        icon: 'review',
      },
      {
        label: 'Shipments',
        sub: 'Manage shipments & tracking',
        path: '/dashboard/business/shipments',
        icon: 'work',
      },
    ],
  },
  {
    title: 'PAYMENTS',
    items: [
      {
        label: 'Wallet',
        sub: 'Manage your balance & payments',
        path: '/dashboard/business/wallet',
        icon: 'wallet',
      },
      {
        label: 'Notifications',
        sub: 'Manage your notification preferences',
        path: '/app/notification-settings',
        icon: 'bell',
      },
      {
        label: 'Privacy & Security',
        sub: 'Control your privacy and security',
        path: '/app/privacy-security',
        icon: 'shield',
      },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      {
        label: 'Follow Us',
        sub: 'Stay updated on our socials',
        path: '/app/follow-us',
        icon: 'heart',
      },
    ],
  },
];

function AppProfileMenu({
  session,
  onNavigate,
  onNotifications,
  onMessages,
  onLogout,
}: Props) {
  // Logging out clears the stored session, so confirm before doing it.
  const confirmLogout = useCallback(() => {
    Alert.alert('Log out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => onLogout?.() },
    ]);
  }, [onLogout]);

  const sections =
    session.role === 'business' ? brandSections : creatorSections;
  const name = String(
    session.nickname ||
      session.username ||
      session.full_name ||
      session.email ||
      'Your profile',
  ).replace(/^@/, '');

  return (
    // The header sits outside the ScrollView so it stays put while the menu
    // scrolls, matching the other main tabs.
    <View style={styles.page}>
      <AppHeader
        title="Profile"
        onNotifications={onNotifications}
        onMessages={onMessages}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.role}>
              {session.role === 'business'
                ? 'Brand account'
                : 'Creator account'}
            </Text>
          </View>
        </View>

        {sections.map(section => {
          return (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.card}>
                {section.items.map((item, index) => {
                  const RowIcon = icons[item.icon];
                  return (
                    <TouchableOpacity
                      key={item.path}
                      style={[
                        styles.row,
                        index === section.items.length - 1 && styles.lastRow,
                      ]}
                      onPress={() => onNavigate(item.path)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View style={styles.rowIcon}>
                        <RowIcon />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {item.sub}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {!!onLogout && (
          <TouchableOpacity
            style={styles.logout}
            onPress={confirmLogout}
            accessibilityRole="button"
            accessibilityLabel="Log Out"
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the fixed header; the rounded sheet covers the rest,
  // so its top corners read against the navy exactly like the other tabs.
  page: { flex: 1, backgroundColor: '#0E1330' },
  screen: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { paddingTop: scale(16), paddingBottom: scale(28) + NAV_CLEARANCE },
  // Sits outside the section cards, below Support, so signing out reads as a
  // standalone action rather than another settings row.
  logout: {
    marginHorizontal: scale(16),
    marginTop: scale(4),
    height: scale(50),
    borderRadius: scale(14),
    backgroundColor: '#FFF0F1',
    borderWidth: 1,
    borderColor: '#FFDDDF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#E5484D',
  },
  profileCard: {
    marginHorizontal: scale(16),
    marginBottom: scale(18),
    padding: scale(18),
    borderRadius: scale(18),
    backgroundColor: '#EEEFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(13),
  },
  avatarText: {
    fontSize: fontScale(19),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  profileText: { flex: 1 },
  name: {
    fontSize: fontScale(18),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  role: { marginTop: scale(3), fontSize: fontScale(12), color: '#777B96' },

  section: { marginBottom: scale(16) },
  sectionTitle: {
    marginHorizontal: scale(22),
    marginBottom: scale(9),
    fontSize: fontScale(11.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#8A8DA6',
  },
  card: {
    marginHorizontal: scale(16),
    borderRadius: scale(18),
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E9F3',
  },
  row: {
    minHeight: scale(64),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E8F0',
  },
  lastRow: { borderBottomWidth: 0 },
  rowIcon: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF0FF',
  },
  rowText: { flex: 1, marginLeft: scale(12), marginRight: scale(8) },
  rowLabel: {
    fontSize: fontScale(14.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#242546',
  },
  rowSub: { marginTop: scale(2), fontSize: fontScale(11.5), color: '#8A8DA6' },
  chevron: { fontSize: fontScale(25), color: '#B6B9CC' },
});

export default AppProfileMenu;
