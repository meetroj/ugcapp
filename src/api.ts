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
  : 'https://backend-chq9.onrender.com';

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

async function authRequest(
  path: '/auth/login' | '/auth/signup' | '/auth/google',
  body: Record<string, string>,
): Promise<AuthUser> {
  const response = await request(`${BACKEND_URL}/api${path}`, {
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
    throw new Error('Two-factor authentication must be completed on ugcad.io.');
  }
  if (!data.token) {
    throw new Error('The backend returned an invalid authentication response.');
  }

  return data as AuthUser;
}

export function login(email: string, password: string) {
  return authRequest('/auth/login', { email: email.trim(), password });
}

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
export function signUp(
  role: 'creator' | 'brand',
  email: string,
  password: string,
  phone: string,
) {
  return authRequest('/auth/signup', {
    email: email.trim(),
    password,
    phone: phone.trim(),
    dial_code: SIGNUP_DIAL_CODE,
    role: role === 'brand' ? 'business' : 'creator',
  });
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
) {
  return authRequest('/auth/google', {
    credential,
    role: role === 'brand' ? 'business' : 'creator',
  });
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
 * Chat. Threads come from the live Node backend's chatController:
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
 * Mirrors Message.ACTION_CARD_TYPES in the Node backend.
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
): Promise<void> {
  await json(
    await request(`${BACKEND_URL}/api/chat/send`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ recipient_id: recipientId, message }),
    }),
  );
}

/**
 * Deals. `GET /api/deals/my` returns the signed-in party's deals already
 * serialized for their side (see utils/dealStateMachine.serializeDeal).
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
 * Creator profile editing. The live Node backend has no granular
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
 * Withdrawal. NOTE: `POST /api/withdrawal/request` is a stub on the backend —
 * its KYC gate is real and enforced, but it ignores the amount and creates no
 * payout record. It is called here so the flow stays in-app and the KYC
 * rejection surfaces natively.
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
};

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

  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.fileName || fallbackName,
    type: file.type || fallbackType,
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
  const url = String(
    data.photo_url || data.banner || data.file_url || data.url || '',
  );
  // A 2xx carrying no URL used to return the empty string, which every caller
  // then stored as a perfectly valid "uploaded" value — the spinner stopped and
  // nothing else happened. Fail loudly instead.
  if (!url) {
    throw new Error('Upload finished but the server returned no file URL.');
  }
  return url;
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
  return { ...c, id: String(c.id || c._id || '') } as Campaign;
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
  await send(
    token,
    'POST',
    `/api/campaigns/${encodeURIComponent(campaignId)}/select-creator`,
    { creator_id: creatorId },
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

/** Submissions against one campaign. */
export async function getCampaignWork(
  token: string,
  campaignId: string,
): Promise<WorkSubmission[]> {
  const data = await get<unknown>(
    token,
    `/api/work/campaign/${encodeURIComponent(campaignId)}`,
  );
  return toList<WorkSubmission>(data, 'submissions');
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
 * Note what the live backend actually sends (controllers/authController.js →
 * getWallet): `recharge_bonus` and `transactions` are hardcoded to `{}` / `[]`,
 * and it emits no `bonus_tiers` at all. So the balance and the chat-unlock gate
 * are real, while the transaction list and bonus tiers render empty until the
 * backend fills them in — the screen degrades to its empty states rather than
 * inventing rows.
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
  return send(token, 'POST', '/api/business/wallet/recharge', { amount });
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
 * role expects. Passing no id hits `/api/reviews`, which the backend currently
 * stubs out with an empty array.
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
): Promise<Record<string, unknown>> {
  return get(token, `/api/shipment/${encodeURIComponent(shipmentId)}`);
}

export async function updateShipment(
  token: string,
  payload: Record<string, unknown>,
) {
  return send(token, 'POST', '/api/shipment/update', payload);
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

/* ============================ Misc lookups ============================= */

export async function getCategories(
  token: string,
): Promise<Array<Record<string, unknown>>> {
  const data = await get<unknown>(token, '/api/categories');
  return toList<Record<string, unknown>>(data, 'categories');
}

/**
 * Total unread chat messages, summed across threads.
 *
 * There is no `/api/chat/unread-count` endpoint: that path falls through to the
 * `/api/chat/:otherId` wildcard, which treats "unread-count" as a user id and
 * answers `[]`. Reading `.unread_count` off that array yielded 0 forever, so
 * the chat badge never appeared. The per-thread counts on the conversations
 * list are the real source.
 */
export async function getChatUnreadCount(token: string): Promise<number> {
  const conversations = await getConversations(token);
  return conversations.reduce(
    (total, thread) => total + Number(thread.unread_count || 0),
    0,
  );
}
