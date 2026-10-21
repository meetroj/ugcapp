import AppAlertHost from './src/components/AppAlert';
/**
 * ugcad.io — native Android shell around the live PWA.
 * Shows the native auth screens first, then hands over to the WebView shell.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthFlow from './src/screens/AuthFlow';
import SplashScreen from './src/screens/SplashScreen';
import WebShell from './src/screens/WebShell';
import OnboardingWebView from './src/screens/OnboardingWebView';
import ApprovalGate from './src/screens/ApprovalGate';
import AgreementGate from './src/screens/AgreementGate';
import TeamAcceptWebView from './src/screens/TeamAcceptWebView';
import { setUnauthorizedHandler, verifySession, type AuthUser } from './src/api';
import { parseDeepLink, type DeepLink } from './src/deepLink';
import { clearSession, loadSession, saveSession } from './src/session';

/**
 * How long the splash stays up at minimum. Long enough to register as a
 * deliberate launch screen rather than a flicker, short enough not to feel
 * like the app is stalling.
 */
const SPLASH_MIN_MS = 1600;

/** How often an open app re-asks the server whether the login still works. */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

/** Where a session lands after logging in, based on role and profile state. */
function homePathFor(session: AuthUser): string {
  if (session.profile_completed === false) {
    return session.role === 'creator'
      ? '/profile-setup/creator'
      : '/profile-setup/business';
  }
  // Brands land on the Creators tab: browsing creators is the first thing a
  // brand does, and the old /dashboard/business summary screen is gone.
  return session.role === 'creator'
    ? '/dashboard/creator'
    : session.role === 'business'
    ? '/dashboard/business/browse-creator'
    : '/dashboard/admin';
}

function App(): React.JSX.Element {
  const [session, setSession] = useState<AuthUser | null>(null);
  // Blocks the first paint so a returning user never sees the login screen
  // flash before the stored session is read back.
  const [restoring, setRestoring] = useState(true);
  // Set when a creator or brand answers a more-info request: onboarding is
  // complete, but they need the form back to change what the review team
  // asked about.
  const [reopenSetup, setReopenSetup] = useState(false);
  // Links from emails (reset code, team invitation). `id` changes on every new
  // link so AuthFlow remounts and applies it even if it is already on screen.
  const [authLink, setAuthLink] = useState<{
    id: number;
    link: Extract<DeepLink, { kind: 'auth' }>;
  } | null>(null);
  const [teamToken, setTeamToken] = useState<string | null>(null);

  useEffect(() => {
    const open = (url?: string | null) => {
      const link = parseDeepLink(url);
      if (!link) return;
      if (link.kind === 'team') setTeamToken(link.token);
      else setAuthLink(prev => ({ id: (prev?.id ?? 0) + 1, link }));
    };
    // Cold start (app opened by the link) and warm start (app already running).
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Logged-out launches finish the check in well under a frame, so without
      // a floor the splash would flash past before it could be read.
      const shownFor = new Promise<void>(resolve => {
        setTimeout(() => resolve(), SPLASH_MIN_MS);
      });

      const restore = (async () => {
        const stored = await loadSession();
        if (!stored) {
          return null;
        }
        // Ask the backend whether the token still works. Offline or a server
        // error keeps the user logged in; only an explicit rejection clears it.
        const checked = await verifySession(stored);
        if (checked) {
          if (checked !== stored) {
            await saveSession(checked);
          }
        } else {
          await clearSession();
        }
        return checked;
      })();

      // Wait for whichever takes longer: the session check, or the minimum.
      const [checked] = await Promise.all([restore, shownFor]);
      if (cancelled) {
        return;
      }
      if (checked) {
        setSession(checked);
      }
      setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = useCallback((next: AuthUser) => {
    setSession(next);
    setAuthLink(null);
    // Fire-and-forget: a failed write only costs this device the next
    // auto-login, and the user is already through to the app.
    saveSession(next);
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
    setAuthLink(null);
    clearSession();
  }, []);

  /**
   * Onboarding just set profile_completed on the server. Re-read the session so
   * the native routes — all gated on that flag — open up without a restart.
   */
  const handleProfileComplete = useCallback(async (strict = false) => {
    if (!session) return;
    const refreshed = await verifySession(session);
    // verifySession returns null only when the server rejected the token
    // (401/403: expired, revoked, account deleted). That is a sign-out, not a
    // reason to wave the user through; a mere network failure comes back as the
    // unchanged session, so offline users stay logged in.
    if (!refreshed) {
      handleLogout();
      return;
    }
    // "Check Status" must not claim "still under review" when the server was
    // never reached: verifySession hands back the same object on a network error.
    if (strict && refreshed === session) throw new Error('unreachable');
    setSession(refreshed);
    await saveSession(refreshed);
  }, [session, handleLogout]);

  // 401 -> login. Native screens each call the API on their own, so the one
  // place that notices an ended session is a re-check whenever the app comes
  // back to the foreground and every few minutes while it is open.
  const sessionRef = useRef<AuthUser | null>(null);
  sessionRef.current = session;
  const signedIn = !!session;
  // Any API call that gets a 401 asks for a re-check, which logs out only when
  // the server really rejects the token (a stray 401 elsewhere cannot sign out).
  const lastUnauthorizedCheck = useRef(0);
  useEffect(() => {
    if (!signedIn) return;
    setUnauthorizedHandler(() => {
      const current = sessionRef.current;
      const now = Date.now();
      if (!current || now - lastUnauthorizedCheck.current < 5000) return;
      lastUnauthorizedCheck.current = now;
      verifySession(current).then(fresh => {
        if (fresh === null) handleLogout();
      });
    });
    return () => setUnauthorizedHandler(null);
  }, [signedIn, handleLogout]);
  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    const recheck = async () => {
      const current = sessionRef.current;
      if (!current || AppState.currentState !== 'active') return;
      const fresh = await verifySession(current);
      if (stopped) return;
      if (fresh === null) {
        handleLogout();
        return;
      }
      // Admin approved / asked for more info while the app was open: pick the
      // new state up here so the gate lifts without a manual Check Status.
      if (
        fresh.approval_status !== current.approval_status ||
        fresh.profile_completed !== current.profile_completed
      ) {
        setSession(fresh);
        saveSession(fresh);
      }
    };
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') recheck();
    });
    const timer = setInterval(recheck, SESSION_RECHECK_MS);
    return () => {
      stopped = true;
      sub.remove();
      clearInterval(timer);
    };
  }, [signedIn, handleLogout]);

  if (restoring) {
    return (
      <SafeAreaProvider>
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {!session ? (
        <AuthFlow
          key={authLink?.id ?? 0}
          onAuthenticated={handleAuthenticated}
          initialLink={authLink?.link}
        />
      ) : (session.profile_completed === false || reopenSetup) &&
        (session.role === 'business' || session.role === 'creator') ? (
        // Onboarding loads the LIVE website form in a WebView, so the app's
        // profile-setup is always the exact form the website ships (the native
        // copies had drifted out of sync). Completion is detected server-side.
        // When reopened for a more-info request the profile is already
        // "completed", so the form stays open until it is submitted again
        // (see onboardingFinished) and Back returns to the request.
        <OnboardingWebView
          session={session}
          reopened={reopenSetup}
          onCancel={() => setReopenSetup(false)}
          onDone={async () => {
            // Refresh first, then close: the other way round flashes the old
            // "more information needed" screen before the new status lands.
            await handleProfileComplete();
            setReopenSetup(false);
          }}
          onLogout={handleLogout}
        />
      ) : (session.role === 'creator' || session.role === 'business') &&
        typeof session.approval_status === 'string' &&
        session.approval_status !== 'approved' ? (
        // Mirrors the website's verification gates: BOTH roles wait here until
        // an admin approves the profile (BrandTopNavLayout gates brands the
        // same way CreatorDashboard gates creators). Pending shows Check
        // Status, rejected shows Contact Support, and a more-info request
        // shows the team's message with an Update My Profile path back into
        // onboarding.
        <ApprovalGate
          kind={session.role === 'business' ? 'business' : 'creator'}
          status={session.approval_status}
          review={
            session.review as {
              more_info_message?: string;
              more_info_items?: string[];
              reason_code?: string;
              reason_details?: string;
            } | null
          }
          account={{
            email: String(session.email || ''),
            id: String(session.id || session.user_id || ''),
            role: session.role,
          }}
          onUpdateProfile={() => setReopenSetup(true)}
          onRefresh={() => handleProfileComplete(true)}
          onLogout={handleLogout}
        />
      ) : (
        <WebShell
          token={session.token}
          session={session}
          onLogout={handleLogout}
          initialPath={homePathFor(session)}
        />
      )}
      {/* One-time Creator & Brand Agreement gate, overlaid on the dashboard once an
          approved creator/brand hasn't accepted the current version — never during
          onboarding or while awaiting approval. Acceptance is stored server-side,
          so agreeing on the website clears it here too (the gate re-checks with
          the server and never shows for someone who agreed). */}
      {session &&
        (session.role === 'creator' || session.role === 'business') &&
        session.approval_status === 'approved' &&
        session.profile_completed !== false &&
        !reopenSetup &&
        session.agreement_accepted !== true && (
          <AgreementGate
            token={session.token}
            onLogout={handleLogout}
            onAccepted={() => {
              const next = { ...session, agreement_accepted: true };
              setSession(next);
              saveSession(next);
            }}
          />
        )}
      {/* Team invitation link: the website's accept form in a WebView. A Modal so
          it sits above whatever is showing (login or the dashboard). */}
      <Modal
        visible={!!teamToken}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setTeamToken(null)}
      >
        {!!teamToken && (
          <TeamAcceptWebView
            token={teamToken}
            onClose={() => setTeamToken(null)}
            onSession={next => {
              setTeamToken(null);
              handleAuthenticated(next);
            }}
          />
        )}
      </Modal>
      <AppAlertHost />
    </SafeAreaProvider>
  );
}

export default App;
