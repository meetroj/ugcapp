/**
 * @format
 * The chat thread behaves like the website's MessagesPage: counter offers carry
 * the original deal and close the original, revision requests send
 * revision_items, typing / read receipts show, phone numbers and emails are
 * blocked before sending, a strike limits the thread to action cards, files
 * follow the website limits, and reports carry a reason and details.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { Text as AppText, TextInput } from '../src/components/Text';
import { launchImageLibrary } from 'react-native-image-picker';
import BrandChatThread from '../src/screens/BrandChatThread';
import {
  getMessages,
  getConversations,
  sendActionCard,
  respondToActionCard,
  sendMessage,
  uploadMedia,
  reportUser,
  getChatWarnings,
  getChatTyping,
  sendChatTyping,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'http://api.test',
  getMessages: jest.fn(),
  getConversations: jest.fn(),
  sendActionCard: jest.fn(),
  respondToActionCard: jest.fn(),
  sendMessage: jest.fn(),
  uploadMedia: jest.fn(),
  reportUser: jest.fn(),
  getChatWarnings: jest.fn(),
  getChatTyping: jest.fn(),
  sendChatTyping: jest.fn(),
  postReview: jest.fn(),
}));

const brand: any = { user_id: 'brand-1', role: 'business' };
const creator: any = { user_id: 'cr-1', role: 'creator' };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getMessages as jest.Mock).mockResolvedValue([]);
  (getConversations as jest.Mock).mockResolvedValue([]);
  (getChatWarnings as jest.Mock).mockResolvedValue({});
  (getChatTyping as jest.Mock).mockResolvedValue(false);
  (sendChatTyping as jest.Mock).mockResolvedValue(undefined);
  (sendMessage as jest.Mock).mockResolvedValue({ filtered: false });
  (sendActionCard as jest.Mock).mockResolvedValue(undefined);
  (respondToActionCard as jest.Mock).mockResolvedValue({ ok: true });
  (reportUser as jest.Mock).mockResolvedValue({ message: 'Report submitted.' });
});

afterEach(() => {
  jest.useRealTimers();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

async function mount(session: any, props: Record<string, any> = {}) {
  const onNavigate = jest.fn();
  let tree: any;
  await act(async () => {
    tree = Renderer.create(
      <BrandChatThread
        token="t"
        session={session}
        otherUserId="other-1"
        onBack={() => {}}
        onNavigate={onNavigate}
        {...props}
      />,
    );
  });
  return { tree, onNavigate };
}

const buttons = (tree: any) => tree.root.findAllByType(TouchableOpacity);
const byText = (tree: any, label: string) =>
  buttons(tree).find((node: any) => content(node) === label);
const byLabel = (tree: any, label: string) =>
  buttons(tree).find((node: any) => node.props.accessibilityLabel === label);
const allText = (tree: any) => content(tree.toJSON());
const press = async (node: any) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node.props.onPress();
  });
};
const input = (tree: any, placeholder: string) =>
  tree.root
    .findAllByType(TextInput)
    .find((node: any) => node.props.placeholder === placeholder);
// The clip button opens a chooser; the picker itself opens after the sheet's fade (iOS wait).
const attach = async (tree: any, source: 'Photo or video' | 'PDF document') => {
  await press(byLabel(tree, 'Attach a file'));
  await press(byText(tree, source));
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  // Let the picker -> upload promise chain settle.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};
const type = async (node: any, value: string) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node.props.onChangeText(value);
  });
};

const offer = {
  id: 'card-1',
  item_type: 'action_card',
  type: 'custom_offer',
  sender_id: 'cr-1',
  status: 'open',
  deal_id: 'DEAL-77',
  available_actions: ['accept', 'reject', 'counter'],
  fields: { price: 8000, revisions: 2, timeline: '2026-11-05', usage_rights: 'Paid ads' },
  created_at: '2026-10-20T10:00:00Z',
};

test('countering sends the offer deal_id, a real date, and closes the original', async () => {
  (getMessages as jest.Mock).mockResolvedValue([offer]);
  const { tree } = await mount(brand, { title: 'Asha' });

  await press(byText(tree, 'Counter'));
  // The form opens pre-filled from the offer, with the date typed DD-MM-YYYY.
  expect(input(tree, 'DD-MM-YYYY').props.value).toBe('05-11-2026');
  await type(input(tree, 'Reason'), 'Budget is low for this scope');
  await press(byText(tree, 'Send Counter Offer'));

  expect(sendActionCard).toHaveBeenCalledTimes(1);
  const [, recipient, kind, fields, dealId] = (sendActionCard as jest.Mock).mock.calls[0];
  expect(recipient).toBe('other-1');
  expect(kind).toBe('counter_offer');
  expect(fields).toMatchObject({ modified_price: 8000, timeline: '2026-11-05', revisions: '2' });
  expect(dealId).toBe('DEAL-77');
  // ...and the offer we answered is marked countered.
  expect(respondToActionCard).toHaveBeenCalledWith('t', 'card-1', 'counter');
});

test('a counter without a delivery date is refused before sending', async () => {
  const { tree } = await mount(creator, { title: 'Levis' });
  await press(byLabel(tree, 'Send a Counter Offer'));
  await type(input(tree, 'Reason'), 'Too low');
  await press(byText(tree, 'Send Counter Offer'));
  expect(allText(tree)).toContain('Please fill in: Delivery date');
  expect(sendActionCard).not.toHaveBeenCalled();
});

test('a revision request is sent as revision_items', async () => {
  (getConversations as jest.Mock).mockResolvedValue([
    { user_id: 'other-1', associated_deal_status: 'Content Submitted - Awaiting Review' },
  ]);
  const { tree } = await mount(brand, { title: 'Asha' });
  await press(byLabel(tree, 'Send a Revision Request'));
  await type(input(tree, 'Revision item'), 'Please fix the audio');
  await press(byText(tree, 'Send Revision Request'));
  expect((sendActionCard as jest.Mock).mock.calls[0][3]).toEqual({
    revision_items: [{ description: 'Please fix the audio', severity: 'medium' }],
  });
});

test('shows the typing indicator and read receipts', async () => {
  (getChatTyping as jest.Mock).mockResolvedValue(true);
  (getMessages as jest.Mock).mockResolvedValue([
    { id: 'm1', sender_id: 'brand-1', message: 'Hi', status: 'read', created_at: '2026-10-20T10:00:00Z' },
    { id: 'm2', sender_id: 'brand-1', message: 'Again', status: 'delivered', read_by: ['brand-1'], created_at: '2026-10-20T10:01:00Z' },
    { id: 'm3', sender_id: 'other-1', message: 'Hello', created_at: '2026-10-20T10:02:00Z' },
  ]);
  const { tree } = await mount(brand, { title: 'Asha' });
  const text = allText(tree);
  expect(text).toContain('Asha is typing...');
  expect(text).toContain('Read');
  expect(text).toContain('Delivered');
});

test('typing is announced to the other side, at most every 2.5 seconds', async () => {
  const { tree } = await mount(brand, { title: 'Asha' });
  const box = input(tree, 'Type a message...');
  await type(box, 'h');
  await type(box, 'he');
  expect(sendChatTyping).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(2600);
  await type(box, 'hel');
  expect(sendChatTyping).toHaveBeenCalledTimes(2);
});

test('the open thread refreshes itself', async () => {
  await mount(brand, { title: 'Asha' });
  const before = (getMessages as jest.Mock).mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(4100);
  });
  expect((getMessages as jest.Mock).mock.calls.length).toBeGreaterThan(before);
  expect((getChatTyping as jest.Mock).mock.calls.length).toBeGreaterThan(1);
});

test('a phone number or email is blocked before the request', async () => {
  const { tree } = await mount(creator, { title: 'Levis' });
  await type(input(tree, 'Type a message...'), 'call me on 98765 43210');
  await press(byLabel(tree, 'Send message'));
  expect(sendMessage).not.toHaveBeenCalled();
  expect(allText(tree)).toContain("Phone numbers aren't allowed");

  await type(input(tree, 'Type a message...'), 'mail me at a.b@example.com');
  await press(byLabel(tree, 'Send message'));
  expect(sendMessage).not.toHaveBeenCalled();
  expect(allText(tree)).toContain("Email addresses aren't allowed");
});

test('a normal message is sent and a filtered reply shows the warning count', async () => {
  (sendMessage as jest.Mock).mockResolvedValue({ filtered: true, warning_count: 2 });
  const { tree } = await mount(creator, { title: 'Levis' });
  await type(input(tree, 'Type a message...'), 'Hello there');
  await press(byLabel(tree, 'Send message'));
  expect(sendMessage).toHaveBeenCalledWith('t', 'other-1', 'Hello there', []);
  expect(allText(tree)).toContain('Message filtered for policy violations. Warning 2/3');
});

test('a strike limits the thread to action cards', async () => {
  (getChatWarnings as jest.Mock).mockResolvedValue({
    action_cards_only_until: new Date(Date.now() + 3600_000).toISOString(),
  });
  const { tree } = await mount(creator, { title: 'Levis' });
  expect(allText(tree)).toContain('Free-form chat is temporarily disabled');
  const box = input(tree, 'Use an Action Card to continue this thread');
  expect(box.props.editable).toBe(false);
  expect(byLabel(tree, 'Send message')!.props.disabled).toBe(true);
  // Cards can still be sent.
  expect(byLabel(tree, 'Send a Custom Offer')).toBeTruthy();
});

test('files: up to five, a file-only message carries the packed text, bad files are refused', async () => {
  const MB = 1024 * 1024;
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [
      { uri: 'file:///a.jpg', fileName: 'a.jpg', type: 'image/jpeg', fileSize: 1 * MB },
      { uri: 'file:///b.pdf', fileName: 'b.pdf', type: 'application/pdf', fileSize: 2 * MB },
    ],
  });
  (uploadMedia as jest.Mock)
    .mockResolvedValueOnce('/uploads/a.jpg')
    .mockResolvedValueOnce('/uploads/b.pdf');
  const { tree } = await mount(creator, { title: 'Levis' });

  await attach(tree, 'Photo or video');
  expect(uploadMedia).toHaveBeenCalledTimes(2);
  expect((launchImageLibrary as jest.Mock).mock.calls[0][0].selectionLimit).toBe(5);
  await press(byLabel(tree, 'Send message'));
  expect(sendMessage).toHaveBeenCalledWith(
    't',
    'other-1',
    '__UGCAD_ATTACHMENT__:/uploads/a.jpg|/uploads/b.pdf',
    ['/uploads/a.jpg', '/uploads/b.pdf'],
  );

  // An 11 MB image is refused and nothing is uploaded.
  (uploadMedia as jest.Mock).mockClear();
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [{ uri: 'file:///big.jpg', fileName: 'big.jpg', type: 'image/jpeg', fileSize: 11 * MB }],
  });
  await attach(tree, 'Photo or video');
  expect(uploadMedia).not.toHaveBeenCalled();
  expect(allText(tree)).toContain('Images must be 10 MB or smaller.');
});

test('PDFs come from the Files picker, over 25 MB or a wrong type attaches nothing', async () => {
  const MB = 1024 * 1024;
  const {
    NativeDocumentPicker,
  } = require('../node_modules/@react-native-documents/picker/lib/module/spec/NativeDocumentPicker');
  const pdf = (over: Record<string, unknown> = {}) => ({
    uri: 'file:///cache/brief.pdf', name: 'brief.pdf', type: 'application/pdf', size: 2 * MB,
    error: null, isVirtual: false, hasRequestedType: true, ...over,
  });
  (uploadMedia as jest.Mock).mockResolvedValue('/uploads/brief.pdf');
  const { tree } = await mount(creator, { title: 'Levis' });

  NativeDocumentPicker.pick.mockResolvedValueOnce([pdf()]);
  await attach(tree, 'PDF document');
  expect(uploadMedia).toHaveBeenCalledWith('t', {
    uri: 'file:///cache/brief.pdf', fileName: 'brief.pdf', type: 'application/pdf', fileSize: 2 * MB,
  });
  await press(byLabel(tree, 'Send message'));
  expect(sendMessage).toHaveBeenCalledWith(
    't', 'other-1', '__UGCAD_ATTACHMENT__:/uploads/brief.pdf', ['/uploads/brief.pdf'],
  );

  (uploadMedia as jest.Mock).mockClear();
  NativeDocumentPicker.pick.mockResolvedValueOnce([pdf({ name: 'big.pdf', size: 26 * MB })]);
  await attach(tree, 'PDF document');
  expect(uploadMedia).not.toHaveBeenCalled();
  expect(allText(tree)).toContain('"big.pdf" is larger than 25 MB');

  NativeDocumentPicker.pick.mockResolvedValueOnce([pdf({ name: 'x.docx', type: 'application/msword' })]);
  await attach(tree, 'PDF document');
  expect(uploadMedia).not.toHaveBeenCalled();
  expect(allText(tree)).toContain('not a supported file');
});

test('a file-only message shows the file, not the packed text', async () => {
  (getMessages as jest.Mock).mockResolvedValue([
    { id: 'f1', sender_id: 'other-1', message: '__UGCAD_ATTACHMENT__:/uploads/brief.pdf', created_at: '2026-10-20T10:00:00Z' },
  ]);
  const { tree } = await mount(creator, { title: 'Levis' });
  const text = allText(tree);
  expect(text).toContain('brief.pdf');
  expect(text).not.toContain('__UGCAD_ATTACHMENT__');
});

test('after accepting an invitation the creator can ask for the brief', async () => {
  (getMessages as jest.Mock).mockResolvedValue([
    { id: 'inv', item_type: 'action_card', type: 'private_invitation', sender_id: 'other-1', status: 'accepted', fields: {}, created_at: '2026-10-20T10:00:00Z' },
  ]);
  const { tree } = await mount(creator, { title: 'Levis' });
  await press(byText(tree, 'Need brief'));
  expect(sendMessage).toHaveBeenCalledWith(
    't',
    'other-1',
    "I've accepted the invitation - please share the full brief so I can get started.",
    [],
  );
});

test('Open the deal takes a creator to the deal room', async () => {
  (getMessages as jest.Mock).mockResolvedValue([{ ...offer, sender_id: 'brand-9', available_actions: [] }]);
  const { tree, onNavigate } = await mount(creator, { title: 'Levis' });
  await press(byText(tree, 'Open the deal'));
  expect(onNavigate).toHaveBeenCalledWith('/my-deals/DEAL-77');
});

test('reporting needs a reason and sends the details and the deal', async () => {
  (getConversations as jest.Mock).mockResolvedValue([
    { user_id: 'other-1', role: 'creator', associated_campaign_id: 'camp-5' },
  ]);
  const { tree } = await mount(brand, { title: 'Asha' });
  await press(byLabel(tree, 'More actions'));
  await press(byText(tree, 'Report user'));

  // No reason chosen: the submit button does nothing.
  expect(byLabel(tree, 'Submit report')!.props.disabled).toBe(true);
  await press(byText(tree, 'Harassment or abuse'));
  await type(input(tree, 'Add any context that will help our team...'), 'Kept pushing me off-platform');
  await press(byLabel(tree, 'Submit report'));
  expect(reportUser).toHaveBeenCalledWith('t', {
    reported_user_id: 'other-1',
    deal_id: 'camp-5',
    reason: 'harassment',
    details: 'Kept pushing me off-platform',
  });
  expect(allText(tree)).toContain('Report submitted.');
});

test('report details with a phone number are refused', async () => {
  const { tree } = await mount(brand, { title: 'Asha' });
  await press(byLabel(tree, 'More actions'));
  await press(byText(tree, 'Report user'));
  await press(byText(tree, 'Spam or scam'));
  await type(input(tree, 'Add any context that will help our team...'), 'call 9876543210');
  await press(byLabel(tree, 'Submit report'));
  expect(reportUser).not.toHaveBeenCalled();
  expect(allText(tree)).toContain("Don't include phone numbers or emails in a report.");
});

test('a creator can review the brand once the deal is completed', async () => {
  (getConversations as jest.Mock).mockResolvedValue([
    { user_id: 'other-1', role: 'business', associated_deal_status: 'completed', associated_campaign_id: 'camp-5' },
  ]);
  const { tree } = await mount(creator, { title: 'Levis' });
  await press(byLabel(tree, 'More actions'));
  expect(byText(tree, 'Review this brand')).toBeTruthy();
  expect(byText(tree, 'View profile')).toBeUndefined();
});

test('a brand can open the creator profile from the menu', async () => {
  const { tree, onNavigate } = await mount(brand, { title: 'Asha' });
  await press(byLabel(tree, 'More actions'));
  expect(byText(tree, 'Review this brand')).toBeUndefined();
  await press(byText(tree, 'View profile'));
  expect(onNavigate).toHaveBeenCalledWith('/creator/other-1');
});

test('a deep link with no name takes the name from the conversation list', async () => {
  (getConversations as jest.Mock).mockResolvedValue([
    { user_id: 'other-1', role: 'creator', full_name: 'Asha Verma', nickname: '@Tiger' },
  ]);
  const { tree } = await mount(brand);
  const names = tree.root.findAllByType(AppText).map((node: any) => content(node));
  // A brand sees a creator by first name only.
  expect(names).toContain('Asha');
  expect(names).not.toContain('Asha Verma');
});

test('a failed first load says so and offers Retry', async () => {
  (getMessages as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NetworkError' }));
  const { tree } = await mount(creator, { title: 'Levis' });
  expect(allText(tree)).toContain("You're offline");
  (getMessages as jest.Mock).mockResolvedValue([
    { id: 'm1', sender_id: 'other-1', message: 'Back online', created_at: '2026-10-20T10:00:00Z' },
  ]);
  await press(byText(tree, 'Retry'));
  expect(allText(tree)).toContain('Back online');
});
