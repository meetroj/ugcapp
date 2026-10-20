import {
  activeMeta,
  bookingStage,
  canEscalate,
  canMarkReceived,
  canReportDamage,
  dealAmount,
  disputeOpen,
  findDeal,
  fullBriefRows,
  hasShipping,
  isDeadDeal,
  isRequested,
  parseChange,
  parseHubTab,
  primaryAction,
  splitHub,
  stepIndexFor,
  toChangeItems,
  validateCounter,
  workStageIndex,
  workStages,
  workStatusMeta,
} from '../src/dealRoom';
import { buildWorkPayload, submitProblem, workKind, zonesFor } from '../src/screens/WorkSubmitSheet';
import { isValidAddress, sameAddress } from '../src/screens/DeliveryAddress';
import { receiptProblem } from '../src/screens/DeliveryReceipt';

const deal = (over: Record<string, any> = {}) => ({
  deal_id: 'DEAL-1234',
  current_state: 'Received - Content in Progress',
  campaign: { id: 'uuid-1', title: 'Launch' },
  ...over,
});

describe('deep link lookup', () => {
  test('matches campaign.id, deal_id and a top-level campaign_id; the payload only has campaign.id', () => {
    const list = [deal(), deal({ deal_id: 'DEAL-9', campaign: { id: 'uuid-2' } })];
    expect(findDeal(list, 'uuid-2')?.deal_id).toBe('DEAL-9');
    expect(findDeal(list, 'DEAL-1234')?.campaign.id).toBe('uuid-1');
    expect(findDeal([{ deal_id: 'x', campaign_id: 'cc' }], 'cc')).toBeTruthy();
    expect(findDeal(list, 'nope')).toBeUndefined();
    expect(findDeal(list, '')).toBeUndefined();
  });

  test('tab parameter falls back to active', () => {
    expect(parseHubTab('requested')).toBe('requested');
    expect(parseHubTab('bids')).toBe('bids');
    expect(parseHubTab('weird')).toBe('active');
    expect(parseHubTab(undefined)).toBe('active');
  });
});

describe('bookings and the hub split', () => {
  test('booking stages', () => {
    expect(bookingStage(deal({ campaign: { booking_status: 'pending_creator' } }))).toBe('respond');
    expect(bookingStage(deal({ campaign: { booking_status: 'price_revision' } }))).toBe('counter_sent');
    expect(bookingStage(deal({ campaign: { booking_status: 'accepted' } }))).toBe('awaiting_brief');
    expect(bookingStage(deal({ campaign: { booking_status: 'accepted', brief_sent: true } }))).toBeNull();
    expect(bookingStage(deal())).toBeNull();
  });

  test('requested vs active, declined and cancelled are hidden', () => {
    const pending = deal({ deal_id: 'a', campaign: { booking_status: 'pending_creator' } });
    const countered = deal({ deal_id: 'b', campaign: { booking_status: 'price_revision' } });
    const declined = deal({ deal_id: 'c', campaign: { booking_status: 'declined' } });
    const cancelled = deal({ deal_id: 'd', current_state: 'Cancelled' });
    const live = deal({ deal_id: 'e' });
    const { active, requested } = splitHub([pending, countered, declined, cancelled, live]);
    expect(requested.map(d => d.deal_id)).toEqual(['a', 'b']);
    expect(active.map(d => d.deal_id)).toEqual(['e']);
    expect(isRequested(live)).toBe(false);
    expect(isDeadDeal(declined)).toBe(true);
  });

  test('counter price must be a positive number', () => {
    expect(validateCounter('')).not.toBe('');
    expect(validateCounter('0')).not.toBe('');
    expect(validateCounter('abc')).not.toBe('');
    expect(validateCounter('-5')).not.toBe('');
    expect(validateCounter('4,500')).toBe('');
    expect(validateCounter('5000')).toBe('');
  });

  test('card amount is escrow held, then the booking budget, never a bare 0 bid', () => {
    expect(dealAmount(deal({ escrow: { held_amount: 3000 } }))).toBe(3000);
    expect(dealAmount(deal({ escrow: { held_amount: 0 }, campaign: { budget_max: 4000 } }))).toBe(4000);
    expect(dealAmount(deal({ my_bid: { amount: 1200 } }))).toBe(1200);
    expect(dealAmount(deal())).toBe(0);
  });

  test('active badge labels', () => {
    expect(activeMeta(deal({ current_state: 'Revision Requested' })).label).toBe('Revision Requested');
    expect(activeMeta(deal({ current_state: 'Content Submitted - Awaiting Review' })).label).toBe('In Review');
    expect(activeMeta(deal({ current_state: 'Accepted - Awaiting Shipment' })).label).toBe('Awaiting Shipment');
  });
});

describe('shipping flags come from the real payload fields', () => {
  test('can_mark_received drives Mark received; the old requires_shipment / shipment.status guess does not', () => {
    expect(canMarkReceived(deal({ can_mark_received: true }))).toBe(true);
    expect(canMarkReceived(deal({ can_mark_received: true, receipt: { received_at: 'x' } }))).toBe(false);
    expect(canMarkReceived(deal({ requires_shipment: true, shipment: { status: 'delivered', tracking_number: 'T' } }))).toBe(false);
    expect(canReportDamage(deal({ can_report_damage: true }))).toBe(true);
    expect(canReportDamage(deal())).toBe(false);
  });

  test('hasShipping reads shipment.required or campaign.requires_shipment', () => {
    expect(hasShipping(deal({ shipment: { required: true } }))).toBe(true);
    expect(hasShipping(deal({ campaign: { requires_shipment: true } }))).toBe(true);
    expect(hasShipping(deal())).toBe(false);
  });

  test('stepper puts Shipped right after Accepted only for shipping deals', () => {
    expect(stepIndexFor('Shipped - In Transit', true)).toBe(1);
    expect(stepIndexFor('Received - Content in Progress', true)).toBe(2);
    expect(stepIndexFor('Received - Content in Progress', false)).toBe(1);
    expect(stepIndexFor('Paid - Complete', true)).toBe(6);
    expect(stepIndexFor('Paid - Complete', false)).toBe(5);
  });
});

describe('primary action', () => {
  test('confirm delivery address, then waiting', () => {
    const base = deal({ current_state: 'Accepted - Awaiting Shipment', shipment: { required: true } });
    expect(primaryAction(base)).toMatchObject({ type: 'ship_address', disabled: false });
    expect(primaryAction({ ...base, shipment: { required: true, creator_address_confirmed: true } })).toMatchObject({
      type: 'ship_address_done',
      disabled: true,
    });
  });

  test('mark received, submit, revision, archive', () => {
    expect(primaryAction(deal({ current_state: 'Delivered - Awaiting Receipt Confirmation', can_mark_received: true }))).toMatchObject({ type: 'receipt', disabled: false });
    expect(primaryAction(deal({ current_state: 'Delivered - Awaiting Receipt Confirmation' }))).toMatchObject({ type: 'receipt', disabled: true });
    expect(primaryAction(deal({ can_submit_content: true }))).toMatchObject({ label: 'Submit Content', type: 'content', disabled: false });
    expect(primaryAction(deal({ can_submit_content: true, edit_flow: { stage: 'raw' } })).label).toBe('Submit Raw Video');
    expect(primaryAction(deal({ current_state: 'Revision Requested', can_submit_content: true })).label).toBe('Submit Revision');
    expect(primaryAction(deal({ current_state: 'Paid - Complete' }))).toMatchObject({ type: 'archive', disabled: false });
    // "Unpaid" must not read as paid.
    expect(primaryAction(deal({ current_state: 'Unpaid - Incomplete' })).type).not.toBe('archive');
  });

  test('cancelled deals offer nothing; tracking needs a link', () => {
    expect(primaryAction(deal({ current_state: 'Cancelled' }))).toMatchObject({ type: 'passive', disabled: true });
    expect(primaryAction(deal({ current_state: 'Shipped - In Transit', primary_next_action: 'Track shipment' }))).toMatchObject({ type: 'track_shipment', disabled: true });
    expect(primaryAction(deal({ current_state: 'Shipped - In Transit', primary_next_action: 'Track shipment', shipment: { courier_tracking_url: 'https://t' } })).disabled).toBe(false);
  });
});

describe('creators cannot dispute, only escalate after talking', () => {
  test('escalate needs a flagged revision or a damage report, and no open dispute', () => {
    expect(canEscalate(deal())).toBe(false);
    expect(canEscalate(deal({ revision_tracker: { creator_response: 'accepted' } }))).toBe(false);
    expect(canEscalate(deal({ revision_tracker: { creator_response: 'scope_creep' } }))).toBe(true);
    expect(canEscalate(deal({ revision_tracker: { creator_response: 'partial_dispute' } }))).toBe(true);
    expect(canEscalate(deal({ current_state: 'Damaged/Wrong Product Reported' }))).toBe(true);
    expect(canEscalate(deal({ action_cards: [{ type: 'damage_report', status: 'open' }] }))).toBe(true);
    expect(canEscalate(deal({ revision_tracker: { creator_response: 'scope_creep' }, action_cards: [{ type: 'escalate_to_admin', status: 'open' }] }))).toBe(false);
  });

  test('an open dispute is read from action cards or the Disputed state, not a deal.dispute field', () => {
    expect(disputeOpen(deal({ current_state: 'Disputed' }))).toBe(true);
    expect(disputeOpen(deal({ action_cards: [{ type: 'raise_dispute', status: 'open' }] }))).toBe(true);
    expect(disputeOpen(deal({ action_cards: [{ type: 'raise_dispute', status: 'resolved' }] }))).toBe(false);
    expect(disputeOpen(deal({ dispute: { status: 'open' } }))).toBe(false);
  });
});

describe('revision checklist', () => {
  test('splits lines, strips bullets, drops duplicates ignoring the severity tag', () => {
    const items = toChangeItems({
      requested_changes: ['- [must-fix @ 0:04] Re-shoot the intro', '1. Brighter lighting\nBrighter lighting', 'Re-shoot the intro'],
    });
    expect(items).toEqual(['[must-fix @ 0:04] Re-shoot the intro', 'Brighter lighting']);
  });

  test('falls back to the feedback text', () => {
    expect(toChangeItems({ latest_feedback: 'Change the opening' })).toEqual(['Change the opening']);
    expect(toChangeItems({})).toEqual([]);
  });

  test('parses severity and the pinned moment', () => {
    expect(parseChange('[must-fix @ 0:04] Re-shoot')).toEqual({ severity: 'must-fix', timestamp: '0:04', text: 'Re-shoot' });
    expect(parseChange('[preference] Softer music')).toEqual({ severity: 'preference', timestamp: '', text: 'Softer music' });
    expect(parseChange('Plain')).toEqual({ severity: '', timestamp: '', text: 'Plain' });
  });
});

describe('work submission sheet', () => {
  const entry = (name: string, isVideo = true) => ({ url: `https://cdn/${name}`, name, isVideo });
  const files = (over: Record<string, any[]> = {}) => ({ files: [], edited: [], raw: [], ...over });

  test('which zones: edit_flow stage wins, then an edited deliverable, else one free zone', () => {
    expect(workKind(deal({ edit_flow: { stage: 'raw' } }))).toBe('raw');
    expect(workKind(deal({ edit_flow: { stage: 'edited' } }))).toBe('edited');
    expect(workKind(deal({ campaign: { deliverable_items: [{ edited_required: true }] } }))).toBe('both');
    expect(workKind(deal())).toBe('single');
    expect(zonesFor('both').map(z => z.key)).toEqual(['edited', 'raw']);
    expect(zonesFor('single')[0].media).toBe('mixed');
    expect(zonesFor('raw')[0].media).toBe('video');
  });

  test('validation: files, both files for an edited brief, a description, nothing uploading', () => {
    expect(submitProblem('single', files(), 'x', false)).toMatch(/at least one file/);
    expect(submitProblem('single', files({ files: [entry('a.mp4')] }), '  ', false)).toMatch(/description/);
    expect(submitProblem('single', files({ files: [entry('a.mp4')] }), 'ok', true)).toMatch(/still uploading/);
    expect(submitProblem('single', files({ files: [entry('a.mp4')] }), 'ok', false)).toBe('');
    expect(submitProblem('both', files({ edited: [entry('e.mp4')] }), 'ok', false)).toMatch(/raw/i);
    expect(submitProblem('both', files({ raw: [entry('r.mp4')] }), 'ok', false)).toMatch(/edited file/);
    expect(submitProblem('raw', files(), 'ok', false)).toMatch(/raw video/);
    expect(submitProblem('edited', files({ edited: [entry('e.mp4')] }), 'ok', false)).toBe('');
  });

  test('payloads: edited cut leads, videos before images, stage files mirrored', () => {
    expect(buildWorkPayload('both', files({ edited: [entry('e.mp4')], raw: [entry('r.mp4')] }), ' note ')).toEqual({
      work_files: ['https://cdn/e.mp4', 'https://cdn/r.mp4'],
      edited_files: ['https://cdn/e.mp4'],
      raw_files: ['https://cdn/r.mp4'],
      description: 'note',
    });
    expect(buildWorkPayload('single', files({ files: [entry('p.jpg', false), entry('v.mp4')] }), 'n')).toEqual({
      work_files: ['https://cdn/v.mp4', 'https://cdn/p.jpg'],
      edited_files: [],
      raw_files: [],
      description: 'n',
    });
    expect(buildWorkPayload('raw', files({ raw: [entry('r.mp4')] }), 'n')).toMatchObject({ work_files: ['https://cdn/r.mp4'], raw_files: ['https://cdn/r.mp4'] });
    expect(buildWorkPayload('edited', files({ edited: [entry('e.mp4')] }), 'n')).toMatchObject({ edited_files: ['https://cdn/e.mp4'] });
  });
});

describe('delivery address and receipt rules', () => {
  const good = { full_name: 'A B', phone: '9876543210', line1: '1 Road', city: 'Pune', state: 'MH', pincode: '411001' };

  test('address needs every field, 10-digit phone and 6-digit pincode', () => {
    expect(isValidAddress(good)).toBe(true);
    expect(isValidAddress({ ...good, pincode: '4110' })).toBe(false);
    expect(isValidAddress({ ...good, phone: '12345' })).toBe(false);
    expect(isValidAddress({ ...good, city: ' ' })).toBe(false);
    expect(isValidAddress(null)).toBe(false);
    expect(sameAddress(good, { ...good, line1: '1 road' })).toBe(true);
    expect(sameAddress(good, { ...good, city: 'Delhi' })).toBe(false);
  });

  test('receipt needs shipped, a video and, when damaged, a description', () => {
    expect(receiptProblem({ canMark: false, hasVideo: true, damaged: false, description: '' })).toMatch(/after the brand ships/);
    expect(receiptProblem({ canMark: true, hasVideo: false, damaged: false, description: '' })).toMatch(/unboxing video/);
    expect(receiptProblem({ canMark: true, hasVideo: true, damaged: true, description: ' ' })).toMatch(/Describe/);
    expect(receiptProblem({ canMark: true, hasVideo: true, damaged: true, description: 'cracked' })).toBe('');
    expect(receiptProblem({ canMark: true, hasVideo: true, damaged: false, description: '' })).toBe('');
  });
});

describe('active work cards', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');

  test('stage list drops Shipment for online-only deals and progress follows the state', () => {
    const online = deal();
    const ships = deal({ shipment: { required: true } });
    expect(workStages(online)).toEqual(['Accepted', 'Video Submission', 'Review', 'Payout']);
    expect(workStages(ships)).toEqual(['Accepted', 'Shipment', 'Video Submission', 'Review', 'Payout']);
    expect(workStageIndex({ ...ships, current_state: 'Shipped - In Transit' })).toBe(1);
    expect(workStageIndex({ ...ships, current_state: 'Received - Content in Progress' })).toBe(2);
    expect(workStageIndex({ ...ships, current_state: 'Content Submitted - Awaiting Review' })).toBe(3);
    expect(workStageIndex({ ...ships, current_state: 'Paid - Complete' })).toBe(4);
    expect(workStageIndex({ ...online, current_state: 'Paid - Complete' })).toBe(3);
  });

  test('status badges', () => {
    expect(workStatusMeta(deal({ current_state: 'Revision Requested' }), now).label).toBe('Revision Requested');
    expect(workStatusMeta(deal({ current_state: 'Content Submitted - Awaiting Review' }), now).label).toBe('In Review');
    expect(workStatusMeta(deal({ deadline: '2026-10-01T00:00:00Z' }), now).label).toBe('Over Time');
    expect(workStatusMeta(deal({ campaign: { id: 'x', start_date: '2026-11-01T00:00:00Z' } }), now).label).toBe('Upcoming');
    expect(workStatusMeta(deal({ campaign: { booking_status: 'pending_creator' } }), now).label).toBe('Booking Request');
    expect(workStatusMeta(deal(), now).label).toBe('Active');
  });
});

describe('full brief rows', () => {
  test('drops empty values and formats the pieces', () => {
    const rows = fullBriefRows({
      product_name: 'Serum',
      objectives: ['Sales', 'Reach'],
      deliverable_items: [{ edited_required: true, edited_by: 'ugc' }],
      duration_seconds: 30,
      aspect_ratio: '9:16',
      budget_max: 5000,
    });
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]));
    expect(byLabel.Product).toBe('Serum');
    expect(byLabel.Objectives).toBe('Sales, Reach');
    expect(byLabel['Delivery type']).toBe('Raw + Edited video (edited by UGC.ad)');
    expect(byLabel.Format).toContain('30 sec');
    expect(byLabel['Creator location']).toBe('Any location');
    expect(byLabel.Tone).toBeUndefined();
  });
});
