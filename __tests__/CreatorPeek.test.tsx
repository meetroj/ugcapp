/**
 * @format
 * The creator peek is a centred dialog, not a bottom sheet, and it must lead
 * with a playable clip — the two things this change is about.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import BrandCreators from '../src/screens/BrandCreators';

const CREATOR = {
  id: 'c1',
  name: 'Deshna',
  full_name: 'Deshna',
  primary_category: 'Fashion',
  price_per_video: 2000,
  // Four clips: one more than the section shows, so the cap is exercised.
  portfolio: [
    'https://cdn.example.com/reel.mp4',
    'https://cdn.example.com/b.mp4',
    'https://cdn.example.com/c.mp4',
    'https://cdn.example.com/d.mp4',
  ],
};

beforeEach(() => {
  // The rows drift on a 16ms setInterval; real timers make this suite hang.
  jest.useFakeTimers();
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [CREATOR],
  })) as never;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function open() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <BrandCreators token="t" onNavigate={() => {}} />,
    );
  });
  // Tap the first creator tile to raise the peek.
  const tile = tree.root
    .findAll(
      n => typeof n.type !== 'string' && n.props.accessibilityRole === 'button',
      { deep: true },
    )
    .find(n => String(n.props.accessibilityLabel || '').startsWith('Deshna'));
  await ReactTestRenderer.act(async () => {
    tile?.props.onPress();
  });
  return tree;
}

test('the peek is centred rather than pinned to the bottom', async () => {
  const tree = await open();
  // Walk styles rather than JSON.stringify: WebView props hold React elements,
  // which are circular and blow up the serialiser.
  const flat = tree.root
    .findAll(n => !!n.props?.style, { deep: true })
    .map(n => StyleSheet.flatten(n.props.style) || {});

  // A bottom sheet is bottom:0 with only its top corners rounded; the dialog
  // centres its child and is rounded on all four.
  expect(flat.some(st => st.justifyContent === 'center' && st.alignItems === 'center')).toBe(true);
  // The dialog card itself: a uniform borderRadius and a maxWidth cap. The
  // screen behind it has its own top-rounded sheet, so match on the card.
  const card = flat.find(st => st.maxWidth !== undefined && st.borderRadius !== undefined);
  expect(card).toBeTruthy();
  expect(card.borderTopLeftRadius).toBeUndefined();
});

test('the peek leads with a playable clip', async () => {
  const tree = await open();
  const webviews = tree.root.findAll(
    n => typeof n.type !== 'string' && !!n.props?.source?.html,
    { deep: true },
  );
  expect(webviews.length).toBeGreaterThan(0);
  const hero = webviews[0].props.source;
  // Without baseUrl Android refuses the remote <video> and renders a black box.
  expect(hero.baseUrl).toBe('https://cdn.example.com');
  expect(hero.html).toContain('reel.mp4');
});


test('Recent work shows at most three clips', async () => {
  const tree = await open();
  const players = tree.root.findAll(
    n => typeof n.type !== 'string' && !!n.props?.source?.html,
    { deep: true },
  );
  // The fixture supplies four; the section is capped at three.
  expect(players).toHaveLength(3);
});

test('the stat rows carry no line between them', async () => {
  const tree = await open();
  const flat = tree.root
    .findAll(n => !!n.props?.style, { deep: true })
    .map(n => StyleSheet.flatten(n.props.style) || {});
  // The group is ruled top and bottom only — no 1px divider views inside it.
  const group = flat.find(
    st => st.borderTopWidth === 1 && st.borderBottomWidth === 1,
  );
  expect(group).toBeTruthy();
  expect(
    flat.some(st => st.height === 1 && st.backgroundColor === '#F0F1F8'),
  ).toBe(false);
});
