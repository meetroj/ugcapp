/**
 * Action-card definitions: what each card is called, which fields it collects,
 * and who may send it.
 *
 * These mirror the website's MessagesPage.js so a card sent from the app is
 * identical to one sent from the browser. The Node backend does NOT validate
 * per-field requirements (only the type and the sender's role), so the rules
 * here are the only thing standing between a half-filled form and a card that
 * reaches the other side with blank terms — they are enforced, not cosmetic.
 */
import type { ActionCardType } from './api';

export type FieldType = 'text' | 'number' | 'textarea' | 'select';

export type CardField = {
  key: string;
  label: string;
  type: FieldType;
  /** Prefilled for text/number/textarea; the default choice for select. */
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
    { key: 'timeline', label: 'Timeline', type: 'text', initial: '7 days' },
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
