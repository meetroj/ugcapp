/**
 * Copy and tone for the "Account standing" card (policy strikes). Mirrors the
 * website's renderAccountStanding in ProfileSettings.js, fed by GET /chat/warnings:
 * { warning_count, banned, last_warning_at, action_cards_only_until }.
 *
 * Escalation (backend strike severities): 0 clear, 1 warning, 2 temporary
 * pause, 3 action-cards-only, 4+ suspended.
 */
export type ChatWarnings = {
  warning_count?: number;
  banned?: boolean;
  last_warning_at?: string | null;
  action_cards_only_until?: string | null;
};

export type Standing = {
  tone: 'good' | 'warn' | 'bad';
  status: string;
  consequence: string;
  strikes: number;
  /** ISO strings still to show (only while they apply). */
  lastStrikeAt: string | null;
  restrictionEndsAt: string | null;
};

export function accountStanding(
  warnings: ChatWarnings,
  now: Date = new Date(),
): Standing {
  const strikes = Number(warnings.warning_count || 0);
  const cardsOnly =
    !!warnings.action_cards_only_until &&
    new Date(warnings.action_cards_only_until) > now;
  const banned = !!warnings.banned;

  const tone: Standing['tone'] =
    banned || strikes >= 3 || cardsOnly ? 'bad' : strikes >= 1 ? 'warn' : 'good';

  const status = banned
    ? 'Account suspended'
    : cardsOnly
    ? 'Restricted - action cards only'
    : strikes === 0
    ? 'Good standing'
    : `${strikes} active ${strikes === 1 ? 'strike' : 'strikes'}`;

  const consequence = banned
    ? 'Your account has been suspended for repeated policy violations. Contact support@ugcad.io to appeal.'
    : cardsOnly
    ? 'Free-text chat is temporarily disabled - you can only send structured offer/action cards until the restriction lifts.'
    : strikes === 0
    ? 'No policy strikes on your account. Keep chats on-platform and free of contact info to stay clear.'
    : strikes === 1
    ? 'You have 1 strike. A 2nd strike temporarily pauses your chat, a 3rd limits you to action cards only, and a 4th can suspend your account.'
    : strikes === 2
    ? 'You have 2 strikes and your chat may be paused. A 3rd strike limits you to action cards only, and a 4th can suspend your account.'
    : 'You are limited to action cards only. Any further violation can suspend your account.';

  return {
    tone,
    status,
    consequence,
    strikes,
    lastStrikeAt: strikes > 0 ? warnings.last_warning_at || null : null,
    restrictionEndsAt: cardsOnly ? warnings.action_cards_only_until || null : null,
  };
}
