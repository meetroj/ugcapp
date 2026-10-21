/**
 * Onboarding via the live website form, inside a WebView — so the app's
 * profile-setup is ALWAYS the exact form the website ships, instead of a
 * separate native copy that drifts out of sync.
 *
 * The website's /profile-setup/{role} page runs here with the same WebView
 * config the main shell uses (file uploads, cookies, injected token). When the
 * form is submitted the backend flips profile_completed; a light poll of
 * /auth/me notices that and hands control back to the app (onDone), which then
 * shows the approval gate / dashboard. A manual "I've finished" button is the
 * backstop if the poll is slow.
 *
 * When reopened for a more-info request, "finished" means approval_status left
 * 'more_info' (see onboardingFinished), not profile_completed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { Alert } from '../components/AppAlert';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { verifySession, type AuthUser } from '../api';
import { SITE_ORIGIN, isSiteUrl } from '../deepLink';
import { scale, fontScale } from '../theme';

/**
 * Has the form been (re)submitted? First time round the server flips
 * profile_completed. When the review team asked for more info the profile is
 * ALREADY completed, so that flag proves nothing: the website's PUT
 * /profile/{role} instead moves approval_status from 'more_info' back to
 * 'pending', and that is the only signal that the user really resubmitted.
 */
export function onboardingFinished(
  fresh: AuthUser | null,
  reopened: boolean,
): boolean {
  if (!fresh) return false;
  return reopened
    ? fresh.approval_status !== 'more_info'
    : !!fresh.profile_completed;
}

type Props = {
  session: AuthUser;
  /** Called once the profile is completed server-side. */
  onDone: () => void;
  onLogout: () => void;
  /**
   * The form was reopened to answer a more-info request. It then stays open
   * until the user submits it again, instead of closing as soon as it sees a
   * completed profile.
   */
  reopened?: boolean;
  /** Reopened only: back to the "More information needed" screen. */
  onCancel?: () => void;
};

export default function OnboardingWebView({
  session,
  onDone,
  onLogout,
  reopened = false,
  onCancel,
}: Props) {
  // This screen is mounted straight under the SafeAreaProvider (no
  // SafeAreaView), so the notch / status bar / home bar are cleared here.
  const insets = useSafeAreaInsets();
  const path =
    session.role === 'creator'
      ? '/profile-setup/creator'
      : '/profile-setup/business';
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(false);
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Poll the server: the web form sets profile_completed on submit, and this is
  // what advances the app without asking the user to do anything extra.
  useEffect(() => {
    const timer = setInterval(async () => {
      const fresh = await verifySession(session);
      // null = the server rejected the token: sign out instead of polling forever.
      if (fresh === null) {
        onLogout();
        return;
      }
      if (onboardingFinished(fresh, reopened)) finish();
    }, 4000);
    return () => clearInterval(timer);
  }, [session, finish, reopened, onLogout]);

  // manual = the Done button: say so when the form has not been submitted yet,
  // instead of silently doing nothing.
  const checkNow = useCallback(
    async (manual = false) => {
      setChecking(true);
      const fresh = await verifySession(session);
      setChecking(false);
      if (fresh === null) {
        onLogout();
        return;
      }
      if (onboardingFinished(fresh, reopened)) finish();
      else if (manual) {
        Alert.alert(
          'Not submitted yet',
          'Fill in the form and submit it first. This screen closes by itself once your profile is submitted.',
        );
      }
    },
    [session, finish, reopened, onLogout],
  );

  // Android back steps back through the form's pages; at the first page it
  // returns to the previous screen (more-info) instead of quitting the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      if (reopened && onCancel) {
        onCancel();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [reopened, onCancel]);

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
        {reopened && onCancel ? (
          <TouchableOpacity
            style={styles.barBtn}
            onPress={onCancel}
            accessibilityRole="button"
            testID="onboarding-back"
          >
            <Text style={styles.barLink}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.barBtn}
            onPress={onLogout}
            accessibilityRole="button"
          >
            <Text style={styles.barLink}>Log out</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.barTitle} numberOfLines={1}>
          {reopened ? 'Update your profile' : 'Complete your profile'}
        </Text>
        <TouchableOpacity
          style={[styles.barBtn, styles.barBtnEnd]}
          onPress={() => checkNow(true)}
          accessibilityRole="button"
        >
          <Text style={styles.barLink}>{checking ? '…' : 'Done'}</Text>
        </TouchableOpacity>
      </View>
      {failed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{"Can't load the form"}</Text>
          <Text style={styles.errorBody}>
            {
              "You're offline or the connection dropped. Check your connection and try again."
            }
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
        // Android is edge-to-edge (the keyboard does not resize the window), so
        // pad by the keyboard height or the lower form fields sit behind it.
        <KeyboardAvoidingView
          style={styles.web}
          behavior="padding"
          enabled={Platform.OS === 'android'}
        >
        <WebView
          key={attempt}
          ref={webRef}
          source={{ uri: `${SITE_ORIGIN}${path}` }}
          injectedJavaScriptBeforeContentLoaded={`localStorage.setItem('token', ${JSON.stringify(
            session.token,
          )}); true;`}
          style={styles.web}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          cacheEnabled
          allowFileAccess
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          overScrollMode="never"
          // Leaving the setup page (the site redirects after submit) is also a
          // completion signal — check immediately rather than waiting for the poll.
          onNavigationStateChange={nav => {
            canGoBack.current = nav.canGoBack;
            const p = nav.url
              .replace(/^https?:\/\/[^/]+/i, '')
              .split(/[?#]/)[0];
            if (nav.url && !p.startsWith('/profile-setup')) checkNow();
          }}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          // Links off the site (mail, social, documents) open outside the
          // form, so a tap never replaces the half-filled page.
          onShouldStartLoadWithRequest={req => {
            if (isSiteUrl(req.url)) return true;
            Linking.openURL(req.url).catch(() => {});
            return false;
          }}
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
    paddingHorizontal: scale(16),
    paddingVertical: scale(4),
  },
  barBtn: { minWidth: scale(64), minHeight: 44, justifyContent: 'center' },
  barBtnEnd: { alignItems: 'flex-end' },
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
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(24),
  },
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
