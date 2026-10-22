/** Profile: clips stored on our media bucket show their poster still, and the back/save buttons sit under the status bar. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, StyleSheet } from 'react-native';
import CreatorPublicProfile from '../src/screens/CreatorPublicProfile';
import { scale } from '../src/theme';

let tree: Renderer.ReactTestRenderer;
const clip = 'https://ugcad-media.s3.ap-south-1.amazonaws.com/uploads/arushi/car.mp4';

beforeEach(() => {
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    if (url.includes('/saved-creators')) return { ok: true, status: 200, json: async () => ({ creator_ids: [] }) };
    if (url.includes('/reviews/')) return { ok: true, status: 200, json: async () => [] };
    return { ok: true, status: 200, json: async () => ({ id: 'c1', full_name: 'Arushi', profile: { portfolio_items: [{ video_url: clip, category: 'Fashion', price: '1800' }] } }) };
  });
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });

const mount = async () => {
  await act(async () => {
    tree = Renderer.create(<CreatorPublicProfile token="t" creatorId="c1" onBack={() => {}} onMessage={() => {}} onSendBrief={() => {}} />);
  });
};

test('a clip on our bucket shows its poster still instead of "Tap to play video"', async () => {
  await mount();
  const uris = tree.root.findAllByType(Image).map(i => i.props.source?.uri);
  expect(uris).toContain('https://ugcad-media.s3.ap-south-1.amazonaws.com/previews/uploads/arushi/car.jpg');
});

test('back and save hug the top of the banner (the safe area is not counted twice)', async () => {
  await mount();
  const top = (label: string) =>
    StyleSheet.flatten(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.style).top;
  expect(top('Go back')).toBe(scale(10));
  expect(top('Save creator')).toBe(top('Go back') - scale(4));
});
