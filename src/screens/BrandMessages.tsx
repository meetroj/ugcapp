/**
 * Messages — the native conversation list replacing the web /messages page.
 * Reads GET /api/chat/conversations, which already returns the partner's name,
 * photo, last snippet, unread count and thread classification. Opening a
 * thread hands off to the existing web chat, which owns sending, attachments
 * and the offer/dispute action cards.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import { BACKEND_URL, getConversations } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onNavigate: (path: string) => void;
  /** Opens one thread in the native Chat screen. */
  onOpenThread: (userId: string, nickname: string) => void;
  /**
   * Returns to whichever screen opened Messages. Messages is reachable from
   * several tabs, so this pops the shell's history rather than jumping to a
   * fixed page.
   */
  onBack?: () => void;
};

type Conversation = Record<string, any> & { user_id: string };

/** Filters map to the `thread_classification` the backend computes. */
const FILTERS = [
  { key: 'all', label: 'All', match: null as string | null },
  { key: 'active_deal', label: 'Active Deals', match: 'active_deal' },
  { key: 'no_deal', label: 'New Chat', match: 'no_deal' },
  { key: 'archived', label: 'Archived', match: 'archived' },
];

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/** "31m" / "2h" / "3d" — the relative stamp used in the design. */
function ago(value: unknown): string {
  if (!value) return '';
  const then = new Date(String(value)).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** The partner's display name — a brand's company name, else a person's name. */
function displayName(conversation: Conversation): string {
  return text(
    conversation.business_name ||
      conversation.full_name ||
      conversation.nickname,
    'Unknown user',
  );
}

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
      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="6.5" {...line} />
          <Path d="m16 16 4 4" {...line} />
        </>
      )}
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'compose' && (
        <>
          <Path d="M4 4.5h9v11H9l-5 4Z" {...line} />
          <Path d="M17 3.5v7M13.5 7h7" {...line} />
        </>
      )}
    </Svg>
  );
}

function BrandMessages({ token, onOpenThread, onBack }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getConversations(token);
      setConversations(
        list.map((row, index) => ({
          ...row,
          user_id: String(row.user_id ?? index),
        })),
      );
    } catch {
      // Keep the current list; pull-to-refresh retries.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const spec = FILTERS.find(item => item.key === filter);
    const wanted = spec?.match;
    const needle = query.trim().toLowerCase();
    return conversations.filter(row => {
      if (wanted && String(row.thread_classification) !== wanted) return false;
      if (!needle) return true;
      return [displayName(row), row.last_item_snippet]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle));
    });
  }, [conversations, filter, query]);

  const countFor = useCallback(
    (key: string) => {
      const spec = FILTERS.find(item => item.key === key);
      if (!spec?.match) return conversations.length;
      return conversations.filter(
        row => String(row.thread_classification) === spec.match,
      ).length;
    },
    [conversations],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {!!onBack && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="back" color="#FFFFFF" size={22} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Messages</Text>
        {/* Spacer where a compose button used to sit. It navigated to the
            screen already showing — a new chat starts from a creator profile
            or a campaign, so a composer here has nothing to open. */}
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.sheet}>
        <View style={styles.searchWrap}>
          <Icon name="search" color="#9498B0" size={17} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages..."
            placeholderTextColor="#A9ADC2"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersBar}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(item => {
            const active = filter === item.key;
            const count = countFor(item.key);
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {item.label}
                  {count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={7} avatar lines={1} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
              />
            }
          >
            {!visible.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No conversations</Text>
                <Text style={styles.emptyText}>
                  {query
                    ? 'Try a different search term.'
                    : 'Messages with creators appear here.'}
                </Text>
              </View>
            ) : (
              visible.map(row => {
                const avatar = photoUrl(row.profile_picture);
                const name = displayName(row);
                const unread = Number(row.unread_count) || 0;
                return (
                  <TouchableOpacity
                    key={row.user_id}
                    style={styles.row}
                    onPress={() => onOpenThread(row.user_id, name)}
                    accessibilityRole="button"
                  >
                    <View style={styles.avatarWrap}>
                      <View style={styles.avatar}>
                        {avatar ? (
                          <Image
                            source={{ uri: avatar }}
                            style={styles.avatarImg}
                          />
                        ) : (
                          <Text style={styles.avatarText}>
                            {name.charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      {row.thread_classification === 'active_deal' && (
                        <View style={styles.onlineDot} />
                      )}
                    </View>

                    <View style={styles.copy}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.time}>{ago(row.timestamp)}</Text>
                      </View>
                      <Text
                        style={[
                          styles.snippet,
                          unread > 0 && styles.snippetUnread,
                        ]}
                        numberOfLines={2}
                      >
                        {text(row.last_item_snippet, 'No messages yet')}
                      </Text>
                      {!!text(row.associated_deal_status) && (
                        <View style={styles.statusChip}>
                          <Text style={styles.statusText}>
                            {text(row.associated_deal_status).replace(
                              /_/g,
                              ' ',
                            )}
                          </Text>
                        </View>
                      )}
                    </View>

                    {unread > 0 && (
                      <View style={styles.unread}>
                        <Text style={styles.unreadText}>
                          {unread > 99 ? '99+' : unread}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the rounded sheet below covers the rest,
  // matching the creator tabs.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: scale(16),
    paddingTop: scale(8),
    paddingBottom: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the navy backdrop shows through, as on the creator tabs.
    backgroundColor: 'transparent',
  },
  backBtn: {
    width: scale(34),
    height: scale(34),
    marginLeft: scale(-6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontScale(24),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrap: {
    marginTop: scale(16),
    marginHorizontal: scale(16),
    height: scale(44),
    borderRadius: scale(12),
    backgroundColor: '#F4F5FA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    gap: scale(8),
  },
  search: {
    flex: 1,
    fontSize: fontScale(14),
    color: '#15163F',
    // Android's default padding would make the row taller than 44.
    paddingVertical: 0,
  },

  filtersBar: { flexGrow: 0, flexShrink: 0 },
  filters: { paddingHorizontal: scale(16), paddingVertical: scale(12), gap: scale(8) },
  chip: {
    height: scale(32),
    paddingHorizontal: scale(14),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
  },
  chipActive: { backgroundColor: '#15163F' },
  chipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#6E7391',
  },
  chipTextActive: { color: '#FFFFFF' },

  loading: { marginTop: scale(40) },
  content: { paddingBottom: scale(30) },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: scale(16),
    paddingVertical: scale(13),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F8',
  },
  avatarWrap: { width: scale(46), height: scale(46) },
  avatar: {
    width: scale(46),
    height: scale(46),
    borderRadius: scale(23),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: fontScale(18),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: scale(1),
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  copy: { flex: 1, marginLeft: scale(12) },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  name: {
    flex: 1,
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  time: { fontSize: fontScale(11), color: '#9498B0' },
  snippet: { marginTop: scale(3), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#777B96' },
  snippetUnread: {
    color: '#3B3F5C',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  statusChip: {
    marginTop: scale(6),
    alignSelf: 'flex-start',
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(6),
    backgroundColor: '#F4F5FA',
  },
  statusText: {
    fontSize: fontScale(9),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#6E7391',
    textTransform: 'capitalize',
  },

  unread: {
    marginLeft: scale(8),
    minWidth: scale(20),
    height: scale(20),
    paddingHorizontal: scale(6),
    borderRadius: scale(10),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  empty: { marginTop: scale(40), padding: scale(22), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(12),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandMessages;
