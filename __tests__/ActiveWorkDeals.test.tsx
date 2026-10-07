import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import ActiveWork from '../src/screens/ActiveWork';
import { getMyDeals, getUnreadCount } from '../src/api';

jest.mock('../src/api', () => ({ getMyDeals: jest.fn(), getUnreadCount: jest.fn() }));

let tree: any;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getUnreadCount as jest.Mock).mockResolvedValue(0);
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});
async function render(deals: any[]) {
  (getMyDeals as jest.Mock).mockResolvedValue(deals);
  await act(async () => { tree = Renderer.create(<ActiveWork token="t" />); });
}
const buttons = (label: string) => tree.root.findAll((node: any) =>
  node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const deal = (state: string, campaign = {}) => ({ deal_id: 'c1', current_state: state, campaign });

test('newly hired multi-creator campaign is visible in Active', async () => {
  await render([deal('Accepted — Awaiting Shipment', {
    status: 'active', creators_wanted: 4, selected_creators: ['other', 'me'],
  })]);
  expect(buttons('Filter: Active').length).toBeGreaterThan(0);
  expect(buttons('View deal details').length).toBeGreaterThan(0);
});

test('pending booking opens Requests even with an accepted lifecycle state', async () => {
  await render([deal('Accepted — Awaiting Shipment', { booking_status: 'pending_creator' })]);
  expect(buttons('Filter: Requests').length).toBeGreaterThan(0);
  expect(buttons('View deal details').length).toBeGreaterThan(0);
});

test.each(['Disputed', 'Unpaid — Incomplete', 'Content Submitted — Awaiting Review'])(
  '%s remains visible in Active', async state => {
    await render([deal(state)]);
    expect(buttons('View deal details').length).toBeGreaterThan(0);
  },
);

test('paid completed deals stay out of Active', async () => {
  await render([deal('Paid — Complete')]);
  expect(buttons('View deal details')).toHaveLength(0);
});

test('foreground refresh shows deals hired after the list loaded', async () => {
  let listener: any;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler;
    return { remove: jest.fn() };
  });
  await render([]);
  expect(buttons('View deal details')).toHaveLength(0);
  (getMyDeals as jest.Mock).mockResolvedValue([deal('Received — Content in Progress')]);
  await act(async () => { listener('active'); });
  expect(buttons('View deal details').length).toBeGreaterThan(0);
});
