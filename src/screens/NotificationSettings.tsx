/**
 * Notification preferences — the Notifications tab of Settings, reached from
 * the profile menu. This is NOT the bell dropdown; that is `NotificationFeed`,
 * which lists the notifications themselves.
 *
 * Mirrors the website's ProfileSettings notifications panel: brands PUT to
 * /business/settings/notifications, creators PUT to /profile/preferences.
 * The two roles have different toggle keys, matching the backend's
 * `_NOTIF_PREF_KEYS` map.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Path, Rect } from 'react-native-svg';
import ScreenHeader from '../components/ScreenHeader';
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  type AuthUser,
  type NotificationPrefs,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  session: AuthUser;
  onBack: () => void;
  onChat?: () => void;
};

type IconName = 'bolt' | 'doc' | 'chat' | 'rupee' | 'chart' | 'users' | 'sync';

type Row = {
  key: string;
  title: string;
  body: string;
  tint: string;
  color: string;
  icon: IconName;
};

/** Creator keys — backend reads these off `user.notification_prefs`. */
const CREATOR_ROWS: Row[] = [
  {
    key: 'brief_matches',
    title: 'New brief matches',
    body: 'When a campaign matches your niche & rates',
    tint: '#EEF0FE',
    color: '#4A5BE0',
    icon: 'bolt',
  },
  {
    key: 'bid_updates',
    title: 'Bid updates',
    body: 'Shortlisted, accepted or rejected bids',
    tint: '#E8F0FE',
    color: '#3B7BE0',
    icon: 'doc',
  },
  {
    key: 'messages',
    title: 'Direct messages',
    body: 'New chat messages from brands',
    tint: '#EFEDFB',
    color: '#6B5BD0',
    icon: 'chat',
  },
  {
    key: 'payout_alerts',
    title: 'Payout alerts',
    body: 'Escrow release and withdrawal updates',
    tint: '#FDEFE2',
    color: '#E08A3C',
    icon: 'rupee',
  },
  {
    key: 'weekly_digest',
    title: 'Weekly digest',
    body: 'A summary of your activity and earnings',
    tint: '#E4F6EA',
    color: '#3E9E63',
    icon: 'chart',
  },
];

/** Brand keys — identical set and copy to the website's notifications tab. */
const BRAND_ROWS: Row[] = [
  {
    key: 'new_creator_applications',
    title: 'New Creator Applications',
    body: 'Alert when a creator applies to your brief',
    tint: '#EEF0FE',
    color: '#4A5BE0',
    icon: 'users',
  },
  {
    key: 'deal_status_updates',
    title: 'Deal Status Updates',
    body: 'Milestone changes and content delivery alerts',
    tint: '#E8F0FE',
    color: '#3B7BE0',
    icon: 'sync',
  },
  {
    key: 'payment_escrow_alerts',
    title: 'Payment & Escrow Alerts',
    body: 'Wallet recharges and escrow lock notifications',
    tint: '#FDEFE2',
    color: '#E08A3C',
    icon: 'rupee',
  },
  {
    key: 'direct_messages',
    title: 'Direct Messages',
    body: 'Instant alerts for new chat messages from creators',
    tint: '#EFEDFB',
    color: '#6B5BD0',
    icon: 'chat',
  },
  {
    key: 'weekly_workspace_reports',
    title: 'Weekly Workspace Reports',
    body: 'Summarized digest of your campaign performance',
    tint: '#E4F6EA',
    color: '#3E9E63',
    icon: 'chart',
  },
];

const CREATOR_DEFAULTS: NotificationPrefs = {
  brief_matches: true,
  bid_updates: true,
  messages: true,
  payout_alerts: true,
  weekly_digest: false,
};

const BRAND_DEFAULTS: NotificationPrefs = {
  new_creator_applications: true,
  deal_status_updates: true,
  payment_escrow_alerts: true,
  direct_messages: true,
  weekly_workspace_reports: false,
};

/** Row glyphs on a 24x24 grid with a 1.8 stroke, matching `components/icons`. */
function RowIcon({ name, color }: { name: IconName; color: string }) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      {name === 'bolt' && (
        <Path d="M13 2 4.5 13.2H11l-1 8.8 8.5-11.2H12l1-8.8Z" fill={color} />
      )}
      {name === 'doc' && (
        <>
          <Path d="M6 3.5h7L18.5 9v11.5H6V3.5Z" {...line} />
          <Path d="M13 3.5V9h5.5" {...line} />
        </>
      )}
      {name === 'chat' && (
        <Path d="M4.5 5.5h15v11h-8.5L6 20.5v-4H4.5v-11Z" {...line} />
      )}
      {name === 'rupee' && (
        <Path
          d="M7.5 5h9M7.5 9h9M14.5 5c2 0 3 1.6 3 3.4 0 2.6-2 3.9-5 3.9H7.5L15 20"
          {...line}
        />
      )}
      {name === 'chart' && (
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={3} {...line} />
          <Path d="M8 15.5v-3M12 15.5v-6M16 15.5v-4" {...line} />
        </>
      )}
      {name === 'users' && (
        <>
          <Path d="M4 19.5c0-3 2.5-4.5 5-4.5s5 1.5 5 4.5" {...line} />
          <Path
            d="M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
            {...line}
          />
          <Path d="M16 19.5c0-2.6 1.4-3.9 3.5-4.3" {...line} />
        </>
      )}
      {name === 'sync' && (
        <>
          <Path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5l2.4 2.2" {...line} />
          <Path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5l-2.4-2.2" {...line} />
          <Path d="M19.5 4v4.7h-4.7M4.5 20v-4.7h4.7" {...line} />
        </>
      )}
    </Svg>
  );
}

function BellIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
        stroke="#4A5BE0"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M10 18.5a2.2 2.2 0 0 0 4 0"
        stroke="#4A5BE0"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function NotificationSettings({ token, session, onBack, onChat }: Props) {
  const brand = session.role === 'business';
  const rows = brand ? BRAND_ROWS : CREATOR_ROWS;
  const defaults = brand ? BRAND_DEFAULTS : CREATOR_DEFAULTS;

  const [prefs, setPrefs] = useState<NotificationPrefs>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNotificationPrefs(token, session.role)
      .then(saved => {
        // Saved values win, but any key the backend omits keeps its default.
        if (!cancelled) setPrefs({ ...defaults, ...saved });
      })
      .catch(() => {
        if (!cancelled) setStatus('Could not load your saved preferences.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, session.role, defaults]);

  const toggle = useCallback((key: string) => {
    setPrefs(current => ({ ...current, [key]: !current[key] }));
    setStatus(null);
  }, []);

  const save = useCallback(() => {
    setSaving(true);
    setStatus(null);
    saveNotificationPrefs(token, session.role, prefs)
      .then(() => setStatus('Notification preferences saved'))
      .catch(error =>
        setStatus(error?.message || 'Failed to save notifications'),
      )
      .finally(() => setSaving(false));
  }, [token, session.role, prefs]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Notifications" onBack={onBack} onChat={onChat} />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1B2A6B" />
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {rows.map((row, index) => (
              <View
                key={row.key}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <View style={[styles.rowIcon, { backgroundColor: row.tint }]}>
                  <RowIcon name={row.icon} color={row.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowBody}>{row.body}</Text>
                </View>
                <Switch
                  value={Boolean(prefs[row.key])}
                  onValueChange={() => toggle(row.key)}
                  trackColor={{ false: '#D8DAE6', true: '#2F45E0' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D8DAE6"
                  accessibilityLabel={row.title}
                />
              </View>
            ))}
          </View>

          <View style={styles.note}>
            <View style={styles.noteIcon}>
              <BellIcon />
            </View>
            <View style={styles.noteText}>
              <Text style={styles.noteTitle}>
                We&apos;ll only notify you about important updates.
              </Text>
              <Text style={styles.noteBody}>
                You can change these preferences anytime.
              </Text>
            </View>
          </View>

          {status !== null && <Text style={styles.status}>{status}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
  },
  bodyContent: { padding: scale(16), paddingBottom: scale(30) },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(18),
    borderWidth: 1,
    borderColor: '#E8E9F3',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: scale(14), gap: scale(12) },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EFF0F6' },
  rowIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontSize: fontScale(14.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  rowBody: { fontSize: fontScale(11.5), color: '#777B96', marginTop: scale(3), lineHeight: fontScale(16) },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginTop: scale(16),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#EEEFFF',
  },
  noteIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(11),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: { flex: 1 },
  noteTitle: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  noteBody: { fontSize: fontScale(11.5), color: '#777B96', marginTop: scale(2) },
  status: {
    marginTop: scale(14),
    fontSize: fontScale(12),
    color: '#4A5BE0',
    textAlign: 'center',
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: scale(16),
    height: scale(52),
    borderRadius: scale(14),
    backgroundColor: '#1B2A6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: {
    color: '#FFFFFF',
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
});

export default NotificationSettings;
