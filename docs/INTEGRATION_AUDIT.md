# End-to-end integration audit — 26 Sep 2026

Every result below came from a request that was actually sent. Nothing here
is inferred from reading code; where a flow could not be exercised it is
marked BLOCKED with the reason.

---

## 1. Architecture

```
  Website (React, CRA)                Native app (React Native 0.87)
  C:\Users\meetr\Frontend             C:\Users\meetr\Desktop\ugcapp
  -> Vercel, auto-deploys on push     -> Play Store, NO OTA: needs an AAB
         |                                        |
         |                            native screens ~30 routes
         |                            WebView fallback for the rest
         |                                        |
         +----------------+-----------------------+
                          |
              https://backend-chq9.onrender.com
              FastAPI, Backend/server.py (~820 KB)
              -> Render, auto-deploys from main
                          |
                  MongoDB Atlas, db "test_database"
```

The app is a hybrid shell, not a separate client: it renders native screens
for the paths it knows and loads the website in a WebView for everything
else. Both clients call one API, so "in sync" reduces to whether a write
from one side reads back correctly on the other.

### Commands

```bash
# Backend  (Python 3.11, deps already installed)
cd Backend && python -m uvicorn server:app --port 8000
# against an isolated database instead of production:
DB_NAME=qa_audit_db python -m uvicorn server:app --port 8099

# Website
cd Frontend && npm start          # CRA on :3000

# App
cd ugcapp && npx react-native start          # Metro (needs a TTY)
cd ugcapp/android && ./gradlew assembleRelease   # no Metro needed
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Test environment

Production could not be used for write tests: a brand is gated behind admin
approval and a funded wallet, and there is no admin credential here. The
audit therefore ran the real backend locally against a **new database
`qa_audit_db`** on the same Atlas cluster — isolated collections, production
`test_database` untouched. Two accounts were created through the real signup
endpoint; approval, wallet balance, campaign approval and KYC status were set
directly in that database, because those are correct product gates that
should not be weakened in code. Everything after the gates is real HTTP.

---

## 2. Test matrix — Website ↔ Backend ↔ App

| # | Flow | Result | Evidence |
| --- | --- | --- | --- |
| A1 | Brand publishes a brief (app payload) | PASS | `POST /api/campaigns` 200 |
| A2 | Creator sees it on the public board | PASS | present in `GET /api/campaigns` |
| A3 | `creators_wanted` survives to the creator | PASS | 3 → 3 |
| A4 | `cta_link` survives to the creator | PASS | url intact |
| A5 | Budget matches what the brand set | PASS | 1500 → 1500 |
| B1 | Creator places a bid | PASS | `POST /campaigns/{id}/bid` 200 |
| B2 | Bid on the creator's own list | PASS | nested `my_bid.campaign_id` matches |
| B2b | Bid row still carries the brief's fields | PASS | `creators_wanted`, `cta_link` intact |
| B3 | Brand sees the bid on its campaign | PASS | 1 bid |
| C1 | Brand hires the creator | PASS | escrow held |
| C2 | Creator sees the deal | PASS | `GET /deals/my` |
| C3 | Brand sees the same deal | PASS | `GET /deals/business` |
| C4 | Both agree on the deal id | PASS | DEAL-8183 both sides |
| C5 | 1 of 3 hired leaves the brief open | PASS | `creators_wanted`=3, 1 selected |
| D1 | Creator sends a message | PASS | 200 |
| D2 | Brand reads it in the thread | PASS | body present |
| D3 | Thread in the conversation list | PASS | 1 conversation |

**17/17 PASS.** Both directions verified for briefs, bids, deals and chat.

### Authorization

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| Z1 | Creator cannot edit the brand's campaign | PASS | 403 |
| Z2 | Brand profile does not expose email to a creator | **FAIL → fixed → PASS** | see issue 3 |
| Z3 | Unauthenticated protected route refused | PASS | 403 |
| Z4 | Creator cannot read brand-only work review | PASS | 403 |
| Z5 | Brand cannot reach an admin route | PASS | 403 |

---

## 3. Endpoints exercised

33 probed, **33 PASS**. A route that exists and accepts the body counts as a
pass even when a business rule then refuses it — a 403 "already approved"
still proves the app is calling something real with a shape the server
understands. 404 (route absent) and 422 (body rejected) are the failures.

Covered: 2FA status/setup/verify/disable, change-password, privacy
preferences, forgot-password, verify-reset-code, reset-password, KYC read and
submit, deal receipt / damage-report / revision-response / dispute / escalate
/ archive / content, disputes list, chat send with attachments, report-user,
chat warnings, unread count, shipment update, finish-hiring, campaign bids,
shortlist, team, billing, business reviews, payout overview, payout receipts,
payment info.

### Could not be exercised

| Area | Status | Blocker |
| --- | --- | --- |
| Admin dashboard (~80 endpoints) | BLOCKED | No admin credential. The app has no admin role, so this is out of the app's scope. |
| Wallet recharge / Razorpay | BLOCKED | Needs a live payment gateway. Deliberately left on the website. |
| Push notifications, email delivery | BLOCKED | Needs Resend + device tokens. |
| Real file upload to Cloudinary | BLOCKED | Quota is near-exhausted; URLs were used in place of binaries. |
| App UI driven by hand on a device | BLOCKED | No brand/creator login for the production app. API layer verified instead. |

---

## 4. Issues found and fixed

**1 — `product_type`, `product_type_detail`, `cta_link` silently dropped.**
Severity: high (data loss, both clients).
Root cause: none of the three campaign models declared them, so Pydantic
discarded them on every create, draft and update. Both clients had been
sending them since the brief wizard shipped.
Files: `Backend/campaign_models.py`.
Verified: round trip went 9/11 → **11/11**.

**2 — App dropped six brief fields / wrong keys.** Severity: high.
`creators_wanted` (every app brief became single-creator, and the escrow maths
followed), `product_type_other` instead of `product_type_detail`, plus
`cta_link`, `edited_by`, `script_provider`, `script_text` absent. Commission
was quoted at 25% against the backend's 20%.
Files: `src/screens/BrandPostBrief.tsx`.
Verified: C5 shows a 3-creator brief staying open after one hire.

**3 — Any creator could read any user's email.** Severity: medium (PII).
Root cause: `strip_private_fields` only removed `email` when the requester was
a *business*, so a creator calling `GET /api/profile/{id}` with someone else's
id received it. That defeats the social-link hiding directly above it.
Files: `Backend/server.py`.
Verified: Z2 FAIL → PASS, `email_present=False`.

**4 — `resetPassword` sent the wrong field name.** Severity: high.
`new_password` vs the declared `password` → 422 every time. The password
recovery feature could never have completed.
Files: `src/api.ts`. Verified: endpoint probe now accepted.

**5 — `confirmDealReceipt` omitted a required field.** Severity: high.
`unboxing_video_url` is mandatory. Confirm receipt 422'd. The flow now uploads
the clip as part of confirming. Also fixed a `submitting` flag that
`pickAndUpload` raised and never lowered, which left Submit disabled.
Files: `src/api.ts`, `src/screens/DealDetails.tsx`.

**6 — `updateShipment` omitted two required fields.** Severity: high.
`courier_slip` and `shipment_checklist`. The editor now uploads the slip and
keeps Save disabled until the request would be accepted.
Files: `src/api.ts`, `src/screens/BrandShipmentDetail.tsx`.

**7 — `getCampaignBids` called a route that does not exist.** Severity: low
(no screen used it yet). `GET /campaigns/{id}/bids` 404s; bids are nested on
the campaign. Files: `src/api.ts`.

---

## 5. Builds and automated checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` (app) | PASS, clean |
| `jest` (app) | PASS, 100/100 across 19 suites |
| New contract tests | PASS, 9/9 (`__tests__/apiContracts.test.ts`) |
| `./gradlew assembleRelease` | PASS, signed APK 75 MB |
| App launches on emulator | PASS, renders against the live backend |

`CreatorPeek` and `AuthFlow` intermittently fail in a full parallel run with
"Cannot log after tests are done" — a pre-existing async-teardown leak,
aggravated by machine load. Both pass in isolation and a rerun gives 100/100.
Not caused by this work, but worth cleaning up.

---

## 6. Verdict

**Verified working.** Brief create → publish → browse → bid → hire → deal →
chat, in both directions, with field-level checks at each hop. Authorization
boundaries hold across roles, ownership and anonymous access. All 33
endpoints the app calls exist and accept the bodies it sends.

**Fixed during the audit.** Seven issues — two backend, five app. Each was
re-tested after the fix and the result recorded above.

**Still unverified.** The app's *user interface* has not been driven by hand
through these flows on a device; the API layer beneath it has. Closing that
needs a brand and a creator login for the production app. Admin, payments,
push and email remain BLOCKED for the reasons in section 3.

**Not production-ready until shipped.** The backend fix is live (Render
auto-deploys from `main`). The app fixes are on `app-web-sync` and reach
nobody until the branch is merged, `versionCode` is bumped from 11 to 12, and
an AAB is uploaded — there is no OTA channel in this project.
