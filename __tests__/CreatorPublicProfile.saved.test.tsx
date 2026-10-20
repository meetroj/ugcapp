/** Save button on a creator's public profile (brand shortlist, shared with the website). */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import CreatorPublicProfile from '../src/screens/CreatorPublicProfile';

let tree: Renderer.ReactTestRenderer;
let saved: string[];
let write: { ok: boolean; status: number; body: any } | 'offline';
let calls: { method: string; url: string }[];

beforeEach(() => {
  saved = [];
  write = { ok: true, status: 200, body: { saved: true } };
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    if (url.includes('/api/business/saved-creators')) {
      calls.push({ method, url });
      if (method === 'GET') return { ok: true, status: 200, json: async () => ({ creator_ids: saved }) };
      if (write === 'offline') throw new TypeError('Network request failed');
      return { ok: write.ok, status: write.status, json: async () => write === 'offline' ? {} : write.body };
    }
    if (url.includes('/reviews/')) return { ok: true, status: 200, json: async () => [] };
    return { ok: true, status: 200, json: async () => ({ id: 'c1', full_name: 'Deshna Kapoor', profile: {} }) };
  });
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });

const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const btn = () => tree.root.findAll(n => n.props.testID === 'profile-save' && typeof n.props.onPress === 'function')[0];
const mount = async () => {
  await act(async () => {
    tree = Renderer.create(<CreatorPublicProfile token="t" creatorId="c1" onBack={() => {}} onMessage={() => {}} onSendBrief={() => {}} />);
  });
};

test('shows Save for an unsaved creator and Remove for a saved one', async () => {
  await mount();
  expect(btn().props.accessibilityLabel).toBe('Save creator');
  act(() => tree.unmount());
  saved = ['c1'];
  await mount();
  expect(btn().props.accessibilityLabel).toBe('Remove from saved creators');
  expect(btn().props.accessibilityState.selected).toBe(true);
});

test('tap saves with POST /api/business/saved-creators/c1 and confirms', async () => {
  await mount();
  await act(async () => { btn().props.onPress(); });
  expect(calls.filter(c => c.method === 'POST')).toEqual([{ method: 'POST', url: expect.stringMatching(/saved-creators\/c1$/) }]);
  expect(btn().props.accessibilityLabel).toBe('Remove from saved creators');
  expect(textOf(tree.root)).toContain('Creator saved to your list');
});

test('tap on a saved creator removes with DELETE', async () => {
  saved = ['c1'];
  await mount();
  write = { ok: true, status: 200, body: { saved: false } };
  await act(async () => { btn().props.onPress(); });
  expect(calls.some(c => c.method === 'DELETE')).toBe(true);
  expect(btn().props.accessibilityLabel).toBe('Save creator');
  expect(textOf(tree.root)).toContain('Removed from saved');
});

test('failure rolls back and toasts the reason', async () => {
  await mount();
  write = { ok: false, status: 403, body: { detail: 'Only brands can save creators' } };
  await act(async () => { btn().props.onPress(); });
  expect(btn().props.accessibilityLabel).toBe('Save creator');
  expect(textOf(tree.root)).toContain('Only brands can save creators');
});

test('offline failure rolls back with the offline message', async () => {
  await mount();
  write = 'offline';
  await act(async () => { btn().props.onPress(); });
  expect(btn().props.accessibilityLabel).toBe('Save creator');
  expect(textOf(tree.root)).toContain("You're offline");
});
