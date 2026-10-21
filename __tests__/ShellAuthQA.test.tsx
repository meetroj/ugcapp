/**
 * @format
 * QA pass over the auth / shell / shared UI package: role gates, the 401 hook,
 * the 44dp touch floor, Android Back on the auth forms.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthFlow from '../src/screens/AuthFlow';
import { normalizePath, roleGate } from '../src/screens/WebShell';
import { getNotifications, setUnauthorizedHandler } from '../src/api';

afterEach(() => {
  setUnauthorizedHandler(null);
  jest.restoreAllMocks();
});

describe('role gates', () => {
  test('neither creator nor brand can open the admin console', () => {
    expect(roleGate('/dashboard/admin', 'creator')).toBe('/dashboard/creator');
    expect(roleGate('/dashboard/admin/users?x=1', 'creator')).toBe('/dashboard/creator');
    expect(roleGate('/dashboard/admin/kyc', 'business')).toBe(
      '/dashboard/business/browse-creator',
    );
  });

  test('admin keeps every path, and the existing gates still hold', () => {
    expect(roleGate('/dashboard/admin/users', 'admin')).toBe('/dashboard/admin/users');
    expect(roleGate('/dashboard/business/wallet', 'creator')).toBe('/dashboard/creator');
    expect(roleGate('/browse-briefs', 'business')).toBe(
      '/dashboard/business/browse-creator',
    );
    expect(roleGate('/dashboard/creator', 'creator')).toBe('/dashboard/creator');
  });

  test('admin links are not rewritten onto native-only routes', () => {
    // The website has /chat/:userId and /campaign/:id; '/messages/<id>' and
    // '/campaigns/<id>' exist only inside the app, so an admin would hit a 404.
    expect(normalizePath('/chat/u9', 'admin')).toBe('/chat/u9');
    expect(normalizePath('/campaign/c1', 'admin')).toBe('/campaign/c1');
    expect(normalizePath('/chat/u9', 'support_staff')).toBe('/chat/u9');
    // Creators and brands still get the native screens.
    expect(normalizePath('/chat/u9', 'creator')).toBe('/messages/u9');
    expect(normalizePath('/campaign/c1', 'business')).toBe('/campaigns/c1');
    // Legacy admin links are still mapped like the website does.
    expect(normalizePath('/admin/match-queue', 'admin')).toBe(
      '/dashboard/admin/campaigns',
    );
  });
});

describe('401 on a signed-in call', () => {
  function respond(status: number, body: unknown) {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }));
  }

  test('asks the app to re-check the session, and still throws', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    respond(401, { detail: 'Token expired' });
    await expect(getNotifications('tok')).rejects.toMatchObject({
      message: 'Token expired',
      status: 401,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('other failures do not trigger it', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    respond(500, { detail: 'boom' });
    await expect(getNotifications('tok')).rejects.toMatchObject({ status: 500 });
    expect(handler).not.toHaveBeenCalled();
  });

  test('a 422 list detail is shown instead of "Request failed"', async () => {
    respond(422, { detail: [{ loc: ['body', 'phone'], msg: 'Field required' }] });
    await expect(getNotifications('tok')).rejects.toThrow('phone: Field required');
  });
});

describe('Android Back on the auth forms', () => {
  function textsOf(tree: ReactTestRenderer.ReactTestRenderer) {
    return tree.root
      .findAllByType('Text' as never)
      .map(n => n.children.filter(c => typeof c === 'string').join(''))
      .filter(Boolean);
  }

  test('Back from Sign up returns to Log in instead of closing the app', async () => {
    const handlers: Array<() => boolean> = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    }) as never);

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          }}>
          <AuthFlow onAuthenticated={() => {}} />
        </SafeAreaProvider>,
      );
    });

    // On Log in there is no handler: Back keeps its default (exit the app).
    expect(handlers).toHaveLength(0);

    const signUp = tree.root
      .findAll(
        n =>
          typeof n.type !== 'string' &&
          n.props.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function' &&
          n
            .findAllByType('Text' as never)
            .some(t => t.children.join('') === 'Sign Up'),
      )
      .at(0);
    await ReactTestRenderer.act(() => {
      signUp?.props.onPress();
    });
    expect(textsOf(tree)).toContain('Create account');
    expect(handlers).toHaveLength(1);

    let handled = false;
    await ReactTestRenderer.act(() => {
      handled = handlers[0]();
    });
    expect(handled).toBe(true);
    expect(textsOf(tree)).toContain('Welcome back');
    expect(handlers).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
