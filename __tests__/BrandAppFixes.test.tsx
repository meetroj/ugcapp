/**
 * @format
 *
 * QA round 22 Oct: brand draft campaign (Edit, no fake progress, real budget),
 * "Preferred Creators" wording, price on every creator card, one video with
 * sound at a time, de-duplicated portfolio clips, in-app downloads, and the
 * message badge on every tab header.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Platform, Share, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Video from 'react-native-video';
import AppHeader from '../src/components/AppHeader';
import { Alert } from '../src/components/AppAlert';
import BrandCampaignDetail, { campaignBudget } from '../src/screens/BrandCampaignDetail';
import BrandCreators, { priceTextOf } from '../src/screens/BrandCreators';
import BrandCampaigns from '../src/screens/BrandCampaigns';
import BrandWallet from '../src/screens/BrandWallet';
import BrandBids from '../src/screens/BrandBids';
import BrandShipments from '../src/screens/BrandShipments';
import AppProfileMenu from '../src/screens/AppProfileMenu';
import BrandSettings from '../src/screens/BrandSettings';
import { mergePortfolio } from '../src/screens/CreatorPublicProfile';
import { clipKey } from '../src/mediaPreview';
import { useMediaDownload } from '../src/mediaDownload';
import { getBusinessDeals, getCampaign, getCampaignWork, submitCampaign } from '../src/api';

jest.mock('../src/api', () => {
  const actual = jest.requireActual('../src/api');
  return {
    ...actual,
    getCampaign: jest.fn(), getBusinessDeals: jest.fn(), getCampaignWork: jest.fn(),
    getCreatorReviews: jest.fn(), getShortlist: jest.fn(), submitCampaign: jest.fn(),
  };
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

let tree: any;
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------- draft detail
describe('draft campaign detail', () => {
  const draft = {
    id: 'c1', title: 'Awareness (service)', status: 'draft', created_at: '2026-10-19T10:00:00Z',
    per_video_budget: 2000, creators_wanted: 2,
    deliverable_items: [{ type: 'Reel', quantity: 1 }],
  };
  const touch = (label: string) => tree.root.findAllByType(TouchableOpacity).find(
    (node: any) => node.props.accessibilityLabel === label || content(node) === label,
  );
  async function open(campaign: any, onNavigate: any = () => {}) {
    (getCampaign as jest.Mock).mockResolvedValue(campaign);
    (getBusinessDeals as jest.Mock).mockResolvedValue([]);
    (getCampaignWork as jest.Mock).mockResolvedValue([]);
    await act(async () => {
      tree = Renderer.create(
        <BrandCampaignDetail token="t" campaignId="c1" onBack={() => {}} onNavigate={onNavigate} />,
      );
    });
  }

  test('a draft offers Edit Draft and Publish, shows its real budget and no progress timeline', async () => {
    await open(draft);
    const text = content(tree.toJSON());
    expect(text).toContain('This campaign is a draft');
    expect(touch('Edit Draft')).toBeTruthy();
    expect(touch('Publish Campaign')).toBeTruthy();
    // 2000 per video x 1 deliverable x 2 creators.
    expect(text).toContain('Rs. 4,000');
    expect(text).toContain('Created on');
    // Nothing has been sent yet, so there is no "Brief Sent - In progress".
    expect(text).not.toContain('Campaign Progress');
    expect(text).not.toContain('Brief Sent');
    expect(text).not.toContain('Launched on');
  });

  test('Edit Draft reopens the brief wizard on the same draft', async () => {
    const onNavigate = jest.fn();
    await open(draft, onNavigate);
    await act(async () => { touch('Edit Draft').props.onPress(); });
    expect(onNavigate).toHaveBeenCalledWith('/dashboard/business/post-brief?draft=c1');
  });

  test('a draft with no budget says so and sends Publish to the editor instead of the server', async () => {
    const onNavigate = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open({ ...draft, per_video_budget: 0, creators_wanted: 1 }, onNavigate);
    expect(content(tree.toJSON())).toContain('Not set yet');
    await act(async () => { touch('Publish Campaign').props.onPress(); });
    expect(submitCampaign).not.toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0] as any[];
    expect(title).toBe('Finish your brief first');
    buttons.find((b: any) => b.text === 'Edit Draft').onPress();
    expect(onNavigate).toHaveBeenCalledWith('/dashboard/business/post-brief?draft=c1');
  });

  test('a published brief keeps its progress timeline and Launched on', async () => {
    await open({ ...draft, status: 'pending_approval', budget: 4000 });
    const text = content(tree.toJSON());
    expect(text).toContain('Campaign Progress');
    expect(text).toContain('Launched on');
    expect(text).not.toContain('Edit Draft');
  });

  test('campaignBudget: totals first, a draft derives it, live briefs keep the old reading', () => {
    expect(campaignBudget({ budget: 5000, per_video_budget: 1 })).toBe(5000);
    expect(campaignBudget({ status: 'draft', per_video_budget: 1000, creators_wanted: 3,
      deliverable_items: [{ quantity: 2 }] })).toBe(6000);
    expect(campaignBudget({ status: 'draft' })).toBe(0);
    expect(campaignBudget({ status: 'active', budget_max: 900 })).toBe(900);
  });
});

// ---------------------------------------------------------------- brand settings
test('Account Settings has the Team and Billing tabs and a logo upload on the Brand tab', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ brand_name: 'Sleek soul' }) }));
  await act(async () => { tree = Renderer.create(<BrandSettings token="t" onBack={() => {}} />); });
  const tabs = tree.root.findAllByType(TouchableOpacity)
    .filter((n: any) => String(n.props.testID || '').startsWith('settings-tab-'));
  expect(tabs.map((n: any) => content(n))).toEqual(['Brand', 'Company', 'Team', 'Billing']);
  expect(content(tree.toJSON())).toContain('Upload logo');
});

// ---------------------------------------------------------------- creators tab
describe('brand Creators tab', () => {
  let onStateChange: (state: any) => void;
  let directory: any[];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onStateChange = listener; return { remove: jest.fn() } as any;
    });
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200,
      json: async () => directory.map(item => ({ ...item })) }));
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  async function mount(props: any = {}) {
    await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} {...props} />); });
    act(() => onStateChange('active'));
  }
  const press = (predicate: (n: any) => boolean) =>
    tree.root.findAll((n: any) => predicate(n) && typeof n.props.onPress === 'function')[0];
  const byLabel = (label: string) => press((n: any) => n.props.accessibilityLabel === label);

  test('the preferred-creators link is a dark pill on the right, like the website on phones', async () => {
    directory = [{ id: 'a', name: 'Deshna', budget_range: '2000', ugcad_approved: true }];
    await mount();
    const { StyleSheet } = require('react-native');
    const style = StyleSheet.flatten(press((n: any) => content(n) === 'Meet Our Preferred Creators').props.style);
    expect(style).toMatchObject({ alignSelf: 'flex-end', backgroundColor: '#07074E' });
  });

  test('the link and the collection heading say "Preferred", on every platform', async () => {
    directory = [{ id: 'a', name: 'Deshna', budget_range: '2000', ugcad_approved: true }];
    for (const os of ['ios', 'android'] as const) {
      jest.replaceProperty(Platform, 'OS', os);
      await mount();
      expect(content(tree.toJSON())).toContain('Meet Our Preferred Creators');
      expect(content(tree.toJSON())).not.toContain('Approved by Our UGCAD Team');
      await act(async () => { press((n: any) => content(n) === 'Meet Our Preferred Creators').props.onPress(); });
      expect(content(tree.toJSON())).toContain('Preferred Creators by the UGCAD Team');
      expect(content(tree.toJSON())).not.toContain('Every creator on UGCAD');
      expect(content(tree.toJSON())).not.toContain('Approved by Our UGCAD Team');
      await act(async () => { tree.unmount(); });
      tree = null;
    }
  });

  test('every card shows the price per video, never "N delivered", with the full name', async () => {
    directory = [
      { id: 'a', name: 'Sujanya', budget_range: '1800', deliverables_completed: 0 },
      { id: 'b', name: 'Aayushi', budget_range: '1500-3000', deliverables_completed: 12 },
      { id: 'c', name: 'Arushi', budget_range: 'Rs. 2,000 - 4,000', deliverables_completed: 3 },
    ];
    await mount();
    const text = content(tree.toJSON());
    expect(text).toContain('Rs. 1,800 / video');
    expect(text).toContain('Rs. 1,500 - 3,000 / video');
    expect(text).toContain('Rs. 2,000 - 4,000');
    expect(text).not.toMatch(/delivered/);
    expect(text).toContain('Arushi');
    // A long name wraps instead of being cut to the first letters.
    const names = tree.root.findAll((n: any) => n.props.numberOfLines === 2 && content(n) === 'Sujanya');
    expect(names.length).toBeGreaterThan(0);
    expect(priceTextOf({ id: 'x', budget_range: '1500 - 3000' })).toBe('Rs. 1,500 - 3,000 / video');
  });

  test('previews start muted; the speaker unmutes one tile and scrolling gives the sound back', async () => {
    directory = Array.from({ length: 4 }, (_, i) => ({
      id: String(i), name: `Creator ${i}`,
      portfolio_preview: `https://res.cloudinary.com/demo/video/upload/v1/creator${i}.mp4`,
    }));
    await mount();
    const rows = () => tree.root.findAllByType(require('react-native').FlatList);
    act(() => { rows().forEach((row: any) => row.props.onViewableItemsChanged({
      viewableItems: [0, 1].map(index => ({ index, isViewable: true })),
    })); });
    const player = () => tree.root.findAllByType(Video)[0];
    expect(player().props.muted).toBe(true);
    expect(player().props.ignoreSilentSwitch).toBe('ignore');
    // No speaker until the first frame is on screen.
    expect(byLabel("Unmute Creator 0's preview")).toBeUndefined();
    act(() => player().props.onReadyForDisplay());
    act(() => byLabel("Unmute Creator 0's preview").props.onPress({ stopPropagation() {} }));
    expect(player().props.muted).toBe(false);
    expect(player().props.disableFocus).toBe(false);
    expect(byLabel("Mute Creator 0's preview")).toBeTruthy();
    // Scrolling the row releases the player; it comes back silent.
    act(() => rows()[0].props.onScrollBeginDrag());
    act(() => { rows()[0].props.onScrollEndDrag(); rows()[0].props.onMomentumScrollBegin(); });
    act(() => { rows()[0].props.onMomentumScrollEnd(); jest.advanceTimersByTime(300); });
    expect(player().props.muted).toBe(true);
  });

  test('the header shows the unread message badge', async () => {
    directory = [];
    await mount({ unread: 5 });
    expect(tree.root.findByType(AppHeader).props.unreadMessages).toBe(5);
  });
});

// ---------------------------------------------------------------- header badge
test('every brand tab screen and the profile menu hand the unread count to the header', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ([]) }));
  const screens: Array<[string, React.ReactElement]> = [
    ['campaigns', <BrandCampaigns token="t" onNavigate={() => {}} unread={4} />],
    ['wallet', <BrandWallet token="t" onNavigate={() => {}} unread={4} />],
    ['bids', <BrandBids token="t" onBack={() => {}} onNavigate={() => {}} unread={4} />],
    ['shipments', <BrandShipments token="t" onBack={() => {}} onNavigate={() => {}} unread={4} />],
    ['profile', <AppProfileMenu session={{ role: 'business', token: 't' } as any} onNavigate={() => {}} unread={4} />],
  ];
  for (const [name, element] of screens) {
    await act(async () => { tree = Renderer.create(element); });
    expect([name, tree.root.findByType(AppHeader).props.unreadMessages]).toEqual([name, 4]);
    await act(async () => { tree.unmount(); });
    tree = null;
  }
});

test('the header renders the badge number on the message icon', () => {
  act(() => { tree = Renderer.create(<AppHeader title="Creators" unreadMessages={12} />); });
  expect(content(tree.toJSON())).toContain('9+');
});

// ---------------------------------------------------------------- duplicated videos
describe('creator profile portfolio', () => {
  const CLD = 'https://res.cloudinary.com/abc/video/upload/v1/ugcad/portfolio';
  const S3 = 'https://ugcad-media.s3.ap-south-1.amazonaws.com/ugcad/portfolio';

  test('the same clip under two URLs shows once', () => {
    const clips = mergePortfolio(
      { portfolio: [{ videoUrl: `${CLD}/car.mp4` }, { videoUrl: `${CLD}/fitness.mp4` }] },
      {
        portfolio_items: [{ video_url: `${S3}/car.mp4?X-Amz-Signature=abc` }],
        portfolio: [{ url: `${CLD.replace('/v1/', '/v7/')}/fitness.mp4` }],
      },
    );
    expect(clips.map(clip => clipKey(clip.url))).toEqual(['ugcad/portfolio/car', 'ugcad/portfolio/fitness']);
  });

  test('different clips are kept, previews and plain paths normalise the same way', () => {
    expect(clipKey(`${CLD}/a.mp4`)).not.toBe(clipKey(`${CLD}/b.mp4`));
    expect(clipKey('https://ugcad-media.s3.ap-south-1.amazonaws.com/previews/ugcad/portfolio/a.mp4')).toBe('ugcad/portfolio/a');
    expect(clipKey('https://res.cloudinary.com/abc/video/upload/f_mp4,vc_h264/v2/ugcad/portfolio/a.mov')).toBe('ugcad/portfolio/a');
  });
});

// ---------------------------------------------------------------- in-app download
describe('useMediaDownload', () => {
  function Probe({ url, notify }: { url: string; notify: (m: string) => void }) {
    const { start, node } = useMediaDownload(notify);
    return (
      <>
        <TouchableOpacity accessibilityLabel="go" onPress={() => start(url)} />
        {node}
      </>
    );
  }
  const mount = async (url: string, notify = jest.fn()) => {
    await act(async () => { tree = Renderer.create(<Probe url={url} notify={notify} />); });
    return notify;
  };
  const go = () => act(async () => { await tree.root.findByProps({ accessibilityLabel: 'go' }).props.onPress(); });

  test('iOS opens the share sheet with the link', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
    const notify = await mount('https://s3.example.com/a.mp4');
    await go();
    expect(share).toHaveBeenCalledWith({ url: 'https://s3.example.com/a.mp4' });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Save to Files'));
    expect(tree.root.findAllByType(WebView)).toHaveLength(0);
  });

  test('Android hands the link to a hidden webview (download manager) and says it started', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const notify = await mount('https://s3.example.com/a.mp4');
    await go();
    expect(tree.root.findAllByType(WebView)[0].props.source).toEqual({ uri: 'https://s3.example.com/a.mp4' });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Downloads'));
    // A refused / expired link reports the failure and removes the loader.
    await act(async () => { tree.root.findAllByType(WebView)[0].props.onHttpError({}); });
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('Download failed'));
    expect(tree.root.findAllByType(WebView)).toHaveLength(0);
  });

  test('a link that is not http(s) is refused', async () => {
    const share = jest.spyOn(Share, 'share');
    const notify = await mount('file:///x.mp4');
    await go();
    expect(share).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('not valid'));
  });
});
