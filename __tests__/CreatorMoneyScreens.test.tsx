/**
 * @format
 * Screen-level checks for the creator money screens: the withdrawal form uses
 * the fresh overview (not the login balance), is gated on verified KYC, blocks
 * below 2,500 and sends the website's body; Earnings reads the overview and
 * receipts; the KYC status screen shows the rejection reason.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import WithdrawalRequest from '../src/screens/WithdrawalRequest';
import Earnings from '../src/screens/Earnings';
import KycVerification from '../src/screens/KycVerification';
import {
  getKyc,
  getPayoutOverview,
  getPayoutReceipts,
  getWithdrawalHistory,
  requestWithdrawal,
} from '../src/api';

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  getKyc: jest.fn(),
  getPayoutOverview: jest.fn(),
  getPayoutReceipts: jest.fn(),
  getWithdrawalHistory: jest.fn(),
  requestWithdrawal: jest.fn(),
}));

// The first render pays the one-off transform cost of the screens.
jest.setTimeout(60000);

const verified = {
  balance: 9000,
  kyc_status: 'verified',
  upi_id: 'me@upi',
  bank_details: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  (getPayoutOverview as jest.Mock).mockResolvedValue(verified);
  (requestWithdrawal as jest.Mock).mockResolvedValue('ok');
  (getPayoutReceipts as jest.Mock).mockResolvedValue([]);
  (getWithdrawalHistory as jest.Mock).mockResolvedValue([]);
});

const texts = (tree: any) =>
  tree.root
    .findAll((n: any) => typeof n.type === 'string' && n.type === 'Text')
    .map((n: any) => [].concat(n.props.children).join(''));

async function mountWithdrawal() {
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <WithdrawalRequest
        token="t"
        available={1}
        onBack={() => {}}
        onVerifyKyc={() => {}}
      />,
    );
  });
  return tree;
}

const press = (tree: any, label: string) =>
  tree.root
    .findAll(
      (n: any) =>
        typeof n.props?.onPress === 'function' &&
        n.findAll((c: any) => c.props?.children === label).length > 0,
    )[0];

test('withdrawal form shows the fresh balance, not the stale prop', async () => {
  const tree = await mountWithdrawal();
  expect(texts(tree).join('|')).toContain('₹9,000');
  expect(texts(tree).join('|')).not.toContain('₹1');
});

test('unverified KYC shows the gate instead of the form', async () => {
  (getPayoutOverview as jest.Mock).mockResolvedValue({
    ...verified,
    kyc_status: 'rejected',
    kyc_rejection_reason: 'PAN blurry',
  });
  const tree = await mountWithdrawal();
  const all = texts(tree).join('|');
  expect(all).toContain('KYC was not approved');
  expect(all).toContain('PAN blurry');
  expect(all).not.toContain('Request withdrawal');
});

test('below 2,500 nothing is sent; 2,500 sends the website body', async () => {
  const tree = await mountWithdrawal();
  const input = tree.root.findByProps({ accessibilityLabel: 'Withdrawal amount' });

  await ReactTestRenderer.act(async () => input.props.onChangeText('500'));
  await ReactTestRenderer.act(async () => press(tree, 'Request withdrawal').props.onPress());
  expect(requestWithdrawal).not.toHaveBeenCalled();
  expect(texts(tree).join('|')).toContain('Minimum withdrawal is ₹2,500');

  await ReactTestRenderer.act(async () => input.props.onChangeText('2500'));
  await ReactTestRenderer.act(async () => press(tree, 'Request withdrawal').props.onPress());
  expect(requestWithdrawal).toHaveBeenCalledWith('t', {
    amount: 2500,
    payment_method: 'upi',
    account_details: { upi_id: 'me@upi' },
  });
});

test('a failed balance load shows Retry, not a zero balance', async () => {
  (getPayoutOverview as jest.Mock).mockRejectedValue(
    Object.assign(new Error('x'), { name: 'NetworkError' }),
  );
  const tree = await mountWithdrawal();
  const all = texts(tree).join('|');
  expect(all).toMatch(/offline/i);
  expect(all).toContain('Retry');
  expect(all).not.toContain('₹0');
});

test('Earnings reads overview + receipts and lists a money-in breakdown source', async () => {
  (getPayoutOverview as jest.Mock).mockResolvedValue({
    balance: 4000,
    pending_release: 800,
    paid_this_month: 1500,
    all_time_earnings: 9000,
    deals_paid_this_month: 2,
  });
  (getPayoutReceipts as jest.Mock).mockResolvedValue([
    { id: 'r1', type: 'earning', brand_name: 'Levi', campaign_title: 'Fit', net_amount: 700, gross_amount: 1000, commission_amount: 200, penalty_amount: 100 },
    { id: 'r2', type: 'withdrawal', net_amount: 5 },
  ]);
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Earnings token="t" session={{} as any} onRequestWithdrawal={() => {}} />,
    );
  });
  const all = texts(tree).join('|');
  expect(all).toContain('₹4,000');
  expect(all).toContain('₹800');
  expect(all).toContain('2 deals paid');
  expect(all).toContain('Levi');
  expect(all).toContain('20% platform fee');
  expect(all).not.toContain('r2');
});

test('KYC status shows the rejection reason and only offers Update when rejected', async () => {
  (getKyc as jest.Mock).mockResolvedValue({
    status: 'rejected',
    rejection_reason: 'Name does not match PAN',
    full_legal_name: 'Asha Rao',
  });
  let tree: any;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<KycVerification token="t" />);
  });
  const all = texts(tree).join('|');
  expect(all).toContain('Name does not match PAN');
  expect(all).toContain('Asha Rao');
  expect(all).toContain('Update Details');
  expect(all).not.toContain('Go to Earnings');

  (getKyc as jest.Mock).mockResolvedValue({ status: 'pending' });
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<KycVerification token="t" />);
  });
  const pending = texts(tree).join('|');
  expect(pending).not.toContain('Update Details');
  expect(pending).toContain('24-48 hours');
});
