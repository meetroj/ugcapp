import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import ActiveWork from '../src/screens/ActiveWork';
import { getMyDeals, getUnreadCount } from '../src/api';

jest.mock('../src/api', () => ({ getMyDeals: jest.fn(), getUnreadCount: jest.fn() }));
jest.mock('../src/screens/DealDetails', () => () => null);

// Back from a deal opened inside Active Work must land on the Active Work list. The deal
// is local state WebShell's history cannot see, so the screen registers a Back handler.
test('hardware Back closes the open deal instead of leaving Active Work', async () => {
  jest.useFakeTimers();
  (getUnreadCount as jest.Mock).mockResolvedValue(0);
  (getMyDeals as jest.Mock).mockResolvedValue([
    { deal_id: 'c1', current_state: 'Received - Content in Progress', campaign: {} },
  ]);
  const registerBack = jest.fn();
  let tree: any;
  await act(async () => { tree = Renderer.create(<ActiveWork token="t" registerBack={registerBack} />); });
  expect(registerBack).not.toHaveBeenCalled();

  const open = tree.root.findAll((n: any) =>
    n.props.accessibilityLabel === 'View deal details' && typeof n.props.onPress === 'function')[0];
  await act(async () => { open.props.onPress(); });
  const handler = registerBack.mock.calls.find(([fn]) => typeof fn === 'function')![0];

  let handled = false;
  await act(async () => { handled = handler(); });
  expect(handled).toBe(true);
  expect(registerBack).toHaveBeenLastCalledWith(null);
  expect(tree.root.findAll((n: any) => n.props.accessibilityLabel === 'View deal details').length).toBeGreaterThan(0);

  await act(async () => { tree.unmount(); });
  jest.useRealTimers();
});
