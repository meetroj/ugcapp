/**
 * Messages list: a failed refresh must not silently show stale data. The list
 * stays on screen and says why it could not update, with a Retry that works.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandMessages from '../src/screens/BrandMessages';
import { getConversations, NetworkError } from '../src/api';

jest.mock('../src/api', () => {
  class NetworkError extends Error {
    constructor(message = "Can't reach the server.") {
      super(message);
      this.name = 'NetworkError';
    }
  }
  return { BACKEND_URL: 'http://api.test', NetworkError, getConversations: jest.fn() };
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

test('a failed refresh keeps the list and offers Retry', async () => {
  (getConversations as jest.Mock).mockResolvedValueOnce([
    { user_id: 'u1', role: 'creator', full_name: 'Asha Verma', unread_count: 2 },
  ]);
  let tree: any;
  await act(async () => {
    tree = Renderer.create(
      <BrandMessages token="t" role="business" onNavigate={() => {}} onOpenThread={() => {}} />,
    );
  });
  expect(content(tree.toJSON())).toContain('Asha');
  expect(content(tree.toJSON())).not.toContain('Showing your last loaded messages');

  // Pull to refresh while offline.
  (getConversations as jest.Mock).mockRejectedValueOnce(new NetworkError());
  const refresh = tree.root.findByType(require('react-native').RefreshControl);
  await act(async () => { refresh.props.onRefresh(); });
  const text = content(tree.toJSON());
  expect(text).toContain('Asha');
  expect(text).toContain("You're offline");
  expect(text).toContain('Showing your last loaded messages');

  // Retry succeeds: the notice goes away.
  (getConversations as jest.Mock).mockResolvedValueOnce([
    { user_id: 'u1', role: 'creator', full_name: 'Asha Verma', unread_count: 0 },
  ]);
  const retry = tree.root
    .findAllByType(TouchableOpacity)
    .find((node: any) => content(node) === 'Retry');
  await act(async () => { await retry.props.onPress(); });
  expect(content(tree.toJSON())).not.toContain('Showing your last loaded messages');
  await act(async () => { tree.unmount(); });
});
