/**
 * One-time Creator & Brand Agreement gate (native).
 *
 * Shown over the app once an authenticated creator/brand has not accepted the
 * current agreement version. Acceptance is stored server-side (POST
 * /api/agreement/accept), so agreeing here also clears the gate on the website
 * and vice-versa. Matches the web card: a couple of sections show first, "View
 * full agreement" reveals the rest, and Agree stays disabled until the reader
 * has scrolled to the end.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { acceptAgreement, getAgreement } from '../api';
import { scale, fontScale } from '../theme';

type Section = { n: string; heading: string; body: string };
type Agreement = {
  version: string;
  title: string;
  last_updated: string;
  intro: string;
  preview_sections: number;
  sections: Section[];
  accepted?: boolean;
};

/**
 * Its own window, not an overlay View. On Android an absolutely positioned View
 * does not reliably cover the dashboard's WebView, so a tap on this card fell
 * through to a text field on the page behind and opened the keyboard. A Modal
 * takes every touch and moves focus off whatever was underneath.
 */
function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    Keyboard.dismiss();
  }, []);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Back must not skip the agreement.
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>{children}</View>
    </Modal>
  );
}

export default function AgreementGate({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: () => void;
}) {
  const [data, setData] = useState<Agreement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getAgreement(token)
      .then(res => {
        if (!live) return;
        if (res?.accepted) onAccepted();
        else setData(res as Agreement);
      })
      .catch(() => live && setError('Could not load the agreement. Check your connection.'));
    return () => {
      live = false;
    };
  }, [token, onAccepted]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) {
        setAtBottom(true);
      }
    },
    [],
  );

  const viewAll = useCallback(() => setExpanded(true), []);

  const agree = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      await acceptAgreement(token);
      onAccepted();
    } catch {
      setError('Could not record your acceptance. Please try again.');
      setSubmitting(false);
    }
  }, [token, onAccepted]);

  if (!data) {
    return (
      <Shell>
        <View style={[styles.card, { paddingVertical: scale(40) }]}>
          <ActivityIndicator color="#4C5BF3" />
          {!!error && <Text style={styles.err}>{error}</Text>}
        </View>
      </Shell>
    );
  }

  const shown = expanded
    ? data.sections
    : data.sections.slice(0, data.preview_sections || 2);
  const canAgree = expanded && atBottom && !submitting;

  return (
    <Shell>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.sub}>
            Last updated {data.last_updated} · Please read and accept to continue.
          </Text>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
        >
          <Text style={styles.intro}>{data.intro}</Text>
          {shown.map(sec => (
            <View key={sec.n} style={styles.section}>
              <Text style={styles.secHead}>
                {sec.n}. {sec.heading}
              </Text>
              <Text style={styles.secBody}>{sec.body}</Text>
            </View>
          ))}

          {!expanded && (
            <TouchableOpacity style={styles.viewAll} onPress={viewAll}>
              <Text style={styles.viewAllText}>View full agreement ↓</Text>
            </TouchableOpacity>
          )}
          {expanded && !atBottom && (
            <Text style={styles.hint}>Scroll to the end to enable “Agree”.</Text>
          )}
        </ScrollView>

        {!!error && <Text style={styles.err}>{error}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.agree, expanded && !canAgree && styles.agreeOff]}
            disabled={expanded && !canAgree}
            onPress={expanded ? agree : viewAll}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.agreeText}>
                {expanded
                  ? atBottom
                    ? 'Agree & Continue'
                    : 'Scroll to the end'
                  : 'View full agreement'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'rgba(8,10,26,0.66)',
    paddingHorizontal: scale(14),
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(20),
    overflow: 'hidden',
    maxHeight: '80%',
    alignSelf: 'stretch',
  },
  head: {
    paddingHorizontal: scale(20),
    paddingTop: scale(18),
    paddingBottom: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F5',
  },
  title: {
    fontSize: fontScale(17),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#12142E',
  },
  sub: { marginTop: scale(5), fontSize: fontScale(12), color: '#6B7280' },
  body: { flexGrow: 0 },
  bodyContent: { padding: scale(20) },
  intro: {
    fontSize: fontScale(12.5),
    lineHeight: fontScale(20),
    color: '#374151',
    marginBottom: scale(16),
  },
  section: { marginBottom: scale(15) },
  secHead: {
    fontSize: fontScale(13.5),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#1F2340',
    marginBottom: scale(5),
  },
  secBody: {
    fontSize: fontScale(12.5),
    lineHeight: fontScale(20),
    color: '#374151',
  },
  viewAll: {
    marginTop: scale(8),
    paddingVertical: scale(12),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#D7DAF0',
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3B41A8',
  },
  hint: {
    marginTop: scale(14),
    textAlign: 'center',
    fontSize: fontScale(12),
    color: '#9AA0B4',
  },
  err: {
    paddingHorizontal: scale(20),
    color: '#C0392B',
    fontSize: fontScale(12),
  },
  footer: {
    paddingHorizontal: scale(20),
    paddingVertical: scale(14),
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  agree: {
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeOff: { backgroundColor: '#C3C7DD' },
  agreeText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
