/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AuthFlow from '../src/screens/AuthFlow';
import { radius, scale } from '../src/theme';

/**
 * AuthFlow calls the real API on submit. Without a mock the request escapes to
 * the network, fails, and the screen shows an alert instead of authenticating —
 * so stub the two calls the form makes.
 */
jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  login: jest.fn(async () => ({
    user_id: 'u1',
    role: 'creator',
    token: 't',
    profile_completed: true,
  })),
  signUp: jest.fn(async () => ({
    user_id: 'u1',
    role: 'creator',
    token: 't',
    profile_completed: false,
  })),
}));

/**
 * AuthLayout reads safe-area insets, so the subject needs the same provider the
 * real app supplies. initialMetrics skips the native measurement round-trip.
 */
function renderAuthFlow(onAuthenticated: () => void) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 47, left: 0, right: 0, bottom: 34},
      }}>
      <AuthFlow onAuthenticated={onAuthenticated} />
    </SafeAreaProvider>
  );
}

/** Collects the text of every rendered Text node. */
function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType('Text' as never)
    .map(n => n.children.filter(c => typeof c === 'string').join(''))
    .filter(Boolean);
}

/** Finds a touchable whose rendered Text descendants include `label`. */
function pressableWithText(
  tree: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  return tree.root
    .findAll(
      n =>
        typeof n.type !== 'string' &&
        n.props.accessibilityRole === 'button' &&
        // Walk the subtree instead of stringifying props: children hold React
        // elements, which are circular and blow up JSON.stringify.
        typeof n.props.onPress === 'function' &&
        n
          .findAllByType('Text' as never)
          .some(t =>
            t.children.filter(c => typeof c === 'string').join('') === label,
          ),
    )
    // TouchableOpacity renders a wrapper chain; the outermost match is the
    // component that owns the handler we passed in.
    .at(0);
}

test('starts on log in and switches to sign up', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(renderAuthFlow(() => {}));
  });

  // AuthFlow opens on login (mode defaults to 'login'), so returning users
  // land straight on the form they need.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['Welcome back']));
  // The role chips belong to sign-up only.
  expect(textsOf(tree)).not.toEqual(expect.arrayContaining(['Creator']));

  await ReactTestRenderer.act(() => {
    pressableWithText(tree, 'Sign Up')?.props.onPress();
  });

  const after = textsOf(tree);
  expect(after).toEqual(expect.arrayContaining(['Create account']));
  expect(after).toEqual(expect.arrayContaining(['Creator', 'Brand']));
});

test('submitting the log in form authenticates', async () => {
  const onAuthenticated = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(renderAuthFlow(onAuthenticated));
  });

  await ReactTestRenderer.act(() => {
    pressableWithText(tree, 'Sign In')?.props.onPress();
  });

  // The form ignores the button until both fields have a value, so fill them
  // in the same order the user would.
  const inputs = tree.root.findAllByType('TextInput' as never);
  await ReactTestRenderer.act(() => {
    inputs[0].props.onChangeText('creator@example.com');
    inputs[1].props.onChangeText('secret123');
  });

  await ReactTestRenderer.act(() => {
    pressableWithText(tree, 'Log In')?.props.onPress();
  });

  expect(onAuthenticated).toHaveBeenCalled();
});

test('keeps the card clear of the bottom safe area', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(renderAuthFlow(() => {}));
  });

  // The gap must sit on the CARD. Padding on the scroll content lives outside
  // the card and leaves its bottom edge — and the "Sign In" row inside it —
  // flush against the system nav bar.
  // The card's style is an array: the base object, then the inset override.
  // Both the radius and the gap scale with the screen, so the card is located
  // by its scaled radius and the gap compared against the scaled minimum — the
  // raw 28/48 only hold on the 390pt reference phone. The captured number is
  // matched as a decimal too: scaling lands on the device pixel grid, which is
  // a half-point on @2x screens.
  const json = JSON.stringify(tree.toJSON());
  const at = json.indexOf(`"borderRadius":${radius.card}`);
  expect(at).toBeGreaterThan(-1);
  const after = json.slice(at, at + 400);
  const found = after.match(/"marginBottom":(\d+(?:\.\d+)?)/);

  expect(found).not.toBeNull();
  const gap = Number(found![1]);
  expect(gap).toBeGreaterThanOrEqual(scale(48));
});
