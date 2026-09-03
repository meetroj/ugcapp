/**
 * @format
 * Guards the responsive scaling contract in src/theme.ts.
 *
 * The design reference is a 390pt-wide phone: on that screen every scaled value
 * must come back unchanged, or the whole app silently shifts away from the
 * layout it was designed against. Away from it, values must move in the right
 * direction and stay inside the clamp.
 */
import { Dimensions } from 'react-native';

/**
 * theme.ts reads Dimensions at call time, so a device is simulated by stubbing
 * the getter and re-importing the module with a fresh registry.
 */
function themeAt(width: number, height: number) {
  jest.resetModules();
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width, height, scale: 2, fontScale: 1 } as never);
  return require('../src/theme');
}

afterEach(() => jest.restoreAllMocks());

test('the 390pt reference phone is left exactly as designed', () => {
  const { scale, fontScale } = themeAt(390, 844);
  // Not "close to" — identical. Anything else means the reference layout moved.
  expect(scale(16)).toBe(16);
  expect(scale(13)).toBe(13);
  expect(fontScale(14)).toBe(14);
  expect(fontScale(28)).toBe(28);
});

test('a small phone shrinks, but not below the floor', () => {
  const { scale } = themeAt(320, 568);
  expect(scale(16)).toBeLessThan(16);
  // 0.85 floor: 16 * 0.85 = 13.6. The result is then snapped to the device
  // pixel grid (13.5 at @2x), so the floor is checked with that half-pixel of
  // rounding allowed rather than as an exact bound.
  expect(scale(16)).toBeGreaterThanOrEqual(16 * 0.85 - 0.5);
});

test('a tablet grows, but is capped at 1.25x', () => {
  const { scale } = themeAt(820, 1180);
  expect(scale(16)).toBeGreaterThan(16);
  // Without the cap this would be 820/390 = 2.1x — a zoomed-in phone.
  expect(scale(16)).toBeLessThanOrEqual(16 * 1.25);
});

test('type scales more gently than layout', () => {
  const { scale, fontScale } = themeAt(820, 1180);
  // Both grow, but text must not grow as fast as the boxes around it.
  const layoutGrowth = scale(100) / 100;
  const textGrowth = fontScale(100) / 100;
  expect(textGrowth).toBeGreaterThan(1);
  expect(textGrowth).toBeLessThan(layoutGrowth);
});

test('landscape does not resize the layout', () => {
  // Scaling keys off the short edge, so rotating a phone must not reflow it.
  const portrait = themeAt(390, 844).scale(16);
  const landscape = themeAt(844, 390).scale(16);
  expect(landscape).toBe(portrait);
});

test('device classes match their breakpoints', () => {
  expect(themeAt(320, 568).isSmallPhone).toBe(true);
  expect(themeAt(390, 844).isSmallPhone).toBe(false);
  expect(themeAt(390, 844).isTablet).toBe(false);
  expect(themeAt(820, 1180).isTablet).toBe(true);
});

test('the OS font-size cap stays within a layout-safe range', () => {
  const { MAX_FONT_SCALE } = themeAt(390, 844);
  // Below 1 would shrink text the user asked to enlarge; far above ~1.3
  // overflows the fixed-height rows this layout is built from.
  expect(MAX_FONT_SCALE).toBeGreaterThan(1);
  expect(MAX_FONT_SCALE).toBeLessThanOrEqual(1.5);
});
