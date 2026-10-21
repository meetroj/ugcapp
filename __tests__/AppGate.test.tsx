/**
 * @format
 * App-level approval gate: "Check Status" must not claim "still under review"
 * when the server was never reached, a foreground re-check lifts the gate by
 * itself once the admin approves, and the 401 hook is wired while signed in.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import App from '../App';
import * as api from '../src/api';
import * as sessionStore from '../src/session';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  verifySession: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
}));
jest.mock('../src/session', () => ({
  loadSession: jest.fn(),
  saveSession: jest.fn(async () => undefined),
  clearSession: jest.fn(async () => undefined),
}));
jest.mock('../src/screens/WebShell', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>WEBSHELL_OPEN</Text> };
});

const mocked = api as jest.Mocked<typeof api>;
const store = sessionStore as jest.Mocked<typeof sessionStore>;

const PENDING: any = {
  user_id: 'u1',
  id: 'u1',
  role: 'creator',
  token: 'tok',
  email: 'c@example.com',
  profile_completed: true,
  approval_status: 'pending',
  agreement_accepted: true,
};

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType('Text' as never)
    .map(n => n.children.filter(c => typeof c === 'string').join(''))
    .filter(Boolean);
}

async function boot() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Past the splash floor.
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  return tree;
}

beforeEach(() => {
  jest.useFakeTimers();
  store.loadSession.mockResolvedValue({ ...PENDING });
  mocked.verifySession.mockImplementation(async s => s);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('offline Check Status says it could not check, then lifts once approved', async () => {
  const tree = await boot();
  expect(textsOf(tree)).toContain('Profile Under Review');
  // The 401 hook is registered for the signed-in session.
  expect(mocked.setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function));

  const press = async () => {
    const button = tree.root
      .findAll(
        n =>
          typeof n.type !== 'string' &&
          typeof n.props.onPress === 'function' &&
          n.findAllByType('Text' as never).some(t => t.children.join('') === 'Check Status'),
      )
      .at(0)!;
    await act(async () => {
      await button.props.onPress();
    });
  };

  // verifySession returns the same object when the request never got through.
  await press();
  expect(textsOf(tree).join(' ')).toMatch(/Couldn't check right now/);
  expect(textsOf(tree).join(' ')).not.toMatch(/Still under review/);

  // Reachable and still pending: the honest "still under review" notice.
  mocked.verifySession.mockImplementation(async s => ({ ...s }));
  await press();
  expect(textsOf(tree).join(' ')).toMatch(/Still under review/);

  mocked.verifySession.mockImplementation(async s => ({
    ...s,
    approval_status: 'approved',
  }));
  await press();
  expect(textsOf(tree)).toContain('WEBSHELL_OPEN');
  act(() => tree.unmount());
});

test('coming back to the foreground lifts the gate without tapping anything', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: (state: string) => void,
  ) => {
    onChange = handler;
    return { remove: () => {} };
  }) as never);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });

  const tree = await boot();
  expect(textsOf(tree)).toContain('Profile Under Review');

  mocked.verifySession.mockImplementation(async s => ({
    ...s,
    approval_status: 'approved',
  }));
  await act(async () => {
    onChange('active');
  });
  expect(textsOf(tree)).toContain('WEBSHELL_OPEN');
  expect(store.saveSession).toHaveBeenCalledWith(
    expect.objectContaining({ approval_status: 'approved' }),
  );
  act(() => tree.unmount());
});

test('a rejected token on re-check signs the user out', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: (state: string) => void,
  ) => {
    onChange = handler;
    return { remove: () => {} };
  }) as never);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });

  const tree = await boot();
  mocked.verifySession.mockResolvedValue(null);
  await act(async () => {
    onChange('active');
  });
  expect(store.clearSession).toHaveBeenCalled();
  expect(textsOf(tree)).toContain('Welcome back');
  act(() => tree.unmount());
});
