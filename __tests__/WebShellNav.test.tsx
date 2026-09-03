/**
 * @format
 * Navigation contract for the native shell:
 *  - the header's Messages action opens the native conversation list;
 *  - Back from Messages returns to wherever it was opened from, not a
 *    hardcoded home path;
 *  - the deal detail's Chat button opens that deal's brand thread.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import WebShell from '../src/screens/WebShell';

const session: any = {
  user_id: 'c1',
  token: 't',
  role: 'creator',
  profile_completed: true,
};

beforeEach(() => {
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  );
});

/** Finds the first pressable carrying an accessibilityLabel. */
const findByLabel = (tree: any, label: string) =>
  tree.root
    .findAll(
      (n: any) =>
        n.props?.accessibilityLabel === label &&
        typeof n.props?.onPress === 'function',
      { deep: true },
    )[0];

const texts = (tree: any) => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (typeof n === 'string') { out.push(n); return; }
    if (!n || typeof n !== 'object') return;
    (n.children || []).forEach(walk);
  };
  walk(tree.toJSON());
  return out.join('|');
};

test('Messages opens the native conversation list, and Back returns to origin', async () => {
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(
      <WebShell
        token="t"
        session={session}
        onLogout={() => {}}
        initialPath="/my-active-work"
      />,
    );
  });

  // Start on Active Work.
  expect(texts(t)).toContain('Active Work');

  // Tap the header's Messages action.
  const msg = findByLabel(t, 'Messages');
  expect(msg).toBeTruthy();
  await ReactTestRenderer.act(async () => { msg.props.onPress(); });

  // The native Messages screen should be showing, not the WebView.
  expect(texts(t)).toContain('Messages');

  // Back should return to Active Work — where we came from.
  const back = findByLabel(t, 'Go back');
  expect(back).toBeTruthy();
  await ReactTestRenderer.act(async () => { back.props.onPress(); });
  expect(texts(t)).toContain('Active Work');
});

test('brand: Messages opens natively from the Creators tab', async () => {
  const brand: any = {
    user_id: 'b1',
    token: 't',
    role: 'business',
    profile_completed: true,
  };
  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(
      <WebShell
        token="t"
        session={brand}
        onLogout={() => {}}
        initialPath="/dashboard/business/browse-creator"
      />,
    );
  });
  const msg = findByLabel(t, 'Messages');
  expect(msg).toBeTruthy();
  await ReactTestRenderer.act(async () => { msg.props.onPress(); });
  // The native list has the conversation search field; the WebView has
  // nothing. (The old "New message" action was removed — it navigated to the
  // screen already showing.)
  const search = t.root.findAll(
    (n: any) => n.props?.placeholder === 'Search messages...',
    { deep: true },
  );
  expect(search.length).toBeGreaterThan(0);
});

test('deal detail Chat opens that brand thread, not the inbox', async () => {
  const deal = {
    deal_id: 'd1',
    id: 'd1',
    current_state: 'In Progress',
    brand: { id: 'brand-9', name: 'Levis' },
    campaign: { id: 'c1', title: 'Summer' },
  };
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([deal]) }),
  );

  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(
      <WebShell
        token="t"
        session={session}
        onLogout={() => {}}
        initialPath="/my-active-work"
      />,
    );
  });

  // Open the deal from the work card.
  const open = findByLabel(t, 'View deal details');
  expect(open).toBeTruthy();
  await ReactTestRenderer.act(async () => { open.props.onPress(); });

  // Tap the detail header's chat action (labelled "Messages").
  const chat = findByLabel(t, 'Messages');
  expect(chat).toBeTruthy();
  await ReactTestRenderer.act(async () => { chat.props.onPress(); });

  // Must land on the chat thread itself — its composer's Send button is
  // unique to that screen — and on THIS brand's conversation.
  expect(findByLabel(t, 'Send message')).toBeTruthy();
  expect(texts(t)).toContain('Levis');
});

test('brand campaign detail Chat opens that creator thread', async () => {
  const brand: any = {
    user_id: 'b1',
    token: 't',
    role: 'business',
    profile_completed: true,
  };
  const campaign = {
    id: 'c1',
    title: 'Summer Launch',
    status: 'in_progress',
    selected_creator: 'creator-7',
    selected_creator_name: 'Arushi',
  };
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(campaign) }),
  );

  let t: any;
  await ReactTestRenderer.act(() => {
    t = ReactTestRenderer.create(
      <WebShell
        token="t"
        session={brand}
        onLogout={() => {}}
        initialPath="/campaigns/c1"
      />,
    );
  });

  // The Chat button carries no label, so find the pressable whose rendered
  // text is "Chat".
  const chat = t.root.findAll(
    (n: any) =>
      n.props?.accessibilityRole === 'button' &&
      typeof n.props?.onPress === 'function' &&
      n.findAllByType(Text as any, { deep: true }).some((tx: any) =>
        String(tx.props?.children) === 'Chat',
      ),
    { deep: true },
  )[0];
  expect(chat).toBeTruthy();
  await ReactTestRenderer.act(async () => { chat.props.onPress(); });

  // Lands on the creator's own thread, not the generic inbox.
  expect(findByLabel(t, 'Send message')).toBeTruthy();
  expect(texts(t)).toContain('Arushi');
});
