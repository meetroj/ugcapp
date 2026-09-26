# App ↔ Website functional parity — audit & plan

Audited: `C:\Users\meetr\Frontend` (live website, `www.ugcad.io`) vs
`C:\Users\meetr\Desktop\ugcapp` (native shell) vs
`C:\Users\meetr\Desktop\ugc-b\Backend\server.py` (live Python backend).

**Ground rule: no UI/visual redesign.** Every gap below is closed by adding
behaviour to the *existing* native screens, in the app's existing design
language. Nothing on the website changes.

**Key finding:** every endpoint the app is missing already exists and is live in
`server.py`. All gaps are app-side only — no backend work required.

---

## How the app is wired today

`App.tsx` → native Splash / Auth / ProfileSetup / ApprovalGate → `WebShell.tsx`.

`WebShell` is a hybrid router: it matches the current *path* against ~30 native
screens and renders the WebView (`https://www.ugcad.io`) for anything that
doesn't match. So a path the native table doesn't know about silently drops the
user onto the desktop website inside the app. That is the root cause of most of
the "sync" complaints.

---

## A. Routing mismatches (highest impact, lowest effort)

The website navigates to a path; the app's native table listens on a *different*
path; the user gets the desktop site instead of the native screen.

| Website path (what nav/links use) | App native path | Result today |
| --- | --- | --- |
| `/saved` (creator nav "Saved") | `/saved-briefs` | WebView |
| `/profile` (creator "My Profile") | `/app/profile` | WebView |
| `/dashboard/business/creator/:id` (BrandCampaignDetail, BrandCreators, BrandReviewsPage) | `/creator/:id` | WebView |
| `/dashboard/business/reviews` (brand nav "Reviews") | `/reviews` | WebView |
| `/chat/:userId` | `/messages/:id` | WebView |
| `/messages?conv=<id>` (BusinessDashboard, MyBids, CampaignDetails) | `/messages/:id` | Opens the **list**, ignores the thread |
| `/my-deals?campaign=<id>` (notification deep links) | `/my-deals` | Opens the **list**, ignores the deal |
| `/notifications` | *(bell overlay only)* | WebView |
| `/campaign/:id` (SavedBriefs, BusinessDashboard) | — | WebView |
| `/work/submit?campaign=<id>` (MyActiveWork "Submit work") | *(inside DealDetails only)* | WebView |
| `/shipment?campaign=<id>` | `/shipment/:id` | WebView |

**Fix:** extend `normalizePath()` in `WebShell.tsx` to rewrite all of these onto
the native equivalents, and make the native screens read the query params
(`?conv=`, `?campaign=`, `?deal=`) they currently discard. One file, no new UI.

---

## B. Screens with no native equivalent at all

| Website page | Role | Status in app |
| --- | --- | --- |
| `DisputeDetailPage` (`/disputes/:id`) | both | WebView — no native screen |
| `PortfolioPage` (`/portfolio`, 880 lines) | creator | Partial, folded into CreatorSettings |
| `SavedCreators` (`/dashboard/business/saved-creators`) | brand | WebView, not in any native menu |
| Sent Briefs (`/dashboard/business/sent-briefs`) | brand | WebView, not in any native menu |
| `BrandOverview` (`/brand-home`) | brand | WebView |
| `NotificationsPage` (`/notifications`) | both | WebView (bell overlay is not the same page) |
| `WorkReview` (`/work-review/:id`) | brand | WebView |
| `TeamAccept` (`/team/accept`) | brand | WebView (acceptable — email deep link) |

---

## C. Native screens that exist but are missing actions

### C1. Creator Deal Room — the biggest gap

`src/screens/DealDetails.tsx` (1541 lines) is read-only plus submit-work.
`pages/MyDealsPage.js` (1949 lines) additionally does:

- `POST /deals/{id}/content` — upload deliverable content
- `POST /deals/{id}/request-revision` and `/revision-response`
- `POST /deals/{id}/dispute` and `/escalate`
- `POST /deals/{id}/damage-report`
- `POST /deals/{id}/receipt`
- `POST /deals/{id}/archive`
- `POST /deals/{id}/action-card`, `POST /deals/{id}/chat`
- `POST /reviews` + `GET /reviews/business/{id}` — rate the brand
- `GET /campaigns/{id}` for the full brief

None of these are in `api.ts` or reachable natively.

### C2. KYC is a dead end

`KycSubmit.tsx` validates PAN/Aadhaar then **tells the user to finish on the
website** and never POSTs. Its header comment says the app has no image picker —
that is now stale: `react-native-image-picker` is installed and already used by
`DealDetails`, `CreatorProfile`, `CreatorSettings`. Wire `POST /api/kyc/submit`
with the three document uploads via `uploadMedia()`.

### C3. Chat can't send attachments

`BrandChatThread.tsx` renders `attachment_urls` but has no compose-side upload
("needs a native file picker, which this build doesn't have" — also stale).
Also missing vs `MessagesPage.js`: `POST /report-user`, `GET /chat/warnings`,
`POST /chat/{id}/typing`.

### C4. Brand campaign detail is read-only

`BrandCampaignDetail.tsx` shows the campaign. `pages/BrandCampaignDetail.js`
also does: `select-creator`, `finish-hiring`, `shortlist` +
`shortlist/{id}/invite` + `shortlist/request-new`, `work/{id}/approve`,
`work/{id}/request-revision`, `work/{id}/download`, `POST /reviews`,
`GET /deals/business`.

### C5. Brand work review is half-wired

`BrandWorkReview.tsx` has approve only. Web also has `request-revision`,
`work/{id}/download`, and `POST /reviews` after approval.
(`requestWorkRevision` exists in `api.ts` but is only used by the separate
`WorkRevisionRequest` screen.)

### C6. Shipments are read-only

`BrandShipments` / `BrandShipmentDetail` call `getShipment` only.
`ShipmentTracking.js` also does `POST /shipment/update`, `POST /shipment/receive`,
`POST /deals/{id}/request-shipment`. `api.ts` already has all three functions —
they are simply never called from a screen.

### C7. Earnings ignores the payout API

`Earnings.tsx` derives figures from `getMe` + `getMyDeals`. The website's
`PayoutWithLayout` / `WithdrawalPage` use `GET /payout/overview`,
`GET /payouts/receipts`, `PUT /profile/payment-info` (bank details).
`getPayoutOverview` exists in `api.ts` and is never called.

### C8. Settings is missing most of the website's tabs

Website `ProfileSettings.js` (2074 lines):

- Brand tabs: Profile, Company, **Team Members**, **Billing**, **Notifications**, **Privacy & Security**, Follow Us
- Creator tabs: Profile, **Notifications**, **Privacy & Security**, Follow Us

App `BrandSettings.tsx` has Profile + Company only. Missing across both roles:
`change-password`, `2fa/status|setup|verify|disable`, `deactivate`,
`profile/banner`, `profile/preferences`, `business/settings/team*`,
`business/settings/billing`, `business/settings/logo`.

### C9. Auth has no password recovery

`LoginScreen` / `AuthFlow` have no Forgot Password. Website `Auth.js` uses
`/auth/forgot-password`, `/auth/verify-reset-code`, `/auth/reset-password`, and
passes `totp_token` on login for 2FA accounts. A user who forgets their password
cannot recover it in the app at all.

---

## Deliberate, keep as-is

- **Wallet recharge** (`/dashboard/business/wallet?amount=`) intentionally falls
  through to the web checkout — the Razorpay SDK is not bundled in the app.
- **Admin dashboard** — the app has no admin role; all `/dashboard/admin/*`
  routes stay on the web.

---

## Status — 26 Sep 2026

Everything below is on branch `app-web-sync`.

**Done**

- Routing sync (section A), all rewrites plus in-WebView link normalisation
- Brief form: `creators_wanted`, `product_type_detail`, `cta_link`,
  `edited_by`, `script_provider`/`script_text`, 20% commission, error popup,
  hashtag space bar, niche/city/level lists
- Deal Room (C1): receipt, damage report, revision response, dispute,
  escalate, archive
- KYC (C2): real submission with the three document uploads
- Chat (C3): attachment upload, report user
- Brand work review (C5): rate the creator after approval
- Shipments (C6): add/update tracking
- Settings (C8, partial): change password, 2FA, deactivate, privacy switches
- Auth (C9): forgot password, reset, TOTP on login
- Finish hiring, and slot counts on the bids screen

**Not done**

- Brand team members and billing tabs — `api.ts` has `getTeam`,
  `inviteTeamMember`, `updateTeamMemberRole`, `removeTeamMember`, `getBilling`,
  `saveBilling`; no screen calls them yet
- Admin-curated shortlist on the campaign detail (`getShortlist`,
  `inviteShortlistedCreator`, `requestNewShortlist` are in `api.ts`, unused)
- Disputes screen (`getMyDisputes`, `getDispute`, `respondToDispute` in
  `api.ts`, unused) — disputes can be *raised* from the Deal Room, but the
  detail/respond view is still WebView
- Saved Creators, Sent Briefs, standalone Portfolio, Brand Overview
- `image_url` / `mood_images` on the brief (optional cover art)
- Payout receipts list (`getPayoutReceipts` in `api.ts`, unused)

**Verified**: `tsc --noEmit` clean, 91/91 jest tests pass, release APK builds
and runs on the emulator. Not verified end-to-end against a live account —
that needs brand and creator logins.

## Proposed phases

Ordered by user impact per unit of work.

**Phase 1 — routing sync (small, unblocks the most)**
Extend `normalizePath()` for every row in section A; teach `MyDeals`,
`BrandMessages` and `SavedBriefs` to honour their query params; add a native
`/notifications` route reusing the existing `NotificationFeed`.

**Phase 2 — finish the half-wired screens (no new screens)**
C6 shipments, C5 brand work review, C7 earnings, C2 KYC submit. All four are
"call the `api.ts` function that already exists from the screen that already
exists".

**Phase 3 — Deal Room parity (C1)**
Add the ~10 deal endpoints to `api.ts` and surface them as actions on the
existing `DealDetails` tabs. Largest single chunk.

**Phase 4 — brand hiring flow (C4) + chat (C3)**
Shortlist / select-creator / finish-hiring on `BrandCampaignDetail`; attachment
upload, report-user and warnings in `BrandChatThread`.

**Phase 5 — settings & auth (C8, C9)**
Password change, 2FA, deactivate, notification prefs, team members, billing,
banner/logo upload; forgot-password flow and TOTP on login.

**Phase 6 — remaining missing screens (B)**
Disputes, Saved Creators, Sent Briefs, standalone Portfolio.
