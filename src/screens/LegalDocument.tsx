/**
 * Legal documents — native rendering of the policy pages that Privacy &
 * Security links to (/privacy-policy, /terms, /community-guidelines,
 * /cookie-policy). These were the last routes that dropped a user onto the
 * website, so the copy lives here as structured sections instead.
 *
 * The text is the same copy the website shows in Settings (LEGAL_DOCS in
 * ugcad-frontend/src/pages/ProfileSettings.js); keep the two in step. Only the
 * privacy policy has a page on the website to link out to (/privacy), so the
 * other three documents have no "read full text" button.
 */
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';import { Text } from '../components/Text';
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

type Doc = {
  title: string;
  intro: string;
  updated: string;
  sections: Section[];
};

/** Same copy as the website's Settings > Legal documents. */
const DOCS: Record<LegalDocId, Doc> = {
  '/privacy-policy': {
    title: 'Privacy Policy',
    intro: 'How we collect, use and protect your data',
    updated: 'July 2026',
    sections: [
      {
        heading: 'Information we collect',
        body: 'We collect the details you provide when you create an account and build your profile - name, contact details, payment information, portfolio content and the campaigns you take part in. We also collect basic usage data such as device, browser and pages visited.',
      },
      {
        heading: 'How we use your information',
        body: 'Your information is used to match you with relevant brand campaigns, process payments and payouts, personalise your dashboard, keep the platform secure, and send important updates about your account and deals.',
      },
      {
        heading: 'Sharing your information',
        body: 'We share only what is needed to complete a deal - for example, your profile and submitted content with the brand you are working with. We never sell your personal data. Trusted service providers (payments, hosting, analytics) process data on our behalf under strict agreements.',
      },
      {
        heading: 'Data security',
        body: 'We use encryption, access controls and secure infrastructure to protect your data. Payments are handled by PCI-compliant partners and funds are held in escrow until work is approved.',
      },
      {
        heading: 'Your rights',
        body: 'You can access, update or delete your information at any time from Settings. You may deactivate or permanently delete your account, and request a copy of your data by contacting us.',
      },
      {
        heading: 'Contact',
        body: 'Questions about your privacy? Email us at privacy@ugcad.io.',
      },
    ],
  },
  '/terms': {
    title: 'Terms and Conditions',
    intro: 'The rules for using the UGCad.io platform',
    updated: 'July 2026',
    sections: [
      {
        heading: 'Acceptance of terms',
        body: 'By creating an account or using UGCad.io you agree to these Terms. If you do not agree, please do not use the platform.',
      },
      {
        heading: 'Eligibility',
        body: 'You must be at least 18 years old (or the age of majority in your region) and able to enter into a binding contract to use UGCad.io.',
      },
      {
        heading: 'Your account',
        body: 'You are responsible for the accuracy of your profile, keeping your login secure, and all activity under your account. You may not operate multiple accounts to abuse the platform.',
      },
      {
        heading: 'Payments and escrow',
        body: 'Brand payments are held in escrow and released to creators once work is approved or auto-approved per the deal timeline. Platform commission and applicable taxes (such as TDS) are deducted as shown at checkout.',
      },
      {
        heading: 'Content and licensing',
        body: 'You retain ownership of the content you create. By delivering approved content you grant the brand the usage rights agreed in the brief. You confirm your content is original and does not infringe third-party rights.',
      },
      {
        heading: 'Prohibited conduct',
        body: 'No fraud, fake engagement, harassment, off-platform payment circumvention, or uploading unlawful or infringing material. Violations may lead to suspension or removal.',
      },
      {
        heading: 'Termination',
        body: 'You may close your account anytime. We may suspend or terminate accounts that breach these Terms, with pending payouts settled per policy.',
      },
      {
        heading: 'Limitation of liability',
        body: 'The platform is provided on an as-available basis. To the extent permitted by law, we are not liable for indirect or consequential losses arising from use of the platform.',
      },
    ],
  },
  '/community-guidelines': {
    title: 'Community Guidelines',
    intro: 'Standards for creators and brands',
    updated: 'July 2026',
    sections: [
      {
        heading: 'Be authentic',
        body: 'Represent yourself honestly. Use real profile details and only showcase work you actually created.',
      },
      {
        heading: 'Deliver quality, on time',
        body: 'Follow the brief, meet deadlines, and communicate early if something changes. Great delivery builds your level and reputation.',
      },
      {
        heading: 'Respect everyone',
        body: 'Keep messages professional. Harassment, hate speech, or discrimination of any kind is not tolerated.',
      },
      {
        heading: 'No spam or fraud',
        body: 'No fake reviews, bots, inflated metrics, or attempts to move deals and payments off-platform.',
      },
      {
        heading: 'Keep it safe and legal',
        body: 'Do not post content that is unlawful, infringing, sexually explicit, or harmful. Follow all applicable advertising and disclosure rules.',
      },
      {
        heading: 'Reporting',
        body: 'See something that breaks these guidelines? Report it in-app or email trust@ugcad.io. We review every report.',
      },
    ],
  },
  '/cookie-policy': {
    title: 'Cookie Policy',
    intro: 'How cookies and tracking are used',
    updated: 'July 2026',
    sections: [
      {
        heading: 'What are cookies',
        body: 'Cookies are small text files stored on your device that help websites work and remember your preferences.',
      },
      {
        heading: 'Essential cookies',
        body: 'Required for the platform to function - keeping you signed in, securing your session and enabling core features. These cannot be turned off.',
      },
      {
        heading: 'Preference cookies',
        body: 'Remember choices like your language and dashboard settings to personalise your experience.',
      },
      {
        heading: 'Analytics cookies',
        body: 'Help us understand how the platform is used so we can improve performance and features. This data is aggregated.',
      },
      {
        heading: 'Managing cookies',
        body: 'You can control or delete cookies through your browser settings. Blocking essential cookies may affect how UGCad.io works.',
      },
    ],
  },
};

/**
 * The only legal page the website actually serves: public/privacy/index.html,
 * published at /privacy. The site is a React SPA with no /terms,
 * /community-guidelines or /cookie-policy route (they would just render the
 * app shell), so those documents link nowhere.
 */
const WEB_ORIGIN = 'https://www.ugcad.io';
const WEB_PAGES: Partial<Record<LegalDocId, string>> = {
  '/privacy-policy': '/privacy',
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
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
        <Text style={styles.updated}>Last updated {doc.updated}</Text>

        {doc.sections.map(section => (
          <View key={section.heading} style={styles.card}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}

        {!!WEB_PAGES[docId] && (
          <>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() =>
                Linking.openURL(`${WEB_ORIGIN}${WEB_PAGES[docId]}`).catch(
                  () => {},
                )
              }
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>Read the full privacy policy</Text>
              <Icon name="external" color="#4C5BF3" size={15} />
            </TouchableOpacity>

            <Text style={styles.footer}>
              The full text on ugcad.io is the binding version.
            </Text>
          </>
        )}
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
  },
  updated: {
    marginTop: scale(4),
    marginBottom: scale(14),
    fontSize: fontScale(11.5),
    color: '#9498B0',
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
