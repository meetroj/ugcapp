/** The bell in every top bar shows the unread-notification count the shell provides. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import AppHeader from '../src/components/AppHeader';
import { HeaderCountsContext } from '../src/components/HeaderCounts';

const texts = (node: Renderer.ReactTestInstance): string =>
  node.children.map(c => (typeof c === 'string' ? c : texts(c))).join('');
const bell = (tree: Renderer.ReactTestRenderer) =>
  tree.root.findAll(n => n.props.accessibilityLabel === 'Notifications' && typeof n.props.onPress !== 'undefined' || n.props.accessibilityLabel === 'Notifications')[0];

const render = (count: number, props: any = {}) => {
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <HeaderCountsContext.Provider value={{ notifications: count }}>
        <AppHeader title="Creators" {...props} />
      </HeaderCountsContext.Provider>,
    );
  });
  return tree;
};

test('the bell shows the shell\'s unread notifications without the screen passing anything', () => {
  expect(texts(bell(render(44)))).toBe('9+');
  expect(texts(bell(render(3)))).toBe('3');
});

test('no number when there is nothing unread, and a screen can still pass its own', () => {
  expect(texts(bell(render(0)))).toBe('');
  expect(texts(bell(render(44, { notificationCount: 2 })))).toBe('2');
});
