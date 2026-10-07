import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandChatThread from '../src/screens/BrandChatThread';
import { getMessages, getConversations, sendActionCard } from '../src/api';

jest.mock('../src/api', () => ({
  getMessages: jest.fn(),
  getConversations: jest.fn(),
  sendActionCard: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getMessages as jest.Mock).mockResolvedValue([]);
  (getConversations as jest.Mock).mockResolvedValue([]);
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

async function checkNavigation(label: string) {
  const onNavigate = jest.fn();
  let tree: any;
  await act(async () => {
    tree = Renderer.create(<BrandChatThread token="t"
      session={{ user_id: 'brand', role: 'business' } as any}
      otherUserId="creator/id" onBack={() => {}} onNavigate={onNavigate} />);
  });
  const button = tree.root.findAllByType(TouchableOpacity)
    .find((node: any) => content(node) === label);
  expect(button).toBeTruthy();
  await act(async () => { button!.props.onPress(); });
  expect(onNavigate).toHaveBeenCalledWith(
    '/dashboard/business/post-brief?creator=creator%2Fid',
  );
  expect(sendActionCard).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
}

test('Private Invitation opens the creator-specific brief wizard', async () => {
  await checkNavigation('Private Invitation');
});

test('Send a Brief opens the same wizard', async () => {
  await checkNavigation('Send a Brief');
});

test.each(['card_status', 'status'])(
  'accepted invitation (%s) lets its brand post a brief', async statusKey => {
    (getMessages as jest.Mock).mockResolvedValue([{
      id: 'invite', item_type: 'action_card', type: 'private_invitation',
      sender_id: 'brand', [statusKey]: 'accepted', fields: {},
    }]);
    await checkNavigation('Post a Brief');
  },
);
