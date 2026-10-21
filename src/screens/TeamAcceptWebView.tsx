/**
 * Team invitation, opened from the emailed link (https://www.ugcad.io/team/accept?token=...).
 *
 * The website page IS the accept form (GET /team/invite/{token}, then POST
 * /team/accept with name + password), so it runs here in a WebView. When the
 * accept succeeds the page stores the new login token in its localStorage; a
 * small watcher posts it back and the app turns it into a real native session,
 * so the invited person lands in the brand app without logging in again.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { Alert } from '../components/AppAlert';
import { verifySession, type AuthUser } from '../api';
import { SITE_ORIGIN, isSiteUrl } from '../deepLink';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  /** The invitation was accepted: a verified session for the new member. */
  onSession: (session: AuthUser) => void;
  /** Leave without accepting. */
  onClose: () => void;
};

// The page may already hold another login in this WebView, so clear it first:
// otherwise the watcher below would hand that old token back as "accepted".
const CLEAR_OLD_LOGIN =
  "try{localStorage.removeItem('token');}catch(e){} true;";

// Posts the token once the page has stored one (it only does so after a
// successful POST /team/accept).
const WATCH_FOR_LOGIN =
  "(function(){if(window.__ugcWatch)return;window.__ugcWatch=setInterval(function(){try{var t=localStorage.getItem('token');if(t&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(t);}}catch(e){}},800);})();true;";

export default function TeamAcceptWebView({ token, onSession, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  const onMessage = useCallback(
    async (raw: string) => {
      if (busy.current || !raw) return;
      busy.current = true;
      try {
        const base = { user_id: '', role: 'business', token: raw } as AuthUser;
        const fresh = await verifySession(base);
        // verifySession hands the input back unchanged when the request fails,
        // so a real profile (it has an id) is the proof the token works.
        if (fresh && typeof fresh.id === 'string') {
          onSession({ ...fresh, user_id: String(fresh.user_id || fresh.id) });
        }
      } finally {
        // Release so the next watcher tick can retry after a network failure.
        busy.current = false;
      }
    },
    [onSession],
  );

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
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.barBtn}
          accessibilityRole="button"
          accessibilityLabel="Close invitation"
          testID="team-accept-close"
        >
          <Text style={styles.barLink}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.barTitle} numberOfLines={1}>
          Join your team
        </Text>
        <View style={styles.barBtn} />
      </View>

      {failed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{"Can't open the invitation"}</Text>
          <Text style={styles.errorBody}>
            {"You're offline or the connection dropped. Check your connection and try again."}
          </Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => {
              setFailed(false);
              setAttempt(n => n + 1);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // The accept form has a password field: keep it above the keyboard on
        // Android's edge-to-edge window.
        <KeyboardAvoidingView
          style={styles.web}
          behavior="padding"
          enabled={Platform.OS === 'android'}
        >
        <WebView
          key={attempt}
          source={{
            uri: `${SITE_ORIGIN}/team/accept?token=${encodeURIComponent(token)}`,
          }}
          injectedJavaScriptBeforeContentLoaded={CLEAR_OLD_LOGIN}
          injectedJavaScript={WATCH_FOR_LOGIN}
          onMessage={e => onMessage(e.nativeEvent.data)}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          onShouldStartLoadWithRequest={req => {
            if (isSiteUrl(req.url)) return true;
            Linking.openURL(req.url).catch(() =>
              Alert.alert('Could not open the link'),
            );
            return false;
          }}
          style={styles.web}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
          overScrollMode="never"
        />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(8),
  },
  barBtn: { minWidth: scale(64), minHeight: 44, justifyContent: 'center', paddingHorizontal: scale(8) },
  barTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  barLink: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#9C9EE8',
  },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: scale(24) },
  errorTitle: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  errorBody: {
    marginTop: scale(8),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: 'rgba(255,255,255,0.66)',
    textAlign: 'center',
  },
  retry: {
    marginTop: scale(18),
    minWidth: scale(140),
    minHeight: 46,
    borderRadius: scale(13),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(20),
  },
  retryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
