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
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { WebView } from 'react-native-webview';
import { verifySession, type AuthUser } from '../api';
import { scale, fontScale } from '../theme';

const SITE_ORIGIN = __DEV__ ? 'http://localhost:3000' : 'https://www.ugcad.io';

type Props = {
  session: AuthUser;
  /** Called once the profile is completed server-side. */
  onDone: () => void;
  onLogout: () => void;
};

export default function OnboardingWebView({ session, onDone, onLogout }: Props) {
  const path =
    session.role === 'creator'
      ? '/profile-setup/creator'
      : '/profile-setup/business';
  const [checking, setChecking] = useState(false);
  const doneRef = useRef(false);

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
      if (fresh && fresh.profile_completed) finish();
    }, 4000);
    return () => clearInterval(timer);
  }, [session, finish]);

  const checkNow = useCallback(async () => {
    setChecking(true);
    const fresh = await verifySession(session);
    setChecking(false);
    if (fresh && fresh.profile_completed) finish();
  }, [session, finish]);

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={onLogout} accessibilityRole="button">
          <Text style={styles.barLink}>Log out</Text>
        </TouchableOpacity>
        <Text style={styles.barTitle}>Complete your profile</Text>
        <TouchableOpacity onPress={checkNow} accessibilityRole="button">
          <Text style={styles.barLink}>{checking ? '…' : 'Done'}</Text>
        </TouchableOpacity>
      </View>
      <WebView
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
          const p = nav.url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
          if (nav.url && !p.startsWith('/profile-setup')) checkNow();
        }}
      />
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
    paddingVertical: scale(12),
  },
  barTitle: {
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
});
