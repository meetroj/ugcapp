/**
 * @format
 * Routing contract of the native shell: legacy and role-specific links land on
 * a screen that exists, the query strings (?tab ?open ?q ?view ?draft ?creator)
 * reach the screens that read them, and the props the other packages asked for
 * are wired.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import WebShell, { normalizePath, queryParam } from '../src/screens/WebShell';

// Every screen whose props are checked is replaced by a stub that records them.
const mockProps: Record<string, any> = {};
jest.mock('../src/screens/MyDeals', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.MyDeals = props), null),
}));
jest.mock('../src/screens/BrowseCampaigns', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrowseCampaigns = props), null),
}));
jest.mock('../src/screens/BrandWallet', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandWallet = props), null),
}));
jest.mock('../src/screens/BrandPostBrief', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandPostBrief = props), null),
}));
jest.mock('../src/screens/BrandCampaignDetail', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandCampaignDetail = props), null),
}));
jest.mock('../src/screens/BrandWorkReview', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandWorkReview = props), null),
}));
jest.mock('../src/screens/BrandSettings', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandSettings = props), null),
}));
jest.mock('../src/screens/MyBids', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.MyBids = props), null),
}));
jest.mock('../src/screens/SavedBriefs', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.SavedBriefs = props), null),
}));
jest.mock('../src/screens/Reviews', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.Reviews = props), null),
}));
jest.mock('../src/screens/CreatorHome', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.CreatorHome = props), null),
}));
jest.mock('../src/screens/WithdrawalRequest', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.WithdrawalRequest = props), null),
}));
jest.mock('../src/screens/Earnings', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.Earnings = props), null),
}));
jest.mock('../src/screens/ActiveWork', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.ActiveWork = props), null),
}));
jest.mock('../src/screens/BrandChatThread', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandChatThread = props), null),
}));
jest.mock('../src/screens/BrandMessages', () => ({
  __esModule: true,
  default: (props: any) => ((mockProps.BrandMessages = props), null),
}));

const creator: any = { user_id: 'c1', role: 'creator', profile_completed: true };
const brand: any = {
  user_id: 'b1',
  role: 'business',
  profile_completed: true,
  nickname: 'Levis',
  email: 'brand@example.com',
  phone: '9999999999',
};

beforeEach(() => {
  jest.useFakeTimers();
  for (const key of Object.keys(mockProps)) delete mockProps[key];
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  );
});
afterEach(() => jest.useRealTimers());

async function mount(session: any, initialPath: string) {
  let tree: any;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <WebShell token="t" session={session} onLogout={() => {}} initialPath={initialPath} />,
    );
  });
  return tree;
}

describe('normalizePath', () => {
  test('legacy notification links map like the website', () => {
    expect(normalizePath('/deals', 'creator')).toBe('/my-deals');
    expect(normalizePath('/payouts', 'creator')).toBe('/withdrawal');
    expect(normalizePath('/creator-dashboard', 'creator')).toBe('/dashboard/creator');
    expect(normalizePath('/dashboard/creator/inbox', 'creator')).toBe('/messages');
    expect(normalizePath('/dashboard/business/deals', 'business')).toBe(
      '/dashboard/business/all-campaigns',
    );
    // The result is normalised again, so a deal id in the query still lands on that deal.
    expect(normalizePath('/deals?campaign=abc', 'creator')).toBe('/my-deals/abc');
  });

  test('a creator never lands on a brand-only or missing campaign page', () => {
    expect(normalizePath('/campaign/c9', 'creator')).toBe('/browse-briefs?open=c9');
    expect(normalizePath('/campaigns/c9', 'creator')).toBe('/browse-briefs?open=c9');
    expect(normalizePath('/dashboard/business/campaign/c9', 'creator')).toBe(
      '/browse-briefs?open=c9',
    );
    expect(normalizePath('/campaign/c9', 'business')).toBe('/campaigns/c9');
    expect(normalizePath('/campaigns/c9', 'business')).toBe('/campaigns/c9');
  });

  test('a brand keeps ?creator= through the campaign rewrite', () => {
    expect(normalizePath('/dashboard/business/campaign/c1?creator=u9', 'business')).toBe(
      '/campaigns/c1?creator=u9',
    );
    expect(normalizePath('/dashboard/business/campaigns/c1/shortlist', 'business')).toBe(
      '/campaigns/c1',
    );
  });

  test('shipment links: creators go to their deal, brands to the shipment screen', () => {
    expect(normalizePath('/shipment?campaign=c1', 'creator')).toBe('/my-deals/c1');
    expect(normalizePath('/shipment/c1', 'creator')).toBe('/my-deals/c1');
    expect(normalizePath('/shipment?campaign=c1', 'business')).toBe('/shipment/c1');
    expect(normalizePath('/shipment?campaign=c1&creator=u2', 'business')).toBe(
      '/shipment/c1?creator=u2',
    );
    expect(normalizePath('/shipment/c1?creator=u2', 'business')).toBe('/shipment/c1?creator=u2');
  });

  test('deep-link queries survive', () => {
    // A brand has no deals hub, so its '/my-deals' links go to the campaign
    // list (see normalizePath); only a creator keeps the tab query.
    expect(normalizePath('/my-deals?tab=requested', 'creator')).toBe('/my-deals?tab=requested');
    expect(normalizePath('/my-deals?tab=requested', 'business')).toBe(
      '/dashboard/business/all-campaigns',
    );
    for (const path of [
      '/browse-briefs?open=c1&q=shoes',
      '/dashboard/business/wallet?view=history',
      '/dashboard/business/post-brief?draft=d1',
      '/dashboard/business/post-brief?creator=u1',
    ]) {
      expect(normalizePath(path, 'creator')).toBe(path);
      expect(normalizePath(path, 'business')).toBe(path);
    }
    expect(normalizePath('/saved?q=1', 'creator')).toBe('/saved-briefs?q=1');
    expect(normalizePath('/chat/u5', 'creator')).toBe('/messages/u5');
    expect(normalizePath('/chat', 'creator')).toBe('/messages');
    expect(normalizePath('/messages?conv=u5', 'creator')).toBe('/messages/u5');
  });

  test('queryParam decodes and ignores a missing key', () => {
    expect(queryParam('/x?a=1&q=red%20shoes', 'q')).toBe('red shoes');
    expect(queryParam('/x?a=1', 'q')).toBeUndefined();
    expect(queryParam('/x?q=%E0%A4%A', 'q')).toBe('%E0%A4%A');
  });
});

describe('WebShell wiring', () => {
  test('creator: ?tab= reaches My Deals, which can send the user to Browse', async () => {
    await mount(creator, '/my-deals?tab=requested');
    expect(mockProps.MyDeals.initialTab).toBe('requested');
    await act(async () => {
      mockProps.MyDeals.onBrowse();
    });
    expect(mockProps.BrowseCampaigns).toBeTruthy();
  });

  test('creator: ?open= and ?q= reach Browse', async () => {
    await mount(creator, '/browse-briefs?open=c1&q=red%20shoes');
    expect(mockProps.BrowseCampaigns.openId).toBe('c1');
    expect(mockProps.BrowseCampaigns.initialQuery).toBe('red shoes');
  });

  test('creator: a campaign link opens the brief in Browse, not a missing page', async () => {
    await mount(creator, '/dashboard/creator');
    await act(async () => {
      mockProps.CreatorHome.onNavigate('/campaign/c9');
    });
    expect(mockProps.BrowseCampaigns.openId).toBe('c9');
  });

  test('creator: legacy links open the real screens', async () => {
    await mount(creator, '/dashboard/creator');
    await act(async () => {
      mockProps.CreatorHome.onNavigate('/payouts');
    });
    expect(mockProps.Earnings).toBeTruthy();
    expect(mockProps.Earnings.session).toBeUndefined();
  });

  test('creator: the shipment link opens the deal room', async () => {
    await mount(creator, '/dashboard/creator');
    await act(async () => {
      mockProps.CreatorHome.onNavigate('/shipment?campaign=c4');
    });
    expect(mockProps.MyDeals.focusDealId).toBe('c4');
  });

  test('creator: the other packages props are wired', async () => {
    await mount(creator, '/my-bids');
    expect(typeof mockProps.MyBids.onNavigate).toBe('function');
    await act(async () => {
      mockProps.MyBids.onOpenThread('u7', 'Levis');
    });
    expect(mockProps.BrandChatThread.otherUserId).toBe('u7');
    expect(mockProps.BrandChatThread.title).toBe('Levis');

    await mount(creator, '/saved-briefs');
    expect(mockProps.SavedBriefs.session).toBe(creator);
    expect(typeof mockProps.SavedBriefs.onNavigate).toBe('function');

    await mount(creator, '/reviews');
    expect(typeof mockProps.Reviews.onNavigate).toBe('function');

    await mount(creator, '/dashboard/creator');
    expect(typeof mockProps.CreatorHome.onNavigate).toBe('function');

    await mount(creator, '/withdrawal/new');
    expect(mockProps.WithdrawalRequest.available).toBeUndefined();
  });

  test('brand: ?view= and the checkout prefill reach the wallet', async () => {
    await mount(brand, '/dashboard/business/wallet?view=history');
    expect(mockProps.BrandWallet.initialView).toBe('history');
    expect(mockProps.BrandWallet.prefill).toEqual({
      name: 'Levis',
      email: 'brand@example.com',
      contact: '9999999999',
    });
  });

  test('brand: a wallet link with ?amount= still opens the native wallet', async () => {
    await mount(brand, '/dashboard/business/wallet?amount=5000');
    expect(mockProps.BrandWallet).toBeTruthy();
  });

  test('brand: ?draft= resumes that draft', async () => {
    await mount(brand, '/dashboard/business/post-brief?draft=d1');
    expect(mockProps.BrandPostBrief.resumeDraftId).toBe('d1');
    await mount(brand, '/dashboard/business/post-brief');
    expect(mockProps.BrandPostBrief.resumeDraftId).toBeUndefined();
  });

  test('brand: ?creator= focuses that creator and a thread opens with the right name', async () => {
    await mount(brand, '/campaigns/c1?creator=u9');
    expect(mockProps.BrandCampaignDetail.campaignId).toBe('c1');
    expect(mockProps.BrandCampaignDetail.focusCreatorId).toBe('u9');
    await act(async () => {
      mockProps.BrandCampaignDetail.onOpenThread('u9', 'Asha');
    });
    expect(mockProps.BrandChatThread.otherUserId).toBe('u9');
    expect(mockProps.BrandChatThread.title).toBe('Asha');
  });

  test('brand: a notification link keeps ?creator= through the rewrite', async () => {
    await mount(brand, '/dashboard/business/work-review');
    await act(async () => {
      mockProps.BrandWorkReview.onNavigate('/dashboard/business/campaign/c2?creator=u3');
    });
    expect(mockProps.BrandCampaignDetail.campaignId).toBe('c2');
    expect(mockProps.BrandCampaignDetail.focusCreatorId).toBe('u3');
  });

  test('brand: work review and settings are wired', async () => {
    await mount(brand, '/dashboard/business/work-review');
    await act(async () => {
      mockProps.BrandWorkReview.onOpenThread('u3', 'Ria');
    });
    expect(mockProps.BrandChatThread.title).toBe('Ria');

    await mount(brand, '/settings');
    expect(typeof mockProps.BrandSettings.onNavigate).toBe('function');
  });

  test('a deep link to a thread never shows another thread name', async () => {
    await mount(brand, '/messages/u5');
    expect(mockProps.BrandChatThread.otherUserId).toBe('u5');
    expect(mockProps.BrandChatThread.title).toBeUndefined();

    // Open u7 from the list, then deep-link to u5: u5 must not inherit "Levis".
    await mount(brand, '/messages');
    await act(async () => {
      mockProps.BrandMessages.onOpenThread('u7', 'Levis');
    });
    expect(mockProps.BrandChatThread.title).toBe('Levis');
    await act(async () => {
      mockProps.BrandChatThread.onNavigate('/messages/u5');
    });
    expect(mockProps.BrandChatThread.otherUserId).toBe('u5');
    expect(mockProps.BrandChatThread.title).toBeUndefined();
  });

  test('the messages list knows the role for its empty text and names', async () => {
    await mount(creator, '/messages');
    expect(mockProps.BrandMessages.role).toBe('creator');
  });
});
