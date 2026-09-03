/**
 * The standard top bar for the main tab screens: the UGCad logo on the left,
 * the screen title centred, and notification + message buttons on the right.
 *
 * Secondary screens (shipments, bids, work review, settings, …) pass `onBack`
 * to swap the logo for a back arrow — same centred title and same action
 * cluster, so those screens keep one consistent bar instead of a second one.
 *
 * The title is absolutely positioned across the full bar so it stays optically
 * centred on the screen regardless of how wide the logo or the action cluster
 * are — laying it out as a flex sibling would push it off-centre whenever the
 * two sides differ in width (they always do).
 *
 * Sits on the navy backdrop the tab screens paint behind their rounded content
 * sheet, so it has no background of its own.
 */
import React from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { scale, fontScale } from '../theme';

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="m14.5 6-5.5 6 5.5 6"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ProfileIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="8"
        r="3.6"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.8 20a7.2 7.2 0 0 1 14.4 0"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function NotificationIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 18.5a2.2 2.2 0 0 0 4 0"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function MessageIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 5h15v10.5h-9L4.5 19V5Z"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AppHeader({
  title,
  onBack,
  onProfile,
  profilePhoto,
  onNotifications,
  onMessages,
  notificationCount = 0,
  unreadMessages = 0,
}: {
  /** Omit (or pass an empty string) for a bar with no centred title. */
  title?: string;
  /** When given, a back arrow replaces the logo on the left. */
  onBack?: () => void;
  /** When given (and there is no back arrow), a profile button sits far left. */
  onProfile?: () => void;
  /**
   * The creator's uploaded profile_photo, already resolved to an absolute URL.
   * Falls back to the outline glyph while it is absent or still loading.
   */
  profilePhoto?: string | null;
  onNotifications?: () => void;
  onMessages?: () => void;
  /** Red bubble on the bell; hidden at 0. */
  notificationCount?: number;
  /** Red bubble on the message icon; hidden at 0. */
  unreadMessages?: number;
}) {
  // With no back arrow and no title, the logo is the only centre content, so
  // it takes the centred slot instead of sitting flush left.
  const centeredLogo = !onBack && !title;

  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BackIcon />
        </TouchableOpacity>
      ) : centeredLogo ? (
        // Logo-only bar (creator Home): centre the mark the same way a title
        // would be, using an overlay so the action cluster's width can't push
        // it off the screen's centre. The left slot holds the profile button
        // when there is one, otherwise a spacer of the same width.
        <>
          {onProfile ? (
            <View style={styles.leftCluster}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onProfile}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {profilePhoto ? (
                  <Image
                    source={{ uri: profilePhoto }}
                    style={styles.profilePhoto}
                  />
                ) : (
                  <ProfileIcon />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.logoSpacer} />
          )}
          <View style={styles.titleWrap} pointerEvents="none">
            <Image
              source={require('../../assests/logo/white-trimmed.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </>
      ) : (
        <Image
          source={require('../../assests/logo/white-trimmed.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      )}

      {/* pointerEvents="none" so the centred title never swallows a tap meant
          for the logo or the action buttons underneath it. Skipped entirely
          when no title is given, e.g. the logo-only Home bar. */}
      {!!title && (
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNotifications}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <NotificationIcon />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onMessages}
          accessibilityRole="button"
          accessibilityLabel="Messages"
        >
          <MessageIcon />
          {unreadMessages > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: scale(58),
    paddingHorizontal: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the screen's navy backdrop shows through.
    backgroundColor: 'transparent',
  },
  // Sized to the mark's own ratio; `contain` fits by height.
  logo: { width: scale(96), height: scale(20) },
  // Balances the actions cluster (two 34pt buttons + 6pt gap) so the header's
  // space-between layout keeps the overlaid logo optically centred. The left
  // cluster below is the same width for the same reason.
  logoSpacer: { width: scale(74), height: scale(34) },
  leftCluster: { width: scale(74), flexDirection: 'row', alignItems: 'center' },
  // Circular crop with a hairline ring so the photo separates from the navy.
  profilePhoto: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#2A2E55',
  },
  // Matches the logo's slot so the centred title stays optically centred.
  backBtn: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: scale(-6),
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  iconBtn: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: scale(14),
    height: scale(14),
    paddingHorizontal: scale(3),
    borderRadius: scale(7),
    backgroundColor: '#FF4D5E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: fontScale(8),
    lineHeight: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
});

export default AppHeader;
