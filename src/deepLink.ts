/**
 * Links from emails and the website that should land inside the app:
 *   https://www.ugcad.io/auth?view=reset&email=...   (reset-code email)
 *   https://www.ugcad.io/auth?mode=signup&role=...   (invite / marketing links)
 *   https://www.ugcad.io/team/accept?token=...       (team invitation email)
 *
 * Parsed by hand: React Native's URL polyfill does not give a dependable
 * searchParams on every device, and these three shapes are all we need.
 */
export type DeepLink =
  | {
      kind: 'auth';
      mode?: 'signup' | 'login';
      role?: 'creator' | 'business';
      view?: 'reset';
      email?: string;
    }
  | { kind: 'team'; token: string };

const HOSTS = ['www.ugcad.io', 'ugcad.io'];

/** Same decoding as the website's URLSearchParams ('+' is a space). */
function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function parseQuery(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw.split('&').forEach(pair => {
    if (!pair) return;
    const at = pair.indexOf('=');
    const key = decode(at < 0 ? pair : pair.slice(0, at));
    if (key && !(key in out)) out[key] = at < 0 ? '' : decode(pair.slice(at + 1));
  });
  return out;
}

/** Returns what the app should do with `url`, or null when it is not ours. */
export function parseDeepLink(url?: string | null): DeepLink | null {
  const match = /^https?:\/\/([^/?#:]+)(?::\d+)?([^?#]*)(?:\?([^#]*))?/i.exec(
    String(url || '').trim(),
  );
  if (!match || !HOSTS.includes(match[1].toLowerCase())) return null;
  const path = (match[2] || '/').replace(/\/+$/, '') || '/';
  const q = parseQuery(match[3] || '');

  if (path === '/team/accept') {
    return q.token ? { kind: 'team', token: q.token } : null;
  }
  if (path === '/auth') {
    return {
      kind: 'auth',
      mode: q.mode === 'signup' ? 'signup' : undefined,
      role:
        q.role === 'business' ? 'business' : q.role === 'creator' ? 'creator' : undefined,
      view: q.view === 'reset' ? 'reset' : undefined,
      email: q.email || undefined,
    };
  }
  return null;
}

/** The website the in-app WebViews load (same value the shell uses). */
export const SITE_ORIGIN = __DEV__
  ? 'http://localhost:3000'
  : 'https://www.ugcad.io';

/** True for pages that belong inside the app's WebView; anything else opens outside it. */
export function isSiteUrl(url: string): boolean {
  return url === 'about:blank' || url.startsWith(SITE_ORIGIN);
}
