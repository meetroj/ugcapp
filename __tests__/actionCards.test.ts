/**
 * @format
 * Guards the action-card rules.
 *
 * The Node backend validates only the card TYPE and the sender's role — it does
 * not check that required fields are present or that an escalation summary is
 * long enough. So these rules are the only thing stopping a half-filled card
 * from reaching the other side with blank terms, and they are worth locking in.
 */
import {
  ACTION_CARD_FIELDS,
  ACTION_CARD_REQUIRED,
  actionCardsOnly,
  attachmentKind,
  attachmentProblem,
  availableCards,
  buildCardFields,
  canReviewFromChat,
  cardDealPath,
  chatPeerName,
  conversationPreview,
  counterPrefill,
  dateInDays,
  displayMessage,
  displayToIso,
  initialForm,
  isImageUrl,
  isoToDisplay,
  maskDate,
  messageAttachments,
  outgoingMessage,
  readLabel,
  validateCard,
} from '../src/actionCards';

test('a brand and a creator get different cards', () => {
  const brand = availableCards('business', null);
  const creator = availableCards('creator', null);

  // Brands invite; creators pitch. Neither should see the other's opener.
  expect(brand).toContain('private_invitation');
  expect(creator).not.toContain('private_invitation');
  expect(creator).toContain('custom_offer');

  // Creators resolve with the brand first and only escalate — they cannot
  // open a dispute directly.
  expect(creator).not.toContain('raise_dispute');
  expect(brand).toContain('raise_dispute');
});

test('an unknown role gets no cards rather than everything', () => {
  expect(availableCards(undefined, null)).toEqual([]);
  expect(availableCards('admin', null)).toEqual([]);
});

test('revision request only appears while work is under review', () => {
  // The backend answers 409 outside these states, so the button must be hidden
  // rather than offered and then rejected.
  expect(availableCards('business', null)).not.toContain('revision_request');
  expect(availableCards('business', 'Paid - Complete')).not.toContain(
    'revision_request',
  );
  expect(
    availableCards('business', 'Content Submitted - Awaiting Review'),
  ).toContain('revision_request');
  expect(availableCards('business', 'Revision Requested')).toContain(
    'revision_request',
  );
});

test('every card type has a field for each of its required keys', () => {
  // A required key with no input would be unfillable — permanently blocking
  // that card behind a validation error the user cannot clear.
  for (const type of Object.keys(ACTION_CARD_REQUIRED) as Array<
    keyof typeof ACTION_CARD_REQUIRED
  >) {
    const keys = ACTION_CARD_FIELDS[type].map(field => field.key);
    for (const required of ACTION_CARD_REQUIRED[type]) {
      expect(keys).toContain(required);
    }
  }
});

test('a blank required field is named in the error', () => {
  const form = { ...initialForm('private_invitation'), campaign_name: '  ' };
  expect(validateCard('private_invitation', form)).toContain('Campaign name');
});

test('a zero or negative amount is rejected', () => {
  const form = {
    ...initialForm('counter_offer'),
    diff_vs_original: 'Too low',
    timeline: '31-12-2026',
  };
  expect(validateCard('counter_offer', { ...form, modified_price: '0' })).toMatch(
    /greater than zero/,
  );
  expect(
    validateCard('counter_offer', { ...form, modified_price: '-5' }),
  ).toMatch(/greater than zero/);
  expect(validateCard('counter_offer', { ...form, modified_price: '5000' })).toBeNull();
});

test('an escalation summary must be 100-500 characters', () => {
  const short = { ...initialForm('escalate_to_admin'), summary: 'Too short' };
  expect(validateCard('escalate_to_admin', short)).toMatch(/100 to 500/);

  const ok = { ...initialForm('escalate_to_admin'), summary: 'x'.repeat(120) };
  expect(validateCard('escalate_to_admin', ok)).toBeNull();

  const long = { ...initialForm('escalate_to_admin'), summary: 'x'.repeat(501) };
  expect(validateCard('escalate_to_admin', long)).toMatch(/100 to 500/);
});

test('optional fields do not block sending', () => {
  // milestone_update requires `status` only; `notes` is deliberately optional
  // and its default is empty, so the seeded form must already be valid.
  expect(validateCard('milestone_update', initialForm('milestone_update'))).toBeNull();
});

/* ---- counter offer: delivery date, deal link, payload shape ---- */

test('a counter offer needs a real delivery date, typed DD-MM-YYYY', () => {
  const base = {
    ...initialForm('counter_offer'),
    diff_vs_original: 'Budget is low for 3 videos',
  };
  expect(validateCard('counter_offer', base)).toMatch(/Delivery date/);
  expect(validateCard('counter_offer', { ...base, timeline: '31-02-2026' })).toMatch(
    /real date/,
  );
  expect(validateCard('counter_offer', { ...base, timeline: '31-12-2026' })).toBeNull();
});

test('date helpers mask, convert and reject impossible days', () => {
  expect(maskDate('31122026')).toBe('31-12-2026');
  expect(maskDate('3112')).toBe('31-12');
  expect(displayToIso('31-12-2026')).toBe('2026-12-31');
  expect(displayToIso('29-02-2025')).toBe('');
  expect(isoToDisplay('2026-12-31')).toBe('31-12-2026');
  expect(isoToDisplay('7 days')).toBe('');
  expect(dateInDays(7, new Date(2026, 0, 28))).toBe('04-02-2026');
});

test('revision request is sent as revision_items, not revision_text', () => {
  // The backend rejects a revision card without 1-5 revision_items (400).
  expect(
    buildCardFields('revision_request', { revision_text: '  Fix the audio  ' }),
  ).toEqual({
    revision_items: [{ description: 'Fix the audio', severity: 'medium' }],
  });
});

test('card payload: numbers are numbers, date is ISO, select is a slug', () => {
  const counter = buildCardFields('counter_offer', {
    modified_price: '4500',
    revisions: '2',
    timeline: '31-12-2026',
    usage_rights: 'Organic social',
    diff_vs_original: 'Lower scope',
  });
  expect(counter.modified_price).toBe(4500);
  expect(counter.timeline).toBe('2026-12-31');
  expect(counter.revisions).toBe('2');

  expect(
    buildCardFields('milestone_update', { status: 'Ready to submit', notes: '' }).status,
  ).toBe('ready_to_submit');
  expect(
    buildCardFields('damage_report', { reason: 'x', description: 'y', severity: 'high' })
      .severity,
  ).toBe('high');
  // An empty price stays empty rather than becoming a 0 that passes "is it set".
  expect(buildCardFields('custom_offer', { price: '', quantity: '2' }).price).toBe('');
});

test('countering pre-fills from the offer and keeps only a real date', () => {
  expect(
    counterPrefill({
      fields: { price: 8000, revisions: 2, timeline: '2026-11-05', usage_rights: 'Paid ads' },
    }),
  ).toEqual({
    modified_price: '8000',
    revisions: '2',
    timeline: '05-11-2026',
    usage_rights: 'Paid ads',
    diff_vs_original: '',
  });
  expect(counterPrefill({ fields: { timeline: '7 days' } }).timeline).toBe('');
  expect(counterPrefill({ fields: { budget: 300 } }).modified_price).toBe('300');
});

/* ---- attachments ---- */

test('a file-only message is stored with a prefix and read back as files', () => {
  const body = outgoingMessage('  ', ['/u/a.png', '/u/b.pdf']);
  expect(body).toBe('__UGCAD_ATTACHMENT__:/u/a.png|/u/b.pdf');
  expect(messageAttachments({ message: body })).toEqual(['/u/a.png', '/u/b.pdf']);
  expect(displayMessage({ message: body })).toBe('');
  expect(outgoingMessage('hello', ['/u/a.png'])).toBe('hello');
  expect(messageAttachments({ message: 'hi', attachment_urls: ['/u/c.jpg'] })).toEqual([
    '/u/c.jpg',
  ]);
});

test('attachments follow the website limits', () => {
  const MB = 1024 * 1024;
  const img = { fileName: 'a.jpg', type: 'image/jpeg', fileSize: 1 * MB };
  expect(attachmentProblem(img, 0)).toBe('');
  expect(attachmentProblem(img, 5)).toBe('A message can include at most 5 attachments.');
  expect(attachmentProblem({ ...img, fileSize: 11 * MB }, 0)).toBe(
    'Images must be 10 MB or smaller.',
  );
  expect(
    attachmentProblem({ fileName: 'a.pdf', type: 'application/pdf', fileSize: 26 * MB }, 0),
  ).toBe('PDFs must be 25 MB or smaller.');
  expect(
    attachmentProblem({ fileName: 'a.pdf', type: 'application/pdf', fileSize: 25 * MB }, 4),
  ).toBe('');
  expect(
    attachmentProblem({ fileName: 'v.mp4', type: 'video/mp4', fileSize: 101 * MB }, 0),
  ).toBe('Videos must be 100 MB or smaller.');
  expect(attachmentProblem({ fileName: 'a.webp', type: 'image/webp' }, 0)).toBe(
    'Upload jpg, png, gif, pdf, or video files only.',
  );
  // The Android picker sometimes omits the MIME type: the name decides.
  expect(attachmentKind('clip.MOV')).toBe('video');
  expect(attachmentKind('/u/doc.pdf?x=1')).toBe('pdf');
  // Old uploads without any extension were always shown as pictures.
  expect(isImageUrl('/uploads/abc123')).toBe(true);
  expect(isImageUrl('/uploads/brief.pdf')).toBe(false);
});

test('the list says "File attachment" instead of the packed text', () => {
  expect(
    conversationPreview({ last_item_snippet: '__UGCAD_ATTACHMENT__:/u/a.png' }),
  ).toBe('File attachment');
  expect(
    conversationPreview({ last_item_snippet: '', last_message: { attachment_urls: ['/u/a.png'] } }),
  ).toBe('File attachment');
  expect(conversationPreview({ last_item_snippet: 'Hello there' })).toBe('Hello there');
  expect(
    conversationPreview({
      last_item_snippet: 'custom_offer',
      last_message: { item_type: 'action_card', type: 'custom_offer' },
    }),
  ).toBe('Custom Offer');
});

/* ---- thread rules ---- */

test('action-cards-only mode lasts until the strike window ends', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  expect(actionCardsOnly({ action_cards_only_until: '2026-10-20T12:00:00Z' }, now)).toBe(true);
  expect(actionCardsOnly({ action_cards_only_until: '2026-10-20T09:00:00Z' }, now)).toBe(false);
  expect(actionCardsOnly({}, now)).toBe(false);
  expect(actionCardsOnly(null, now)).toBe(false);
});

test('read receipts show only under our own messages', () => {
  const mine = { sender_id: 'me', status: 'delivered', read_by: ['me'] };
  expect(readLabel(mine, 'me', 'them')).toBe('Delivered');
  expect(readLabel({ ...mine, status: 'read' }, 'me', 'them')).toBe('Read');
  expect(readLabel({ ...mine, read_by: ['me', 'them'] }, 'me', 'them')).toBe('Read');
  expect(readLabel({ ...mine, sender_id: 'them' }, 'me', 'them')).toBe('');
  expect(readLabel({ ...mine, item_type: 'action_card' }, 'me', 'them')).toBe('');
});

test('a brand sees a creator by first name; a creator sees the business name', () => {
  const creator = { role: 'creator', full_name: 'Asha Verma', nickname: '@LuckyTiger7' };
  const brand = { role: 'business', business_name: 'Levis', full_name: 'Raj Contact' };
  expect(chatPeerName(creator, 'business')).toBe('Asha');
  expect(chatPeerName({ ...creator, first_name: 'Ash' }, 'business')).toBe('Ash');
  expect(chatPeerName({ role: 'creator', nickname: '@LuckyTiger7' }, 'business')).toBe(
    'LuckyTiger7',
  );
  expect(chatPeerName(brand, 'creator')).toBe('Levis');
  expect(chatPeerName(null, 'creator')).toBe('Unknown user');
});

test('Open the deal goes to the right screen for each role', () => {
  // Creator: the deal room, which takes a campaign id or a DEAL- code.
  expect(cardDealPath('creator', { deal_id: 'DEAL-1234' })).toBe('/my-deals/DEAL-1234');
  expect(cardDealPath('creator', { campaign_id: 'c-1' })).toBe('/my-deals/c-1');
  expect(cardDealPath('creator', {}, 'c-9')).toBe('/my-deals/c-9');
  expect(cardDealPath('creator', {})).toBeNull();
  // Brand: the campaign screen needs a campaign id, never a DEAL- code.
  expect(cardDealPath('business', { deal_id: 'c-2' })).toBe('/campaigns/c-2');
  expect(cardDealPath('business', { deal_id: 'DEAL-1234' }, 'c-3')).toBe('/campaigns/c-3');
  expect(cardDealPath('business', { deal_id: 'DEAL-1234' })).toBeNull();
  expect(cardDealPath('business', {})).toBeNull();
});

test('a creator can review the brand only after a completed deal', () => {
  const row = { role: 'business', associated_deal_status: 'completed', associated_campaign_id: 'c-1' };
  expect(canReviewFromChat('creator', row)).toBe(true);
  expect(canReviewFromChat('business', row)).toBe(false);
  expect(canReviewFromChat('creator', { ...row, associated_deal_status: 'in_progress' })).toBe(false);
  expect(canReviewFromChat('creator', { ...row, associated_campaign_id: null })).toBe(false);
  expect(canReviewFromChat('creator', { ...row, role: 'creator' })).toBe(false);
});
