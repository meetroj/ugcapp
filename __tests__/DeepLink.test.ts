import { SITE_ORIGIN, isSiteUrl, parseDeepLink } from '../src/deepLink';

describe('parseDeepLink', () => {
  it('reads the reset-code email link', () => {
    expect(
      parseDeepLink('https://www.ugcad.io/auth?view=reset&email=a%2Bb%40x.com'),
    ).toEqual({
      kind: 'auth',
      mode: undefined,
      role: undefined,
      view: 'reset',
      email: 'a+b@x.com',
    });
  });

  it('reads signup links with a role, like the website', () => {
    expect(parseDeepLink('https://ugcad.io/auth?mode=signup&role=business')).toMatchObject(
      { kind: 'auth', mode: 'signup', role: 'business' },
    );
    // Anything but "business" is a creator on the website too.
    expect(parseDeepLink('https://www.ugcad.io/auth?mode=signup&role=brand')).toMatchObject(
      { kind: 'auth', mode: 'signup', role: undefined },
    );
  });

  it('reads the team invitation link and keeps the token intact', () => {
    expect(
      parseDeepLink('https://www.ugcad.io/team/accept?token=abc-DEF_123'),
    ).toEqual({ kind: 'team', token: 'abc-DEF_123' });
    expect(parseDeepLink('https://www.ugcad.io/team/accept/?token=t')).toEqual({
      kind: 'team',
      token: 't',
    });
  });

  it('ignores a team link without a token', () => {
    expect(parseDeepLink('https://www.ugcad.io/team/accept')).toBeNull();
  });

  it('ignores other hosts, other paths and junk', () => {
    expect(parseDeepLink('https://evil.example/auth?view=reset')).toBeNull();
    expect(parseDeepLink('https://www.ugcad.io.evil.com/auth')).toBeNull();
    expect(parseDeepLink('https://www.ugcad.io/dashboard/creator')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});

describe('isSiteUrl', () => {
  it('keeps the site inside the WebView and sends the rest out', () => {
    expect(isSiteUrl(`${SITE_ORIGIN}/profile-setup/creator`)).toBe(true);
    expect(isSiteUrl('about:blank')).toBe(true);
    expect(isSiteUrl('https://instagram.com/x')).toBe(false);
    expect(isSiteUrl('mailto:support@ugcad.io')).toBe(false);
  });
});
