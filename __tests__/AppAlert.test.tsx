import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Modal, StyleSheet, TouchableOpacity } from 'react-native';
import AppAlertHost, { Alert } from '../src/components/AppAlert';

let tree: any;
beforeEach(async () => {
  await act(async () => { tree = Renderer.create(<AppAlertHost />); });
});
afterEach(async () => {
  // Drain queued dialogs without running application callbacks.
  for (let i = 0; i < 10 && tree.root.findAllByType(Modal).length; i++) {
    const button = tree.root.findAllByType(TouchableOpacity)[0];
    await act(async () => { button.props.onPress(); });
  }
  await act(async () => { tree.unmount(); });
});
const buttons = () => tree.root.findAllByType(TouchableOpacity);

test('approval requires an explicit choice and Cancel never approves', async () => {
  const approve = jest.fn();
  await act(async () => {
    Alert.alert('Approve this work?', 'Payment will be released.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: approve },
    ]);
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Payment will be released.');
  await act(async () => { tree.root.findByType(Modal).props.onRequestClose(); });
  expect(buttons()).toHaveLength(2);
  await act(async () => { buttons()[0].props.onPress(); });
  expect(approve).not.toHaveBeenCalled();
  expect(tree.toJSON()).toBeNull();
});

test('double-tapping approve executes once and preserves the next alert', async () => {
  const approve = jest.fn(() => Alert.alert('Approved', 'Payment released.'));
  await act(async () => { Alert.alert('Approve?', '', [{ text: 'Approve', onPress: approve }]); });
  const press = buttons()[0].props.onPress;
  await act(async () => { press(); press(); });
  expect(approve).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain('Payment released.');
});

test('information alerts have a styled OK action and queue in order', async () => {
  await act(async () => { Alert.alert('First'); Alert.alert('Second'); });
  expect(JSON.stringify(tree.toJSON())).toContain('First');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Second');
  expect(JSON.stringify(tree.toJSON())).toContain('OK');
  await act(async () => { buttons()[0].props.onPress(); });
  expect(JSON.stringify(tree.toJSON())).toContain('Second');
});

test('cancelable back dismisses and runs onDismiss without approving', async () => {
  const onDismiss = jest.fn();
  const approve = jest.fn();
  await act(async () => {
    Alert.alert('Continue?', '', [{ text: 'Continue', onPress: approve }], { cancelable: true, onDismiss });
  });
  await act(async () => { tree.root.findByType(Modal).props.onRequestClose(); });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(approve).not.toHaveBeenCalled();
  expect(tree.toJSON()).toBeNull();
});

test('destructive action is red and three options remain available', async () => {
  await act(async () => {
    Alert.alert('Remove?', 'Choose an action', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Keep' }, { text: 'Delete', style: 'destructive' },
    ]);
  });
  expect(buttons()).toHaveLength(3);
  expect(StyleSheet.flatten(buttons()[2].props.style).backgroundColor).toBe('#D34550');
});
