/**
 * Pure rules for the brand's hiring and review screens (bids, hire, approve,
 * revisions). Kept free of React so they can be unit tested and so the bids
 * list, the campaign detail and the work review screens cannot drift apart.
 *
 * The backend is the source of truth: it never writes bid.status = 'accepted';
 * a hired creator is listed in campaign.selected_creators (server.py
 * select_creator / selected_creator_ids).
 */

type Rec = Record<string, any>;

const money = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ================================ Hiring ================================ */

/** Every creator hired on a brief, in pick order (legacy singular field as fallback). */
export function hiredCreatorIds(campaign: Rec | null | undefined): string[] {
  const list = Array.isArray(campaign?.selected_creators)
    ? campaign!.selected_creators.map(String).filter(Boolean)
    : [];
  if (list.length) return list;
  return campaign?.selected_creator ? [String(campaign.selected_creator)] : [];
}

/** Briefs posted before the field existed carry no creators_wanted; the backend reads that as 1. */
export const creatorsWanted = (campaign: Rec | null | undefined) =>
  Math.max(1, Number(campaign?.creators_wanted) || 1);

export const slotsLeft = (campaign: Rec | null | undefined) =>
  Math.max(0, creatorsWanted(campaign) - hiredCreatorIds(campaign).length);

/** The website lists bids only on live briefs that still have a slot to fill. */
export const isOpenForBids = (campaign: Rec | null | undefined) =>
  campaign?.status === 'active' && slotsLeft(campaign) > 0;

export type BidState = 'hired' | 'declined' | 'open';

/**
 * Where a bid stands. Hired comes from the campaign roster, never from
 * bid.status (the backend only ever sets 'declined' on a bid).
 */
export function bidState(bid: Rec, hiredIds: string[]): BidState {
  if (hiredIds.includes(String(bid?.creator_id ?? ''))) return 'hired';
  const status = String(bid?.status || '').toLowerCase();
  if (status === 'declined' || status === 'rejected') return 'declined';
  if (status === 'accepted' || status === 'selected') return 'hired';
  return 'open';
}

export const BID_TABS = [
  { key: 'all', label: 'All Bids' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'responded', label: 'Responded' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
] as const;

export type BidTab = (typeof BID_TABS)[number]['key'];

export const hasProposal = (bid: Rec) =>
  typeof bid?.proposal === 'string' && bid.proposal.trim().length > 0;

/** Same tab rules as the website's BidsCampaignCard. */
export function bidInTab(
  tab: string,
  bid: Rec,
  state: BidState,
  shortlisted: boolean,
): boolean {
  if (tab === 'shortlisted') return shortlisted && state === 'open';
  if (tab === 'responded') return hasProposal(bid) && state === 'open';
  if (tab === 'accepted') return state === 'hired';
  if (tab === 'declined') return state === 'declined';
  return state === 'open';
}

/** The delivery estimate the creator bid with (the backend stores estimated_delivery_days). */
export function bidDays(bid: Rec): number | null {
  const days = Number(bid?.estimated_delivery_days ?? bid?.delivery_days);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export const bidPrice = (bid: Rec): number | null => {
  const raw = bid?.amount ?? bid?.price;
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export type BidSort = 'match' | 'price-low' | 'price-high' | 'delivery-fast';

export const BID_SORTS: { key: BidSort; label: string }[] = [
  { key: 'match', label: 'Best match' },
  { key: 'price-low', label: 'Price: Low to High' },
  { key: 'price-high', label: 'Price: High to Low' },
  { key: 'delivery-fast', label: 'Fastest delivery' },
];

/** Returns a sorted copy; bids with no value for the sort key go last. */
export function sortBids<T extends Rec>(bids: T[], sort: BidSort): T[] {
  if (sort === 'match') return bids;
  const value = (bid: T) => (sort === 'delivery-fast' ? bidDays(bid) : bidPrice(bid));
  return [...bids].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sort === 'price-high' ? bv - av : av - bv;
  });
}

/** Stable key for a bid inside a campaign (bids carry no id of their own). */
export const bidKey = (campaignId: string, bid: Rec, index = 0) =>
  `${campaignId}:${String(bid?.id ?? bid?.creator_id ?? index)}`;

/**
 * What to tell the brand after a hire. The backend answers with the bid amount
 * held in escrow plus slots_left / fully_staffed; the website shows the same.
 */
export function hireMessage(result: Rec | null | undefined, who: string): string {
  const held = Number(result?.amount_charged) || Number(result?.amount) || 0;
  const escrow = held ? `${money(held)} held in escrow.` : 'Payment held in escrow.';
  const left = Number(result?.slots_left) || 0;
  const slots =
    left > 0
      ? ` ${left} slot${left === 1 ? '' : 's'} still open.`
      : result?.fully_staffed
      ? ' This brief is now fully staffed.'
      : '';
  return `${who} hired! ${escrow}${slots}`;
}

/* ============================== Work review ============================= */

/** The file extension of a submitted file, upper case ("MP4"); '' when unknown. */
export function fileExt(url: unknown): string {
  if (typeof url !== 'string' || !url) return '';
  const name = url.split('?')[0].split('#')[0];
  const dot = name.lastIndexOf('.');
  if (dot < 0 || name.slice(dot).includes('/')) return '';
  return name.slice(dot + 1).toUpperCase();
}

export const REVIEW_PAGE_SIZES = [10, 20, 50];

/** One page of a list plus the numbers the footer shows. */
export function paginate<T>(rows: T[], page: number, perPage: number) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * perPage;
  return {
    total,
    pageCount,
    page: safePage,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, total),
    rows: rows.slice(start, start + perPage),
  };
}

/** What approving did, in words, from the approve response (mirrors BrandWorkReview.js). */
export function approveMessage(result: Rec | null | undefined, work: Rec): string {
  const status = result?.payout_status;
  if (status === 'awaiting_edited') {
    return 'Raw video approved - the creator will submit the edited video next.';
  }
  if (status === 'awaiting_remaining_deliverables') {
    return result?.message || 'Deliverable approved. Payment is released once every deliverable is approved.';
  }
  if (work?.stage === 'raw' && (work?.edit_mode || work?.editMode) === 'ugc') {
    return 'Raw video approved - creator paid, UGC.ad is editing it.';
  }
  return 'Approved - payment released to the creator.';
}

/** The server only accepts a review once the creator has been paid, never after a raw/partial approval. */
export function canReviewAfterApprove(result: Rec | null | undefined, work: Rec): boolean {
  return result?.payout_status === 'released' && work?.stage !== 'raw';
}

/** Confirm text for Approve; payment is only released once every deliverable is approved. */
export function approveConfirm(work: Rec, who: string): { title: string; body: string } {
  const raw = work?.stage === 'raw';
  const mode = work?.edit_mode || work?.editMode;
  if (raw && mode === 'creator') {
    return {
      title: 'Approve the raw video?',
      body: `${who} will edit it and submit the edited video next. Payment is released when you approve the edited video.`,
    };
  }
  if (raw && mode === 'ugc') {
    return {
      title: 'Approve the raw video?',
      body: `${who} is paid for this deliverable and UGC.ad's team will edit the video for you. This cannot be undone.`,
    };
  }
  return {
    title: 'Approve this work?',
    body: `The files are unlocked for download. Payment is released to ${who} once every deliverable on the brief is approved. This cannot be undone.`,
  };
}

/** Label of the approve button, as on the website. */
export function approveLabel(work: Rec): string {
  if (work?.stage !== 'raw') return 'Approve';
  return (work?.edit_mode || work?.editMode) === 'ugc'
    ? 'Approve raw - UGC.ad edits next'
    : 'Approve raw - creator edits next';
}

/* ============================== Revisions =============================== */

export type RevisionCounters = {
  used: number;
  freeLimit: number | null;
  freeLeft: number | null;
  /** What the NEXT revision costs (0 while free ones remain). */
  nextFee: number | null;
  /** What every revision after the free ones costs. */
  paidFee: number | null;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The per-deal revision numbers the backend computes. Work payloads name them
 * revision_count_used / free_revision_limit / ..., the work-review rows
 * revisionsUsed / freeRevisionLimit / ...; both are understood. null means the
 * payload carried no count at all (so no warning may be invented from it).
 */
export function revisionCounters(source: Rec | null | undefined): RevisionCounters | null {
  if (!source) return null;
  const used = finite(source.revision_count_used) ?? finite(source.revisionsUsed);
  if (used == null) return null;
  const freeLimit = finite(source.free_revision_limit) ?? finite(source.freeRevisionLimit);
  const left =
    finite(source.free_revisions_remaining) ??
    finite(source.freeRevisionsRemaining) ??
    (freeLimit != null ? Math.max(0, freeLimit - used) : null);
  return {
    used,
    freeLimit: freeLimit ?? (left != null ? used + left : null),
    freeLeft: left,
    nextFee: finite(source.next_revision_fee) ?? finite(source.nextRevisionFee),
    paidFee: finite(source.paid_revision_fee) ?? finite(source.paidRevisionFee),
  };
}

const rupee = (value: unknown) =>
  `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
const ordinal = (n: number) => ORDINALS[n - 1] || `${n}th`;

/**
 * The fee notice shown before sending. Amounts come only from the backend; when
 * a number is missing the text says "charged to your wallet" without one.
 *  - kind 'paid':  no free revision is left, this one is charged
 *  - kind 'last':  this is the last free one, the next is charged
 *  - kind 'free':  free revisions remain (info only)
 */
export function revisionNotice(
  counters: RevisionCounters | null,
): { kind: 'paid' | 'last' | 'free'; title: string; body: string } | null {
  if (!counters || counters.freeLeft == null) return null;
  const fee = counters.nextFee && counters.nextFee > 0 ? counters.nextFee : counters.paidFee;
  const amount = fee && fee > 0 ? rupee(fee) : '';
  if (counters.freeLeft <= 0) {
    return {
      kind: 'paid',
      title: 'This is a paid revision',
      body: `Free revisions are used up. This one ${
        amount ? `costs ${amount}` : 'is charged'
      }, deducted from your wallet. Include every change you need in this request.`,
    };
  }
  if (counters.freeLeft === 1) {
    const n = counters.freeLimit ?? counters.used + 1;
    return {
      kind: 'last',
      title: `This is your ${ordinal(n)} revision`,
      body: `It is the last free one. Put every change you need in this request - every revision after it ${
        amount ? `costs ${amount}` : 'is charged'
      }, deducted from your wallet.`,
    };
  }
  return {
    kind: 'free',
    title: '',
    body: `${counters.freeLeft} free revisions remaining.`,
  };
}

/** The per-deal revision counters of a work-review row, to merge onto a pending-review row (which has none). */
export function revisionCounterFields(row: Rec | null | undefined): Rec {
  if (!row) return {};
  const out: Rec = {};
  for (const key of [
    'revisionsUsed',
    'freeRevisionLimit',
    'freeRevisionsRemaining',
    'nextRevisionFee',
    'paidRevisionFee',
  ]) {
    if (row[key] != null) out[key] = row[key];
  }
  return out;
}

/** Phone numbers and emails are blocked in revisions (server.py contains_contact_info). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /\+?\d[\d\s().-]{5,}\d/g;

export function findContactInfo(value: unknown): 'email' | 'phone' | null {
  const text = String(value || '');
  if (EMAIL_RE.test(text)) return 'email';
  for (const match of text.match(PHONE_RE) || []) {
    if (match.replace(/\D/g, '').length >= 7) return 'phone';
  }
  return null;
}

/** The backend accepts 1 to 5 structured revision items per request. */
export const MAX_REVISION_ITEMS = 5;

export type RevisionComment = { description: string; timestamp_seconds: number };

/**
 * The body for POST /work/{id}/request-revision.
 *
 * The server stores `items` (shown to the creator as the change list), `notes`
 * and `deadline_at`, but it only SHOWS the creator the items: the free-text
 * notes never reach the creator's deal view. So a note is also sent as the
 * last item (severity 'preference'), which the creator does see; `notes` is
 * kept as well so the server record is complete.
 */
export function buildRevisionPayload(
  comments: RevisionComment[],
  note: string,
  deadlineAt: string,
) {
  const items: {
    description: string;
    severity: string;
    timestamp_seconds?: number;
  }[] = comments.map(item => ({
    description: item.description,
    // Everything typed here is a required change; the design has no must-fix / preference switch.
    severity: 'must-fix',
    timestamp_seconds: item.timestamp_seconds,
  }));
  const notes = note.trim().slice(0, 500);
  // No timestamp on the note item: the server reads that as "not tied to a frame".
  if (notes) items.push({ description: `Note: ${notes}`, severity: 'preference' });
  return { items, notes, deadline_at: deadlineAt };
}

/** How many of the 5 item slots a draft uses (a note takes one). */
export const revisionItemCount = (commentCount: number, note: string) =>
  commentCount + (note.trim() ? 1 : 0);

/** The wording after a revision went through, including any wallet debit. */
export function revisionSentMessage(result: Rec | null | undefined): string {
  if (result?.paid) {
    const balance = Number(result?.new_balance);
    return `Revision requested - ${rupee(result.fee_charged)} charged.${
      Number.isFinite(balance) ? ` Wallet balance: ${rupee(balance)}.` : ''
    }`;
  }
  return 'Revision requested. The creator has been notified.';
}

/** Who cuts the edited video: 'creator', 'ugc', or null when the brief wants no edited file. */
export function editModeOf(campaign: Rec | null | undefined): 'creator' | 'ugc' | null {
  const items: Rec[] = Array.isArray(campaign?.deliverable_items) ? campaign!.deliverable_items : [];
  if (items.some(item => item?.edited_required && item?.edited_by !== 'ugc')) return 'creator';
  if (items.some(item => item?.edited_required && item?.edited_by === 'ugc')) return 'ugc';
  return null;
}

/**
 * The status a submission is shown with. A raw video the brand approved while the
 * creator still has to deliver the edited cut is "awaiting_edited", not approved.
 */
export function workStatusOf(work: Rec, campaign: Rec | null | undefined): string {
  if (work?.status === 'awaiting_edit') return 'awaiting_edit';
  if (work?.status === 'approved' && work?.stage === 'raw' && editModeOf(campaign) === 'creator') {
    return 'awaiting_edited';
  }
  return work?.status || (campaign?.status === 'completed' ? 'approved' : 'pending_review');
}

/** Revision items are stored as "[must-fix @ 0:04] change the dress (ref: x)". */
export function parseRevisionItem(raw: unknown): { severity: string; text: string; ref: string } {
  const str = String(raw || '').trim();
  const sev = str.match(/^\[([^\]]+)\]\s*/);
  const rest = sev ? str.slice(sev[0].length) : str;
  const ref = rest.match(/\(ref:\s*([^)]*)\)/i);
  const text = rest.replace(/\(ref:\s*[^)]*\)/i, '').replace(/\s+-\s*$/, '').trim();
  return { severity: sev ? sev[1].trim() : '', ref: ref ? ref[1].trim() : '', text };
}

/** The de-duplicated change list of a revision tracker (requested_changes, else the feedback lines). */
export function revisionChanges(tracker: Rec | null | undefined) {
  const raw: unknown[] = tracker?.requested_changes?.length
    ? tracker.requested_changes
    : String(tracker?.latest_feedback || '').split(/\n+/);
  const seen = new Set<string>();
  return raw
    .map(parseRevisionItem)
    .filter(item => {
      if (!item.text || seen.has(item.text)) return false;
      seen.add(item.text);
      return true;
    });
}

/* ================================ Progress ============================== */

const DEAL_ORDER = [
  'Accepted - Awaiting Shipment',
  'Shipped - In Transit',
  'Delivered - Awaiting Receipt Confirmation',
  'Received - Content in Progress',
  'Content Submitted - Awaiting Review',
  'Approved - Payment Processing',
  'Paid - Complete',
];
// Raw -> edited flow states sit between review and approval on the tracker.
const EDIT_STATES = ['Raw Approved - Edited Video Due', 'Raw Approved - UGC.ad Editing'];
// The backend writes these states with an em dash; the lists above use a hyphen.
const normalizeDash = (value: unknown) =>
  String(value || '').replace(/\s*(?:—|–|-)\s*/g, ' - ');

export function dealStateIndex(state: unknown): number {
  const key = normalizeDash(state);
  if (EDIT_STATES.some(item => normalizeDash(item) === key)) {
    return DEAL_ORDER.indexOf('Content Submitted - Awaiting Review');
  }
  return DEAL_ORDER.findIndex(item => normalizeDash(item) === key);
}

/**
 * Which of the six progress steps is current, from the creator's own deal (as
 * the website does). Returns the step count when every step is done. null when
 * there is no deal for this creator, so the caller falls back to the campaign.
 */
export function dealProgressStep(deal: Rec | null | undefined, steps = 6): number | null {
  if (!deal || !deal.current_state) return null;
  const idx = dealStateIndex(deal.current_state);
  const done = [true, idx >= 1, idx >= 3, idx >= 4, idx >= 5, idx >= 6];
  const first = done.indexOf(false);
  return first === -1 ? steps : first;
}

/** The deal row for one creator on one campaign (deals/business has one per hired creator). */
export function findCreatorDeal(
  deals: Rec[],
  campaignId: string,
  creatorId: string | null | undefined,
): Rec | null {
  if (!creatorId) return null;
  const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);
  return (
    deals.find(
      deal =>
        same(deal.campaign?.id ?? deal.campaign_id, campaignId) &&
        same(deal.creator?.id ?? deal.creator_id, creatorId),
    ) || null
  );
}
