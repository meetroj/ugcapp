/**
 * Chat attachments, creator brief media and the creator's raw-footage Download stay in
 * the app: Linking.openURL is never called for them.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Linking, Modal, Platform, Share, TouchableOpacity } from 'react-native';
import WebView from 'react-native-webview';
import Video from 'react-native-video';
import BrandChatThread from '../src/screens/BrandChatThread';
import BrowseCampaigns from '../src/screens/BrowseCampaigns';
import DealDetails from '../src/screens/DealDetails';
import { getMessages, getCampaigns, getWorkDownloadLink } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  MAX_VIDEO_UPLOAD_MB: 400,
  getMessages: jest.fn(),
  getConversations: jest.fn().mockResolvedValue([]),
  getChatWarnings: jest.fn().mockResolvedValue({}),
  getChatTyping: jest.fn().mockResolvedValue(false),
  sendChatTyping: jest.fn().mockResolvedValue(undefined),
  getCampaigns: jest.fn(),
  getMe: jest.fn().mockResolvedValue({}),
  getMyBids: jest.fn().mockResolvedValue([]),
  getBidReadiness: jest.fn().mockResolvedValue({}),
  getSavedBriefs: jest.fn().mockResolvedValue([]),
  getUnreadCount: jest.fn().mockResolvedValue(0),
  getBusinessReviews: jest.fn().mockResolvedValue([{ campaign_id: 'camp-1', reviewer_id: 'cr1' }]),
  getWorkDownloadLink: jest.fn(),
}));

let tree: any;
let link: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const tap = async (label: string) => {
  const node = tree.root
    .findAll((n: any) => typeof n.props?.onPress === 'function')
    .find((n: any) => n.props.accessibilityLabel === label || content(n) === label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => { await node.props.onPress({ stopPropagation: () => {} }); });
};
const shown = (id: string) => tree.root.findAllByProps({ testID: id });
const webviews = () => tree.root.findAllByType(WebView);
const videos = () => tree.root.findAllByType(Video);
const openModals = () => tree.root.findAllByType(Modal).filter((m: any) => m.props.visible);

describe('chat attachments (BrandChatThread)', () => {
  const S3 = 'https://ugcad-media.s3.ap-south-1.amazonaws.com/chat';
  async function mountChat() {
    (getMessages as jest.Mock).mockResolvedValue([
      {
        id: 'm1', sender_id: 'other-1', message: 'files', created_at: '2026-10-20T10:00:00Z',
        attachment_urls: [`${S3}/pic.png`, `${S3}/clip.mp4`, `${S3}/brief.pdf`],
      },
    ]);
    await act(async () => {
      tree = Renderer.create(
        <BrandChatThread token="t" session={{ user_id: 'cr-1', role: 'creator' } as any}
          otherUserId="other-1" onBack={() => {}} onNavigate={() => {}} />,
      );
    });
  }

  test('a picture opens in the image viewer', async () => {
    await mountChat();
    await tap('Open image');
    expect(shown('media-image')[0].props.source).toEqual({ uri: `${S3}/pic.png` });
    expect(link).not.toHaveBeenCalled();
  });

  test('a video opens in the in-app player', async () => {
    await mountChat();
    await tap('Open clip.mp4');
    expect(videos()[0].props.source).toEqual({ uri: `${S3}/clip.mp4` });
    expect(link).not.toHaveBeenCalled();
  });

  test('iOS: a PDF opens in the document viewer', async () => {
    await mountChat();
    await tap('Open brief.pdf');
    expect(webviews()[0].props.source).toEqual({ uri: `${S3}/brief.pdf` });
    expect(link).not.toHaveBeenCalled();
  });

  test('Android: a PDF is saved by the download manager, not the browser', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mountChat();
    await tap('Open brief.pdf');
    expect(webviews()[0].props.source).toEqual({ uri: `${S3}/brief.pdf` });
    expect(openModals()).toHaveLength(0);
    expect(link).not.toHaveBeenCalled();
  });
});

describe('creator brief media (BrowseCampaigns)', () => {
  const S3 = 'https://ugcad-media.s3.ap-south-1.amazonaws.com/brief';
  async function mountBrief() {
    (getCampaigns as jest.Mock).mockResolvedValue([
      {
        id: 'c1', status: 'active', title: 'Brief 1', brand_name: 'Brand', budget_max: 1500,
        mood_images: [`${S3}/m1.jpg`],
        reference_videos: [`${S3}/ref.mp4`, 'youtube.com/watch?v=abc'],
      },
    ]);
    await act(async () => {
      tree = Renderer.create(
        <BrowseCampaigns token="token" session={{ user_id: 'creator', role: 'creator', token: 't', profile_completed: true } as any} />,
      );
    });
    const card = tree.root.findAllByType(TouchableOpacity)
      .find((n: any) => /: /.test(n.props.accessibilityLabel || '') && n.props.activeOpacity === 0.85);
    await act(async () => { card.props.onPress(); });
  }

  test('a mood board picture opens full-screen in the app', async () => {
    await mountBrief();
    await tap('Open mood board image 1');
    expect(shown('media-image')[0].props.source).toEqual({ uri: `${S3}/m1.jpg` });
    expect(link).not.toHaveBeenCalled();
  });

  test('a reference video file plays in the in-app player', async () => {
    await mountBrief();
    await tap('Open reference video 1');
    expect(videos()[0].props.source).toEqual({ uri: `${S3}/ref.mp4` });
    expect(link).not.toHaveBeenCalled();
  });

  test('a pasted web link (no scheme) opens in the in-app page viewer', async () => {
    await mountBrief();
    await tap('Open reference video 2');
    expect(webviews()[0].props.source).toEqual({ uri: 'https://youtube.com/watch?v=abc' });
    expect(link).not.toHaveBeenCalled();
  });
});

describe('creator Download of raw footage (DealDetails)', () => {
  const deal: any = {
    deal_id: 'DEAL-1',
    current_state: 'Received - Content in Progress',
    campaign: { id: 'camp-1', title: 'Launch', business_id: 'b1' },
    brand: { id: 'b1', name: 'Acme' },
    creator: { id: 'cr1', name: 'Arushi' },
    content_submission: {
      versions: [{ id: 'v1', version: 1, status: 'submitted', raw_footage_url: 'https://ugcad-media.s3.ap-south-1.amazonaws.com/raw/r.mp4' }],
    },
  };
  async function mountDeal() {
    await act(async () => {
      tree = Renderer.create(<DealDetails deal={deal} token="t" onBack={() => {}} onChat={() => {}} />);
    });
  }

  test('iOS: the server save-as link goes to the share sheet, never the browser', async () => {
    (getWorkDownloadLink as jest.Mock).mockResolvedValue({ url: 'https://s3.example.com/signed' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    await mountDeal();
    await tap('Download');
    expect(getWorkDownloadLink).toHaveBeenCalledWith('t', 'camp-1', 'raw');
    expect(share).toHaveBeenCalledWith({ url: 'https://s3.example.com/signed' });
    expect(link).not.toHaveBeenCalled();
  });

  test('Android: without a server link the stored file still goes to the download manager', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    (getWorkDownloadLink as jest.Mock).mockRejectedValue(new Error('nope'));
    await mountDeal();
    await tap('Download');
    expect(webviews()[0].props.source).toEqual({ uri: 'https://ugcad-media.s3.ap-south-1.amazonaws.com/raw/r.mp4' });
    expect(link).not.toHaveBeenCalled();
  });
});
