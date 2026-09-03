// Uploads App Store screenshots for the current iOS version.
//
//   node scripts/asc-screenshots.mjs <DISPLAY_TYPE> <file1.png> [file2.png ...]
//
// DISPLAY_TYPE is an App Store Connect screenshotDisplayType, e.g.
// APP_IPHONE_69 (1320x2868), APP_IPHONE_67 (1290x2796), APP_IPHONE_65 (1242x2688).
// Files must already be exactly the size for that display type. Existing
// screenshots in that set are deleted first, so the order given here is the
// order shown on the store.
import fs from 'node:fs'; import os from 'node:os'; import crypto from 'node:crypto'; import path from 'node:path';

const BUNDLE_ID = 'io.ugcad.app';
const kid = process.env.ASC_KEY_ID || 'F8R2VL5ARJ';
const iss = process.env.ASC_ISSUER_ID || 'cf6cea60-e843-4c8c-bb15-d38350fe10c4';
const keyPath = `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${kid}.p8`;
const [displayType, ...files] = process.argv.slice(2);
if (!displayType || !files.length) { console.error('usage: asc-screenshots.mjs DISPLAY_TYPE files...'); process.exit(1); }

const b64 = b => Buffer.from(b).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const msg = b64(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })) + '.' + b64(JSON.stringify({ iss, aud: 'appstoreconnect-v1', iat: now, exp: now + 1100 }));
  const sig = crypto.sign('sha256', Buffer.from(msg), { key: fs.readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return msg + '.' + b64(sig);
}
async function api(method, p, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, { method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); const json = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${JSON.stringify(json.errors?.[0] || json).slice(0, 400)}`);
  return json;
}
const get = p => api('GET', p), post = (p, b) => api('POST', p, b), patch = (p, b) => api('PATCH', p, b), del = p => api('DELETE', p);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const apps = await get(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`); const appId = apps.data[0].id;
const vs = await get(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=1&include=appStoreVersionLocalizations&fields[appStoreVersionLocalizations]=locale`);
const version = vs.data[0]; const loc = vs.included.find(i => i.type === 'appStoreVersionLocalizations');
console.log(`version ${version.attributes.versionString} locale ${loc.attributes.locale}`);

const sets = await get(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?fields[appScreenshotSets]=screenshotDisplayType`);
let set = sets.data.find(s => s.attributes.screenshotDisplayType === displayType);
if (!set) set = (await post('/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
const existing = await get(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
for (const s of existing.data) await del(`/v1/appScreenshots/${s.id}`);
if (existing.data.length) console.log(`removed ${existing.data.length} old screenshot(s) from ${displayType}`);

const ids = [];
for (const file of files) {
  const data = fs.readFileSync(file);
  const reserved = (await post('/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: path.basename(file), fileSize: data.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
  for (const op of reserved.attributes.uploadOperations) {
    const chunk = data.subarray(op.offset, op.offset + op.length);
    const headers = Object.fromEntries(op.requestHeaders.map(h => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!r.ok) throw new Error(`chunk upload failed ${r.status} for ${file}`);
  }
  await patch(`/v1/appScreenshots/${reserved.id}`, { data: { type: 'appScreenshots', id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(data).digest('hex') } } });
  ids.push(reserved.id);
  console.log(`uploaded ${path.basename(file)}`);
}
// Wait for Apple to accept each file.
for (let i = 0; i < 20; i++) {
  const states = await Promise.all(ids.map(id => get(`/v1/appScreenshots/${id}?fields[appScreenshots]=assetDeliveryState`).then(r => r.data.attributes.assetDeliveryState.state)));
  if (states.every(s => s === 'COMPLETE')) { console.log(`all ${ids.length} screenshots COMPLETE for ${displayType}`); process.exit(0); }
  if (states.some(s => s === 'FAILED')) { console.error('a screenshot FAILED processing:', states); process.exit(2); }
  await sleep(5000);
}
console.log('still processing; check App Store Connect');
