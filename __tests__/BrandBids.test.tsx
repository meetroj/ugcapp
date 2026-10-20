import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandBids from '../src/screens/BrandBids';
import ChoiceSheet from '../src/components/ChoiceSheet';
import { Alert } from '../src/components/AppAlert';
import { declineBid, getCampaigns, selectCreator } from '../src/api';

jest.mock('../src/api', () => ({
  getCampaigns: jest.fn(),
  selectCreator: jest.fn(),
  declineBid: jest.fn(),
  finishHiring: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const button = (label: string) =>
  tree.root.findAllByType(TouchableOpacity).find(
    (node: any) => node.props.accessibilityLabel === label || content(node) === label,
  );

// A 3-creator brief: Meera is hired (the roster says so, bid.status stays 'pending'),
// Arushi is open with a pitch, Dev is open without one, Kabir was declined.
const campaign = {
  id: 'c1', title: 'Launch', status: 'active', creators_wanted: 3,
  selected_creators: ['meera'],
  bids: [
    { creator_id: 'meera', creator_name: 'Meera', amount: 4000, estimated_delivery_days: 6, status: 'pending', proposal: 'Hi' },
    { creator_id: 'arushi', creator_name: 'Arushi', amount: 3000, estimated_delivery_days: 5, proposal: 'I can shoot this in a day' },
    { creator_id: 'dev', creator_name: 'Dev', amount: 1500, estimated_delivery_days: 2 },
    { creator_id: 'kabir', creator_name: 'Kabir', amount: 2000, status: 'declined' },
  ],
};

async function render(list: any[] = [campaign], onNavigate: (p: string) => void = () => {}) {
  (getCampaigns as jest.Mock).mockResolvedValue(list);
  await act(async () => {
    tree = Renderer.create(<BrandBids token="t" onBack={() => {}} onNavigate={onNavigate} />);
  });
}

test('hired creators are found from the roster, so the Accepted tab is not empty and Accept is gone', async () => {
  await render();
  const text = content(tree.toJSON());
  expect(text).toContain('All Bids (2)');
  expect(text).toContain('Responded (1)');
  expect(text).toContain('Accepted (1)');
  expect(text).toContain('Declined (1)');
  // Meera is hired: not offered under All, and shows the Accepted pill under Accepted
  expect(button('Accept bid from Meera')).toBeUndefined();
  expect(button('Accept bid from Arushi')).toBeTruthy();
  await act(async () => { button('Accepted (1)').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Meera');
  expect(content(tree.toJSON())).toContain('Accepted');
  expect(button('Accept bid from Meera')).toBeUndefined();
});

test('delivery days come from estimated_delivery_days', async () => {
  await render();
  expect(content(tree.toJSON())).toContain('5 Days');
  expect(content(tree.toJSON())).toContain('2 Days');
});

test('closed or fully staffed briefs are not listed', async () => {
  await render([{ ...campaign, creators_wanted: 1 }, { ...campaign, id: 'c2', status: 'in_progress' }]);
  expect(content(tree.toJSON())).toContain('No applications');
});

test('shortlist star feeds the Shortlisted tab', async () => {
  await render();
  expect(content(tree.toJSON())).toContain('Shortlisted (0)');
  await act(async () => { button('Shortlist Dev').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Shortlisted (1)');
  await act(async () => { button('Shortlisted (1)').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Dev');
  expect(content(tree.toJSON())).not.toContain('Arushi');
  expect(button('Remove Dev from shortlist')).toBeTruthy();
});

test('sort by price puts the cheapest bid first', async () => {
  await render();
  await act(async () => { button('Sort bids').props.onPress(); });
  const sheet = tree.root.findByType(ChoiceSheet);
  expect(sheet.props.visible).toBe(true);
  await act(async () => { sheet.props.options.find((o: any) => o.label === 'Price: Low to High').onPress(); });
  const names = tree.root.findAllByType(TouchableOpacity)
    .map((n: any) => n.props.accessibilityLabel)
    .filter((l: string) => /^Accept bid from/.test(l || ''));
  expect(names).toEqual(['Accept bid from Dev', 'Accept bid from Arushi']);
});

test('accepting asks first, then tells the brand the amount is in escrow and refreshes', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, slots_left: 1 });
  await render();
  await act(async () => { button('Accept bid from Arushi').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  expect(confirm[0]).toBe('Accept Arushi?');
  expect(selectCreator).not.toHaveBeenCalled();
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Accept').onPress(); });
  expect(selectCreator).toHaveBeenCalledWith('t', 'c1', 'arushi');
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Creator hired')!;
  expect(done[1]).toBe('Arushi hired! Rs. 3,000 held in escrow. 1 slot still open.');
  expect(getCampaigns).toHaveBeenCalledTimes(2);
});

test('a hire with a short wallet prompts to add funds and opens the recharge, without blocking', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, amount_charged: 3300, funded: false, slots_left: 1 });
  const go = jest.fn();
  await render([campaign], go);
  await act(async () => { button('Accept bid from Arushi').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Accept').onPress(); });
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Creator hired')!;
  expect(done[1]).toBe('Arushi is hired, but your wallet is short. Add Rs. 3,300 to fund the escrow so work can start.');
  expect(go).not.toHaveBeenCalled();
  done[2].find((b: any) => b.text === 'Add funds').onPress();
  expect(go).toHaveBeenCalledWith('/dashboard/business/wallet?view=recharge');
  expect(getCampaigns).toHaveBeenCalledTimes(2);
});

test('a funded hire keeps the normal message and a single OK', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, amount_charged: 3300, funded: true, slots_left: 1 });
  await render();
  await act(async () => { button('Accept bid from Arushi').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Accept').onPress(); });
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Creator hired')!;
  expect(done[1]).toBe('Arushi hired! Rs. 3,300 held in escrow. 1 slot still open.');
  expect(done[2]).toBeUndefined();
});

test('a refused hire shows the backend reason', async () => {
  (selectCreator as jest.Mock).mockRejectedValue(new Error('All 3 creator slot(s) on this brief are already filled.'));
  await render();
  await act(async () => { button('Accept bid from Arushi').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Accept').onPress(); });
  const failed = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Could not complete')!;
  expect(failed[1]).toContain('already filled');
});

test('declining confirms and then says the creator was told', async () => {
  (declineBid as jest.Mock).mockResolvedValue({});
  await render();
  await act(async () => { button('Decline bid from Dev').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Decline').onPress(); });
  expect(declineBid).toHaveBeenCalledWith('t', 'c1', 'dev');
  expect((Alert.alert as jest.Mock).mock.calls.some(call => call[0] === 'Bid declined')).toBe(true);
});

test('a failed load says so and offers Retry instead of "No applications"', async () => {
  const offline: any = new Error('Network down');
  offline.name = 'NetworkError';
  (getCampaigns as jest.Mock).mockRejectedValueOnce(offline);
  await act(async () => {
    tree = Renderer.create(<BrandBids token="t" onBack={() => {}} onNavigate={() => {}} />);
  });
  const text = content(tree.toJSON());
  expect(text).toContain("You're offline");
  expect(text).toContain("Couldn't load applications");
  expect(text).not.toContain('Creator applications appear here');
  (getCampaigns as jest.Mock).mockResolvedValue([campaign]);
  await act(async () => { button('Retry loading applications').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Arushi');
  expect(content(tree.toJSON())).not.toContain("You're offline");
});
