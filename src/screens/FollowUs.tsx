/**
 * Follow Us — social links for UGCad.io, reached from the profile menu.
 * Instagram is live and opens externally; the rest are marked "Coming Soon"
 * and stay inert until those accounts exist.
 */
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import ScreenHeader from '../components/ScreenHeader';
import { scale, fontScale } from '../theme';

type Social = {
  key: string;
  name: string;
  handle: string;
  url?: string;
};

/** Instagram is the only account live today. */
const SOCIALS: Social[] = [
  {
    key: 'instagram',
    name: 'Instagram',
    handle: '@ugcad.app',
    url: 'https://www.instagram.com/ugcad.app',
  },
  { key: 'linkedin', name: 'LinkedIn', handle: 'UGCad.io' },
  { key: 'youtube', name: 'YouTube', handle: 'UGCad.io' },
  { key: 'x', name: 'X (Twitter)', handle: '@ugcad_io' },
];

/** Brand marks drawn to each platform's own geometry and colours. */
function BrandLogo({ name }: { name: string }) {
  if (name === 'instagram') {
    return (
      <Svg width={38} height={38} viewBox="0 0 48 48">
        <Defs>
          <RadialGradient id="ig" cx="30%" cy="107%" r="150%">
            <Stop offset="0%" stopColor="#FDD35D" />
            <Stop offset="25%" stopColor="#FD5C3B" />
            <Stop offset="50%" stopColor="#D92E7F" />
            <Stop offset="100%" stopColor="#7638FA" />
          </RadialGradient>
        </Defs>
        <Rect width={48} height={48} rx={13} fill="url(#ig)" />
        <Rect
          x={12}
          y={12}
          width={24}
          height={24}
          rx={7}
          stroke="#FFF"
          strokeWidth={2.6}
          fill="none"
        />
        <Circle
          cx={24}
          cy={24}
          r={6}
          stroke="#FFF"
          strokeWidth={2.6}
          fill="none"
        />
        <Circle cx={31.4} cy={16.6} r={1.9} fill="#FFF" />
      </Svg>
    );
  }
  if (name === 'linkedin') {
    return (
      <Svg width={38} height={38} viewBox="0 0 48 48">
        <Rect width={48} height={48} rx={13} fill="#0A66C2" />
        <Circle cx={15.5} cy={15} r={2.9} fill="#FFF" />
        <Rect x={12.9} y={20} width={5.2} height={16} fill="#FFF" />
        <Path
          d="M22 20h5v2.3c.9-1.6 2.7-2.7 5-2.7 4.1 0 6.5 2.5 6.5 7.3V36h-5.2v-8.3c0-2.3-1-3.8-3-3.8s-3.1 1.5-3.1 3.8V36H22V20Z"
          fill="#FFF"
        />
      </Svg>
    );
  }
  if (name === 'youtube') {
    return (
      <Svg width={38} height={38} viewBox="0 0 48 48">
        <Rect width={48} height={48} rx={13} fill="#FF0000" />
        <Path d="M20 17.5 33 24l-13 6.5v-13Z" fill="#FFF" />
      </Svg>
    );
  }
  return (
    <Svg width={38} height={38} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={13} fill="#000000" />
      <Path
        d="M13 13h6.6l5.6 7.7L32.2 13H36l-9.1 10.4L36.5 35h-6.6l-6-8.2L16.4 35H12.6l9.5-10.9L13 13Z"
        fill="#FFF"
      />
    </Svg>
  );
}

function Chevron() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9.5 6.5 5.5 5.5-5.5 5.5"
        stroke="#B4B8CC"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FollowUs({
  onBack,
  onNavigate,
  unread = 0,
}: {
  onBack: () => void;
  onNavigate: (path: string) => void;
  unread?: number;
}) {
  const open = (social: Social) => {
    if (social.url) {
      Linking.openURL(social.url).catch(() => {});
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Follow Us"
        onBack={onBack}
        onChat={() => onNavigate('/messages')}
        unread={unread}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Svg width={26} height={26} viewBox="0 0 24 24">
              <Path
                d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 1 1 19.3 13L12 20.3Z"
                fill="#FFFFFF"
              />
            </Svg>
          </View>
          <Text style={styles.heroTitle}>Stay connected with UGCad.io</Text>
          <Text style={styles.heroBody}>
            Follow us on social media for updates, tips and new features.
          </Text>
        </View>

        <View style={styles.card}>
          {SOCIALS.map((social, index) => {
            const live = Boolean(social.url);
            return (
              <TouchableOpacity
                key={social.key}
                style={[
                  styles.row,
                  index === SOCIALS.length - 1 && styles.rowLast,
                ]}
                onPress={() => open(social)}
                disabled={!live}
                accessibilityRole="link"
                accessibilityLabel={
                  live ? `Open ${social.name}` : `${social.name}, coming soon`
                }
                activeOpacity={0.6}
              >
                <BrandLogo name={social.key} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{social.name}</Text>
                  <Text style={styles.rowHandle}>{social.handle}</Text>
                </View>
                <View
                  style={[
                    styles.pill,
                    live ? styles.pillLive : styles.pillSoon,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      live ? styles.pillTextLive : styles.pillTextSoon,
                    ]}
                  >
                    {live ? 'Follow' : 'Coming Soon'}
                  </Text>
                </View>
                <Chevron />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  // The page sits on a light sheet, rounded at the top only.
  body: {
    flex: 1,
    backgroundColor: '#F5F6FB',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { paddingTop: scale(6), paddingBottom: scale(26) },
  hero: {
    margin: scale(16),
    paddingVertical: scale(22),
    paddingHorizontal: scale(20),
    borderRadius: scale(16),
    backgroundColor: '#EDEFFE',
    alignItems: 'center',
  },
  heroBadge: {
    width: scale(46),
    height: scale(46),
    borderRadius: scale(13),
    backgroundColor: '#4D57E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    marginTop: scale(13),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#1E2044',
    textAlign: 'center',
  },
  heroBody: {
    marginTop: scale(6),
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    color: '#767B98',
    textAlign: 'center',
  },
  card: {
    marginHorizontal: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9EAF3',
    overflow: 'hidden',
  },
  row: {
    minHeight: scale(68),
    paddingVertical: scale(12),
    paddingHorizontal: scale(13),
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EAF3',
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, marginLeft: scale(12), marginRight: scale(8) },
  rowLabel: {
    fontSize: fontScale(13.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1E2044',
  },
  rowHandle: { marginTop: scale(2), fontSize: fontScale(11), color: '#8A8FA8' },
  pill: {
    marginRight: scale(6),
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    borderRadius: scale(9),
  },
  pillLive: { backgroundColor: '#EDEFFE' },
  pillSoon: { backgroundColor: '#F0F1F7' },
  pillText: { fontSize: fontScale(10), fontFamily: 'Inter-ExtraBold', fontWeight: '800' },
  pillTextLive: { color: '#4D57E3' },
  pillTextSoon: { color: '#8A8FA8' },
});

export default FollowUs;
