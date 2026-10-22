/**
 * Links our own pages hand out for a file on our storage (a PDF, a picture) open in the
 * app's viewer. Every other off-site link keeps its existing behaviour.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import WebView from 'react-native-webview';
import WebShell from '../src/screens/WebShell';
import OnboardingWebView from '../src/screens/OnboardingWebView';
import TeamAcceptWebView from '../src/screens/TeamAcceptWebView';

const DOC = 'https://ugcad-media.s3.ap-south-1.amazonaws.com/docs/contract.pdf';
const PAGE = 'https://example.com/somewhere';
const creator: any = { user_id: 'c1', role: 'creator', profile_completed: true };

let tree: any;
let link: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (globalThis as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
  link = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const pageWebView = () => tree.root.findAllByType(WebView)[0];

describe.each([
  ['WebShell', 'onShouldStartLoadWithRequest', () => (
    <WebShell token="t" session={creator} onLogout={() => {}} initialPath="/creator-guide" />
  )],
  ['OnboardingWebView', 'onShouldStartLoadWithRequest', () => (
    <OnboardingWebView session={creator} onDone={() => {}} onLogout={() => {}} onCancel={() => {}} />
  )],
  ['TeamAcceptWebView', 'onShouldStartLoadWithRequest', () => (
    <TeamAcceptWebView token="t" onSession={() => {}} onClose={() => {}} />
  )],
] as [string, string, () => React.ReactElement][])('%s', (_name, prop, element) => {
  test('a file on our storage opens in the in-app viewer, not the browser', async () => {
    await act(async () => { tree = ReactTestRenderer.create(element()); });
    const page = pageWebView();
    expect(page).toBeTruthy();
    let allowed: boolean | undefined;
    act(() => { allowed = page.props[prop]({ url: DOC }); });
    expect(allowed).toBe(false);
    expect(link).not.toHaveBeenCalled();
    // The page's WebView plus the viewer's document WebView.
    expect(tree.root.findAllByType(WebView).some((w: any) => w.props.source?.uri === DOC)).toBe(true);
  });

  test('any other off-site link still goes out as before', async () => {
    await act(async () => { tree = ReactTestRenderer.create(element()); });
    act(() => { pageWebView().props[prop]({ url: PAGE }); });
    expect(link).toHaveBeenCalledWith(PAGE);
  });
});
