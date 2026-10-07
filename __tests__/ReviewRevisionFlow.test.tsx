import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import Video from 'react-native-video';
import { launchImageLibrary } from 'react-native-image-picker';
import BrandCampaignDetail from '../src/screens/BrandCampaignDetail';
import BrandWorkReview from '../src/screens/BrandWorkReview';
import DealDetails from '../src/screens/DealDetails';
import { Alert } from '../src/components/AppAlert';
import { getCampaign, getCampaignWork, getBusinessDeals, getPendingWork, getWorkReview,
  getMyDeals, uploadMedia, submitWork } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com', getCampaign: jest.fn(), getCampaignWork: jest.fn(),
  getBusinessDeals: jest.fn(), getPendingWork: jest.fn(), getWorkReview: jest.fn(),
  getMyDeals: jest.fn(), uploadMedia: jest.fn(), submitWork: jest.fn(),
}));

let tree: any;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  (getBusinessDeals as jest.Mock).mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null; jest.useRealTimers(); jest.restoreAllMocks();
});
const content = (node: any): string => typeof node === 'string' ? node : (node?.children || []).map(content).join('');
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find(
  (node: any) => content(node) === label || node.props.accessibilityLabel === label,
)!;
const oldVersion = { id: 'v1', version: 1, status: 'revision_requested', video_url: 'https://cdn.example.com/old.mp4' };
const deal = { deal_id: 'd1', campaign: { id: 'c1', title: 'Launch' }, creator: { name: 'Arushi' },
  current_state: 'Revision Requested', can_submit_content: true,
  content_submission: { versions: [oldVersion] }, revision_tracker: { latest_feedback: 'Change the opening' } };

test('creator refresh keeps the previous upload and revised upload adds a new version', async () => {
  const next = { ...deal, current_state: 'Content Submitted — Awaiting Review', can_submit_content: false,
    content_submission: { versions: [oldVersion, { id: 'v2', version: 2, status: 'submitted', video_url: 'https://cdn.example.com/new.mp4' }] } };
  (getMyDeals as jest.Mock).mockResolvedValue([deal]);
  (launchImageLibrary as jest.Mock).mockResolvedValue({ assets: [{ uri: 'file:///new.mp4', type: 'video/mp4', fileName: 'new.mp4' }] });
  (uploadMedia as jest.Mock).mockResolvedValue('https://cdn.example.com/new.mp4');
  (submitWork as jest.Mock).mockResolvedValue({});
  await act(async () => {
    tree = Renderer.create(<DealDetails deal={deal} token="t" onBack={() => {}} onChat={() => {}} />);
  });
  expect(content(tree.toJSON())).toContain('Revision requested');
  expect(content(tree.toJSON())).toContain('Change the opening');
  expect(button('Preview')).toBeTruthy();
  await act(async () => { await tree.root.findByType(RefreshControl).props.onRefresh(); });
  expect(getMyDeals).toHaveBeenCalledWith('t');
  expect(button('Upload revised video')).toBeTruthy();
  (getMyDeals as jest.Mock).mockResolvedValue([next]);
  await act(async () => { await button('Upload revised video').props.onPress(); });
  expect(submitWork).toHaveBeenCalledWith('t', 'c1', expect.objectContaining({ work_files: ['https://cdn.example.com/new.mp4'] }));
  expect(tree.root.findAllByType(TouchableOpacity).filter((node: any) => content(node) === 'Preview')).toHaveLength(2);
  expect(content(tree.toJSON())).not.toContain('Upload revised video');
});

test('creator deal automatically refreshes in foreground', async () => {
  let foreground: any;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    foreground = callback; return { remove: jest.fn() };
  });
  (getMyDeals as jest.Mock).mockResolvedValue([{ ...deal, current_state: 'Content Submitted — Awaiting Review' }]);
  await act(async () => {
    tree = Renderer.create(<DealDetails deal={deal} token="t" onBack={() => {}} onChat={() => {}} />);
  });
  await act(async () => { foreground('active'); });
  expect(getMyDeals).toHaveBeenCalledWith('t');
  expect(content(tree.toJSON())).toContain('Content Submitted');
});

test('brand overview displays revision and campaign review opens a full video with controls', async () => {
  (getCampaign as jest.Mock).mockResolvedValue({ id: 'c1', title: 'Launch', status: 'in_progress' });
  (getCampaignWork as jest.Mock).mockResolvedValue([{ id: 'w1', status: 'revision_requested', preview_url: oldVersion.video_url }]);
  await act(async () => {
    tree = Renderer.create(<BrandCampaignDetail token="t" campaignId="c1" onBack={() => {}} onNavigate={() => {}} />);
  });
  expect(content(tree.toJSON())).toContain('Revision requested');
  await act(async () => { button('Work Review (1)').props.onPress(); });
  expect(content(tree.toJSON())).toContain('awaiting');
  await act(async () => { button('Open full-screen video').props.onPress(); });
  const players = tree.root.findAllByType(Video).filter((node: any) => node.props.controls);
  expect(players).toHaveLength(1);
  expect(players[0].props.source.uri).toBe(oldVersion.video_url);
  expect(players[0].props.resizeMode).toBe('contain');
});

test('brand review decisions share a row and earlier versions stay visible', async () => {
  (getPendingWork as jest.Mock).mockResolvedValue([{ id: 'w2', campaign_title: 'Launch', preview_url: 'https://cdn.example.com/new.mp4' }]);
  (getWorkReview as jest.Mock).mockResolvedValue([]);
  (getBusinessDeals as jest.Mock).mockResolvedValue([{ ...deal, content_submission: { versions: [oldVersion, { id: 'v2', video_url: 'https://cdn.example.com/new.mp4' }] } }]);
  await act(async () => {
    tree = Renderer.create(<BrandWorkReview token="t" onBack={() => {}} onNavigate={() => {}} />);
  });
  const approve = button('Approve');
  const revision = button('Request Revision');
  expect(approve.parent).toBe(revision.parent);
  expect(StyleSheet.flatten(approve.parent!.props.style).flexDirection).toBe('row');
  expect(content(tree.toJSON())).toContain('Previous upload');
  await act(async () => { button('Open full-screen video').props.onPress(); });
  expect(tree.root.findAllByType(Video).some((node: any) => node.props.controls)).toBe(true);
});
