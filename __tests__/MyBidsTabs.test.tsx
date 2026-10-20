/**
 * My Bids like the website: every bid under All / Shortlisted / Accepted /
 * Rejected with counts, a detail sheet, Deal Room for a won bid, Message Brand.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import MyBids from '../src/screens/MyBids';
import { getCampaign, getMyBids } from '../src/api';

jest.mock('../src/api', () => ({ getMyBids: jest.fn(), getCampaign: jest.fn() }));

let tree: any;
const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const all = () => ([] as any[]).concat(tree.toJSON()).map(text).join('');
const touch = (label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => n.props.accessibilityLabel === label || text(n) === label);
const press = async (label: string) => {
  const node = touch(label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => { await node.props.onPress(); });
};

const row = (id: string, bid_status: string, extra: Record<string, any> = {}) => ({
  campaign: { id, title: `Brief ${id}`, brand_name: `@Brand ${id}`, business_id: `biz-${id}`, ...extra },
  my_bid: { id: `bid-${id}`, amount: 1000, estimated_delivery_days: 4, proposal: `Pitch ${id}` },
  bid_status,
  submitted_at: '2026-10-10T00:00:00Z',
});

const props = (extra: Record<string, any> = {}) => ({ token: 't', onBack: () => {}, ...extra });
async function mount(extra: Record<string, any> = {}) {
  await act(async () => { tree = Renderer.create(<MyBids {...props(extra)} />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getMyBids as jest.Mock).mockResolvedValue([row('1', 'pending'), row('2', 'approved'), row('3', 'rejected')]);
  (getCampaign as jest.Mock).mockResolvedValue({ id: '2', title: 'Brief 2', brief_text: 'Hook: big\nBudget visibility: hidden', objectives: ['Awareness'] });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

test('every bid is listed, with counts per tab, and a pending bid reads Pending', async () => {
  await mount();
  const t = all();
  expect(t).toContain('All (3)');
  expect(t).toContain('Shortlisted (0)');
  expect(t).toContain('Accepted (1)');
  expect(t).toContain('Rejected (1)');
  expect(t).toContain('Brief 1');
  expect(t).toContain('Brief 3');
  expect(t).toContain('Pending');
  // The brand shows by company name, never as an @handle.
  expect(t).toContain('Brand 1');
  expect(t).not.toContain('@Brand');
});

test('the status the server stores as bid_submitted also reads Pending', async () => {
  (getMyBids as jest.Mock).mockResolvedValue([{ ...row('1', ''), bid_status: undefined, my_bid: { amount: 5, status: 'bid_submitted' } }]);
  await mount();
  expect(all()).toContain('Pending');
  expect(all()).not.toContain('bid_submitted');
});

test('tabs filter the list', async () => {
  await mount();
  await press('Rejected (1)');
  expect(all()).toContain('Brief 3');
  expect(all()).not.toContain('Brief 1');
  await press('Accepted (1)');
  expect(all()).toContain('Brief 2');
  expect(all()).not.toContain('Brief 3');
});

test('an empty tab explains itself and offers Browse', async () => {
  const onNavigate = jest.fn();
  await mount({ onNavigate });
  await press('Shortlisted (0)');
  expect(all()).toContain('No bids in “Shortlisted”');
  await press('Browse Campaigns');
  expect(onNavigate).toHaveBeenCalledWith('/browse-briefs');
});

test('only a won bid has a Deal Room button, and it opens that deal', async () => {
  const onNavigate = jest.fn();
  await mount({ onNavigate });
  expect(tree.root.findAllByType(TouchableOpacity).filter((n: any) => n.props.accessibilityLabel === 'Deal Room')).toHaveLength(1);
  await press('Deal Room');
  expect(onNavigate).toHaveBeenCalledWith('/my-deals?campaign=2');
});

test('a bid opens a detail sheet with the brief, bid and proposal; the brand-only line is hidden', async () => {
  await mount();
  await act(async () => { touch('Brief 2, Approved')!.props.onPress(); });
  const t = all();
  expect(getCampaign).toHaveBeenCalledWith('t', '2');
  expect(t).toContain('Your Bid');
  expect(t).toContain('4 days');
  expect(t).toContain('Pitch 2');
  expect(t).toContain('Hook: big');
  expect(t).toContain('Awareness');
  expect(t).not.toContain('Budget visibility');
});

test('Message Brand opens the chat with the brand, or the inbox when it cannot', async () => {
  const onOpenThread = jest.fn();
  const onMessages = jest.fn();
  await mount({ onOpenThread, onMessages });
  await act(async () => { touch('Brief 2, Approved')!.props.onPress(); });
  await press('Message Brand');
  expect(onOpenThread).toHaveBeenCalledWith('biz-2', 'Brand 2');

  await act(async () => { tree.unmount(); });
  (getMyBids as jest.Mock).mockResolvedValue([row('9', 'pending', { business_id: undefined })]);
  await mount({ onOpenThread, onMessages });
  await act(async () => { touch('Brief 9, Pending')!.props.onPress(); });
  await press('Message Brand');
  expect(onMessages).toHaveBeenCalled();
});

test('a failed load says offline with Retry', async () => {
  (getMyBids as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NetworkError' }));
  await mount();
  expect(all()).toContain("You're offline. Check your connection and try again.");
  await press('Retry');
  expect(all()).toContain('All (3)');
});
