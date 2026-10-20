/**
 * @format
 * Pure rules behind Earnings, the withdrawal form and the KYC screens. The
 * backend is the source of truth (minimum 2,500, bank accounts 9-18 digits,
 * Aadhaar optional, 18+), so these lock the app to it.
 */
import {
  MIN_WITHDRAWAL_AMOUNT,
  ageFromDob,
  aadhaarValid,
  cleanAmount,
  errorMessage,
  filterWithdrawals,
  kycIssues,
  kycStatusOf,
  receiptBreakdown,
  withdrawalIssue,
  withdrawalMethodLabel,
  withdrawalPayload,
  withdrawalStatusLabel,
} from '../src/payoutRules';

const base = {
  amount: '2500',
  balance: 5000,
  method: 'upi' as const,
  upi: 'me@upi',
  holder: '',
  account: '',
  ifsc: '',
};

describe('withdrawal rules', () => {
  test('minimum is the backend 2,500, not the old 500', () => {
    expect(MIN_WITHDRAWAL_AMOUNT).toBe(2500);
    expect(withdrawalIssue({ ...base, amount: '500' })).toBe(
      'Minimum withdrawal is ₹2,500',
    );
    expect(withdrawalIssue({ ...base, amount: '2499.99' })).toContain('₹2,500');
    expect(withdrawalIssue(base)).toBe('');
  });

  test('amount checks run in the website order', () => {
    expect(withdrawalIssue({ ...base, amount: '' })).toBe('Enter a valid amount');
    expect(withdrawalIssue({ ...base, amount: '0' })).toBe('Enter a valid amount');
    expect(withdrawalIssue({ ...base, amount: '6000' })).toBe(
      'Amount exceeds your available balance',
    );
  });

  test('decimals are typed, but only two places and one dot', () => {
    expect(cleanAmount('2500.5')).toBe('2500.5');
    expect(cleanAmount('2500.567')).toBe('2500.56');
    expect(cleanAmount('1.2.3')).toBe('1.23');
    expect(cleanAmount('a1b2')).toBe('12');
  });

  test('UPI needs a valid id, bank needs holder, 9-18 digit account and IFSC', () => {
    expect(withdrawalIssue({ ...base, upi: '' })).toBe('Enter your UPI ID');
    expect(withdrawalIssue({ ...base, upi: 'nope' })).toContain('UPI');
    const bank = {
      ...base,
      method: 'bank' as const,
      holder: 'A B',
      account: '123456789',
      ifsc: 'HDFC0001234',
    };
    expect(withdrawalIssue(bank)).toBe('');
    expect(withdrawalIssue({ ...bank, account: '12345678' })).toContain('9-18');
    expect(withdrawalIssue({ ...bank, ifsc: 'BAD' })).toContain('IFSC');
    expect(withdrawalIssue({ ...bank, holder: ' ' })).toContain('holder');
  });

  test('payload matches the website body', () => {
    expect(withdrawalPayload({ ...base, amount: '2500.50' })).toEqual({
      amount: 2500.5,
      payment_method: 'upi',
      account_details: { upi_id: 'me@upi' },
    });
    expect(
      withdrawalPayload({
        ...base,
        method: 'bank',
        holder: ' A B ',
        account: '123456789',
        ifsc: 'hdfc0001234',
      }),
    ).toEqual({
      amount: 2500,
      payment_method: 'bank',
      account_details: {
        account_holder_name: 'A B',
        account_number: '123456789',
        ifsc_code: 'HDFC0001234',
      },
    });
  });
});

describe('earnings labels, search and breakdown', () => {
  test('status labels follow the website', () => {
    expect(withdrawalStatusLabel('completed')).toBe('Paid');
    expect(withdrawalStatusLabel('rejected')).toBe('Disputed');
    expect(withdrawalStatusLabel('processing')).toBe('Processing');
    expect(withdrawalStatusLabel(undefined)).toBe('Pending');
  });

  test('method label never shows BANK_TRANSFER', () => {
    expect(withdrawalMethodLabel('upi')).toBe('UPI');
    expect(withdrawalMethodLabel('bank')).toBe('Bank Transfer');
    expect(withdrawalMethodLabel('bank_transfer')).toBe('Bank Transfer');
  });

  test('search matches the id and the TXN code, status filter uses labels', () => {
    const rows = [
      { id: 'aaaa-1234', status: 'completed' },
      { id: 'bbbb-9876', status: 'pending' },
      { id: 'cccc-5555', status: 'rejected' },
    ];
    expect(filterWithdrawals(rows, 'All', '')).toHaveLength(3);
    expect(filterWithdrawals(rows, 'Paid', '')).toEqual([rows[0]]);
    expect(filterWithdrawals(rows, 'Disputed', '')).toEqual([rows[2]]);
    expect(filterWithdrawals(rows, 'All', 'bbbb')).toEqual([rows[1]]);
    expect(filterWithdrawals(rows, 'All', 'txn-9876')).toEqual([rows[1]]);
    expect(filterWithdrawals(rows, 'Paid', 'bbbb')).toEqual([]);
  });

  test('money-in breakdown itemises fee, TDS, penalty and total deductions', () => {
    const lines = Object.fromEntries(
      receiptBreakdown({
        gross_amount: 1000,
        commission_amount: 200,
        tds_amount: 10,
        penalty_amount: 100,
        net_amount: 690,
      }),
    );
    expect(lines['Deal amount']).toBe('₹1,000');
    expect(lines['Platform fee']).toBe('- ₹200');
    expect(lines.TDS).toBe('- ₹10');
    expect(lines['Late delivery penalty']).toBe('- ₹100');
    expect(lines['Total deductions']).toBe('- ₹310');
    expect(lines['You received']).toBe('₹690');
  });

  test('a dropped connection reads as offline', () => {
    const offline = Object.assign(new Error('x'), { name: 'NetworkError' });
    expect(errorMessage(offline, 'fallback')).toMatch(/offline/i);
    expect(errorMessage(new Error('Insufficient balance'), 'fb')).toBe(
      'Insufficient balance',
    );
    expect(errorMessage(null, 'fb')).toBe('fb');
  });
});

describe('KYC rules', () => {
  const today = new Date(2026, 9, 20);
  const good = {
    name: 'Asha Rao',
    dob: '2000-01-15',
    gender: 'female',
    pan: 'ABCDE1234F',
    aadhaar: '',
    line: '1 Street',
    city: 'Pune',
    state: 'MH',
    pincode: '411001',
    panDoc: '/uploads/pan.jpg',
    payoutMethod: 'upi' as const,
    upi: 'asha@upi',
    holder: '',
    account: '',
    ifsc: '',
  };

  test('Aadhaar is optional, but checked when entered', () => {
    expect(kycIssues(good, today)).toEqual([]);
    expect(kycIssues({ ...good, aadhaar: '123456789012' }, today)).toEqual([
      'Valid Aadhaar number (or leave it blank)',
    ]);
    expect(aadhaarValid('123456789012')).toBe(false);
  });

  test('only the PAN photo is required', () => {
    expect(kycIssues({ ...good, panDoc: '' }, today)).toEqual(['PAN card photo']);
  });

  test('18+ check and real dates', () => {
    expect(ageFromDob('2008-10-20', today)).toBe(18);
    expect(ageFromDob('2008-10-21', today)).toBe(17);
    expect(ageFromDob('2001-02-30', today)).toBeNull();
    expect(kycIssues({ ...good, dob: '2010-01-01' }, today)).toEqual([
      'You must be at least 18 to receive payouts',
    ]);
    expect(kycIssues({ ...good, dob: '' }, today)).toEqual(['Date of birth']);
  });

  test('bank accounts are 9-18 digits and bank name is optional', () => {
    const bank = {
      ...good,
      payoutMethod: 'bank' as const,
      holder: 'Asha Rao',
      account: '123456789',
      ifsc: 'HDFC0001234',
    };
    expect(kycIssues(bank, today)).toEqual([]);
    expect(kycIssues({ ...bank, account: '123456' }, today)).toEqual([
      'Account number (9-18 digits)',
    ]);
  });

  test('status spellings map onto four states', () => {
    expect(kycStatusOf({ status: 'verified' })).toBe('verified');
    expect(kycStatusOf({ status: 'pending' })).toBe('pending');
    expect(kycStatusOf({ status: 'rejected' })).toBe('rejected');
    expect(kycStatusOf({ status: 'not_submitted' })).toBe('unsubmitted');
    expect(kycStatusOf({})).toBe('unsubmitted');
  });
});
