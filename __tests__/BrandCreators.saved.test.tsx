/**
 * Saved creators on the Creators tab: bookmark on each card (POST/DELETE
 * /api/business/saved-creators/{id}), optimistic with rollback + toast, and the
 * "Saved" chip that filters the directory to the shortlist.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, FlatList } from 'react-native';
import BrandCreators from '../src/screens/BrandCreators';
import { getSavedCreators, saveCreator, unsaveCreator } from '../src/api';

let tree: Renderer.ReactTestRenderer;
const directory = [
  { id: 'a', name: 'Asha', primary_category: 'beauty' },
  { id: 'b', name: 'Bilal', primary_category: 'food' },
];
let savedOnServer: string[];
let writeResult: { ok: boolean; status: number; body: any } | 'offline';
let calls: { method: string; url: string }[];

beforeEach(() => {
  savedOnServer = ['b'];
  writeResult = { ok: true, status: 200, body: { saved: true } };
  calls = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  (globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    if (url.includes('/api/business/saved-creators')) {
      calls.push({ method, url });
      if (method === 'GET') return { ok: true, status: 200, json: async () => ({ creator_ids: savedOnServer }) };
      if (writeResult === 'offline') throw new TypeError('Network request failed');
      return { ok: writeResult.ok, status: writeResult.status, json: async () => writeResult === 'offline' ? {} : writeResult.body };
    }
    return { ok: true, status: 200, json: async () => directory.map(item => ({ ...item })) };
  });
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });

const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const byId = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const shown = () => tree.root.findAllByType(FlatList).flatMap(row => row.props.data.map((c: any) => c.name)).sort();
const mount = async () => {
  await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />); });
};

test('api helpers hit the saved-creators endpoints with the right method', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ creator_ids: [1, 'x'], saved: true }) }));
  expect(await getSavedCreators('t')).toEqual(['1', 'x']);
  expect(await saveCreator('t', 'a b')).toBe(true);
  const f = (globalThis as any).fetch;
  expect(f.mock.calls[1][0]).toMatch(/\/api\/business\/saved-creators\/a%20b$/);
  expect(f.mock.calls[1][1].method).toBe('POST');
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ saved: false }) }));
  expect(await unsaveCreator('t', 'a')).toBe(false);
  expect((globalThis as any).fetch.mock.calls[0][1].method).toBe('DELETE');
});

test('loads the saved ids: chip count and bookmark state come from the server', async () => {
  await mount();
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (1)');
  expect(byId('creator-save-b').props.accessibilityLabel).toBe('Remove Bilal from saved creators');
  expect(byId('creator-save-a').props.accessibilityLabel).toBe('Save Asha');
});

test('tapping the bookmark saves with POST and updates the chip', async () => {
  await mount();
  await act(async () => { byId('creator-save-a').props.onPress({ stopPropagation: () => {} }); });
  expect(calls.filter(c => c.method === 'POST').map(c => c.url)).toEqual([expect.stringMatching(/saved-creators\/a$/)]);
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (2)');
  expect(textOf(tree.root)).toContain('Creator saved to your list');
});

test('tapping a saved creator removes it with DELETE', async () => {
  await mount();
  writeResult = { ok: true, status: 200, body: { saved: false } };
  await act(async () => { byId('creator-save-b').props.onPress({ stopPropagation: () => {} }); });
  expect(calls.some(c => c.method === 'DELETE' && /saved-creators\/b$/.test(c.url))).toBe(true);
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (0)');
});

test('a failed save rolls back and shows the error', async () => {
  await mount();
  writeResult = { ok: false, status: 404, body: { detail: 'Creator not found' } };
  await act(async () => { byId('creator-save-a').props.onPress({ stopPropagation: () => {} }); });
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (1)');
  expect(byId('creator-save-a').props.accessibilityLabel).toBe('Save Asha');
  expect(textOf(tree.root)).toContain('Creator not found');
});

test('offline save rolls back with the offline message', async () => {
  await mount();
  writeResult = 'offline';
  await act(async () => { byId('creator-save-a').props.onPress({ stopPropagation: () => {} }); });
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (1)');
  expect(textOf(tree.root)).toContain("You're offline");
});

test('the Saved chip shows only saved creators and toggles back', async () => {
  await mount();
  expect(shown()).toEqual(['Asha', 'Bilal']);
  act(() => byId('creator-saved-chip').props.onPress());
  expect(shown()).toEqual(['Bilal']);
  act(() => byId('creator-saved-chip').props.onPress());
  expect(shown()).toEqual(['Asha', 'Bilal']);
});

test('Saved with nothing saved shows the empty state and hint', async () => {
  savedOnServer = [];
  await mount();
  act(() => byId('creator-saved-chip').props.onPress());
  expect(textOf(tree.root)).toContain('No saved creators yet');
  expect(textOf(tree.root)).toContain('Tap the bookmark');
});

test('if the saved list cannot load the chip says so and a tap retries', async () => {
  const realFetch = (globalThis as any).fetch;
  let fail = true;
  (globalThis as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (fail && url.includes('/saved-creators')) throw new TypeError('Network request failed');
    return realFetch(url, init);
  });
  await mount();
  expect(textOf(byId('creator-saved-chip'))).toContain('retry');
  fail = false;
  await act(async () => { byId('creator-saved-chip').props.onPress(); });
  expect(textOf(byId('creator-saved-chip'))).toContain('Saved (1)');
});
