/**
 * Pure helpers for the creator's deal screens (My Deals hub, Deal Room, Active
 * Work). They mirror the website's MyDealsPage / MyDealsHubPage /
 * MyActiveWorkPage / BookingCard so the app and the site read the same deal
 * payload (server.py build_deal_response) the same way. No React in here, so
 * every rule is unit-tested in __tests__/dealRoom.test.ts.
 */

export type DealLike = Record<string, any>;

/** "Paid - Complete" with any dash flavour/extra spaces, lower-cased. */
export const stateKey = (value: unknown) =>
  String(value || '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const isState = (deal: DealLike | null | undefined, label: string) =>
  stateKey(deal?.current_state) === stateKey(label);

/* ------------------------------ identity -------------------------------- */

/**
 * Finds a deal from a deep link. The links carry the CAMPAIGN uuid
 * ('/my-deals?campaign=<uuid>', notifications, '/work/submit?campaign='), but
 * the payload only has `campaign.id` (never a top-level campaign_id) and a
 * derived `deal_id` ("DEAL-xxxx"), so match every id the deal exposes.
 */
export function findDeal<T extends DealLike>(
  deals: T[],
  id: string | null | undefined,
): T | undefined {
  const wanted = String(id || '').trim();
  if (!wanted) return undefined;
  return deals.find(
    deal =>
      String(deal.deal_id) === wanted ||
      String(deal.campaign?.id) === wanted ||
      String(deal.campaign_id) === wanted,
  );
}

/* ------------------------------ bookings -------------------------------- */

export type BookingStage = 'respond' | 'counter_sent' | 'awaiting_brief' | null;

/** Where a direct booking is. null = not a booking, or the brief is already out. */
export function bookingStage(deal: DealLike | null | undefined): BookingStage {
  const campaign = deal?.campaign || {};
  if (campaign.brief_sent) return null;
  switch (campaign.booking_status) {
    case 'pending_creator':
      return 'respond';
    case 'price_revision':
      return 'counter_sent';
    case 'accepted':
      return 'awaiting_brief';
    default:
      return null;
  }
}

/** A booking the creator still has to answer, or has countered (hub "Requested"). */
export const isRequested = (deal: DealLike) => {
  const stage = bookingStage(deal);
  return stage === 'respond' || stage === 'counter_sent';
};

/** Declined or cancelled: not shown under Active. */
export const isDeadDeal = (deal: DealLike) =>
  deal?.campaign?.booking_status === 'declined' ||
  stateKey(deal?.current_state).includes('cancelled');

/** The counter price must be a positive number (BookingCard / backend `revise`). */
export function validateCounter(raw: string): string {
  const amount = Number(String(raw || '').replace(/,/g, '').trim());
  if (!String(raw || '').trim() || !Number.isFinite(amount) || amount <= 0) {
    return 'Enter the price you want for this booking.';
  }
  return '';
}

/* --------------------------------- hub ---------------------------------- */

export type HubTab = 'active' | 'requested' | 'bids';
export const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'active', label: 'Active Deals' },
  { key: 'requested', label: 'Requested Deals' },
  { key: 'bids', label: 'My Bids' },
];

/** `?tab=requested` style values; anything unknown falls back to Active. */
export function parseHubTab(value: unknown): HubTab {
  const hit = HUB_TABS.find(tab => tab.key === value);
  return hit ? hit.key : 'active';
}

export function splitHub<T extends DealLike>(deals: T[]) {
  return {
    requested: deals.filter(isRequested),
    active: deals.filter(deal => !isRequested(deal) && !isDeadDeal(deal)),
  };
}

/** What the card shows: escrow held, else the booking budget, else the bid. */
export function dealAmount(deal: DealLike): number {
  const candidates = [
    deal?.escrow?.held_amount,
    deal?.campaign?.budget_max,
    deal?.campaign?.budget_min,
    deal?.my_bid?.amount,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Short label + colour for an active deal (MyDealsHubPage.activeMeta). */
export function activeMeta(deal: DealLike): { label: string; color: string } {
  const full = String(deal?.current_state || 'Active');
  const s = full.toLowerCase();
  if (s.includes('paid') || s.includes('complete')) return { label: 'Paid', color: '#22c55e' };
  if (s.includes('approved')) return { label: 'Approved', color: '#22c55e' };
  if (s.includes('revision')) return { label: 'Revision Requested', color: '#f97316' };
  if (s.includes('submitted') || (s.includes('await') && s.includes('review'))) {
    return { label: 'In Review', color: '#f59e0b' };
  }
  if (s.includes('dispute')) return { label: 'Disputed', color: '#ef4444' };
  if (s.includes('damaged')) return { label: 'Issue Reported', color: '#ef4444' };
  if (s.includes('content in progress') || s.includes('received')) {
    return { label: 'Content in Progress', color: '#6366f1' };
  }
  if (s.includes('delivered')) return { label: 'Delivered', color: '#6366f1' };
  if (s.includes('shipped') || s.includes('transit')) return { label: 'Shipped', color: '#3b82f6' };
  if (s.includes('accepted') || s.includes('awaiting shipment')) {
    return { label: 'Awaiting Shipment', color: '#3b82f6' };
  }
  return { label: full, color: '#16a34a' };
}

/* ------------------------------- shipping ------------------------------- */

/** Does a physical product travel on this deal? */
export const hasShipping = (deal: DealLike) =>
  Boolean(
    deal?.shipment?.required ||
      deal?.campaign?.requires_shipment ||
      deal?.requires_shipment,
  );

/**
 * The payload sends `can_mark_received`, `shipment.courier_status` and
 * `shipment.tracking_id` (server.py build_deal_response). The app used to read
 * `requires_shipment`, `shipment.status` and `tracking_number`, none of which
 * exist, so "Mark received" never showed.
 */
export const canMarkReceived = (deal: DealLike) =>
  Boolean(deal?.can_mark_received) && !deal?.receipt?.received_at;

export const canReportDamage = (deal: DealLike) =>
  canMarkReceived(deal) || Boolean(deal?.can_report_damage);

/* ------------------------------ progress -------------------------------- */

const STEPS_SHIP = ['Accepted', 'Shipped', 'In Progress', 'Submitted', 'In Review', 'Approved', 'Paid'];
const STEPS_NOSHIP = ['Accepted', 'In Progress', 'Submitted', 'In Review', 'Approved', 'Paid'];
const SUBS_SHIP = ['Deal accepted', 'Product on the way', 'Working on it', 'Waiting for you', 'Waiting for review', 'Waiting for approval', 'Waiting for payout'];
const SUBS_NOSHIP = ['Deal accepted', 'Working on it', 'Waiting for you', 'Waiting for review', 'Waiting for approval', 'Waiting for payout'];

export const dealSteps = (ships: boolean) => (ships ? STEPS_SHIP : STEPS_NOSHIP);
export const dealSubs = (ships: boolean) => (ships ? SUBS_SHIP : SUBS_NOSHIP);

/** Index on the stepper; "Shipped" is an early step, right after Accepted. */
export function stepIndexFor(state: string, ships: boolean): number {
  const s = stateKey(state);
  const steps = dealSteps(ships);
  const at = (label: string) => Math.max(0, steps.indexOf(label));
  if (s.includes('paid')) return at('Paid');
  if (s.includes('raw approved')) return at('In Progress');
  if (s.includes('approved')) return at('Approved');
  if (s.includes('await') && s.includes('review')) return at('In Review');
  if (s.includes('content submitted')) return at('Submitted');
  if (
    s.includes('revision') ||
    s.includes('content in progress') ||
    s.includes('received') ||
    s.includes('delivered')
  ) {
    return at('In Progress');
  }
  if (ships && (s.includes('shipped') || s.includes('transit'))) return at('Shipped');
  return at('Accepted');
}

/* ---------------------------- primary action ---------------------------- */

export type PrimaryType =
  | 'passive'
  | 'add_evidence'
  | 'archive'
  | 'receipt'
  | 'content'
  | 'ship_address'
  | 'ship_address_done'
  | 'track_shipment';

export type PrimaryAction = { label: string; type: PrimaryType; disabled: boolean };

const isDamageState = (deal: DealLike) => {
  const s = stateKey(deal?.current_state);
  return s.includes('damaged') || s.includes('damage');
};

/** The one thing the creator should do next (MyDealsPage.getPrimaryActionConfig). */
export function primaryAction(deal: DealLike | null | undefined): PrimaryAction {
  if (!deal) return { label: 'No deal selected', type: 'passive', disabled: true };
  const s = stateKey(deal.current_state);
  const status = stateKey(deal.status || deal.campaign?.status);
  if (status === 'cancelled' || s === 'cancelled') {
    return { label: 'Deal Cancelled', type: 'passive', disabled: true };
  }
  if (isDamageState(deal)) return { label: 'Add Evidence', type: 'add_evidence', disabled: false };
  if (isState(deal, 'Paid - Complete')) return { label: 'Archive Deal', type: 'archive', disabled: false };
  if (isState(deal, 'Delivered - Awaiting Receipt Confirmation')) {
    return { label: 'Mark Received', type: 'receipt', disabled: !deal.can_mark_received };
  }
  if (
    isState(deal, 'Received - Content in Progress') ||
    isState(deal, 'Revision Requested') ||
    isState(deal, 'Raw Approved - Edited Video Due')
  ) {
    const stage = deal.edit_flow?.stage;
    const rawOnly = deal.content_submission?.required_assets?.raw_only;
    const label = isState(deal, 'Revision Requested')
      ? 'Submit Revision'
      : stage === 'raw' || rawOnly
      ? 'Submit Raw Video'
      : stage === 'edited'
      ? 'Submit Edited Video'
      : 'Submit Content';
    return { label, type: 'content', disabled: !deal.can_submit_content };
  }
  // The backend's "Upload shipment tracking" is the BRAND's job; the creator's
  // job right after accepting is to say where the product should be sent.
  if (isState(deal, 'Accepted - Awaiting Shipment') && hasShipping(deal)) {
    if (deal.shipment?.creator_address_confirmed) {
      return { label: 'Delivery Address Submitted', type: 'ship_address_done', disabled: true };
    }
    return { label: 'Confirm Delivery Address', type: 'ship_address', disabled: false };
  }
  if (stateKey(deal.primary_next_action).includes('track')) {
    return {
      label: String(deal.primary_next_action || 'Track shipment'),
      type: 'track_shipment',
      disabled: !deal.shipment?.courier_tracking_url,
    };
  }
  return { label: String(deal.primary_next_action || 'Waiting'), type: 'passive', disabled: true };
}

/* ------------------------------ revisions ------------------------------- */

/**
 * The brand's requested changes as a clean checklist: one entry per line or
 * sentence, bullets stripped, duplicates (ignoring a leading "[must-fix]" tag)
 * dropped. Falls back to the free-text feedback.
 */
export function toChangeItems(revision: DealLike | null | undefined): string[] {
  const rev = revision || {};
  const raw: unknown[] = rev.requested_changes?.length
    ? rev.requested_changes
    : rev.latest_feedback
    ? [rev.latest_feedback]
    : [];
  const seen = new Set<string>();
  const items: string[] = [];
  raw.forEach(entry => {
    String(entry || '')
      .split(/\r?\n|(?<=\.)\s+(?=[A-Z0-9])/)
      .map(line => line.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .forEach(line => {
        const key = line.replace(/^\s*\[[^\]]*\]\s*/, '').toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(line);
        }
      });
  });
  return items;
}

const CHANGE_TAG = /^\s*\[([^\]@]+?)(?:\s*@\s*(\d+:\d{2}))?\]\s*/;

/** "[must-fix @ 0:04] Re-shoot the intro" -> severity, pinned moment, text. */
export function parseChange(line: string): {
  severity: 'must-fix' | 'preference' | '';
  timestamp: string;
  text: string;
} {
  const match = String(line).match(CHANGE_TAG);
  if (!match) return { severity: '', timestamp: '', text: String(line) };
  const sev = (match[1] || '').trim().toLowerCase();
  return {
    severity: sev === 'must-fix' ? 'must-fix' : sev ? 'preference' : '',
    timestamp: match[2] || '',
    text: String(line).slice(match[0].length),
  };
}

export const REVISION_RESPONSE_LABEL: Record<string, string> = {
  accepted: 'You accepted this revision. Submit your revised content.',
  scope_creep:
    'You told the brand these changes go beyond the brief. Work it out together in chat. If you cannot agree, escalate to admin.',
  partial_dispute:
    'You accepted some changes and pushed back on the rest. Sort the rest out with the brand in chat. If you cannot agree, escalate to admin.',
};

const openCards = (deal: DealLike, ...types: string[]) =>
  (Array.isArray(deal?.action_cards) ? deal.action_cards : []).some(
    (card: DealLike) => types.includes(card?.type) && card?.status === 'open',
  );

/** An admin dispute / escalation is already open on this deal. */
export const disputeOpen = (deal: DealLike) =>
  stateKey(deal?.current_state) === 'disputed' ||
  openCards(deal, 'raise_dispute', 'escalate_to_admin');

/**
 * Creators cannot raise a dispute (POST /deals/{id}/dispute answers 403).
 * They may only escalate once they have flagged a revision or reported a
 * damaged/wrong product (POST /deals/{id}/escalate answers 400 otherwise).
 */
export function canEscalate(deal: DealLike): boolean {
  if (disputeOpen(deal)) return false;
  const response = deal?.revision_tracker?.creator_response;
  return (
    response === 'scope_creep' ||
    response === 'partial_dispute' ||
    isDamageState(deal) ||
    openCards(deal, 'damage_report')
  );
}

/* ----------------------------- active work ------------------------------ */

const WORK_STAGES_SHIP = ['Accepted', 'Shipment', 'Video Submission', 'Review', 'Payout'];

/** Stage labels on an Active Work card; online-only deals have no Shipment. */
export const workStages = (deal: DealLike) =>
  hasShipping(deal) ? WORK_STAGES_SHIP : WORK_STAGES_SHIP.filter(s => s !== 'Shipment');

/** Index into workStages(); derived from the state because the payload has no stage number. */
export function workStageIndex(deal: DealLike): number {
  const stages = workStages(deal);
  const at = (label: string) => Math.max(0, stages.indexOf(label));
  const s = stateKey(deal?.current_state);
  if (s.includes('paid') || s === 'completed') return at('Payout');
  if (s.includes('approved') || s.includes('submitted') || (s.includes('await') && s.includes('review'))) {
    return at('Review');
  }
  if (s.includes('revision') || s.includes('content in progress') || s.includes('received') || s.includes('raw approved')) {
    return at('Video Submission');
  }
  if (hasShipping(deal) && (s.includes('shipped') || s.includes('transit') || s.includes('delivered') || s.includes('awaiting shipment'))) {
    return at('Shipment');
  }
  // Nothing to wait for on an online-only deal: filming starts at once.
  return hasShipping(deal) ? at('Accepted') : at('Video Submission');
}

/** Badge on an Active Work card: Revision / In Review / Over Time / Upcoming / ... */
export function workStatusMeta(
  deal: DealLike,
  now: number = Date.now(),
): { label: string; color: string } {
  const campaign = deal?.campaign || {};
  const s = stateKey(deal?.current_state);
  if (campaign.booking_status === 'pending_creator') return { label: 'Booking Request', color: '#4452f0' };
  if (campaign.booking_status === 'price_revision') return { label: 'Price Sent - Awaiting Brand', color: '#f59e0b' };
  if (s.includes('revision')) return { label: 'Revision Requested', color: '#f97316' };
  if (s.includes('paid') || s === 'completed') return { label: 'Completed', color: '#22c55e' };
  if (s.includes('cancel')) return { label: 'Cancelled', color: '#ef4444' };
  if (s.includes('submitted') || (s.includes('await') && s.includes('review'))) {
    return { label: 'In Review', color: '#f59e0b' };
  }
  const due = Date.parse(String(deal?.deadline || campaign.due_date || ''));
  if (Number.isFinite(due) && due < now) return { label: 'Over Time', color: '#ef4444' };
  const start = Date.parse(String(campaign.start_date || campaign.scheduled_at || ''));
  if (Number.isFinite(start) && start > now) return { label: 'Upcoming', color: '#f97316' };
  return { label: 'Active', color: '#16a34a' };
}

/** Tab-bucket: the app's ActiveWork tabs (Requests / Active / Completed / Cancelled). */
export const needsRevision = (deal: DealLike) => stateKey(deal?.current_state).includes('revision');

/* -------------------------------- brief --------------------------------- */

const deliveryLabel = (item: DealLike) => {
  const edited = item?.edited_required;
  const raw = item?.raw_required !== false;
  const content = edited ? (raw ? 'Raw + Edited video' : 'Edited video') : 'Raw video';
  return edited ? `${content} (edited by ${item?.edited_by === 'ugc' ? 'UGC.ad' : 'creator'})` : content;
};

const joined = (value: unknown, sep = ', ') => (Array.isArray(value) ? value.join(sep) : value);

/**
 * "View full brief": the rows the website's Deal Room builds from GET
 * /campaigns/{id}, because the deal itself only carries a few short sections.
 * Empty values are dropped.
 */
export function fullBriefRows(fb: DealLike | null | undefined): { label: string; value: string }[] {
  const b = fb || {};
  const rows: [string, unknown][] = [
    ['Product', b.product_name],
    ['Product type', [b.product_type, b.product_type_detail].filter(Boolean).join(' - ')],
    ['Delivery type', (b.deliverable_items || []).map(deliveryLabel).join('; ')],
    ['Script provider', b.script_provider === 'ugc' ? 'UGC.ad' : b.script_provider === 'brand' ? 'Brand' : ''],
    ['Script', b.script_text || (b.script_provider === 'ugc' ? 'UGC.ad is preparing the script.' : '')],
    ['Product description', b.product_description],
    ['Campaign hook', b.campaign_hook],
    ['Key message', b.key_message],
    ['Video language', b.language],
    ['Objectives', joined(b.objectives)],
    ['Format', [b.video_format, b.duration_seconds ? `${b.duration_seconds} sec` : null, b.aspect_ratio].filter(Boolean).join(' · ')],
    ['Tone', Array.isArray(b.tone_tags) ? b.tone_tags.join(', ') : b.tone_reference || b.tone_tags],
    ['What not to do', joined(b.what_not_to_do, '; ')],
    ['Additional deliverables', joined(b.additional_deliverables)],
    ['Revisions included', b.revision_limit ?? b.free_revisions],
    ['Creator level', b.creator_level],
    ['Quality tier', b.content_quality_tier],
    ['Gender preference', b.gender_preference],
    ['Creator location', b.city_filter || 'Any location'],
    ['Niche', joined(b.creator_niche_tags)],
    ['Budget', b.budget_min || b.budget_max ? `Rs. ${Number(b.budget_max || b.budget_min).toLocaleString('en-IN')}` : null],
  ];
  return rows
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }));
}
