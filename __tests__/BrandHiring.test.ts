import {
  approveConfirm,
  approveLabel,
  approveMessage,
  bidDays,
  bidInTab,
  bidState,
  buildRevisionPayload,
  canReviewAfterApprove,
  dealProgressStep,
  dealStateIndex,
  editModeOf,
  fileExt,
  findContactInfo,
  findCreatorDeal,
  hireMessage,
  hireUnfunded,
  hireUnfundedMessage,
  hiredCreatorIds,
  isOpenForBids,
  paginate,
  parseRevisionItem,
  revisionChanges,
  revisionCounters,
  revisionItemCount,
  revisionNotice,
  revisionSentMessage,
  sortBids,
  workStatusOf,
} from '../src/brandHiring';

describe('hired detection (the backend never sets bid.status to accepted)', () => {
  const campaign = { selected_creators: ['c2'], creators_wanted: 3, status: 'active' };

  test('a creator on the roster is hired even though the bid says pending', () => {
    expect(bidState({ creator_id: 'c2', status: 'pending' }, hiredCreatorIds(campaign))).toBe('hired');
    expect(bidState({ creator_id: 'c9' }, hiredCreatorIds(campaign))).toBe('open');
    expect(bidState({ creator_id: 'c9', status: 'declined' }, hiredCreatorIds(campaign))).toBe('declined');
  });

  test('the legacy single field still counts as one hire', () => {
    expect(hiredCreatorIds({ selected_creator: 'x' })).toEqual(['x']);
    expect(hiredCreatorIds({ selected_creators: [], selected_creator: 'x' })).toEqual(['x']);
    expect(hiredCreatorIds({})).toEqual([]);
  });

  test('only live briefs with a free slot list bids, as on the website', () => {
    expect(isOpenForBids(campaign)).toBe(true);
    expect(isOpenForBids({ ...campaign, creators_wanted: 1 })).toBe(false);
    expect(isOpenForBids({ ...campaign, status: 'in_progress' })).toBe(false);
  });
});

describe('bid tabs, sort and delivery', () => {
  const open = { creator_id: 'a', proposal: 'I can do it', amount: 3000, estimated_delivery_days: 5 };
  const silent = { creator_id: 'b', proposal: '  ', amount: 1000 };

  test('tab membership mirrors the website', () => {
    expect(bidInTab('all', open, 'open', false)).toBe(true);
    expect(bidInTab('all', open, 'hired', false)).toBe(false);
    expect(bidInTab('responded', open, 'open', false)).toBe(true);
    expect(bidInTab('responded', silent, 'open', false)).toBe(false);
    expect(bidInTab('shortlisted', open, 'open', true)).toBe(true);
    expect(bidInTab('shortlisted', open, 'open', false)).toBe(false);
    expect(bidInTab('accepted', open, 'hired', false)).toBe(true);
    expect(bidInTab('declined', open, 'declined', false)).toBe(true);
  });

  test('delivery days are read from estimated_delivery_days', () => {
    expect(bidDays({ estimated_delivery_days: 7 })).toBe(7);
    expect(bidDays({ delivery_days: 4 })).toBe(4);
    expect(bidDays({})).toBeNull();
  });

  test('sorting puts bids without the value last', () => {
    const bids = [{ amount: 500, estimated_delivery_days: 9 }, { amount: 100 }, { amount: 900, estimated_delivery_days: 2 }];
    expect(sortBids(bids, 'price-low').map(b => b.amount)).toEqual([100, 500, 900]);
    expect(sortBids(bids, 'price-high').map(b => b.amount)).toEqual([900, 500, 100]);
    expect(sortBids(bids, 'delivery-fast').map(b => b.amount)).toEqual([900, 500, 100]);
    expect(sortBids(bids, 'match')).toBe(bids);
  });

  test('hire message states the escrow amount and the slots left', () => {
    expect(hireMessage({ amount: 2500, slots_left: 2 }, 'Arushi')).toBe(
      'Arushi hired! Rs. 2,500 held in escrow. 2 slots still open.',
    );
    expect(hireMessage({ amount: 2500, slots_left: 0, fully_staffed: true }, 'Arushi')).toContain('fully staffed');
    expect(hireMessage(undefined, 'Arushi')).toBe('Arushi hired! Payment held in escrow.');
  });

  test('an unfunded hire is only flagged by funded === false and names the amount', () => {
    expect(hireUnfunded({ funded: false })).toBe(true);
    expect(hireUnfunded({ funded: true })).toBe(false);
    expect(hireUnfunded({})).toBe(false);
    expect(hireUnfunded(undefined)).toBe(false);
    expect(hireUnfundedMessage({ funded: false, amount_charged: 3300 }, 'Arushi')).toBe(
      'Arushi is hired, but your wallet is short. Add Rs. 3,300 to fund the escrow so work can start.',
    );
    expect(hireUnfundedMessage({ funded: false }, 'Arushi')).toContain('Add funds to fund');
  });
});

describe('revision counters and fee notice never use a built-in price', () => {
  test('both payload spellings are read', () => {
    expect(revisionCounters({ revision_count_used: 1, free_revision_limit: 2, free_revisions_remaining: 1, paid_revision_fee: 700 })).toMatchObject({
      used: 1, freeLimit: 2, freeLeft: 1, paidFee: 700,
    });
    expect(revisionCounters({ revisionsUsed: 2, freeRevisionLimit: 2, nextRevisionFee: 500 })).toMatchObject({
      used: 2, freeLeft: 0, nextFee: 500,
    });
  });

  test('no count means no counters', () => {
    expect(revisionCounters({ revisions: [] })).toBeNull();
    expect(revisionNotice(null)).toBeNull();
    // used is known but not the limit: nothing can be claimed about what is free
    expect(revisionNotice(revisionCounters({ revision_count_used: 1 }))).toBeNull();
  });

  test('notice kinds: free, last free, paid', () => {
    const base = { free_revision_limit: 3, paid_revision_fee: 450 };
    expect(revisionNotice(revisionCounters({ ...base, revision_count_used: 0 }))!.kind).toBe('free');
    const last = revisionNotice(revisionCounters({ ...base, revision_count_used: 2 }))!;
    expect(last.kind).toBe('last');
    expect(last.title).toContain('third');
    expect(last.body).toContain('₹450');
    const paid = revisionNotice(revisionCounters({ ...base, revision_count_used: 3, next_revision_fee: 450 }))!;
    expect(paid.kind).toBe('paid');
    expect(paid.body).toContain('costs ₹450');
  });

  test('a missing fee is not guessed', () => {
    const paid = revisionNotice(revisionCounters({ revision_count_used: 2, free_revision_limit: 2 }))!;
    expect(paid.body).not.toMatch(/\d{3}/);
  });

  test('wallet debit wording', () => {
    expect(revisionSentMessage({ paid: true, fee_charged: 500, new_balance: 1250.4 })).toBe(
      'Revision requested - ₹500 charged. Wallet balance: ₹1,250.',
    );
    expect(revisionSentMessage({ paid: false })).toContain('Revision requested');
  });
});

describe('revision payload', () => {
  const comments = [{ description: 'Brighter intro', timestamp_seconds: 4 }];

  test('items keep the pinned timestamp and the deadline', () => {
    const body = buildRevisionPayload(comments, '', '2026-10-22T00:00:00.000Z');
    expect(body.items).toEqual([{ description: 'Brighter intro', severity: 'must-fix', timestamp_seconds: 4 }]);
    expect(body.notes).toBe('');
    expect(body.deadline_at).toBe('2026-10-22T00:00:00.000Z');
  });

  test('a note also travels as the last item, because the creator only sees items', () => {
    const body = buildRevisionPayload(comments, '  Keep it short  ', 'x');
    expect(body.items).toHaveLength(2);
    expect(body.items[1]).toEqual({ description: 'Note: Keep it short', severity: 'preference' });
    expect(body.notes).toBe('Keep it short');
    expect(revisionItemCount(1, 'Keep it short')).toBe(2);
    expect(revisionItemCount(1, '   ')).toBe(1);
  });

  test('contact details are caught on the client', () => {
    expect(findContactInfo('mail me at a.b@example.com')).toBe('email');
    expect(findContactInfo('call +91 98765 43210')).toBe('phone');
    expect(findContactInfo('re-shoot at 0:04, 12 seconds')).toBeNull();
  });

  test('change list is parsed from the stored lines and de-duplicated', () => {
    expect(parseRevisionItem('[must-fix @ 0:04] Re-shoot the intro (ref: hook)')).toEqual({
      severity: 'must-fix @ 0:04', text: 'Re-shoot the intro', ref: 'hook',
    });
    const list = revisionChanges({ latest_feedback: '[must-fix] A\n[must-fix] A\n[preference] Note: B' });
    expect(list.map(i => i.text)).toEqual(['A', 'Note: B']);
  });
});

describe('approve wording', () => {
  test('partial approval does not claim payment was released', () => {
    expect(approveConfirm({}, 'Arushi').body).toContain('once every deliverable');
    expect(approveMessage({ payout_status: 'awaiting_remaining_deliverables', message: 'Deliverable approved (1/3).' }, {})).toBe('Deliverable approved (1/3).');
    expect(approveMessage({ payout_status: 'awaiting_edited' }, {})).toContain('edited video next');
    expect(approveMessage({ payout_status: 'released' }, {})).toContain('payment released');
  });

  test('raw approvals', () => {
    expect(approveLabel({ stage: 'raw', edit_mode: 'ugc' })).toBe('Approve raw - UGC.ad edits next');
    expect(approveLabel({ stage: 'raw', edit_mode: 'creator' })).toBe('Approve raw - creator edits next');
    expect(approveLabel({})).toBe('Approve');
    expect(approveMessage({}, { stage: 'raw', edit_mode: 'ugc' })).toContain('UGC.ad is editing');
  });

  test('rating is only offered when the creator was paid, never after a raw approval', () => {
    expect(canReviewAfterApprove({ payout_status: 'released' }, {})).toBe(true);
    expect(canReviewAfterApprove({ payout_status: 'released' }, { stage: 'raw' })).toBe(false);
    expect(canReviewAfterApprove({ payout_status: 'awaiting_edited' }, {})).toBe(false);
  });

  test('status of a raw approved video the creator still has to edit', () => {
    const campaign = { deliverable_items: [{ edited_required: true, edited_by: 'creator' }] };
    expect(editModeOf(campaign)).toBe('creator');
    expect(workStatusOf({ status: 'approved', stage: 'raw' }, campaign)).toBe('awaiting_edited');
    expect(workStatusOf({ status: 'approved', stage: 'edited' }, campaign)).toBe('approved');
    expect(workStatusOf({ status: 'awaiting_edit' }, campaign)).toBe('awaiting_edit');
  });
});

describe('list helpers', () => {
  test('pagination numbers', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(rows, 1, 10)).toMatchObject({ total: 25, pageCount: 3, page: 1, from: 1, to: 10 });
    expect(paginate(rows, 3, 10)).toMatchObject({ from: 21, to: 25 });
    expect(paginate(rows, 9, 10).page).toBe(3);
    expect(paginate([], 1, 10)).toMatchObject({ total: 0, from: 0, to: 0, pageCount: 1 });
  });

  test('file type comes from the real file', () => {
    expect(fileExt('https://cdn.example.com/v/final.mov?x=1')).toBe('MOV');
    expect(fileExt('https://cdn.example.com/v/noext')).toBe('');
    expect(fileExt(undefined)).toBe('');
  });
});

describe('progress follows the creator\'s own deal', () => {
  test('state names with an em dash still match', () => {
    expect(dealStateIndex('Shipped — In Transit')).toBe(1);
    expect(dealStateIndex('Raw Approved - UGC.ad Editing')).toBe(4);
  });

  test('current step', () => {
    expect(dealProgressStep({ current_state: 'Accepted - Awaiting Shipment' })).toBe(1);
    expect(dealProgressStep({ current_state: 'Received - Content in Progress' })).toBe(3);
    expect(dealProgressStep({ current_state: 'Content Submitted - Awaiting Review' })).toBe(4);
    expect(dealProgressStep({ current_state: 'Paid - Complete' })).toBe(6);
    expect(dealProgressStep(null)).toBeNull();
  });

  test('a deal is found per campaign and creator', () => {
    const deals = [
      { campaign: { id: 'c1' }, creator: { id: 'u1' }, deal_id: 'd1' },
      { campaign: { id: 'c1' }, creator: { id: 'u2' }, deal_id: 'd2' },
    ];
    expect(findCreatorDeal(deals, 'c1', 'u2')!.deal_id).toBe('d2');
    expect(findCreatorDeal(deals, 'c9', 'u2')).toBeNull();
    expect(findCreatorDeal(deals, 'c1', null)).toBeNull();
  });
});
