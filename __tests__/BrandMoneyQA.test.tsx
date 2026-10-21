/**
 * @format
 * QA pass over the brand money / creators / settings screens: real-date check
 * on the tracking editor, no false "NOT REQUESTED" banner on a failed load,
 * "Clear filters" on an empty creator list, settings email / pincode checks,
 * and the wallet's receipt note.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, FlatList } from 'react-native';
import BrandCreators from '../src/screens/BrandCreators';
import BrandSettings from '../src/screens/BrandSettings';
import BrandShipmentDetail, { isIsoDate } from '../src/screens/BrandShipmentDetail';
import BrandWallet from '../src/screens/BrandWallet';

let tree: Renderer.ReactTestRenderer;
const g = globalThis as any;
const realFetch = g.fetch;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, detail = 'nope') => ({ ok: false, status, json: async () => ({ detail }) });
function route(routes: [string, any][]) {
  const calls: { url: string; init?: any }[] = [];
  g.fetch = jest.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    for (const [match, res] of routes) if (String(url).includes(match)) return res;
    return fail(404);
  });
  return calls;
}
const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const allText = () => textOf(tree.root);
const byId = (testID: string) =>
  tree.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
const pressable = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && textOf(n) === label).slice(-1)[0];
const field = (placeholder: string) =>
  tree.root.findAll(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];

afterEach(() => {
  if (tree) act(() => tree.unmount());
  g.fetch = realFetch;
  jest.restoreAllMocks();
});

test('isIsoDate accepts real calendar dates only', () => {
  expect(isIsoDate('2026-11-20')).toBe(true);
  expect(isIsoDate('2028-02-29')).toBe(true);
  expect(isIsoDate('2026-13-45')).toBe(false);
  expect(isIsoDate('2026-02-30')).toBe(false);
  expect(isIsoDate('2026-1-5')).toBe(false);
  expect(isIsoDate('')).toBe(false);
});

test('an impossible expected-delivery date is explained and cannot be saved', async () => {
  const calls = route([['/api/shipment/C1', ok({ status: 'requested', product: { description: 'Box', weight: 1 } })]]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  await act(async () => { pressable('Add tracking details').props.onPress(); });
  act(() => field('e.g. 1234567890').props.onChangeText('AWB1'));
  act(() => field('YYYY-MM-DD').props.onChangeText('20261345'));
  expect(tree.root.findAll(n => n.props.testID === 'expected-error').length).toBeGreaterThan(0);
  await act(async () => { pressable('Save').props.onPress(); });
  expect(calls.some(c => c.url.includes('/api/shipment/update'))).toBe(false);
});

test('a failed shipment load shows the error but no "NOT REQUESTED" status banner', async () => {
  route([['/api/shipment/C1', fail(500, 'boom')]]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  expect(allText()).toContain("Couldn't load this shipment");
  expect(allText()).not.toContain('NOT REQUESTED');
});

test('an empty creator search offers Clear filters, which brings the list back', async () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as any);
  route([['/api/', ok([{ id: 'a', name: 'Asha', primary_category: 'beauty' }])]]);
  await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />); });
  const shown = () => tree.root.findAllByType(FlatList).flatMap(row => row.props.data.map((c: any) => c.name));
  expect(shown()).toEqual(['Asha']);
  expect(byId('creators-clear-filters')).toBeUndefined();

  act(() => field('Search by name, category or style').props.onChangeText('zzz'));
  expect(shown()).toEqual([]);
  expect(byId('creators-clear-filters')).toBeDefined();

  act(() => byId('creators-clear-filters').props.onPress());
  expect(shown()).toEqual(['Asha']);
});

describe('brand settings validation', () => {
  const profile = { brand_name: 'B', contact_person: 'C', work_email: 'not-an-email' };
  const company = { business_type: 'LLP (Limited Liability Partnership)', business_category: 'Pets', billing_address: 'x', city: 'Pune', state: 'Goa', country: 'India', pincode: '' };

  test('a malformed work email is rejected before any PUT', async () => {
    const calls = route([['/business/settings/company', ok(company)], ['/business/settings/profile', ok(profile)]]);
    await act(async () => { tree = Renderer.create(<BrandSettings token="t" onBack={() => {}} />); });
    await act(async () => { pressable('Save changes').props.onPress(); });
    expect(allText()).toContain('Enter a valid work email.');
    expect(calls.some(c => c.init?.method === 'PUT')).toBe(false);
  });

  test('a short pincode is rejected before any PUT', async () => {
    const calls = route([
      ['/business/settings/company', ok({ ...company, pincode: '4520' })],
      ['/business/settings/profile', ok({ ...profile, work_email: 'c@b.co' })],
    ]);
    await act(async () => { tree = Renderer.create(<BrandSettings token="t" onBack={() => {}} />); });
    await act(async () => { byId('settings-tab-company').props.onPress(); });
    await act(async () => { pressable('Save changes').props.onPress(); });
    expect(allText()).toContain('Pincode must be 6 digits.');
    expect(calls.some(c => c.init?.method === 'PUT')).toBe(false);
  });
});

test('the wallet tells the brand where the payment receipt goes', async () => {
  route([['/api/business/wallet', ok({ available_balance: 0, minimum_chat_balance: 2500, chat_unlocked: false, transactions: [] })]]);
  await act(async () => { tree = Renderer.create(<BrandWallet token="t" onNavigate={() => {}} />); });
  expect(allText()).toContain('payment receipt is emailed');
});
