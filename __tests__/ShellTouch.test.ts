/**
 * @format
 * scale() shrinks to 0.85x on a 320pt phone; touch() is the floor controls use
 * so a button never ends up under the 44dp minimum tap target.
 */
import { Dimensions } from 'react-native';

function themeAt(width: number, height: number) {
  jest.resetModules();
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width, height, scale: 2, fontScale: 1 } as never);
  return require('../src/theme');
}

afterEach(() => jest.restoreAllMocks());

test('touch() never goes under 44 on a 320pt phone', () => {
  const { scale, touch, MIN_TOUCH } = themeAt(320, 568);
  expect(MIN_TOUCH).toBe(44);
  expect(scale(48)).toBeLessThan(44);
  expect(touch(48)).toBe(44);
  expect(touch(44)).toBe(44);
  // Bigger controls still scale down normally.
  expect(touch(60)).toBeGreaterThanOrEqual(51);
});

test('touch() leaves the 390pt reference phone exactly as designed', () => {
  const { touch } = themeAt(390, 844);
  expect(touch(50)).toBe(50);
  expect(touch(48)).toBe(48);
  expect(touch(40)).toBe(44);
});

test('tablet scales up but keeps the floor', () => {
  const { touch } = themeAt(820, 1180);
  expect(touch(48)).toBeGreaterThanOrEqual(48);
  expect(touch(30)).toBe(44);
});
