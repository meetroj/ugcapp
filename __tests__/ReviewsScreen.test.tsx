/**
 * Reviews for both roles: who wrote the review and which campaign it was for
 * (the review document carries only ids), the count/percent breakdown, the
 * Brands Reviewed / Creators tile, a profile link for brands, and a visible
 * load error instead of "No reviews yet".
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import Reviews from '../src/screens/Reviews';
import { getBusinessReviews, getCampaign, getMe, getMyDeals, getPublicProfile, getReviews } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  getReviews: jest.fn(),
  getMe: jest.fn(),
  getPublicProfile: jest.fn(),
  getCampaign: jest.fn(),
  getMyDeals: jest.fn(),
  getBusinessReviews: jest.fn(),
  postReview: jest.fn(),
}));

let tree: any;
const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const all = () => ([] as any[]).concat(tree.toJSON()).map(text).join('');
const touch = (label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === label);

const reviews = [
  { id: 'r1', reviewer_id: 'u1', campaign_id: 'c1', rating: 5, review: 'Great work', created_at: '2026-10-01T00:00:00Z' },
  { id: 'r2', reviewer_id: 'u1', campaign_id: 'c1', rating: 4, review: 'Good', created_at: '2026-09-01T00:00:00Z' },
];

async function mount(role: 'creator' | 'business', extra: Record<string, any> = {}) {
  await act(async () => {
    tree = Renderer.create(
      <Reviews token="t" session={{ user_id: 'me', role, token: 't' } as any} onBack={() => {}} {...extra} />,
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getReviews as jest.Mock).mockResolvedValue(reviews);
  (getMe as jest.Mock).mockResolvedValue({ average_rating: 4.5, total_reviews: 2 });
  (getCampaign as jest.Mock).mockResolvedValue({ id: 'c1', title: 'Summer Launch' });
  (getMyDeals as jest.Mock).mockResolvedValue([]);
  (getBusinessReviews as jest.Mock).mockResolvedValue([]);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

test('a creator sees the brand name and the campaign title, not a bare "Brand"', async () => {
  (getPublicProfile as jest.Mock).mockResolvedValue({ business_name: 'Acme Foods', nickname: '@acme' });
  await mount('creator');
  const t = all();
  expect(t).toContain('Acme Foods');
  expect(t).toContain('Campaign: Summer Launch');
  expect(getPublicProfile).toHaveBeenCalledTimes(1);
  expect(getCampaign).toHaveBeenCalledTimes(1);
});

test('stats: count and percent per star, 5-star tile, Brands Reviewed tile', async () => {
  (getPublicProfile as jest.Mock).mockResolvedValue({ business_name: 'Acme Foods' });
  await mount('creator');
  const t = all();
  expect(t).toContain('5 Stars');
  expect(t).toContain('1 (50%)');
  expect(t).toContain('Brands Reviewed');
  expect(t).toContain('Brand worked with');
  expect(t).toContain('4.5');
});

test('a brand sees the creator by first name, a Creators tile and a profile link', async () => {
  (getPublicProfile as jest.Mock).mockResolvedValue({ full_name: 'Arushi Mehta' });
  const onNavigate = jest.fn();
  await mount('business', { onNavigate });
  const t = all();
  expect(t).toContain('Arushi');
  expect(t).not.toContain('Mehta');
  expect(t).toContain('Creators');
  expect(t).toContain('Creator worked with');
  await act(async () => { touch("View Arushi's profile")!.props.onPress(); });
  expect(onNavigate).toHaveBeenCalledWith('/creator/u1');
});

test('a creator gets no profile link on a review', async () => {
  (getPublicProfile as jest.Mock).mockResolvedValue({ business_name: 'Acme Foods' });
  await mount('creator', { onNavigate: jest.fn() });
  expect(tree.root.findAllByType(TouchableOpacity).filter((n: any) => /^View .*profile$/.test(n.props.accessibilityLabel || ''))).toHaveLength(0);
});

const paid = (id: string, business: string, brand: string) => ({
  deal_id: `DEAL-${id}`,
  current_state: 'Paid - Complete',
  campaign: { id, business_id: business, title: `Campaign ${id}` },
  brand: { id: business, name: brand },
});

test('a creator is offered every completed deal whose brand they have not rated', async () => {
  (getReviews as jest.Mock).mockResolvedValue([]);
  (getMyDeals as jest.Mock).mockResolvedValue([
    paid('c1', 'b1', 'Acme Foods'),
    paid('c2', 'b1', 'Acme Foods'),
    paid('c3', 'b2', 'Zed Labs'),
    { ...paid('c4', 'b2', 'Zed Labs'), current_state: 'In Progress' },
  ]);
  // The creator ('me') already rated Acme for c1; someone else's review does not count.
  (getBusinessReviews as jest.Mock).mockImplementation(async (_t: string, id: string) =>
    id === 'b1'
      ? [{ campaign_id: 'c1', reviewer_id: 'me' }, { campaign_id: 'c2', reviewer_id: 'other' }]
      : [],
  );
  await mount('creator');
  const t = all();
  expect(t).toContain('Rate your brands');
  expect(t).toContain('Campaign c2');
  expect(t).toContain('Campaign c3');
  expect(t).not.toContain('Campaign c1');
  expect(t).not.toContain('Campaign c4');
  // The empty state says what shows here, and where to rate.
  expect(t).toContain('Brands rate you after each completed deal');

  await act(async () => { touch('Rate Zed Labs')!.props.onPress(); });
  expect(all()).toContain('How was working with Zed Labs?');
});

test('a brand whose reviews cannot be read is not offered a blind rating', async () => {
  (getMyDeals as jest.Mock).mockResolvedValue([paid('c1', 'b1', 'Acme Foods')]);
  (getBusinessReviews as jest.Mock).mockRejectedValue(new Error('down'));
  await mount('creator');
  expect(all()).not.toContain('Rate your brands');
});

test('a brand is never asked to rate brands, and its empty state names creators', async () => {
  (getReviews as jest.Mock).mockResolvedValue([]);
  (getMyDeals as jest.Mock).mockResolvedValue([paid('c1', 'b1', 'Acme Foods')]);
  await mount('business');
  expect(getMyDeals).not.toHaveBeenCalled();
  expect(all()).not.toContain('Rate your brands');
  expect(all()).toContain('Creators rate your brand after each completed deal');
});

test('no reviews: the average shows a dash, not 0.0', async () => {
  (getReviews as jest.Mock).mockResolvedValue([]);
  (getMe as jest.Mock).mockResolvedValue({});
  await mount('creator');
  const t = all();
  expect(t).toContain('No reviews yet');
  expect(t).not.toContain('0.0');
});

test('a failed load shows the reason and Retry, never "No reviews yet"', async () => {
  (getReviews as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NetworkError' }));
  (getPublicProfile as jest.Mock).mockResolvedValue({ business_name: 'Acme Foods' });
  await mount('creator');
  expect(all()).toContain("You're offline. Check your connection and try again.");
  expect(all()).not.toContain('No reviews yet');
  await act(async () => { touch('Retry')!.props.onPress(); });
  expect(all()).toContain('Great work');
  expect(all()).not.toContain("You're offline");
});
