/**
 * Creator-side brief rules shared by Browse, Saved and My Bids. Each rule is a
 * port of the website's helper so the app and the site agree on what is
 * biddable, what a bid may cost and how a bid is labelled:
 *   ugcad-frontend/src/utils/campaignCreators.js, bidBudget.js, normalizeBrief.js
 *   and the filter rules in pages/BrowseBriefs.js.
 */

export type Brief = Record<string, any> & { id: string };

/* --------------------------- who is on a brief -------------------------- */

/** Every creator hired on the brief, as strings. Falls back to the legacy singular field. */
export function selectedCreators(campaign: Record<string, any> | null | undefined): string[] {
  const list = Array.isArray(campaign?.selected_creators)
    ? campaign!.selected_creators.map(String).filter(Boolean)
    : [];
  if (list.length) return list;
  return campaign?.selected_creator ? [String(campaign.selected_creator)] : [];
}

export const isSelectedCreator = (campaign: Record<string, any> | null | undefined, creatorId: unknown) =>
  selectedCreators(campaign).includes(String(creatorId));

export const creatorsWanted = (campaign: Record<string, any> | null | undefined) =>
  Math.max(1, Number(campaign?.creators_wanted) || 1);

export const slotsLeft = (campaign: Record<string, any> | null | undefined) =>
  Math.max(0, creatorsWanted(campaign) - selectedCreators(campaign).length);

/**
 * Biddable: active and with a creator slot left. A brief with no `status` is
 * accepted because the list request already asks the server for status=active.
 */
export const isOpenForBids = (campaign: Record<string, any> | null | undefined) =>
  (campaign?.status == null || campaign.status === 'active') && slotsLeft(campaign) > 0;

/** Briefs the creator can still bid on: open, and not already hired on. */
export const biddable = (list: Brief[], creatorId: unknown) =>
  list.filter(c => isOpenForBids(c) && !isSelectedCreator(c, creatorId));

/** The creator cuts the edited file, so the bid covers raw + edited. */
export const needsEditSplit = (campaign: Record<string, any> | null | undefined) =>
  (Array.isArray(campaign?.deliverable_items) ? campaign!.deliverable_items : []).some(
    (d: any) => d?.edited_required && (d?.edited_by || 'creator') === 'creator',
  );

/* ------------------------------ bid amounts ----------------------------- */

const moneyNumber = (value: unknown): number => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().toLowerCase().replace(/,/g, '');
  const match = text.match(/(\d+(?:\.\d+)?)\s*(k|l|lac|lakh)?/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (match[2] === 'k') return amount * 1000;
  if (match[2]) return amount * 100000;
  return amount;
};

/** The most a creator may bid per video (0 = the brief states no ceiling). */
export function maxCampaignBid(campaign: Record<string, any> | null | undefined): number {
  const c = campaign || {};
  const explicit = [c.budget_max, c.max_budget, c.budget?.max]
    .map(moneyNumber)
    .find(value => value > 0);
  if (explicit) {
    const rows: any[] = Array.isArray(c.deliverable_items) ? c.deliverable_items : [];
    const qty = (item: any) => Math.max(1, Number(item?.quantity) || 1);
    const quantity = rows.reduce((sum, item) => sum + qty(item), 0) || 1;
    const edited = rows.reduce(
      (sum, item) =>
        sum + (item?.edited_required && (item?.edited_by || 'creator') === 'creator' ? qty(item) : 0),
      0,
    );
    return explicit + (Math.max(0, Number(c.editing_fee_per_video) || 0) * edited) / quantity;
  }
  const raw = c.budget_range ?? c.budget ?? '';
  const amounts = String(raw)
    .split(/\s*(?:-|–|—|to)\s*/i)
    .map(moneyNumber)
    .filter(value => value > 0);
  return amounts.length ? Math.max(...amounts) : 0;
}

export const bidOverBudgetMessage = (maximum: number) =>
  `Your bid cannot exceed the campaign budget of ₹${Number(maximum).toLocaleString('en-IN')}.`;

/** Whole days, at least 1 (the website input is min=1 and parsed with parseInt). */
export const parseDeliveryDays = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = parseInt(trimmed, 10);
  return days >= 1 ? days : null;
};

/** First problem with a bid form, or '' when it can be sent. */
export function validateBid(
  campaign: Record<string, any> | null | undefined,
  input: { amount: string; days: string; proposal: string },
): string {
  const amount = Number(input.amount);
  if (!(amount > 0) || !input.days.trim() || !input.proposal.trim()) {
    return 'Please complete all fields.';
  }
  if (parseDeliveryDays(input.days) === null) {
    return 'Estimated delivery must be a whole number of days, at least 1.';
  }
  const maximum = maxCampaignBid(campaign);
  if (maximum && amount > maximum) return bidOverBudgetMessage(maximum);
  return '';
}

/* ----------------------------- fee wording ------------------------------ */

/** Shown until GET /creator/bid-readiness answers (the website uses the same fallback). */
export const DEFAULT_COMMISSION_PERCENT = 20;

/** "20" for 20, "12.5" for 12.5. */
export const pctLabel = (percent: number) => String(Number(percent));

/* ------------------------------ delivery -------------------------------- */

/** Days the creator has to deliver, or null when the brief states none. */
export function deliveryWindowDays(c: Record<string, any>): number | null {
  const due = c.final_delivery_by || c.draft_delivery_by || c.due_date || c.deadline;
  const ms = due ? new Date(due).getTime() : NaN;
  if (Number.isFinite(ms)) return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
  const est = Number(c.estimated_delivery_days || c.delivery_days);
  return est > 0 ? est : null;
}

/** "11 min ago" style age of a brief from its created_at; '' when unknown. */
export function timeAgo(value: unknown, now = Date.now()): string {
  const ms = value ? new Date(String(value)).getTime() : NaN;
  if (!Number.isFinite(ms)) return '';
  const s = Math.floor((now - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Card chip for the delivery window: "5 Days", or "See brief" when none is stated. */
export function deliveryChip(c: Record<string, any>): string {
  const d = deliveryWindowDays(c);
  return d == null ? 'See brief' : `${d} ${d === 1 ? 'Day' : 'Days'}`;
}

/* ------------------------ browse filters and sort ----------------------- */

export type BudgetFilter = 'any' | '0-2000' | '2000-5000' | '5000-10000' | '10000+';
export type DeliveryFilter = 'any' | '3' | '5' | '7' | '7+';
export type SortKey = 'recommended' | 'highest' | 'newest';

export const BUDGET_OPTIONS: { value: BudgetFilter; label: string }[] = [
  { value: 'any', label: 'Any budget' },
  { value: '0-2000', label: 'Under ₹2,000' },
  { value: '2000-5000', label: '₹2,000 - ₹5,000' },
  { value: '5000-10000', label: '₹5,000 - ₹10,000' },
  { value: '10000+', label: '₹10,000+' },
];

export const DELIVERY_OPTIONS: { value: DeliveryFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '3', label: 'Within 3 days' },
  { value: '5', label: 'Within 5 days' },
  { value: '7', label: 'Within 7 days' },
  { value: '7+', label: 'More than 7 days' },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'highest', label: 'Highest Payout' },
  { value: 'newest', label: 'Newest' },
];

/** Cards shown per page; "Load more briefs" adds another page. */
export const BROWSE_PAGE = 8;

/** The brief's per-video ceiling as the site sorts and filters on it. */
export const budgetMaxOf = (c: Record<string, any>): number =>
  Number(c.budget_max ?? c.max_budget ?? c.budget ?? c.per_video_budget ?? 0) || 0;

const inBudget = (value: number, filter: BudgetFilter) => {
  switch (filter) {
    case '0-2000': return value < 2000;
    case '2000-5000': return value >= 2000 && value <= 5000;
    case '5000-10000': return value > 5000 && value <= 10000;
    case '10000+': return value > 10000;
    default: return true;
  }
};

// A brief that states no deadline is never hidden behind a delivery filter.
const inDelivery = (days: number | null, filter: DeliveryFilter) => {
  if (days == null) return true;
  switch (filter) {
    case '3': return days <= 3;
    case '5': return days <= 5;
    case '7': return days <= 7;
    case '7+': return days > 7;
    default: return true;
  }
};

export type BrowseFilters = {
  search: string;
  budget: BudgetFilter;
  delivery: DeliveryFilter;
  sort: SortKey;
};

export const DEFAULT_FILTERS: BrowseFilters = {
  search: '',
  budget: 'any',
  delivery: 'any',
  sort: 'recommended',
};

/** How many of budget / delivery are narrowing the list (search is shown separately). */
export const activeFilterCount = (f: BrowseFilters) =>
  (f.budget !== 'any' ? 1 : 0) + (f.delivery !== 'any' ? 1 : 0);

const brandOf = (c: Record<string, any>) =>
  String(c.brand_name || c.business_name || c.company_name || c.business_nickname || c.brand_handle || '');

/** Text the search box looks through: title, brand, description, industry, tags. */
const haystack = (c: Record<string, any>) =>
  [
    c.title,
    brandOf(c),
    c.product_description || c.brief_text || '',
    c.industry_type || '',
    ...(Array.isArray(c.objectives) ? c.objectives : []),
    ...(Array.isArray(c.tags) ? c.tags : []),
  ]
    .join(' ')
    .toLowerCase();

/**
 * Search + budget + delivery, then the chosen sort. "Recommended" keeps the
 * server's order: the website ranks it by a made-up score, which the app does
 * not reproduce.
 */
export function filterBriefs(list: Brief[], f: BrowseFilters): Brief[] {
  const q = f.search.trim().toLowerCase();
  const rows = list.filter(c => {
    if (q && !haystack(c).includes(q)) return false;
    return inBudget(budgetMaxOf(c), f.budget) && inDelivery(deliveryWindowDays(c), f.delivery);
  });
  if (f.sort === 'highest') return [...rows].sort((a, b) => budgetMaxOf(b) - budgetMaxOf(a));
  if (f.sort === 'newest') {
    const at = (c: Brief) => (c.created_at ? new Date(c.created_at).getTime() || 0 : 0);
    return [...rows].sort((a, b) => at(b) - at(a));
  }
  return rows;
}

/* --------------------------------- bids --------------------------------- */

/** The creator's own bid on this brief, from the campaign's bids list. */
export function ownBidOn(campaign: Record<string, any> | null | undefined, creatorId: unknown) {
  const bids: any[] = Array.isArray(campaign?.bids) ? campaign!.bids : [];
  return bids.find(b => String(b?.creator_id) === String(creatorId)) || null;
}

export const WON_STATUSES = ['selected', 'accepted', 'approved'];
const PENDING_STATUSES = ['pending', 'submitted', 'bid_submitted'];

/** Lower-case bid status, in the order the website reads it. */
export const bidStatusOf = (item: Record<string, any>): string =>
  String(item?.bid_status || item?.my_bid?.status || item?.bid?.status || 'pending').toLowerCase();

/** "Pending" for any not-yet-decided status, else the status in sentence case. */
export function bidStatusLabel(status: string): string {
  const s = String(status || 'pending').toLowerCase().replace(/_/g, ' ');
  if (PENDING_STATUSES.includes(s.replace(/ /g, '_'))) return 'Pending';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type BidTabKey = 'all' | 'shortlisted' | 'accepted' | 'rejected';

export const BID_TABS: { key: BidTabKey; label: string; match: (status: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'shortlisted', label: 'Shortlisted', match: s => s === 'shortlisted' },
  { key: 'accepted', label: 'Accepted', match: s => WON_STATUSES.includes(s) },
  { key: 'rejected', label: 'Rejected', match: s => s === 'rejected' },
];

/* ------------------------------- feedback ------------------------------- */

/**
 * Text for a failed load. A dropped connection says so (and offers Retry in the
 * screen) instead of the generic message; matched by name so tests that mock
 * the api module do not need the NetworkError class.
 */
export function loadErrorText(error: unknown, what: string): string {
  if ((error as any)?.name === 'NetworkError') {
    return "You're offline. Check your connection and try again.";
  }
  const message = error instanceof Error ? error.message : '';
  return message && message !== 'Request failed' ? message : `Couldn't load ${what}. Try again.`;
}

/** Brief text with the brand-only "Budget visibility" line removed. */
export function stripBrandOnlyLines(text: string): string {
  return String(text || '')
    .split('\n')
    .filter(line => {
      const idx = line.indexOf(':');
      return !(idx > 0 && /^budget visibility$/i.test(line.slice(0, idx).trim()));
    })
    .join('\n')
    .trim();
}

/* ---------------------------- brief detail rows -------------------------- */

const listVal = (v: unknown): string =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).join(', ') : String(v ?? '').trim();

/** "12 Sep 2026" from an ISO date; the raw text if it does not parse; '' if empty. */
export function dateLabel(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What the creator hands over for one deliverable (raw, edited, or both). */
export function deliveryLabelOf(item: Record<string, any>): string {
  const edited = !!item?.edited_required;
  const raw = item?.raw_required !== false;
  const content = edited ? (raw ? 'Raw + Edited video' : 'Edited video') : 'Raw video';
  return edited ? `${content} (edited by ${item.edited_by === 'ugc' ? 'UGC.ad' : 'creator'})` : content;
}

export type BriefSection = { title: string; rows: [string, string][] };

const CTA_LINK_LABEL: Record<string, string> = {
  'Visit website': 'Website link',
  'Swipe up': 'Swipe-up link',
  'Follow brand': 'Brand handle to follow',
};

/**
 * The structured brief as labelled rows, same groups and labels as the
 * website's brief drawer (components/BriefDetailDrawer.js). Rows the brand
 * left empty are dropped, and so are sections left with no rows.
 */
export function briefSections(c: Record<string, any>): BriefSection[] {
  const items: any[] = Array.isArray(c.deliverable_items) ? c.deliverable_items : [];
  const deliverables: [string, unknown][] = items.map((d, i) => {
    const type = String(d?.type || '').trim();
    const details = [listVal(d?.aspect_ratios), String(d?.duration ?? '').trim()].filter(Boolean).join(', ');
    const label = type ? (details ? `${type} (${details})` : type) : '';
    return [
      `Deliverable ${i + 1}`,
      label ? `${Number(d?.quantity) || 1} x ${label}; deliver ${deliveryLabelOf(d)}` : '',
    ];
  });
  if (listVal(c.additional_deliverables)) deliverables.push(['Also', listVal(c.additional_deliverables)]);

  const sections: { title: string; rows: [string, unknown][] }[] = [
    {
      title: 'Product',
      rows: [
        ['Product', c.product_name || c.product],
        ['Product type', [c.product_type, c.product_type_detail].filter(Boolean).join(' - ')],
        ['Category', c.product_category || c.category],
        ['Description', c.product_description || c.description],
        ['Hook', c.campaign_hook || c.hook],
        ['Key message', c.key_message],
        ['Target audience', c.target_audience || c.audience],
        ['Video language', c.language],
      ],
    },
    { title: 'Deliverables', rows: deliverables },
    {
      title: 'Script',
      rows: [
        ['Script provider', c.script_provider === 'ugc' ? 'UGC.ad' : c.script_provider === 'brand' ? 'Brand' : ''],
        [
          'Script',
          c.script_text ||
            (c.script_provider === 'ugc' ? 'UGC.ad is preparing the script - check back before you start.' : ''),
        ],
      ],
    },
    {
      title: 'Creator targeting',
      rows: [
        ['Creator level', c.creator_level],
        ['Quality tier', c.content_quality_tier],
        ['Gender preference', c.gender_preference],
        ['Location', c.city_filter || 'Any location'],
      ],
    },
    {
      title: 'Must include',
      rows: [
        ['Product visible', c.product_visible ? `${c.product_visible_seconds || ''}s minimum` : ''],
        ['Verbal mention', c.verbal_mention ? c.verbal_mention_text || 'Yes' : ''],
        ['Required phrases', listVal(c.required_phrases)],
        ['Required shots', listVal(c.required_shots)],
        ['Call to action', c.call_to_action],
        [CTA_LINK_LABEL[String(c.call_to_action)] || 'CTA link', c.cta_link],
        ['Promo code', c.promo_code],
        ['Hashtags', Array.isArray(c.hashtags) ? c.hashtags.join(' ') : c.hashtags],
        ['Brand tag', c.brand_handle_tag ? 'Yes' : ''],
      ],
    },
    {
      title: 'Must avoid',
      rows: [
        ['Competitors', c.no_competitors ? c.competitors_text || 'No competitor brands' : ''],
        ['Other products', c.no_other_products ? 'Not allowed' : ''],
        ['Profanity', c.no_profanity ? 'Not allowed' : ''],
        ['Political/religious', c.no_political ? 'Not allowed' : ''],
        ['Filters/effects', c.avoid_filters ? c.filter_types_text || 'Avoid' : ''],
        ['Other', c.avoid_text || c.what_not_to_do],
      ],
    },
    {
      title: 'Style guidance',
      rows: [
        ['Tone', listVal(c.tone_tags)],
        ['Pacing', c.pacing],
        ['Music', c.music_preference],
      ],
    },
    {
      title: 'Usage rights',
      rows: [
        ['Platforms', listVal(c.usage_platforms)],
        ['Rights duration', c.rights_duration],
        ['Exclusivity', c.exclusivity],
        ['Whitelisting', c.whitelisting ? 'Yes' : ''],
        ['Modification', c.modification_rights],
      ],
    },
    {
      title: 'Timeline',
      rows: [
        ['Ship by', dateLabel(c.product_shipping_by)],
        ['Final delivery', dateLabel(c.final_delivery_by || c.due_date || c.deadline)],
        ['Revisions included', c.revision_limit],
      ],
    },
  ];
  return sections
    .map(s => ({
      title: s.title,
      rows: s.rows
        .map(([k, v]): [string, string] => [k, String(v ?? '').trim()])
        .filter(([, v]) => v !== ''),
    }))
    .filter(s => s.rows.length);
}

/** Mood board images the brand uploaded (bare legacy file names are not real uploads). */
export const moodImagesOf = (c: Record<string, any>, base: string): string[] =>
  (Array.isArray(c.mood_images) ? c.mood_images : [])
    .filter((u: unknown): u is string => typeof u === 'string' && (u.startsWith('http') || u.startsWith('/')))
    .map((u: string) => (u.startsWith('http') ? u : `${base}${u}`));

/** Reference videos: uploaded clips and pasted links, both opened outside the app. */
export const referenceVideosOf = (c: Record<string, any>, base: string): string[] =>
  (Array.isArray(c.reference_videos) ? c.reference_videos : [])
    .filter((u: unknown): u is string => typeof u === 'string' && !!u.trim())
    .map((u: string) => {
      const raw = u.trim();
      const hosted = /\/uploads?\//i.test(raw);
      return raw.startsWith('http') || !hosted ? raw : `${base}${raw}`;
    });
