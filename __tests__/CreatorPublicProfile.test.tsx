import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import CreatorPublicProfile, {
  categoriesFor,
  firstNameOf,
  mergePortfolio,
  ratingBars,
  relTime,
} from '../src/screens/CreatorPublicProfile';

let tree: Renderer.ReactTestRenderer;
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});
const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const press = (testID: string) =>
  tree.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];

test('the name is the first name, not the auto-generated nickname', () => {
  expect(firstNameOf({ full_name: 'Deshna Kapoor', nickname: 'LuckyTiger764' })).toBe('Deshna');
  expect(firstNameOf({ first_name: 'Asha', nickname: 'x' })).toBe('Asha');
  expect(firstNameOf({ profile: { fullName: '@Bilal Khan' }, nickname: 'x' })).toBe('Bilal');
  expect(firstNameOf(null, { name: 'Chandni' })).toBe('Chandni');
  expect(firstNameOf(null, null)).toBe('Creator');
});

test('all picked categories are listed, de-duplicated and title-cased', () => {
  expect(categoriesFor({ content_categories: ['fashion', 'Beauty', 'beauty'] }, null, 'x')).toEqual(['Fashion', 'Beauty']);
  expect(categoriesFor({}, { categories: ['food_drink'] }, 'x')).toEqual(['Food Drink']);
  expect(categoriesFor({}, null, 'General')).toEqual(['General']);
});

test('portfolio merges the website sources, de-duplicates, drops blobs and caps at 5', () => {
  const clip = (n: number) => `https://cdn.example.com/${n}.mp4`;
  const merged = mergePortfolio(
    { portfolio: [clip(1), clip(2), clip(3)] },
    { portfolio_items: [{ video_url: clip(0), category: 'Fashion', price: '2000' }], portfolio: [clip(2), clip(4), clip(5), 'blob:xyz'] },
  );
  expect(merged.map(c => c.url)).toEqual([clip(0), clip(1), clip(2), clip(3), clip(4)]);
  expect(merged[0]).toMatchObject({ category: 'Fashion', price: '2000' });
  // Intro video is the fallback when there is no portfolio at all.
  expect(mergePortfolio({}, { intro_video: clip(9) }).map(c => c.url)).toEqual([clip(9)]);
});

test('star bars and review age', () => {
  expect(ratingBars([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 1 }])).toEqual([
    { star: 5, count: 2 }, { star: 4, count: 1 }, { star: 3, count: 0 }, { star: 2, count: 0 }, { star: 1, count: 1 },
  ]);
  const now = new Date('2026-10-20T00:00:00Z').getTime();
  expect(relTime('2026-10-20T00:00:00Z', now)).toBe('today');
  expect(relTime('2026-10-17T00:00:00Z', now)).toBe('3 days ago');
  expect(relTime('2026-08-01T00:00:00Z', now)).toBe('2 months ago');
  expect(relTime('', now)).toBe('');
});

test('renders the first name, every category, the brand behind a review and the pinned Send a Brief', async () => {
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    if (url.includes('/api/profile/c1')) {
      return ok({ id: 'c1', full_name: 'Deshna Kapoor', nickname: 'LuckyTiger764', kyc_verified: true,
        profile: { content_categories: ['fashion', 'beauty'], flexible: true, weekly: '5 days', rate_card: { expected_payout: '3000' } } });
    }
    if (url.includes('/api/profile/b1')) return ok({ id: 'b1', profile: { business_name: 'Glow Co' } });
    if (url.includes('/api/campaigns/k1')) return ok({ id: 'k1', title: 'Serum', budget_max: 8000, category: 'beauty', estimated_delivery_days: 4 });
    if (url.includes('/api/reviews/creator/c1')) {
      return ok([{ id: 'r1', rating: 5, review: 'Great work', reviewer_id: 'b1', campaign_id: 'k1', created_at: '2026-10-01T00:00:00Z' }]);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  const onSendBrief = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <CreatorPublicProfile token="t" creatorId="c1" onBack={() => {}} onMessage={() => {}} onSendBrief={onSendBrief} />,
    );
  });
  const text = textOf(tree.root);
  expect(text).toContain('Deshna');
  expect(text).not.toContain('LuckyTiger764');
  expect(text).toContain('CATEGORIES');
  expect(text).toContain('Fashion, Beauty');
  expect(text).toContain('FLEXIBLE HOURS');
  expect(text).toContain('Glow Co');
  expect(text).toContain('Great work');
  expect(text).toContain('4 days');
  expect(text).toContain('5 Stars');
  act(() => press('profile-send-brief').props.onPress());
  expect(onSendBrief).toHaveBeenCalled();
});

test('a failed profile load says so with Retry instead of "No videos yet"', async () => {
  let offline = true;
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    if (offline) throw new TypeError('Network request failed');
    if (url.includes('/reviews/')) return ok([]);
    return ok({ id: 'c1', full_name: 'Deshna Kapoor', profile: {} });
  });
  await act(async () => {
    tree = Renderer.create(
      <CreatorPublicProfile token="t" creatorId="c1" onBack={() => {}} onMessage={() => {}} onSendBrief={() => {}} />,
    );
  });
  expect(textOf(tree.root)).toContain("You're offline");
  expect(textOf(tree.root)).not.toContain('No videos yet');
  offline = false;
  await act(async () => { press('profile-retry').props.onPress(); });
  expect(textOf(tree.root)).toContain('Deshna');
  expect(tree.root.findAll(n => n.props.testID === 'profile-error')).toHaveLength(0);
});
