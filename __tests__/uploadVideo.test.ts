/**
 * Videos up to 400 MB: past 90 MB (or with an unknown size) they go straight to S3 with
 * a signed form and the server converts them in the background; smaller ones go through
 * the server but report progress. Images are covered in api.test.ts and must not change.
 */
const MB = 1048576;

type Call = {url: string; init?: any};

class FakeXHR {
  static sent: Array<{method: string; url: string; headers: Record<string, string>; body: any}> = [];
  static plan: (url: string) => {status?: number; text?: string; fail?: boolean} = () => ({status: 204});
  upload: {onprogress?: (e: any) => void} = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  status = 0;
  responseText = '';
  private method = '';
  private url = '';
  private headers: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: any) {
    FakeXHR.sent.push({method: this.method, url: this.url, headers: this.headers, body});
    const outcome = FakeXHR.plan(this.url);
    if (outcome.fail) {
      this.onerror?.();
      return;
    }
    this.upload.onprogress?.({lengthComputable: true, loaded: 50, total: 100});
    this.upload.onprogress?.({lengthComputable: true, loaded: 100, total: 100});
    this.status = outcome.status ?? 200;
    this.responseText = outcome.text ?? '';
    this.onload?.();
  }
}

const partsOf = (form: any): Array<[string, any]> =>
  form._parts ? form._parts : Array.from(form.entries());

let calls: Call[];
let responses: Record<string, any>;

beforeEach(() => {
  calls = [];
  FakeXHR.sent = [];
  FakeXHR.plan = () => ({status: 204});
  // The polling loop sleeps 2 s between checks; make that instant.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0 as any;
  }) as any);
  (global as any).XMLHttpRequest = FakeXHR;
  responses = {};
  (global as any).fetch = jest.fn(async (url: any, init?: any) => {
    calls.push({url: String(url), init});
    const key = Object.keys(responses).find(k => String(url).includes(k));
    const body = key ? responses[key] : {};
    const value = typeof body === 'function' ? body() : body;
    return {ok: value.__status ? value.__status < 400 : true, status: value.__status || 200, json: async () => value};
  });
});

afterEach(() => jest.restoreAllMocks());

const s3Responses = (statusSequence: any[] = [{status: 'done', result: {file_url: 'https://s3/final.mp4'}}]) => {
  let polls = 0;
  responses = {
    '/api/upload/presign': {
      url: 'https://bucket.s3.test/',
      fields: {key: 'ugcad/incoming/u_1.mov', 'Content-Type': 'video/quicktime', policy: 'p'},
      key: 'ugcad/incoming/u_1.mov',
    },
    '/api/upload/finalize': {job_id: 'J1', status: 'processing'},
    '/api/upload/status/J1': () => statusSequence[Math.min(polls++, statusSequence.length - 1)],
  };
};

test('a 120 MB video goes presign -> S3 -> finalize -> poll, with progress', async () => {
  s3Responses([{status: 'processing'}, {status: 'done', result: {file_url: 'https://s3/final.mp4'}}]);
  const {uploadMedia} = require('../src/api');
  const progress: number[] = [];

  const url = await uploadMedia(
    'tok',
    {uri: 'file:///v.mov', fileName: 'clip.mov', type: 'video/quicktime', fileSize: 120 * MB},
    'file',
    (p: number) => progress.push(p),
  );

  expect(url).toBe('https://s3/final.mp4');
  expect(calls.map(c => c.url.replace(/^.*\/api/, '/api'))).toEqual([
    '/api/upload/presign',
    '/api/upload/finalize',
    '/api/upload/status/J1',
    '/api/upload/status/J1',
  ]);
  expect(JSON.parse(calls[0].init.body)).toEqual({filename: 'clip.mov', content_type: 'video/quicktime', size: 120 * MB});
  expect(calls[0].init.headers.Authorization).toBe('Bearer tok');

  const s3 = FakeXHR.sent[0];
  expect(s3.url).toBe('https://bucket.s3.test/');
  expect(s3.headers.Authorization).toBeUndefined(); // S3 refuses a second credential
  const names = partsOf(s3.body).map(([name]) => name);
  expect(names[names.length - 1]).toBe('file'); // the file must be the last form field
  expect(names).toContain('policy');
  expect(progress).toEqual([50, 100, 100]); // bytes sent, then the "processing" tick
});

test('a video of unknown size is routed direct as well', async () => {
  s3Responses();
  const {uploadMedia} = require('../src/api');
  await uploadMedia('tok', {uri: 'file:///v.mp4', fileName: 'v.mp4', type: 'video/mp4'}, 'file');
  expect(calls[0].url).toContain('/api/upload/presign');
  expect(JSON.parse(calls[0].init.body).size).toBe(0);
});

test('a 50 MB video goes through the server and reports progress', async () => {
  FakeXHR.plan = () => ({status: 200, text: JSON.stringify({file_url: '/uploads/a.mp4'})});
  const {uploadMedia} = require('../src/api');
  const progress: number[] = [];

  const url = await uploadMedia(
    'tok',
    {uri: 'file:///v.mp4', fileName: 'v.mp4', type: 'video/mp4', fileSize: 50 * MB},
    'file',
    (p: number) => progress.push(p),
  );

  expect(url).toBe('/uploads/a.mp4');
  expect(calls).toHaveLength(0); // no presign: it used the server
  expect(FakeXHR.sent[0].url).toContain('/api/upload/file');
  expect(FakeXHR.sent[0].headers.Authorization).toBe('Bearer tok');
  expect(progress).toEqual([50, 100]);
});

test('a video over 400 MB is refused with the real sizes and sends nothing', async () => {
  const {uploadMedia} = require('../src/api');
  await expect(
    uploadMedia('tok', {uri: 'file:///v.mp4', fileName: 'v.mp4', type: 'video/mp4', fileSize: 450 * MB}),
  ).rejects.toThrow(/450 MB.*maximum is 400 MB/);
  expect(calls).toHaveLength(0);
  expect(FakeXHR.sent).toHaveLength(0);
});

test('a dropped connection says "interrupted", not a bare network error', async () => {
  s3Responses();
  FakeXHR.plan = () => ({fail: true});
  const {uploadMedia} = require('../src/api');
  await expect(
    uploadMedia('tok', {uri: 'file:///v.mov', fileName: 'v.mov', type: 'video/quicktime', fileSize: 150 * MB}),
  ).rejects.toThrow(/interrupted.*400 MB/);
});

test('an S3 rejection is reported readably', async () => {
  s3Responses();
  FakeXHR.plan = () => ({status: 403});
  const {uploadMedia} = require('../src/api');
  await expect(
    uploadMedia('tok', {uri: 'file:///v.mov', fileName: 'v.mov', type: 'video/quicktime', fileSize: 150 * MB}),
  ).rejects.toThrow(/rejected/);
});

test("a failed conversion shows the server's own message", async () => {
  s3Responses([{status: 'failed', error: 'Videos must be 6 minutes or shorter.'}]);
  const {uploadMedia} = require('../src/api');
  await expect(
    uploadMedia('tok', {uri: 'file:///v.mov', fileName: 'v.mov', type: 'video/quicktime', fileSize: 150 * MB}),
  ).rejects.toThrow('Videos must be 6 minutes or shorter.');
});

test('images still use fetch exactly as before (no XHR, no presign)', async () => {
  responses = {'/api/upload/file': {file_url: '/uploads/p.jpg'}};
  const {uploadMedia} = require('../src/api');
  const url = await uploadMedia('tok', {uri: 'file:///a.jpg', fileName: 'a.jpg', type: 'image/jpeg', fileSize: 300 * 1024});
  expect(url).toBe('/uploads/p.jpg');
  expect(calls).toHaveLength(1);
  expect(FakeXHR.sent).toHaveLength(0);
});
