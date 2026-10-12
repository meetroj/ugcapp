/**
 * The revision composer must tell the brand, BEFORE they send revision #2, that the next
 * one is paid - using the backend's real per-deal count and price, not the length of the
 * latest submission's own list (which restarts at 0 on every resubmission).
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import WorkRevisionRequest from '../src/screens/WorkRevisionRequest';
import { Alert } from '../src/components/AppAlert';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  requestWorkRevision: jest.fn(),
}));

let tree: any;
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.restoreAllMocks();
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

test('revision 2: a pop-up says it is the last free one and what comes next, with the real price', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const text = await open({ revision_count_used: 1, paid_revision_fee: 700, revisions: [] });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatch(/second revision/i);
  expect(String(spy.mock.calls[0][1])).toContain('₹700');
  expect(text).toContain('₹700');
});

test('the work-review list field names are understood too', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revisionsUsed: 1, paidRevisionFee: 500, revisions: [] });
  expect(spy).toHaveBeenCalledTimes(1);
});

test('uses the deal count, not the latest submission: a resubmitted doc has no revisions of its own', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const text = await open({ revision_count_used: 2, revisions: [] });
  expect(spy).not.toHaveBeenCalled();                 // already past the free ones
  expect(text).toContain('This one costs');
  expect(text).toContain('₹500');
});

test('the first revision gets no pop-up', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open({ revision_count_used: 0, revisions: [] });
  expect(spy).not.toHaveBeenCalled();
});
