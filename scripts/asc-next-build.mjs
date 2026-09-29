// Prints the next CFBundleVersion for the given bundle id: one more than the
// highest build App Store Connect already has for the current MARKETING_VERSION.
// Env: ASC_KEY_ID, ASC_ISSUER_ID. Key file: ~/.appstoreconnect/private_keys/AuthKey_<id>.p8
import fs from 'node:fs'; import os from 'node:os'; import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
const kid = process.env.ASC_KEY_ID, iss = process.env.ASC_ISSUER_ID, bundleId = process.argv[2];
const keyPath = `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${kid}.p8`;
const b64 = b => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const msg = b64(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss, aud: 'appstoreconnect-v1', iat: now, exp: now + 600 }));
const sig = crypto.sign('sha256', Buffer.from(msg), { key: fs.readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' });
const jwt = msg + '.' + b64(sig);
const get = async p => { const r = await fetch('https://api.appstoreconnect.apple.com' + p, { headers: { Authorization: 'Bearer ' + jwt } }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };

const version = execSync("grep -m1 MARKETING_VERSION ios/ugcapp.xcodeproj/project.pbxproj | sed -E 's/.*= *([0-9.]+);/\\1/'", { cwd: `${import.meta.dirname}/..` }).toString().trim();
const apps = await get(`/v1/apps?filter[bundleId]=${bundleId}`);
if (!apps.data.length) { console.log(1); process.exit(0); }
const builds = await get(`/v1/builds?filter[app]=${apps.data[0].id}&filter[preReleaseVersion.version]=${version}&sort=-version&limit=1`);
console.log(builds.data.length ? Number(builds.data[0].attributes.version) + 1 : 1);
