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
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { CONTENT_MAX_WIDTH, scale, fontScale } from '../theme';

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
  onLogout,
}: {
  token: string;
  onAccepted: () => void;
  /** Escape hatch when the agreement cannot load: the gate has no other exit. */
  onLogout?: () => void;
}) {
  const [data, setData] = useState<Agreement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Bumped by Retry to re-run the load.
  const [attempt, setAttempt] = useState(0);
  // The parent passes a fresh inline callback on every render; reading it
  // through a ref keeps the load from re-running (and flashing) each time.
  const acceptedRef = useRef(onAccepted);
  acceptedRef.current = onAccepted;
  // Measured sizes of the scroll area, to spot an agreement short enough that
  // there is nothing to scroll (the scroll event would then never fire).
  const sizes = useRef({ content: 0, view: 0 });

  useEffect(() => {
    let live = true;
    setError('');
    getAgreement(token)
      .then(res => {
        if (!live) return;
        if (res?.accepted) acceptedRef.current();
        else setData(res as Agreement);
      })
      .catch(() => live && setError('Could not load the agreement. Check your connection.'));
    return () => {
      live = false;
    };
  }, [token, attempt]);

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

  // Everything already visible: the end has been reached without scrolling, so
  // enable Agree (the website does the same after expanding).
  const checkFits = useCallback(() => {
    const { content, view } = sizes.current;
    if (expanded && content > 0 && view > 0 && content <= view + 24) {
      setAtBottom(true);
    }
  }, [expanded]);
  useEffect(() => {
    checkFits();
  }, [checkFits]);

  const agree = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      await acceptAgreement(token);
      acceptedRef.current();
    } catch {
      setError('Could not record your acceptance. Please try again.');
      setSubmitting(false);
    }
  }, [token]);

  if (!data) {
    return (
      <Shell>
        <View style={[styles.card, styles.loadCard]}>
          {error ? (
            <>
              <Text style={styles.errCentre}>{error}</Text>
              <TouchableOpacity
                style={[styles.agree, styles.loadBtn]}
                onPress={() => setAttempt(n => n + 1)}
                accessibilityRole="button"
              >
                <Text style={styles.agreeText}>Retry</Text>
              </TouchableOpacity>
              {!!onLogout && (
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={onLogout}
                  accessibilityRole="button"
                >
                  <Text style={styles.logoutText}>Log out</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <ActivityIndicator color="#4C5BF3" />
          )}
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
          onLayout={e => {
            sizes.current.view = e.nativeEvent.layout.height;
            checkFits();
          }}
          onContentSizeChange={(_w, h) => {
            sizes.current.content = h;
            checkFits();
          }}
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
            <TouchableOpacity
              style={styles.viewAll}
              onPress={viewAll}
              accessibilityRole="button"
            >
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
    // Capped and centred so a tablet gets a card, not a full-width sheet.
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  loadCard: {
    paddingVertical: scale(32),
    paddingHorizontal: scale(20),
    alignItems: 'center',
    gap: scale(14),
  },
  loadBtn: { alignSelf: 'stretch' },
  logoutBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: scale(16) },
  logoutText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  errCentre: { color: '#C0392B', fontSize: fontScale(14), textAlign: 'center' },
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
  sub: { marginTop: scale(5), fontSize: fontScale(13), color: '#6B7280' },
  body: { flexGrow: 0 },
  bodyContent: { padding: scale(20) },
  intro: {
    fontSize: fontScale(14),
    lineHeight: fontScale(21),
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
    fontSize: fontScale(14),
    lineHeight: fontScale(21),
    color: '#374151',
  },
  viewAll: {
    marginTop: scale(8),
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: scale(12),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#D7DAF0',
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3B41A8',
  },
  hint: {
    marginTop: scale(14),
    textAlign: 'center',
    fontSize: fontScale(13),
    color: '#9AA0B4',
  },
  err: {
    paddingHorizontal: scale(20),
    color: '#C0392B',
    fontSize: fontScale(13),
  },
  footer: {
    paddingHorizontal: scale(20),
    paddingVertical: scale(14),
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  agree: {
    height: scale(46),
    minHeight: 44,
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
