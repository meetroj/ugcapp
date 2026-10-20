/**
 * Saved briefs: the ids resolve to real campaigns (list first, then by id like
 * the website), closed briefs stay visible but cannot be bid on, a card opens
 * the brief, and the brief carries on to the bid. Un-saving tells the user.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import SavedBriefs from '../src/screens/SavedBriefs';
import {
  getBidReadiness,
  getCampaign,
  getCampaigns,
  getMe,
  getMyBids,
  getSavedBriefs,
  placeBid,
  removeSavedBrief,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  getCampaigns: jest.fn(),
  getCampaign: jest.fn(),
  getMe: jest.fn(),
  placeBid: jest.fn(),
  getMyBids: jest.fn(),
  getBidReadiness: jest.fn(),
  getSavedBriefs: jest.fn(),
  addSavedBrief: jest.fn().mockResolvedValue(true),
  removeSavedBrief: jest.fn(),
}));

const session: any = { user_id: 'creator', role: 'creator', token: 't' };
let tree: any;
const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const all = () => ([] as any[]).concat(tree.toJSON()).map(text).join('');
const touch = (label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => text(n) === label || n.props.accessibilityLabel === label);
const press = async (label: string) => {
  const node = touch(label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => { await node.props.onPress({ stopPropagation: () => {} }); });
};
const cards = () =>
  tree.root
    .findAllByType(TouchableOpacity)
    .filter((n: any) => n.props.activeOpacity === 0.85)
    .map((n: any) => n.props.accessibilityLabel);

const open = { id: 'c1', status: 'active', title: 'Serum', brand_name: 'Glow', budget_max: 1500 };
const closed = { id: 'c2', status: 'completed', title: 'Old shoot', brand_name: 'Kicks', budget_max: 900 };

async function mount(props: Record<string, any> = {}) {
  await act(async () => {
    tree = Renderer.create(
      <SavedBriefs token="token" session={session} onBack={() => {}} onBrowse={() => {}} {...props} />,
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getSavedBriefs as jest.Mock).mockResolvedValue(['c1', 'c2', 'gone']);
  (getCampaigns as jest.Mock).mockResolvedValue([open]);
  (getCampaign as jest.Mock).mockImplementation(async (_t: string, id: string) => {
    if (id === 'c2') return closed;
    throw new Error('Campaign not found');
  });
  (getMyBids as jest.Mock).mockResolvedValue([]);
  (getBidReadiness as jest.Mock).mockResolvedValue({ can_bid: true, missing: [], commission_percent: 20 });
  (getMe as jest.Mock).mockResolvedValue({ profile_completed: true, kyc: { status: 'verified' } });
  (placeBid as jest.Mock).mockResolvedValue({});
  (removeSavedBrief as jest.Mock).mockResolvedValue(false);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

test('ids resolve to cards: list first, then by id; a removed brief is dropped, a closed one is marked', async () => {
  await mount();
  expect(cards()).toEqual(['Glow: Serum', 'Kicks: Old shoot']);
  expect(getCampaign).toHaveBeenCalledWith('token', 'c2');
  expect(getCampaign).not.toHaveBeenCalledWith('token', 'c1');
  expect(all()).toContain('Closed: no longer open for bids');
});

test('the budget shows even when the brief only has budget_max', async () => {
  await mount();
  expect(all()).toContain('₹1,500');
});

test('a card opens the full brief and the bid goes through from there', async () => {
  await mount();
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Glow: Serum').props.onPress(); });
  expect(all()).toContain('Campaign Details');
  await press('Submit Your Bid');
  await press('Continue to bid');
  const set = async (placeholder: string, value: string) =>
    act(async () => {
      tree.root.findAll((n: any) => n.props.placeholder === placeholder && n.props.onChangeText)[0].props.onChangeText(value);
    });
  await set('Enter your bid amount', '1200');
  await set('How many days to complete?', '3');
  await set("Describe your approach, experience, and why you're the right fit...", 'Hello');
  await press('Submit Bid');
  expect(placeBid).toHaveBeenCalledWith('token', 'c1', expect.objectContaining({ amount: 1200 }));
  expect(all()).toContain('Bid submitted successfully!');
  expect(all()).toContain('Saved');
});

test('a closed brief opens for reading but offers no bid', async () => {
  await mount();
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Kicks: Old shoot').props.onPress(); });
  expect(all()).toContain('This campaign is no longer open for bids.');
  expect(touch('Submit Your Bid')).toBeUndefined();
});

test('un-saving removes the row, calls the server and says so', async () => {
  await mount();
  const remove = tree.root.findAllByType(TouchableOpacity).filter((n: any) => n.props.accessibilityLabel === 'Remove from saved');
  await act(async () => { remove[0].props.onPress({ stopPropagation: () => {} }); });
  expect(removeSavedBrief).toHaveBeenCalledWith('token', 'c1');
  expect(cards()).toEqual(['Kicks: Old shoot']);
  expect(all()).toContain('Removed from saved');
});

test('a failed un-save puts the row back', async () => {
  (removeSavedBrief as jest.Mock).mockRejectedValue(new Error('offline'));
  await mount();
  const remove = tree.root.findAllByType(TouchableOpacity).filter((n: any) => n.props.accessibilityLabel === 'Remove from saved');
  await act(async () => { remove[0].props.onPress({ stopPropagation: () => {} }); });
  expect(cards()).toEqual(['Glow: Serum', 'Kicks: Old shoot']);
  expect(all()).toContain("Couldn't update saved briefs");
});

test('nothing saved points to Browse', async () => {
  (getSavedBriefs as jest.Mock).mockResolvedValue([]);
  const onBrowse = jest.fn();
  await mount({ onBrowse });
  expect(all()).toContain('Nothing saved yet');
  await press('Browse Campaigns');
  expect(onBrowse).toHaveBeenCalled();
});

test('a failed load says why and Retry loads again', async () => {
  (getSavedBriefs as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NetworkError' }));
  await mount();
  expect(all()).toContain("You're offline. Check your connection and try again.");
  await press('Retry');
  expect(cards()).toHaveLength(2);
});
