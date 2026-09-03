/**
 * @format
 * The three bottom-nav destinations must expose both header actions:
 * Notifications (bell) and Messages (chat). Browse and Active Work were
 * missing the chat icon; Earnings was missing the bell.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ActiveWork from '../src/screens/ActiveWork';
import BrowseCampaigns from '../src/screens/BrowseCampaigns';
import Earnings from '../src/screens/Earnings';

const session: any = { user_id: '1', role: 'creator', profile_completed: true };
beforeEach(() => {
  // Screens fetch on mount; a stubbed empty response keeps them off the
  // network and lands them in their empty state.
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  );
});

const labels = (tree: any) => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    const l = n.props?.accessibilityLabel;
    if (l) out.push(l);
    (n.children || []).forEach(walk);
  };
  walk(tree.toJSON());
  return out;
};

test('ActiveWork header has Notifications + Messages', async () => {
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(<ActiveWork token="t" session={session} />);
  });
  expect(labels(t)).toEqual(expect.arrayContaining(['Notifications', 'Messages']));
});

test('BrowseCampaigns header has Notifications + Messages', async () => {
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(<BrowseCampaigns token="t" session={session} />);
  });
  expect(labels(t)).toEqual(expect.arrayContaining(['Notifications', 'Messages']));
});

test('Earnings header has Notifications + Messages', async () => {
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(
      <Earnings token="t" session={session} onRequestWithdrawal={() => {}} />,
    );
  });
  expect(labels(t)).toEqual(expect.arrayContaining(['Notifications', 'Messages']));
});
