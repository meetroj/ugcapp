/**
 * How much of a creator's profile is filled in, and which items the team asked
 * them to add. Port of ugcad-frontend/src/utils/creatorProfileCompletion.js, so
 * the Home bar and the "complete your profile" pop-up agree with the website.
 */

type UserDoc = Record<string, any>;

const has = (...values: unknown[]) =>
  values.some(v =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : !!v,
  );

/** The mandatory items (the same ones POST /campaigns/{id}/bid checks), done or not. */
function mandatory(user: UserDoc | null | undefined): { label: string; done: boolean }[] {
  const u = user || {};
  const p = u.profile || {};
  return [
    {
      label: 'Add a profile picture',
      done: has(u.profile_picture, u.profile_photo, u.avatar, p.profile_picture, p.profile_photo),
    },
    {
      label: 'Add your age, gender, body type & skin tone',
      done: Boolean(p.age && p.gender && p.bodyType && p.skinTone),
    },
    { label: 'Add your city, state & pincode', done: Boolean(p.city && p.state && p.pincode) },
    {
      label: 'Add languages you create in',
      done: Array.isArray(p.languages) && p.languages.length > 0,
    },
    {
      // Onboarding saves the first portfolio video as the intro.
      label: 'Record a 30-60 second intro video',
      done: has(u.intro_video, p.intro_video) || (Array.isArray(u.portfolio) && u.portfolio.length > 0),
    },
  ];
}

/** 0-100: share of the mandatory items already filled in. */
export function profilePercent(user: UserDoc | null | undefined): number {
  const items = mandatory(user);
  return Math.round((items.filter(i => i.done).length / items.length) * 100);
}

const NUDGE_LABELS: Record<string, string[]> = {
  photo: ['profile photo'],
  banner: ['banner image'],
  intro: ['intro video'],
  kyc: ['PAN card', 'Aadhaar card (front and back)'],
};

/**
 * Items the team asked this creator to add (user.profile_nudge.items) that are
 * still empty; each drops off by itself once filled in. `to` is where to send
 * them: KYC when that is all that is left, else their profile.
 */
export function profileNudge(user: UserDoc | null | undefined): {
  left: string[];
  text: string;
  to: '/kyc' | '/app/profile';
} {
  const u = user || {};
  const p = u.profile || {};
  const done: Record<string, boolean> = {
    photo: has(u.profile_photo, u.profile_picture, p.profile_photo, p.profile_picture),
    banner: has(u.banner, u.banner_image, p.banner),
    intro: has(u.intro_video, p.intro_video, u.portfolio, p.portfolio_items),
    kyc: ['pending', 'verified'].includes(u.kyc?.status),
  };
  const asked: string[] = Array.isArray(u.profile_nudge?.items) ? u.profile_nudge.items : [];
  const left = asked.filter(k => k in done && !done[k]);
  const labels = left.flatMap(k => NUDGE_LABELS[k]);
  const text =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
      : labels[0] || '';
  return { left, text, to: left.length && left.every(k => k === 'kyc') ? '/kyc' : '/app/profile' };
}
