import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, ScrollView, StyleSheet } from 'react-native';
import BrandCampaigns from '../src/screens/BrandCampaigns';
import { getCampaigns } from '../src/api';
import { scale } from '../src/theme';

jest.mock('../src/api', () => ({ getCampaigns: jest.fn() }));
let tree: any;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); tree = null; });
const campaigns = [
  { id: 'active', title: 'Active brief', status: 'active' },
  { id: 'review', title: 'Review brief', status: 'pending_approval' },
  { id: 'done', title: 'Done brief', status: 'completed' },
  { id: 'draft', title: 'Draft brief', status: 'draft' },
];
const filter = (label: string) => tree.root.findAll(
  (node: any) => node.props.accessibilityLabel === `Filter: ${label}` && typeof node.props.onPress === 'function',
)[0];
async function render() {
  await act(async () => {
    tree = Renderer.create(<BrandCampaigns token="t" onNavigate={() => {}} />);
  });
}

test('one tap switches each filter using loaded campaigns without refetching', async () => {
  (getCampaigns as jest.Mock).mockResolvedValue(campaigns);
  await render();
  for (const [label, id] of [['In Review', 'review'], ['Complete', 'done'], ['Draft', 'draft'], ['Active', 'active']]) {
    await act(async () => { filter(label).props.onPress(); });
    expect(filter(label).props.accessibilityState.selected).toBe(true);
    expect(tree.root.findByType(FlatList).props.data.map((item: any) => item.id)).toEqual([id]);
  }
  expect(getCampaigns).toHaveBeenCalledTimes(1);
});

test('filter selection is accepted immediately while initial fetch is pending', async () => {
  let resolve: any;
  (getCampaigns as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
  await render();
  await act(async () => { filter('Draft').props.onPress(); });
  expect(filter('Draft').props.accessibilityState.selected).toBe(true);
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
