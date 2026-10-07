import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import WebShell from '../src/screens/WebShell';
let tree: Renderer.ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
test('duplicate WebView navigation events need only one Back press', async () => {
  jest.useFakeTimers();
  let back: () => boolean = () => false;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    back = handler as () => boolean; return { remove: jest.fn() };
  });
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ version: 'one' }) }));
  const session: any = { role: 'creator', user_id: 'c1', token: 't', profile_completed: true };
  await act(async () => { tree = Renderer.create(<WebShell token="t" session={session} initialPath="/help-one" />); });
  const navigation = tree.root.findByType(WebView).props.onNavigationStateChange;
  act(() => {
    navigation({ url: 'http://localhost:3000/help-two', canGoBack: false });
    navigation({ url: 'http://localhost:3000/help-two', canGoBack: false });
  });
  let handled = false;
  act(() => { handled = back(); });
  expect(handled).toBe(true);
  expect(tree.root.findByType(WebView).props.source.uri).toContain('/help-one');
  act(() => { handled = back(); });
  expect(handled).toBe(false);
});
