/**
 * Legal documents — native rendering of the policy pages that Privacy &
 * Security links to (/privacy-policy, /terms, /creator-brand-agreement,
 * /community-guidelines, /cookie-policy). The full text is shown in the app, so
 * nobody is sent to the website to read it.
 *
 * The text is the same copy the website shows (src/legalContent.ts here,
 * ugcad-frontend/src/data/legalContent.js there; both generated from the
 * owner's legal Google Doc): keep the two in step.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';import { Text } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import { CONTENT_COLUMN, scale, fontScale } from '../theme';
import { LEGAL_CONTENT, type LegalBlock, type LegalContentDoc } from '../legalContent';

export type LegalDocId =
  | '/privacy-policy'
  | '/terms'
  | '/creator-brand-agreement'
  | '/community-guidelines'
  | '/cookie-policy';

type Props = {
  docId: LegalDocId;
  onBack: () => void;
};

const COOKIE_SECTIONS: [string, string][] = [
  ['What are cookies', 'Cookies are small text files stored on your device that help websites work and remember your preferences.'],
  ['Essential cookies', 'Required for the platform to function - keeping you signed in, securing your session and enabling core features. These cannot be turned off.'],
  ['Preference cookies', 'Remember choices like your language and dashboard settings to personalise your experience.'],
  ['Analytics cookies', 'Help us understand how the platform is used so we can improve performance and features. This data is aggregated.'],
  ['Managing cookies', 'You can control or delete cookies through your browser settings. Blocking essential cookies may affect how UGCad.io works.'],
];

type Section = { heading: string; blocks: LegalBlock[] };

type Doc = {
  title: string;
  intro: string[];
  updated: string;
  sections: Section[];
};

const fromContent = (doc: LegalContentDoc): Doc => ({
  title: doc.name,
  intro: doc.intro,
  updated: doc.updated,
  sections: doc.sections.map(sec => ({ heading: sec.h, blocks: sec.blocks })),
});

/** Same text as the website (src/legalContent.ts is generated from the owner's legal Google Doc). */
const DOCS: Record<LegalDocId, Doc> = {
  '/privacy-policy': fromContent(LEGAL_CONTENT.privacy),
  '/terms': fromContent(LEGAL_CONTENT.terms),
  '/creator-brand-agreement': fromContent(LEGAL_CONTENT.agreement),
  '/community-guidelines': fromContent(LEGAL_CONTENT.guidelines),
  // The cookie policy was not part of the owner's Google Doc, so it keeps its short copy.
  '/cookie-policy': {
    title: 'Cookie Policy',
    intro: ['How cookies and tracking are used'],
    updated: 'July 2026',
    sections: COOKIE_SECTIONS.map(([heading, text]) => ({ heading, blocks: [{ t: 'p', text }] })),
  },
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
    </Svg>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.t === 'p') return <Text style={styles.body}>{block.text}</Text>;
  if (block.t === 'h') return <Text style={styles.subHeading}>{block.text}</Text>;
  if (block.t === 'ul') {
    return (
      <View style={styles.list}>
        {block.items.map((item, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={styles.bullet}>{'•'}</Text>
            <Text style={[styles.body, styles.listText]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  // A phone is too narrow for a real table: each row becomes a small labelled block.
  return (
    <View>
      {block.rows.map((row, i) => (
        <View key={i} style={styles.tableRow}>
          <Text style={styles.tableTitle}>{row[0]}</Text>
          {row.slice(1).map((cell, j) => (
            <Text key={j} style={styles.tableCell}>
              <Text style={styles.tableLabel}>{block.head[j + 1]}: </Text>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function LegalDocument({ docId, onBack }: Props) {
  const doc = DOCS[docId];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, CONTENT_COLUMN]}>
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
        contentContainerStyle={[styles.content, CONTENT_COLUMN]}
        showsVerticalScrollIndicator={false}
      >
        {doc.intro.map((text, i) => (
          <Text key={i} style={styles.intro}>
            {text}
          </Text>
        ))}
        <Text style={styles.updated}>Last updated {doc.updated}</Text>

        {doc.sections.map(section => (
          <View key={section.heading} style={styles.card}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </View>
        ))}
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
    width: 44,
    height: 44,
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
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#5C6180',
  },
  updated: {
    marginTop: scale(4),
    marginBottom: scale(14),
    fontSize: fontScale(12.5),
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
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  body: {
    marginTop: scale(7),
    fontSize: fontScale(14),
    lineHeight: fontScale(21),
    color: '#4A4E6B',
  },

  subHeading: {
    marginTop: scale(10),
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  list: { marginTop: scale(7), gap: scale(5) },
  listRow: { flexDirection: 'row', gap: scale(7) },
  bullet: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#4A4E6B' },
  listText: { flex: 1, marginTop: 0 },
  tableRow: {
    marginTop: scale(8),
    padding: scale(10),
    borderRadius: scale(10),
    backgroundColor: '#F7F7FD',
  },
  tableTitle: {
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  tableCell: {
    marginTop: scale(3),
    fontSize: fontScale(13.5),
    lineHeight: fontScale(19),
    color: '#4A4E6B',
  },
  tableLabel: { fontWeight: '700', color: '#15163F' },
});

export default LegalDocument;
