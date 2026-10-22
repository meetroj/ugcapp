/**
 * @format
 * QA round 22 Oct 2026 (creator side + auth + notifications):
 *  #25 login field takes email OR phone and tells iOS Passwords it is the username
 *  #15 "Show Earnings" is a creator setting, never offered to a brand
 *  #24 the private-brief pop-up uses the shared branded alert, not the native grey one
 *  #23 every campaign link a creator can receive lands on a screen that exists
 *  #5/#13 the onboarding bar clears the status bar on iOS and edge-to-edge Android
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginForm } from '../src/screens/LoginScreen';
import PrivacySecurity from '../src/screens/PrivacySecurity';
import OnboardingWebView from '../src/screens/OnboardingWebView';
import { normalizePath, roleGate } from '../src/screens/WebShell';
import { cardDealPath } from '../src/actionCards';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  verifySession: jest.fn(async (session: unknown) => session),
  getPrivacyPrefs: jest.fn(async () => ({ public_profile: true, show_earnings: false, allow_messages: true })),
  savePrivacyPrefs: jest.fn(async () => undefined),
  getChatWarnings: jest.fn(async () => ({ warning_count: 0 })),
}));

const fs = require('fs');
const path = require('path');

const metrics = (top: number) => ({
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top, left: 0, right: 0, bottom: 34 },
});

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType('Text' as never)
    .map(n => n.children.filter(c => typeof c === 'string').join(''))
    .filter(Boolean);

test('login: one identifier field (email or phone) marked as the username, and a password field', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<LoginForm onGoToSignUp={() => {}} />);
  });
  const [identifier, password] = tree.root.findAllByType('TextInput' as never);
  expect(identifier.props.placeholder).toBe('Email or phone number');
  // 'emailAddress' made iOS suggest only the contact-card phone number.
  expect(identifier.props.textContentType).toBe('username');
  expect(identifier.props.autoComplete).toBe('username');
  expect(password.props.textContentType).toBe('password');
  expect(textsOf(tree)).toContain('Email or phone number');
});

describe('Privacy & Security', () => {
  const render = async (role: string) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics(47)}>
          <PrivacySecurity token="t" role={role} onBack={() => {}} onNavigate={() => {}} />
        </SafeAreaProvider>,
      );
    });
    return tree;
  };

  it('offers Show Earnings to a creator', async () => {
    const tree = await render('creator');
    expect(textsOf(tree)).toContain('Show Earnings');
  });

  it('never offers Show Earnings to a brand, but keeps the other switches', async () => {
    const tree = await render('business');
    const texts = textsOf(tree);
    expect(texts).not.toContain('Show Earnings');
    expect(texts).toEqual(expect.arrayContaining(['Public Profile', 'Allow Direct Messages']));
  });
});

test('the private-brief pop-up goes through the shared branded alert', () => {
  const src: string = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'CreatorHome.tsx'),
    'utf8',
  );
  expect(src).toMatch(/import \{ Alert \} from '\.\.\/components\/AppAlert'/);
  // A native Alert renders the grey translucent iOS sheet.
  expect(src).not.toMatch(/^\s+Alert,\s*$/m);
});

test('campaign links a creator can receive all land on a native screen, never the website 404', () => {
  const land = (link: string) => roleGate(normalizePath(link, 'creator'), 'creator');
  expect(land('/campaigns/c9')).toBe('/browse-briefs?open=c9');
  expect(land('/campaign/c9')).toBe('/browse-briefs?open=c9');
  expect(land('/dashboard/business/campaign/c9?creator=u1')).toBe('/browse-briefs?open=c9');
  expect(land('/my-deals?campaign=c9')).toBe('/my-deals/c9');
  // The chat card's "Open the deal" for a creator.
  expect(land(cardDealPath('creator', { campaign_id: 'c9' })!)).toBe('/my-deals/c9');
  expect(land(cardDealPath('creator', { deal_id: 'DEAL-1' })!)).toBe('/my-deals/DEAL-1');
});

describe('creator onboarding bar clears the status bar', () => {
  const session: any = { user_id: 'u1', role: 'creator', token: 't', profile_completed: false };
  const rootPadding = async (top: number) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics(top)}>
          <OnboardingWebView session={session} onDone={() => {}} onLogout={() => {}} />
        </SafeAreaProvider>,
      );
    });
    const style = StyleSheetFlatten(tree.root.findAllByType('View' as never)[0].props.style);
    act(() => tree.unmount());
    return style.paddingTop;
  };
  // Local flatten: the root View carries a style array.
  const StyleSheetFlatten = (style: any) => require('react-native').StyleSheet.flatten(style);

  it('pads by the iOS notch inset', async () => {
    expect(await rootPadding(47)).toBe(47);
  });

  it('falls back to the status-bar height when edge-to-edge Android reports 0', async () => {
    const os = Platform.OS;
    (Platform as any).OS = 'android';
    (StatusBar as any).currentHeight = 30;
    try {
      expect(await rootPadding(0)).toBe(30);
    } finally {
      (Platform as any).OS = os;
    }
  });
});
