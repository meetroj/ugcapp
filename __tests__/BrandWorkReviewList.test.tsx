import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Linking, Platform, Share, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import BrandWorkReview from '../src/screens/BrandWorkReview';
import RateCreatorSheet from '../src/components/RateCreatorSheet';
import { Alert } from '../src/components/AppAlert';
import {
  approveWork, getBusinessDeals, getPendingWork, getWorkDownloadLink, getWorkReview, postReview,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  getPendingWork: jest.fn(), getWorkReview: jest.fn(), getBusinessDeals: jest.fn(),
  approveWork: jest.fn(), postReview: jest.fn(), getWorkDownloadLink: jest.fn(),
  requestWorkRevision: jest.fn(), getCampaignWork: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.clearAllMocks();
  (getBusinessDeals as jest.Mock).mockResolvedValue([]);
  (getWorkReview as jest.Mock).mockResolvedValue([]);
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
const pending = (n: number, extra: any = {}) => ({
  id: `w${n}`, campaign_id: 'c1', creator_id: 'u1', creator_name: 'Arushi', campaign_title: 'Launch',
  preview_url: `https://cdn.example.com/v${n}.mp4`, submitted_at: '2026-10-01T00:00:00Z', ...extra,
});

async function render(props: any = {}) {
  await act(async () => {
    tree = Renderer.create(<BrandWorkReview token="t" onBack={() => {}} onNavigate={() => {}} {...props} />);
  });
}

test('pending rows get the per-deal revision numbers from the work-review list', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1)]);
  (getWorkReview as jest.Mock).mockResolvedValue([
    { id: 'c1', campaignId: 'c1', creatorId: 'u1', status: 'pending_review', revisionsUsed: 1, freeRevisionLimit: 2, freeRevisionsRemaining: 1, nextRevisionFee: 0, paidRevisionFee: 750 },
  ]);
  await render();
  await act(async () => { button('Request Revision').props.onPress(); });
  const popup = (Alert.alert as jest.Mock).mock.calls.find(call => /second revision/i.test(call[0]));
  expect(popup).toBeTruthy();
  expect(String(popup![1])).toContain('₹750');
});

test('rows are paged ten at a time with a footer', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue(Array.from({ length: 12 }, (_, i) => pending(i + 1, { campaign_title: `Brief ${i + 1}` })));
  await render();
  expect(content(tree.toJSON())).toContain('Showing 1-10 of 12 results');
  expect(content(tree.toJSON())).toContain('Brief 10');
  expect(content(tree.toJSON())).not.toContain('Brief 11');
  await act(async () => { button('Next page').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Showing 11-12 of 12 results');
  expect(content(tree.toJSON())).toContain('Brief 11');
});

test('the campaign opens from its row, and Message creator opens the native thread', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1)]);
  const onNavigate = jest.fn();
  const onOpenThread = jest.fn();
  await render({ onNavigate, onOpenThread });
  await act(async () => { button('Open campaign Launch').props.onPress(); });
  expect(onNavigate).toHaveBeenCalledWith('/campaigns/c1');
  await act(async () => { button('Message Arushi').props.onPress(); });
  expect(onOpenThread).toHaveBeenCalledWith('u1', 'Arushi');
});

test('file type is the real file\'s, not a default MP4', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1, { preview_url: 'https://cdn.example.com/final.mov' })]);
  await render();
  expect(content(tree.toJSON())).toContain('MOV');
});

test('approving a final video words the result and offers a review; the review is posted', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1)]);
  (approveWork as jest.Mock).mockResolvedValue({ payout_status: 'released' });
  (postReview as jest.Mock).mockResolvedValue({});
  await render();
  await act(async () => { button('Approve').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  expect(confirm[1]).toContain('once every deliverable');
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Approve').onPress(); });
  expect(approveWork).toHaveBeenCalledWith('t', 'w1');
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Approved')!;
  expect(done[1]).toContain('payment released');
  await act(async () => { done[2][0].onPress(); });
  const sheet = tree.root.findByType(RateCreatorSheet);
  expect(sheet.props.visible).toBe(true);
  await act(async () => { await sheet.props.onSubmit(4, 'Great'); });
  expect(postReview).toHaveBeenCalledWith('t', { campaign_id: 'c1', creator_id: 'u1', rating: 4, review: 'Great' });
  expect((Alert.alert as jest.Mock).mock.calls.some(call => call[0] === 'Review submitted')).toBe(true);
});

test('a raw or partial approval does not ask for a review (the server would refuse it)', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1, { stage: 'raw', edit_mode: 'creator' })]);
  (approveWork as jest.Mock).mockResolvedValue({ payout_status: 'awaiting_edited' });
  await render();
  await act(async () => { button('Approve raw - creator edits next').props.onPress(); });
  const confirm = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => { await confirm[2].find((b: any) => b.text === 'Approve').onPress(); });
  const done = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Approved')!;
  expect(done[1]).toContain('edited video next');
  expect(done[2][0].text).toBe('OK');
  await act(async () => { done[2][0].onPress(); });
  expect(tree.root.findByType(RateCreatorSheet).props.visible).toBe(false);
});

test('approved work downloads raw and edited through the server link', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([]);
  (getWorkReview as jest.Mock).mockResolvedValue([
    {
      id: 'c1', campaignId: 'c1', creatorId: 'u1', title: 'Launch', creator: 'Arushi', status: 'approved',
      files: ['https://cdn.example.com/a.mp4'],
      labeledFiles: [
        { kind: 'edited', label: 'Edited video', url: 'https://cdn.example.com/a.mp4' },
        { kind: 'raw', label: 'Raw video', url: 'https://cdn.example.com/r.mp4' },
      ],
    },
  ]);
  (getWorkDownloadLink as jest.Mock).mockResolvedValue({ url: 'https://s3.example.com/signed' });
  // The file stays in the app: never the browser, whichever platform.
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
  await render();
  expect(button('Download Edited video')).toBeTruthy();
  await act(async () => { await button('Download Raw video').props.onPress(); });
  expect(getWorkDownloadLink).toHaveBeenCalledWith('t', 'c1', 'raw');
  // iOS: the share sheet with the signed link.
  expect(share).toHaveBeenCalledWith({ url: 'https://s3.example.com/signed' });
  expect(open).not.toHaveBeenCalled();
});

test('on Android the download goes to the download manager through an in-app webview, not the browser', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  (getPendingWork as jest.Mock).mockResolvedValue([]);
  (getWorkReview as jest.Mock).mockResolvedValue([
    {
      id: 'c1', campaignId: 'c1', creatorId: 'u1', title: 'Launch', creator: 'Arushi', status: 'approved',
      files: ['https://cdn.example.com/a.mp4'],
      labeledFiles: [
        { kind: 'edited', label: 'Edited video', url: 'https://cdn.example.com/a.mp4' },
        { kind: 'raw', label: 'Raw video', url: 'https://cdn.example.com/r.mp4' },
      ],
    },
  ]);
  (getWorkDownloadLink as jest.Mock).mockResolvedValue({ url: 'https://s3.example.com/signed' });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  await render();
  await act(async () => { await button('Download Raw video').props.onPress(); });
  const loader = tree.root.findAllByType(WebView);
  expect(loader).toHaveLength(1);
  expect(loader[0].props.source).toEqual({ uri: 'https://s3.example.com/signed' });
  expect(content(tree.toJSON())).toContain('Downloading');
  expect(open).not.toHaveBeenCalled();
});

test('a refused download shows the server reason', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([]);
  (getWorkReview as jest.Mock).mockResolvedValue([
    { id: 'c1', campaignId: 'c1', creatorId: 'u1', title: 'Launch', creator: 'Arushi', status: 'approved', files: ['https://cdn.example.com/a.mp4'], labeledFiles: [] },
  ]);
  (getWorkDownloadLink as jest.Mock).mockRejectedValue(new Error('Download unlocks after you approve the work'));
  await render();
  await act(async () => { await button('Download').props.onPress(); });
  const failed = (Alert.alert as jest.Mock).mock.calls.find(call => call[0] === 'Download failed')!;
  expect(failed[1]).toContain('unlocks after you approve');
});

test('a failed load shows the reason with Retry and keeps the retry working', async () => {
  const offline: any = new Error('x');
  offline.name = 'NetworkError';
  (getPendingWork as jest.Mock).mockRejectedValueOnce(offline);
  await render();
  expect(content(tree.toJSON())).toContain("You're offline");
  expect(content(tree.toJSON())).toContain("Couldn't load submissions");
  (getPendingWork as jest.Mock).mockResolvedValue([pending(1)]);
  await act(async () => { button('Retry loading submissions').props.onPress(); });
  expect(content(tree.toJSON())).toContain('Launch');
  expect(content(tree.toJSON())).not.toContain("You're offline");
});
