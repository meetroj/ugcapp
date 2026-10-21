import {pickDocuments, docKindOf, MB} from '../src/documentPicker';

// The picker package's own jest setup (jest.config.js) swaps its native module for this mock.
const {NativeDocumentPicker} = require('../node_modules/@react-native-documents/picker/lib/module/spec/NativeDocumentPicker');

const file = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///cache/brief.pdf',
  name: 'brief.pdf',
  type: 'application/pdf',
  size: 1234,
  error: null,
  isVirtual: false,
  hasRequestedType: true,
  ...over,
});

const reply = (...files: Record<string, unknown>[]) =>
  NativeDocumentPicker.pick.mockResolvedValueOnce(files);

describe('pickDocuments', () => {
  beforeEach(() => NativeDocumentPicker.pick.mockClear());

  it('returns uri / name / type / size for a valid pdf and asks for pdf by default', async () => {
    reply(file());
    expect(await pickDocuments()).toEqual([
      {uri: 'file:///cache/brief.pdf', name: 'brief.pdf', type: 'application/pdf', size: 1234},
    ]);
    const asked = NativeDocumentPicker.pick.mock.calls[0][0];
    expect(asked.type).toEqual(['com.adobe.pdf']);
    expect(asked.allowMultiSelection).toBe(false);
  });

  it('passes allowMultiple through and maps kinds to picker types', async () => {
    reply(file(), file({uri: 'file:///c/a.png', name: 'a.png', type: 'image/png'}));
    const out = await pickDocuments({types: ['pdf', 'image'], allowMultiple: true});
    expect(out).toHaveLength(2);
    const asked = NativeDocumentPicker.pick.mock.calls[0][0];
    expect(asked.allowMultiSelection).toBe(true);
    expect(asked.type).toEqual(['com.adobe.pdf', 'public.image']);
  });

  it('returns [] when the user cancels', async () => {
    NativeDocumentPicker.pick.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), {code: 'OPERATION_CANCELED'}),
    );
    expect(await pickDocuments()).toEqual([]);
  });

  it('explains a picker that is already open and any other failure', async () => {
    NativeDocumentPicker.pick.mockRejectedValueOnce(
      Object.assign(new Error('busy'), {code: 'ASYNC_OP_IN_PROGRESS'}),
    );
    await expect(pickDocuments()).rejects.toThrow(/already open/);
    NativeDocumentPicker.pick.mockRejectedValueOnce(new Error('boom'));
    await expect(pickDocuments()).rejects.toThrow('Could not open your files. Please try again.');
  });

  it('rejects a type that was not asked for, naming the allowed ones', async () => {
    reply(file({uri: 'file:///c/clip.mp4', name: 'clip.mp4', type: 'video/mp4'}));
    await expect(pickDocuments({types: ['pdf', 'image']})).rejects.toThrow(
      '"clip.mp4" is not a supported file. Allowed: PDF or image.',
    );
  });

  it('falls back to the extension when the provider gives no mime type', async () => {
    reply(file({type: null, name: 'script.PDF'}));
    const [one] = await pickDocuments();
    expect(one.type).toBe('application/pdf');
    reply(file({type: null, name: 'notes.docx'}));
    await expect(pickDocuments()).rejects.toThrow(/not a supported file/);
  });

  it('enforces maxBytes per file and attaches nothing when one is too big', async () => {
    reply(file({size: 2 * MB}), file({name: 'huge.pdf', size: 6 * MB}));
    await expect(pickDocuments({allowMultiple: true, maxBytes: 5 * MB})).rejects.toThrow(
      '"huge.pdf" is larger than 5 MB. Choose a smaller file.',
    );
  });

  it('lets an unreported size through (the server still enforces its limit)', async () => {
    reply(file({size: null}));
    expect((await pickDocuments({maxBytes: MB}))[0].size).toBe(0);
  });

  it('refuses unreadable and cloud-only files with a readable message', async () => {
    reply(file({error: 'denied'}));
    await expect(pickDocuments()).rejects.toThrow('Could not read "brief.pdf"');
    reply(file({isVirtual: true}));
    await expect(pickDocuments()).rejects.toThrow(/cloud-only/);
  });
});

describe('docKindOf', () => {
  it('classifies by mime, then by extension', () => {
    expect(docKindOf('a', 'application/pdf')).toBe('pdf');
    expect(docKindOf('a.JPG')).toBe('image');
    expect(docKindOf('a.mov')).toBe('video');
    expect(docKindOf('a.docx', 'application/octet-stream')).toBeNull();
  });
});
