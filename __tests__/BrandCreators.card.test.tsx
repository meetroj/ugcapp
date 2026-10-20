/**
 * Card and quick-preview fields come from the names the directory API really
 * returns (budget_range, avg_rating, review_count, city_tier, categories),
 * a failed load says so, and the card can message the creator.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import BrandCreators, { locationOf, priceTextOf, ratingText } from '../src/screens/BrandCreators';

let tree: Renderer.ReactTestRenderer;
const CREATOR = {
  id: 'c1',
  name: 'Deshna',
  nickname: 'Deshna_K',
  primary_category: 'fashion',
  categories: ['fashion', 'beauty'],
  budget_range: '3000',
  avg_rating: 4.5,
  review_count: 12,
  city_tier: 'Tier 1',
  deliverables_completed: 7,
};

beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const press = (predicate: (n: Renderer.ReactTestInstance) => boolean) =>
  tree.root.findAll(n => predicate(n) && typeof n.props.onPress === 'function')[0];

test('price, rating and location follow the website rules on the API field names', () => {
  expect(priceTextOf({ id: 'a', budget_range: '3000' })).toBe('Rs. 3,000 / video');
  expect(priceTextOf({ id: 'a', budget_range: 'Rs. 2,000 - 4,000' })).toBe('Rs. 2,000 - 4,000');
  expect(priceTextOf({ id: 'a' })).toBe('Rate on request');
  // The API never sends price_per_video, so it must not be read.
  expect(priceTextOf({ id: 'a', price_per_video: 2000 })).toBe('Rate on request');
  expect(ratingText({ id: 'a', avg_rating: 4.5, review_count: 12 })).toBe('★ 4.5 (12)');
  expect(ratingText({ id: 'a', avg_rating: null, review_count: 0 })).toBe('New');
  expect(ratingText({ id: 'a', average_rating: 4.5 })).toBe('New');
  expect(locationOf({ id: 'a', city_tier: 'Tier 2' })).toBe('Tier 2');
  expect(locationOf({ id: 'a' })).toBe('India');
});

test('the quick preview shows the real price, rating, location and every category', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [CREATOR] }));
  await act(async () => {
    tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />);
  });
  // The card itself shows the rate, the first category with a count, and a Message button.
  expect(textOf(tree.root)).toContain('Rs. 3,000 / video');
  expect(textOf(tree.root)).toContain('Fashion +1');
  expect(tree.root.findAll(n => n.props.testID === 'creator-message-c1').length).toBeGreaterThan(0);

  await act(async () => {
    press(n => String(n.props.accessibilityLabel || '').startsWith('Deshna,')).props.onPress();
  });
  const peek = textOf(tree.root);
  expect(peek).toContain('Rs. 3,000 / video');
  expect(peek).toContain('★ 4.5 (12)');
  expect(peek).toContain('Tier 1');
  expect(peek).toContain('Fashion');
  expect(peek).toContain('Beauty');
});

test('Message on the card goes straight to the chat', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [CREATOR] }));
  const onNavigate = jest.fn();
  await act(async () => {
    tree = Renderer.create(<BrandCreators token="t" onNavigate={onNavigate} />);
  });
  act(() => press(n => n.props.testID === 'creator-message-c1').props.onPress());
  expect(onNavigate).toHaveBeenCalledWith('/messages/c1');
});

test('a failed load says so with Retry rather than "No creators found"', async () => {
  let offline = true;
  (globalThis as any).fetch = jest.fn(async () => {
    if (offline) throw new TypeError('Network request failed');
    return { ok: true, status: 200, json: async () => [CREATOR] };
  });
  await act(async () => {
    tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />);
  });
  expect(textOf(tree.root)).toContain("You're offline");
  expect(textOf(tree.root)).not.toContain('No creators found');
  offline = false;
  await act(async () => {
    press(n => n.props.testID === 'creators-retry').props.onPress();
  });
  expect(textOf(tree.root)).toContain('Deshna');
  expect(tree.root.findAll(n => n.props.testID === 'creators-error')).toHaveLength(0);
});
