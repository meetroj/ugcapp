import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useLiveEffect, useLiveUpdates } from '../src/liveUpdates';
let tree: Renderer.ReactTestRenderer;
let foreground: (state: any) => void;
let loads: jest.Mock;
let originalState: any;
function Screen() { useLiveUpdates('token'); useLiveEffect(() => { loads(); }, []); return null; }
beforeEach(() => {
  jest.useFakeTimers(); loads = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => { foreground = callback; return { remove: jest.fn() }; });
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => { act(() => tree?.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); AppState.currentState = originalState; });
test('unchanged cursors do not refetch; changes and resume refresh data', async () => {
  let version = 'one';
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ version }) }));
  await act(async () => { tree = Renderer.create(<Screen />); });
  expect(loads).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(loads).toHaveBeenCalledTimes(1);
  version = 'two';
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(loads).toHaveBeenCalledTimes(2);
  await act(async () => { foreground('active'); });
  expect(loads).toHaveBeenCalledTimes(3);
});
test('polling pauses in the background and stops on unmount', async () => {
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ version: 'one' }) }));
  await act(async () => { tree = Renderer.create(<Screen />); });
  AppState.currentState = 'background';
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(fetch).toHaveBeenCalledTimes(1);
});
