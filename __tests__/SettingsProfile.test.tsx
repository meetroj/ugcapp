/**
 * @format
 *
 * Settings, profile and portfolio fixes (W8b): request shapes the backend
 * accepts, the 8-character password rule, typed delete confirmation, the 5 MB
 * image gate, the kept company pincode, account standing copy and the brand
 * team helpers.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {launchImageLibrary} from 'react-native-image-picker';
import {
  changePassword,
  deleteAccount,
  normalizePrivacy,
  removeBusinessLogo,
  savePortfolio,
  uploadBusinessLogo,
} from '../src/api';
import {Alert} from '../src/components/AppAlert';
import {accountStanding} from '../src/accountStanding';
import {profilePercent} from '../src/profileCompletion';
import {imageTooLarge, MAX_PROFILE_IMAGE_BYTES} from '../src/profileImage';
import AccountSecurity from '../src/screens/AccountSecurity';
import BrandSettings from '../src/screens/BrandSettings';
import {budgetPercent, canManageTeam, inviteEmailError} from '../src/screens/BrandTeam';
import CreatorProfile from '../src/screens/CreatorProfile';

const g = globalThis as unknown as {fetch: typeof fetch};
const realFetch = g.fetch;

type Sent = {url: string; init: RequestInit};

/** Answers every request from `routes` (first key contained in the URL), recording each one. */
function mockFetch(routes: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  g.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({url: String(url), init: init || {}});
    const key = Object.keys(routes).find(k => String(url).includes(k));
    return {
      ok: true,
      status: 200,
      json: async () => (key ? routes[key] : {}),
    };
  }) as unknown as typeof fetch;
  return sent;
}

afterEach(() => {
  g.fetch = realFetch;
  jest.restoreAllMocks();
});

const bodyOf = (s: Sent) => JSON.parse(String(s.init.body || 'null'));

const textOf = (n: any): string =>
  typeof n === 'string' ? n : (n.children || []).map(textOf).join('');

/** Calls onPress of the first pressable whose text contains `text`. */
async function press(tree: ReactTestRenderer.ReactTestRenderer, text: string) {
  const hit = tree.root.findAll(
    n => typeof n.props.onPress === 'function' && textOf(n).includes(text),
  )[0];
  expect(hit).toBeDefined();
  await ReactTestRenderer.act(async () => {
    hit.props.onPress();
  });
}

async function typeInto(
  tree: ReactTestRenderer.ReactTestRenderer,
  placeholder: string,
  value: string,
) {
  const input = tree.root.findAll(
    n => n.props.placeholder === placeholder && !!n.props.onChangeText,
  )[0];
  expect(input).toBeDefined();
  await ReactTestRenderer.act(async () => {
    input.props.onChangeText(value);
  });
}

describe('api request shapes', () => {
  test('savePortfolio sends a BARE JSON array (PATCH /profile/portfolio takes List[Any])', async () => {
    const sent = mockFetch();

    await savePortfolio('tok', [{title: 'a', urls: ['u']}]);

    expect(sent[0].url).toContain('/api/profile/portfolio');
    expect(sent[0].init.method).toBe('PATCH');
    const body = bodyOf(sent[0]);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([{title: 'a', urls: ['u']}]);
  });

  test('savePortfolio sends [] (not {portfolio: []}) when the last clip is removed', async () => {
    const sent = mockFetch();

    await savePortfolio('tok', []);

    expect(bodyOf(sent[0])).toEqual([]);
  });

  test('changePassword sends a JSON body and keeps the passwords out of the URL', async () => {
    const sent = mockFetch();

    await changePassword('tok', 'OldPass12', 'NewPass123');

    expect(sent[0].url.endsWith('/api/profile/change-password')).toBe(true);
    expect(sent[0].url).not.toContain('?');
    expect(sent[0].init.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({
      old_password: 'OldPass12',
      new_password: 'NewPass123',
    });
  });

  test('deleteAccount is DELETE /api/profile', async () => {
    const sent = mockFetch();

    await deleteAccount('tok');

    expect(sent[0].url.endsWith('/api/profile')).toBe(true);
    expect(sent[0].init.method).toBe('DELETE');
  });

  test('brand logo upload is multipart POST and removal is DELETE /business/settings/logo', async () => {
    const sent = mockFetch({'/business/settings/logo': {logo_url: '/uploads/l.png'}});

    const url = await uploadBusinessLogo('tok', {uri: 'file:///l.png', type: 'image/png'});
    await removeBusinessLogo('tok');

    expect(url).toBe('/uploads/l.png');
    expect(sent[0].url).toContain('/api/business/settings/logo');
    expect(sent[0].init.method).toBe('POST');
    expect(sent[0].init.body).toBeInstanceOf(FormData);
    // fetch must pick the multipart boundary itself.
    expect((sent[0].init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(sent[1].init.method).toBe('DELETE');
  });

  test('privacy prefs use the website key allow_messages and migrate the old app key', () => {

    expect(normalizePrivacy({allow_direct_messages: false})).toEqual({allow_messages: false});
    expect(normalizePrivacy({allow_messages: true, allow_direct_messages: false})).toEqual({
      allow_messages: true,
    });
    expect(normalizePrivacy(undefined)).toEqual({});
  });
});

describe('pure helpers', () => {
  test('profile images over 5 MB are refused, unknown sizes pass', () => {
    expect(MAX_PROFILE_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(imageTooLarge(5 * 1024 * 1024)).toBe(false);
    expect(imageTooLarge(5 * 1024 * 1024 + 1)).toBe(true);
    expect(imageTooLarge(undefined)).toBe(false);
    expect(imageTooLarge(null)).toBe(false);
  });

  test('profile completion counts only the mandatory items', () => {
    expect(profilePercent({})).toBe(0);
    expect(
      profilePercent({
        profile_photo: '/p.jpg',
        portfolio: [{}],
        profile: {
          age: 22,
          gender: 'Male',
          bodyType: 'Slim',
          skinTone: 'Fair',
          city: 'Indore',
          state: 'Madhya Pradesh',
          pincode: '452001',
          languages: ['Hindi'],
        },
      }),
    ).toBe(100);
  });

  test('account standing follows the website escalation ladder', () => {
    const now = new Date('2026-10-20T00:00:00Z');

    expect(accountStanding({warning_count: 0}, now)).toMatchObject({
      tone: 'good',
      status: 'Good standing',
    });
    expect(accountStanding({warning_count: 1}, now)).toMatchObject({
      tone: 'warn',
      status: '1 active strike',
    });
    expect(accountStanding({warning_count: 2}, now).status).toBe('2 active strikes');
    const restricted = accountStanding(
      {warning_count: 3, action_cards_only_until: '2026-10-25T00:00:00Z'},
      now,
    );
    expect(restricted.tone).toBe('bad');
    expect(restricted.status).toBe('Restricted - action cards only');
    expect(restricted.restrictionEndsAt).toBe('2026-10-25T00:00:00Z');
    // A restriction in the past no longer shows.
    expect(
      accountStanding({warning_count: 1, action_cards_only_until: '2026-10-01T00:00:00Z'}, now)
        .restrictionEndsAt,
    ).toBeNull();
    expect(accountStanding({banned: true}, now)).toMatchObject({
      tone: 'bad',
      status: 'Account suspended',
    });
  });

  test('brand team helpers', () => {
    expect(canManageTeam('owner')).toBe(true);
    expect(canManageTeam(undefined)).toBe(true);
    expect(canManageTeam('admin')).toBe(true);
    expect(canManageTeam('member')).toBe(false);
    expect(canManageTeam('viewer')).toBe(false);

    expect(inviteEmailError('  ')).toBe('Enter an email to invite');
    expect(inviteEmailError('nope')).toBe('Enter a valid email address');
    expect(inviteEmailError(' a@b.co ')).toBe('');

    expect(budgetPercent(50, 200)).toBe(25);
    expect(budgetPercent(500, 200)).toBe(100);
    expect(budgetPercent(50, 0)).toBe(0);
  });
});

describe('Account Security', () => {
  async function renderSecurity(onLogout = jest.fn()) {
    const sent = mockFetch({'/2fa/status': {enabled: false}});
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AccountSecurity token="t" onBack={() => {}} onLogout={onLogout} />,
      );
    });
    return {tree, sent, onLogout};
  }

  test('the new password must be 8 characters, and the body is JSON', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {tree, sent} = await renderSecurity();

    await typeInto(tree, 'Current password', 'OldPass12');
    await typeInto(tree, 'New password', 'Short12');
    await typeInto(tree, 'Confirm new password', 'Short12');
    await press(tree, 'Update password');

    expect(alert).toHaveBeenCalledWith(
      'Password too short',
      'The new password must contain at least 8 characters.',
    );
    expect(sent.some(s => s.url.includes('change-password'))).toBe(false);

    await typeInto(tree, 'New password', 'LongEnough1');
    await typeInto(tree, 'Confirm new password', 'LongEnough1');
    await press(tree, 'Update password');

    const call = sent.find(s => s.url.includes('change-password'))!;
    expect(bodyOf(call)).toEqual({old_password: 'OldPass12', new_password: 'LongEnough1'});
  });

  test('delete account needs the typed word, then DELETEs /profile and signs out', async () => {
    const {tree, sent, onLogout} = await renderSecurity();

    await press(tree, 'Delete my account');
    // Wrong word: the confirm button does nothing.
    await typeInto(tree, 'DELETE', 'delete me');
    await press(tree, 'Delete permanently');
    expect(sent.some(s => s.init.method === 'DELETE')).toBe(false);
    expect(onLogout).not.toHaveBeenCalled();

    await typeInto(tree, 'DELETE', 'DELETE');
    await press(tree, 'Delete permanently');

    const del = sent.find(s => s.init.method === 'DELETE')!;
    expect(del.url.endsWith('/api/profile')).toBe(true);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('Brand settings', () => {
  const company = {
    business_type: 'Partnership',
    business_category: 'Education',
    gst_number: '',
    billing_address: '1 Main Road',
    city: 'Indore',
    state: 'Madhya Pradesh',
    country: 'India',
    pincode: '452001',
    kyb_status: 'pending',
  };

  test('saving the company sends the stored pincode back', async () => {
    const sent = mockFetch({
      '/business/settings/company': company,
      '/business/settings/profile': {brand_name: 'B', contact_person: 'C', work_email: 'c@b.co'},
    });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<BrandSettings token="t" onBack={() => {}} />);
    });

    await press(tree, 'Company');
    await press(tree, 'Save changes');

    const put = sent.find(
      s => s.url.includes('/business/settings/company') && s.init.method === 'PUT',
    )!;
    expect(bodyOf(put).pincode).toBe('452001');
    // The client never sends kyb_status; the server derives it.
    expect(bodyOf(put).kyb_status).toBeUndefined();
  });

  test('the Team tab lists members and hides Invite for a plain member', async () => {
    mockFetch({
      '/business/settings/team': {
        members: [
          {id: 'o', name: 'Owner Co', email: 'o@b.co', role: 'owner', status: 'active', is_owner: true},
          {id: 'm', name: 'Mia', email: 'm@b.co', role: 'member', status: 'active'},
        ],
        seat_limit: 10,
        seats_used: 2,
      },
      '/auth/me': {id: 'm', team_role: 'member'},
      '/business/settings/company': company,
      '/business/settings/profile': {},
    });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<BrandSettings token="t" onBack={() => {}} />);
    });

    await press(tree, 'Team');
    const all = textOf(tree.root);
    expect(all).toContain('Mia');
    expect(all).toContain('2 / 10 seats');
    expect(all).not.toContain('Invite member');
    expect(all).toContain('Only the workspace owner or an admin');
  });
});

describe('Creator profile', () => {
  test('an image over 5 MB is refused before any upload', async () => {
    const sent = mockFetch({'/auth/me': {nickname: 'Meet'}, '/chat/conversations': []});
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [{uri: 'file:///big.jpg', fileSize: 6 * 1024 * 1024}],
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <CreatorProfile
          token="t"
          session={{user_id: 'u', role: 'creator', token: 't'}}
          onNavigate={() => {}}
        />,
      );
    });

    await press(tree, 'Change banner');

    expect(alert).toHaveBeenCalledWith('Banner not updated', 'Image too large. Maximum 5MB.');
    expect(sent.some(s => s.url.includes('upload-banner'))).toBe(false);
  });

  test('shows the profile-completion nudge and opens the editor', async () => {
    mockFetch({'/auth/me': {nickname: 'Meet'}, '/chat/conversations': []});
    const onNavigate = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <CreatorProfile
          token="t"
          session={{user_id: 'u', role: 'creator', token: 't'}}
          onNavigate={onNavigate}
        />,
      );
    });

    expect(textOf(tree.root)).toContain('Profile 0% complete');
    await press(tree, 'Finish it');
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });
});
