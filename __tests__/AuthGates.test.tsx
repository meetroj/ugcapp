/**
 * @format
 * Auth, gates and onboarding: more-info resubmission, deep links into the auth
 * forms, sign-up country codes, the rejected-application screen, the agreement
 * gate and the legal documents.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Linking, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthFlow from '../src/screens/AuthFlow';
import { SignUpForm } from '../src/screens/SignUpScreen';
import RoleSelector from '../src/components/RoleSelector';
import OnboardingWebView, {
  onboardingFinished,
} from '../src/screens/OnboardingWebView';
import ApprovalGate, {
  buildSupportLinks,
  rejectionReasonLabel,
} from '../src/screens/ApprovalGate';
import TeamAcceptWebView from '../src/screens/TeamAcceptWebView';
import { WebView } from 'react-native-webview';
import AgreementGate from '../src/screens/AgreementGate';
import LegalDocument from '../src/screens/LegalDocument';
import * as api from '../src/api';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  verifySession: jest.fn(),
  login: jest.fn(async () => ({
    user_id: 'u1',
    role: 'creator',
    token: 't',
    profile_completed: true,
  })),
  forgotPassword: jest.fn(async () => undefined),
  verifyResetCode: jest.fn(async () => undefined),
  resetPassword: jest.fn(async () => undefined),
  getAgreement: jest.fn(),
  acceptAgreement: jest.fn(async () => undefined),
}));

const mocked = api as jest.Mocked<typeof api>;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withProvider(node: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType('Text' as never)
    .map(n => n.children.filter(c => typeof c === 'string').join(''))
    .filter(Boolean);
}

function pressable(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll(
      n =>
        typeof n.type !== 'string' &&
        typeof n.props.onPress === 'function' &&
        n
          .findAllByType('Text' as never)
          .some(
            t =>
              t.children.filter(c => typeof c === 'string').join('') === label,
          ),
    )
    .at(0)!;
}

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    await pressable(tree, label).props.onPress();
  });
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('more-info resubmission (OnboardingWebView)', () => {
  const session: any = {
    user_id: 'u1',
    role: 'business',
    token: 't',
    profile_completed: true,
    approval_status: 'more_info',
  };

  it('knows when the form was really submitted', () => {
    const waiting: any = { profile_completed: true, approval_status: 'more_info' };
    const resubmitted: any = { profile_completed: true, approval_status: 'pending' };
    // Reopened: profile_completed is already true, so it proves nothing.
    expect(onboardingFinished(waiting, true)).toBe(false);
    expect(onboardingFinished(resubmitted, true)).toBe(true);
    // First time through: profile_completed is the signal.
    expect(onboardingFinished({ profile_completed: false } as any, false)).toBe(false);
    expect(onboardingFinished({ profile_completed: true } as any, false)).toBe(true);
    expect(onboardingFinished(null, true)).toBe(false);
  });

  it('stays open while approval_status is still more_info, closes once pending', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    mocked.verifySession.mockResolvedValue({ ...session });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <OnboardingWebView
          session={session}
          reopened
          onCancel={() => {}}
          onDone={onDone}
          onLogout={() => {}}
        />,
      );
    });

    // Several polls (well past the old 4 second auto-close): still open.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
    }
    expect(mocked.verifySession).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    mocked.verifySession.mockResolvedValue({
      ...session,
      approval_status: 'pending',
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('first-time onboarding still closes when profile_completed flips', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const fresh: any = { ...session, approval_status: 'pending', profile_completed: false };
    mocked.verifySession.mockResolvedValue({ ...fresh, profile_completed: true });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <OnboardingWebView session={fresh} onDone={onDone} onLogout={() => {}} />,
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('Back returns to the more-info screen instead of logging out', async () => {
    jest.useFakeTimers();
    mocked.verifySession.mockResolvedValue({ ...session });
    const onCancel = jest.fn();
    const onLogout = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <OnboardingWebView
          session={session}
          reopened
          onCancel={onCancel}
          onDone={() => {}}
          onLogout={onLogout}
        />,
      );
    });
    await press(tree, 'Back');
    expect(onCancel).toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('deep links into the auth forms (AuthFlow)', () => {
  const render = (props: Partial<React.ComponentProps<typeof AuthFlow>> = {}) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        withProvider(<AuthFlow onAuthenticated={jest.fn()} {...props} />),
      );
    });
    return tree;
  };

  it('?view=reset&email= opens on the code step with the email filled in', () => {
    const tree = render({
      initialLink: { kind: 'auth', view: 'reset', email: 'a@b.com' },
    });
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Reset password']));
    expect(textsOf(tree).join(' ')).toContain('Enter the 6-digit code sent to a@b.com');
  });

  it('?mode=signup&role=business opens sign-up with Brand selected', () => {
    const tree = render({
      initialLink: { kind: 'auth', mode: 'signup', role: 'business' },
    });
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Create account']));
    expect(tree.root.findByType(RoleSelector).props.value).toBe('brand');
  });

  it('?email= prefills the login form', () => {
    const tree = render({ initialLink: { kind: 'auth', email: 'x@y.com' } });
    const [email] = tree.root.findAllByType('TextInput' as never);
    expect(email.props.value).toBe('x@y.com');
  });

  it('carries the typed email into Forgot password', async () => {
    const tree = render();
    const [email] = tree.root.findAllByType('TextInput' as never);
    act(() => {
      email.props.onChangeText('typed@me.com');
    });
    await press(tree, 'Forgot password?');
    const [forgotEmail] = tree.root.findAllByType('TextInput' as never);
    expect(forgotEmail.props.value).toBe('typed@me.com');
  });

  it('lets a short password through to the server at login', async () => {
    const onAuthenticated = jest.fn();
    const tree = render({ onAuthenticated });
    const [email, password] = tree.root.findAllByType('TextInput' as never);
    act(() => {
      email.props.onChangeText('old@account.com');
      password.props.onChangeText('abc');
    });
    await press(tree, 'Log In');
    expect(mocked.login).toHaveBeenCalledWith('old@account.com', 'abc');
    expect(onAuthenticated).toHaveBeenCalled();
  });

  it('"Back to code" returns from the new-password step to the code step', async () => {
    const tree = render({
      initialLink: { kind: 'auth', view: 'reset', email: 'a@b.com' },
    });
    const [code] = tree.root.findAllByType('TextInput' as never);
    act(() => {
      code.props.onChangeText('123456');
    });
    await press(tree, 'Verify code');
    expect(mocked.verifyResetCode).toHaveBeenCalledWith('a@b.com', '123456');
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Save password']));

    await press(tree, 'Back to code');
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Verify code']));
  });
});

describe('sign-up country code and phone error', () => {
  const render = (onSubmit = jest.fn(async () => {})) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        withProvider(<SignUpForm onGoToLogin={() => {}} onSubmit={onSubmit} />),
      );
    });
    return { tree, onSubmit };
  };

  it('shows the phone error under the field, not only in an alert', () => {
    const { tree } = render();
    const [, phone] = tree.root.findAllByType('TextInput' as never);
    act(() => {
      phone.props.onChangeText('12345');
    });
    expect(textsOf(tree)).toEqual(
      expect.arrayContaining(['Enter a valid 10-digit mobile number.']),
    );
  });

  it('sends the chosen dial code and its length (+61 is 9 digits)', async () => {
    const { tree, onSubmit } = render();
    const choice = tree.root.findByProps({ title: 'Country code' });
    act(() => {
      choice.props.options.find((o: any) => o.label === '+61').onPress();
    });
    const [email, phone, password] = tree.root.findAllByType('TextInput' as never);
    act(() => {
      email.props.onChangeText('c@x.com');
      phone.props.onChangeText('412345678');
      password.props.onChangeText('secret1');
    });
    await press(tree, 'Create Account');
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '412345678', dialCode: '+61' }),
    );
  });
});

describe('rejected application (ApprovalGate)', () => {
  it('maps reason codes like the website and hides "other"', () => {
    expect(rejectionReasonLabel('duplicate_account')).toBe('Duplicate account');
    expect(rejectionReasonLabel('other')).toBeNull();
    expect(rejectionReasonLabel(undefined)).toBeNull();
  });

  it('builds email, WhatsApp and call links with the account filled in', () => {
    const links = buildSupportLinks({ email: 'me@x.com', id: 'u9', role: 'creator' });
    expect(links.mailto.startsWith('mailto:support@ugcad.io?subject=')).toBe(true);
    expect(decodeURIComponent(links.mailto)).toContain('Account email: me@x.com');
    expect(decodeURIComponent(links.mailto)).toContain('Account ID: u9');
    expect(links.whatsapp).toContain('https://wa.me/');
    expect(links.tel.startsWith('tel:')).toBe(true);
  });

  it('shows the review team reason and the three contact options', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        withProvider(
          <ApprovalGate
            kind="creator"
            status="rejected"
            review={{
              reason_code: 'unverifiable_socials',
              reason_details: 'Instagram handle is private.',
            }}
            account={{ email: 'me@x.com' }}
            onRefresh={async () => {}}
          />,
        ),
      );
    });
    const texts = textsOf(tree);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Application not approved',
        'Reason from our review team',
        'Social profiles could not be verified',
        'Instagram handle is private.',
        'Email support',
        'WhatsApp',
        'Call us',
      ]),
    );
    act(() => {
      tree.root.findByProps({ testID: 'support-whatsapp' }).props.onPress();
    });
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/'));
  });
});

describe('agreement gate', () => {
  it('enables Agree on its own when the whole agreement fits on screen', async () => {
    mocked.getAgreement.mockResolvedValue({
      accepted: false,
      version: '1',
      title: 'Creator Agreement',
      last_updated: 'July 2026',
      intro: 'Short.',
      preview_sections: 1,
      sections: [{ n: '1', heading: 'Only', body: 'Body' }],
    });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <AgreementGate token="t" onAccepted={() => {}} />,
      );
    });
    await press(tree, 'View full agreement');
    // Nothing to scroll: the scroll view reports content no taller than itself.
    const scroll = tree.root.findByType(ScrollView);
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      scroll.props.onContentSizeChange(300, 200);
    });
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Agree & Continue']));
  });
});

describe('legal documents', () => {
  const render = (docId: any) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <LegalDocument docId={docId} onBack={() => {}} />,
      );
    });
    return tree;
  };

  it('links only the privacy policy, which is the one page that exists', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    const privacy = render('/privacy-policy');
    expect(textsOf(privacy)).toEqual(
      expect.arrayContaining(['Read the full privacy policy']),
    );
    act(() => {
      pressable(privacy, 'Read the full privacy policy').props.onPress();
    });
    expect(open).toHaveBeenCalledWith('https://www.ugcad.io/privacy');

    for (const id of ['/terms', '/community-guidelines', '/cookie-policy']) {
      const t = render(id);
      expect(textsOf(t).join(' ')).not.toContain('Read the full');
      expect(textsOf(t)).toEqual(expect.arrayContaining(['Last updated July 2026']));
    }
  });

  it('uses the website copy', () => {
    expect(textsOf(render('/terms'))).toEqual(
      expect.arrayContaining(['Acceptance of terms', 'Limitation of liability']),
    );
  });
});

describe('team invitation (TeamAcceptWebView)', () => {
  const render = (onSession = jest.fn()) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        withProvider(
          <TeamAcceptWebView token="tok/1" onSession={onSession} onClose={() => {}} />,
        ),
      );
    });
    return { tree, onSession };
  };

  it('loads the website accept form with the token', () => {
    const { tree } = render();
    expect(tree.root.findByType(WebView).props.source.uri).toContain(
      '/team/accept?token=tok%2F1',
    );
  });

  it('turns the token the page stores into a native session', async () => {
    mocked.verifySession.mockResolvedValue({
      id: 'u2',
      role: 'business',
      token: 'jwt',
    } as any);
    const { tree, onSession } = render();
    await act(async () => {
      await tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data: 'jwt' } });
    });
    expect(onSession).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u2', token: 'jwt' }),
    );
  });

  it('ignores a token it could not verify (offline)', async () => {
    // verifySession hands the input back unchanged when the request fails.
    mocked.verifySession.mockImplementation(async s => s);
    const { tree, onSession } = render();
    await act(async () => {
      await tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data: 'jwt' } });
    });
    expect(onSession).not.toHaveBeenCalled();
  });
});
