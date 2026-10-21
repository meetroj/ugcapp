import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import BrandCampaigns, { TABS, creatorCount } from '../src/screens/BrandCampaigns';
import { Alert } from '../src/components/AppAlert';
import { deleteCampaign, getCampaigns } from '../src/api';
import { scale } from '../src/theme';

jest.mock('../src/api', () => ({ getCampaigns: jest.fn(), deleteCampaign: jest.fn() }));
let tree: any;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); tree = null; });
const campaigns = [
  { id: 'live', title: 'Live brief', status: 'active', created_at: '2026-01-02T00:00:00Z' },
  { id: 'pending', title: 'Pending brief', status: 'pending_approval', created_at: '2026-01-03T00:00:00Z' },
  { id: 'script', title: 'Script brief', status: 'awaiting_brand_confirmation', created_at: '2026-01-04T00:00:00Z' },
  { id: 'review', title: 'Review brief', status: 'work_submitted', created_at: '2026-01-05T00:00:00Z' },
  { id: 'done', title: 'Done brief', status: 'completed', created_at: '2026-01-06T00:00:00Z' },
  { id: 'hold', title: 'Held brief', status: 'paused', created_at: '2026-01-07T00:00:00Z' },
  { id: 'rejected', title: 'Rejected brief', status: 'rejected', created_at: '2026-01-08T00:00:00Z' },
  { id: 'draft', title: 'Draft brief', status: 'draft', created_at: '2026-01-09T00:00:00Z' },
  { id: 'gone', title: 'Cancelled brief', status: 'cancelled', created_at: '2026-01-10T00:00:00Z' },
];
const filter = (label: string) => tree.root.findAll(
  (node: any) => node.props.accessibilityLabel === `Filter: ${label}` && typeof node.props.onPress === 'function',
)[0];
const ids = () => tree.root.findByType(FlatList).props.data.map((item: any) => item.id);
async function render(onNavigate: any = () => {}) {
  await act(async () => {
    tree = Renderer.create(<BrandCampaigns token="t" onNavigate={onNavigate} />);
  });
}

test('has the website eight tabs in order', () => {
  expect(TABS.map(tab => tab.label)).toEqual([
    'All Campaigns', 'Pending', 'Live', 'In Review', 'Completed', 'On Hold', 'Rejected', 'Drafts',
  ]);
});

test('one tap switches each filter using loaded campaigns without refetching', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  await render();
  // Starts on All, newest first, and nothing (paused / rejected / cancelled) is hidden.
  expect(filter('All Campaigns').props.accessibilityState.selected).toBe(true);
  expect(ids()).toEqual(['gone', 'draft', 'rejected', 'hold', 'done', 'review', 'script', 'pending', 'live']);
  for (const [label, expected] of [
    ['Pending', ['script', 'pending']],
    ['Live', ['live']],
    ['In Review', ['review']],
    ['Completed', ['done']],
    ['On Hold', ['hold']],
    ['Rejected', ['rejected']],
    ['Drafts', ['draft']],
  ] as const) {
    await act(async () => { filter(label).props.onPress(); });
    expect(filter(label).props.accessibilityState.selected).toBe(true);
    expect(ids()).toEqual(expected);
  }
  expect(getCampaigns).toHaveBeenCalledTimes(1);
});

test('each tab shows its count', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  await render();
  expect(filter('All Campaigns').props.accessibilityValue.text).toBe('9 campaigns');
  expect(filter('Pending').props.accessibilityValue.text).toBe('2 campaigns');
  expect(filter('On Hold').props.accessibilityValue.text).toBe('1 campaigns');
});

test('filter selection is accepted immediately while initial fetch is pending', async () => {
  let resolve: any;
  (getCampaigns as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
  await render();
  await act(async () => { filter('Drafts').props.onPress(); });
  expect(filter('Drafts').props.accessibilityState.selected).toBe(true);
  await act(async () => { resolve(campaigns); });
  expect(tree.root.findByType(FlatList).props.data[0].id).toBe('draft');
});

test('filters have large tap targets outside the vertical list', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  await render();
  expect(StyleSheet.flatten(filter('In Review').props.style).minHeight).toBeGreaterThanOrEqual(scale(44));
  const horizontal = tree.root.findAllByType(ScrollView).find((node: any) => node.props.horizontal)!;
  expect(horizontal.props.stickyHeaderIndices).toBeUndefined();
  let parent = horizontal.parent;
  while (parent) {
    expect(parent.type).not.toBe(FlatList);
    expect(parent.type).not.toBe(ScrollView);
    parent = parent.parent;
  }
  expect(tree.root.findByType(FlatList).props.initialNumToRender).toBe(6);
});

test('creator count follows the website: hired creators, else bids, never creators_wanted', () => {
  expect(creatorCount({ id: 'a', selected_creators: ['x', 'y'], creators_wanted: 9 })).toBe(2);
  expect(creatorCount({ id: 'a', selected_creator: 'x' })).toBe(1);
  expect(creatorCount({ id: 'a', bids: [{}, {}, {}], creators_wanted: 9 })).toBe(3);
  expect(creatorCount({ id: 'a', creators_wanted: 9 })).toBe(0);
});

test('a draft reopens in the brief wizard and a live brief opens its detail page', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  const onNavigate = jest.fn();
  await render(onNavigate);
  const card = (label: string) => tree.root.findAll(
    (node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  )[0];
  await act(async () => { card('Draft brief, DRAFT').props.onPress(); });
  expect(onNavigate).toHaveBeenLastCalledWith('/dashboard/business/post-brief?draft=draft');
  await act(async () => { filter('Live').props.onPress(); });
  await act(async () => { card('Live brief, ACTIVE').props.onPress(); });
  expect(onNavigate).toHaveBeenLastCalledWith('/campaigns/live');
});

test('draft and rejected cards can be deleted after confirming, others cannot', async () => {
  (getCampaigns as jest.Mock)
    .mockResolvedValueOnce(campaigns)
    .mockResolvedValue(campaigns.filter(item => item.id !== 'draft'));
  (deleteCampaign as jest.Mock).mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render();
  const trash = (label: string) => tree.root.findAllByType(TouchableOpacity).filter(
    (node: any) => node.props.accessibilityLabel === label,
  );
  expect(trash('Delete draft Draft brief')).toHaveLength(1);
  expect(trash('Delete rejected brief Rejected brief')).toHaveLength(1);
  expect(trash('Delete draft Live brief')).toHaveLength(0);

  await act(async () => { trash('Delete draft Draft brief')[0].props.onPress(); });
  expect(deleteCampaign).not.toHaveBeenCalled();
  const [title, , buttons] = alert.mock.calls[0];
  expect(title).toBe('Delete this draft?');
  await act(async () => { await buttons![1].onPress!(); });
  expect(deleteCampaign).toHaveBeenCalledWith('t', 'draft');
  expect(ids()).not.toContain('draft');
  alert.mockRestore();
});

test('deleting a rejected brief is worded as a brief, not a draft', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render();
  const trash = tree.root.findAllByType(TouchableOpacity).filter(
    (node: any) => node.props.accessibilityLabel === 'Delete rejected brief Rejected brief',
  )[0];
  await act(async () => { trash.props.onPress(); });
  const [title, , buttons] = alert.mock.calls[0];
  expect(title).toBe('Delete this brief?');
  expect(buttons![1].text).toBe('Delete brief');
  alert.mockRestore();
});

test('a failed delete says why and keeps the card', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  const offline = Object.assign(new Error('Offline'), { name: 'NetworkError' });
  (deleteCampaign as jest.Mock).mockRejectedValue(offline);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render();
  const trash = tree.root.findAll(
    (node: any) => node.props.accessibilityLabel === 'Delete draft Draft brief' && typeof node.props.onPress === 'function',
  )[0];
  await act(async () => { trash.props.onPress(); });
  await act(async () => { await alert.mock.calls[0][2]![1].onPress!(); });
  expect(alert).toHaveBeenLastCalledWith('Could not delete the draft', expect.stringContaining('offline'));
  expect(ids()).toContain('draft');
  alert.mockRestore();
});

test('empty account offers to post the first campaign', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue([]);
  const onNavigate = jest.fn();
  await render(onNavigate);
  const cta = tree.root.findAllByType(TouchableOpacity).find((node: any) => collect(node) === 'Post your first campaign');
  expect(cta).toBeTruthy();
  await act(async () => { cta!.props.onPress(); });
  expect(onNavigate).toHaveBeenCalledWith('/dashboard/business/post-brief');
});

test('a failed load shows the reason with a Retry that refetches (offline wording)', async () => {
  const offline = Object.assign(new Error('x'), { name: 'NetworkError' });
  (getCampaigns as jest.Mock).mockRejectedValueOnce(offline).mockResolvedValueOnce(campaigns);
  await render();
  const json = collect(tree.root);
  expect(json).toContain("You're offline");
  expect(json).toContain("Couldn't load your campaigns");
  const retry = tree.root.findAllByType(TouchableOpacity).find((node: any) => collect(node) === 'Try again');
  await act(async () => { retry!.props.onPress(); });
  expect(getCampaigns).toHaveBeenCalledTimes(2);
  expect(ids()).toHaveLength(9);
});

function collect(node: any): string {
  return typeof node === 'string' ? node : (node?.children || []).map(collect).join('');
}
