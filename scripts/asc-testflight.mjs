// Fills in TestFlight + App Store metadata for the latest uploaded build and
// opens it to testers. Run after scripts/ios-release.sh has uploaded a build
// (ios-release.sh calls this itself unless SKIP_UPLOAD=1).
//
//   node scripts/asc-testflight.mjs [buildNumber]
//
// Env (all optional, defaults below): ASC_KEY_ID, ASC_ISSUER_ID,
//   BETA_CONTACT_FIRST, BETA_CONTACT_LAST, BETA_CONTACT_EMAIL, BETA_CONTACT_PHONE,
//   DEMO_ACCOUNT_USER, DEMO_ACCOUNT_PASS
// External beta review needs a contact phone and a demo login; without them
// the build is still shared with the internal group and a public link is made,
// and the review submission is skipped with a message.
import fs from 'node:fs'; import os from 'node:os'; import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BUNDLE_ID = 'io.ugcad.app';
const kid = process.env.ASC_KEY_ID || 'F8R2VL5ARJ';
const iss = process.env.ASC_ISSUER_ID || 'cf6cea60-e843-4c8c-bb15-d38350fe10c4';
const keyPath = `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${kid}.p8`;
const root = `${import.meta.dirname}/..`;

const META = {
  name: 'UGCad',
  subtitle: 'Creators and brands, one app',  // max 30 chars
  description: `UGCad connects brands with content creators for user-generated content (UGC) campaigns, from the first brief to the final payout.

FOR BRANDS
- Post a campaign brief with your budget, deliverables and timeline
- Browse creator profiles, portfolios and reviews
- Receive bids, compare creators and hire in a few taps
- Ship products, review submitted work and request revisions
- Chat with creators inside the app
- Fund campaigns from your wallet and track spend

FOR CREATORS
- Discover campaigns that match your niche
- Bid on briefs and negotiate deals
- Track active work, shipments and revision requests
- Get paid to your bank account through KYC-verified withdrawals
- Build a public profile with reviews from past brands

UGCad is the same account and data as ugcad.io, so you can move between the website and the app freely.`,
  keywords: 'ugc,creator,brand,influencer,campaign,content,marketing,collab,freelance,video',
  promotionalText: 'Hire creators or find paid UGC campaigns. Briefs, bids, chat, shipments and payouts in one place.',
  supportUrl: 'https://www.ugcad.io',
  marketingUrl: 'https://www.ugcad.io',
  privacyPolicyUrl: 'https://www.ugcad.io/privacy',
  feedbackEmail: 'support@ugcad.io',
  whatsNew: 'First iOS release of UGCad: native sign-in and onboarding, campaigns, bids, chat, shipments, wallet and payouts.',
  betaDescription: 'UGCad lets brands post UGC campaign briefs and hire creators, and lets creators find paid campaigns, submit work and get paid. Please test sign-up, onboarding, browsing campaigns or creators, bidding, chat and the wallet screens, and report anything that looks wrong.',
  reviewNotes: 'UGCad is a marketplace for user-generated content. Log in with the demo account, or create a new account: choose Brand or Creator, then complete the short onboarding. Brands land on the creator directory; creators land on the campaign feed. Google sign-in is available but email and password is sufficient for review.',
  contact: {
    firstName: process.env.BETA_CONTACT_FIRST || 'Akshay',
    lastName: process.env.BETA_CONTACT_LAST || 'Shukla',
    email: process.env.BETA_CONTACT_EMAIL || 'ugcad.io@gmail.com',
    phone: process.env.BETA_CONTACT_PHONE || '+917999621130',
  },
  demo: { user: process.env.DEMO_ACCOUNT_USER || '', pass: process.env.DEMO_ACCOUNT_PASS || '' },
};

// ---- API plumbing ----------------------------------------------------------
const b64 = b => Buffer.from(b).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const msg = b64(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })) + '.' +
    b64(JSON.stringify({ iss, aud: 'appstoreconnect-v1', iat: now, exp: now + 1100 }));
  const sig = crypto.sign('sha256', Buffer.from(msg), { key: fs.readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return msg + '.' + b64(sig);
}
async function api(method, path, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text(); const json = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(json.errors?.[0] || json).slice(0, 400)}`);
  return json;
}
const get = p => api('GET', p), post = (p, b) => api('POST', p, b), patch = (p, b) => api('PATCH', p, b);
const step = async (label, fn) => { try { const v = await fn(); console.log(`ok   ${label}`); return v; } catch (e) { console.log(`skip ${label}: ${e.message}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- locate app + build ----------------------------------------------------
const apps = await get(`/v1/apps?filter[bundleId]=${BUNDLE_ID}&fields[apps]=name,bundleId,primaryLocale`);
if (!apps.data.length) { console.error(`No App Store Connect app record for ${BUNDLE_ID}. Create it in My Apps first.`); process.exit(2); }
const app = apps.data[0]; const appId = app.id;
// Localizations must target the record's primary locale, or the primary one stays empty.
const LOCALE = app.attributes.primaryLocale || 'en-US';
console.log(`app  ${app.attributes.name} (${appId})`);

const version = execSync("grep -m1 MARKETING_VERSION ios/ugcapp.xcodeproj/project.pbxproj | sed -E 's/.*= *([0-9.]+);/\\1/'", { cwd: root }).toString().trim();
const wantBuild = process.argv[2];
let build;
for (let i = 0; i < 60; i++) {
  const q = `/v1/builds?filter[app]=${appId}&filter[preReleaseVersion.version]=${version}` + (wantBuild ? `&filter[version]=${wantBuild}` : '') + '&sort=-uploadedDate&limit=1';
  const r = await get(q); build = r.data[0];
  if (build && build.attributes.processingState === 'VALID') break;
  console.log(`wait build ${build ? build.attributes.version + ' ' + build.attributes.processingState : 'not visible yet'} (${i + 1}/60)`);
  await sleep(30000);
}
if (!build || build.attributes.processingState !== 'VALID') { console.error('Build never became VALID; check App Store Connect for processing errors.'); process.exit(3); }
const buildId = build.id;
console.log(`build ${version} (${build.attributes.version}) ${buildId}`);

// ---- build-level details ---------------------------------------------------
if (build.attributes.usesNonExemptEncryption == null) await step('export compliance on build', () => patch(`/v1/builds/${buildId}`, { data: { type: 'builds', id: buildId, attributes: { usesNonExemptEncryption: false } } }));
else console.log(`ok   export compliance already ${build.attributes.usesNonExemptEncryption} (from Info.plist)`);
await step('what to test', async () => {
  const locs = await get(`/v1/builds/${buildId}/betaBuildLocalizations`);
  const loc = locs.data.find(l => l.attributes.locale === LOCALE);
  return loc
    ? patch(`/v1/betaBuildLocalizations/${loc.id}`, { data: { type: 'betaBuildLocalizations', id: loc.id, attributes: { whatsNew: META.whatsNew } } })
    : post('/v1/betaBuildLocalizations', { data: { type: 'betaBuildLocalizations', attributes: { locale: LOCALE, whatsNew: META.whatsNew }, relationships: { build: { data: { type: 'builds', id: buildId } } } } });
});

// ---- TestFlight app-level details -----------------------------------------
await step('beta app description + feedback email', async () => {
  const locs = await get(`/v1/apps/${appId}/betaAppLocalizations`);
  const attrs = { description: META.betaDescription, feedbackEmail: META.feedbackEmail, marketingUrl: META.marketingUrl, privacyPolicyUrl: META.privacyPolicyUrl };
  const loc = locs.data.find(l => l.attributes.locale === LOCALE);
  return loc
    ? patch(`/v1/betaAppLocalizations/${loc.id}`, { data: { type: 'betaAppLocalizations', id: loc.id, attributes: attrs } })
    : post('/v1/betaAppLocalizations', { data: { type: 'betaAppLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { app: { data: { type: 'apps', id: appId } } } } });
});
await step('beta review contact + demo account', async () => {
  const d = await get(`/v1/apps/${appId}/betaAppReviewDetail`);
  const attrs = {
    contactFirstName: META.contact.firstName, contactLastName: META.contact.lastName, contactEmail: META.contact.email,
    ...(META.contact.phone ? { contactPhone: META.contact.phone } : {}),
    demoAccountRequired: true,
    ...(META.demo.user ? { demoAccountName: META.demo.user, demoAccountPassword: META.demo.pass } : {}),
    notes: META.reviewNotes,
  };
  return patch(`/v1/betaAppReviewDetails/${d.data.id}`, { data: { type: 'betaAppReviewDetails', id: d.data.id, attributes: attrs } });
});

// ---- App Store listing (so the record is not empty when you submit) --------
await step('app info: privacy policy url', async () => {
  const infos = await get(`/v1/apps/${appId}/appInfos?include=appInfoLocalizations`);
  const info = infos.data[0];
  const loc = (infos.included || []).find(l => l.type === 'appInfoLocalizations' && l.attributes.locale === LOCALE);
  const attrs = { name: META.name, subtitle: META.subtitle, privacyPolicyUrl: META.privacyPolicyUrl };
  return loc
    ? patch(`/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: attrs } })
    : post('/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
});
await step('app info: categories (Business / Social Networking)', async () => {
  const infos = await get(`/v1/apps/${appId}/appInfos`);
  const info = infos.data[0];
  return patch(`/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: {
    primaryCategory: { data: { type: 'appCategories', id: 'BUSINESS' } },
    secondaryCategory: { data: { type: 'appCategories', id: 'SOCIAL_NETWORKING' } } } } });
});
await step('app store version: description, keywords, urls, build', async () => {
  const vs = await get(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=1`);
  let v = vs.data[0];
  if (!v) v = (await post('/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: version }, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data;
  const locs = await get(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
  const attrs = { description: META.description, keywords: META.keywords, promotionalText: META.promotionalText, supportUrl: META.supportUrl, marketingUrl: META.marketingUrl };
  const loc = locs.data.find(l => l.attributes.locale === LOCALE);
  if (loc) await patch(`/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: attrs } });
  else await post('/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
  return patch(`/v1/appStoreVersions/${v.id}/relationships/build`, { data: { type: 'builds', id: buildId } });
});

// ---- distribution ------------------------------------------------------------
await step('internal testers: add build to internal groups', async () => {
  const groups = await get(`/v1/betaGroups?filter[app]=${appId}&filter[isInternalGroup]=true`);
  for (const g of groups.data) await post(`/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: buildId }] });
  return groups.data.length;
});
const publicLink = await step('external group "UGCad Testers" with public link', async () => {
  const groups = await get(`/v1/betaGroups?filter[app]=${appId}&filter[isInternalGroup]=false`);
  let g = groups.data.find(x => x.attributes.name === 'UGCad Testers');
  if (!g) g = (await post('/v1/betaGroups', { data: { type: 'betaGroups', attributes: { name: 'UGCad Testers', publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: 1000, feedbackEnabled: true }, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data;
  else if (!g.attributes.publicLinkEnabled) g = (await patch(`/v1/betaGroups/${g.id}`, { data: { type: 'betaGroups', id: g.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: 1000 } } })).data;
  await post(`/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: buildId }] });
  return (await get(`/v1/betaGroups/${g.id}`)).data.attributes.publicLink;
});
// The demo account is kept on App Store Connect once set, so only the phone is
// needed to submit again; pass DEMO_ACCOUNT_* only to change the stored login.
if (META.contact.phone) {
  await step('submit build for beta review (external testing)', () => post('/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: buildId } } } } }));
} else {
  console.log('skip beta review submission: set BETA_CONTACT_PHONE, then rerun this script to submit for external testing.');
}
console.log(`\nTestFlight: https://appstoreconnect.apple.com/apps/${appId}/testflight/ios`);
if (publicLink) console.log(`Public tester link: ${publicLink}`);
