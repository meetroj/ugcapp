import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, TouchableOpacity } from 'react-native';
import MyBids, { isOpenBid } from '../src/screens/MyBids';
import BrandCampaignDetail from '../src/screens/BrandCampaignDetail';
import { getMyBids, getCampaign, getCampaignWork } from '../src/api';

jest.mock('../src/api', () => ({
  getMyBids: jest.fn(), getCampaign: jest.fn(), getBusinessDeals: jest.fn().mockResolvedValue([]), getCampaignWork: jest.fn(),
}));

let tree: any;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers(); jest.restoreAllMocks();
});
const bid = (status = 'pending', campaign: any = {}) => ({
  bid_status: status, campaign: { id: 'c1', status: 'active', ...campaign },
  my_bid: { creator_id: 'me', amount: 2000 },
});

test.each(['approved', 'accepted', 'selected', 'rejected', 'declined'])(
  '%s bids no longer appear as pending', status => expect(isOpenBid(bid(status))).toBe(false),
);
test.each(['in_progress', 'completed', 'cancelled', 'under_review'])(
  'bids on %s campaigns are hidden', status => expect(isOpenBid(bid('pending', { status }))).toBe(false),
);
test('another hire leaves pending bids visible while multi-creator slots remain', () => {
  expect(isOpenBid(bid('pending', { selected_creators: ['other'], creators_wanted: 4 }))).toBe(true);
  expect(isOpenBid(bid('pending', { selected_creators: ['other'], creators_wanted: 1 }))).toBe(false);
  expect(isOpenBid(bid('pending', { selected_creators: ['other', 'me'], creators_wanted: 4 }))).toBe(false);
});
const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

test('resolved bid disappears when creator returns to the app', async () => {
  let listener: any;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler; return { remove: jest.fn() };
  });
  (getMyBids as jest.Mock).mockResolvedValue([bid('pending', { title: 'Launch' })]);
  await act(async () => {
    tree = Renderer.create(<MyBids token="t" onBack={() => {}} />);
  });
  expect(content(tree.toJSON())).toContain('Launch');
  (getMyBids as jest.Mock).mockResolvedValue([bid('approved', { title: 'Launch' })]);
  await act(async () => { listener('active'); });
  expect(content(tree.toJSON())).not.toContain('Launch');
  expect(content(tree.toJSON())).toContain('No pending bids');
});

test('brand can view a bidding creator profile before hiring', async () => {
  const onNavigate = jest.fn();
  (getCampaign as jest.Mock).mockResolvedValue({ id: 'c1', title: 'Launch', status: 'active',
    bids: [{ creator_id: 'creator-7', creator_name: 'Arushi', amount: 2000 }] });
  (getCampaignWork as jest.Mock).mockResolvedValue([]);
  await act(async () => {
    tree = Renderer.create(<BrandCampaignDetail token="t" campaignId="c1"
      onBack={() => {}} onNavigate={onNavigate} />);
  });
  const button = tree.root.findAllByType(TouchableOpacity).find((node: any) =>
    node.props.accessibilityLabel === "View Arushi's profile");
  expect(button).toBeTruthy();
  await act(async () => { button!.props.onPress(); });
  expect(onNavigate).toHaveBeenCalledWith('/creator/creator-7');
});
