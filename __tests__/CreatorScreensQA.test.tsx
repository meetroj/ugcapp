/**
 * QA pass over the creator screens: behaviours fixed in this pass.
 *  - My Deals opens a second deep-linked deal while already mounted
 *  - Deal Details "View full brief" Retry really refetches
 *  - Active Work / My Bids: offline wording, and a failed background poll keeps the list
 *  - Active Work empty tab offers Browse Campaigns
 *  - Booking counter price takes digits only
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import DealDetails from '../src/screens/DealDetails';
import DealBooking from '../src/screens/DealBooking';
import MyDeals from '../src/screens/MyDeals';
import MyBids from '../src/screens/MyBids';
import ActiveWork from '../src/screens/ActiveWork';
import { Alert } from '../src/components/AppAlert';
import { getCampaign, getMyBids, getMyDeals, getUnreadCount } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  MAX_VIDEO_UPLOAD_MB: 400,
  getBusinessReviews: jest.fn().mockResolvedValue([]),
  getCampaign: jest.fn(),
  getMyBids: jest.fn(),
  getMyDeals: jest.fn(),
  getShippingAddress: jest.fn(),
  getUnreadCount: jest.fn(),
  respondToBooking: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // The screens only poll while the app is in the foreground.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  (getUnreadCount as jest.Mock).mockResolvedValue(0);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const texts = () => content(tree.toJSON());
const button = (label: string) =>
  tree.root
    .findAll((n: any) => typeof n.props?.onPress === 'function')
    .find((n: any) => n.props.accessibilityLabel === label || content(n) === label);
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`no button "${label}" in: ${texts().slice(0, 400)}`);
  await act(async () => { await target.props.onPress(); });
};
const render = async (element: React.ReactElement) => {
  await act(async () => { tree = Renderer.create(element); });
};
const offline = () => Object.assign(new Error('x'), { name: 'NetworkError' });
const tick = async (ms: number) => {
  await act(async () => { jest.advanceTimersByTime(ms); });
};

const deal = (id: string, over: Record<string, any> = {}) => ({
  deal_id: `DEAL-${id}`,
  current_state: 'Received - Content in Progress',
  campaign: { id: `camp-${id}`, title: `Job ${id}`, business_id: 'b1' },
  brand: { id: 'b1', name: `Brand ${id}` },
  creator: { id: 'cr1', name: 'Arushi' },
  ...over,
});

describe('My Deals', () => {
  test('a new focusDealId opens that deal even though the screen stays mounted', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue([deal('1'), deal('2')]);
    const element = (focus?: string) => <MyDeals token="t" onBack={() => {}} focusDealId={focus} />;
    await render(element());
    expect(texts()).toContain('Job 1');
    expect(texts()).not.toContain('Deal Details');
    await act(async () => { tree.update(element('camp-2')); });
    expect(texts()).toContain('Deal Details');
    expect(texts()).toContain('Brand 2');
  });
});

describe('Deal Details brief', () => {
  test('Retry after a failed "View full brief" fetches the campaign again', async () => {
    (getCampaign as jest.Mock)
      .mockRejectedValueOnce(new Error("You're offline."))
      .mockResolvedValue({ id: 'camp-1', product_name: 'Glow Serum' });
    await render(<DealDetails deal={deal('1')} token="t" onBack={() => {}} onChat={() => {}} />);
    await press('Brief');
    await press('View full brief');
    expect(texts()).toContain("You're offline.");
    await press('Retry');
    expect(getCampaign).toHaveBeenCalledTimes(2);
    expect(texts()).toContain('Glow Serum');
    expect(texts()).not.toContain("You're offline.");
  });
});

describe('Active Work', () => {
  test('a dropped connection says offline, and a failed background poll keeps the list', async () => {
    (getMyDeals as jest.Mock).mockRejectedValueOnce(offline());
    await render(<ActiveWork token="t" />);
    expect(texts()).toContain('Could not load your work');
    expect(texts()).toContain("You're offline. Check your connection and try again.");
    (getMyDeals as jest.Mock).mockResolvedValue([deal('1')]);
    await press('Retry');
    expect(texts()).toContain('Job 1');
    // The 10 s poll fails: the cards stay and no error banner replaces them.
    (getMyDeals as jest.Mock).mockRejectedValue(offline());
    await tick(10000);
    expect(texts()).toContain('Job 1');
    expect(texts()).not.toContain('Could not load your work');
  });

  test('an empty Active tab offers Browse Campaigns when wired', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue([]);
    const onBrowse = jest.fn();
    await render(<ActiveWork token="t" onBrowse={onBrowse} />);
    expect(texts()).toContain('No active work');
    await press('Browse Campaigns');
    expect(onBrowse).toHaveBeenCalled();
  });
});

describe('My Bids', () => {
  test('a failed background poll keeps the bids on screen', async () => {
    const row = {
      campaign: { id: 'c1', title: 'Brief 1', brand_name: 'Acme' },
      my_bid: { id: 'b1', amount: 900 },
      bid_status: 'pending',
      submitted_at: '2026-10-10T00:00:00Z',
    };
    (getMyBids as jest.Mock).mockResolvedValue([row]);
    await render(<MyBids token="t" onBack={() => {}} />);
    expect(texts()).toContain('Brief 1');
    (getMyBids as jest.Mock).mockRejectedValue(offline());
    await tick(10000);
    expect(texts()).toContain('Brief 1');
    expect(texts()).not.toContain("You're offline");
  });
});

describe('Booking counter price', () => {
  test('letters are dropped from the price field', async () => {
    const booking = deal('1', {
      campaign: { id: 'camp-1', title: 'Launch', booking_status: 'pending_creator', budget_max: 4000 },
    });
    await render(<DealBooking deal={booking} token="t" onDone={() => {}} />);
    await press('Propose another price');
    const input = tree.root.findByProps({ testID: 'booking-price-input' });
    await act(async () => { input.props.onChangeText('ab5000x'); });
    expect(tree.root.findByProps({ testID: 'booking-price-input' }).props.value).toBe('5000');
  });
});
