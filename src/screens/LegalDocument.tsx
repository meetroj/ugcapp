/**
 * Legal documents — native rendering of the policy pages that Privacy &
 * Security links to (/privacy-policy, /terms, /community-guidelines,
 * /cookie-policy). These were the last routes that dropped a user onto the
 * website, so the copy lives here as structured sections instead.
 *
 * The text is a plain-language summary of the platform rules, with a link out
 * to the full legal text on the web for the binding version.
 */
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import { scale, fontScale } from '../theme';

export type LegalDocId =
  | '/privacy-policy'
  | '/terms'
  | '/community-guidelines'
  | '/cookie-policy';

type Props = {
  docId: LegalDocId;
  onBack: () => void;
};

type Section = { heading: string; body: string };

type Doc = { title: string; intro: string; sections: Section[] };

/** Canonical copy of each policy, kept short and readable on a phone. */
const DOCS: Record<LegalDocId, Doc> = {
  '/privacy-policy': {
    title: 'Privacy Policy',
    intro:
      'How UGCad collects, uses and protects the information you share with us.',
    sections: [
      {
        heading: 'What we collect',
        body: 'Account details you provide (name, email, phone), your brand or creator profile, campaign and deal activity, messages sent through the platform, and payment records. We also collect basic device and usage data to keep the service working and secure.',
      },
      {
        heading: 'How we use it',
        body: 'To run campaigns and deals, match brands with creators, process payments and escrow, provide support, prevent fraud and abuse, and meet our legal obligations. We do not sell your personal information.',
      },
      {
        heading: 'What others can see',
        body: 'Brands see a creator’s public profile, portfolio and ratings. Creators see a brand’s company name and campaign details. Private information such as your username, email and KYC documents is never shared with the other party.',
      },
      {
        heading: 'Payments and KYC',
        body: 'Identity and bank details submitted for verification are stored securely and used only for verification and payouts. KYC documents are never exposed to the other party in a deal.',
      },
      {
        heading: 'Your choices',
        body: 'You can edit your profile at any time from Account Settings, control notification preferences, and request deletion of your account. Some records are retained where the law requires it, such as payment and tax records.',
      },
      {
        heading: 'Data retention and security',
        body: 'We keep your data only as long as needed to provide the service and meet legal requirements. Access is restricted, and transfers are encrypted.',
      },
    ],
  },
  '/terms': {
    title: 'Terms of Service',
    intro: 'The agreement between you and UGCad when you use the platform.',
    sections: [
      {
        heading: 'Eligibility',
        body: 'You must be at least 18 years old to use UGCad. Accounts require identity verification and involve binding contracts and payments, which a minor cannot validly enter into. We do not knowingly allow anyone under 18 to use the platform, and we close accounts found to belong to minors.',
      },
      {
        heading: 'Your account',
        body: 'You must give accurate information and keep your login secure. Accounts are personal to you or your organisation, and you are responsible for activity that happens under your account.',
      },
      {
        heading: 'Campaigns and deals',
        body: 'Brands post briefs; creators apply. When a brand selects a creator, the agreed amount is held in escrow. Deliverables, timelines and revision limits are set out in the brief and are binding on both sides once the deal starts.',
      },
      {
        heading: 'Payments and escrow',
        body: 'Funds are held in escrow while work is in progress and released to the creator once the brand approves the deliverables. Platform fees are shown before you commit. Refunds follow the cancellation rules for the stage the deal is in.',
      },
      {
        heading: 'Content and usage rights',
        body: 'Usage rights are defined in each brief — platforms, duration and exclusivity. Rights transfer to the brand on approval and payment, subject to those terms. Creators keep ownership of anything outside the agreed scope.',
      },
      {
        heading: 'Off-platform dealing',
        body: 'Taking a deal off the platform to avoid fees is not allowed, and sharing contact details in chat is blocked for this reason. Accounts that repeatedly do so may be restricted.',
      },
      {
        heading: 'Disputes and suspension',
        body: 'Either party can raise a dispute on an active deal. Activity is paused while our team reviews and may ask for evidence. We may suspend or restrict accounts that breach these terms or maintain chronically low ratings.',
      },
    ],
  },
  '/community-guidelines': {
    title: 'Community Guidelines',
    intro: 'What we expect from everyone on the platform.',
    sections: [
      {
        heading: 'Be professional',
        body: 'Communicate clearly and respectfully. Harassment, discrimination, threats and abusive language are not tolerated from brands or creators.',
      },
      {
        heading: 'Be honest',
        body: 'Represent your brand, products, audience and past work accurately. Do not use fake engagement, misleading metrics or someone else’s content as your own.',
      },
      {
        heading: 'Deliver what you agreed',
        body: 'Creators should meet the brief, quantity and deadline they accepted. Brands should review submissions promptly and give specific, actionable feedback rather than blanket rejections.',
      },
      {
        heading: 'Keep it on the platform',
        body: 'Messages, files and payments stay on UGCad. This protects both sides — escrow, dispute resolution and evidence all depend on it.',
      },
      {
        heading: 'Content standards',
        body: 'No content that is illegal, sexually explicit, hateful, or that endangers anyone. Follow advertising disclosure rules in your country when posting sponsored content.',
      },
      {
        heading: 'Reporting',
        body: 'If something breaches these guidelines, raise a dispute on the deal or contact support. We review every report and act on what we find.',
      },
    ],
  },
  '/cookie-policy': {
    title: 'Cookie Policy',
    intro: 'How we use cookies and similar technologies.',
    sections: [
      {
        heading: 'Essential cookies',
        body: 'Required to sign you in, keep your session active and protect against fraud. The service cannot work without these, so they cannot be turned off.',
      },
      {
        heading: 'Preference cookies',
        body: 'Remember choices such as your language and interface settings so you do not have to set them again on every visit.',
      },
      {
        heading: 'Analytics',
        body: 'Help us understand which features are used and where people run into problems, so we can improve the product. This data is aggregated.',
      },
      {
        heading: 'In the mobile app',
        body: 'The app stores your login token on the device so you stay signed in between sessions. Clearing app data or logging out removes it.',
      },
      {
        heading: 'Managing cookies',
        body: 'You can clear or block cookies in your browser settings. Blocking essential cookies will stop you from signing in on the web.',
      },
    ],
  },
};

/** The full legal text remains authoritative and lives on the website. */
const WEB_ORIGIN = 'https://www.ugcad.io';

/**
 * Web path for each document.
 *
 * The site is a React SPA whose server falls back to index.html for any path it
 * does not recognise, so a bare /privacy-policy renders the app shell rather
 * than the policy. The privacy policy is instead published as a real static
 * file at public/privacy/index.html, which the host serves for /privacy before
 * applying that fallback. The other three still resolve through the SPA and
 * keep their existing paths.
 */
const WEB_PATHS: Record<LegalDocId, string> = {
  '/privacy-policy': '/privacy',
  '/terms': '/terms',
  '/community-guidelines': '/community-guidelines',
  '/cookie-policy': '/cookie-policy',
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
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'external' && (
        <>
          <Path d="M14 4.5h5.5V10" {...line} />
          <Path
            d="M19.5 4.5 11 13M18 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h5"
            {...line}
          />
        </>
      )}
    </Svg>
  );
}

function LegalDocument({ docId, onBack }: Props) {
  const doc = DOCS[docId];
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#15163F" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{doc.intro}</Text>

        {doc.sections.map(section => (
          <View key={section.heading} style={styles.card}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() =>
            Linking.openURL(`${WEB_ORIGIN}${WEB_PATHS[docId]}`).catch(() => {})
          }
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Read the full legal text</Text>
          <Icon name="external" color="#4C5BF3" size={15} />
        </TouchableOpacity>

        <Text style={styles.footer}>
          This summary is provided for convenience. The full text on ugcad.io is
          the binding version.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  content: { padding: scale(16), paddingTop: scale(4), paddingBottom: scale(34) },
  intro: {
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: '#5C6180',
    marginBottom: scale(14),
  },

  card: {
    marginBottom: scale(10),
    padding: scale(14),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  heading: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  body: {
    marginTop: scale(7),
    fontSize: fontScale(13),
    lineHeight: fontScale(20),
    color: '#4A4E6B',
  },

  linkBtn: {
    marginTop: scale(8),
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
  },
  linkText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },

  footer: {
    marginTop: scale(14),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#9498B0',
    textAlign: 'center',
  },
});

export default LegalDocument;
