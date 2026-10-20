import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert } from '../src/components/AppAlert';
import BrandShipments from '../src/screens/BrandShipments';
import BrandShipmentDetail from '../src/screens/BrandShipmentDetail';
import {
  isMockShipment,
  isRealShipment,
  needsShipment,
  resolveMediaUrl,
  shipmentStatus,
} from '../src/shipmentStatus';

let tree: Renderer.ReactTestRenderer;
let calls: { url: string; init?: any }[] = [];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, detail = 'nope') => ({ ok: false, status, json: async () => ({ detail }) });
/** Routes are matched in order by substring; anything unmatched is a 404. */
function route(routes: [string, any][]) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    for (const [match, res] of routes) {
      if (url.includes(match)) return typeof res === 'function' ? res(url, init) : res;
    }
    return fail(404);
  });
}
const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const allText = () => textOf(tree.root);
const byTestId = (testID: string) =>
  tree.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
const pressable = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && textOf(n) === label).slice(-1)[0];

afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('status comes from the real backend status, not from having a tracking number', () => {
  expect(shipmentStatus(null, false).key).toBe('nocreator');
  expect(shipmentStatus(null).label).toBe('Ready to ship');
  expect(shipmentStatus({ status: 'requested' }).label).toBe('Awaiting label');
  expect(shipmentStatus({ status: 'requested', awaiting_creator_address: true }).label).toBe('Awaiting address');
  // A label exists but the courier has not collected it: NOT in transit.
  expect(shipmentStatus({ status: 'awaiting_pickup', tracking_number: 'AWB1' }).key).toBe('pickup');
  expect(shipmentStatus({ status: 'in_transit', tracking_number: 'AWB1' }).key).toBe('transit');
  expect(shipmentStatus({ status: 'shipped' }).key).toBe('transit');
  expect(shipmentStatus({ status: 'received' }).key).toBe('delivered');
  expect(shipmentStatus({ status: 'delivered' }).key).toBe('delivered');
  expect(shipmentStatus({ status: 'returned', tracking_number: 'x' }).label).toBe('Returned');
  // An empty stale record still needs shipping.
  expect(isRealShipment({ status: 'completed' })).toBe(false);
});

test('only briefs that need a shipment and are not closed are listed', () => {
  expect(needsShipment({ requires_shipment: true, status: 'active' })).toBe(true);
  expect(needsShipment({ shipment_option: 'yes' })).toBe(true);
  expect(needsShipment({ shipment_option: 'no' })).toBe(false);
  expect(needsShipment({ requires_shipment: true, status: 'rejected' })).toBe(false);
  expect(needsShipment(null)).toBe(false);
});

test('a mock courier booking is recognised, and relative files resolve against the API', () => {
  expect(isMockShipment({ tracking_number: 'MOCKABC123' })).toBe(true);
  expect(isMockShipment({ courier_name: 'Shiprocket (mock)' })).toBe(true);
  expect(isMockShipment({ label_url: '/mock-labels/c1.pdf' })).toBe(true);
  expect(isMockShipment({ tracking_number: '1234', courier_name: 'Delhivery' })).toBe(false);
  expect(resolveMediaUrl('https://cdn/x.pdf')).toBe('https://cdn/x.pdf');
  expect(resolveMediaUrl('/uploads/x.pdf')).toMatch(/\/uploads\/x\.pdf$/);
  expect(resolveMediaUrl('')).toBe('');
});

test('the list shows shipping briefs only, maps status honestly, shows ETA, and links creator-less ones to the brief', async () => {
  route([
    ['/api/campaigns', ok([
      { id: 'a', title: 'Serum launch', requires_shipment: true, selected_creator: 'u1', status: 'active' },
      { id: 'b', title: 'No product', selected_creator: 'u2', status: 'active' },
      { id: 'c', title: 'Unhired box', shipment_option: 'yes', status: 'active' },
    ])],
    ['/api/shipment/a', ok({ status: 'awaiting_pickup', tracking_number: 'AWB1', courier_name: 'Delhivery', expected_delivery: '2026-11-05' })],
  ]);
  const onNavigate = jest.fn();
  await act(async () => {
    tree = Renderer.create(<BrandShipments token="t" onBack={() => {}} onNavigate={onNavigate} />);
  });
  const text = allText();
  expect(text).toContain('Serum launch');
  expect(text).toContain('Unhired box');
  expect(text).not.toContain('No product');
  expect(text).toContain('Awaiting pickup');
  expect(text).toContain('Awaiting creator');
  expect(text).toContain('In Transit (0)');
  expect(text).toContain('Est. 05 Nov 2026');

  const open = (title: string) =>
    tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(title) && typeof n.props.onPress === 'function')[0];
  act(() => open('Unhired box').props.onPress());
  expect(onNavigate).toHaveBeenLastCalledWith('/campaigns/c');
  act(() => open('Serum launch').props.onPress());
  expect(onNavigate).toHaveBeenLastCalledWith('/shipment/a');
});

test('a failed list load says so with a Retry instead of "No shipments"', async () => {
  (globalThis as any).fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await act(async () => {
    tree = Renderer.create(<BrandShipments token="t" onBack={() => {}} onNavigate={() => {}} />);
  });
  expect(allText()).toContain("You're offline");
  expect(allText()).not.toContain('No shipments');
  expect(byTestId('shipments-retry')).toBeTruthy();
});

test('requesting a shipment uses request-shipment (never ship-label), fills city and state from the pincode', async () => {
  route([
    ['postalpincode.in', ok([{ PostOffice: [{ District: 'Pune', State: 'Maharashtra' }] }])],
    ['/api/shipping/account-address', ok({ address: { full_name: 'Asha', phone: '9876543210', line1: '12 MG Road', line2: '', city: 'Old', state: 'Old', pincode: '411001' } })],
    ['/request-shipment', ok({ message: 'Shipment requested', status: 'requested' })],
    ['/api/shipment/C1', fail(404, 'Shipment not found')],
  ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  await act(async () => { pressable('Request a shipment').props.onPress(); });

  const field = (placeholder: string) =>
    tree.root.findAll(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  act(() => field('e.g. Vitamin C serum, 30ml').props.onChangeText('Serum'));
  act(() => field('0.5').props.onChangeText('0.5'));
  await act(async () => { pressable('Request').props.onPress(); });

  const sent = calls.find(c => c.url.includes('/request-shipment'));
  expect(sent).toBeTruthy();
  expect(sent!.url).toContain('/api/deals/C1/request-shipment');
  const body = JSON.parse(sent!.init.body);
  expect(body.description).toBe('Serum');
  expect(body.weight).toBe(0.5);
  expect(body.pickup_address).toMatchObject({ city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India' });
  expect(calls.some(c => c.url.includes('ship-label'))).toBe(false);
  expect(alert).toHaveBeenCalledWith('Shipment requested', expect.stringContaining('our team will prepare your label'));
});

test('a mock booking is flagged and offers no label download; a real one offers it', async () => {
  route([['/api/shipment/C1', ok({
    status: 'awaiting_pickup', tracking_number: 'MOCK12345', courier_name: 'Shiprocket (mock)',
    label_url: '/mock-labels/C1.pdf', product: { description: 'Box', weight: 1 },
  })]]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  expect(tree.root.findAll(n => n.props.testID === 'mock-shipment').length).toBeGreaterThan(0);
  expect(tree.root.findAll(n => n.props.testID === 'download-label')).toHaveLength(0);
  expect(allText()).toContain('AWAITING PICKUP');
  act(() => tree.unmount());

  route([['/api/shipment/C1', ok({
    status: 'in_transit', tracking_number: '1234567', courier_name: 'Delhivery',
    label_url: 'https://cdn/label.pdf', courier_slip: 'https://cdn/slip.jpg',
    shipment_checklist: { sealed: true, correct_item: true, working: false },
    dispute: { reason: 'Box was crushed' },
  })]]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  expect(tree.root.findAll(n => n.props.testID === 'mock-shipment')).toHaveLength(0);
  expect(byTestId('download-label')).toBeTruthy();
  expect(byTestId('view-slip')).toBeTruthy();
  expect(allText()).toContain('IN TRANSIT');
  expect(allText()).toContain('Box was crushed');
});

test('saving tracking writes the website checklist keys and does not need a slip', async () => {
  route([
    ['/api/shipment/update', ok({ message: 'Shipment details updated' })],
    ['/api/shipment/C1', ok({ status: 'requested', product: { description: 'Box', weight: 1 }, shipment_checklist: { sealed: true } })],
  ]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  await act(async () => { pressable('Add tracking details').props.onPress(); });
  const field = (placeholder: string) =>
    tree.root.findAll(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  act(() => field('e.g. 1234567890').props.onChangeText('AWB99'));
  act(() => field('YYYY-MM-DD').props.onChangeText('20261120'));
  act(() => byTestId('check-working').props.onPress());
  await act(async () => { pressable('Save').props.onPress(); });

  const sent = calls.find(c => c.url.includes('/api/shipment/update'));
  expect(sent).toBeTruthy();
  const body = JSON.parse(sent!.init.body);
  expect(body).toMatchObject({
    campaign_id: 'C1',
    tracking_number: 'AWB99',
    expected_delivery: '2026-11-20',
    courier_slip: '',
    shipment_checklist: { sealed: true, correct_item: false, working: true },
  });
});

test('a failed shipment load is not shown as "Shipment requested"', async () => {
  route([['/api/shipment/C1', fail(500, 'boom')]]);
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
  expect(tree.root.findAll(n => n.props.testID === 'shipment-error').length).toBeGreaterThan(0);
  expect(allText()).toContain("Couldn't load this shipment");
  expect(byTestId('shipment-retry')).toBeTruthy();
});
