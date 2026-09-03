/**
 * The Top Creators rail: it advances on its own, and a manual swipe takes
 * priority over the timer instead of fighting it.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {ScrollView, Text} from 'react-native';
import CreatorHome from '../src/screens/CreatorHome';
import type {AuthUser} from '../src/api';
import {scale} from '../src/theme';

// One card of travel: the card width plus the row gap, both scaled the same way
// CreatorHome scales them. Hardcoding 252 would only hold on a 390pt screen.
const STRIDE = scale(238) + scale(14);

const SESSION: AuthUser = {
  user_id: 'u1',
  role: 'creator',
  token: 't',
  profile_completed: true,
};

/**
 * Three creators, so the rail has something to rotate through. Shaped like the
 * real GET /api/home/top-earners payload (name/category/deals), which is what
 * the screen reads now.
 */
const CREATORS = [
  {name: 'Alpha', category: 'Beauty', deals: 3},
  {name: 'Bravo', category: 'Tech', deals: 2},
  {name: 'Charlie', category: 'Food', deals: 1},
];

function mockFetch(creators: unknown[]) {
  jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      // The endpoint wraps the list in `items`, matching production.
      String(url).includes('top-earners') ? {items: creators} : {},
  })) as never);
}

async function mountHome() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <CreatorHome
        token="t"
        session={SESSION}
        onBrowse={() => {}}
        onOpenNotifications={() => {}}
        onOpenMessages={() => {}}
        onOpenProfile={() => {}}
      />,
    );
  });
  await ReactTestRenderer.act(async () => {});
  return tree;
}

/** The horizontal rail is the only horizontal ScrollView on the screen. */
function rail(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAllByType(ScrollView).find(n => n.props.horizontal);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch(CREATORS);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('the rail is manually scrollable and snaps to a card', async () => {
  const tree = await mountHome();
  const r = rail(tree);

  expect(r).toBeTruthy();
  // 238px card + 14px gap: swipes land on a card edge, not mid-card.
  expect(r!.props.snapToInterval).toBe(STRIDE);
  expect(r!.props.scrollEnabled).not.toBe(false);
});

test('auto-scroll advances to the next card on its own', async () => {
  const tree = await mountHome();
  const r = rail(tree);
  const scrollTo = jest.fn();
  // The ref points at the host instance; stub the method the timer calls.
  r!.instance.scrollTo = scrollTo;

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
  });

  expect(scrollTo).toHaveBeenCalledWith({x: STRIDE, animated: true});
});

test('touching the rail stops the timer from moving it', async () => {
  const tree = await mountHome();
  const r = rail(tree);
  const scrollTo = jest.fn();
  r!.instance.scrollTo = scrollTo;

  // Finger down.
  await ReactTestRenderer.act(async () => {
    r!.props.onTouchStart();
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(9000);
  });

  expect(scrollTo).not.toHaveBeenCalled();
});

test('auto-scroll resumes after the user stops interacting', async () => {
  const tree = await mountHome();
  const r = rail(tree);
  const scrollTo = jest.fn();
  r!.instance.scrollTo = scrollTo;

  await ReactTestRenderer.act(async () => {
    r!.props.onScrollBeginDrag();
    r!.props.onScrollEndDrag();
  });

  // Still inside the 5s quiet period: the timer must stay out of the way.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(scrollTo).not.toHaveBeenCalled();

  // Past it, the carousel takes over again.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(scrollTo).toHaveBeenCalled();
});

test('a manual swipe sets where auto-scroll continues from', async () => {
  const tree = await mountHome();
  const r = rail(tree);
  const scrollTo = jest.fn();
  r!.instance.scrollTo = scrollTo;

  // User swipes to the third card (index 2) and lets go.
  await ReactTestRenderer.act(async () => {
    r!.props.onScroll({nativeEvent: {contentOffset: {x: 504}}});
    r!.props.onScrollEndDrag();
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(9000);
  });

  // From index 2 of 3, the next card wraps to index 0 — not back to 1.
  expect(scrollTo).toHaveBeenCalledWith({x: 0, animated: true});
});

test('a single creator does not start the timer', async () => {
  jest.restoreAllMocks();
  mockFetch([CREATORS[0]]);

  const tree = await mountHome();
  const r = rail(tree);
  if (!r) {
    return;
  }
  const scrollTo = jest.fn();
  r.instance.scrollTo = scrollTo;

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(12000);
  });

  expect(scrollTo).not.toHaveBeenCalled();
});

test('the hero button reads the full "Browse Campaigns"', async () => {
  const tree = await mountHome();
  const labels = tree.root
    .findAllByType(Text)
    .flatMap(n => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter(c => typeof c === 'string');

  // It used to read "Browse Camp" because the label was hard-truncated to fit.
  expect(labels).toEqual(expect.arrayContaining(['Browse Campaigns']));
  expect(labels).not.toEqual(expect.arrayContaining(['Browse Camp']));
});
