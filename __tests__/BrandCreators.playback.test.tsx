import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, FlatList, RefreshControl } from 'react-native';
import type { AppStateStatus } from 'react-native';
import Video from 'react-native-video';
import BrandCreators from '../src/screens/BrandCreators';
import { reconcileDirectory, visibleCreatorRow } from '../src/creatorDirectoryPerformance';

let tree: Renderer.ReactTestRenderer;
let onStateChange: (state: AppStateStatus) => void;
let directory: any[];
const fixture = (count = 40) => Array.from({ length: count }, (_, index) => ({
  id: String(index), name: `Creator ${index}`,
  portfolio_preview: `https://res.cloudinary.com/demo/video/upload/v1/creator${index}.mp4`,
}));
beforeEach(() => {
  jest.useFakeTimers(); directory = fixture();
  jest.spyOn(globalThis, 'setInterval');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onStateChange = listener; return { remove: jest.fn() };
  });
  (globalThis as any).fetch = jest.fn(async () => ({ ok: true, status: 200,
    json: async () => directory.map(item => ({ ...item })),
  }));
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});
async function open() {
  await act(async () => { tree = Renderer.create(<BrandCreators token="t" onNavigate={() => {}} />); });
  act(() => onStateChange('active'));
}
const players = () => tree.root.findAllByType(Video);
const rows = () => tree.root.findAllByType(FlatList);
const byId = (testID: string) => tree.root.findAll(node => node.props.testID === testID)[0];
const press = (label: string) => tree.root.findAll(node =>
  typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label,
)[0];
function showRows(indices = [0, 1, 2]) {
  act(() => { rows().forEach(row => row.props.onViewableItemsChanged({
    viewableItems: indices.map(index => ({ index, isViewable: true })),
  })); });
}

test('one preview globally, no duplicated creators, bounded rendered cards', async () => {
  directory = fixture(400);
  await open(); expect(players()).toHaveLength(0);
  showRows(); expect(players()).toHaveLength(1);
  expect(players()[0].props.source.uri).toContain('/previews/');
  expect(rows().map(row => row.props.data.length)).toEqual([200, 200]);
  const tiles = tree.root.findAll(node => typeof node.type === 'string' &&
    String(node.props.accessibilityLabel || '').startsWith('Creator '));
  expect(tiles.length).toBeLessThan(20);
});

test('idle screen has no scrolling intervals or generated scrolling commands', async () => {
  await open(); showRows();
  expect(setInterval).not.toHaveBeenCalled();
  const scrolling = jest.spyOn(FlatList.prototype, 'scrollToOffset');
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(scrolling).not.toHaveBeenCalled();
  expect(setInterval).not.toHaveBeenCalled();
  expect(players()).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('horizontal drag and momentum unload the player until settling', async () => {
  await open(); showRows();
  act(() => rows()[0].props.onScrollBeginDrag());
  expect(players()).toHaveLength(0);
  act(() => { rows()[0].props.onScrollEndDrag(); rows()[0].props.onMomentumScrollBegin(); });
  act(() => jest.advanceTimersByTime(500)); expect(players()).toHaveLength(0);
  act(() => { rows()[0].props.onMomentumScrollEnd(); jest.advanceTimersByTime(200); });
  expect(players()).toHaveLength(1);
});

test('vertical visibility switches ownership and fully hidden rows have no players', async () => {
  await open(); showRows();
  act(() => {
    byId('creator-directory-row-0').props.onLayout({ nativeEvent: { layout: { y: 0, height: 350 } } });
    byId('creator-directory-row-1').props.onLayout({ nativeEvent: { layout: { y: 362, height: 350 } } });
    byId('creator-directory-scroll').props.onLayout({ nativeEvent: { layout: { height: 450 } } });
  });
  expect(players()[0].props.source.uri).toContain('creator0');
  act(() => byId('creator-directory-scroll').props.onScroll({ nativeEvent: { contentOffset: { y: 362 } } }));
  expect(players()).toHaveLength(1);
  expect(players()[0].props.source.uri).toContain('creator20');
  act(() => byId('creator-directory-scroll').props.onScroll({ nativeEvent: { contentOffset: { y: 800 } } }));
  expect(players()).toHaveLength(0);
});

test('vertical drag releases video until scrolling settles', async () => {
  await open(); showRows();
  act(() => byId('creator-directory-scroll').props.onScrollBeginDrag());
  expect(players()).toHaveLength(0);
  act(() => { byId('creator-directory-scroll').props.onScrollEndDrag(); jest.advanceTimersByTime(200); });
  expect(players()).toHaveLength(1);
});

test('backgrounding and opening the quick preview release all players', async () => {
  await open(); showRows();
  act(() => onStateChange('background')); expect(players()).toHaveLength(0);
  act(() => onStateChange('active')); expect(players()).toHaveLength(1);
  act(() => press('Creator 0, creator').props.onPress());
  expect(players()).toHaveLength(0);
});

test('unchanged refresh keeps rows, source and player callbacks intact', async () => {
  await open(); showRows();
  const before = players()[0].props;
  await act(async () => { tree.root.findByType(RefreshControl).props.onRefresh(); });
  expect(rows()).toHaveLength(2);
  expect(players()).toHaveLength(1);
  expect(players()[0].props.source).toBe(before.source);
  expect(players()[0].props.onError).toBe(before.onError);
});

test('refreshing a creator detail does not reset visibility or rebuild unrelated cards', async () => {
  await open(); showRows();
  const before = players()[0].props;
  directory = directory.map((item, i) => i === 4 ? { ...item, name: 'Updated' } : item);
  await act(async () => { tree.root.findByType(RefreshControl).props.onRefresh(); });
  expect(players()).toHaveLength(1);
  expect(players()[0].props.onError).toBe(before.onError);
});

test('a missing small clip never silently downloads the full upload', async () => {
  await open(); showRows();
  act(() => players()[0].props.onError());
  expect(players()).toHaveLength(0);
  act(() => press("Play Creator 0's preview").props.onPress({ stopPropagation: jest.fn() }));
  expect(players()).toHaveLength(1);
  expect(players()[0].props.source.uri).toContain('/video/upload/v1/creator0.mp4');
});

test('uploads without generated previews play only on an explicit request', async () => {
  directory = [{ id: 'upload', name: 'New creator', portfolio_video: 'https://cdn.example.com/upload.mp4', profile_photo: 'https://cdn.example.com/avatar.jpg' }];
  await open(); showRows([0]); expect(players()).toHaveLength(0);
  act(() => press("Play New creator's preview").props.onPress({ stopPropagation: jest.fn() }));
  expect(players()).toHaveLength(1);
  expect(players()[0].props.source.uri).toBe('https://cdn.example.com/upload.mp4');
});

test('multiple refresh presses coalesce while the directory request is pending', async () => {
  await open();
  let resolve: any;
  (fetch as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  act(() => {
    const refresh = tree.root.findByType(RefreshControl).props.onRefresh;
    refresh(); refresh(); refresh();
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ ok: true, status: 200, json: async () => directory }); });
});

test('settling timers are removed when the screen is left', async () => {
  await open(); showRows();
  const timeout = jest.spyOn(globalThis, 'setTimeout');
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  act(() => { rows()[0].props.onScrollBeginDrag(); rows()[0].props.onScrollEndDrag(); });
  const index = timeout.mock.calls.findIndex(call => call[1] === 200);
  expect(index).toBeGreaterThanOrEqual(0);
  const handle = timeout.mock.results[index].value;
  act(() => tree.unmount());
  expect(clear).toHaveBeenCalledWith(handle);
});

test('unchanged network records reuse existing array and card identities', () => {
  const old = fixture(3);
  expect(reconcileDirectory(old, old.map(item => ({ ...item })))).toBe(old);
  const changed = reconcileDirectory(old, old.map((item, i) => i === 1 ? { ...item, name: 'New' } : { ...item }));
  expect(changed[0]).toBe(old[0]); expect(changed[1]).not.toBe(old[1]);
  expect(changed[2]).toBe(old[2]);
});

test('visibility excludes mostly off-screen rows and handles empty layout', () => {
  const layouts = [{ y: 0, height: 350 }, { y: 362, height: 350 }];
  expect(visibleCreatorRow(layouts, 0, 450)).toBe(0);
  expect(visibleCreatorRow(layouts, 362, 450)).toBe(1);
  expect(visibleCreatorRow(layouts, 800, 450)).toBe(-1);
  expect(visibleCreatorRow([], 0, 0)).toBe(0);
});

test('search input suspends decoding while typing', async () => {
  await open(); showRows(); expect(players()).toHaveLength(1);
  const input = tree.root.findAll(node => node.props.placeholder === 'Search by name, category or style')[0];
  act(() => input.props.onFocus()); expect(players()).toHaveLength(0);
  act(() => input.props.onBlur()); expect(players()).toHaveLength(1);
});

test('an upload without a poster can still be played explicitly', async () => {
  directory = [{ id: 'upload', name: 'No poster', portfolio_video: 'https://cdn.example.com/upload.mp4' }];
  await open(); showRows([0]);
  act(() => press("Play No poster's preview").props.onPress({ stopPropagation: jest.fn() }));
  expect(players()).toHaveLength(1);
});
