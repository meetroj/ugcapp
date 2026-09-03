/**
 * The bell dropdown — a panel that slides down from the header listing the
 * notifications the user has actually received. This is NOT the preferences
 * screen; that is `NotificationSettings` (the Notifications tab of Settings).
 *
 * Mirrors the website's NotificationBell: reads /notifications/my-notifications,
 * polls the unread count, and marks items read on tap.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { SkeletonBlock } from '../components/Skeleton';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  visible: boolean;
  onClose: () => void;
  /** Opens a notification's deep link in the WebView. */
  onNavigate?: (path: string) => void;
  /** Lets the parent refresh its badge after reads happen in here. */
  onUnreadChange?: () => void;
};

/** "3h ago" / "2d ago" — same granularity as the website's list. */
function timeAgo(value?: string) {
  if (!value) return '';
  const then = Date.parse(value);
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

const TYPE_COLORS: Record<string, string> = {
  success: '#3E9E63',
  warning: '#E08A3C',
  error: '#E23B3B',
  info: '#4A5BE0',
};

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 6.5l11 11M17.5 6.5l-11 11"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
        stroke="#FFFFFF"
        strokeWidth={1.8}
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

function NotificationFeed({
  token,
  visible,
  onClose,
  onNavigate,
  onUnreadChange,
}: Props) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  // useWindowDimensions, not Dimensions.get: the panel is sized from the
  // viewport height, and a one-off read would keep the old height after a
  // rotation or a split-screen resize.
  const { height } = useWindowDimensions();
  // Belt and braces: if the provider reports no inset (which some Android
  // modal configurations do), fall back to the measured status-bar height so
  // the panel still clears the clock instead of sitting under it.
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  );

  const load = useCallback(() => {
    setFailed(false);
    getNotifications(token)
      .then(setItems)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!visible) {
      slide.setValue(0);
      return;
    }
    setLoading(true);
    load();
    Animated.timing(slide, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, load, slide]);

  const openItem = useCallback(
    (item: AppNotification) => {
      if (!item.read) {
        // Optimistic: the row un-bolds immediately, the PATCH follows.
        setItems(current =>
          current.map(n => (n.id === item.id ? { ...n, read: true } : n)),
        );
        markNotificationRead(token, item.id)
          .then(() => onUnreadChange?.())
          .catch(() => undefined);
      }
      if (item.link) {
        onClose();
        onNavigate?.(item.link);
      }
    },
    [token, onClose, onNavigate, onUnreadChange],
  );

  const markAll = useCallback(() => {
    setItems(current => current.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(token)
      .then(() => onUnreadChange?.())
      .catch(() => undefined);
  }, [token, onUnreadChange]);

  const unread = items.filter(n => !n.read).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Without these the Android modal gets its own window that stops below
      // the system bars, so useSafeAreaInsets() reports 0 inside it and the
      // panel's own inset maths does nothing. Spanning the full window makes
      // the insets real, which is what pushes the panel clear of the clock.
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Tapping the dimmed area behind the panel closes it. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.panel,
            // A Modal renders above the app's SafeAreaView, so the status-bar
            // inset has to be added here or the panel slides under the clock.
            // maxHeight is measured from the panel's own top edge, so both
            // insets come off it to keep the bottom clear of the nav bar.
            {
              top: topInset + 8,
              maxHeight: height - topInset - insets.bottom - 24,
              opacity: slide,
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Swallow taps inside the panel so they don't reach the backdrop. */}
          <Pressable>
            <View style={styles.head}>
              <View style={styles.headLeft}>
                <BellIcon />
                <Text style={styles.headTitle}>Notifications</Text>
                {unread > 0 && (
                  <View style={styles.headCount}>
                    <Text style={styles.headCountText}>{unread}</Text>
                  </View>
                )}
              </View>
              <View style={styles.headRight}>
                {unread > 0 && (
                  <TouchableOpacity
                    onPress={markAll}
                    accessibilityRole="button"
                  >
                    <Text style={styles.markAll}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <CloseIcon />
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              // Matches the row below: a small status dot, then the title and
              // body lines, so the panel does not resize once items land.
              <View style={styles.list}>
                {[0, 1, 2, 3, 4].map(index => (
                  <View key={index} style={styles.item}>
                    <SkeletonBlock width={8} height={8} radius={4} />
                    <View style={styles.itemText}>
                      <SkeletonBlock width="70%" height={12} />
                      <SkeletonBlock
                        width="90%"
                        height={10}
                        style={styles.skeletonGap}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : failed ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>
                  Couldn&apos;t load notifications.
                </Text>
                <TouchableOpacity onPress={load} accessibilityRole="button">
                  <Text style={styles.retry}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>No notifications yet.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
              >
                {items.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.item, !item.read && styles.itemUnread]}
                    onPress={() => openItem(item)}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            TYPE_COLORS[item.type || 'info'] || '#4A5BE0',
                          opacity: item.read ? 0.25 : 1,
                        },
                      ]}
                    />
                    <View style={styles.itemText}>
                      <View style={styles.itemTop}>
                        <Text
                          style={[
                            styles.itemTitle,
                            !item.read && styles.itemTitleUnread,
                          ]}
                          numberOfLines={1}
                        >
                          {item.title || 'Notification'}
                        </Text>
                        {item.source === 'admin' && (
                          <View style={styles.chip}>
                            <Text style={styles.chipText}>
                              {item.sender_label || 'Admin'}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!item.message && (
                        <Text style={styles.itemBody} numberOfLines={2}>
                          {item.message}
                        </Text>
                      )}
                      <Text style={styles.itemTime}>
                        {timeAgo(item.created_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,12,40,0.35)' },
  panel: {
    position: 'absolute',
    // `top` is set at render time from the safe-area inset.
    left: scale(10),
    right: scale(10),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#0A0C28',
    shadowOpacity: 0.25,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: scale(8) },
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(14),
    height: scale(50),
    backgroundColor: '#1B2A6B',
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  headTitle: {
    color: '#FFFFFF',
    fontSize: fontScale(14.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  headCount: {
    minWidth: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    paddingHorizontal: scale(6),
    backgroundColor: '#FF4057',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headCountText: {
    color: '#FFFFFF',
    fontSize: fontScale(10),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  markAll: {
    color: '#C3C8E4',
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  // "Mark all read" and the close cross share the right end of the header.
  headRight: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  closeBtn: { alignItems: 'center', justifyContent: 'center' },
  state: { padding: scale(28), alignItems: 'center', gap: scale(8) },
  stateText: { color: '#777B96', fontSize: fontScale(13) },
  retry: {
    color: '#4A5BE0',
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  list: { maxHeight: scale(460) },
  item: {
    flexDirection: 'row',
    gap: scale(10),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F7',
  },
  itemUnread: { backgroundColor: '#F5F6FF' },
  dot: { width: scale(8), height: scale(8), borderRadius: scale(8), marginTop: scale(5) },
  skeletonGap: { marginTop: scale(8) },
  itemText: { flex: 1 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  itemTitle: {
    flex: 1,
    fontSize: fontScale(13.5),
    color: '#15163F',
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
  },
  itemTitleUnread: { fontFamily: 'ReadexPro-SemiBold', fontWeight: '800' },
  chip: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
    borderRadius: scale(8),
    backgroundColor: '#EEEFFF',
  },
  chipText: {
    fontSize: fontScale(9.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4A5BE0',
  },
  itemBody: { fontSize: fontScale(12), color: '#777B96', marginTop: scale(3), lineHeight: fontScale(16) },
  itemTime: { fontSize: fontScale(10.5), color: '#9BA0BC', marginTop: scale(5) },
});

export default NotificationFeed;
