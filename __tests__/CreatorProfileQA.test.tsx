/**
 * @format
 * QA pass over the creator profile and money screens: the settings save sends
 * the clips as they are NOW (not the signup-time list), a failed clip save is
 * shown inside the details sheet, the 36-state list opens the scrolling sheet,
 * and the empty Money In state offers a next step.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import CreatorSettings from '../src/screens/CreatorSettings';
import Earnings from '../src/screens/Earnings';
import {
  getMe,
  getPayoutOverview,
  getPayoutReceipts,
  getWithdrawalHistory,
  saveCreatorProfile,
  savePortfolio,
} from '../src/api';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  getMe: jest.fn(),
  saveCreatorProfile: jest.fn(),
  savePortfolio: jest.fn(),
  getPayoutOverview: jest.fn(),
  getPayoutReceipts: jest.fn(),
  getWithdrawalHistory: jest.fn(),
}));

jest.setTimeout(60000);

const clip = (n: number) => ({
  title: `Clip ${n}`,
  videoUrl: `/uploads/c${n}.mp4`,
  urls: [`/uploads/c${n}.mp4`],
  price: '1000',
});

beforeEach(() => {
  jest.clearAllMocks();
  (getMe as jest.Mock).mockResolvedValue({
    profile: {
      fullName: 'Asha',
      delivery_days: 3,
      // Signup-time list: older than what My Work holds now.
      portfolio: [clip(1)],
    },
    portfolio: [clip(1), clip(2)],
  });
  (saveCreatorProfile as jest.Mock).mockResolvedValue({});
  (savePortfolio as jest.Mock).mockResolvedValue({});
  (getPayoutOverview as jest.Mock).mockResolvedValue({ balance: 0 });
  (getPayoutReceipts as jest.Mock).mockResolvedValue([]);
  (getWithdrawalHistory as jest.Mock).mockResolvedValue([]);
});

const textOf = (n: any): string =>
  typeof n === 'string' ? n : (n.children || []).map(textOf).join('');

const pressable = (tree: any, text: string) =>
  tree.root.findAll(
    (n: any) =>
      typeof n.props?.onPress === 'function' &&
      (textOf(n).includes(text) || n.props.accessibilityLabel === text),
  )[0];

async function press(tree: any, text: string) {
  const hit = pressable(tree, text);
  expect(hit).toBeDefined();
  await ReactTestRenderer.act(async () => {
    hit.props.onPress();
  });
}

async function mountSettings() {
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <CreatorSettings token="t" session={{} as any} onBack={() => {}} />,
    );
  });
  return tree;
}

test('saving details sends the current clips, not the signup-time list', async () => {
  const tree = await mountSettings();
  await press(tree, 'Save changes');
  expect(saveCreatorProfile).toHaveBeenCalledTimes(1);
  const body = (saveCreatorProfile as jest.Mock).mock.calls[0][1];
  expect(body.portfolio).toHaveLength(2);
  expect(body.portfolio_items).toHaveLength(2);
  expect(body.portfolio[1].title).toBe('Clip 2');
});

test('a picked state is saved (state list opens the sheet, not 36 chips)', async () => {
  const tree = await mountSettings();
  await press(tree, 'Location & Contact');
  await press(tree, 'Select state');
  await press(tree, 'Goa');
  await press(tree, 'Save changes');
  expect((saveCreatorProfile as jest.Mock).mock.calls[0][1].state).toBe('Goa');
});

test('a failed clip save is shown inside the details sheet', async () => {
  (savePortfolio as jest.Mock).mockRejectedValue(
    new Error('Portfolio must contain between 1 and 5 samples (got 0).'),
  );
  const tree = await mountSettings();
  await press(tree, 'Edit work 1');
  await press(tree, 'Update work');
  const all = tree.root
    .findAll((n: any) => n.type === 'Text')
    .map((n: any) => textOf(n))
    .join('|');
  expect(all).toContain('Portfolio must contain between 1 and 5 samples');
});

test('a dropped connection on save reads as offline', async () => {
  const offline = Object.assign(new Error('Network request failed'), {
    name: 'NetworkError',
  });
  (saveCreatorProfile as jest.Mock).mockRejectedValue(offline);
  const tree = await mountSettings();
  await press(tree, 'Save changes');
  const all = tree.root
    .findAll((n: any) => n.type === 'Text')
    .map((n: any) => textOf(n))
    .join('|');
  expect(all).toContain("You're offline");
});

test('empty Money In offers Browse campaigns only when the screen can open it', async () => {
  const onBrowse = jest.fn();
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Earnings token="t" onRequestWithdrawal={() => {}} onBrowse={onBrowse} />,
    );
  });
  await press(tree, 'Browse campaigns');
  expect(onBrowse).toHaveBeenCalledTimes(1);

  let bare: any;
  await ReactTestRenderer.act(async () => {
    bare = ReactTestRenderer.create(
      <Earnings token="t" onRequestWithdrawal={() => {}} />,
    );
  });
  expect(pressable(bare, 'Browse campaigns')).toBeUndefined();
});
