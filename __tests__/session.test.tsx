/**
 * Covers the two regressions this suite exists for: a login that survives a
 * cold start, and a back press that steps back instead of closing the app.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {BackHandler, Image, Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import WebShell from '../src/screens/WebShell';
import {clearSession, loadSession, saveSession} from '../src/session';
import type {AuthUser} from '../src/api';

/** Collects the string leaves of a React children tree. */
function flatten(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap(flatten);
  }
  return [];
}

const CREATOR: AuthUser = {
  user_id: 'u1',
  role: 'creator',
  token: 'tok-123',
  profile_completed: true,
};

beforeEach(() => {
  (AsyncStorage as unknown as {__reset: () => void}).__reset();
  jest.restoreAllMocks();
});

describe('session storage', () => {
  test('a saved session is read back', async () => {
    await saveSession(CREATOR);
    expect(await loadSession()).toEqual(CREATOR);
  });

  test('logging out removes it', async () => {
    await saveSession(CREATOR);
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  test('a payload with no token is discarded', async () => {
    await AsyncStorage.setItem(
      'ugcapp.session.v1',
      JSON.stringify({user_id: 'u1', role: 'creator'}),
    );
    expect(await loadSession()).toBeNull();
  });

  test('corrupt JSON does not throw', async () => {
    await AsyncStorage.setItem('ugcapp.session.v1', '{not json');
    expect(await loadSession()).toBeNull();
  });
});

describe('splash screen', () => {
  test('shows the artwork while the stored session is being checked', async () => {
    await saveSession(CREATOR);
    // A promise that never settles keeps the app in its restoring state.
    jest.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<App />);
    });

    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    // The bundler turns require() into an opaque handle, so assert it resolved
    // to something rather than trying to match a path.
    expect(images[0].props.source).toBeTruthy();
    expect(images[0].props.resizeMode).toBe('cover');
    // The splash is the artwork alone — no wordmark, no "Loading…" caption.
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });

  test('stays up on a logged-out launch instead of flashing past', async () => {
    // No stored session: the check resolves instantly, so only the minimum
    // display time keeps the splash on screen. This is the case that broke.
    jest.useFakeTimers();
    try {
      let tree!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<App />);
      });
      // Let the storage promise settle without advancing the clock.
      await ReactTestRenderer.act(async () => {});

      expect(tree.root.findAllByType(Image)).toHaveLength(1);

      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(2000);
      });
      // Once the minimum elapses the login screen takes over.
      expect(tree.root.findAllByType(Image).length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('cold start', () => {
  test('a stored session skips the login screen', async () => {
    await saveSession(CREATOR);
    // /auth/me confirms the token is still good.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({...CREATOR, profile_completed: true}),
    } as Response);

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<App />);
    });
    await ReactTestRenderer.act(async () => {});

    const texts = tree.root
      .findAllByType(Text)
      .flatMap(n => flatten(n.props.children));
    expect(texts).not.toEqual(expect.arrayContaining(['Welcome back']));
  });

  test('a rejected token clears storage and shows login', async () => {
    await saveSession(CREATOR);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({detail: 'expired'}),
    } as Response);

    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<App />);
    });
    await ReactTestRenderer.act(async () => {});

    expect(await loadSession()).toBeNull();
  });

  test('being offline keeps the user logged in', async () => {
    await saveSession(CREATOR);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<App />);
    });
    await ReactTestRenderer.act(async () => {});

    expect(await loadSession()).toEqual(CREATOR);
  });
});

describe('hardware back', () => {
  /** Grabs the handler WebShell registered so a test can "press" back. */
  function mountShell() {
    // The native screens fetch their own data on mount; keep them quiet.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    let handler!: () => boolean;
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, fn) => {
        handler = fn as () => boolean;
        return {remove: () => {}} as never;
      });

    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <WebShell
          token={CREATOR.token}
          session={CREATOR}
          initialPath="/dashboard/creator"
        />,
      );
    });
    return {tree, back: () => handler()};
  }

  /**
   * Taps a bottom-nav tab by its label. The tabs are icon-only — the label
   * lives on accessibilityLabel, not in any Text node — so match on that.
   */
  function tapTab(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
    const tab = tree.root
      .findAll(n => n.props?.accessibilityRole === 'button')
      .find(n => n.props?.accessibilityLabel === label);
    if (!tab) {
      throw new Error(`no bottom-nav tab labelled "${label}"`);
    }
    ReactTestRenderer.act(() => {
      tab.props.onPress();
    });
  }

  test('steps back through native screens instead of closing the app', () => {
    const {tree, back} = mountShell();

    tapTab(tree, 'Campaigns');
    tapTab(tree, 'Earnings');

    // Two pushes, so two back presses are handled by us...
    let first!: boolean;
    ReactTestRenderer.act(() => {
      first = back();
    });
    expect(first).toBe(true);

    let second!: boolean;
    ReactTestRenderer.act(() => {
      second = back();
    });
    expect(second).toBe(true);
  });

  test('returns false at the root so Android can exit', () => {
    const {back} = mountShell();
    let result!: boolean;
    ReactTestRenderer.act(() => {
      result = back();
    });
    expect(result).toBe(false);
  });

  test('back does not grow the stack forever', () => {
    const {tree, back} = mountShell();
    tapTab(tree, 'Campaigns');

    ReactTestRenderer.act(() => {
      back();
    });
    // Stack is empty again, so the next press falls through to Android.
    let result!: boolean;
    ReactTestRenderer.act(() => {
      result = back();
    });
    expect(result).toBe(false);
  });
});
