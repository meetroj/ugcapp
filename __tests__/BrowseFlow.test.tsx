/**
 * Browse Campaigns end to end: what is listed, search / filter sheet /
 * pagination, the already-bid state, the profile + KYC + fee gates before the
 * bid form, the form's checks, and the load-error / offline states.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrowseCampaigns from '../src/screens/BrowseCampaigns';
import { Alert } from '../src/components/AppAlert';
import { getBidReadiness, getCampaigns, getMe, getMyBids, placeBid } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  getCampaigns: jest.fn(),
  getMe: jest.fn(),
  placeBid: jest.fn(),
  getMyBids: jest.fn(),
  getBidReadiness: jest.fn(),
  getSavedBriefs: jest.fn().mockResolvedValue([]),
  getUnreadCount: jest.fn().mockResolvedValue(0),
  addSavedBrief: jest.fn().mockResolvedValue(true),
  removeSavedBrief: jest.fn().mockResolvedValue(false),
}));

const session: any = { user_id: 'creator', role: 'creator', token: 't', profile_completed: true };
let tree: any;
const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
// A screen that returns a fragment serialises to an array of roots.
const all = () => ([] as any[]).concat(tree.toJSON()).map(text).join('');
const touch = (label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((n: any) => text(n) === label || n.props.accessibilityLabel === label);
const press = async (label: string) => {
  const node = touch(label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => { await node.props.onPress({ stopPropagation: () => {} }); });
};
const field = (placeholder: string) =>
  tree.root.findAll(
    (n: any) => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function',
  )[0];
const type = async (placeholder: string, value: string) => {
  await act(async () => { field(placeholder).props.onChangeText(value); });
};
const cards = () =>
  tree.root
    .findAllByType(TouchableOpacity)
    .filter((n: any) => /: /.test(n.props.accessibilityLabel || '') && n.props.activeOpacity === 0.85);

const day = 86400000;
const make = (i: number, extra: Record<string, any> = {}) => ({
  id: `c${i}`,
  status: 'active',
  title: `Brief ${i}`,
  brand_name: `Brand${i}`,
  budget_max: 1000 + i * 100,
  ...extra,
});

async function mount(props: Record<string, any> = {}) {
  await act(async () => {
    tree = Renderer.create(<BrowseCampaigns token="token" session={session} {...props} />);
  });
}
async function openFirstAndBid() {
  await act(async () => { cards()[0].props.onPress(); });
  await press('Submit Your Bid');
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCampaigns as jest.Mock).mockResolvedValue([make(1, { budget_max: 1500 })]);
  (getMyBids as jest.Mock).mockResolvedValue([]);
  (getBidReadiness as jest.Mock).mockResolvedValue({ can_bid: true, missing: [], commission_percent: 15 });
  (getMe as jest.Mock).mockResolvedValue({ profile_completed: true, kyc: { status: 'verified' } });
  (placeBid as jest.Mock).mockResolvedValue({});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.restoreAllMocks();
});

describe('the list', () => {
  test('a brief the creator is already hired on (even via the singular field) is not offered', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([
      make(1),
      make(2, { visibility: 'private', selected_creator: 'creator' }),
      make(3, { creators_wanted: 2, selected_creators: ['creator'] }),
      make(4, { creators_wanted: 1, selected_creators: ['someone'] }),
    ]);
    await mount();
    expect(cards().map((c: any) => c.props.accessibilityLabel)).toEqual(['Brand1: Brief 1']);
  });

  test('8 at a time with Load more briefs', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue(Array.from({ length: 10 }, (_, i) => make(i + 1)));
    await mount();
    expect(cards()).toHaveLength(8);
    await press('Load more briefs');
    expect(cards()).toHaveLength(10);
    expect(touch('Load more briefs')).toBeUndefined();
  });

  test('search narrows the list; nothing matching offers a way back', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([make(1, { title: 'Serum' }), make(2, { title: 'Shoes' })]);
    await mount();
    await type('Search campaigns, brands, categories', 'shoe');
    expect(cards()).toHaveLength(1);
    await type('Search campaigns, brands, categories', 'zzz');
    expect(all()).toContain('No campaigns found');
    await press('Clear search and filters');
    expect(cards()).toHaveLength(2);
  });

  test('?q= pre-fills the search box', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([make(1, { title: 'Serum' }), make(2, { title: 'Shoes' })]);
    await mount({ initialQuery: 'serum' });
    expect(cards()).toHaveLength(1);
  });

  test('the filter sheet applies budget and delivery, and Clear filters resets them', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([
      make(1, { budget_max: 1500, final_delivery_by: new Date(Date.now() + 2 * day).toISOString() }),
      make(2, { budget_max: 8000, final_delivery_by: new Date(Date.now() + 9 * day).toISOString() }),
      make(3, { budget_max: 8000 }),
    ]);
    await mount();
    await press('Filters');
    await press('Budget: ₹5,000 - ₹10,000');
    expect(cards()).toHaveLength(2);
    await press('Delivery: More than 7 days');
    // Brief 3 states no deadline, so a delivery filter never hides it.
    expect(cards()).toHaveLength(2);
    expect(all()).toContain('Show 2 campaigns');
    await press('Show results');
    expect(all()).toContain('Filters (2)');
    await press('Clear filters');
    expect(cards()).toHaveLength(3);
    expect(all()).toContain('Filters');
    expect(all()).not.toContain('Filters (');
  });

  test('a failed load says offline with a Retry that works', async () => {
    const offline = Object.assign(new Error('x'), { name: 'NetworkError' });
    (getCampaigns as jest.Mock).mockRejectedValueOnce(offline);
    await mount();
    expect(all()).toContain("You're offline. Check your connection and try again.");
    expect(cards()).toHaveLength(0);
    await press('Retry');
    expect(cards()).toHaveLength(1);
  });

  test('?open=<id> opens that brief', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([make(1), make(2, { title: 'Special' })]);
    await mount({ openId: 'c2' });
    expect(all()).toContain('Campaign Details');
    expect(all()).toContain('Brand2');
  });
});

describe('already bid', () => {
  test('the card and the brief show the bid, and there is no Submit button', async () => {
    (getMyBids as jest.Mock).mockResolvedValue([
      { campaign: { id: 'c1' }, my_bid: { amount: 1200, estimated_delivery_days: 4, proposal: 'My pitch' }, bid_status: 'pending' },
    ]);
    await mount();
    expect(all()).toContain('Bid submitted · ₹1,200 · Pending');
    await act(async () => { cards()[0].props.onPress(); });
    expect(all()).toContain('Bid Already Submitted');
    expect(all()).toContain('4 days');
    expect(all()).toContain('My pitch');
    expect(touch('Submit Your Bid')).toBeUndefined();
  });

  test('a bid found on the campaign itself counts too', async () => {
    (getCampaigns as jest.Mock).mockResolvedValue([make(1, { bids: [{ creator_id: 'creator', amount: 900, status: 'pending' }] })]);
    await mount();
    expect(all()).toContain('Bid submitted');
  });
});

describe('gates before the form', () => {
  test('an incomplete profile lists what is missing and offers Complete profile', async () => {
    (getBidReadiness as jest.Mock).mockResolvedValue({
      can_bid: false,
      missing: ['a profile picture', 'an intro video'],
      commission_percent: 20,
    });
    const navigate = jest.fn();
    await mount({ onNavigate: navigate });
    await openFirstAndBid();
    expect(all()).toContain('Complete your profile to bid');
    expect(all()).toContain('• a profile picture');
    expect(all()).toContain('• an intro video');
    expect(touch('Continue to bid')).toBeUndefined();
    await press('Complete profile');
    expect(navigate).toHaveBeenCalledWith('/settings?tab=profile');
  });

  test('an unverified KYC explains itself and offers the KYC page', async () => {
    (getMe as jest.Mock).mockResolvedValue({ profile_completed: true, kyc: { status: 'not_submitted' } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const navigate = jest.fn();
    await mount({ onNavigate: navigate });
    await openFirstAndBid();
    expect(alert).toHaveBeenCalledWith('Verify your KYC', 'Verify your KYC before submitting a bid.', expect.any(Array));
    const buttons = alert.mock.calls[0][2] as any[];
    buttons.find(b => b.text === 'Verify KYC').onPress();
    expect(navigate).toHaveBeenCalledWith('/kyc');
    expect(touch('Continue to bid')).toBeUndefined();
  });

  test('the fee sheet states only the live rate, then the form repeats it', async () => {
    await mount();
    await openFirstAndBid();
    expect(all()).toContain('Platform fee: 15%');
    expect(all()).toContain('UGC.ad keeps 15% of your bid as its platform fee.');
    // The notice is the rate only: no worked example and no per-bid arithmetic.
    expect(all()).not.toMatch(/Example|you receive/i);
    await press('Continue to bid');
    expect(all()).toContain('UGC.ad platform fee: 15%');
    await type('Enter your bid amount', '1000');
    expect(all()).not.toMatch(/you receive|₹850/i);
  });

  test('when the readiness call fails the app falls back to the profile flag and the default rate', async () => {
    (getBidReadiness as jest.Mock).mockRejectedValue(new Error('boom'));
    await mount();
    await openFirstAndBid();
    expect(all()).toContain('Platform fee: 20%');
  });

  test('offline while checking says so instead of opening the form', async () => {
    const offline = Object.assign(new Error('x'), { name: 'NetworkError' });
    (getBidReadiness as jest.Mock).mockRejectedValue(offline);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount();
    await openFirstAndBid();
    expect(alert).toHaveBeenCalledWith("You're offline", "You're offline. Check your connection and try again.");
  });
});

describe('the bid form', () => {
  const fill = async (amount: string, days: string, proposal = 'I will deliver') => {
    await type('Enter your bid amount', amount);
    await type('How many days to complete?', days);
    await type("Describe your approach, experience, and why you're the right fit...", proposal);
  };
  const ready = async () => {
    await mount();
    await openFirstAndBid();
    await press('Continue to bid');
  };

  test('0 days and decimals are rejected before anything is sent', async () => {
    await ready();
    await fill('1000', '0');
    await press('Submit Bid');
    expect(all()).toContain('Estimated delivery must be a whole number of days, at least 1.');
    expect(placeBid).not.toHaveBeenCalled();
    // Typing a decimal point is not possible: the field keeps digits only.
    await type('How many days to complete?', '2.5');
    expect(field('How many days to complete?').props.value).toBe('25');
  });

  test('a bid over the brief ceiling is stopped on the phone with the website wording', async () => {
    await ready();
    await fill('1600', '3');
    await press('Submit Bid');
    expect(all()).toContain('Your bid cannot exceed the campaign budget of ₹1,500.');
    expect(placeBid).not.toHaveBeenCalled();
  });

  test('a long proposal is not cut off', async () => {
    await ready();
    expect(field("Describe your approach, experience, and why you're the right fit...").props.maxLength).toBeUndefined();
  });

  test('success returns to the list with a message and refreshes it', async () => {
    await ready();
    await fill('1000', '3');
    await press('Submit Bid');
    expect(placeBid).toHaveBeenCalledWith('token', 'c1', expect.objectContaining({ amount: 1000, delivery_days: 3, proposal: 'I will deliver' }));
    expect(all()).toContain('Bid submitted successfully!');
    expect(cards()).toHaveLength(1);
    expect((getCampaigns as jest.Mock).mock.calls.length).toBeGreaterThan(1);
  });

  test('a duplicate bid shows what the server said, in the error colour', async () => {
    (placeBid as jest.Mock).mockRejectedValue(new Error('You have already submitted a bid for this campaign'));
    await ready();
    await fill('1000', '3');
    await press('Submit Bid');
    expect(all()).toContain('You have already submitted a bid for this campaign');
    const note = tree.root.findAll((n: any) => text(n) === 'You have already submitted a bid for this campaign' && n.props.style)[0];
    expect(JSON.stringify(note.props.style)).toContain('#D14343');
  });

  test('offline on submit says so', async () => {
    (placeBid as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { name: 'NetworkError' }));
    await ready();
    await fill('1000', '3');
    await press('Submit Bid');
    expect(all()).toContain("You're offline. Check your connection and try again.");
  });

  test('a second tap while sending does not send twice', async () => {
    let release: () => void = () => {};
    (placeBid as jest.Mock).mockImplementation(() => new Promise<void>(r => { release = r; }));
    await ready();
    await fill('1000', '3');
    const submit = touch('Submit Bid')!;
    await act(async () => { submit.props.onPress(); submit.props.onPress(); });
    expect(placeBid).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });
});

describe('bookmark', () => {
  test('saving shows a message', async () => {
    await mount();
    await press('Save campaign');
    expect(all()).toContain('Saved to your list');
  });
});
