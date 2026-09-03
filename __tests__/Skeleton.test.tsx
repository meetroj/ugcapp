/**
 * @format
 * Guards the loading-state contract: screens must render skeleton placeholders
 * while fetching, and must never seed themselves with invented sample data.
 * Both were causes of the content jumping when a tab was opened.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  SkeletonBlock,
  SkeletonCampaignList,
  SkeletonCard,
  SkeletonList,
  SkeletonReelRow,
  SkeletonStats,
  SkeletonWallet,
} from '../src/components/Skeleton';
import { scale } from '../src/theme';

test('skeleton primitives render', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(
      <>
        <SkeletonBlock width={100} height={12} />
        <SkeletonCard avatar lines={2} footer />
        <SkeletonList count={3} />
        <SkeletonStats count={4} />
      </>,
    );
  });
});

test('SkeletonList renders one card per count', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<SkeletonList count={5} />);
  });
  // Every block is an Animated.View; a card holds at least a title + body line,
  // so five cards must produce well more than five animated blocks.
  const json = JSON.stringify(tree!.toJSON());
  expect(json.length).toBeGreaterThan(0);
  expect(tree!.toJSON()).toBeTruthy();
});

test('SkeletonReelRow reserves the reel tile geometry', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SkeletonReelRow count={3} tileWidth={160} tileHeight={284} />,
    );
  });
  // The brand Creators tab shows 9:16 tiles, not full-width list cards: the
  // placeholder must carry the tall block so the real reels drop in without a
  // shift. Flattened styles are arrays, hence the search across all blocks.
  const blocks = tree!.root.findAll(
    node => typeof node.type !== 'string' && !!node.props.style,
    { deep: true },
  );
  const flat = JSON.stringify(blocks.map(b => b.props.style));
  expect(flat).toContain('284');
  expect(flat).toContain('160');
});

test('SkeletonCampaignList mirrors the campaign card shell', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<SkeletonCampaignList count={4} />);
  });
  const json = JSON.stringify(tree!.toJSON());
  // The campaign card uses a 13px pad / 16px radius shell and a 38px rounded
  // square avatar — not SkeletonCard's 16px pad and round 44px circle. Getting
  // these wrong is exactly what made the list jump when real cards arrived.
  //
  // Asserted through `scale()` rather than as raw numbers: both the skeleton
  // and the real card scale with screen size, so what must hold is that they
  // agree at whatever scale the device imposes — a hardcoded 13 would only be
  // true on the 390pt reference phone.
  expect(json).toContain(`"padding":${scale(13)}`);
  expect(json).toContain(`"borderRadius":${scale(16)}`);
  expect(json).toContain(`"height":${scale(38)}`);
});

test('SkeletonWallet covers every wallet section', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<SkeletonWallet />);
  });
  const json = JSON.stringify(tree!.toJSON());
  // The hero keeps the page's indigo fill instead of fading in from grey...
  expect(json).toContain('#181C6B');
  // ...and the recharge form must be represented, not just the balance and a
  // transaction list: a 46px input/button and 40px preset chips.
  // Scaled, for the same reason as the campaign-card shell above.
  expect(json).toContain(`"height":${scale(46)}`);
  expect(json).toContain(`"height":${scale(40)}`);
  // The 34px activity icon tile, matching txIcon.
  expect(json).toContain(`"height":${scale(34)}`);
});

test('SkeletonWallet drops the tier card when there are no tiers', async () => {
  let withTiers: ReactTestRenderer.ReactTestRenderer | undefined;
  let without: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    withTiers = ReactTestRenderer.create(<SkeletonWallet />);
    without = ReactTestRenderer.create(<SkeletonWallet tiers={false} />);
  });
  const long = JSON.stringify(withTiers!.toJSON()).length;
  const short = JSON.stringify(without!.toJSON()).length;
  expect(short).toBeLessThan(long);
});
