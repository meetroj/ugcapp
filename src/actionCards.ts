/**
 * Action-card definitions: what each card is called, which fields it collects,
 * and who may send it.
 *
 * These mirror the website's MessagesPage.js so a card sent from the app is
 * identical to one sent from the browser. The backend (server.py,
 * validate_action_card_payload) also enforces per-field requirements per
 * card type, so this is belt-and-suspenders: the rules here give fast,
 * in-app feedback before the round trip, and the backend is the real gate.
 */
import type { ActionCardType } from './api';

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'date';

export type CardField = {
  key: string;
  label: string;
  type: FieldType;
  /** Prefilled for text/number/textarea; the default choice for select; a date is typed DD-MM-YYYY. */
  initial: string;
  /** Options for `select` fields. */
  options?: string[];
};

export const ACTION_CARD_LABELS: Record<ActionCardType, string> = {
  custom_offer: 'Custom Offer',
  private_invitation: 'Private Invitation',
  counter_offer: 'Counter Offer',
  revision_request: 'Revision Request',
  milestone_update: 'Milestone Update',
  damage_report: 'Damage Report',
  escalate_to_admin: 'Escalate to Admin',
  raise_dispute: 'Raise Dispute',
};

/**
 * Which cards each role may send.
 *
 * NOTE: the backend's own map is WIDER than this (it would let a brand send a
 * custom_offer and a creator raise a dispute). The website deliberately narrows
 * it — creators resolve with the brand first and only escalate, brands invite
 * rather than self-offer — and the app follows the website so both clients
 * behave the same. Widening this is a product decision, not a bug fix.
 */
export const ACTION_CARDS_BY_ROLE: Record<string, ActionCardType[]> = {
  creator: [
    'custom_offer',
    'counter_offer',
    'milestone_update',
    'damage_report',
    'escalate_to_admin',
  ],
  business: [
    'private_invitation',
    'counter_offer',
    'revision_request',
    'escalate_to_admin',
    'raise_dispute',
  ],
};

/**
 * Deal states in which a revision may be requested. The backend answers 409
 * outside them, so the button is hidden instead of failing on tap.
 */
export const REVISION_STATES = [
  'Content Submitted - Awaiting Review',
  'Revision Requested',
];

/**
 * The cards on offer for this user in this thread.
 *
 * `dealStatus` comes from the conversation row; revision_request is dropped
 * unless the deal is actually awaiting review.
 */
export function availableCards(
  role: string | undefined,
  dealStatus?: string | null,
): ActionCardType[] {
  const cards = ACTION_CARDS_BY_ROLE[role || ''] || [];
  if (REVISION_STATES.includes(String(dealStatus || ''))) return cards;
  return cards.filter(card => card !== 'revision_request');
}

export const ACTION_CARD_FIELDS: Record<ActionCardType, CardField[]> = {
  custom_offer: [
    { key: 'deliverable_type', label: 'Deliverable type', type: 'text', initial: 'Video' },
    { key: 'quantity', label: 'Quantity', type: 'number', initial: '1' },
    { key: 'duration', label: 'Duration', type: 'text', initial: '30 seconds' },
    { key: 'price', label: 'Price', type: 'number', initial: '5000' },
    { key: 'timeline', label: 'Timeline', type: 'text', initial: '7 days' },
    { key: 'usage_rights', label: 'Usage rights', type: 'text', initial: 'Organic social' },
  ],
  private_invitation: [
    { key: 'campaign_name', label: 'Campaign name', type: 'text', initial: 'Private campaign' },
    { key: 'deliverable_summary', label: 'Deliverable summary', type: 'text', initial: 'UGC video' },
    { key: 'budget', label: 'Budget', type: 'number', initial: '5000' },
    { key: 'timeline', label: 'Timeline', type: 'text', initial: '7 days' },
    { key: 'usage_rights', label: 'Usage rights', type: 'text', initial: 'Organic social' },
    { key: 'brief_details', label: 'Brief', type: 'textarea', initial: '' },
  ],
  counter_offer: [
    { key: 'modified_price', label: 'Modified price', type: 'number', initial: '5000' },
    { key: 'revisions', label: 'Revisions', type: 'text', initial: '1' },
    { key: 'timeline', label: 'Delivery date', type: 'date', initial: '' },
    { key: 'usage_rights', label: 'Usage rights', type: 'text', initial: 'Organic social' },
    { key: 'diff_vs_original', label: 'Reason', type: 'textarea', initial: '' },
  ],
  revision_request: [
    { key: 'revision_text', label: 'Revision item', type: 'textarea', initial: '' },
  ],
  milestone_update: [
    {
      key: 'status',
      label: 'Current status',
      type: 'select',
      initial: 'Editing',
      options: ['In planning', 'Filming', 'Editing', 'Ready to submit'],
    },
    { key: 'notes', label: 'Notes', type: 'textarea', initial: '' },
  ],
  damage_report: [
    { key: 'reason', label: 'Reason', type: 'text', initial: 'Damaged product' },
    { key: 'description', label: 'Description', type: 'textarea', initial: '' },
    {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      initial: 'medium',
      options: ['low', 'medium', 'high'],
    },
  ],
  escalate_to_admin: [
    { key: 'summary', label: 'Summary', type: 'textarea', initial: '' },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      initial: 'communication',
      options: ['communication', 'timeline', 'clarity', 'other'],
    },
  ],
  raise_dispute: [
    { key: 'summary', label: 'Dispute summary', type: 'textarea', initial: '' },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      initial: 'communication',
      options: ['communication', 'timeline', 'clarity', 'other'],
    },
  ],
};

/** Keys that must be non-empty before the card may be sent. */
export const ACTION_CARD_REQUIRED: Record<ActionCardType, string[]> = {
  custom_offer: ['deliverable_type', 'quantity', 'duration', 'price', 'timeline', 'usage_rights'],
  private_invitation: ['campaign_name', 'deliverable_summary', 'budget', 'timeline', 'usage_rights', 'brief_details'],
  counter_offer: ['modified_price', 'revisions', 'timeline', 'usage_rights', 'diff_vs_original'],
  revision_request: ['revision_text'],
  milestone_update: ['status'], // notes are optional
  damage_report: ['reason', 'description', 'severity'],
  escalate_to_admin: ['summary', 'category'],
  raise_dispute: ['summary', 'category'],
};

/**
 * Length rules. Escalations go to a human admin, so a two-word summary is
 * useless to them — the website enforces 100–500 characters and shows a live
 * counter, and the app does the same.
 */
export const ACTION_CARD_LIMITS: Partial<
  Record<ActionCardType, Record<string, { min: number; max: number }>>
> = {
  escalate_to_admin: { summary: { min: 100, max: 500 } },
};

/** Money fields that must be greater than zero. */
const AMOUNT_KEYS = ['budget', 'price', 'modified_price'];

/**
 * Validates a filled form. Returns a human-readable problem, or null when the
 * card is safe to send. Checks run in the same order as the website's so the
 * two clients report the same first error for the same input.
 */
export function validateCard(
  type: ActionCardType,
  form: Record<string, string>,
): string | null {
  const fields = ACTION_CARD_FIELDS[type] || [];
  const labelOf = (key: string) =>
    fields.find(field => field.key === key)?.label || key;

  const missing = (ACTION_CARD_REQUIRED[type] || []).filter(
    key => !String(form[key] ?? '').trim(),
  );
  if (missing.length) {
    return `Please fill in: ${missing.map(labelOf).join(', ')}`;
  }

  // A typed date has to be a real calendar day, or the card would carry junk.
  for (const field of fields) {
    if (field.type === 'date' && !displayToIso(String(form[field.key] ?? ''))) {
      return `${field.label} must be a real date as DD-MM-YYYY`;
    }
  }

  for (const key of AMOUNT_KEYS) {
    if (!(ACTION_CARD_REQUIRED[type] || []).includes(key)) continue;
    if (Number(form[key]) <= 0) {
      return `${labelOf(key)} must be greater than zero`;
    }
  }

  const limits = ACTION_CARD_LIMITS[type] || {};
  for (const key of Object.keys(limits)) {
    const { min, max } = limits[key];
    const length = String(form[key] ?? '').trim().length;
    if (length < min || length > max) {
      return `${labelOf(key)} must be ${min} to ${max} characters (currently ${length}).`;
    }
  }

  return null;
}

/** Fresh form state for a card, seeded with its defaults. */
export function initialForm(type: ActionCardType): Record<string, string> {
  const form: Record<string, string> = {};
  (ACTION_CARD_FIELDS[type] || []).forEach(field => {
    form[field.key] = field.initial;
  });
  return form;
}

/**
 * Offer cards whose rejection needs a structured reason — the backend records
 * it on the card and shows it to the sender.
 */
export const OFFER_CARD_TYPES: ActionCardType[] = [
  'custom_offer',
  'private_invitation',
  'counter_offer',
];

export const DECLINE_REASONS = [
  { value: 'not_my_niche', label: 'Not my niche' },
  { value: 'budget', label: "Budget doesn't fit" },
  { value: 'timeline', label: 'Timeline too short' },
  { value: 'unavailable', label: 'Currently unavailable' },
  { value: 'other', label: 'Other' },
];

/** Friendly labels for the buttons on a received card. */
export const RESPONSE_LABELS: Record<string, string> = {
  accept: 'Accept',
  reject: 'Decline',
  counter: 'Counter',
  flag_scope_creep: 'Scope creep',
  partial_accept: 'Partial',
};

/* ===================== Dates (the counter offer's delivery date) ===================== */

/** "12102026" -> "12-10-2026": dashes appear as the digits are typed. */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  return parts.filter(Boolean).join('-');
}

/** "31-12-2026" -> "2026-12-31", or '' when it is not a real calendar day. */
export function displayToIso(display: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display.trim());
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const real =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);
  return real ? `${year}-${month}-${day}` : '';
}

/** "2026-12-31" -> "31-12-2026"; anything else (e.g. "7 days") -> ''. */
export function isoToDisplay(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

/** Today plus `days`, as DD-MM-YYYY (the quick "in 7 days" chips). */
export function dateInDays(days: number, from: Date = new Date()): string {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(next.getDate())}-${pad(next.getMonth() + 1)}-${next.getFullYear()}`;
}

/* ============================ What a card sends ============================ */

/** Fields that must reach the backend as numbers, not strings (as the website sends them). */
const NUMBER_KEYS = ['quantity', 'price', 'budget', 'modified_price'];

/**
 * The `fields` object POSTed to /chat/action-cards, built the way the website
 * builds it: a revision request is `revision_items` (the backend returns 400 for
 * anything else), numbers are numbers, the date is ISO, and select values are
 * the lower-case slug ("Ready to submit" -> "ready_to_submit").
 */
export function buildCardFields(
  type: ActionCardType,
  form: Record<string, string>,
): Record<string, unknown> {
  if (type === 'revision_request') {
    return {
      revision_items: [
        { description: String(form.revision_text ?? '').trim(), severity: 'medium' },
      ],
    };
  }
  const out: Record<string, unknown> = {};
  for (const field of ACTION_CARD_FIELDS[type] || []) {
    const raw = String(form[field.key] ?? '');
    let value: unknown = raw.trim();
    if (field.type === 'select') {
      value = raw.trim().toLowerCase().replace(/ /g, '_');
    } else if (field.type === 'date') {
      value = displayToIso(raw);
    } else if (NUMBER_KEYS.includes(field.key) && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) value = n;
    }
    out[field.key] = value;
  }
  return out;
}

/**
 * Counter-offer form pre-filled from the offer being answered, so the user
 * tweaks a number instead of retyping everything (the website does the same).
 */
export function counterPrefill(card: Record<string, any>): Record<string, string> {
  const f = card.fields || {};
  const price = f.modified_price ?? f.price ?? f.budget;
  return {
    modified_price:
      price != null && String(price).trim() !== '' ? String(price) : '5000',
    revisions: f.revisions != null ? String(f.revisions) : '1',
    timeline: isoToDisplay(f.timeline),
    usage_rights: String(f.usage_rights || 'Organic social'),
    diff_vs_original: '',
  };
}

/** Label for a card field row; a dated counter timeline reads "Delivery date". */
export function cardFieldLabel(
  type: string | undefined,
  key: string,
  value: unknown,
): string {
  if (type === 'counter_offer' && key === 'timeline' && isoToDisplay(value)) {
    return 'delivery date';
  }
  return key.replace(/_/g, ' ');
}

/* =============================== Attachments =============================== */

/** Chat messages that are only files carry this prefix (the website's format). */
export const ATTACHMENT_MESSAGE_PREFIX = '__UGCAD_ATTACHMENT__:';
export const MAX_ATTACHMENTS = 5;

type MessageLike = Record<string, any>;

/** A message's files: its attachment_urls, else the ones packed after the prefix. */
export function messageAttachments(msg: MessageLike | null | undefined): string[] {
  if (!msg) return [];
  if (Array.isArray(msg.attachment_urls) && msg.attachment_urls.length) {
    return msg.attachment_urls.map(String);
  }
  if (
    typeof msg.message === 'string' &&
    msg.message.startsWith(ATTACHMENT_MESSAGE_PREFIX)
  ) {
    return msg.message
      .slice(ATTACHMENT_MESSAGE_PREFIX.length)
      .split('|')
      .filter(Boolean);
  }
  return [];
}

/** The text to show for a message: '' when it is only the packed file list. */
export function displayMessage(msg: MessageLike | null | undefined): string {
  const message = msg?.message;
  if (typeof message !== 'string') return '';
  return message.startsWith(ATTACHMENT_MESSAGE_PREFIX) ? '' : message;
}

/** The body POSTed for a send: the text, or the packed file list when there is none. */
export function outgoingMessage(text: string, urls: string[]): string {
  return text.trim() || `${ATTACHMENT_MESSAGE_PREFIX}${urls.join('|')}`;
}

export type AttachmentKind = 'image' | 'pdf' | 'video' | 'other';

/** What a file is, from its MIME type or (when the picker omits it) its name. */
export function attachmentKind(nameOrUrl: string, mime?: string | null): AttachmentKind {
  const type = String(mime || '').toLowerCase();
  const name = nameOrUrl.split('?')[0].toLowerCase();
  if (['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(type)) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('video/')) return 'video';
  if (type) return 'other';
  if (/\.(jpe?g|png|gif)$/.test(name)) return 'image';
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(mp4|mov|m4v|3gp|mkv|webm)$/.test(name)) return 'video';
  return 'other';
}

/** An uploaded file shown inline. Older uploads carry no extension; those were always images here. */
export function isImageUrl(url: string): boolean {
  const kind = attachmentKind(url);
  return (
    kind === 'image' || (kind === 'other' && !/\.[a-z0-9]{2,5}$/i.test(url.split('?')[0]))
  );
}

const MB = 1024 * 1024;

/**
 * Why a picked file cannot be attached, or '' when it can. Same rules and words
 * as the website: 5 files per message, jpg/png/gif/pdf/video only, images up to
 * 10 MB, PDFs 25 MB, videos 100 MB.
 */
export function attachmentProblem(
  file: { fileName?: string | null; uri?: string; type?: string | null; fileSize?: number | null },
  alreadyAttached: number,
): string {
  if (alreadyAttached + 1 > MAX_ATTACHMENTS) {
    return `A message can include at most ${MAX_ATTACHMENTS} attachments.`;
  }
  const kind = attachmentKind(file.fileName || file.uri || '', file.type);
  if (kind === 'other') return 'Upload jpg, png, gif, pdf, or video files only.';
  const size = Number(file.fileSize || 0);
  if (kind === 'image' && size > 10 * MB) return 'Images must be 10 MB or smaller.';
  if (kind === 'pdf' && size > 25 * MB) return 'PDFs must be 25 MB or smaller.';
  if (kind === 'video' && size > 100 * MB) return 'Videos must be 100 MB or smaller.';
  return '';
}

/** Last path segment of an uploaded file, decoded, for the file chip. */
export function attachmentName(url: string, index: number): string {
  const last = url.split('?')[0].split('/').pop() || '';
  try {
    return decodeURIComponent(last) || `Attachment ${index + 1}`;
  } catch {
    return last || `Attachment ${index + 1}`;
  }
}

/* ================================ Thread rules ================================ */

/** True while a policy strike limits this account to action cards (GET /chat/warnings). */
export function actionCardsOnly(
  warnings: { action_cards_only_until?: unknown } | null | undefined,
  now: number = Date.now(),
): boolean {
  const until = warnings?.action_cards_only_until;
  if (!until) return false;
  const at = Date.parse(String(until));
  return !Number.isNaN(at) && at > now;
}

/** "Read" / "Delivered" under a message we sent; '' under anyone else's and under cards. */
export function readLabel(
  item: Record<string, any>,
  myId: string,
  otherId: string,
): '' | 'Read' | 'Delivered' {
  if (String(item.sender_id) !== String(myId) || item.item_type === 'action_card') {
    return '';
  }
  const readBy = Array.isArray(item.read_by) ? item.read_by.map(String) : [];
  return item.status === 'read' || item.read_at || readBy.includes(String(otherId))
    ? 'Read'
    : 'Delivered';
}

/** The nudge a creator sends after accepting an invitation (same text as the website). */
export const NEED_BRIEF_MESSAGE =
  "I've accepted the invitation - please share the full brief so I can get started.";

/** Reasons offered when reporting a user (value is what the backend stores). */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'off_platform', label: 'Trying to move off-platform' },
  { value: 'payment_issue', label: 'Payment or fraud issue' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

/** A deal is reviewable from chat once it is completed (the backend re-checks). */
export function canReviewFromChat(
  viewerRole: string | undefined,
  row: { role?: string; associated_deal_status?: string | null; associated_campaign_id?: string | null } | null | undefined,
): boolean {
  return (
    viewerRole === 'creator' &&
    row?.role === 'business' &&
    String(row?.associated_deal_status || '').toLowerCase() === 'completed' &&
    !!row?.associated_campaign_id
  );
}

/* ================================ Who and where ================================ */

type PeerRow = Record<string, any>;
const clean = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/^@+/, '') : '';

/**
 * How the other person is named in a thread or the list. A brand sees a creator
 * by FIRST NAME only (never the full name or the @handle, as on the website); a
 * creator sees the brand's business name.
 */
export function chatPeerName(row: PeerRow | null | undefined, viewerRole?: string): string {
  if (!row) return viewerRole === 'business' ? 'Creator' : 'Unknown user';
  const p = row.profile || {};
  if (viewerRole === 'business' && row.role !== 'business') {
    const first = clean(row.first_name) || clean(p.first_name) || clean(p.firstName);
    const full =
      clean(row.full_name) || clean(p.fullName) || clean(p.full_name) || clean(row.nickname);
    return first || full.split(/\s+/)[0] || 'Creator';
  }
  return (
    clean(row.business_name) ||
    clean(p.business_name) ||
    clean(row.full_name) ||
    clean(p.fullName) ||
    clean(row.nickname) ||
    'Unknown user'
  );
}

/** One-line preview of the last item in a conversation row. */
export function conversationPreview(row: PeerRow): string {
  const last = row.last_message || {};
  const snippet = String(row.last_item_snippet ?? last.message ?? '').trim();
  if (snippet.startsWith(ATTACHMENT_MESSAGE_PREFIX)) return 'File attachment';
  if (!snippet && messageAttachments(last).length) return 'File attachment';
  if (last.item_type === 'action_card' && last.type && ACTION_CARD_LABELS[last.type as ActionCardType]) {
    return ACTION_CARD_LABELS[last.type as ActionCardType];
  }
  return snippet;
}

/**
 * Where "View details" (a creator) / "Open the campaign" (a brand) on a card goes. A creator opens the deal room (it
 * accepts a campaign id or a DEAL- code); a brand opens the campaign, which
 * needs a real campaign id, so a DEAL- code falls back to the thread's own
 * campaign. Null when the card names nothing to open.
 */
export function cardDealPath(
  role: string | undefined,
  card: Record<string, any>,
  threadCampaignId?: string | null,
): string | null {
  const named = String(card.campaign_id || card.deal_id || '');
  if (role === 'creator') {
    // An offer / private brief that names no deal yet must NOT fall back to the thread's
    // deal: that is some other, already-running deal between the same two people.
    const isOffer = ['private_invitation', 'custom_offer', 'counter_offer'].includes(String(card.type));
    const id = named || (isOffer ? '' : String(threadCampaignId || ''));
    return id ? `/my-deals/${id}` : null;
  }
  const campaign = String(card.campaign_id || '');
  const id = campaign || (named && !/^DEAL-/i.test(named) ? named : '') || (named ? String(threadCampaignId || '') : '');
  return id ? `/campaigns/${id}` : null;
}
