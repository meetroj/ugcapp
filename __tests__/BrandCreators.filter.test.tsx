import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, FlatList, Text } from 'react-native';
import BrandCreators, { categoriesOf } from '../src/screens/BrandCreators';
import ChoiceSheet from '../src/components/ChoiceSheet';

let tree: Renderer.ReactTestRenderer;
const directory = [
  { id: 'a', name: 'Asha', primary_category: 'beauty', categories: ['Beauty', 'Fashion'] },
  { id: 'b', name: 'Bilal', primary_category: 'food' },
  { id: 'c', name: 'Chandni', primary_category: 'fashion', categories: ['fashion'], ugcad_approved: true },
];
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => directory.map(item => ({ ...item })) }));
});
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });

const byId = (testID: string) => tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const shown = () => tree.root.findAllByType(FlatList).flatMap(row => row.props.data.map((creator: any) => creator.name)).sort();
const sheet = () => tree.root.findByType(ChoiceSheet);

test('categories come from every category a creator picked, like the website', () => {
  expect(categoriesOf({ id: '1', categories: ['Beauty', ' Fashion '] })).toEqual(['beauty', 'fashion']);
  expect(categoriesOf({ id: '2', primary_category: 'Food' })).toEqual(['food']);
  expect(categoriesOf({ id: '3' })).toEqual([]);
});

test('Filter lists categories with counts, filters the directory, and clearing restores it', async () => {
  await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />); });
  expect(shown()).toEqual(['Asha', 'Bilal', 'Chandni']);

  act(() => byId('creator-filter-button').props.onPress());
  expect(sheet().props.visible).toBe(true);
  const labels = sheet().props.options.map((option: any) => option.label);
  expect(labels).toEqual(['✓ All categories', 'Fashion (2)', 'Beauty (1)', 'Food (1)']);

  act(() => sheet().props.options.find((option: any) => option.label === 'Fashion (2)').onPress());
  expect(shown()).toEqual(['Asha', 'Chandni']); // Asha's second category counts too
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Fashion')).toBe(true); // active chip

  act(() => byId('creator-filter-clear').props.onPress());
  expect(shown()).toEqual(['Asha', 'Bilal', 'Chandni']);
});

test('an empty category result explains itself', async () => {
  directory.splice(0, directory.length, { id: 'b', name: 'Bilal', primary_category: 'food' });
  await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />); });
  act(() => byId('creator-filter-button').props.onPress());
  act(() => sheet().props.options[1].onPress()); // Food
  expect(shown()).toEqual(['Bilal']);
});
