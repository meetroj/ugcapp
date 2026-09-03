/**
 * Creator profile — the native screen behind the Profile tab.
 *
 * Replaces the plain menu list with the app design: banner + avatar header,
 * verified badge, the deliverables/languages counts, and the account menu.
 *
 * Everything is assembled from endpoints that already exist:
 *   GET /api/auth/me           -> the user doc (name, banner, photo, counts)
 *   GET /api/chat/conversations -> summed for the Messages row badge
 * The banner and avatar buttons open the device gallery and upload in place:
 * POST /api/profile/upload-banner and /api/profile/upload-photo each store the
 * file AND write the field, so no follow-up save call is needed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { launchImageLibrary } from 'react-native-image-picker';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  BACKEND_URL,
  getChatUnreadCount,
  getMe,
  uploadMedia,
  type AuthUser,
} from '../api';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Props = {
  token: string;
  session: AuthUser;
  onNavigate: (path: string) => void;
  /** Clears the session and returns to the login screen. */
  onLogout?: () => void;
};

const assetUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path.trim()) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  // blob:/data: refs come from an abandoned web upload and never resolve here.
  if (path.startsWith('blob:') || path.startsWith('data:')) {
    return null;
  }
  return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

const firstOf = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && value) {
      return String(value);
    }
  }
  return '';
};

/** Flattens "Hindi, English" strings and arrays into one de-duplicated list. */
const toList = (...values: unknown[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (typeof item === 'string' && item.trim()) {
          out.push(item.trim());
        }
      });
    } else if (typeof value === 'string' && value.trim()) {
      value.split(',').forEach(part => {
        if (part.trim()) {
          out.push(part.trim());
        }
      });
    }
  }
  return Array.from(new Set(out));
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
      {name === 'camera' && (
        <>
          <Path d="M3.5 8.5h3l1.6-2.4h7.8l1.6 2.4h3v10.5h-17Z" {...line} />
          <Circle cx="12" cy="13.4" r="3.4" {...line} />
        </>
      )}
      {name === 'check' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...line} />
          <Path d="m8.4 12.2 2.5 2.5 4.7-5" {...line} />
        </>
      )}
      {name === 'briefcase' && (
        <>
          <Rect x={3} y={7.5} width={18} height={12.5} rx={2.5} {...line} />
          <Path
            d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18"
            {...line}
          />
        </>
      )}
      {name === 'star' && (
        <Path
          d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85Z"
          {...line}
        />
      )}
      {name === 'chat' && (
        <>
          <Path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"
            {...line}
          />
          <Circle cx="8.8" cy="10" r=".9" fill={color} />
          <Circle cx="12" cy="10" r=".9" fill={color} />
          <Circle cx="15.2" cy="10" r=".9" fill={color} />
        </>
      )}
      {name === 'bookmark' && (
        <Path d="M6.5 4.5h11v15l-5.5-4-5.5 4Z" {...line} />
      )}
      {name === 'shield' && (
        <>
          <Path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6Z" {...line} />
          <Path d="m9.2 12 2 2 3.6-3.8" {...line} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3" {...line} />
          <Path
            d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"
            {...line}
          />
        </>
      )}
      {name === 'logout' && (
        <>
          <Path d="M14 4.5H6.5v15H14" {...line} />
          <Path d="M11 12h9m0 0-3.2-3.2M20 12l-3.2 3.2" {...line} />
        </>
      )}
    </Svg>
  );
}

/** Rounded square icon tile used on every menu row. */
function MenuIcon({
  name,
  tint,
  bg,
}: {
  name: string;
  tint: string;
  bg: string;
}) {
  return (
    <View style={[styles.menuIcon, { backgroundColor: bg }]}>
      <Icon name={name} color={tint} size={19} />
    </View>
  );
}

function CreatorProfile({ token, session, onNavigate, onLogout }: Props) {
  const [me, setMe] = useState<Record<string, any>>(session as any);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Which image is mid-upload, so the tapped button can show a spinner and
  // both are locked against a second tap.
  const [uploading, setUploading] = useState<'banner' | 'photo' | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      getMe(token),
      getChatUnreadCount(token),
    ]);

    if (results[0].status === 'fulfilled') {
      setMe(results[0].value || {});
    }
    if (results[1].status === 'fulfilled') {
      setUnread(results[1].value);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    load().finally(() => {
      if (active) {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  /**
   * Picks an image and uploads it as the banner or the avatar. Both endpoints
   * persist the field themselves, so this reloads /auth/me afterwards rather
   * than guessing the new URL — that also picks up any transform the backend
   * applied to the stored path.
   */
  const pickAndUpload = useCallback(
    async (kind: 'banner' | 'photo') => {
      if (uploading) {
        return;
      }
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });
      // A cancelled picker is the normal way out, not an error.
      if (result.didCancel) {
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        if (result.errorMessage) {
          Alert.alert('Could not open your photos', result.errorMessage);
        }
        return;
      }

      setUploading(kind);
      try {
        await uploadMedia(
          token,
          { uri: asset.uri, fileName: asset.fileName, type: asset.type },
          kind,
        );
        await load();
      } catch (err) {
        // The backend OCR-scans uploads and rejects images carrying contact
        // details, so its message is worth showing verbatim.
        Alert.alert(
          kind === 'banner' ? 'Banner not updated' : 'Photo not updated',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setUploading(null);
      }
    },
    [load, token, uploading],
  );

  const profile = (me.profile || {}) as Record<string, any>;

  const name = firstOf(
    profile.fullName,
    profile.full_name,
    me.full_name,
    me.nickname,
    me.username,
    (me.email || '').split('@')[0],
    'Creator',
  ).replace(/^@/, '');

  const publicId = firstOf(me.public_creator_id, me.creator_code);
  const location = firstOf(
    profile.city && profile.country
      ? `${profile.city}, ${profile.country}`
      : '',
    profile.location,
    me.location,
    profile.city,
    profile.city_tier,
    me.city_tier,
  );
  const verified = Boolean(me.kyc_verified);
  const banner = assetUrl(firstOf(me.banner, profile.banner));
  const photo = assetUrl(
    firstOf(me.profile_photo, me.profile_picture, profile.profile_picture),
  );

  const languages = toList(
    me.languages,
    profile.languages,
    me.content_languages,
    profile.content_languages,
  );
  const deliverables = Number(me.deliverables_completed || 0);

  const menu: Array<{
    label: string;
    caption: string;
    icon: string;
    tint: string;
    bg: string;
    path: string;
    badge?: number;
  }> = [
    {
      label: 'My Deals',
      caption: 'View and manage your deals',
      icon: 'briefcase',
      tint: '#5B5CF6',
      bg: '#EEEFFF',
      path: '/my-deals',
    },
    {
      label: 'Reviews',
      caption: 'See your reviews and ratings',
      icon: 'star',
      tint: '#F0A81C',
      bg: '#FFF4DE',
      path: '/reviews',
    },
    {
      label: 'Messages',
      caption: 'View messages from brands',
      icon: 'chat',
      tint: '#2F80ED',
      bg: '#E4F0FF',
      path: '/messages',
      badge: unread,
    },
    {
      label: 'Saved',
      caption: 'Your saved deals and briefs',
      icon: 'bookmark',
      tint: '#1FA971',
      bg: '#E2F7EE',
      path: '/saved-briefs',
    },
    {
      label: 'Verify KYC',
      caption: 'Verify your identity',
      icon: 'shield',
      tint: '#E8833A',
      bg: '#FFEEDF',
      path: '/kyc',
    },
    {
      label: 'Settings',
      caption: 'Manage your account settings',
      icon: 'settings',
      tint: '#5B5CF6',
      bg: '#EEEFFF',
      path: '/app/settings',
    },
  ];

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#5B5CF6" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Banner, with the avatar overlapping its bottom edge below. */}
      <View style={styles.bannerWrap}>
        {banner ? (
          <Image source={{ uri: banner }} style={styles.banner} />
        ) : (
          <View style={[styles.banner, styles.bannerFallback]} />
        )}
        <TouchableOpacity
          style={styles.bannerBtn}
          onPress={() => pickAndUpload('banner')}
          disabled={uploading !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: uploading !== null }}
        >
          {uploading === 'banner' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="camera" color="#FFFFFF" size={15} />
          )}
          <Text style={styles.bannerBtnText}>
            {uploading === 'banner' ? 'Uploading…' : 'Change banner'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatarRow}>
          <View>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => pickAndUpload('photo')}
              disabled={uploading !== null}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              accessibilityState={{ disabled: uploading !== null }}
            >
              {uploading === 'photo' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="camera" color="#FFFFFF" size={14} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {verified && (
            <View style={styles.verified}>
              <Icon name="check" color="#1FA971" size={14} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        <Text style={styles.meta}>
          {[publicId ? `ID: ${publicId}` : '', location]
            .filter(Boolean)
            .join(' · ') || 'Complete your profile to appear to brands'}
        </Text>

        <View style={styles.countRow}>
          <Text style={styles.countValue}>
            {deliverables}
            <Text style={styles.countLabel}> deliverables</Text>
          </Text>
          <Text style={styles.countValue}>
            {languages.length}
            <Text style={styles.countLabel}>
              {languages.length === 1 ? ' language' : ' languages'}
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.menu}>
        {menu.map(row => (
          <TouchableOpacity
            key={row.path}
            style={styles.menuRow}
            onPress={() => onNavigate(row.path)}
            accessibilityRole="button"
          >
            <MenuIcon name={row.icon} tint={row.tint} bg={row.bg} />
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{row.label}</Text>
              <Text style={styles.menuCaption}>{row.caption}</Text>
            </View>
            {row.badge ? (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>
                  {row.badge > 99 ? '99+' : row.badge}
                </Text>
              </View>
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.menuRow, styles.logoutRow]}
          onPress={onLogout}
          accessibilityRole="button"
        >
          <MenuIcon name="logout" tint="#E5484D" bg="#FFE6E7" />
          <View style={styles.menuText}>
            <Text style={[styles.menuLabel, styles.logoutLabel]}>Log Out</Text>
            <Text style={styles.menuCaption}>Sign out from your account</Text>
          </View>
          <Text style={[styles.chevron, styles.logoutLabel]}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const BANNER_HEIGHT = scale(132);
const AVATAR = scale(92);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  // NAV_CLEARANCE keeps the last row (Log Out) clear of the floating nav pill,
  // which is absolutely positioned and would otherwise cover it.
  content: { paddingBottom: scale(28) + NAV_CLEARANCE },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7FD',
  },

  bannerWrap: { height: BANNER_HEIGHT, backgroundColor: '#2A2BC4' },
  banner: { width: '100%', height: BANNER_HEIGHT },
  bannerFallback: { backgroundColor: '#2A2BC4' },
  bannerBtn: {
    position: 'absolute',
    right: scale(14),
    bottom: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: scale(12),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: '#101340',
  },
  bannerBtnText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  identity: { paddingHorizontal: scale(16) },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: -(AVATAR / 2),
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#DCDEF4',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: {
    fontSize: fontScale(30),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  avatarBtn: {
    position: 'absolute',
    right: 0,
    bottom: scale(2),
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101340',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nameRow: {
    marginTop: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  name: {
    fontSize: fontScale(26),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    flexShrink: 1,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    paddingHorizontal: scale(10),
    height: scale(26),
    borderRadius: scale(13),
    backgroundColor: '#E2F7EE',
  },
  verifiedText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1FA971',
  },
  meta: { marginTop: scale(5), fontSize: fontScale(12.5), color: '#777B96' },

  countRow: { marginTop: scale(10), flexDirection: 'row', gap: scale(22) },
  countValue: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  countLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#777B96',
  },

  menu: { marginTop: scale(20), paddingHorizontal: scale(16), gap: scale(12) },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  menuIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, marginLeft: scale(12) },
  menuLabel: {
    fontSize: fontScale(14.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  menuCaption: { marginTop: scale(3), fontSize: fontScale(12), color: '#777B96' },
  menuBadge: {
    minWidth: scale(24),
    height: scale(22),
    paddingHorizontal: scale(6),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B4E',
  },
  menuBadgeText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chevron: { fontSize: fontScale(24), color: '#B9BCCC' },
  logoutRow: { backgroundColor: '#FFF0F1', borderColor: '#FFDDDF' },
  logoutLabel: { color: '#E5484D' },
});

export default CreatorProfile;
