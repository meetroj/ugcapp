import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import WalletCheckout, { checkoutHtml } from '../src/screens/WalletCheckout';
import { verifyWalletPayment } from '../src/api';
jest.mock('../src/api', () => ({ verifyWalletPayment: jest.fn() }));
const order = { gateway: 'razorpay', order_id: 'order_123', key_id: 'rzp_test_123', amount: 2500, currency: 'INR' };
let tree: Renderer.ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); jest.clearAllMocks(); });
test('opens provider checkout with the selected order and amount in paise', () => {
  const html = checkoutHtml(order);
  expect(html).toContain('checkout.razorpay.com/v1/checkout.js');
  expect(html).toContain('checkout.open()');
  expect(html).toContain('"amount":250000');
  expect(html).toContain('"order_id":"order_123"');
  expect(checkoutHtml({ ...order, order_id: '</script>' })).not.toContain('"order_id":"</script>"');
});
test('only completes after server verification and ignores a different order', async () => {
  const onSuccess = jest.fn();
  act(() => { tree = Renderer.create(<WalletCheckout token="token" order={order} onClose={jest.fn()} onSuccess={onSuccess} />); });
  const handler = tree.root.findByType(WebView).props.onMessage;
  const result = { razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_123', razorpay_signature: 'signature' };
  await act(async () => { await handler({ nativeEvent: { data: JSON.stringify({ type: 'success', data: { ...result, razorpay_order_id: 'other' } }) } }); });
  expect(verifyWalletPayment).not.toHaveBeenCalled();
  (verifyWalletPayment as jest.Mock).mockResolvedValue({ success: true });
  await act(async () => { await handler({ nativeEvent: { data: JSON.stringify({ type: 'success', data: result }) } }); });
  expect(verifyWalletPayment).toHaveBeenCalledWith('token', result);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});
test('cancel returns to wallet without verification', async () => {
  const close = jest.fn();
  act(() => { tree = Renderer.create(<WalletCheckout token="token" order={order} onClose={close} onSuccess={jest.fn()} />); });
  await act(async () => { await tree.root.findByType(WebView).props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'cancel' }) } }); });
  expect(close).toHaveBeenCalledTimes(1);
  expect(verifyWalletPayment).not.toHaveBeenCalled();
});
