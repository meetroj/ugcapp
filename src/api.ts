/**
 * Where the app talks to the API.
 *
 * Release builds use the live API — the same host the ugcad.io website calls,
 * so the app and the site share one set of accounts and data.
 * 
 * Debug builds keep pointing at the local backend on localhost:8000, which
 * `adb reverse tcp:8000 tcp:8000` (run by `npm run android`) makes reachable
 * from both emulators and physical devices. Without this split a shipped APK
 * would try to reach the developer's own machine and fail on every device.
 */
export const BACKEND_URL = __DEV__
  ? 'http://localhost:8000'
  : 'https://app.ugcad.io';

export type AuthUser = {
  user_id: string;
  role: 'creator' | 'business' | 'admin';
  token: string;
  profile_completed?: boolean;
  [key: string]: unknown;
};

/**
 * Reads the reason out of an error body.
 *
 * FastAPI answers a failed check with a string `detail` ("Email already
 * registered"), but a request that fails *validation* comes back as 422 with a
 * LIST of {loc, msg} objects instead. Only handling the string form meant every
 * 422 collapsed into the generic fallback, so a signup rejected for a missing
 * or malformed mobile number read as "Authentication failed" — which points at
 * the password rather than the field that was actually wrong.
 */
function errorDetail(data: any, fallback: string): string {
  const detail = data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: any) => {
        const msg = typeof item?.msg === 'string' ? item.msg : '';
        if (!msg) {
          return '';
        }
        // loc is ["body", "phone"]: the field name is the last entry, and it is
        // what turns "Field required" into something actionable.
        const loc = Array.isArray(item?.loc) ? item.loc : [];
        const field = loc.length ? String(loc[loc.length - 1]) : '';
        return field && field !== 'body' ? `${field}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (messages.length) {
      return messages.join('\n');
    }
  }
  return fallback;
}

/**
 * Thrown when the account has 2FA on and the request carried no code. The
 * caller catches this to ask for the six digits and retry — the app used to
 * treat it as a hard failure and tell the user to go to the website.
 */
export class TwoFactorRequired extends Error {
  constructor() {
    super('Enter the 6-digit code from your authenticator app.');
    this.name = 'TwoFactorRequired';
  }
}

async function authRequest(
  path: '/auth/login' | '/auth/signup' | '/auth/google' | '/auth/apple',
  body: Record<string, string>,
  query = '',
): Promise<AuthUser> {
  const response = await request(`${BACKEND_URL}/api${path}${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      errorDetail(data, 'Authentication failed'),
    );
  }
  if (data.requires_2fa) {
    throw new TwoFactorRequired();
  }
  if (!data.token) {
    throw new Error('The backend returned an invalid authentication response.');
  }

  return data as AuthUser;
}

/**
 * `totpToken` is the authenticator code, supplied only on the retry after a
 * TwoFactorRequired. It rides in the query string, as the API expects.
 */
export function login(email: string, password: string, totpToken?: string) {
  return authRequest(
    '/auth/login',
    { email: email.trim(), password },
    totpQuery(totpToken),
  );
}

/** Email, Google and Apple all take the 2FA retry code the same way. */
const totpQuery = (totpToken?: string) =>
  totpToken ? `?totp_token=${encodeURIComponent(totpToken)}` : '';

/**
 * Dial code every signup is filed under. The form has no country picker, and
 * the backend stores the dial code and the national number separately (see
 * normalize_signup_phone in server.py), so it has to travel with the number.
 */
export const SIGNUP_DIAL_CODE = '+91';

/**
 * Sign-up. `phone` is the national number (10 digits for +91) and is required:
 * the backend answers 400 when it is missing or the wrong length. There is no
 * OTP step — it is contact detail the ops team reads on the application, not a
 * verified second factor.
 */
export async function signUp(
  role: 'creator' | 'brand',
  email: string,
  password: string,
  phone: string,
  name?: string,
  website?: string,
) {
  const session = await authRequest('/auth/signup', {
    email: email.trim(),
    password,
    phone: phone.trim(),
    dial_code: SIGNUP_DIAL_CODE,
    role: role === 'brand' ? 'business' : 'creator',
    // Sent so the account is created with the real name (brand name for a
    // business), not an auto-generated handle.
    ...(name ? { name: name.trim() } : {}),
    ...(website ? { website: website.trim() } : {}),
  });
  // A brand-new account has never filled the profile form and is unreviewed.
  // Older backends leave both flags out of the signup response, and App.tsx
  // routes on them — without these defaults a new user skipped the profile
  // form and landed straight on the dashboard.
  return {
    ...session,
    profile_completed: session.profile_completed ?? false,
    approval_status: session.approval_status ?? 'pending',
  };
}

/**
 * Google sign-in. Exchanges the Google ID token for a UGCad session.
 *
 * `credential` is the ID token from the native Google Sign-In SDK, which the
 * backend verifies against its own GOOGLE_CLIENT_ID — so the app must request
 * the token with that same WEB client id as the audience, not an Android one.
 *
 * The same endpoint signs in and signs up: the backend creates the account when
 * the email is new (using `role`), links the Google identity to an existing
 * local account with that email, and otherwise just logs in. `role` is ignored
 * for accounts that already exist.
 */
export function googleAuth(
  credential: string,
  role: 'creator' | 'brand' = 'creator',
  totpToken?: string,
) {
  return authRequest(
    '/auth/google',
    { credential, role: role === 'brand' ? 'business' : 'creator' },
    totpQuery(totpToken),
  );
}

/**
 * Sign in with Apple. Same contract as googleAuth: one endpoint signs in and
 * signs up, and `role` is read only when the account is new.
 *
 * `fullName` is sent because Apple hands the name to the client exactly once,
 * at first authorization, and never puts it in the identity token — so if the
 * app does not forward it, the account is created without a name for good.
 */
export function appleAuth(
  identityToken: string,
  role: 'creator' | 'brand' = 'creator',
  fullName?: string,
  totpToken?: string,
) {
  return authRequest(
    '/auth/apple',
    {
      identity_token: identityToken,
      role: role === 'brand' ? 'business' : 'creator',
      ...(fullName ? { full_name: fullName } : null),
    },
    totpQuery(totpToken),
  );
}

/**
 * Notification preferences. The two roles use different backends, mirroring
 * the website: brands keep a `business_settings.notifications` document, while
 * creators store `notification_prefs` on their user record.
 */
export type NotificationPrefs = Record<string, boolean>;

/**
 * Message shown when the request never reached the server. `fetch` rejects
 * (rather than returning a response) when the host is unreachable. Without
 * this, a connection failure surfaced as the same generic error as a wrong
 * password. The adb hint only appears in dev builds: in production (and on
 * iOS generally) it is meaningless to the person reading it — dev-on-device
 * reachability is `adb reverse` on Android and a LAN-IP BACKEND_URL on iOS.
 */
export const OFFLINE_MESSAGE = __DEV__
  ? "Can't reach the server. Check that the backend is running and, on an Android device, that `adb reverse tcp:8000 tcp:8000` is active."
  : "Can't reach the server. Please check your internet connection and try again.";

/** Marks an error as a transport failure rather than a rejection from the API. */
export class NetworkError extends Error {
  constructor(message = OFFLINE_MESSAGE) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * `fetch` that turns an unreachable host into a NetworkError carrying a
 * message worth showing, instead of the opaque "Network request failed".
 */
async function request(input: string, init?: RequestInit): Promise<Response> {
  try {
    // Must call fetch here, not request() — calling itself recurses forever,
    // and the resulting stack overflow was being reported as "can't reach the
    // server" on every single API call.
    return await fetch(input, init);
  } catch {
    throw new NetworkError();
  }
}

/**
 * A non-2xx response, carrying the HTTP status alongside the message.
 *
 * The status matters to callers that treat one code as a normal state rather
 * than a failure — a 404 from /api/shipment/:id means "nothing requested yet",
 * which should render an empty panel, not an error.
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function json(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      typeof data.detail === 'string' ? data.detail : 'Request failed',
      response.status,
    );
  }
  return data;
}

const auth = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export async function getNotificationPrefs(
  token: string,
  role: 'creator' | 'business' | 'admin',
): Promise<NotificationPrefs> {
  if (role === 'business') {
    const data = await json(
      await request(`${BACKEND_URL}/api/business/settings/notifications`, {
        headers: auth(token),
      }),
    );
    return data as NotificationPrefs;
  }
  // Creators read their prefs off the user record returned by /auth/me.
  const data = await json(
    await request(`${BACKEND_URL}/api/auth/me`, { headers: auth(token) }),
  );
  return (data?.notification_prefs || {}) as NotificationPrefs;
}

export async function saveNotificationPrefs(
  token: string,
  role: 'creator' | 'business' | 'admin',
  prefs: NotificationPrefs,
): Promise<NotificationPrefs> {
  if (role === 'business') {
    const data = await json(
      await request(`${BACKEND_URL}/api/business/settings/notifications`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify(prefs),
      }),
    );
    return data as NotificationPrefs;
  }
  const data = await json(
    await request(`${BACKEND_URL}/api/profile/preferences`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ notification_prefs: prefs }),
    }),
  );
  return (data?.notification_prefs || prefs) as NotificationPrefs;
}

/**
 * In-app notification feed — powers the bell dropdown. Separate from the
 * preference toggles above: this lists the notifications themselves.
 */
export type AppNotification = {
  id: string;
  title?: string;
  message?: string;
  type?: string;
  link?: string | null;
  read?: boolean;
  created_at?: string;
  source?: string;
  sender_label?: string;
};

export async function getNotifications(
  token: string,
): Promise<AppNotification[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/notifications/my-notifications`, {
      headers: auth(token),
    }),
  );
  return Array.isArray(data) ? (data as AppNotification[]) : [];
}

export async function getUnreadCount(token: string): Promise<number> {
  const data = await json(
    await request(`${BACKEND_URL}/api/notifications/unread-count`, {
      headers: auth(token),
    }),
  );
  return Number(data?.count || 0);
}

export async function markNotificationRead(token: string, id: string) {
  return json(
    await request(`${BACKEND_URL}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: auth(token),
    }),
  );
}

export async function markAllNotificationsRead(token: string) {
  return json(
    await request(`${BACKEND_URL}/api/notifications/mark-all-read`, {
      method: 'POST',
      headers: auth(token),
    }),
  );
}

/**
 * Confirms a stored token is still accepted by the backend, and refreshes the
 * parts of the session that can change server-side (role, profile_completed).
 *
 * Returns the merged session when the token works, `null` when the backend
 * rejects it (expired / revoked / user deleted), and the original session
 * unchanged when the request fails for network reasons — being offline should
 * not log anybody out.
 */
export async function verifySession(
  session: AuthUser,
): Promise<AuthUser | null> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: auth(session.token),
    });
  } catch {
    return session;
  }

  if (response.status === 401 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    return session;
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    return session;
  }

  // The token itself never comes back from /auth/me, so keep the stored one.
  return {
    ...session,
    ...(data as Record<string, unknown>),
    token: session.token,
  };
}

/**
 * Chat. Threads come from the FastAPI backend (server.py):
 * `GET /api/chat/conversations` lists them, `GET /api/chat/:otherId` returns one
 * thread's messages (and marks incoming ones read), `POST /api/chat/send` posts.
 */
export type Conversation = {
  user_id: string;
  nickname: string;
  thread_classification?: 'active_deal' | 'archived' | 'no_deal';
  timestamp?: string;
  last_message?: { message?: string; timestamp?: string };
  unread_count: number;
  associated_deal_status?: string | null;
  counterparty_active?: boolean;
};

export type ChatMessage = {
  id: string;
  item_type?: 'text' | 'system' | 'action_card';
  sender_id: string;
  sender_type?: string;
  message?: string;
  system_message?: boolean;
  created_at?: string;
  timestamp?: string;
  attachment_urls?: string[];
  /* Action-card fields — present when item_type === 'action_card'. */
  type?: ActionCardType;
  fields?: Record<string, unknown>;
  card_status?: 'open' | 'accepted' | 'rejected' | 'countered' | 'partial' | 'expired';
  /** What the RECIPIENT may do. The backend omits it on no-response cards. */
  available_actions?: ActionCardResponse[];
  deal_id?: string | null;
};

/**
 * Action cards — the structured offers/requests sent from the chat composer.
 * Mirrors ACTION_CARD_TYPES in the backend (server.py).
 */
export type ActionCardType =
  | 'custom_offer'
  | 'private_invitation'
  | 'counter_offer'
  | 'revision_request'
  | 'milestone_update'
  | 'damage_report'
  | 'escalate_to_admin'
  | 'raise_dispute';

export type ActionCardResponse =
  | 'accept'
  | 'reject'
  | 'counter'
  | 'flag_scope_creep'
  | 'partial_accept';

/**
 * POST /api/chat/action-cards — sends a structured card into the thread.
 *
 * `fields` is the per-type payload; the shapes live in the chat screen next to
 * the forms that collect them. The backend contact-filters the free-text keys
 * (notes, summary, description, diff_vs_original) and answers 400 with
 * `filtered: true` when it finds a phone number or email, so the caller should
 * surface `detail` rather than assume a network fault.
 */
export async function sendActionCard(
  token: string,
  recipientId: string,
  type: ActionCardType,
  fields: Record<string, unknown>,
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/chat/action-cards`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ recipient_id: recipientId, type, fields }),
    }),
  );
}

/**
 * POST /api/chat/action-cards/:cardId/respond — accept / decline / counter a
 * card someone sent us. Only the recipient may respond, and only while the card
 * is still `open`, so both are checked before the button is offered.
 *
 * Declining an offer card requires a structured `decline_reason`; `note` is the
 * optional free-text comment and is contact-filtered like any other field.
 */
export async function respondToActionCard(
  token: string,
  cardId: string,
  action: ActionCardResponse,
  extra: { decline_reason?: string; note?: string } = {},
): Promise<{ ok: boolean; status: string; deal_id?: string | null }> {
  const data = await json(
    await request(`${BACKEND_URL}/api/chat/action-cards/${cardId}/respond`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ action, ...extra }),
    }),
  );
  return data as { ok: boolean; status: string; deal_id?: string | null };
}

export async function getConversations(token: string): Promise<Conversation[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/chat/conversations`, {
      headers: auth(token),
    }),
  );
  return Array.isArray(data) ? (data as Conversation[]) : [];
}

export async function getMessages(
  token: string,
  otherId: string,
): Promise<ChatMessage[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/chat/${otherId}`, {
      headers: auth(token),
    }),
  );
  return Array.isArray(data) ? (data as ChatMessage[]) : [];
}

export async function sendMessage(
  token: string,
  recipientId: string,
  message: string,
  attachmentUrls: string[] = [],
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/chat/send`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        recipient_id: recipientId,
        message,
        attachment_urls: attachmentUrls,
      }),
    }),
  );
}

/**
 * Deals. `GET /api/deals/my` returns the signed-in party's deals already
 * serialized for their side by the backend (server.py).
 */
export type Deal = {
  deal_id: string;
  current_state: string;
  viewer_party?: string;
  primary_next_action?: string | null;
  deadline_countdown_hours?: number | null;
  campaign?: { id?: string; title?: string; [key: string]: unknown };
  [key: string]: unknown;
};

export async function getMyDeals(token: string): Promise<Deal[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/deals/my`, { headers: auth(token) }),
  );
  return Array.isArray(data) ? (data as Deal[]) : [];
}

/**
 * Saved briefs (bookmarked campaigns). The backend stores the ids on the user
 * document as `saved_briefs`, so saves follow the account across devices.
 * The campaign id travels in the path — these calls take no request body.
 */
export async function getSavedBriefs(token: string): Promise<string[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/saved-briefs`, { headers: auth(token) }),
  );
  const ids = (data as { campaign_ids?: unknown }).campaign_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

/** Saves a campaign. Returns the backend's new saved state. */
export async function addSavedBrief(
  token: string,
  campaignId: string,
): Promise<boolean> {
  const data = await json(
    await request(
      `${BACKEND_URL}/api/saved-briefs/${encodeURIComponent(campaignId)}`,
      { method: 'POST', headers: auth(token) },
    ),
  );
  return (data as { saved?: boolean }).saved !== false;
}

/** Un-saves a campaign. Returns the backend's new saved state. */
export async function removeSavedBrief(
  token: string,
  campaignId: string,
): Promise<boolean> {
  const data = await json(
    await request(
      `${BACKEND_URL}/api/saved-briefs/${encodeURIComponent(campaignId)}`,
      { method: 'DELETE', headers: auth(token) },
    ),
  );
  return (data as { saved?: boolean }).saved === true;
}

/**
 * Bids. `GET /api/bids/my` returns the campaigns this creator has bid on, each
 * flattened with `my_bid` and `bid_status` alongside the campaign fields.
 */
export type MyBid = {
  id?: string;
  title?: string;
  campaign?: Record<string, unknown>;
  my_bid?: { amount?: number; status?: string; [key: string]: unknown };
  bid_status?: string;
  submitted_at?: string;
  [key: string]: unknown;
};

export async function getMyBids(token: string): Promise<MyBid[]> {
  const data = await json(
    await request(`${BACKEND_URL}/api/bids/my`, { headers: auth(token) }),
  );
  return Array.isArray(data) ? (data as MyBid[]) : [];
}

/**
 * Creator profile editing. The backend has no granular
 * `/creator/settings/*` routes like the brand side does; the only full-form
 * write (`PUT /api/profile/creator`) REPLACES the whole profile object and
 * resets approval_status to 'pending', so it must not be used for edits.
 * `PUT /api/profile/update-info` merges just these fields and leaves approval
 * untouched, which is what an edit screen needs.
 */
export type CreatorInfo = {
  bio?: string;
  gender?: string;
  country?: string;
  age_range?: string;
  languages?: string[];
};

export async function updateCreatorInfo(
  token: string,
  info: CreatorInfo,
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/profile/update-info`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({
        ...info,
        // The endpoint accepts a comma-separated string or an array.
        languages: (info.languages || []).join(', '),
      }),
    }),
  );
}

/**
 * Full creator profile save — the same write the website's profile editor uses
 * (`PUT /api/profile/creator`).
 *
 * The narrower `update-info` merge above cannot back the details editor: the
 * route whitelists bio/description/gender/country/age_range/languages and
 * silently drops everything else, so address, skills, recording setup and
 * pricing would appear to save and never persist.
 *
 * This endpoint REPLACES the stored profile object, so the caller must spread
 * the profile it loaded and overwrite only the edited keys — exactly what the
 * web does. It also re-submits the profile for review, which is expected
 * behaviour here rather than a side effect to avoid: the website shows
 * "submitted for review" on the very same save.
 */
export async function saveCreatorProfile(
  token: string,
  profile: Record<string, unknown>,
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/profile/creator`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify(profile),
    }),
  );
}

/** Portfolio items ("My Work"). PATCH replaces the whole array. */
export async function savePortfolio(
  token: string,
  items: unknown[],
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/profile/portfolio`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ portfolio: items }),
    }),
  );
}

/**
 * Withdrawal. `POST /api/withdrawal/request` (server.py) validates KYC and
 * balance, deducts the requested amount from the creator's balance, and
 * writes a real `withdrawals` record (7 business day processing, tracked via
 * `GET /api/withdrawal/history`).
 */
export async function requestWithdrawal(
  token: string,
  amount: number,
): Promise<void> {
  // The live API validates the body strictly: `payment_method` and
  // `account_details` are required, and it rejects an all-blank
  // `account_details` with "Bank / payout account details are required".
  // Sending only `amount` failed schema validation with a raw Pydantic error
  // before any of that ran, so the creator never saw the real reason.
  //
  // The payout account is stored on the user, so it is read back here rather
  // than asked for again on the withdrawal form.
  let bank: Record<string, unknown> = {};
  let upi = '';
  try {
    const payout = await getPayoutOverview(token);
    bank = (payout?.bank_details as Record<string, unknown>) || {};
    upi = String(payout?.upi_id || '');
  } catch {
    // Fall through with empty details: the backend answers with the
    // "payout account details are required" message, which is the right
    // thing to show.
  }

  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(bank)) {
    if (value != null && String(value).trim()) {
      details[key] = String(value);
    }
  }
  if (upi.trim()) {
    details.upi_id = upi;
  }

  await json(
    await request(`${BACKEND_URL}/api/withdrawal/request`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        amount,
        // Prefer a bank transfer when an account is on file; UPI otherwise.
        payment_method: Object.keys(details).some(k => k !== 'upi_id')
          ? 'bank_transfer'
          : 'upi',
        account_details: details,
      }),
    }),
  );
}

/** A file chosen from the device, as react-native-image-picker reports it. */
export type PickedFile = {
  uri: string;
  fileName?: string | null;
  type?: string | null;
  /** Bytes. Lets a video be routed before it is read; unknown means "send it direct". */
  fileSize?: number | null;
};

/** Biggest video a user can upload. Must match VIDEO_MAX_BYTES on the server. */
export const MAX_VIDEO_UPLOAD_MB = 400;

/**
 * Up to this size a video goes through our own server (/upload/file). The web
 * front of the server refuses any request of 50 MB or more (and a proxy in front
 * of it cuts ~100 MB), and the phone then only sees a network error. Larger
 * videos go straight to S3 instead; 25 MB leaves a wide margin.
 */
const SERVER_VIDEO_UPLOAD_MB = 25;

const UPLOAD_POLL_MS = 2000;
const UPLOAD_GIVE_UP_MS = 30 * 60 * 1000;

const uploadInterrupted = () =>
  new Error(
    `The upload was interrupted. Check your connection and try again — videos must be ${MAX_VIDEO_UPLOAD_MB} MB or smaller.`,
  );

/**
 * One multipart POST with upload progress. fetch cannot report how many bytes
 * have left the phone; XMLHttpRequest can. Resolves with the status and body
 * text; rejects with NetworkError when the connection itself fails.
 */
function xhrPost(
  url: string,
  body: FormData,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<{status: number; text: string}> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.keys(headers).forEach(name => xhr.setRequestHeader(name, headers[name]));
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && event.total) {
          onProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
        }
      };
    }
    xhr.onload = () => resolve({status: xhr.status, text: xhr.responseText || ''});
    xhr.onerror = () => reject(new NetworkError());
    xhr.ontimeout = () => reject(new NetworkError());
    xhr.send(body as any);
  });
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The URL a successful upload response carries (the three endpoints name it differently). */
function uploadedUrl(data: Record<string, unknown>): string {
  const url = String(data.photo_url || data.banner || data.file_url || data.url || '');
  // A 2xx carrying no URL used to return the empty string, which every caller
  // then stored as a perfectly valid "uploaded" value — the spinner stopped and
  // nothing else happened. Fail loudly instead.
  if (!url) {
    throw new Error('Upload finished but the server returned no file URL.');
  }
  return url;
}

/** Small video through our own server, with progress. */
async function uploadVideoViaServer(
  token: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<string> {
  try {
    const {status, text} = await xhrPost(
      `${BACKEND_URL}/api/upload/file`,
      form,
      {Authorization: `Bearer ${token}`},
      onProgress,
    );
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON (a proxy error page): fall through to the status check
    }
    if (status < 200 || status >= 300) {
      throw new Error(typeof data?.detail === 'string' ? data.detail : 'Upload failed.');
    }
    return uploadedUrl(data);
  } catch (err) {
    if (err instanceof NetworkError) throw uploadInterrupted();
    throw err;
  }
}

/**
 * Large video: phone -> S3 directly with a signed form, then the server converts
 * it to a browser-playable MP4 in the background while we poll for the result.
 * `onProgress` reaches 100 when the bytes are sent; the conversion follows.
 */
async function uploadVideoViaS3(
  token: string,
  file: PickedFile,
  name: string,
  type: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const form = await json(
    await request(`${BACKEND_URL}/api/upload/presign`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        filename: name,
        content_type: type,
        size: file.fileSize || 0,
      }),
    }),
  );

  // No Authorization header here: S3 refuses a request carrying a second
  // credential, and the signed form is the credential for this one.
  const body = new FormData();
  Object.keys(form.fields).forEach(field => body.append(field, String(form.fields[field])));
  body.append('file', {uri: file.uri, name, type} as unknown as Blob); // S3 needs the file last
  try {
    const sent = await xhrPost(form.url, body, {}, onProgress);
    if (sent.status < 200 || sent.status >= 300) {
      throw new Error(
        `The upload was rejected. Check the file is a video under ${MAX_VIDEO_UPLOAD_MB} MB and try again.`,
      );
    }
  } catch (err) {
    if (err instanceof NetworkError) throw uploadInterrupted();
    throw err;
  }
  onProgress?.(100);

  const job = await json(
    await request(`${BACKEND_URL}/api/upload/finalize`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({key: form.key, original_filename: name}),
    }),
  );
  const started = Date.now();
  for (;;) {
    await sleep(UPLOAD_POLL_MS);
    try {
      const status = await json(
        await request(`${BACKEND_URL}/api/upload/status/${encodeURIComponent(job.job_id)}`, {
          headers: auth(token),
        }),
      );
      if (status.status === 'done') return uploadedUrl(status.result || {});
      if (status.status === 'failed') {
        throw new Error(status.error || 'Could not process this video. Please try again.');
      }
    } catch (err) {
      // A blip while polling is not a failure: keep waiting.
      const transient =
        err instanceof NetworkError ||
        (err instanceof ApiError && (err.status === 502 || err.status === 503));
      if (!transient) throw err;
    }
    if (Date.now() - started > UPLOAD_GIVE_UP_MS) {
      throw new Error('Processing is taking too long. Please try again in a few minutes.');
    }
  }
}

/**
 * Uploads one picked file as multipart/form-data.
 *
 * `dest` picks the endpoint: 'photo' hits /profile/upload-photo (which also
 * writes profile_photo on the user), 'banner' hits /profile/upload-banner
 * (which writes `banner`), and 'file' hits the generic /upload/file used for
 * portfolio samples. Returns the stored URL.
 *
 * 'photo' and 'banner' persist the field themselves, so no follow-up save is
 * needed — and note that PUT /profile/update-info cannot be used for either:
 * it whitelists bio/gender/country/age_range/languages and silently drops
 * anything else.
 *
 * Note: the backend OCR-scans images for contact info and rejects those that
 * carry it, so a 400 here is a real, explainable outcome rather than a bug.
 */
export async function uploadMedia(
  token: string,
  file: PickedFile,
  dest: 'photo' | 'banner' | 'file' = 'file',
  onProgress?: (percent: number) => void,
): Promise<string> {
  // The picker does not always hand back a name or a MIME type — on Android it
  // routinely omits both for videos. Defaulting those to .jpg / image/jpeg (as
  // this did) uploaded every such video as a JPEG, which the server stores
  // under a name nothing can play back.
  const extension = (file.uri.split('?')[0].match(/.([a-z0-9]+)$/i) || [])[1];
  const isVideo = /^(mp4|mov|m4v|3gp|mkv|webm)$/i.test(extension || '');
  const fallbackType = isVideo
    ? `video/${extension!.toLowerCase() === 'mov' ? 'quicktime' : extension!.toLowerCase()}`
    : 'image/jpeg';
  const fallbackName = `upload_${Date.now()}.${extension || (isVideo ? 'mp4' : 'jpg')}`;

  const name = file.fileName || fallbackName;
  const type = file.type || fallbackType;

  // Videos: up to 400 MB. Past 25 MB (or when the size is unknown) they go
  // straight to S3; smaller ones go through the server but report progress.
  if (dest === 'file' && (isVideo || type.startsWith('video/'))) {
    const bytes = file.fileSize || 0;
    if (bytes > MAX_VIDEO_UPLOAD_MB * 1048576) {
      throw new Error(
        `This video is ${Math.round(bytes / 1048576)} MB. The maximum is ${MAX_VIDEO_UPLOAD_MB} MB — compress or trim it and try again.`,
      );
    }
    if (!bytes || bytes > SERVER_VIDEO_UPLOAD_MB * 1048576) {
      return uploadVideoViaS3(token, file, name, type, onProgress);
    }
    if (onProgress) {
      const small = new FormData();
      small.append('file', {uri: file.uri, name, type} as unknown as Blob);
      return uploadVideoViaServer(token, small, onProgress);
    }
  }

  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name,
    type,
  } as unknown as Blob);

  const path =
    dest === 'photo'
      ? '/api/profile/upload-photo'
      : dest === 'banner'
      ? '/api/profile/upload-banner'
      : '/api/upload/file';
  const response = await request(`${BACKEND_URL}${path}`, {
    method: 'POST',
    // Content-Type is deliberately omitted: fetch must set the multipart
    // boundary itself, and supplying it here breaks the upload.
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === 'string' ? data.detail : 'Upload failed.',
    );
  }
  // upload-banner answers with `banner`; the other two use photo_url/file_url.
  return uploadedUrl(data);
}

/**
 * Completes onboarding: PUT /profile/creator or /profile/business. Both set
 * profile_completed, which is what releases the user from the WebView into the
 * native app, so the caller should refresh its session afterwards.
 */
export async function completeProfile(
  token: string,
  role: 'creator' | 'business',
  profile: Record<string, unknown>,
): Promise<void> {
  const response = await request(
    `${BACKEND_URL}/api/profile/${
      role === 'business' ? 'business' : 'creator'
    }`,
    {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify(profile),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === 'string'
        ? data.detail
        : 'Could not save your profile.',
    );
  }
}

/* ==========================================================================
 * Shared request helpers
 *
 * Everything below goes through `get`/`send` rather than calling `fetch`
 * directly. That matters for more than tidiness: the raw `fetch` calls these
 * replaced bypassed `request()`, so an unreachable backend surfaced as an
 * unhandled rejection instead of a NetworkError the screen could show.
 * ======================================================================== */

/** GETs an authenticated JSON endpoint. */
async function get<T>(token: string, path: string): Promise<T> {
  return (await json(
    await request(`${BACKEND_URL}${path}`, { headers: auth(token) }),
  )) as T;
}

/** Sends a JSON body with the given method and returns the parsed response. */
async function send<T>(
  token: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return (await json(
    await request(`${BACKEND_URL}${path}`, {
      method,
      headers: auth(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )) as T;
}

/**
 * Unwraps a list response. The backend mostly returns bare arrays, but a few
 * endpoints wrap them, so accept both rather than rendering an empty screen
 * when the payload is merely shaped differently.
 */
function toList<T>(payload: unknown, ...keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  const record = (payload || {}) as Record<string, unknown>;
  for (const key of [...keys, 'items', 'results', 'data']) {
    if (Array.isArray(record[key])) {
      return record[key] as T[];
    }
  }
  return [];
}

/* ============================== Campaigns ============================== */

export type Campaign = {
  id: string;
  _id?: string;
  title?: string;
  status?: string;
  brief_text?: string;
  budget_min?: number;
  budget_max?: number;
  category?: string;
  deliverables?: string;
  image_url?: string;
  business_id?: string;
  business_nickname?: string;
  creators_wanted?: number;
  requires_shipment?: boolean;
  bids?: unknown[];
  selected_creators?: string[];
  selected_creator?: string | null;
  work_submission?: Record<string, unknown> | null;
  shipment?: Record<string, unknown> | null;
  due_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

/** Normalizes Mongo's `_id` into the `id` every screen keys off. */
function withId(c: Record<string, unknown>): Campaign {
  return { ...c, id: String(c.id || c.campaign_id || c._id || '') } as Campaign;
}

/**
 * Lists campaigns. The backend scopes the result by role on its own: a brand
 * only ever sees its own briefs, a creator sees the public board.
 */
export async function getCampaigns(
  token: string,
  params: { status?: string; creatorId?: string } = {},
): Promise<Campaign[]> {
  const query = new URLSearchParams();
  // Without this the backend drops status='draft' briefs for brands, so the
  // Campaigns screen's Draft tab was always empty (web passes it too).
  query.set('include_drafts', 'true');
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.creatorId) {
    query.set('creator_id', params.creatorId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await get<unknown>(token, `/api/campaigns${suffix}`);
  return toList<Record<string, unknown>>(data, 'campaigns').map(withId);
}

export async function getCampaign(
  token: string,
  campaignId: string,
): Promise<Campaign> {
  const data = await get<Record<string, unknown>>(
    token,
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
  );
  return withId(data || {});
}

/** Creates a brief. `draft` posts to /campaigns/draft, which skips review. */
export async function createCampaign(
  token: string,
  campaign: Record<string, unknown>,
  draft = false,
): Promise<Campaign> {
  const data = await send<Record<string, unknown>>(
    token,
    'POST',
    draft ? '/api/campaigns/draft' : '/api/campaigns',
    campaign,
  );
  return withId(data || {});
}

export async function updateCampaign(
  token: string,
  campaignId: string,
  patch: Record<string, unknown>,
): Promise<Campaign> {
  const data = await send<Record<string, unknown>>(
    token,
    'PATCH',
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
    patch,
  );
  return withId(data || {});
}

/**
 * Creator places a bid on a brief.
 *
 * The live API validates the body strictly and requires all four of
 * `campaign_id`, `amount`, `proposal` and `estimated_delivery_days` — a body
 * missing any of them is rejected with a 422 before the handler runs. The id
 * therefore travels in the body as well as the path, and the delivery estimate
 * is normalised here so callers can pass the shorter `delivery_days`.
 */
export async function placeBid(
  token: string,
  campaignId: string,
  bid: {
    amount: number;
    proposal?: string;
    message?: string;
    delivery_days?: number;
    estimated_delivery_days?: number;
    [key: string]: unknown;
  },
): Promise<void> {
  const proposal = String(bid.proposal ?? bid.message ?? '');
  const days = Number(bid.estimated_delivery_days ?? bid.delivery_days ?? 0);
  await send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/bid`,
    {
      ...bid,
      campaign_id: campaignId,
      amount: Number(bid.amount) || 0,
      proposal,
      estimated_delivery_days: days,
    },
  );
}

/** Brand picks a creator from the bids on a brief (hires + funds escrow). */
export async function selectCreator(
  token: string,
  campaignId: string,
  creatorId: string,
): Promise<void> {
  // The backend takes creator_id as a QUERY param, not a body field — sending
  // it in the body left it missing, so every "Accept" 422'd as "request failed".
  await send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/select-creator?creator_id=${encodeURIComponent(creatorId)}`,
  );
}

/**
 * Brand declines one bid. Bids carry no id of their own — they are plain
 * sub-objects on the campaign — so the creator id identifies which to decline.
 */
export async function declineBid(
  token: string,
  campaignId: string,
  creatorId: string,
): Promise<void> {
  await send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/bids/${encodeURIComponent(
      creatorId,
    )}/decline`,
  );
}

/* ================================ Work ================================= */

export type WorkSubmission = {
  id: string;
  campaign_id?: string;
  campaign_title?: string;
  creator_id?: string;
  public_creator_id?: string;
  work_files?: string[];
  description?: string;
  submitted_at?: string;
  status?: string;
  [key: string]: unknown;
};

/** Submissions awaiting this brand's review, across all its campaigns. */
export async function getPendingWork(token: string): Promise<WorkSubmission[]> {
  const data = await get<unknown>(token, '/api/work/pending-review');
  return toList<WorkSubmission>(data, 'submissions');
}

/**
 * Every submission across the brand's campaigns, one row per (campaign,
 * creator), in ALL statuses — what the website's Work Review tabs show. Approved
 * rows carry the clean files; the rest carry watermark-safe previews.
 */
export async function getWorkReview(
  token: string,
): Promise<Array<Record<string, any>>> {
  const data = await get<unknown>(token, '/api/business/work-review');
  return toList<Record<string, any>>(data, 'items');
}

/** Submissions against one campaign. */
export async function getCampaignWork(
  token: string,
  campaignId: string,
  /** On a multi-creator brief, which hired creator's submission to fetch. */
  creatorId?: string,
): Promise<WorkSubmission[]> {
  const query = creatorId ? `?creator_id=${encodeURIComponent(creatorId)}` : '';
  const data = await get<unknown>(
    token,
    `/api/work/campaign/${encodeURIComponent(campaignId)}${query}`,
  );
  // This endpoint returns a SINGLE work-submission object (or {} when there's
  // none), NOT a list or a {submissions:[...]} wrapper — so toList() alone
  // always yielded [] and the campaign's Work Review tab showed "No submissions
  // yet" even when a submission existed. Wrap the bare object into a list.
  const listed = toList<WorkSubmission>(data, 'submissions');
  if (listed.length) return listed;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (obj.id) return [obj as WorkSubmission];
  }
  return [];
}

export async function approveWork(token: string, workId: string) {
  return send(token, 'POST', `/api/work/${encodeURIComponent(workId)}/approve`);
}

/**
 * Sends a work back for changes.
 *
 * Accepts either a plain reason string or the full payload the revision form
 * builds (itemised comments, notes, deadline). The backend refuses precisely —
 * revision limit reached, wallet short for a paid round, contact details in the
 * text, or a race with an approval — and those messages arrive on the thrown
 * ApiError.
 */
export async function requestWorkRevision(
  token: string,
  workId: string,
  revision: string | Record<string, unknown>,
) {
  const body =
    typeof revision === 'string'
      ? { reason: revision, message: revision }
      : revision;
  return send(
    token,
    'POST',
    `/api/work/${encodeURIComponent(workId)}/request-revision`,
    body,
  );
}

/** Creator uploads finished work against a campaign. */
export async function submitWork(
  token: string,
  campaignId: string,
  payload: {
    /** Everything delivered. The EDITED cut must lead: the backend treats
     *  work_files[0] as the primary video (watermark + the brand's review player). */
    work_files: string[];
    description?: string;
    /** The same URLs split by kind, so the brand can tell a cut from raw footage.
     *  Optional - the backend defaults both to [] when a brief needs no edited cut. */
    edited_files?: string[];
    raw_files?: string[];
  },
) {
  return send(token, 'POST', '/api/work/submit', {
    campaign_id: campaignId,
    ...payload,
  });
}

/* ============================== Creators =============================== */

export type DirectoryCreator = {
  id: string;
  name?: string;
  nickname?: string;
  full_name?: string;
  public_creator_id?: string;
  primary_category?: string;
  portfolio_preview?: string;
  portfolio_video?: string;
  portfolio?: string[];
  profile_photo?: string | null;
  average_rating?: number;
  total_reviews?: number;
  level?: number;
  /* Fields the brand-side quick-preview sheet and full profile render. The
     backend unwraps these from the creator's Mixed `profile` document. */
  bio?: string;
  price_per_video?: number;
  rate_card?: Record<string, unknown>;
  level_label?: string;
  location?: string;
  languages?: string[];
  social_links?: Record<string, string>;
  kyc_verified?: boolean;
  deliverables_completed?: number;
  [key: string]: unknown;
};

/** The brand-side creator directory. */
export async function getCreatorDirectory(
  token: string,
  sort?: string,
): Promise<DirectoryCreator[]> {
  const suffix = sort ? `?sort=${encodeURIComponent(sort)}` : '';
  const data = await get<unknown>(
    token,
    `/api/business/creator-directory${suffix}`,
  );
  return toList<Record<string, unknown>>(data, 'creators').map(c => ({
    ...c,
    id: String(c.id || c._id || ''),
  })) as DirectoryCreator[];
}

/**
 * The curated "Top Creators" leaderboard shown on the website's home page.
 *
 * This is admin-curated (see the admin Top Earners screen), NOT the same data
 * as getCreatorDirectory() — the directory is every approved creator in
 * arbitrary order, which is why the app's rail used to disagree with the site.
 * The route is public, but the token is still sent for consistency with the
 * rest of the app; the backend ignores it here.
 */
export type TopEarner = {
  name?: string;
  category?: string;
  earned?: number;
  deals?: number;
  rating?: number;
  level?: string;
  /** Cloudinary .mp4 showreel — may be absent for a curated entry. */
  video_url?: string;
  [key: string]: unknown;
};

export async function getTopEarners(token: string): Promise<TopEarner[]> {
  const data = await get<unknown>(token, '/api/home/top-earners');
  return toList<TopEarner>(data, 'items', 'earners', 'creators');
}

/** Invites a creator to bid on a brief. */
export async function inviteCreator(
  token: string,
  creatorId: string,
  campaignId?: string,
): Promise<void> {
  await send(
    token,
    'POST',
    `/api/business/creator-directory/${encodeURIComponent(creatorId)}/invite`,
    campaignId ? { campaign_id: campaignId } : {},
  );
}

/** Any user's public profile. */
export async function getPublicProfile(
  token: string,
  userId: string,
): Promise<Record<string, unknown>> {
  return get(token, `/api/profile/${encodeURIComponent(userId)}`);
}

/**
 * Reviews a creator has received from brands. Empty until a deal completes.
 * The brand-side creator profile shows these under its Reviews section.
 */
export type CreatorReview = {
  rating?: number;
  review?: string;
  reviewer_id?: string;
  created_at?: string;
  [key: string]: unknown;
};

export async function getCreatorReviews(
  token: string,
  creatorId: string,
): Promise<CreatorReview[]> {
  const data = await get<unknown>(
    token,
    `/api/reviews/creator/${encodeURIComponent(creatorId)}`,
  );
  return toList<CreatorReview>(data, 'reviews');
}

/** The signed-in user's own record. */
export async function getMe(token: string): Promise<Record<string, unknown>> {
  return get(token, '/api/auth/me');
}

/** The current Creator & Brand Agreement + whether this user has accepted it. */
export async function getAgreement(
  token: string,
): Promise<Record<string, any>> {
  return get(token, '/api/agreement');
}

/** Record acceptance of the current agreement version (stored server-side, so
 *  it also clears the gate on the website). */
export async function acceptAgreement(token: string): Promise<void> {
  await send(token, 'POST', '/api/agreement/accept');
}

/* =========================== Brand settings ============================ */

export async function getBusinessProfile(token: string) {
  return get<Record<string, unknown>>(token, '/api/business/settings/profile');
}

export async function saveBusinessProfile(
  token: string,
  profile: Record<string, unknown>,
) {
  return send(token, 'PUT', '/api/business/settings/profile', profile);
}

export async function getBusinessCompany(token: string) {
  return get<Record<string, unknown>>(token, '/api/business/settings/company');
}

export async function saveBusinessCompany(
  token: string,
  company: Record<string, unknown>,
) {
  return send(token, 'PUT', '/api/business/settings/company', company);
}

/* =============================== Wallet ================================ */

export type Wallet = {
  available_balance: number;
  minimum_chat_balance?: number;
  chat_unlocked?: boolean;
  plan_name?: string;
  /** From the backend's wallet_bonus_tiers(), ascending by amount. */
  bonus_tiers?: Array<Record<string, unknown>>;
  recharge_bonus?: Record<string, unknown>;
  transactions: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

/**
 * Brand wallet balance and ledger.
 *
 * `GET /api/business/wallet` (server.py) returns a real, merged transaction
 * ledger (wallet_ledger + successful payment_transactions + escrow holds/
 * refunds) plus `bonus_tiers`. All of balance, transactions and bonus_tiers
 * are live data — BrandWallet.tsx's empty states only show when a brand
 * genuinely has no history yet, not because the backend omits the fields.
 */
export async function getWallet(token: string): Promise<Wallet> {
  const data = await get<Partial<Wallet>>(token, '/api/business/wallet');
  return {
    ...data,
    available_balance: Number(data?.available_balance || 0),
    minimum_chat_balance: Number(data?.minimum_chat_balance || 0),
    chat_unlocked: Boolean(data?.chat_unlocked),
    transactions: Array.isArray(data?.transactions) ? data.transactions : [],
  };
}

export async function rechargeWallet(token: string, amount: number) {
  return send<WalletPaymentOrder>(token, 'POST', '/api/business/wallet/recharge', { amount, gateway: 'razorpay' });
}

/* ============================== Earnings =============================== */

/** Creator payout summary. */
export async function getPayoutOverview(
  token: string,
): Promise<Record<string, unknown>> {
  return get(token, '/api/payout/overview');
}

export async function getWithdrawalHistory(
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const data = await get<unknown>(token, '/api/withdrawal/history');
  return toList<Record<string, unknown>>(data, 'withdrawals', 'history');
}

/* ================================= KYC ================================= */

export type KycRecord = {
  status?: string;
  name_on_pan?: string;
  pan_number?: string;
  aadhaar_number?: string;
  rejection_reason?: string;
  [key: string]: unknown;
};

/**
 * The signed-in creator's KYC record.
 *
 * Note the path: `/api/kyc/me`. The screen previously called
 * `/api/kyc?user_id=...`, which does not exist on the backend and always 404'd,
 * so the KYC panel silently showed "not submitted" whatever the real status.
 */
export async function getKyc(token: string): Promise<KycRecord> {
  const data = await get<KycRecord | null>(token, '/api/kyc/me');
  return data && typeof data === 'object' ? data : {};
}

export async function submitKyc(
  token: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await send(token, 'POST', '/api/kyc/submit', payload);
}

/* =============================== Reviews =============================== */

/**
 * Reviews left on one user.
 *
 * Reviews are stored on the reviewed user's own document, so the creator and
 * business paths are the same read — `subject` only picks the URL the caller's
 * role expects. Passing no id hits `/api/reviews`, which now returns the
 * signed-in user's own reviews (resolved server-side from the token).
 */
export async function getReviews(
  token: string,
  userId?: string,
  subject: 'creator' | 'business' = 'creator',
): Promise<Array<Record<string, unknown>>> {
  const path = userId
    ? `/api/reviews/${subject}/${encodeURIComponent(userId)}`
    : '/api/reviews';
  const data = await get<unknown>(token, path);
  return toList<Record<string, unknown>>(data, 'reviews');
}

export async function postReview(
  token: string,
  review: Record<string, unknown>,
) {
  return send(token, 'POST', '/api/reviews', review);
}

/* ============================= Shipments =============================== */

export async function getShipment(
  token: string,
  shipmentId: string,
  /** On a multi-creator brief, which hired creator's shipment. */
  creatorId?: string,
): Promise<Record<string, unknown>> {
  const query = creatorId ? `?creator_id=${encodeURIComponent(creatorId)}` : '';
  return get(token, `/api/shipment/${encodeURIComponent(shipmentId)}${query}`);
}

/**
 * Records dispatch against a campaign.
 *
 * ShipmentUpdate requires `tracking_number`, `courier_slip`,
 * `expected_delivery` and `shipment_checklist` — the last two are easy to
 * forget because the web form fills them from its own state. Defaults are
 * supplied for the checklist so a caller that only has tracking details is
 * not rejected with a 422.
 */
export async function updateShipment(
  token: string,
  payload: {
    campaign_id: string;
    tracking_number: string;
    courier_slip: string;
    expected_delivery: string;
    creator_id?: string;
    courier_name?: string;
    shipment_checklist?: Record<string, boolean>;
  },
) {
  return send(token, 'POST', '/api/shipment/update', {
    shipment_checklist: {
      package_sealed: true,
      correct_item: true,
      working_condition: true,
    },
    ...payload,
  });
}

export async function confirmShipmentReceived(
  token: string,
  payload: Record<string, unknown>,
) {
  return send(token, 'POST', '/api/shipment/receive', payload);
}

/** Brand asks the creator to ship a product sample for a deal. */
export async function requestShipment(
  token: string,
  dealId: string,
  payload: Record<string, unknown> = {},
) {
  return send(
    token,
    'POST',
    `/api/deals/${encodeURIComponent(dealId)}/request-shipment`,
    payload,
  );
}

/**
 * Generate a prepaid shipping label DIRECTLY (Delhivery), skipping the admin
 * queue. Same body as request-shipment; returns the AWB + label URL. The
 * creator's delivery address is pulled server-side and never exposed here.
 */
export async function createShipLabel(
  token: string,
  dealId: string,
  payload: Record<string, unknown>,
): Promise<{ tracking_number?: string; label_url?: string; courier_name?: string; status?: string }> {
  return send(
    token,
    'POST',
    `/api/deals/${encodeURIComponent(dealId)}/ship-label`,
    payload,
  ) as Promise<{ tracking_number?: string; label_url?: string; courier_name?: string; status?: string }>;
}

/* ============================ Misc lookups ============================= */

export async function getCategories(
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const data = await get<unknown>(token, '/api/categories');
  return toList<Record<string, unknown>>(data, 'categories');
}

/**
 * Total unread chat messages (and unread action cards), summed server-side by
 * `GET /api/chat/unread-count` (server.py).
 */
export async function getChatUnreadCount(token: string): Promise<number> {
  const data = await get<{ unread_count?: number }>(
    token,
    '/api/chat/unread-count',
  );
  return Number(data?.unread_count || 0);
}

/**
 * Result of a live link probe. The backend answers `{valid:true}`,
 * `{valid:false, reason}` or `{uncertain:true, reason}` — Instagram blocks
 * automated lookups behind a login wall, so "we can't tell" is a real outcome
 * and must not be reported to the user as a failure.
 */
export type LinkProbe = {
  valid?: boolean;
  uncertain?: boolean;
  reason?: string;
  normalized?: string;
};

/**
 * POST /api/validate/website — resolves the host and actually requests the
 * page, so a well-formed-but-fake domain ("asdasd.com") comes back invalid.
 * A network failure resolves to `uncertain` rather than throwing: a flaky
 * phone connection must never block onboarding.
 */
export async function checkWebsiteLive(
  token: string,
  url: string,
): Promise<LinkProbe> {
  try {
    const response = await request(`${BACKEND_URL}/api/validate/website`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      return { uncertain: true, reason: 'unverified' };
    }
    return (await response.json().catch(() => ({}))) as LinkProbe;
  } catch {
    return { uncertain: true, reason: 'unverified' };
  }
}

/**
 * POST /api/validate/instagram — looks the handle up on instagram.com. Returns
 * `{valid:false, reason:'not_found'}` only when Instagram positively says the
 * profile is gone; a login wall comes back as `uncertain`.
 */
export async function checkInstagramLive(
  token: string,
  username: string,
): Promise<LinkProbe> {
  try {
    const response = await request(`${BACKEND_URL}/api/validate/instagram`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ username }),
    });
    if (!response.ok) {
      return { uncertain: true, reason: 'unverified' };
    }
    return (await response.json().catch(() => ({}))) as LinkProbe;
  } catch {
    return { uncertain: true, reason: 'unverified' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Deal Room
//
// The website's deal room (pages/MyDealsPage.js) drives a deal through its
// whole life from one screen. None of it was reachable in the app, so a
// creator who needed to flag damaged goods, answer a revision request or
// dispute an outcome had to leave for the website. Bodies here mirror what
// the web posts, field for field.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Confirms the product arrived.
 *
 * `unboxing_video_url` is REQUIRED by DealReceiptSubmit — the unboxing clip is
 * the evidence the right item turned up undamaged, so the server rejects a
 * receipt without one. Callers must upload the video first.
 */
export async function confirmDealReceipt(
  token: string,
  dealId: string,
  unboxingVideoUrl: string,
  payload: {
    items_damaged?: boolean;
    damage_report?: string | null;
  } = {},
) {
  return send(token, 'POST', `/api/deals/${encodeURIComponent(dealId)}/receipt`, {
    received_at: new Date().toISOString(),
    unboxing_video_url: unboxingVideoUrl,
    items_damaged: false,
    damage_report: null,
    ...payload,
  });
}

/** Reports the product as damaged or wrong. Attachments are photo evidence. */
export async function reportDealDamage(
  token: string,
  dealId: string,
  attachmentUrls: string[],
  message = 'Damaged or wrong product reported by creator',
) {
  return send(
    token,
    'POST',
    `/api/deals/${encodeURIComponent(dealId)}/damage-report`,
    { message, attachment_urls: attachmentUrls },
  );
}

/** Uploads the finished deliverable set against the deal. */
export async function submitDealContent(
  token: string,
  dealId: string,
  payload: {
    video_url: string;
    caption_url?: string;
    thumbnail_url?: string;
    raw_footage_url?: string;
    creator_note?: string;
  },
) {
  return send(token, 'POST', `/api/deals/${encodeURIComponent(dealId)}/content`, {
    creator_note: 'Submitted from the app deal room',
    ...payload,
  });
}

/**
 * Creator's answer to a revision request: accept it (optionally listing which
 * changes) or flag it as out of scope.
 */
export async function respondToRevision(
  token: string,
  dealId: string,
  response: 'accepted' | 'flagged',
  acceptedChanges?: string[],
) {
  return send(
    token,
    'POST',
    `/api/deals/${encodeURIComponent(dealId)}/revision-response`,
    {
      response,
      accepted_changes: acceptedChanges?.length ? acceptedChanges : undefined,
      note:
        response === 'accepted'
          ? acceptedChanges?.length
            ? `Creator accepted these changes: ${acceptedChanges.join('; ')}.`
            : 'Creator accepted the revision request.'
          : 'Creator flagged the revision request from Deal Room.',
    },
  );
}

/** Opens a dispute on the deal. */
export async function raiseDealDispute(
  token: string,
  dealId: string,
  message: string,
  attachmentUrls: string[] = [],
) {
  return send(token, 'POST', `/api/deals/${encodeURIComponent(dealId)}/dispute`, {
    message,
    attachment_urls: attachmentUrls,
  });
}

/** Escalates an existing dispute to the review team. */
export async function escalateDeal(
  token: string,
  dealId: string,
  message: string,
  attachmentUrls: string[] = [],
) {
  return send(token, 'POST', `/api/deals/${encodeURIComponent(dealId)}/escalate`, {
    message,
    attachment_urls: attachmentUrls,
  });
}

/** Hides a finished deal from the active list. */
export async function archiveDeal(token: string, dealId: string) {
  return send(token, 'POST', `/api/deals/${encodeURIComponent(dealId)}/archive`);
}

/** The brand's side of the deal list. */
export async function getBusinessDeals(
  token: string,
): Promise<Record<string, unknown>[]> {
  return toList(await get(token, '/api/deals/business'), 'deals');
}

// ───────────────────────────────────────────────────────────────────────────
// Disputes
// ───────────────────────────────────────────────────────────────────────────

export async function getMyDisputes(
  token: string,
): Promise<Record<string, unknown>[]> {
  return toList(await get(token, '/api/disputes/my'), 'disputes');
}

export async function getDispute(
  token: string,
  disputeId: string,
): Promise<Record<string, unknown>> {
  return get(token, `/api/disputes/${encodeURIComponent(disputeId)}`);
}

/** Adds a statement (and any evidence) to an open dispute. */
export async function respondToDispute(
  token: string,
  disputeId: string,
  message: string,
  evidenceUrls: string[] = [],
) {
  return send(
    token,
    'POST',
    `/api/disputes/${encodeURIComponent(disputeId)}/respond`,
    { message: message.trim(), evidence_urls: evidenceUrls },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Account security — all of these were website-only, so a user could not
// change their password, turn on 2FA or close their account from the app.
// ───────────────────────────────────────────────────────────────────────────

/** Password params ride in the query string, which is what the API expects. */
export async function changePassword(
  token: string,
  oldPassword: string,
  newPassword: string,
) {
  const query = new URLSearchParams({
    old_password: oldPassword,
    new_password: newPassword,
  });
  return send(token, 'POST', `/api/profile/change-password?${query}`);
}

export async function getTwoFactorStatus(
  token: string,
): Promise<{ enabled?: boolean; [key: string]: unknown }> {
  return get(token, '/api/profile/2fa/status');
}

/** Returns the shared secret and its otpauth:// URI for the authenticator app. */
export async function setupTwoFactor(
  token: string,
): Promise<{ secret?: string; otpauth_url?: string; [key: string]: unknown }> {
  // otpauth_url opens the authenticator app with the account already filled in.
  return send(token, 'POST', '/api/profile/2fa/setup');
}

/** Confirms the six-digit code, which is what actually switches 2FA on. */
export async function verifyTwoFactor(token: string, code: string) {
  return send(
    token,
    'POST',
    `/api/profile/2fa/verify?token=${encodeURIComponent(code)}`,
  );
}

export async function disableTwoFactor(token: string, password: string) {
  return send(
    token,
    'POST',
    `/api/profile/2fa/disable?password=${encodeURIComponent(password)}`,
  );
}

export async function deactivateAccount(token: string) {
  return send(token, 'POST', '/api/profile/deactivate');
}

// ───────────────────────────────────────────────────────────────────────────
// Password recovery — a user locked out of the app had no way back in except
// the website. Three steps, same as the web's Auth page.
// ───────────────────────────────────────────────────────────────────────────

/** Unauthenticated POST: these run before there is a session to send. */
async function anon<T>(path: string, body: unknown): Promise<T> {
  return (await json(
    await request(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )) as T;
}

export async function forgotPassword(email: string) {
  return anon<Record<string, unknown>>('/api/auth/forgot-password', { email });
}

export async function verifyResetCode(email: string, code: string) {
  return anon<Record<string, unknown>>('/api/auth/verify-reset-code', {
    email,
    code,
  });
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
) {
  return anon<Record<string, unknown>>('/api/auth/reset-password', {
    email,
    code,
    // ResetPasswordRequest declares this as `password`. Sending
    // `new_password` (the name the change-password route uses) was rejected
    // with a 422, so the last step of recovery always failed.
    password: newPassword,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Brand team, billing and hiring
// ───────────────────────────────────────────────────────────────────────────

export async function getTeam(
  token: string,
): Promise<Record<string, unknown>[]> {
  return toList(await get(token, '/api/business/settings/team'), 'members');
}

export async function inviteTeamMember(
  token: string,
  email: string,
  role: 'admin' | 'member' | 'viewer',
) {
  return send(token, 'POST', '/api/business/settings/team/invite', {
    email,
    role,
  });
}

export async function updateTeamMemberRole(
  token: string,
  memberId: string,
  role: 'admin' | 'member' | 'viewer',
) {
  return send(
    token,
    'PATCH',
    `/api/business/settings/team/${encodeURIComponent(memberId)}`,
    { role },
  );
}

export async function removeTeamMember(token: string, memberId: string) {
  return send(
    token,
    'DELETE',
    `/api/business/settings/team/${encodeURIComponent(memberId)}`,
  );
}

export async function getBilling(
  token: string,
): Promise<Record<string, unknown>> {
  return get(token, '/api/business/settings/billing');
}

export async function saveBilling(
  token: string,
  payload: Record<string, unknown>,
) {
  return send(token, 'PUT', '/api/business/settings/billing', payload);
}

/**
 * The bids placed on one campaign, for the brand's hiring screen.
 *
 * There is no GET /campaigns/{id}/bids — that route 404s. The backend returns
 * the bids nested on the campaign document itself, which is also where the
 * bids screen reads them from.
 */
export async function getCampaignBids(
  token: string,
  campaignId: string,
): Promise<Record<string, unknown>[]> {
  const campaign = await getCampaign(token, campaignId);
  const bids = (campaign as Record<string, unknown>).bids;
  return Array.isArray(bids) ? (bids as Record<string, unknown>[]) : [];
}

/**
 * Brand confirms (or requests changes to) a UGC.ad-written script. The brief
 * parks at awaiting_brand_confirmation after admin approval; confirming
 * publishes it to creators, requesting changes sends it back to the admin
 * queue with the brand's note.
 */
export async function confirmScript(
  token: string,
  campaignId: string,
  action: 'confirm' | 'request_changes',
  note?: string,
): Promise<{ message?: string; status?: string }> {
  return send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/script-confirmation`,
    { action, note },
  ) as Promise<{ message?: string; status?: string }>;
}

/** Publish a draft campaign: submits it for admin approval. */
export async function submitCampaign(
  token: string,
  campaignId: string,
): Promise<{ message?: string; status?: string }> {
  return send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/submit`,
  ) as Promise<{ message?: string; status?: string }>;
}

/** Admin-curated creator shortlist for a campaign. */
export async function getShortlist(
  token: string,
  campaignId: string,
): Promise<Record<string, unknown>[]> {
  return toList(
    await get(
      token,
      `/api/campaigns/${encodeURIComponent(campaignId)}/shortlist`,
    ),
    'shortlist',
    'creators',
  );
}

export async function inviteShortlistedCreator(
  token: string,
  campaignId: string,
  creatorId: string,
) {
  return send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(
      campaignId,
    )}/shortlist/${encodeURIComponent(creatorId)}/invite`,
  );
}

export async function requestNewShortlist(token: string, campaignId: string) {
  return send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/shortlist/request-new`,
  );
}

/**
 * Closes hiring early. A brief normally stays open until `creators_wanted`
 * creators are picked; this settles for however many are on board.
 */
export async function finishHiring(token: string, campaignId: string) {
  return send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/finish-hiring`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Reviews, reporting and payouts
// ───────────────────────────────────────────────────────────────────────────

/** Ratings a business has received, for the creator's view of a brand. */
export async function getBusinessReviews(
  token: string,
  businessId: string,
): Promise<Record<string, unknown>[]> {
  return toList(
    await get(token, `/api/reviews/business/${encodeURIComponent(businessId)}`),
    'reviews',
  );
}

/** Flags a user to the moderation team. */
export async function reportUser(
  token: string,
  payload: { reported_user_id: string; reason: string; details?: string },
) {
  return send(token, 'POST', '/api/report-user', payload);
}

/** Policy strikes on the current account, shown on Privacy & Security. */
export async function getChatWarnings(
  token: string,
): Promise<Record<string, unknown>> {
  return get(token, '/api/chat/warnings');
}

/** Settled payout receipts, for the Earnings history. */
export async function getPayoutReceipts(
  token: string,
): Promise<Record<string, unknown>[]> {
  return toList(await get(token, '/api/payouts/receipts'), 'receipts');
}

/** Bank / UPI details a withdrawal pays out to. */
export async function savePaymentInfo(
  token: string,
  payload: Record<string, unknown>,
) {
  return send(token, 'PUT', '/api/profile/payment-info', payload);
}

/**
 * Creator privacy switches (public profile, show earnings, allow DMs).
 *
 * They live on the user record and are written through the same
 * /profile/preferences endpoint the notification prefs use — the app had them
 * marked "Coming soon" on the strength of a comment saying no endpoint
 * existed, but the website has been saving them here all along.
 */
export type PrivacyPrefs = {
  public_profile?: boolean;
  show_earnings?: boolean;
  allow_direct_messages?: boolean;
};

export async function getPrivacyPrefs(token: string): Promise<PrivacyPrefs> {
  const me = (await get<Record<string, unknown>>(token, '/api/auth/me')) || {};
  return ((me as any).privacy || {}) as PrivacyPrefs;
}

export async function savePrivacyPrefs(
  token: string,
  privacy: PrivacyPrefs,
): Promise<void> {
  await send(token, 'PUT', '/api/profile/preferences', { privacy });
}

export type WalletPaymentOrder = {
  gateway: string;
  order_id: string;
  key_id?: string;
  amount: number;
  currency: string;
};
export type WalletPaymentResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
export function verifyWalletPayment(token: string, result: WalletPaymentResult) {
  return send<{ success: boolean }>(token, 'POST', '/api/payments/verify', result);
}
