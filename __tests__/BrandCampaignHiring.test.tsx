import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandCampaignDetail from '../src/screens/BrandCampaignDetail';
import RateCreatorSheet from '../src/components/RateCreatorSheet';
import { Alert } from '../src/components/AppAlert';
import {
  decideBookingPrice, getBusinessDeals, getCampaign, getCampaignWork, getCreatorReviews, getShortlist,
  inviteShortlistedCreator, postReview, requestNewShortlist, selectCreator, sendBookingBrief, sendDealMessage,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  getCampaign: jest.fn(), getBusinessDeals: jest.fn(), getCampaignWork: jest.fn(),
  getCreatorReviews: jest.fn(), getShortlist: jest.fn(), inviteShortlistedCreator: jest.fn(),
  requestNewShortlist: jest.fn(), decideBookingPrice: jest.fn(), sendBookingBrief: jest.fn(),
  selectCreator: jest.fn(), postReview: jest.fn(), sendDealMessage: jest.fn(),
  approveWork: jest.fn(), declineBid: jest.fn(), finishHiring: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.clearAllMocks();
  (getBusinessDeals as jest.Mock).mockResolvedValue([]);
  (getCampaignWork as jest.Mock).mockResolvedValue([]);
  (getCreatorReviews as jest.Mock).mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const button = (label: string) =>
  tree.root.findAllByType(TouchableOpacity).find(
    (node: any) => node.props.accessibilityLabel === label || content(node) === label,
  );
const tap = async (label: string) => {
  const target = button(label);
  expect(target).toBeTruthy();
  await act(async () => { await target.props.onPress(); });
};

async function render(detail: any, props: any = {}) {
  (getCampaign as jest.Mock).mockResolvedValue(detail);
  await act(async () => {
    tree = Renderer.create(
      <BrandCampaignDetail token="t" campaignId="c1" onBack={() => {}} onNavigate={() => {}} {...props} />,
    );
  });
}

const two = {
  id: 'c1', title: 'Launch', status: 'in_progress', creators_wanted: 2, business_id: 'b1',
  selected_creators: ['u1', 'u2'],
  bids: [
    { creator_id: 'u1', creator_name: 'Arushi', amount: 3000 },
    { creator_id: 'u2', creator_name: 'Meera', amount: 4000 },
  ],
};
const deal = (id: string, name: string, state: string, extra: any = {}) => ({
  deal_id: `d-${id}`, campaign: { id: 'c1' }, creator: { id, name }, current_state: state, ...extra,
});

test('a notification link brings the named creator forward: their progress and only their work', async () => {
  (getBusinessDeals as jest.Mock).mockResolvedValue([
    deal('u1', 'Arushi', 'Accepted - Awaiting Shipment'),
    deal('u2', 'Meera', 'Content Submitted - Awaiting Review'),
  ]);
  (getCampaignWork as jest.Mock).mockImplementation(async (_t: string, _c: string, creatorId?: string) => [
    { id: `w-${creatorId}`, creator_id: creatorId, creator_name: creatorId === 'u1' ? 'Arushi' : 'Meera', status: 'submitted', preview_url: 'https://cdn.example.com/a.mp4' },
  ]);
  await render(two, { focusCreatorId: 'u2' });
  expect(content(tree.toJSON())).toContain('Campaign Progress - Meera');
  await tap('Work Review (1)');
  const text = content(tree.toJSON());
  expect(text).toContain('Meera');
  expect(button('Show Arushi')).toBeTruthy();
  // switching to Arushi swaps the panels
  await tap('Show Arushi');
  expect(content(tree.toJSON())).toContain('Arushi');
});

test('a focus on someone who is not hired is ignored', async () => {
  (getBusinessDeals as jest.Mock).mockResolvedValue([deal('u1', 'Arushi', 'Accepted - Awaiting Shipment')]);
  await render(two, { focusCreatorId: 'stranger' });
  expect(content(tree.toJSON())).toContain('Campaign Progress - Arushi');
});

test('progress comes from the deal, not the campaign status', async () => {
  (getBusinessDeals as jest.Mock).mockResolvedValue([
    deal('u1', 'Arushi', 'Shipped — In Transit', { campaign: { id: 'c1' } }),
  ]);
  await render({ ...two, selected_creators: ['u1'], creators_wanted: 1, status: 'active' });
  const text = content(tree.toJSON());
  // deal is "Shipped": Brief Sent done, Product Shipped done, Product Received is the active step
  expect(text).toContain('Product Received');
  expect(text).toContain('In progress');
});

test('hiring words the escrow and slots, and only mentions shipping for a physical brief', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, slots_left: 0, fully_staffed: true });
  await render({ id: 'c1', title: 'Launch', status: 'active', creators_wanted: 1, requires_shipment: false,
    bids: [{ creator_id: 'u1', creator_name: 'Arushi', amount: 3000, estimated_delivery_days: 4, raw_amount: 1000, edited_amount: 2000 }] });
  expect(content(tree.toJSON())).toContain('Delivery in 4 days');
  expect(content(tree.toJSON())).toContain('Raw Rs. 1,000 + Edited Rs. 2,000');
  await tap('Accept & Hire');
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Hire').onPress(); });
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Hired')!;
  expect(done[1]).toBe('Arushi hired! Rs. 3,000 held in escrow. This brief is now fully staffed.');
});

test('a hire with a short wallet prompts to add funds and opens the recharge', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, amount_charged: 3300, funded: false, slots_left: 0 });
  const go = jest.fn();
  await render({ id: 'c1', title: 'Launch', status: 'active', creators_wanted: 1, requires_shipment: true,
    bids: [{ creator_id: 'u1', creator_name: 'Arushi', amount: 3000 }] }, { onNavigate: go });
  await tap('Accept & Hire');
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Hire').onPress(); });
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Hired')!;
  expect(done[1]).toBe('Arushi is hired, but your wallet is short. Add Rs. 3,300 to fund the escrow so work can start.');
  done[2].find((b: any) => b.text === 'Add funds').onPress();
  expect(go).toHaveBeenCalledWith('/dashboard/business/wallet?view=recharge');
});

test('a physical brief reminds the brand to ship', async () => {
  (selectCreator as jest.Mock).mockResolvedValue({ amount: 3000, slots_left: 0 });
  await render({ id: 'c1', title: 'Launch', status: 'active', creators_wanted: 1, requires_shipment: true,
    bids: [{ creator_id: 'u1', creator_name: 'Arushi', amount: 3000 }] });
  await tap('Accept & Hire');
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Hire').onPress(); });
  expect((Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Hired')![1]).toContain('Ship the product');
});

describe('direct booking card', () => {
  const booked = (extra: any) => ({
    id: 'c1', title: 'Launch', status: 'in_progress', creators_wanted: 1, selected_creators: ['u1'],
    budget_max: 5000, amount_paid: 6000, ...extra,
  });

  test('waiting on the creator', async () => {
    await render(booked({ booking_status: 'pending_creator' }));
    expect(content(tree.toJSON())).toContain('Rs. 6,000 is held in escrow');
  });

  test('a counter-offer can be accepted and the wallet change is reported', async () => {
    (decideBookingPrice as jest.Mock).mockResolvedValue({ difference_charged: 1200 });
    await render(booked({ booking_status: 'price_revision', proposed_amount: 6000, proposed_message: 'Needs props', fee_percent: 20 }));
    const text = content(tree.toJSON());
    expect(text).toContain("They're asking Rs. 6,000");
    expect(text).toContain('Extra to pay (incl. fee): Rs. 1,200');
    await tap('Accept new price');
    expect(decideBookingPrice).toHaveBeenCalledWith('t', 'c1', 'accept');
    expect((Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'New price accepted')![1]).toContain('Rs. 1,200 more was charged');
  });

  test('rejecting asks first and refunds', async () => {
    (decideBookingPrice as jest.Mock).mockResolvedValue({});
    await render(booked({ booking_status: 'price_revision', proposed_amount: 6000 }));
    await tap('Cancel and refund');
    expect(decideBookingPrice).not.toHaveBeenCalled();
    const confirm = (Alert.alert as jest.Mock).mock.calls[0];
    await act(async () => { await confirm[2].find((b: any) => b.style === 'destructive').onPress(); });
    expect(decideBookingPrice).toHaveBeenCalledWith('t', 'c1', 'reject');
  });

  test('once accepted the brand writes and sends the brief', async () => {
    (sendBookingBrief as jest.Mock).mockResolvedValue({ brief_sent: true });
    await render(booked({ booking_status: 'accepted', brief_draft: { brief_text: 'Show the product' } }));
    await tap('Write the brief');
    const { TextInput } = require('react-native');
    const input = tree.root.findAllByType(TextInput).find((n: any) => n.props.value === 'Show the product');
    expect(input).toBeTruthy();
    await tap('Send brief');
    expect(sendBookingBrief).toHaveBeenCalledWith('t', 'c1', 'Show the product');
  });

  test('nothing shows once the brief is sent or the booking was declined', async () => {
    await render(booked({ booking_status: 'accepted', brief_sent: true }));
    expect(content(tree.toJSON())).not.toContain('Send your brief');
    await act(async () => { tree.unmount(); });
    tree = null;
    await render(booked({ booking_status: 'declined' }));
    expect(content(tree.toJSON())).not.toContain('Booking sent');
  });
});

describe('ops shortlist', () => {
  const brief = { id: 'c1', title: 'Launch', status: 'active', creators_wanted: 1, match_status: 'shortlisted', bids: [] };
  const list = {
    match_status: 'shortlisted', shortlist_request_count: 1,
    candidates: [{ creator_id: 'u9', status: 'pending', ops_note: 'Great hooks', creator: { public_creator_id: 'CR-9', primary_category: 'Beauty', city_tier: 'Tier 1', languages: ['Hindi', 'English'] } }],
  };

  test('candidates are listed and one can be invited', async () => {
    (getShortlist as jest.Mock).mockResolvedValue(list);
    (inviteShortlistedCreator as jest.Mock).mockResolvedValue({});
    const onOpenThread = jest.fn();
    await render(brief, { onOpenThread });
    const text = content(tree.toJSON());
    expect(text).toContain('Curated shortlist');
    expect(text).toContain('CR-9');
    expect(text).toContain('Great hooks');
    await tap('Invite');
    const { TextInput } = require('react-native');
    await act(async () => { tree.root.findAllByType(TextInput).find((n: any) => /invitation/.test(n.props.placeholder)).props.onChangeText('Love your work'); });
    await tap('Send invitation');
    expect(inviteShortlistedCreator).toHaveBeenCalledWith('t', 'c1', 'u9', { message: 'Love your work' });
    const sent = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Invitation sent')!;
    await act(async () => { sent[2][0].onPress(); });
    expect(onOpenThread).toHaveBeenCalledWith('u9', 'CR-9');
  });

  test('not the right fit requests a new shortlist', async () => {
    (getShortlist as jest.Mock).mockResolvedValue(list);
    (requestNewShortlist as jest.Mock).mockResolvedValue({});
    await render(brief);
    await tap('Not the right fit? Request a new shortlist');
    expect(requestNewShortlist).toHaveBeenCalledWith('t', 'c1');
  });

  test('before ops answers, the brand is told it is being curated; once fulfilled it says invited', async () => {
    (getShortlist as jest.Mock).mockResolvedValue({ match_status: 'queued', shortlist_request_count: 0, candidates: [] });
    await render({ ...brief, match_status: 'queued' });
    expect(content(tree.toJSON())).toContain('Our team is curating creator matches');
    await act(async () => { tree.unmount(); });
    tree = null;
    (getShortlist as jest.Mock).mockResolvedValue(list);
    await render({ ...brief, match_status: 'fulfilled' });
    expect(content(tree.toJSON())).toContain("You've invited a creator from this shortlist");
  });
});

test('revision card lists the changes, deadline and the creator\'s answer from the deal', async () => {
  (getBusinessDeals as jest.Mock).mockResolvedValue([
    deal('u1', 'Arushi', 'Revision Requested', {
      revision_tracker: {
        revision_count_used: 1, revision_limit: 2, creator_response: 'accepted', new_deadline_at: '2026-10-25T10:00:00Z',
        requested_changes: ['[must-fix @ 0:04] Brighter intro', '[preference] Note: Keep it short'],
      },
    }),
  ]);
  (getCampaignWork as jest.Mock).mockResolvedValue([
    { id: 'w1', creator_id: 'u1', creator_name: 'Arushi', status: 'revision_requested', preview_url: 'https://cdn.example.com/a.mp4' },
  ]);
  await render({ ...two, selected_creators: ['u1'], creators_wanted: 1 });
  const text = content(tree.toJSON());
  expect(text).toContain('Revision requested');
  expect(text).toContain('1 of 2 revisions used');
  expect(text).toContain('Brighter intro');
  expect(text).toContain('Note: Keep it short');
  expect(text).toContain('Creator accepted the revision and is reworking the content.');
  expect(text).not.toContain('Not scheduled');
});

describe('review the creator after completion', () => {
  const done = { ...two, selected_creators: ['u1'], creators_wanted: 1, status: 'completed' };
  const approvedWork = [{ id: 'w1', creator_id: 'u1', creator_name: 'Arushi', status: 'approved', preview_url: 'https://cdn.example.com/a.mp4', work_files: ['https://cdn.example.com/a.mp4'] }];

  test('Add a review posts to /reviews with the campaign and creator', async () => {
    (getCampaignWork as jest.Mock).mockResolvedValue(approvedWork);
    (postReview as jest.Mock).mockResolvedValue({});
    await render(done);
    await tap('Work Review (1)');
    await tap('Add a review');
    const sheet = tree.root.findByType(RateCreatorSheet);
    expect(sheet.props.visible).toBe(true);
    await act(async () => { await sheet.props.onSubmit(5, 'Brilliant'); });
    expect(postReview).toHaveBeenCalledWith('t', { campaign_id: 'c1', creator_id: 'u1', rating: 5, review: 'Brilliant' });
    expect(content(tree.toJSON())).toContain('You rated 5 stars');
  });

  test('a creator already rated shows the rating instead of the button', async () => {
    (getCampaignWork as jest.Mock).mockResolvedValue(approvedWork);
    (getCreatorReviews as jest.Mock).mockResolvedValue([{ campaign_id: 'c1', business_id: 'b1', rating: 4 }]);
    await render(done);
    await tap('Work Review (1)');
    expect(button('Add a review')).toBeUndefined();
    expect(content(tree.toJSON())).toContain('You rated 4 stars');
  });

  test('work that is not approved offers no review', async () => {
    (getCampaignWork as jest.Mock).mockResolvedValue([{ ...approvedWork[0], status: 'submitted' }]);
    await render({ ...done, status: 'work_submitted' });
    await tap('Work Review (1)');
    expect(button('Add a review')).toBeUndefined();
  });
});

test('deal chat: shared thread is shown and a message goes to the deal', async () => {
  (getBusinessDeals as jest.Mock).mockResolvedValue([
    deal('u1', 'Arushi', 'Content Submitted - Awaiting Review', {
      chat_summary: { messages: [
        { id: 'm1', sender_type: 'system', message: 'Content submitted' },
        { id: 'm2', sender_type: 'creator', sender_name: 'Arushi', message: 'Do you want a vertical cut?' },
      ] },
    }),
  ]);
  (getCampaignWork as jest.Mock).mockResolvedValue([{ id: 'w1', creator_id: 'u1', creator_name: 'Arushi', status: 'submitted', preview_url: 'https://cdn.example.com/a.mp4' }]);
  (sendDealMessage as jest.Mock).mockResolvedValue({});
  await render({ ...two, selected_creators: ['u1'], creators_wanted: 1 });
  await tap('Work Review (1)');
  expect(content(tree.toJSON())).toContain('Do you want a vertical cut?');
  const { TextInput } = require('react-native');
  await act(async () => { tree.root.findAllByType(TextInput).find((n: any) => n.props.placeholder === 'Type a message...').props.onChangeText('Yes please'); });
  await tap('Send message');
  expect(sendDealMessage).toHaveBeenCalledWith('t', 'd-u1', 'Yes please');
});

test('a campaign that cannot be loaded says why and offers Retry', async () => {
  const offline: any = new Error('x');
  offline.name = 'NetworkError';
  (getCampaign as jest.Mock).mockRejectedValueOnce(offline);
  await act(async () => {
    tree = Renderer.create(<BrandCampaignDetail token="t" campaignId="c1" onBack={() => {}} onNavigate={() => {}} />);
  });
  expect(content(tree.toJSON())).toContain("You're offline");
  (getCampaign as jest.Mock).mockResolvedValue(two);
  await tap('Retry loading this campaign');
  expect(content(tree.toJSON())).toContain('Launch');
});
