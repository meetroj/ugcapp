/**
 * @format
 * The Active Work filter is the only way to change the list, so it must be a
 * real, comfortably sized button — and opening it must push the list down
 * rather than float over it, which would hide the first card.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import ActiveWork from '../src/screens/ActiveWork';
import { scale } from '../src/theme';

const session: any = { user_id: '1', role: 'creator', profile_completed: true };

beforeEach(() => {
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  );
});

const render = async () => {
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(<ActiveWork token="t" session={session} />);
  });
  return t;
};

const filterButton = (t: any) =>
  t.root.findAll(
    (n: any) =>
      typeof n.props?.onPress === 'function' &&
      String(n.props?.accessibilityLabel || '').startsWith('Filter:'),
    { deep: true },
  )[0];

test('filter trigger meets the 44pt touch target', async () => {
  const t = await render();
  const flat = StyleSheet.flatten(filterButton(t).props.style);
  expect(flat.height).toBeGreaterThanOrEqual(44);
});

test('opening the filter pushes content down instead of overlapping', async () => {
  const t = await render();
  await ReactTestRenderer.act(async () => {
    filterButton(t).props.onPress();
  });

  // The menu must participate in normal layout. An absolutely positioned menu
  // would paint over the first work card instead of displacing it.
  const menu = t.root.findAll(
    (n: any) =>
      n.props?.style &&
      StyleSheet.flatten(n.props.style)?.borderColor === '#E5E6F0' &&
      StyleSheet.flatten(n.props.style)?.padding === scale(6),
    { deep: true },
  )[0];
  expect(menu).toBeTruthy();
  const flat = StyleSheet.flatten(menu.props.style);
  expect(flat.position).not.toBe('absolute');
});
