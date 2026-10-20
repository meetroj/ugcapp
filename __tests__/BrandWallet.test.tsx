import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert } from '../src/components/AppAlert';
import BrandWallet, {
  filterTransactions,
  looksLikeCampaignId,
  minRecharge,
} from '../src/screens/BrandWallet';
import { checkoutHtml } from '../src/screens/WalletCheckout';

let tree: Renderer.ReactTestRenderer;

const row = (n: number, direction: 'credit' | 'debit', extra = {}) => ({
  id: `tx-${n}`,
  date: `2026-10-${String(30 - n).padStart(2, '0')}T10:00:00Z`,
  type: direction === 'credit' ? 'Wallet Recharge' : 'Escrow Lock',
  reference: `ref-${n}`,
  amount: 1000 + n,
  direction,
  status: 'success',
  ...extra,
});
// 10 rows, alternating credit / debit, newest first.
const transactions = Array.from({ length: 10 }, (_, n) => row(n, n % 2 ? 'debit' : 'credit'));

function mockWallet(wallet: Record<string, unknown> | 'offline') {
  (globalThis as any).fetch = jest.fn(async () => {
    if (wallet === 'offline') throw new TypeError('Network request failed');
    return { ok: true, status: 200, json: async () => wallet };
  });
}
async function open(props: Record<string, unknown> = {}) {
  await act(async () => {
    tree = Renderer.create(<BrandWallet token="t" onNavigate={() => {}} {...(props as any)} />);
  });
}
const byId = (testID: string) =>
  tree.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
// Unique testIDs: a touchable and the view it renders both carry the prop.
const idsLike = (prefix: string) => [
  ...new Set(
    tree.root
      .findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith(prefix) && typeof n.props.onPress === 'function')
      .map(n => n.props.testID as string),
  ),
];
// Visible text only (toJSON() is circular because props hold refs).
const textOf = (node: Renderer.ReactTestInstance): string =>
  node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const allText = () => textOf(tree.root);

afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('minimum recharge is the setting the website reads, with 2,500 as the fallback', () => {
  expect(minRecharge({ minimum_chat_balance: 5000 })).toBe(5000);
  expect(minRecharge({ minimum_chat_balance: 0 })).toBe(2500);
  expect(minRecharge({})).toBe(2500);
});

test('history filter and campaign-link rules match the website', () => {
  expect(filterTransactions(transactions, 'all')).toHaveLength(10);
  expect(filterTransactions(transactions, 'credits').every(r => r.direction === 'credit')).toBe(true);
  expect(filterTransactions(transactions, 'debits')).toHaveLength(5);
  expect(looksLikeCampaignId('3f2a9c1e-77b4-4c0e-9d2a-0a1b2c3d4e5f')).toBe(true);
  expect(looksLikeCampaignId('order_Nabc123')).toBe(false);
  expect(looksLikeCampaignId(undefined)).toBe(false);
});

test('a low balance shows the banner and the configured minimum, and a smaller amount is refused', async () => {
  mockWallet({ available_balance: 1000, minimum_chat_balance: 5000, chat_unlocked: false, transactions: [] });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open();
  expect(byId('wallet-add-funds')).toBeTruthy();
  expect(tree.root.findAll(n => n.props.testID === 'wallet-low-balance').length).toBeGreaterThan(0);
  expect(allText()).toContain('Rs. 5,000');
  expect(allText()).toContain('Wallet credits are non-refundable');

  const input = tree.root.findAll(n => n.props.testID === 'wallet-amount' && typeof n.props.onChangeText === 'function')[0];
  act(() => input.props.onChangeText('3000'));
  await act(async () => { await byId('wallet-add-funds').props.onPress(); });
  expect(alert).toHaveBeenCalledWith('Amount too low', 'Minimum recharge amount is Rs. 5,000');
  // Only the wallet read happened: no order was created.
  expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
});

test('an unlocked wallet has no low-balance banner', async () => {
  mockWallet({ available_balance: 9000, minimum_chat_balance: 2500, chat_unlocked: true, transactions: [] });
  await open();
  expect(tree.root.findAll(n => n.props.testID === 'wallet-low-balance')).toHaveLength(0);
});

test('history pages by 8, filters by direction, and opens a detail sheet with the reference', async () => {
  mockWallet({ available_balance: 9000, minimum_chat_balance: 2500, chat_unlocked: true, transactions });
  await open();
  expect(idsLike('wallet-tx-')).toHaveLength(8);
  await act(async () => { byId('wallet-show-more').props.onPress(); });
  expect(idsLike('wallet-tx-')).toHaveLength(10);

  act(() => byId('wallet-filter-credits').props.onPress());
  expect(idsLike('wallet-tx-')).toHaveLength(5);
  act(() => byId('wallet-filter-debits').props.onPress());
  expect(idsLike('wallet-tx-')).toHaveLength(5);

  act(() => byId('wallet-tx-0').props.onPress());
  expect(tree.root.findAll(n => n.props.testID === 'wallet-detail').length).toBeGreaterThan(0);
  expect(allText()).toContain('Transaction ID');
  expect(allText()).toContain('Campaign / Ref');
});

test('a campaign reference on a transaction offers View campaign', async () => {
  const onNavigate = jest.fn();
  const campaign = '3f2a9c1e-77b4-4c0e-9d2a-0a1b2c3d4e5f';
  mockWallet({
    available_balance: 9000, minimum_chat_balance: 2500, chat_unlocked: true,
    transactions: [row(0, 'debit', { reference: campaign })],
  });
  await open({ onNavigate });
  act(() => byId('wallet-tx-0').props.onPress());
  const view = tree.root.findAll(n => typeof n.props.onPress === 'function' && textOf(n).includes('View campaign')).slice(-1)[0];
  act(() => view.props.onPress());
  expect(onNavigate).toHaveBeenCalledWith(`/campaigns/${campaign}`);
});

test('a failed first load says so and retries, instead of showing Rs. 0', async () => {
  mockWallet('offline');
  await open();
  expect(allText()).toContain("You're offline");
  expect(allText()).not.toContain('Available Balance');
  mockWallet({ available_balance: 4200, minimum_chat_balance: 2500, chat_unlocked: true, transactions: [] });
  await act(async () => { byId('wallet-retry').props.onPress(); });
  expect(allText()).toContain('4,200');
});

test('checkout is prefilled with the brand details like the website', () => {
  const html = checkoutHtml(
    { gateway: 'razorpay', order_id: 'order_1', key_id: 'rzp_1', amount: 5000, currency: 'INR' },
    { name: 'Asha', email: 'a@b.co', contact: '9000000000' },
  );
  expect(html).toContain('"prefill":{"name":"Asha","email":"a@b.co","contact":"9000000000"}');
  expect(html).toContain('"name":"UGCad.io"');
  expect(html).toContain('"theme":{"color":"#07074e"}');
});
