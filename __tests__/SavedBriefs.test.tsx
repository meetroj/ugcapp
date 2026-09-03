/**
 * @format
 * The bookmark on a browse card used to be decorative — it had no onPress at
 * all, so tapping it saved nothing. These lock in that it now calls the real
 * saved-briefs API and reflects what the server already has.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import BrowseCampaigns from '../src/screens/BrowseCampaigns';
import { addSavedBrief, getSavedBriefs, removeSavedBrief } from '../src/api';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  getSavedBriefs: jest.fn(() => Promise.resolve([])),
  addSavedBrief: jest.fn(() => Promise.resolve(true)),
  removeSavedBrief: jest.fn(() => Promise.resolve(false)),
}));

const session: any = { user_id: 'u1', role: 'creator', profile_completed: true };

const CAMPAIGNS = [
  { id: 'c1', brand_name: 'Levi', title: 'Fit', budget: 1200 },
  { id: 'c2', brand_name: 'boAt', title: 'Sound', budget: 900 },
];

beforeEach(() => {
  jest.clearAllMocks();
  (getSavedBriefs as jest.Mock).mockResolvedValue([]);
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(CAMPAIGNS) }),
  );
});

/** Every node carrying an accessibilityLabel, so buttons can be found by name. */
function findByLabel(tree: any, match: (label: string) => boolean) {
  return tree.root
    .findAll(
      (n: any) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        match(n.props.accessibilityLabel),
    )
    .filter((n: any) => typeof n.props.onPress === 'function');
}

async function mount() {
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <BrowseCampaigns token="t0ken" session={session} />,
    );
  });
  return tree;
}

test('tapping the bookmark calls the save endpoint', async () => {
  const tree = await mount();

  const buttons = findByLabel(tree, l => l === 'Save campaign');
  expect(buttons.length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    buttons[0].props.onPress({ stopPropagation: () => {} });
  });

  expect(addSavedBrief).toHaveBeenCalledWith('t0ken', 'c1');
});

test('an already-saved campaign renders as saved and un-saves on tap', async () => {
  (getSavedBriefs as jest.Mock).mockResolvedValue(['c1']);
  const tree = await mount();

  const remove = findByLabel(tree, l => l === 'Remove from saved');
  expect(remove.length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    remove[0].props.onPress({ stopPropagation: () => {} });
  });

  expect(removeSavedBrief).toHaveBeenCalledWith('t0ken', 'c1');
  expect(addSavedBrief).not.toHaveBeenCalled();
});

test('a failed save rolls the bookmark back', async () => {
  (addSavedBrief as jest.Mock).mockRejectedValue(new Error('offline'));
  const tree = await mount();

  await ReactTestRenderer.act(async () => {
    findByLabel(tree, l => l === 'Save campaign')[0].props.onPress({
      stopPropagation: () => {},
    });
  });

  // Rolled back: nothing is left showing as saved.
  expect(findByLabel(tree, l => l === 'Remove from saved')).toHaveLength(0);
});
