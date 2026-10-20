/**
 * @format
 * The conversation list and the notification bell: role-aware wording, names,
 * file snippets, offline / error states with Retry, and the badge refresh after
 * a notification is read.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandMessages from '../src/screens/BrandMessages';
import NotificationFeed from '../src/screens/NotificationFeed';
import {
  getConversations,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NetworkError,
} from '../src/api';

jest.mock('../src/api', () => {
  class NetworkError extends Error {
    constructor(message = "Can't reach the server.") {
      super(message);
      this.name = 'NetworkError';
    }
  }
  return {
    BACKEND_URL: 'http://api.test',
    NetworkError,
    getConversations: jest.fn(),
    getNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (markNotificationRead as jest.Mock).mockResolvedValue({});
  (markAllNotificationsRead as jest.Mock).mockResolvedValue({});
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const allText = (tree: any) => content(tree.toJSON());
const byText = (tree: any, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((n: any) => content(n) === label);
const byLabel = (tree: any, label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => n.props.accessibilityLabel === label);

async function messages(role: string) {
  let tree: any;
  await act(async () => {
    tree = Renderer.create(
      <BrandMessages token="t" role={role} onNavigate={() => {}} onOpenThread={() => {}} />,
    );
  });
  return tree;
}

describe('Messages list', () => {
  test('the empty text names the other side for each role', async () => {
    (getConversations as jest.Mock).mockResolvedValue([]);
    expect(allText(await messages('creator'))).toContain('Messages with brands appear here.');
    expect(allText(await messages('business'))).toContain('Messages with creators appear here.');
  });

  test('a brand sees creators by first name, a creator sees the business name', async () => {
    (getConversations as jest.Mock).mockResolvedValue([
      { user_id: 'u1', role: 'creator', full_name: 'Asha Verma', nickname: '@Tiger', unread_count: 0 },
      { user_id: 'u2', role: 'business', business_name: 'Levis', full_name: 'Raj Contact', unread_count: 0 },
    ]);
    const asBrand = allText(await messages('business'));
    expect(asBrand).toContain('Asha');
    expect(asBrand).not.toContain('Verma');
    const asCreator = allText(await messages('creator'));
    expect(asCreator).toContain('Levis');
  });

  test('a file-only last message reads "File attachment"', async () => {
    (getConversations as jest.Mock).mockResolvedValue([
      {
        user_id: 'u1',
        role: 'business',
        business_name: 'Levis',
        last_item_snippet: '__UGCAD_ATTACHMENT__:/uploads/brief.pdf',
        unread_count: 1,
      },
    ]);
    const text = allText(await messages('creator'));
    expect(text).toContain('File attachment');
    expect(text).not.toContain('__UGCAD_ATTACHMENT__');
  });

  test('a failed first load says so, offline is spelled out, and Retry recovers', async () => {
    (getConversations as jest.Mock).mockRejectedValueOnce(new NetworkError());
    const tree = await messages('creator');
    expect(allText(tree)).toContain("You're offline");
    expect(allText(tree)).not.toContain('No conversations');

    (getConversations as jest.Mock).mockResolvedValue([
      { user_id: 'u1', role: 'business', business_name: 'Levis', unread_count: 0 },
    ]);
    await act(async () => {
      byText(tree, 'Retry').props.onPress();
    });
    expect(allText(tree)).toContain('Levis');
  });

  test('a server error is not mistaken for being offline', async () => {
    (getConversations as jest.Mock).mockRejectedValueOnce(new Error('Request failed'));
    const tree = await messages('creator');
    expect(allText(tree)).toContain("Couldn't load your messages.");
  });
});

describe('Notification feed', () => {
  const note = {
    id: 'n1',
    title: 'You have been selected',
    message: 'Open the deal',
    read: false,
    link: '/creator-dashboard',
    type: 'success',
    created_at: new Date().toISOString(),
  };

  async function feed(props: Record<string, any> = {}) {
    let tree: any;
    await act(async () => {
      tree = Renderer.create(
        <NotificationFeed token="t" visible onClose={() => {}} {...props} />,
      );
    });
    return tree;
  }

  test('tapping a notification opens its link and refreshes the badge once it is read', async () => {
    (getNotifications as jest.Mock).mockResolvedValue([note]);
    const onNavigate = jest.fn();
    const onUnreadChange = jest.fn();
    const tree = await feed({ onNavigate, onUnreadChange });

    const row = tree.root
      .findAllByType(TouchableOpacity)
      .find((n: any) => content(n).includes('You have been selected'));
    await act(async () => {
      row.props.onPress();
    });
    expect(markNotificationRead).toHaveBeenCalledWith('t', 'n1');
    expect(onNavigate).toHaveBeenCalledWith('/creator-dashboard');
    expect(onUnreadChange).toHaveBeenCalledTimes(1);
  });

  test('Mark all read refreshes the badge', async () => {
    (getNotifications as jest.Mock).mockResolvedValue([note]);
    const onUnreadChange = jest.fn();
    const tree = await feed({ onUnreadChange });
    await act(async () => {
      byText(tree, 'Mark all read').props.onPress();
    });
    expect(markAllNotificationsRead).toHaveBeenCalledWith('t');
    expect(onUnreadChange).toHaveBeenCalledTimes(1);
  });

  test('a failed mark-read puts the server list back', async () => {
    (getNotifications as jest.Mock).mockResolvedValue([note]);
    (markNotificationRead as jest.Mock).mockRejectedValue(new Error('nope'));
    const tree = await feed({ onNavigate: () => {} });
    const row = tree.root
      .findAllByType(TouchableOpacity)
      .find((n: any) => content(n).includes('You have been selected'));
    const before = (getNotifications as jest.Mock).mock.calls.length;
    await act(async () => {
      row.props.onPress();
    });
    expect((getNotifications as jest.Mock).mock.calls.length).toBeGreaterThan(before);
  });

  test('offline and server errors read differently and both offer Retry', async () => {
    (getNotifications as jest.Mock).mockRejectedValueOnce(new NetworkError());
    const tree = await feed();
    expect(allText(tree)).toContain("You're offline");
    expect(byText(tree, 'Retry')).toBeTruthy();

    (getNotifications as jest.Mock).mockResolvedValue([note]);
    await act(async () => {
      byText(tree, 'Retry').props.onPress();
    });
    expect(allText(tree)).toContain('You have been selected');

    (getNotifications as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const second = await feed();
    expect(allText(second)).toContain("Couldn't load notifications.");
    expect(byLabel(second, 'Close notifications')).toBeTruthy();
  });
});
