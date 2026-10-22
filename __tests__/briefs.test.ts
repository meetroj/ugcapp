/**
 * The creator-side brief rules: who can bid, the Browse filters (same buckets as
 * the website's BrowseBriefs.js), the max-bid and delivery-day checks, bid
 * status labels/tabs and the profile-completion percentage.
 */
import {
  BID_TABS,
  BROWSE_PAGE,
  DEFAULT_FILTERS,
  activeFilterCount,
  bidStatusLabel,
  bidStatusOf,
  biddable,
  briefSections,
  deliveryChip,
  filterBriefs,
  isOpenForBids,
  loadErrorText,
  maxCampaignBid,
  moodImagesOf,
  ownBidOn,
  parseDeliveryDays,
  referenceVideosOf,
  selectedCreators,
  stripBrandOnlyLines,
  timeAgo,
  validateBid,
} from '../src/briefs';
import { profileNudge, profilePercent } from '../src/profileCompletion';

const day = 86400000;
// An hour short of n days, so the site's ceil() lands on exactly n.
const inDays = (n: number) => new Date(Date.now() + n * day - 3600000).toISOString();
const brief = (extra: Record<string, any> = {}) => ({ id: 'b', status: 'active', ...extra });

describe('who can bid', () => {
  test('the singular selected_creator counts (private briefs only set it)', () => {
    expect(selectedCreators({ selected_creator: 'me' })).toEqual(['me']);
    // A creator's own private brief is hired-on, so it is never offered for bidding.
    expect(biddable([brief({ visibility: 'private', selected_creator: 'me' })], 'me')).toHaveLength(0);
    expect(biddable([brief({ visibility: 'private', selected_creator: 'me' })], 'other')).toHaveLength(0);
  });

  test('a private brief is never open for bids, even with no creator recorded on it', () => {
    expect(isOpenForBids(brief({ visibility: 'private' }))).toBe(false);
    expect(biddable([brief({ visibility: 'private' }), brief({})], 'me')).toHaveLength(1);
  });

  test('a multi-creator brief stays open while slots remain, but not for a hired creator', () => {
    const c = brief({ creators_wanted: 3, selected_creators: ['a', 'me'] });
    expect(isOpenForBids(c)).toBe(true);
    expect(biddable([c], 'me')).toHaveLength(0);
    expect(biddable([c], 'someone-else')).toHaveLength(1);
    expect(isOpenForBids(brief({ creators_wanted: 2, selected_creators: ['a', 'b'] }))).toBe(false);
    expect(isOpenForBids(brief({ status: 'in_progress' }))).toBe(false);
  });
});

describe('browse filters', () => {
  const list = [
    brief({ id: '1', title: 'Skin serum', brand_name: 'Glow', budget_max: 1500, final_delivery_by: inDays(2), created_at: '2026-10-01T00:00:00Z' }),
    brief({ id: '2', title: 'Sneakers', brand_name: 'Kicks', budget_max: 2000, final_delivery_by: inDays(4), created_at: '2026-10-03T00:00:00Z' }),
    brief({ id: '3', title: 'Headphones', brand_name: 'boAt', budget_max: 5000, final_delivery_by: inDays(6), created_at: '2026-10-02T00:00:00Z' }),
    brief({ id: '4', title: 'Watch', brand_name: 'Time', budget_max: 12000, final_delivery_by: inDays(20) }),
    brief({ id: '5', title: 'No deadline', brand_name: 'Open', budget_max: 7000 }),
  ];
  const ids = (rows: any[]) => rows.map(r => r.id);

  test('budget buckets use the website boundaries', () => {
    const by = (budget: any) => ids(filterBriefs(list, { ...DEFAULT_FILTERS, sort: 'recommended', budget }));
    expect(by('0-2000')).toEqual(['1']);
    expect(by('2000-5000')).toEqual(['2', '3']);
    expect(by('5000-10000')).toEqual(['5']);
    expect(by('10000+')).toEqual(['4']);
  });

  test('delivery buckets keep briefs that state no deadline', () => {
    const by = (delivery: any) => ids(filterBriefs(list, { ...DEFAULT_FILTERS, sort: 'recommended', delivery }));
    expect(by('3')).toEqual(['1', '5']);
    expect(by('5')).toEqual(['1', '2', '5']);
    expect(by('7')).toEqual(['1', '2', '3', '5']);
    expect(by('7+')).toEqual(['4', '5']);
  });

  test('search looks at title and brand, case-insensitively', () => {
    expect(ids(filterBriefs(list, { ...DEFAULT_FILTERS, search: ' BOAT ' }))).toEqual(['3']);
    expect(ids(filterBriefs(list, { ...DEFAULT_FILTERS, search: 'serum' }))).toEqual(['1']);
    expect(filterBriefs(list, { ...DEFAULT_FILTERS, search: 'zzz' })).toHaveLength(0);
  });

  test('sorts: recommended keeps server order, highest payout and newest reorder', () => {
    expect(ids(filterBriefs(list, { ...DEFAULT_FILTERS, sort: 'recommended' }))).toEqual(['1', '2', '3', '4', '5']);
    // The default view is newest first.
    expect(DEFAULT_FILTERS.sort).toBe('newest');
    expect(ids(filterBriefs(list, { ...DEFAULT_FILTERS, sort: 'highest' }))).toEqual(['4', '5', '3', '2', '1']);
    expect(ids(filterBriefs(list, { ...DEFAULT_FILTERS, sort: 'newest' })).slice(0, 3)).toEqual(['2', '3', '1']);
  });

  test('filter count ignores search and sort; page size is 8', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: 'x', sort: 'newest' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, budget: '0-2000', delivery: '3' })).toBe(2);
    expect(BROWSE_PAGE).toBe(8);
  });

  test('delivery chip', () => {
    expect(deliveryChip({})).toBe('See brief');
    expect(deliveryChip({ estimated_delivery_days: 1 })).toBe('1 Day');
    expect(deliveryChip({ estimated_delivery_days: 5 })).toBe('5 Days');
  });
});

describe('bid checks', () => {
  test('max bid is the brief ceiling plus the creator editing fee', () => {
    expect(maxCampaignBid({ budget_max: 3000 })).toBe(3000);
    expect(maxCampaignBid({ budget_range: '₹1,000 - ₹2.5k' })).toBe(2500);
    expect(maxCampaignBid({})).toBe(0);
    expect(
      maxCampaignBid({
        budget_max: 1000,
        editing_fee_per_video: 200,
        deliverable_items: [{ quantity: 2, edited_required: true, edited_by: 'creator' }],
      }),
    ).toBe(1200);
  });

  test('delivery days must be a whole number of at least 1', () => {
    expect(parseDeliveryDays('3')).toBe(3);
    expect(parseDeliveryDays('0')).toBeNull();
    expect(parseDeliveryDays('2.5')).toBeNull();
    expect(parseDeliveryDays('')).toBeNull();
  });

  test('validateBid reports the first problem', () => {
    const c = { budget_max: 1000 };
    expect(validateBid(c, { amount: '', days: '3', proposal: 'hi' })).toBe('Please complete all fields.');
    expect(validateBid(c, { amount: '500', days: '0', proposal: 'hi' })).toMatch(/at least 1/);
    expect(validateBid(c, { amount: '500', days: '2.5', proposal: 'hi' })).toMatch(/whole number/);
    expect(validateBid(c, { amount: '1500', days: '3', proposal: 'hi' })).toBe(
      'Your bid cannot exceed the campaign budget of ₹1,000.',
    );
    expect(validateBid(c, { amount: '1000', days: '3', proposal: 'hi' })).toBe('');
    // No proposal cap: a long pitch is fine (the website has none).
    expect(validateBid({}, { amount: '1', days: '1', proposal: 'x'.repeat(5000) })).toBe('');
  });

  test('own bid is found by creator id', () => {
    const c = { bids: [{ creator_id: 'a', amount: 1 }, { creator_id: 'me', amount: 2 }] };
    expect(ownBidOn(c, 'me')?.amount).toBe(2);
    expect(ownBidOn(c, 'nobody')).toBeNull();
    expect(ownBidOn({}, 'me')).toBeNull();
  });
});

describe('bid status', () => {
  test('labels: undecided statuses read Pending', () => {
    expect(bidStatusLabel('bid_submitted')).toBe('Pending');
    expect(bidStatusLabel('submitted')).toBe('Pending');
    expect(bidStatusLabel('pending')).toBe('Pending');
    expect(bidStatusLabel('approved')).toBe('Approved');
    expect(bidStatusLabel('rejected')).toBe('Rejected');
  });

  test('status is read in the website order and tabs bucket it', () => {
    expect(bidStatusOf({ bid_status: 'Approved', my_bid: { status: 'pending' } })).toBe('approved');
    expect(bidStatusOf({ my_bid: { status: 'shortlisted' } })).toBe('shortlisted');
    expect(bidStatusOf({})).toBe('pending');
    const tab = (key: string) => BID_TABS.find(t => t.key === key)!;
    expect(tab('accepted').match('approved')).toBe(true);
    expect(tab('accepted').match('selected')).toBe(true);
    expect(tab('accepted').match('rejected')).toBe(false);
    expect(tab('rejected').match('rejected')).toBe(true);
    expect(BID_TABS.map(t => t.key)).toEqual(['all', 'accepted', 'rejected']);
    expect(tab('all').match('anything')).toBe(true);
  });
});

describe('brief details', () => {
  test('sections follow the website drawer and drop empty rows', () => {
    const sections = briefSections({
      product_name: 'Serum',
      language: 'Hindi',
      script_provider: 'ugc',
      deliverable_items: [{ quantity: 2, type: 'Reel', duration: '30s', aspect_ratios: ['9:16'], edited_required: true, edited_by: 'creator' }],
      usage_platforms: ['Instagram', 'YouTube'],
      due_date: '2026-11-05',
      mood_images: ['/uploads/a.jpg', 'a.jpg'],
    });
    const titles = sections.map(s => s.title);
    expect(titles).toEqual(['Product', 'Deliverables', 'Script', 'Creator targeting', 'Usage rights', 'Timeline']);
    const rows = Object.fromEntries(sections.flatMap(s => s.rows));
    expect(rows['Deliverable 1']).toBe('2 x Reel (9:16, 30s); deliver Raw + Edited video (edited by creator)');
    expect(rows['Script']).toMatch(/preparing the script/);
    expect(rows['Location']).toBe('Any location');
    expect(rows['Platforms']).toBe('Instagram, YouTube');
    expect(moodImagesOf({ mood_images: ['/uploads/a.jpg', 'a.jpg'] }, 'https://x')).toEqual(['https://x/uploads/a.jpg']);
    expect(referenceVideosOf({ reference_videos: ['/uploads/v.mp4', 'https://y.com/v', ' '] }, 'https://x')).toEqual([
      'https://x/uploads/v.mp4',
      'https://y.com/v',
    ]);
  });

  test('the brand-only Budget visibility line never shows', () => {
    expect(stripBrandOnlyLines('Hook: x\nBudget visibility: hidden\nKey message: y')).toBe('Hook: x\nKey message: y');
  });
});

describe('small helpers', () => {
  test('timeAgo', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(timeAgo('2026-10-20T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-10-20T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-20T07:00:00Z', now)).toBe('5 hr ago');
    expect(timeAgo('2026-10-17T12:00:00Z', now)).toBe('3d ago');
    expect(timeAgo(undefined, now)).toBe('');
  });

  test('load errors say offline for a dropped connection', () => {
    const offline = Object.assign(new Error("Can't reach the server"), { name: 'NetworkError' });
    expect(loadErrorText(offline, 'bids')).toBe("You're offline. Check your connection and try again.");
    expect(loadErrorText(new Error('Boom'), 'bids')).toBe('Boom');
    expect(loadErrorText(new Error('Request failed'), 'bids')).toBe("Couldn't load bids. Try again.");
  });
});

describe('profile completion', () => {
  const full = {
    profile_photo: '/p.jpg',
    portfolio: ['/v.mp4'],
    profile: { age: 24, gender: 'f', bodyType: 'a', skinTone: 'b', city: 'Pune', state: 'MH', pincode: '411001', languages: ['Hindi'] },
  };
  test('percent counts the five mandatory items', () => {
    expect(profilePercent({})).toBe(0);
    expect(profilePercent(full)).toBe(100);
    expect(profilePercent({ ...full, profile: { ...full.profile, languages: [] } })).toBe(80);
  });

  test('the team-requested nudge lists only what is still empty', () => {
    expect(profileNudge(full).left).toEqual([]);
    const n = profileNudge({ profile_nudge: { items: ['photo', 'kyc'] }, kyc: { status: 'not_submitted' } });
    expect(n.left).toEqual(['photo', 'kyc']);
    expect(n.text).toBe('profile photo, PAN card and Aadhaar card (front and back)');
    expect(n.to).toBe('/app/profile');
    expect(profileNudge({ profile_photo: '/p', profile_nudge: { items: ['photo', 'kyc'] } }).to).toBe('/kyc');
  });
});
