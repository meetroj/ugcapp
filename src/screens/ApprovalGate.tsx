/**
 * Approval gate — the native counterpart of the website's verification holds.
 *
 * The web blocks BOTH roles from every feature page until an admin approves
 * the profile: BrandTopNavLayout gates brands (pending / rejected /
 * more_info) and CreatorDashboard gates creators the same way. This one
 * screen serves all six combinations so the copy can't drift between roles:
 *
 *  - pending:   "Profile Under Review", with a Check Status refresh
 *  - rejected:  "Profile Not Approved", with Contact Support
 *  - more_info: the review team's message + checklist, with Update My Profile
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { scale, fontScale } from '../theme';

type Props = {
  kind: 'creator' | 'business';
  /** 'rejected' | 'more_info' | anything else reads as pending. */
  status: string;
  /**
   * The decision record, straight off /auth/me. On a more-info request it
   * carries what the team actually asked for.
   */
  review?: {
    more_info_message?: string;
    more_info_items?: string[];
  } | null;
  /** Reopens onboarding so the profile can be updated and resubmitted. */
  onUpdateProfile?: () => void;
  /** Re-checks the session against the backend; unlocks once approved. */
  onRefresh: () => Promise<void>;
  onLogout?: () => void;
};

const BACKDROP = '#0A0A16';
const CARD = '#13131D';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const ACCENT = '#6D7BFF';
const MUTED = 'rgba(255,255,255,0.66)';

function GateIcon({ variant }: { variant: 'pending' | 'rejected' | 'info' }) {
  const stroke = variant === 'rejected' ? '#E5484D' : ACCENT;
  const line = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(40)} height={scale(40)} viewBox="0 0 24 24" fill="none">
      {variant === 'rejected' && (
        <>
          <Circle cx="12" cy="12" r="9" {...line} />
          <Path d="M12 7.5V13m0 3.4v.1" {...line} />
        </>
      )}
      {variant === 'pending' && (
        <>
          <Circle cx="12" cy="12" r="9" {...line} />
          <Path d="M12 7v5l3.2 2" {...line} />
        </>
      )}
      {/* Speech bubble, matching the web's "message from the team" icon. */}
      {variant === 'info' && (
        <>
          <Path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"
            {...line}
          />
          <Path d="M8 8.5h8M8 11.5h5" {...line} />
        </>
      )}
    </Svg>
  );
}

function ApprovalGate({
  kind,
  status,
  review,
  onUpdateProfile,
  onRefresh,
  onLogout,
}: Props) {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const isBrand = kind === 'business';
  const rejected = status === 'rejected';
  const needsInfo = status === 'more_info';
  const message = String(review?.more_info_message || '').trim();
  const items = Array.isArray(review?.more_info_items)
    ? review.more_info_items.filter(Boolean)
    : [];

  const check = async () => {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setChecking(false);
    }
  };

  const title = rejected
    ? 'Profile Not Approved'
    : needsInfo
    ? 'More Information Needed'
    : 'Profile Under Review';

  // Copy mirrors the website's gates for each role.
  const copy = rejected
    ? `Please contact support for more information about your ${
        isBrand ? 'business' : 'creator'
      } profile review.`
    : needsInfo
    ? `Our team needs a few more details before approving your ${
        isBrand ? 'business' : 'creator'
      } profile. Update it with the information below and we'll review it again.`
    : isBrand
    ? "Your business profile is being verified by our team. Most accounts are approved within 24-48 hours, and we'll email you once you're cleared to launch campaigns."
    : 'Your profile is being reviewed. Most creator approvals are completed within 24-48 hours.';

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.topbar}>
        <Text style={styles.brand}>
          UGC<Text style={styles.brandDim}>ad.io</Text>
        </Text>
        {!!onLogout && (
          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.iconRing}>
            <GateIcon
              variant={rejected ? 'rejected' : needsInfo ? 'info' : 'pending'}
            />
          </View>
          <Text style={styles.eyebrow}>
            {isBrand ? 'Business verification' : 'Creator verification'}
          </Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{copy}</Text>

          {needsInfo && (
            <>
              {!!message && (
                <View style={styles.infoNote}>
                  <Text style={styles.infoNoteLabel}>
                    Message from our team
                  </Text>
                  <Text style={styles.infoNoteText}>{message}</Text>
                </View>
              )}

              {items.length > 0 && (
                <View style={styles.infoItems}>
                  {items.map((item, index) => (
                    <View key={`${item}-${index}`} style={styles.infoItem}>
                      <Text style={styles.infoBullet}>{'•'}</Text>
                      <Text style={styles.infoItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* A request can be sent with neither a note nor a checklist;
                  saying so beats an empty panel that reads as broken. */}
              {!message && items.length === 0 && (
                <Text style={styles.infoFallback}>
                  Our team will be in touch by email with what's needed.
                </Text>
              )}
            </>
          )}

          {rejected ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={() =>
                Linking.openURL('mailto:support@ugcad.io').catch(() => {})
              }
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Contact Support</Text>
            </TouchableOpacity>
          ) : needsInfo ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={onUpdateProfile}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Update My Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primary}
              onPress={check}
              disabled={checking}
              accessibilityRole="button"
            >
              {checking ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryText}>Check Status</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
  },
  brand: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    color: ACCENT,
  },
  brandDim: { color: '#FFFFFF' },
  logout: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: scale(20),
  },
  card: {
    width: '100%',
    alignItems: 'center',
    padding: scale(24),
    borderRadius: scale(18),
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  iconRing: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  eyebrow: {
    marginTop: scale(14),
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: MUTED,
  },
  title: {
    marginTop: scale(6),
    fontSize: fontScale(21),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  copy: {
    marginTop: scale(10),
    fontSize: fontScale(13),
    lineHeight: fontScale(20),
    color: MUTED,
    textAlign: 'center',
  },
  infoNote: {
    width: '100%',
    marginTop: scale(16),
    padding: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(109,123,255,0.25)',
    backgroundColor: 'rgba(109,123,255,0.10)',
  },
  infoNoteLabel: {
    marginBottom: scale(6),
    fontSize: fontScale(10.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8B8FB5',
  },
  infoNoteText: {
    fontSize: fontScale(13.5),
    lineHeight: fontScale(20),
    color: '#E7E7F2',
  },
  infoItems: { width: '100%', marginTop: scale(12), gap: scale(8) },
  infoItem: {
    flexDirection: 'row',
    gap: scale(8),
    padding: scale(11),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  infoBullet: { color: ACCENT, fontSize: fontScale(14) },
  infoItemText: {
    flex: 1,
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: '#E7E7F2',
  },
  infoFallback: {
    marginTop: scale(12),
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: MUTED,
    textAlign: 'center',
  },
  primary: {
    marginTop: scale(20),
    minWidth: scale(180),
    height: scale(46),
    borderRadius: scale(13),
    backgroundColor: '#1B2A6B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(20),
  },
  primaryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default ApprovalGate;
