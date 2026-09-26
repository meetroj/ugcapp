/**
 * @format
 *
 * Locks the request SHAPES the backend actually accepts.
 *
 * Every bug these cover was written from a correct reading of the website's
 * call and the backend's handler, and every one of them still sent something
 * the server rejected with a 422 — or, in one case, called a route that does
 * not exist. Reading both sides is not enough; the body has to be asserted.
 *
 * Contracts verified against a live backend on 26 Sep 2026 (isolated
 * qa_audit_db). If one of these fails, the endpoint moved — check the
 * matching Pydantic model in Backend/server.py before changing the test.
 */

// Marks the file as a module so these top-level names are file-scoped;
// api.test.ts declares `g` and `realFetch` too, and two scripts sharing the
// TS project would collide on them.
export {};

const g = globalThis as unknown as {fetch: typeof fetch};
const realFetch = g.fetch;

type Sent = {url: string; init: RequestInit};

/** Captures the single request the call under test makes. */
function capture(response: unknown = {}): {sent: Sent[]} {
  const sent: Sent[] = [];
  g.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({url: String(url), init: init || {}});
    return {
      ok: true,
      status: 200,
      json: async () => response,
    };
  }) as unknown as typeof fetch;
  return {sent};
}

const bodyOf = (s: Sent) => JSON.parse(String(s.init.body || '{}'));

afterEach(() => {
  g.fetch = realFetch;
  jest.resetModules();
});

test('resetPassword sends `password`, which is what ResetPasswordRequest declares', async () => {
  const {sent} = capture();
  const {resetPassword} = require('../src/api');

  await resetPassword('someone@example.com', '123456', 'NewPass123');

  const body = bodyOf(sent[0]);
  expect(sent[0].url).toContain('/api/auth/reset-password');
  expect(body.password).toBe('NewPass123');
  // `new_password` is the change-password route's field name. Sending it here
  // was a 422, so the last step of recovery always failed.
  expect(body.new_password).toBeUndefined();
});

test('changePassword keeps its params in the query string', async () => {
  const {sent} = capture();
  const {changePassword} = require('../src/api');

  await changePassword('tok', 'OldPass1', 'NewPass1');

  expect(sent[0].url).toContain('old_password=OldPass1');
  expect(sent[0].url).toContain('new_password=NewPass1');
});

test('confirmDealReceipt always sends unboxing_video_url', async () => {
  const {sent} = capture();
  const {confirmDealReceipt} = require('../src/api');

  await confirmDealReceipt('tok', 'DEAL-1', 'https://cdn/unboxing.mp4');

  const body = bodyOf(sent[0]);
  // DealReceiptSubmit declares this required — a receipt without the clip is
  // a 422, so the confirm flow has to upload the video first.
  expect(body.unboxing_video_url).toBe('https://cdn/unboxing.mp4');
  expect(body.received_at).toEqual(expect.any(String));
  expect(body.items_damaged).toBe(false);
});

test('updateShipment fills in every field ShipmentUpdate requires', async () => {
  const {sent} = capture();
  const {updateShipment} = require('../src/api');

  await updateShipment('tok', {
    campaign_id: 'C1',
    tracking_number: 'TRK1',
    courier_slip: 'https://cdn/slip.jpg',
    expected_delivery: '2026-11-20',
  });

  const body = bodyOf(sent[0]);
  expect(body.campaign_id).toBe('C1');
  expect(body.tracking_number).toBe('TRK1');
  expect(body.courier_slip).toBe('https://cdn/slip.jpg');
  expect(body.expected_delivery).toBe('2026-11-20');
  // The checklist is required too, and a caller that only has tracking
  // details should not be rejected for omitting it.
  expect(body.shipment_checklist).toEqual({
    package_sealed: true,
    correct_item: true,
    working_condition: true,
  });
});

test('getCampaignBids reads the campaign, because /bids does not exist', async () => {
  const {sent} = capture({id: 'C1', bids: [{id: 'b1'}, {id: 'b2'}]});
  const {getCampaignBids} = require('../src/api');

  const bids = await getCampaignBids('tok', 'C1');

  expect(sent).toHaveLength(1);
  expect(sent[0].url).toContain('/api/campaigns/C1');
  // GET /api/campaigns/{id}/bids answers 404; the bids ride on the campaign.
  expect(sent[0].url).not.toContain('/bids');
  expect(bids).toHaveLength(2);
});

test('the brief payload carries the fields that used to be dropped', async () => {
  const {sent} = capture({id: 'C9'});
  const {createCampaign} = require('../src/api');

  await createCampaign('tok', {
    title: 'T',
    creators_wanted: 4,
    product_type_detail: 'Widget',
    cta_link: 'https://example.com',
    script_provider: 'brand',
    script_text: 'S',
    deliverable_items: [{type: 'Reel', quantity: 1, edited_by: 'ugc'}],
  });

  const body = bodyOf(sent[0]);
  // Each of these was either absent from the app's payload or sent under a
  // name nothing read, so the brand's answer was silently lost on save.
  expect(body.creators_wanted).toBe(4);
  expect(body.product_type_detail).toBe('Widget');
  expect(body.cta_link).toBe('https://example.com');
  expect(body.script_provider).toBe('brand');
  expect(body.deliverable_items[0].edited_by).toBe('ugc');
  // The old, wrong key must not come back.
  expect(body.product_type_other).toBeUndefined();
});

test('sendMessage carries attachment_urls', async () => {
  const {sent} = capture();
  const {sendMessage} = require('../src/api');

  await sendMessage('tok', 'user-2', 'hi', ['https://cdn/a.jpg']);

  const body = bodyOf(sent[0]);
  expect(body.recipient_id).toBe('user-2');
  expect(body.attachment_urls).toEqual(['https://cdn/a.jpg']);
});

test('login appends the authenticator code only when one is supplied', async () => {
  let {sent} = capture({token: 't', user_id: 'u', role: 'creator'});
  const api = require('../src/api');

  await api.login('a@b.com', 'pw');
  expect(sent[0].url).not.toContain('totp_token');

  ({sent} = capture({token: 't', user_id: 'u', role: 'creator'}));
  await api.login('a@b.com', 'pw', '123456');
  expect(sent[0].url).toContain('totp_token=123456');
});

test('a 2FA challenge raises TwoFactorRequired rather than a dead end', async () => {
  g.fetch = (async () => ({
    ok: true,
    status: 200,
    // The server answers the first leg with this and no token.
    json: async () => ({requires_2fa: true}),
  })) as unknown as typeof fetch;

  const {login, TwoFactorRequired} = require('../src/api');

  await expect(login('a@b.com', 'pw')).rejects.toBeInstanceOf(TwoFactorRequired);
});
