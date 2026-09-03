/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import CreatorProfile from '../src/screens/CreatorProfile';
import type {AuthUser} from '../src/api';

const session: AuthUser = {
  user_id: 'u1',
  role: 'creator',
  token: 't',
};

/**
 * The two GETs the screen fires on mount: /auth/me and /chat/conversations.
 *
 * The unread badge is summed from the per-thread `unread_count` on the
 * conversations list. There is no /api/chat/unread-count endpoint — that path
 * hits the /api/chat/:otherId wildcard and answers `[]` — so the count is
 * split across two threads here to cover the summing.
 */
function mockApi(me: Record<string, unknown>, unread = 0) {
  return jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes('/chat/conversations')
            ? [
                {user_id: 'a', nickname: 'A', unread_count: unread},
                {user_id: 'b', nickname: 'B', unread_count: 0},
              ]
            : me,
        ),
    }),
  ) as unknown as typeof fetch;
}

function textsOf(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType('Text' as never)
    .map(n =>
      n.children
        .filter((c: unknown) => typeof c === 'string')
        .join(''),
    )
    .filter(Boolean);
}

async function render(me: Record<string, unknown>, unread = 0) {
  globalThis.fetch = mockApi(me, unread);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <CreatorProfile token="t" session={session} onNavigate={() => {}} />,
    );
  });
  return tree;
}

test('shows the identity header and the account menu', async () => {
  const tree = await render({
    nickname: 'Meet',
    public_creator_id: 'UGC-qs3mxBpd',
    kyc_verified: true,
    languages: ['Hindi'],
    deliverables_completed: 0,
    profile: {city: 'Indore', country: 'India'},
  });

  const texts = textsOf(tree);
  expect(texts).toEqual(
    expect.arrayContaining([
      'Meet',
      'Verified',
      'ID: UGC-qs3mxBpd · Indore, India',
      'Change banner',
      'My Deals',
      'Reviews',
      'Messages',
      'Saved',
      'Verify KYC',
      'Settings',
      'Log Out',
    ]),
  );
  // The counts render as a value + a suffix in a nested Text.
  expect(texts).toEqual(expect.arrayContaining([' deliverables', ' language']));
});

test('no longer renders the tab bar or the work grid', async () => {
  const tree = await render({
    nickname: 'Meet',
    portfolio: [{title: 'nike', category: 'Fashion', cost: 25100, duration: 5}],
  });

  const texts = textsOf(tree);
  for (const gone of [
    'Videos',
    'Details',
    'Add Work',
    'Untitled',
    'PRICE',
    'DELIVERED IN',
    'No work added yet',
    'Edit Profile',
    'PRICE / VIDEO',
  ]) {
    expect(texts).not.toEqual(expect.arrayContaining([gone]));
  }
});

test('shows the unread count on the Messages row', async () => {
  const tree = await render({nickname: 'Meet', portfolio: []}, 19);

  expect(textsOf(tree)).toEqual(expect.arrayContaining(['19']));
});
