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
  availableCards,
  initialForm,
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
  const form = { ...initialForm('counter_offer'), diff_vs_original: 'Too low' };
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
