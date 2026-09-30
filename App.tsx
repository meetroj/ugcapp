/**
 * ugcad.io — native Android shell around the live PWA.
 * Shows the native auth screens first, then hands over to the WebView shell.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthFlow from './src/screens/AuthFlow';
import SplashScreen from './src/screens/SplashScreen';
import WebShell from './src/screens/WebShell';
import OnboardingWebView from './src/screens/OnboardingWebView';
import ApprovalGate from './src/screens/ApprovalGate';
import AgreementGate from './src/screens/AgreementGate';
import { verifySession, type AuthUser } from './src/api';
import { clearSession, loadSession, saveSession } from './src/session';

/**
 * How long the splash stays up at minimum. Long enough to register as a
 * deliberate launch screen rather than a flicker, short enough not to feel
 * like the app is stalling.
 */
const SPLASH_MIN_MS = 1600;

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
    // Fire-and-forget: a failed write only costs this device the next
    // auto-login, and the user is already through to the app.
    saveSession(next);
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
    clearSession();
  }, []);

  /**
   * Onboarding just set profile_completed on the server. Re-read the session so
   * the native routes — all gated on that flag — open up without a restart.
   */
  const handleProfileComplete = useCallback(async () => {
    if (!session) return;
    const refreshed = await verifySession(session);
    // verifySession returns null only on an explicit token rejection; falling
    // back to a local flip keeps the user moving if it merely failed to reach
    // the server.
    const next = refreshed || {...session, profile_completed: true};
    setSession(next);
    await saveSession(next);
  }, [session]);

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
        <AuthFlow onAuthenticated={handleAuthenticated} />
      ) : (session.profile_completed === false || reopenSetup) &&
        (session.role === 'business' || session.role === 'creator') ? (
        // Onboarding loads the LIVE website form in a WebView, so the app's
        // profile-setup is always the exact form the website ships (the native
        // copies had drifted out of sync). Completion is detected server-side.
        <OnboardingWebView
          session={session}
          onDone={() => {
            setReopenSetup(false);
            handleProfileComplete();
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
            } | null
          }
          onUpdateProfile={() => setReopenSetup(true)}
          onRefresh={handleProfileComplete}
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
      {/* One-time Creator & Brand Agreement gate, overlaid once an authenticated
          creator/brand hasn't accepted the current version. Acceptance is stored
          server-side, so agreeing on the website clears it here too (the gate
          re-checks with the server and never shows for someone who agreed). */}
      {session &&
        (session.role === 'creator' || session.role === 'business') &&
        session.agreement_accepted !== true && (
          <AgreementGate
            token={session.token}
            onAccepted={() => {
              const next = { ...session, agreement_accepted: true };
              setSession(next);
              saveSession(next);
            }}
          />
        )}
    </SafeAreaProvider>
  );
}

export default App;
