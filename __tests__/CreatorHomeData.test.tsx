/**
 * Creator Home numbers and cards: Deals Closed counts only completed deals the
 * creator was selected for, earnings come from the payout overview, the profile
 * bar and active-deal card show real data, and a failed load says so with Retry
 * instead of showing zeros.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import CreatorHome from '../src/screens/CreatorHome';

const SESSION: any = { user_id: 'u1', role: 'creator', token: 't', profile_completed: true };

type Routes = Record<string, any>;
function mockFetch(routes: Routes, fail: (url: string) => boolean = () => false) {
  jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
    if (fail(url)) throw new TypeError('Network request failed');
    const hit = Object.keys(routes).find(key => url.includes(key));
    return { ok: true, status: 200, json: async () => (hit ? routes[hit] : {}) };
  }) as never);
}

let tree!: ReactTestRenderer.ReactTestRenderer;
const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const all = () => ([] as any[]).concat(tree.toJSON()).map(text).join('');
async function mount(props: Record<string, any> = {}) {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <CreatorHome
        token="t"
        session={SESSION}
        onBrowse={() => {}}
        onOpenNotifications={() => {}}
        onOpenMessages={() => {}}
        onOpenProfile={() => {}}
        {...props}
      />,
    );
  });
  await ReactTestRenderer.act(async () => {});
}

const done = (id: string, status: string, selected = 'u1') => ({ id, status, selected_creators: [selected] });

afterEach(async () => {
  await ReactTestRenderer.act(async () => tree.unmount());
  jest.restoreAllMocks();
});

test('Deals Closed counts only completed deals this creator was selected for', async () => {
  mockFetch({
    'status=completed': [done('a', 'completed'), done('b', 'cancelled'), done('c', 'completed', 'someone-else'), { id: 'd', status: 'completed', selected_creator: 'u1' }],
    'auth/me': { name: 'Riya', profile: {} },
  });
  await mount();
  expect(all()).toContain('Deals Closed2');
});

test('Total Earnings is the lifetime released payout, not just the balance', async () => {
  mockFetch({
    'payout/overview': { all_time_earnings: 54000, balance: 1200 },
    'auth/me': { name: 'Riya', balance: 1200, profile: {} },
  });
  await mount();
  expect(all()).toContain('₹ 54,000');
});

test('the profile bar shows the real percent and opens the profile', async () => {
  const onOpenProfile = jest.fn();
  mockFetch({ 'auth/me': { name: 'Riya', profile_photo: '/p.jpg', profile: { city: 'Pune', state: 'MH', pincode: '411001', languages: ['Hindi'] } } });
  await mount({ onOpenProfile });
  expect(all()).toContain('Profile 60% complete');
  const bar = tree.root.findAllByType(TouchableOpacity).find((n: any) => /Profile 60% complete/.test(n.props.accessibilityLabel || ''))!;
  bar.props.onPress();
  expect(onOpenProfile).toHaveBeenCalled();
});

test('a running deal gets a card with real fields and no made-up progress', async () => {
  mockFetch({
    'include_drafts=true': [{ id: 'k', status: 'in_progress', title: 'Winter shoot', brand_name: '@Glow', selected_creators: ['u1'] }],
    'auth/me': { name: 'Riya', profile: {} },
  });
  const onOpenDeals = jest.fn();
  await mount({ onOpenDeals });
  expect(all()).toContain('ACTIVE DEAL');
  expect(all()).toContain('Winter shoot');
  expect(all()).toContain('Glow · In progress');
  // The website's card shows an invented 65% / 40% progress; the app does not.
  expect(all()).not.toMatch(/65%|40%/);
});

test('category and rating show under the greeting', async () => {
  mockFetch({ 'auth/me': { name: 'Riya', category: 'product_demo', average_rating: 4.8, profile: {} } });
  await mount();
  expect(all()).toContain('product demo');
  expect(all()).toContain('★ 4.8');
});

test('a failed load says offline with Retry rather than showing zeros as fact', async () => {
  let down = true;
  mockFetch({ 'auth/me': { name: 'Riya', profile: {} } }, () => down);
  await mount();
  expect(all()).toContain("You're offline. Check your connection and try again.");
  down = false;
  const retry = tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Retry')!;
  await ReactTestRenderer.act(async () => { retry.props.onPress(); });
  await ReactTestRenderer.act(async () => {});
  expect(all()).not.toContain("You're offline");
});
