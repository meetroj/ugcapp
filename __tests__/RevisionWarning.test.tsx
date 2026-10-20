/**
 * The revision composer must tell the brand, BEFORE they send the last free revision, that
 * the next one is paid - using the backend's real per-deal count, free limit and price, not
 * the length of the latest submission's own list (which restarts at 0 on every resubmission)
 * and never a hard-coded amount.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import WorkRevisionRequest from '../src/screens/WorkRevisionRequest';
import { Alert } from '../src/components/AppAlert';
import { getCampaignWork, requestWorkRevision } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  requestWorkRevision: jest.fn(),
  getCampaignWork: jest.fn(),
}));

let tree: any;
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

async function open(work: Record<string, unknown>) {
  await act(async () => {
    tree = Renderer.create(
      <WorkRevisionRequest token="t" work={{ id: 'w1', ...work }} onClose={() => {}} onDone={() => {}} />,
    );
  });
  return content(tree.toJSON());
}

test('last free revision: a pop-up says what comes next, with the real price and ordinal', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const text = await open({ revision_count_used: 1, free_revision_limit: 2, paid_revision_fee: 700, revisions: [] });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatch(/second revision/i);
  expect(String(spy.mock.calls[0][1])).toContain('₹700');
  expect(text).toContain('₹700');
});

test('the free limit is the server\'s, not a built-in 2', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revision_count_used: 2, free_revision_limit: 3, paid_revision_fee: 400, revisions: [] });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatch(/third revision/i);
  expect(String(spy.mock.calls[0][1])).toContain('₹400');
});

test('the work-review list field names are understood too', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revisionsUsed: 1, freeRevisionLimit: 2, paidRevisionFee: 500, revisions: [] });
  expect(spy).toHaveBeenCalledTimes(1);
});

test('uses the deal count, not the latest submission: a resubmitted doc has no revisions of its own', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const text = await open({
    revision_count_used: 2, free_revision_limit: 2, next_revision_fee: 650, paid_revision_fee: 650, revisions: [],
  });
  expect(spy).not.toHaveBeenCalled();                 // already past the free ones
  expect(text).toContain('This is a paid revision');
  expect(text).toContain('costs ₹650');
});

test('with no fee in the payload no amount is invented', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const text = await open({ revision_count_used: 2, free_revision_limit: 2, revisions: [] });
  expect(text).toContain('This is a paid revision');
  expect(text).not.toContain('₹');
  expect(text).not.toContain('500');
});

test('the first revision gets no pop-up', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revision_count_used: 0, free_revision_limit: 2, revisions: [] });
  expect(spy).not.toHaveBeenCalled();
});

test('a row without counters reads them from the submission itself', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (getCampaignWork as jest.Mock).mockResolvedValue([
    { id: 'w1', revision_count_used: 1, free_revision_limit: 2, free_revisions_remaining: 1, paid_revision_fee: 800 },
  ]);
  await open({ campaign_id: 'c1', creator_id: 'u1' });
  expect(getCampaignWork).toHaveBeenCalledWith('t', 'c1', 'u1');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(String(spy.mock.calls[0][1])).toContain('₹800');
});

test('sending: the note reaches the creator as the last item and a wallet charge is announced', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (requestWorkRevision as jest.Mock).mockResolvedValue({ paid: true, fee_charged: 500, new_balance: 1250 });
  const onDone = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <WorkRevisionRequest
        token="t"
        work={{ id: 'w1', revision_count_used: 2, free_revision_limit: 2, next_revision_fee: 500 }}
        onClose={() => {}}
        onDone={onDone}
      />,
    );
  });
  const { TextInput, TouchableOpacity } = require('react-native');
  const inputs = tree.root.findAllByType(TextInput);
  await act(async () => { inputs[0].props.onChangeText('Brighter intro'); });
  const add = tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Add comment');
  await act(async () => { add.props.onPress(); });
  const noteBtn = tree.root.findAllByType(TouchableOpacity).find((n: any) => content(n).includes('Add a note'));
  await act(async () => { noteBtn.props.onPress(); });
  const noteInput = tree.root.findAllByType(TextInput).find((n: any) => /Anything else/.test(n.props.placeholder));
  await act(async () => { noteInput.props.onChangeText('Keep it under 20 seconds'); });
  const send = tree.root.findAllByType(TouchableOpacity).find((n: any) => content(n) === 'Send Changes');
  await act(async () => { await send.props.onPress(); });

  const [, id, body] = (requestWorkRevision as jest.Mock).mock.calls[0];
  expect(id).toBe('w1');
  expect(body.items).toHaveLength(2);
  expect(body.items[0]).toMatchObject({ description: 'Brighter intro', severity: 'must-fix', timestamp_seconds: 0 });
  expect(body.items[1]).toMatchObject({ description: 'Note: Keep it under 20 seconds' });
  expect(body.notes).toBe('Keep it under 20 seconds');
  expect(typeof body.deadline_at).toBe('string');
  const sent = spy.mock.calls.find(call => call[0] === 'Revision sent')!;
  expect(String(sent[1])).toContain('₹500 charged');
  expect(String(sent[1])).toContain('₹1,250');
  expect(onDone).toHaveBeenCalled();
});

test('a phone number blocks sending before any request is made', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revision_count_used: 0, free_revision_limit: 2 });
  const { TextInput, TouchableOpacity } = require('react-native');
  await act(async () => { tree.root.findAllByType(TextInput)[0].props.onChangeText('Call me on 98765 43210'); });
  expect(content(tree.toJSON())).toContain('remove phone numbers and email addresses');
  const add = tree.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Add comment');
  await act(async () => { add.props.onPress(); });
  const send = tree.root.findAllByType(TouchableOpacity).find((n: any) => content(n) === 'Send Changes');
  await act(async () => { await send.props.onPress(); });
  expect(requestWorkRevision).not.toHaveBeenCalled();
  expect(spy).not.toHaveBeenCalledWith('Revision sent', expect.anything());
});
