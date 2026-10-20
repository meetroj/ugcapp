import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import AppProfileMenu from '../src/screens/AppProfileMenu';

let tree: Renderer.ReactTestRenderer;
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

const render = (role: 'business' | 'creator', onNavigate = jest.fn()) => {
  act(() => {
    tree = Renderer.create(
      <AppProfileMenu session={{ user_id: 'u', role, token: 't', nickname: 'Acme' } as never} onNavigate={onNavigate} />,
    );
  });
  return onNavigate;
};
const row = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

test('a brand gets Saved Creators, Sent Briefs and Brand Home, which open the website pages in the app', () => {
  const onNavigate = render('business');
  act(() => row('Saved Creators').props.onPress());
  expect(onNavigate).toHaveBeenLastCalledWith('/dashboard/business/saved-creators');
  act(() => row('Sent Briefs').props.onPress());
  expect(onNavigate).toHaveBeenLastCalledWith('/dashboard/business/sent-briefs');
  act(() => row('Brand Home').props.onPress());
  expect(onNavigate).toHaveBeenLastCalledWith('/brand-home');
});

test('Need help? opens the support sheet instead of navigating', () => {
  const onNavigate = render('business');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  act(() => row('Need help?').props.onPress());
  expect(onNavigate).not.toHaveBeenCalled();
  const email = tree.root.findAll(n => String(n.props.accessibilityLabel || '').startsWith('Email:') && typeof n.props.onPress === 'function')[0];
  act(() => {
    email.props.onPress();
  });
  expect(open).toHaveBeenCalledWith('mailto:support@ugcad.io');
});

test('the brand-only entries are not shown to creators', () => {
  render('creator');
  expect(row('Saved Creators')).toBeUndefined();
  expect(row('Sent Briefs')).toBeUndefined();
  expect(row('Brand Home')).toBeUndefined();
});
