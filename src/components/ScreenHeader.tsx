/**
 * Dark navy top bar shared by the secondary app screens: back arrow, centred
 * title, and a chat button carrying an unread badge.
 */
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import Svg, { Path } from 'react-native-svg';
import { scale, fontScale } from '../theme';

function ScreenHeader({
  title,
  onBack,
  onChat,
  unread = 0,
}: {
  title: string;
  onBack: () => void;
  onChat?: () => void;
  unread?: number;
}) {
  // No inset padding here: every screen using this header renders inside
  // WebShell's SafeAreaView (top edge), which already clears the status bar.
  // Adding insets.top again doubled the header height on every screen.
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="m14.5 6-5.5 6 5.5 6"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* No handler means no button: a chat icon that does nothing is a dead
          control. The spacer keeps the title centred. */}
      {onChat ? (
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onChat}
        accessibilityRole="button"
        accessibilityLabel="Messages"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4.5 5h15v10.5h-9L4.5 19V5Z"
            stroke="#FFFFFF"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      ) : (
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: scale(54),
    paddingHorizontal: scale(8),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the screen's dark backdrop shows through; the rounded
    // content sheet below supplies the curve.
    backgroundColor: 'transparent',
  },
  iconBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex + centre: a long title ellipsizes between the two buttons instead of
    // shoving the chat button off the edge on a 320pt screen.
    flex: 1,
    textAlign: 'center',
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    right: scale(3),
    top: scale(3),
    minWidth: scale(15),
    height: scale(15),
    paddingHorizontal: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#FF4057',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default ScreenHeader;
