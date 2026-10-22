/**
 * Pictures, videos and documents open INSIDE the app. The brand shipment screen
 * (label PDF, courier slip, unboxing video) is rendered for real; the viewer's own
 * rules (what counts as our storage, which kind a link is) are checked directly.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Linking, Modal, Platform, Share } from 'react-native';
import WebView from 'react-native-webview';
import Video from 'react-native-video';
import BrandShipmentDetail from '../src/screens/BrandShipmentDetail';
import { isOwnStorageUrl, mediaKindOf } from '../src/components/MediaViewer';

let tree: Renderer.ReactTestRenderer;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const byTestId = (id: string) =>
  tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const byLabel = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const open = () => tree.root.findAllByType(Modal).filter(m => m.props.visible);

const SHIPMENT = {
  status: 'in_transit', tracking_number: '1234567', courier_name: 'Delhivery',
  label_url: 'https://ugcad-media.s3.ap-south-1.amazonaws.com/labels/C1.pdf',
  courier_slip: 'https://ugcad-media.s3.ap-south-1.amazonaws.com/slips/s.jpg',
  unboxing_video: 'https://ugcad-media.s3.ap-south-1.amazonaws.com/unbox/u.mp4',
  shipment_checklist: { sealed: true, correct_item: true, working: true },
};

async function mount() {
  (globalThis as any).fetch = jest.fn(async () => ok(SHIPMENT));
  await act(async () => {
    tree = Renderer.create(<BrandShipmentDetail token="t" campaignId="C1" onBack={() => {}} />);
  });
}

afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('links are classified by file name, and only our own storage counts as storage', () => {
  expect(mediaKindOf('https://x.test/a.JPG?sig=1')).toBe('image');
  expect(mediaKindOf('https://x.test/a.mp4')).toBe('video');
  expect(mediaKindOf('https://res.cloudinary.com/c/video/upload/v1/clip')).toBe('video');
  expect(mediaKindOf('https://x.test/label.pdf')).toBe('file');
  expect(isOwnStorageUrl('https://ugcad-media.s3.ap-south-1.amazonaws.com/a.pdf')).toBe(true);
  expect(isOwnStorageUrl('https://res.cloudinary.com/c/image/upload/a.png')).toBe(true);
  expect(isOwnStorageUrl('https://other.s3.amazonaws.com/a.pdf')).toBe(false);
  expect(isOwnStorageUrl('https://youtube.com/watch?v=1')).toBe(false);
});

test('iOS: the shipping label PDF opens in an in-app viewer with Close and Share', async () => {
  const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction } as never);
  await mount();
  expect(open()).toHaveLength(0);
  act(() => byTestId('download-label').props.onPress());
  expect(tree.root.findAllByType(WebView)[0].props.source).toEqual({ uri: SHIPMENT.label_url });
  await act(async () => { byLabel('Share file').props.onPress(); });
  expect(share).toHaveBeenCalledWith({ url: SHIPMENT.label_url });
  act(() => byLabel('Close viewer').props.onPress());
  expect(tree.root.findAllByType(WebView)).toHaveLength(0);
  expect(link).not.toHaveBeenCalled();
});

test('Android: the label goes to the download manager through the in-app loader', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  await mount();
  await act(async () => { byTestId('download-label').props.onPress(); });
  const loader = tree.root.findAllByType(WebView);
  expect(loader).toHaveLength(1);
  expect(loader[0].props.source).toEqual({ uri: SHIPMENT.label_url });
  expect(open()).toHaveLength(0);
  expect(link).not.toHaveBeenCalled();
});

test('the courier slip picture and the unboxing video open full-screen in the app', async () => {
  const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  await mount();
  act(() => byTestId('view-slip').props.onPress());
  expect(tree.root.findByProps({ testID: 'media-image' }).props.source).toEqual({ uri: SHIPMENT.courier_slip });
  act(() => byLabel('Close viewer').props.onPress());
  expect(tree.root.findAllByProps({ testID: 'media-image' })).toHaveLength(0);
  act(() => byTestId('view-unboxing').props.onPress());
  expect(tree.root.findAllByType(Video)[0].props.source).toEqual({ uri: SHIPMENT.unboxing_video });
  expect(link).not.toHaveBeenCalled();
});
