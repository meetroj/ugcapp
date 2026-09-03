/**
 * @format
 * Google sign-in: the button must be reachable, and the ID token the SDK
 * returns must be exchanged for a UGCad session via /api/auth/google.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

// The RN jest preset reports ios, where the Google button is hidden until an
// iOS OAuth client is configured. These flow tests are about the android path.
Platform.OS = 'android';

import AuthFlow from '../src/screens/AuthFlow';

function render(onAuthenticated: (s: any) => void) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}>
      <AuthFlow onAuthenticated={onAuthenticated} />
    </SafeAreaProvider>
  );
}

/** The Google button, found by the label the shared GoogleButton renders. */
function googleButton(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root
    .findAll(
      n =>
        typeof n.type !== 'string' &&
        typeof n.props.onPress === 'function' &&
        n
          .findAllByType('Text' as never)
          .some(t =>
            t.children
              .filter(c => typeof c === 'string')
              .join('')
              .toLowerCase()
              .includes('google'),
          ),
      { deep: true },
    )
    .at(0);
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      user_id: 'u1',
      role: 'creator',
      token: 'session-token',
      profile_completed: true,
    }),
  })) as never;
});

afterEach(() => jest.restoreAllMocks());

test('the Google button is rendered on log in', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(render(() => {}));
  });
  // It only renders when AuthFlow passes onGoogle — the wiring this guards.
  expect(googleButton(tree)).toBeTruthy();
});

test('signing in with Google exchanges the ID token for a session', async () => {
  const onAuthenticated = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(render(onAuthenticated));
  });

  await ReactTestRenderer.act(async () => {
    googleButton(tree)?.props.onPress();
  });

  const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(String(url)).toContain('/api/auth/google');
  // The backend verifies this token, so it must be the SDK's, sent as
  // `credential` — the field name /auth/google reads.
  expect(JSON.parse(init.body)).toEqual({
    credential: 'test-google-id-token',
    role: 'creator',
  });
  expect(onAuthenticated).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'session-token' }),
  );
});

test('backing out of the Google picker is not treated as an error', async () => {
  (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
    type: 'cancelled',
  });
  const onAuthenticated = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(render(onAuthenticated));
  });

  await ReactTestRenderer.act(async () => {
    googleButton(tree)?.props.onPress();
  });

  // No session, and crucially no request: cancelling must not post a token.
  expect(onAuthenticated).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('the Google button is hidden on iOS until an iOS client id is set', async () => {
  // Without GOOGLE_IOS_CLIENT_ID the SDK cannot resolve its client and throws
  // "failed to determine clientID". Hiding the button is better than offering
  // one that always errors.
  Platform.OS = 'ios';
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(render(() => {}));
  });
  expect(googleButton(tree)).toBeFalsy();
  Platform.OS = 'android';
});
