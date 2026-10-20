/**
 * Pure rules shared by Earnings, the withdrawal form and the KYC screens, kept
 * free of React so they can be unit tested and cannot drift between screens.
 *
 * The backend is the source of truth: MIN_WITHDRAWAL_AMOUNT mirrors
 * server.py MIN_WITHDRAWAL_AMOUNT (2,500). No endpoint exposes it, so this one
 * named constant drives both the validation and the wording.
 */

export const MIN_WITHDRAWAL_AMOUNT = 2500;

/** Same patterns the backend applies in /api/kyc/submit. */
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
export const PINCODE_RE = /^[1-9][0-9]{5}$/;
/** Bank account numbers are 9-18 digits (server.py kyc/submit). */
export const ACCOUNT_RE = /^\d{9,18}$/;

/** Documents uploaded for KYC may not exceed this (web CreatorKYC.js). */
export const MAX_KYC_DOC_BYTES = 5 * 1024 * 1024;

export const inr = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

/**
 * Text for a failed request. A dropped connection reads as "offline" so the
 * person knows to retry rather than think their data is wrong.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { name?: string; message?: string } | null;
  if (e?.name === 'NetworkError') {
    return "You're offline. Check your connection and try again.";
  }
  return e?.message ? e.message : fallback;
}

/* ============================== Withdrawals ============================ */

/** Labels the website shows (PayoutWithLayout.js STATUS_MAP). */
const STATUS_LABELS: Record<string, string> = {
  completed: 'Paid',
  processing: 'Processing',
  pending: 'Pending',
  rejected: 'Disputed',
};

export const WITHDRAWAL_FILTERS = [
  'All',
  'Paid',
  'Processing',
  'Pending',
  'Disputed',
] as const;

export function withdrawalStatusLabel(status: unknown): string {
  const raw = String(status || 'pending').toLowerCase();
  return STATUS_LABELS[raw] || String(status || 'Pending');
}

/** "upi" -> UPI, everything else (bank, bank_transfer) -> Bank Transfer. */
export function withdrawalMethodLabel(method: unknown): string {
  return String(method || '').toLowerCase() === 'upi' ? 'UPI' : 'Bank Transfer';
}

/** The short id shown to the creator, e.g. TXN-AB12. */
export function withdrawalCode(id: unknown): string {
  return `TXN-${String(id || '').slice(-4).toUpperCase()}`;
}

/** Search matches the full id and the TXN code the row displays. */
export function filterWithdrawals<
  T extends { id?: string; status?: string },
>(rows: T[], status: string, query: string): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => {
    const matchStatus =
      status === 'All' || withdrawalStatusLabel(row.status) === status;
    const id = String(row.id || '').toLowerCase();
    const matchSearch =
      !needle || id.includes(needle) || withdrawalCode(row.id).toLowerCase().includes(needle);
    return matchStatus && matchSearch;
  });
}

export type WithdrawalForm = {
  amount: string;
  balance: number;
  method: 'upi' | 'bank';
  upi: string;
  holder: string;
  account: string;
  ifsc: string;
};

/** Problem with the amount alone, or ''. Wording matches the website's toasts. */
export function amountIssue(amount: string, balance: number): string {
  const amt = Number(amount);
  if (!amt || amt <= 0) return 'Enter a valid amount';
  if (amt < MIN_WITHDRAWAL_AMOUNT) {
    return `Minimum withdrawal is ${inr(MIN_WITHDRAWAL_AMOUNT)}`;
  }
  if (amt > balance) return 'Amount exceeds your available balance';
  return '';
}

/** First problem with the form, or '' when it can be sent. Same order as the web. */
export function withdrawalIssue(form: WithdrawalForm): string {
  const amountProblem = amountIssue(form.amount, form.balance);
  if (amountProblem) return amountProblem;
  if (form.method === 'upi') {
    if (!form.upi.trim()) return 'Enter your UPI ID';
    if (!UPI_RE.test(form.upi.trim())) {
      return "That UPI ID doesn't look right (e.g. name@bank)";
    }
  } else {
    if (!form.holder.trim()) return "Enter the account holder's name";
    if (!ACCOUNT_RE.test(form.account.trim())) {
      return 'Enter a valid bank account number (9-18 digits)';
    }
    if (!IFSC_RE.test(form.ifsc.trim().toUpperCase())) {
      return 'Enter a valid IFSC code (e.g. HDFC0001234)';
    }
  }
  return '';
}

/** Body of POST /api/withdrawal/request, shaped like the website's. */
export function withdrawalPayload(form: WithdrawalForm): {
  amount: number;
  payment_method: 'upi' | 'bank';
  account_details: Record<string, string>;
} {
  const details: Record<string, string> =
    form.method === 'upi'
      ? { upi_id: form.upi.trim() }
      : {
          account_holder_name: form.holder.trim(),
          account_number: form.account.trim(),
          ifsc_code: form.ifsc.trim().toUpperCase(),
        };
  return {
    amount: Number(form.amount),
    payment_method: form.method,
    account_details: details,
  };
}

/** Keeps digits and at most one dot with two decimals while the user types. */
export function cleanAmount(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

/** Breakdown lines under a Money In row (website pwl-earning-details). */
export function receiptBreakdown(r: Record<string, any>): Array<[string, string]> {
  const n = (v: unknown) => Number(v || 0) || 0;
  const fees = n(r.commission_amount) + n(r.tds_amount) + n(r.penalty_amount);
  const rows: Array<[string, string]> = [
    ['Deal amount', inr(r.gross_amount)],
    [
      'Platform fee',
      n(r.commission_amount) ? `- ${inr(r.commission_amount)}` : '-',
    ],
  ];
  if (n(r.tds_amount) > 0) rows.push(['TDS', `- ${inr(r.tds_amount)}`]);
  if (n(r.penalty_amount) > 0) {
    rows.push(['Late delivery penalty', `- ${inr(r.penalty_amount)}`]);
  }
  if (n(r.revision_credit) > 0) {
    rows.push(['Revision credit', `+ ${inr(r.revision_credit)}`]);
  }
  rows.push(['Total deductions', fees ? `- ${inr(fees)}` : '-']);
  rows.push(['You received', inr(r.net_amount)]);
  return rows;
}

/* ================================== KYC ================================ */

/** Aadhaar is 12 digits and must pass the Verhoeff checksum, as on the server. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function aadhaarValid(value: string): boolean {
  if (!/^[2-9][0-9]{11}$/.test(value)) return false;
  let c = 0;
  value
    .split('')
    .reverse()
    .forEach((digit, index) => {
      c = VERHOEFF_D[c][VERHOEFF_P[index % 8][Number(digit)]];
    });
  return c === 0;
}

/** Whole years from a YYYY-MM-DD date to `today`; null when it is not a real date. */
export function ageFromDob(dob: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  let age = today.getFullYear() - y;
  if (
    today.getMonth() < mo - 1 ||
    (today.getMonth() === mo - 1 && today.getDate() < d)
  ) {
    age -= 1;
  }
  return age;
}

export const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

export type KycForm = {
  name: string;
  dob: string;
  gender: string;
  pan: string;
  aadhaar: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  panDoc: string;
  payoutMethod: 'upi' | 'bank';
  upi: string;
  holder: string;
  account: string;
  ifsc: string;
};

/**
 * Everything still wrong or missing, named, so one alert can list it. Mirrors
 * CreatorKYC.js and server.py: Aadhaar is optional (checked only when given),
 * only the PAN photo is required, bank name is optional, accounts are 9-18 digits.
 */
export function kycIssues(f: KycForm, today = new Date()): string[] {
  const m: string[] = [];
  if (f.name.trim().length < 3) m.push('Full legal name');
  const age = ageFromDob(f.dob, today);
  if (age === null) m.push('Date of birth');
  else if (age < 18) m.push('You must be at least 18 to receive payouts');
  if (!f.gender) m.push('Gender');
  if (!PAN_RE.test(f.pan)) m.push('Valid PAN number');
  if (f.aadhaar && !aadhaarValid(f.aadhaar)) {
    m.push('Valid Aadhaar number (or leave it blank)');
  }
  if (!f.line.trim()) m.push('Address');
  if (!f.city.trim()) m.push('City');
  if (!f.state.trim()) m.push('State');
  if (!PINCODE_RE.test(f.pincode)) m.push('6-digit pincode');
  if (!f.panDoc) m.push('PAN card photo');
  if (f.payoutMethod === 'upi') {
    if (!UPI_RE.test(f.upi.trim())) m.push('Valid UPI ID');
  } else {
    if (!f.holder.trim()) m.push('Account holder name');
    if (!ACCOUNT_RE.test(f.account)) m.push('Account number (9-18 digits)');
    if (!IFSC_RE.test(f.ifsc)) m.push('Valid IFSC code');
  }
  return m;
}

/** City and state for a pincode, or null when it is unknown or lookup failed. */
export async function lookupPincode(
  pin: string,
): Promise<{ city: string; state: string } | null> {
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await response.json();
    const office = data?.[0]?.PostOffice?.[0];
    if (!office) return null;
    return { city: office.District || '', state: office.State || '' };
  } catch {
    return null;
  }
}

/** Gender values the backend accepts, with the labels the form shows. */
export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

/** KYC states for the status screen; the backend uses several spellings. */
export type KycStatus = 'verified' | 'pending' | 'rejected' | 'unsubmitted';

export function kycStatusOf(kyc: Record<string, any>): KycStatus {
  const raw = String(
    kyc.status ?? kyc.kyc_status ?? kyc.verification_status ?? '',
  ).toLowerCase();
  if (['verified', 'approved', 'complete', 'completed', 'success'].includes(raw)) {
    return 'verified';
  }
  if (['pending', 'in_review', 'review', 'submitted', 'processing'].includes(raw)) {
    return 'pending';
  }
  if (['rejected', 'failed', 'declined', 'denied'].includes(raw)) {
    return 'rejected';
  }
  return 'unsubmitted';
}
