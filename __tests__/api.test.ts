/**
 * @format
 *
 * Guards the api layer's transport helper. A self-referential `request()` once
 * recursed until the stack overflowed, and the catch-all reported that as
 * "can't reach the server" — so every API call failed while the network and
 * backend were perfectly healthy.
 */

const g = globalThis as unknown as {fetch: typeof fetch};
const realFetch = g.fetch;

afterEach(() => {
  g.fetch = realFetch;
  jest.resetModules();
});

test('request() reaches the network instead of recursing', async () => {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ok: true}),
  }));
  g.fetch = fetchMock as unknown as typeof fetch;

  const {getConversations} = require('../src/api');
  await getConversations('token');

  // The real proof: fetch actually ran. Under the recursion bug it never did.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  expect(String(url)).toContain('/api/chat/conversations');
});

test('a genuine transport failure still surfaces the offline message', async () => {
  g.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;

  const {getConversations, OFFLINE_MESSAGE} = require('../src/api');
  await expect(getConversations('token')).rejects.toThrow(OFFLINE_MESSAGE);
});

/**
 * The profile screen's "Change banner" / "Change photo" buttons used to
 * navigate to the website's /settings page instead of uploading. They now call
 * uploadMedia, so each destination must reach its own endpoint — and note the
 * banner cannot go through PUT /profile/update-info, which whitelists only
 * bio/gender/country/age_range/languages and silently drops anything else.
 */
describe('uploadMedia destinations', () => {
  const picked = {uri: 'file:///tmp/a.jpg', fileName: 'a.jpg', type: 'image/jpeg'};

  function mockUpload(body: Record<string, unknown>) {
    // Typed params matter: with a bare `async () => …` TypeScript infers the
    // call tuple as [], so mock.calls[0][0] fails to compile.
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
    }));
    // @ts-expect-error minimal Response stand-in.
    global.fetch = fetchMock;
    return fetchMock;
  }

  test('banner uploads hit /profile/upload-banner', async () => {
    const fetchMock = mockUpload({banner: '/uploads/b.jpg'});
    const {uploadMedia} = require('../src/api');

    const url = await uploadMedia('token', picked, 'banner');

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/profile/upload-banner',
    );
    // The banner endpoint answers with `banner`, not photo_url/file_url.
    expect(url).toBe('/uploads/b.jpg');
  });

  test('photo uploads hit /profile/upload-photo', async () => {
    const fetchMock = mockUpload({photo_url: '/uploads/p.jpg'});
    const {uploadMedia} = require('../src/api');

    const url = await uploadMedia('token', picked, 'photo');

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/profile/upload-photo',
    );
    expect(url).toBe('/uploads/p.jpg');
  });

  test('the default destination is still the generic uploader', async () => {
    const fetchMock = mockUpload({file_url: '/uploads/f.jpg'});
    const {uploadMedia} = require('../src/api');

    await uploadMedia('token', picked);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/upload/file');
  });

  test('multipart boundary is left to fetch', async () => {
    const fetchMock = mockUpload({banner: '/uploads/b.jpg'});
    const {uploadMedia} = require('../src/api');

    await uploadMedia('token', picked, 'banner');

    // Setting Content-Type by hand omits the boundary and breaks the upload.
    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer token');
  });
});
