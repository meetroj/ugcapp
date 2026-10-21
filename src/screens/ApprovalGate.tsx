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
    /** Set by the review team on a rejection (reason_code + free text). */
    reason_code?: string;
    reason_details?: string;
  } | null;
  /** Account details pre-filled into the support email / WhatsApp message. */
  account?: { email?: string; id?: string; role?: string } | null;
  /** Reopens onboarding so the profile can be updated and resubmitted. */
  onUpdateProfile?: () => void;
  /** Re-checks the session against the backend; unlocks once approved. */
  onRefresh: () => Promise<void>;
  onLogout?: () => void;
};

// Same labels and contact channels as the website's RejectedGate and
// ContactSupportBox, so a rejection reads the same on both.
const REASON_LABELS: Record<string, string> = {
  incomplete_profile: 'Incomplete profile',
  unverifiable_business: 'Business details could not be verified',
  unverifiable_socials: 'Social profiles could not be verified',
  low_quality_portfolio: 'Portfolio did not meet our bar',
  duplicate_account: 'Duplicate account',
  policy_violation: 'Policy violation',
  other: 'Other',
};

export const SUPPORT_EMAIL = 'support@ugcad.io';
// Same number the website ships (ContactSupportBox.js); it looks like a
// placeholder, see the report.
export const SUPPORT_PHONE = '+919000000000';
export const SUPPORT_PHONE_DISPLAY = '+91 90000 00000';

/** 'other' carries no information beyond reason_details, so it has no label. */
export function rejectionReasonLabel(code?: string): string | null {
  return code && code !== 'other' ? REASON_LABELS[code] || null : null;
}

/** Email, WhatsApp and phone links pre-filled with the account, like the website. */
export function buildSupportLinks(
  account?: { email?: string; id?: string; role?: string } | null,
) {
  const who = account?.email || '';
  const subject = `Application review appeal${who ? ` - ${who}` : ''}`;
  const body = [
    'Hi UGCad team,',
    '',
    'My application was not approved and I would like it reviewed again.',
    '',
    `Account email: ${who || '(fill in)'}`,
    `Account type: ${account?.role || '(fill in)'}`,
    account?.id ? `Account ID: ${account.id}` : '',
    '',
    'Why I think this should be reconsidered:',
    '',
  ].join('\n');
  return {
    mailto: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`,
    whatsapp: `https://wa.me/${SUPPORT_PHONE.replace(
      /[^0-9]/g,
      '',
    )}?text=${encodeURIComponent(
      `Hi, my UGCad application (${who || 'my account'}) was not approved. Can you review it again?`,
    )}`,
    tel: `tel:${SUPPORT_PHONE}`,
  };
}

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
  account,
  onUpdateProfile,
  onRefresh,
  onLogout,
}: Props) {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  // Shown after Check Status when nothing changed, so the tap visibly did
  // something instead of looking like a dead button.
  const [notice, setNotice] = useState('');
  const isBrand = kind === 'business';
  const rejected = status === 'rejected';
  const needsInfo = status === 'more_info';
  const message = String(review?.more_info_message || '').trim();
  const items = Array.isArray(review?.more_info_items)
    ? review.more_info_items.filter(Boolean)
    : [];

  const check = async () => {
    setChecking(true);
    setNotice('');
    try {
      await onRefresh();
      // Approval swaps this screen out; reaching here means it is still open.
      setNotice('Still under review. We will email you as soon as it is decided.');
    } catch {
      setNotice("Couldn't check right now. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  const reasonLabel = rejectionReasonLabel(review?.reason_code);
  const reasonDetails = String(review?.reason_details || '').trim();
  const support = buildSupportLinks(account);
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  const title = rejected
    ? 'Application not approved'
    : needsInfo
    ? 'More Information Needed'
    : 'Profile Under Review';

  // Copy mirrors the website's gates for each role.
  const copy = rejected
    ? `Your ${
        isBrand ? 'business' : 'creator'
      } profile was not approved, so you can't access the dashboard right now. If you think this is a mistake, contact our team and we'll take another look.`
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
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.topbar}>
        <Text style={styles.brand}>
          UGC<Text style={styles.brandDim}>ad.io</Text>
        </Text>
        {!!onLogout && (
          <TouchableOpacity
            onPress={onLogout}
            accessibilityRole="button"
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
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

          {rejected && (!!reasonLabel || !!reasonDetails) && (
            <View style={styles.reason} testID="rejection-reason">
              <Text style={styles.reasonLabel}>Reason from our review team</Text>
              {!!reasonLabel && (
                <Text style={styles.reasonCode}>{reasonLabel}</Text>
              )}
              {!!reasonDetails && (
                <Text style={styles.reasonText}>{reasonDetails}</Text>
              )}
            </View>
          )}

          {rejected ? (
            <View style={styles.support}>
              <Text style={styles.supportTitle}>Think this is a mistake?</Text>
              <Text style={styles.supportSub}>
                Our team can re-check your application. Reach out any way you
                like.
              </Text>
              <TouchableOpacity
                style={[styles.supportRow, styles.supportRowPrimary]}
                onPress={() => open(support.mailto)}
                accessibilityRole="button"
                testID="support-email"
              >
                <Text style={styles.supportRowTitle}>Email support</Text>
                <Text style={styles.supportRowSub}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.supportRow}
                onPress={() => open(support.whatsapp)}
                accessibilityRole="button"
                testID="support-whatsapp"
              >
                <Text style={styles.supportRowTitle}>WhatsApp</Text>
                <Text style={styles.supportRowSub}>Chat with support</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.supportRow}
                onPress={() => open(support.tel)}
                accessibilityRole="button"
                testID="support-call"
              >
                <Text style={styles.supportRowTitle}>Call us</Text>
                <Text style={styles.supportRowSub}>{SUPPORT_PHONE_DISPLAY}</Text>
              </TouchableOpacity>
            </View>
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
          {!!notice && !rejected && !needsInfo && (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
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
    fontSize: fontScale(14),
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
    // A tablet gets a centred card, not one stretched edge to edge.
    maxWidth: scale(520),
    alignSelf: 'center',
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
  notice: {
    marginTop: scale(12),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: MUTED,
    textAlign: 'center',
  },
  copy: {
    marginTop: scale(10),
    fontSize: fontScale(14),
    lineHeight: fontScale(21),
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
    fontSize: fontScale(14),
    lineHeight: fontScale(21),
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
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#E7E7F2',
  },
  infoFallback: {
    marginTop: scale(12),
    fontSize: fontScale(14),
    lineHeight: fontScale(19),
    color: MUTED,
    textAlign: 'center',
  },
  reason: {
    width: '100%',
    marginTop: scale(16),
    padding: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(255,138,138,0.25)',
    backgroundColor: 'rgba(255,138,138,0.08)',
  },
  reasonLabel: {
    marginBottom: scale(6),
    fontSize: fontScale(10.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#FF9D9D',
  },
  reasonCode: {
    fontSize: fontScale(13.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#F4F4F8',
  },
  reasonText: {
    marginTop: scale(4),
    fontSize: fontScale(14),
    lineHeight: fontScale(19),
    color: '#D6D7EC',
  },
  support: { width: '100%', marginTop: scale(20), gap: scale(10) },
  supportTitle: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#F4F4F8',
    textAlign: 'center',
  },
  supportSub: {
    marginBottom: scale(4),
    fontSize: fontScale(14),
    lineHeight: fontScale(18),
    color: MUTED,
    textAlign: 'center',
  },
  supportRow: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  supportRowPrimary: {
    borderColor: 'rgba(91,107,255,0.45)',
    backgroundColor: 'rgba(91,107,255,0.14)',
  },
  supportRowTitle: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#F4F4F8',
  },
  supportRowSub: { fontSize: fontScale(13), color: MUTED },
  primary: {
    marginTop: scale(20),
    minWidth: scale(180),
    minHeight: 46,
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
