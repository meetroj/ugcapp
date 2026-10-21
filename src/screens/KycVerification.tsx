import { useLiveEffect } from "../liveUpdates";
/**
 * KYC verification status for creators. The layout is fixed; the banner,
 * status pill and guidance box are driven by the account's KYC status so the
 * same screen covers verified, pending, rejected and not-yet-submitted.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SkeletonBlock } from '../components/Skeleton';
import { getKyc, type AuthUser } from '../api';
import { CONTENT_COLUMN, scale, fontScale } from '../theme';
import { errorMessage, kycStatusOf, type KycStatus } from '../payoutRules';

type Kyc = Record<string, any>;
type Status = KycStatus;

/**
 * Copy and colour per status. Keeping them in one table means the render code
 * below never branches on the status itself.
 */
const STATES: Record<
  Status,
  {
    accent: string;
    tint: string;
    label: string;
    title: string;
    line1: string;
    line2: string;
    noteTitle: string;
    noteBody: string;
  }
> = {
  verified: {
    accent: '#16A34A',
    tint: '#EBFAF0',
    label: 'Verified',
    title: 'Identity Verified',
    line1: 'Your identity is confirmed.',
    line2: 'You can withdraw your earnings.',
    noteTitle: 'You are all set!',
    noteBody: 'Your KYC is complete and you can receive payments securely.',
  },
  pending: {
    accent: '#D97706',
    tint: '#FEF6E7',
    label: 'In review',
    title: 'Verification In Review',
    line1: 'Your documents are being checked.',
    line2: 'This usually takes 24-48 hours.',
    noteTitle: 'Nothing to do right now',
    noteBody: 'We will notify you as soon as your verification is complete.',
  },
  rejected: {
    accent: '#DC2626',
    tint: '#FDECEC',
    label: 'Rejected',
    title: 'Verification Failed',
    line1: 'We could not confirm your identity.',
    line2: 'Please check your details and try again.',
    noteTitle: 'Action needed',
    noteBody:
      'Update your details below to resubmit, or contact support for help.',
  },
  unsubmitted: {
    accent: '#4741DB',
    tint: '#EEF0FE',
    label: 'Not started',
    title: 'Verify Your Identity',
    line1: 'KYC is required before payouts.',
    line2: 'It only takes a couple of minutes.',
    noteTitle: 'Get verified',
    noteBody: 'Complete your KYC to start receiving payments securely.',
  },
};

function Icon({
  name,
  size = 20,
  color = '#4741DB',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const p = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      {name === 'back' && <Path d="m15 5-7 7 7 7" {...p} />}
      {name === 'chat' && (
        <Path
          d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z"
          {...p}
        />
      )}
      {name === 'bell' && (
        <>
          <Path
            d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
            {...p}
          />
          <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...p} />
        </>
      )}
      {name === 'shield' && (
        <Path
          d="M12 3.2 5.5 6v5.4c0 4 2.7 7.6 6.5 9.4 3.8-1.8 6.5-5.4 6.5-9.4V6Z"
          {...p}
        />
      )}
      {name === 'shieldCheck' && (
        <>
          <Path
            d="M12 3.2 5.5 6v5.4c0 4 2.7 7.6 6.5 9.4 3.8-1.8 6.5-5.4 6.5-9.4V6Z"
            {...p}
          />
          <Path d="m9.2 12 2 2 3.6-3.8" {...p} />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} />}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8.5" r="3.3" {...p} />
          <Path d="M5 20a7 7 0 0 1 14 0" {...p} />
        </>
      )}
      {name === 'people' && (
        <>
          <Circle cx="10" cy="8.5" r="3.1" {...p} />
          <Path d="M4 20a6 6 0 0 1 12 0" {...p} />
          <Path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 20a6 6 0 0 0-2-4.4" {...p} />
        </>
      )}
      {name === 'card' && (
        <>
          <Rect x="3" y="5.5" width="18" height="13" rx="2.4" {...p} />
          <Path d="M3 10h18" {...p} />
        </>
      )}
      {name === 'rupee' && (
        <Path d="M8 5h8M8 9h8M15.5 5c0 3-2.4 4-5 4h-.5l6 8" {...p} />
      )}
      {name === 'calendar' && (
        <>
          <Rect x="3.5" y="5.5" width="17" height="15" rx="2.4" {...p} />
          <Path d="M3.5 10h17M8 3.5v4M16 3.5v4" {...p} />
        </>
      )}
      {name === 'pencil' && (
        <Path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" {...p} />
      )}
      {name === 'headset' && (
        <>
          <Path d="M5 14v-2a7 7 0 0 1 14 0v2" {...p} />
          <Rect x="3" y="13.5" width="4" height="6" rx="1.6" {...p} />
          <Rect x="17" y="13.5" width="4" height="6" rx="1.6" {...p} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect x="3" y="6" width="18" height="13" rx="2.6" {...p} />
          <Path d="M3 10.5h18" {...p} />
          <Circle cx="16.5" cy="14.5" r="1.1" fill={color} />
        </>
      )}
      {name === 'arrow' && <Path d="M5 12h13m-5-5 5 5-5 5" {...p} />}
    </Svg>
  );
}

const textOf = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback;

function KycVerification({
  token,
  unread = 0,
  onBack,
  onGoToEarnings,
  onUpdateDetails,
  onContactSupport,
  onMessages,
  onNotifications,
}: {
  token: string;
  /**
   * Still accepted from WebShell, but no longer read: /api/kyc/me returns the
   * signed-in creator's record, so no id is needed.
   */
  session?: AuthUser;
  /** Real unread-chat count for the header badge. */
  unread?: number;
  onBack?: () => void;
  onGoToEarnings?: () => void;
  onUpdateDetails?: () => void;
  onContactSupport?: () => void;
  onMessages?: () => void;
  onNotifications?: () => void;
}) {
  const [kyc, setKyc] = useState<Kyc>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The status could not be read. Distinct from "not submitted": showing that
  // to a verified creator would be actively wrong.
  const [failed, setFailed] = useState('');
  // A status has been read at least once, so a failed refresh can keep showing it.
  const [loaded, setLoaded] = useState(false);

  // GET /api/kyc/me — the record always belongs to the signed-in creator, so
  // no id is passed. (This used to call /api/kyc?user_id=..., which the
  // backend does not serve: it 404'd every time and the screen fell back to
  // "not submitted" even for a verified account.)
  const load = useCallback(
    (isCancelled?: () => boolean) =>
      getKyc(token)
        .then(record => {
          if (isCancelled?.()) {
            return;
          }
          setFailed('');
          setLoaded(true);
          // An absent/empty record legitimately means "not submitted yet".
          if (record && Object.keys(record).length) {
            setKyc(record);
          }
        })
        .catch(e => {
          // Leave the status unknown rather than claiming "not submitted" when
          // the request itself failed.
          if (!isCancelled?.()) {
            setFailed(errorMessage(e, 'Could not load your verification status.'));
          }
        }),
    [token],
  );

  useLiveEffect(() => {
    let cancelled = false;
    load(() => cancelled).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const status = useMemo(() => kycStatusOf(kyc), [kyc]);
  const state = STATES[status];
  const submitted = status !== 'unsubmitted';
  // Nothing has loaded: show only the error, not a made-up "Not started".
  const unknown = !!failed && !loaded && !loading;
  // Until the first read lands the status is unknown too: the "Not started"
  // banner and the Start KYC button must not flash for a verified creator.
  const hideStatus = unknown || loading;
  // The website only allows (re)submitting from not-submitted or rejected; the
  // backend refuses anything else with "KYC already pending/verified".
  const canEdit = status === 'unsubmitted' || status === 'rejected';
  const noteBody =
    status === 'rejected'
      ? `${
          textOf(kyc.rejection_reason, 'Your documents could not be verified.')
        } Update your details below to resubmit, or contact support for help.`
      : state.noteBody;
  const aadhaar = String(kyc.aadhaar_number || '').replace(/\D/g, '');
  const submittedOn = kyc.submitted_at ? new Date(kyc.submitted_at) : null;
  const payoutMethod = String(kyc.payout_method || kyc.payment_method || '');

  const rows = [
    {
      icon: 'person',
      label: 'Legal Name',
      // The backend stores full_legal_name (name_on_pan mirrors it).
      value: textOf(
        kyc.full_legal_name ||
          kyc.name_on_pan ||
          kyc.legal_name ||
          kyc.full_name ||
          kyc.name,
        submitted ? '-' : 'Not provided',
      ),
    },
    {
      icon: 'card',
      label: 'PAN',
      value: textOf(
        kyc.pan || kyc.pan_number || kyc.document_number,
        submitted ? '-' : 'Not provided',
      ),
    },
    // Aadhaar is optional; when given, only the last four digits are shown.
    ...(aadhaar
      ? [
          {
            icon: 'card',
            label: 'Aadhaar',
            value: `XXXX XXXX ${aadhaar.slice(-4)}`,
          },
        ]
      : []),
    {
      icon: 'rupee',
      label: 'Payout Method',
      value:
        payoutMethod === 'bank'
          ? 'Bank account'
          : payoutMethod === 'upi'
          ? 'UPI'
          : submitted
          ? '-'
          : 'Not set',
    },
    {
      icon: 'calendar',
      label: 'Submitted On',
      value:
        submittedOn && !Number.isNaN(submittedOn.getTime())
          ? submittedOn.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : submitted
          ? '-'
          : 'Not submitted',
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="back" color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Verification</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onMessages}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Icon name="chat" color="#FFF" />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerRound}
            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            onPress={onNotifications}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" color="#FFF" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {/* Status banner */}
        {!hideStatus && (
        <View
          style={[styles.card, styles.banner, { backgroundColor: state.tint }]}
        >
          <View style={styles.bannerIcon}>
            <Icon
              name={status === 'verified' ? 'shieldCheck' : 'shield'}
              size={22}
              color={state.accent}
            />
          </View>
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: state.accent }]}>
              {state.title}
            </Text>
            <Text style={styles.bannerLine}>{state.line1}</Text>
            <Text style={styles.bannerLine}>{state.line2}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: state.accent }]}>
            {status === 'verified' && (
              <Icon name="check" size={11} color="#FFF" />
            )}
            <Text style={styles.pillText}>{state.label}</Text>
          </View>
        </View>
        )}

        {/* Could not reach the server: say so rather than letting the status
            fields read as a confirmed "not submitted". */}
        {!!failed && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{failed}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={retry}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Details */}
        {!unknown && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Icon name="people" size={19} color="#4741DB" />
            <Text style={styles.cardTitle}>KYC Details</Text>
          </View>
          {loading &&
            [0, 1, 2, 3].map(index => (
              <View key={index} style={styles.row}>
                <View style={styles.rowLeft}>
                  <SkeletonBlock width={26} height={26} radius={8} />
                  <SkeletonBlock width={96} height={11} />
                </View>
                <SkeletonBlock width={84} height={11} />
              </View>
            ))}
          {!loading &&
            rows.map(row => (
              <View key={row.label} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={styles.rowIcon}>
                    <Icon name={row.icon} size={15} color="#6E74A0" />
                  </View>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                </View>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          {!loading && (
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIcon}>
                  <Icon name="shieldCheck" size={15} color="#6E74A0" />
                </View>
                <Text style={styles.rowLabel}>Status</Text>
              </View>
              <Text style={[styles.rowValue, { color: state.accent }]}>
                {state.label}
              </Text>
            </View>
          )}
        </View>
        )}

        {/* Guidance */}
        {!hideStatus && (
        <View
          style={[styles.card, styles.note, { backgroundColor: state.tint }]}
        >
          <View style={styles.noteHead}>
            <Icon name="shieldCheck" size={17} color={state.accent} />
            <Text style={[styles.noteTitle, { color: state.accent }]}>
              {state.noteTitle}
            </Text>
          </View>
          <Text style={styles.noteBody}>{noteBody}</Text>
        </View>
        )}

        {/* Update details: only before a submission or after a rejection */}
        {!hideStatus && canEdit && (
        <View style={[styles.card, styles.actionCard]}>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>
              {submitted ? 'Ready to resubmit?' : 'Ready to verify?'}
            </Text>
            <Text style={styles.actionText}>
              {submitted
                ? 'Correct the details we could not verify and submit again.'
                : 'Submit your details to complete verification.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={onUpdateDetails}
            accessibilityRole="button"
          >
            <Icon name="pencil" size={14} color="#4741DB" />
            <Text style={styles.outlineText}>
              {submitted ? 'Update Details' : 'Start KYC'}
            </Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Support */}
        <View style={[styles.card, styles.actionCard]}>
          <View style={styles.supportIcon}>
            <Icon name="headset" size={17} color="#4741DB" />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Need Help?</Text>
            <Text style={styles.actionText}>
              Having trouble with verification? Our support team is here to
              help.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={onContactSupport}
            accessibilityRole="button"
          >
            <Icon name="chat" size={14} color="#4741DB" />
            <Text style={styles.outlineText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        {!hideStatus && status === 'verified' && (
          <TouchableOpacity
            style={styles.primary}
            onPress={onGoToEarnings}
            accessibilityRole="button"
          >
            <Icon name="wallet" size={17} color="#FFF" />
            <Text style={styles.primaryText}>Go to Earnings</Text>
            <Icon name="arrow" size={17} color="#FFF" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark backdrop behind the header; the rounded sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  header: {
    height: scale(56),
    paddingHorizontal: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The light page, curved into the header like the other native screens.
  body: {
    flex: 1,
    backgroundColor: '#F7F7FF',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
  },
  headerBtn: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFF',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  headerRound: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    backgroundColor: '#2B2D63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: scale(1),
    minWidth: scale(16),
    height: scale(16),
    paddingHorizontal: scale(3),
    borderRadius: scale(8),
    backgroundColor: '#FF4057',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  // A tablet keeps the page a phone-width column instead of stretching it edge to edge.
  content: { ...CONTENT_COLUMN, padding: scale(14), paddingBottom: scale(28), gap: scale(12) },
  card: {
    padding: scale(14),
    borderRadius: scale(14),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#ECECF5',
    shadowColor: '#282850',
    shadowOpacity: 0.05,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: scale(3) },
    elevation: 2,
  },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(11) },
  bannerIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(11),
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCopy: { flex: 1, minWidth: 0 },
  bannerTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  bannerLine: { marginTop: scale(2), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#5C6284' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingHorizontal: scale(8),
    height: scale(24),
    borderRadius: scale(12),
  },
  pillText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  cardTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#161742',
  },
  loading: { marginTop: scale(12) },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderRadius: scale(12),
    padding: scale(12),
    marginBottom: scale(12),
  },
  errorText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B3261E',
  },
  retryBtn: {
    marginTop: scale(4),
    minHeight: scale(44),
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4741DB',
  },
  row: {
    minHeight: scale(46),
    paddingVertical: scale(6),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F7',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: scale(9), flexShrink: 0 },
  rowIcon: {
    width: scale(26),
    height: scale(26),
    borderRadius: scale(8),
    backgroundColor: '#F3F4FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: fontScale(14), color: '#5C6284' },
  rowValue: {
    flexShrink: 1,
    marginLeft: scale(10),
    textAlign: 'right',
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#161742',
  },
  note: { alignItems: 'center' },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  noteTitle: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800' },
  noteBody: {
    marginTop: scale(5),
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: '#5C6284',
    textAlign: 'center',
  },
  // The button drops under the copy on a narrow phone instead of squeezing it.
  actionCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: scale(10) },
  supportIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, minWidth: scale(150) },
  actionTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#161742',
  },
  actionText: { marginTop: scale(3), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#747A98' },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    minHeight: scale(44),
    paddingHorizontal: scale(11),
    borderRadius: scale(9),
    borderWidth: 1,
    borderColor: '#C9CCF2',
    backgroundColor: '#FFF',
  },
  outlineText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4741DB',
  },
  primary: {
    marginTop: scale(2),
    height: scale(50),
    borderRadius: scale(13),
    backgroundColor: '#161742',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(9),
  },
  primaryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
});

export default KycVerification;
