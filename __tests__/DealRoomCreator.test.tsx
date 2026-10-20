import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import DealDetails from '../src/screens/DealDetails';
import DealBooking from '../src/screens/DealBooking';
import DeliveryAddress from '../src/screens/DeliveryAddress';
import DeliveryReceipt from '../src/screens/DeliveryReceipt';
import MyDeals from '../src/screens/MyDeals';
import ActiveWork from '../src/screens/ActiveWork';
import { Alert } from '../src/components/AppAlert';
import {
  archiveDeal,
  confirmDealReceipt,
  escalateDeal,
  getBusinessReviews,
  getMyDeals,
  getShippingAddress,
  getUnreadCount,
  respondToBooking,
  respondToRevision,
  saveShippingAddress,
  uploadMedia,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  MAX_VIDEO_UPLOAD_MB: 400,
  archiveDeal: jest.fn(),
  confirmDealReceipt: jest.fn(),
  escalateDeal: jest.fn(),
  getBusinessReviews: jest.fn(),
  getMyDeals: jest.fn(),
  getShippingAddress: jest.fn(),
  getUnreadCount: jest.fn(),
  respondToBooking: jest.fn(),
  respondToRevision: jest.fn(),
  saveShippingAddress: jest.fn(),
  uploadMedia: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getUnreadCount as jest.Mock).mockResolvedValue(0);
  // Already rated, so the paid-deal rating sheet stays closed.
  (getBusinessReviews as jest.Mock).mockResolvedValue([{ campaign_id: 'camp-1', reviewer_id: 'cr1' }]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const texts = () => content(tree.toJSON());
const button = (label: string) =>
  tree.root
    .findAll((n: any) => typeof n.props?.onPress === 'function')
    .find((n: any) => n.props.accessibilityLabel === label || content(n) === label);
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`no button "${label}" in: ${texts().slice(0, 400)}`);
  await act(async () => { await target.props.onPress(); });
};
const type = async (testID: string, value: string) => {
  await act(async () => { tree.root.findByProps({ testID }).props.onChangeText(value); });
};
const render = async (element: React.ReactElement) => {
  await act(async () => { tree = Renderer.create(element); });
};

const base = (over: Record<string, any> = {}) => ({
  deal_id: 'DEAL-1',
  current_state: 'Received - Content in Progress',
  campaign: { id: 'camp-1', title: 'Launch', business_id: 'b1' },
  brand: { id: 'b1', name: 'Acme' },
  creator: { id: 'cr1', name: 'Arushi' },
  ...over,
});
const booking = (status: string, extra: Record<string, any> = {}) =>
  base({ campaign: { id: 'camp-1', title: 'Launch', booking_status: status, budget_max: 4000, video_count: 2, ...extra } });

describe('booking card (POST /bookings/{id}/respond)', () => {
  test('accept sends the campaign id and action, then refreshes', async () => {
    (respondToBooking as jest.Mock).mockResolvedValue({ booking_status: 'accepted' });
    const onDone = jest.fn();
    await render(<DealBooking deal={booking('pending_creator')} token="t" onDone={onDone} />);
    expect(texts()).toContain('wants to book you');
    await press('Accept booking');
    expect(respondToBooking).toHaveBeenCalledWith('t', 'camp-1', { action: 'accept' });
    expect(onDone).toHaveBeenCalled();
  });

  test('propose a price is validated, then sent as revise with amount and message', async () => {
    (respondToBooking as jest.Mock).mockResolvedValue({});
    await render(<DealBooking deal={booking('pending_creator')} token="t" onDone={() => {}} />);
    await press('Propose another price');
    await type('booking-price-input', '');
    await press('Propose ₹0');
    expect(respondToBooking).not.toHaveBeenCalled();
    expect(texts()).toContain('Enter the price you want');
    await type('booking-price-input', '5000');
    await press('Propose ₹5,000');
    expect(respondToBooking).toHaveBeenCalledWith('t', 'camp-1', { action: 'revise', amount: 5000, message: '' });
  });

  test('decline sends the reason; a failed call keeps the form and shows the error', async () => {
    (respondToBooking as jest.Mock).mockRejectedValue(new Error("Can't reach the server."));
    const onDone = jest.fn();
    await render(<DealBooking deal={booking('pending_creator')} token="t" onDone={onDone} />);
    await press('Decline booking');
    await press('Confirm decline');
    expect(respondToBooking).toHaveBeenCalledWith('t', 'camp-1', { action: 'decline', message: '' });
    expect(onDone).not.toHaveBeenCalled();
    expect(texts()).toContain("Can't reach the server.");
    expect(texts()).toContain('Confirm decline');
  });

  test('counter sent and accepted-awaiting-brief are read-only waits', async () => {
    await render(<DealBooking deal={booking('price_revision', { proposed_amount: 6000 })} token="t" onDone={() => {}} />);
    expect(texts()).toContain('Waiting for the brand to accept or cancel');
    expect(button('Accept booking')).toBeUndefined();
    await act(async () => { tree.unmount(); });
    await render(<DealBooking deal={booking('accepted')} token="t" onDone={() => {}} />);
    expect(texts()).toContain('Waiting for the brand to send the brief');
    await act(async () => { tree.unmount(); });
    await render(<DealBooking deal={booking('accepted', { brief_sent: true })} token="t" onDone={() => {}} />);
    expect(texts()).toBe('');
  });
});

describe('deal room actions', () => {
  beforeEach(() => {
    (getMyDeals as jest.Mock).mockResolvedValue([]);
  });

  test('a creator is never offered "Raise a dispute"', async () => {
    await render(<DealDetails deal={base()} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(texts()).not.toContain('Raise a dispute');
    expect(texts()).not.toContain('Escalate to admin');
    expect(texts()).toContain('Get help');
  });

  test('escalate appears only after the revision was flagged and calls /escalate', async () => {
    (escalateDeal as jest.Mock).mockResolvedValue({});
    const flagged = base({
      current_state: 'Revision Requested',
      revision_tracker: { latest_feedback: 'Re-shoot', creator_response: 'scope_creep' },
    });
    await render(<DealDetails deal={flagged} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(texts()).toContain('go beyond the brief');
    await press('Escalate to admin. Raise it with the brand first. Escalate if you cannot resolve it together');
    await act(async () => { tree.root.findByProps({ placeholder: 'Type here…' }).props.onChangeText('We cannot agree'); });
    await act(async () => { await tree.root.findAllByType(TouchableOpacity).find((n: any) => content(n) === 'Send')!.props.onPress(); });
    expect(escalateDeal).toHaveBeenCalledWith('t', 'DEAL-1', 'We cannot agree');
  });

  test('accepting a revision sends the whole checklist; the checklist shows tags', async () => {
    (respondToRevision as jest.Mock).mockResolvedValue({});
    const revising = base({
      current_state: 'Revision Requested',
      revision_tracker: { requested_changes: ['[must-fix @ 0:04] Re-shoot the intro', 'Softer music'], revision_limit: 2, revision_count_used: 1 },
    });
    await render(<DealDetails deal={revising} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(texts()).toContain('Requested changes · 2');
    expect(texts()).toContain('Must-fix');
    expect(texts()).toContain('Revision 1 of 2 used');
    await press('Accept & revise');
    expect(respondToRevision).toHaveBeenCalledWith('t', 'DEAL-1', 'accepted', [
      '[must-fix @ 0:04] Re-shoot the intro',
      'Softer music',
    ]);
  });

  test('Mark received follows can_mark_received, not the old requires_shipment guess', async () => {
    const shipped = base({
      current_state: 'Delivered - Awaiting Receipt Confirmation',
      campaign: { id: 'camp-1', title: 'Launch', requires_shipment: true },
      shipment: { required: true, courier_status: 'delivered', tracking_id: 'T1', creator_address_confirmed: true },
      can_mark_received: true,
    });
    (getShippingAddress as jest.Mock).mockResolvedValue({ requires_shipment: true, my_role: 'creator', creator_confirmed: true, brand_confirmed: true, both_ready: true, address: null, account_address: null, account_missing: [], shipment_status: 'delivered' });
    await render(<DealDetails deal={shipped} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(button('Mark Received')).toBeTruthy();
    expect(texts()).toContain('Mark received');
    expect(texts()).toContain('Tracking ID');
    expect(texts()).toContain('T1');
    await act(async () => { tree.unmount(); });
    await render(<DealDetails deal={{ ...shipped, can_mark_received: false }} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(button('Mark Received')).toBeUndefined();
    expect(texts()).not.toContain('Mark received');
  });

  test('archive stays on the deal when the server refuses', async () => {
    (archiveDeal as jest.Mock).mockRejectedValue(new Error('nope'));
    const onArchived = jest.fn();
    const paid = base({ current_state: 'Paid - Complete' });
    (getMyDeals as jest.Mock).mockResolvedValue([paid]);
    await render(<DealDetails deal={paid} token="t" onBack={() => {}} onChat={() => {}} onArchived={onArchived} />);
    const alert = Alert.alert as jest.Mock;
    await press('Archive this deal. Hide it from your active list');
    const confirm = alert.mock.calls.find(c => c[0] === 'Archive this deal')[2].find((b: any) => b.text === 'Archive');
    await act(async () => { await confirm.onPress(); });
    expect(archiveDeal).toHaveBeenCalledWith('t', 'DEAL-1');
    expect(onArchived).not.toHaveBeenCalled();
  });

  test('"Unpaid - Incomplete" is not archivable', async () => {
    await render(<DealDetails deal={base({ current_state: 'Unpaid - Incomplete' })} token="t" onBack={() => {}} onChat={() => {}} />);
    expect(texts()).not.toContain('Archive this deal');
  });

  test('opens on the requested tab', async () => {
    const revising = base({ current_state: 'Revision Requested', revision_tracker: { latest_feedback: 'Re-shoot' } });
    await render(<DealDetails deal={revising} token="t" onBack={() => {}} onChat={() => {}} initialTab="Deliverables" />);
    expect(texts()).toContain('Overall Progress');
  });
});

describe('delivery address card', () => {
  const status = (over: Record<string, any> = {}) => ({
    requires_shipment: true, my_role: 'creator', creator_confirmed: false, brand_confirmed: false, both_ready: false,
    address: null, account_address: null, account_missing: [], shipment_status: null, ...over,
  });

  test('stays hidden when no product ships, shows an error with retry when the lookup fails', async () => {
    (getShippingAddress as jest.Mock).mockResolvedValue(status({ requires_shipment: false }));
    await render(<DeliveryAddress token="t" campaignId="camp-1" />);
    expect(texts()).toBe('');
    await act(async () => { tree.unmount(); });
    (getShippingAddress as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await render(<DeliveryAddress token="t" campaignId="camp-1" />);
    expect(texts()).toContain('offline');
    (getShippingAddress as jest.Mock).mockResolvedValue(status());
    await press('Retry');
    expect(texts()).toContain('Confirm your delivery address');
  });

  test('the form posts the address with the campaign id once it is valid', async () => {
    (getShippingAddress as jest.Mock).mockResolvedValue(status());
    (saveShippingAddress as jest.Mock).mockResolvedValue({ both_ready: false });
    const onSaved = jest.fn();
    await render(<DeliveryAddress token="t" campaignId="camp-1" onSaved={onSaved} />);
    // Fill by order: name, phone, line1, line2, city, state, pincode, country.
    const boxes = tree.root.findAll((n: any) => typeof n.props?.onChangeText === 'function' && n.props?.style && n.type === 'TextInput');
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    await act(async () => { boxes[0].props.onChangeText('Arushi S'); });
    await act(async () => { boxes[1].props.onChangeText('98765 43210'); });
    await act(async () => { boxes[2].props.onChangeText('12 MG Road'); });
    await act(async () => { boxes[4].props.onChangeText('Pune'); });
    await act(async () => { boxes[5].props.onChangeText('MH'); });
    await act(async () => { boxes[6].props.onChangeText('41100'); });
    // 5-digit pincode: the save button is disabled and nothing is sent.
    await press('Confirm delivery address');
    expect(saveShippingAddress).not.toHaveBeenCalled();
    await act(async () => { boxes[6].props.onChangeText('411001'); });
    await press('Confirm delivery address');
    expect(saveShippingAddress).toHaveBeenCalledWith('t', 'camp-1', expect.objectContaining({
      full_name: 'Arushi S', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001',
    }));
    expect(onSaved).toHaveBeenCalled();
  });
});

describe('mark received sheet (POST /deals/{id}/receipt)', () => {
  test('needs a video; a damage report sends items_damaged and the description', async () => {
    (launchImageLibrary as jest.Mock).mockResolvedValue({ assets: [{ uri: 'file:///u.mp4', type: 'video/mp4', fileName: 'u.mp4' }] });
    (uploadMedia as jest.Mock).mockResolvedValue('https://cdn.example.com/u.mp4');
    (confirmDealReceipt as jest.Mock).mockResolvedValue({});
    const onDone = jest.fn();
    await render(<DeliveryReceipt visible token="t" dealId="DEAL-1" canMark onClose={() => {}} onDone={onDone} />);
    await press('Mark received');
    expect(confirmDealReceipt).not.toHaveBeenCalled();
    expect(texts()).toContain('Upload an unboxing video');
    await press('Choose unboxing video');
    expect(launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'video' }));
    await act(async () => { await tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityRole === 'checkbox')!.props.onPress(); });
    await press('Mark received');
    expect(texts()).toContain('Describe what is damaged');
    await act(async () => { tree.root.findAll((n: any) => n.type === 'TextInput')[0].props.onChangeText('Box crushed'); });
    await press('Mark received');
    expect(confirmDealReceipt).toHaveBeenCalledWith('t', 'DEAL-1', 'https://cdn.example.com/u.mp4', {
      items_damaged: true,
      damage_report: 'Box crushed',
    });
    expect(onDone).toHaveBeenCalled();
  });
});

describe('My Deals hub', () => {
  const pending = booking('pending_creator');
  const countered = { ...booking('price_revision', { proposed_amount: 6000 }), deal_id: 'DEAL-2', campaign: { id: 'camp-2', title: 'Countered', booking_status: 'price_revision', proposed_amount: 6000 } };
  const live = base({ deal_id: 'DEAL-3', campaign: { id: 'camp-3', title: 'Live job' }, escrow: { held_amount: 2500 } });
  const declined = base({ deal_id: 'DEAL-4', campaign: { id: 'camp-4', title: 'Declined one', booking_status: 'declined' } });
  const all = [pending, countered, live, declined];

  test('Active lists live deals only (no declined, no pending bookings) with escrow, counts on the tabs', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue(all);
    await render(<MyDeals token="t" onBack={() => {}} />);
    expect(texts()).toContain('Live job');
    expect(texts()).not.toContain('Declined one');
    expect(texts()).not.toContain('wants to book');
    expect(texts()).toContain('Active Deals (1)');
    expect(texts()).toContain('Requested Deals (2)');
    expect(texts()).toContain('₹ 2,500');
  });

  test('initialTab=requested shows the booking requests with their badges', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue(all);
    await render(<MyDeals token="t" onBack={() => {}} initialTab="requested" />);
    expect(texts()).toContain('Awaiting your response');
    expect(texts()).toContain('Counter sent - awaiting brand');
    expect(texts()).toContain('Accept · decline · counter');
    expect(texts()).not.toContain('Live job');
  });

  test('focusDealId opens the deal by campaign.id (the payload has no campaign_id)', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue(all);
    await render(<MyDeals token="t" onBack={() => {}} focusDealId="camp-3" />);
    expect(texts()).toContain('Deal Details');
    expect(texts()).toContain('Acme');
  });

  test('a failed load shows the message and a Retry that loads the list', async () => {
    (getMyDeals as jest.Mock).mockRejectedValueOnce(new Error("Can't reach the server."));
    await render(<MyDeals token="t" onBack={() => {}} />);
    expect(texts()).toContain("Can't reach the server.");
    (getMyDeals as jest.Mock).mockResolvedValue([live]);
    await press('Retry');
    expect(texts()).toContain('Live job');
  });

  test('empty Active offers Browse Campaigns when wired', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue([]);
    const onBrowse = jest.fn();
    await render(<MyDeals token="t" onBack={() => {}} onBrowse={onBrowse} />);
    expect(texts()).toContain('No active deals yet');
    await press('Browse Campaigns');
    expect(onBrowse).toHaveBeenCalled();
  });
});

describe('Active Work cards', () => {
  test('revision cards link to what the brand asked; requests show the payout and a respond button', async () => {
    (getMyDeals as jest.Mock).mockResolvedValue([
      base({ deal_id: 'R1', current_state: 'Revision Requested', brand: { id: 'b1', name: 'Acme', logo_url: '/logo.png' } }),
      booking('pending_creator'),
    ]);
    await render(<ActiveWork token="t" />);
    // The pending booking auto-switches to Requests.
    expect(texts()).toContain('Respond to request');
    expect(texts()).toContain('₹ 4,000');
    expect(button('Respond to request')).toBeTruthy();
    await press('Filter: Requests');
    await press('Active1');
    expect(texts()).toContain('Revision Requested');
    await press('See what they asked for');
    expect(texts()).toContain('Overall Progress');
  });
});
