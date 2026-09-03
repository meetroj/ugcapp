/**
 * @format
 * End-to-end check that a real screen's rendered styles actually move with the
 * device. The unit tests cover scale() itself; this covers a screen wired
 * through it, which is what would silently regress if a file lost its import.
 */
import { Dimensions } from 'react-native';

/**
 * theme.ts samples Dimensions at call time, so a device is simulated by
 * stubbing the getter and re-importing the module graph.
 *
 * React, the renderer and the component must all be re-required together
 * inside the reset registry: mixing a module-scope React with a freshly
 * required component gives the component a second React copy, whose hook
 * dispatcher is null.
 */
function renderAt(width: number, height: number) {
  jest.resetModules();
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width, height, scale: 2, fontScale: 1 } as never);
  const React = require('react');
  const Renderer = require('react-test-renderer');
  const { SkeletonCampaignList } = require('../src/components/Skeleton');
  let tree: any;
  Renderer.act(() => {
    tree = Renderer.create(React.createElement(SkeletonCampaignList, { count: 1 }));
  });
  return JSON.stringify(tree.toJSON());
}

afterEach(() => jest.restoreAllMocks());

test('a card renders larger on a tablet than on a small phone', () => {
  const small = renderAt(320, 568);
  const phone = renderAt(390, 844);
  const tablet = renderAt(820, 1180);

  const pad = (json: string) => Number(json.match(/"padding":([\d.]+)/)![1]);

  // The design value is 13 on the reference phone, and must move either side.
  expect(pad(phone)).toBe(13);
  expect(pad(small)).toBeLessThan(pad(phone));
  expect(pad(tablet)).toBeGreaterThan(pad(phone));
});

test('every rendered dimension stays on the device pixel grid', () => {
  // Fractional layout values make 1px borders blur or vanish on Android.
  const json = renderAt(393, 851);
  const nums = [...json.matchAll(/"(?:width|height|padding|borderRadius|marginTop|gap)":([\d.]+)/g)]
    .map(m => Number(m[1]));
  expect(nums.length).toBeGreaterThan(5);
  for (const n of nums) {
    // @2x in this harness => halves are on-grid; nothing finer may appear.
    expect(Math.round(n * 2) / 2).toBeCloseTo(n, 5);
  }
});
