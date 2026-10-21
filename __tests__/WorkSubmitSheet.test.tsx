/**
 * Caption / script and thumbnail on the submit-work sheet: a brief that requires
 * them (deal.content_submission.required_assets, as on the website's Content
 * Submission card) shows the tiles, blocks Submit until they are uploaded, and
 * sends caption_url / thumbnail_url with POST /work/submit.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import WorkSubmitSheet, {
  buildWorkPayload,
  requiredExtras,
  submitProblem,
} from '../src/screens/WorkSubmitSheet';
import { submitWork, uploadMedia } from '../src/api';

const {
  NativeDocumentPicker,
} = require('../node_modules/@react-native-documents/picker/lib/module/spec/NativeDocumentPicker');

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com',
  uploadMedia: jest.fn(),
  submitWork: jest.fn(),
}));

const MB = 1024 * 1024;
const entry = (name: string) => ({ url: `https://cdn/${name}`, name, isVideo: false });
const none = { files: [], edited: [], raw: [] };
const video = { ...none, files: [{ url: 'https://cdn/v.mp4', name: 'v.mp4', isVideo: true }] };
const extras = (over = {}) => ({ needCaption: true, needThumbnail: true, caption: null, thumbnail: null, ...over });

test('requiredExtras reads the deal flags', () => {
  expect(requiredExtras({ content_submission: { required_assets: { caption_script: true } } })).toEqual({
    caption: true,
    thumbnail: false,
  });
  expect(requiredExtras({})).toEqual({ caption: false, thumbnail: false });
});

test('submitProblem blocks until the required caption and thumbnail are uploaded', () => {
  expect(submitProblem('single', video, 'note', false, extras())).toMatch(/caption or script/);
  expect(submitProblem('single', video, 'note', false, extras({ caption: entry('s.pdf') }))).toMatch(/thumbnail/);
  expect(
    submitProblem('single', video, 'note', false, extras({ caption: entry('s.pdf'), thumbnail: entry('t.png') })),
  ).toBe('');
  // Not required: nothing extra is asked for.
  expect(submitProblem('single', video, 'note', false, extras({ needCaption: false, needThumbnail: false }))).toBe('');
  expect(submitProblem('single', video, 'note', false)).toBe('');
});

test('buildWorkPayload adds caption_url / thumbnail_url only when uploaded', () => {
  expect(buildWorkPayload('single', video, 'n')).toEqual({
    work_files: ['https://cdn/v.mp4'], edited_files: [], raw_files: [], description: 'n',
  });
  expect(buildWorkPayload('single', video, 'n', extras({ caption: entry('s.pdf'), thumbnail: entry('t.png') }))).toMatchObject({
    caption_url: 'https://cdn/s.pdf',
    thumbnail_url: 'https://cdn/t.png',
  });
});

describe('the sheet', () => {
  let tree: any;
  const deal = {
    campaign: { id: 'c1', title: 'Launch' },
    current_state: 'Content in Progress',
    content_submission: { required_assets: { caption_script: true, thumbnail: true } },
  };
  const content = (node: any): string =>
    typeof node === 'string' ? node : (node?.children || []).map(content).join('');
  const button = (label: string) =>
    tree.root.findAllByType(TouchableOpacity).find(
      (node: any) => content(node) === label || node.props.accessibilityLabel === label,
    )!;
  const press = async (label: string) => {
    expect(button(label)).toBeTruthy();
    await act(async () => { await button(label).props.onPress(); });
  };
  const mount = async (d: any) => {
    await act(async () => {
      tree = Renderer.create(
        <WorkSubmitSheet visible token="t" deal={d} onClose={() => {}} onSubmitted={() => {}} />,
      );
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (submitWork as jest.Mock).mockResolvedValue({});
  });
  afterEach(async () => {
    await act(async () => { tree.unmount(); });
    jest.useRealTimers();
  });

  test('uploads a script and a thumbnail and sends both with the work', async () => {
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [{ uri: 'file:///v.mp4', fileName: 'v.mp4', type: 'video/mp4', fileSize: MB }],
    });
    (uploadMedia as jest.Mock)
      .mockResolvedValueOnce('https://cdn/v.mp4')
      .mockResolvedValueOnce('https://cdn/script.pdf')
      .mockResolvedValueOnce('https://cdn/thumb.jpg');
    await mount(deal);
    expect(content(tree.toJSON())).toContain('Caption / script');
    expect(content(tree.toJSON())).toContain('Thumbnail');

    await press('Add files to Upload files');
    await act(async () => { tree.root.findByProps({ testID: 'work-description' }).props.onChangeText('Done'); });

    // Submit is refused until both extras are in.
    await press('Submit work for review');
    expect(submitWork).not.toHaveBeenCalled();
    expect(content(tree.toJSON())).toContain('needs a caption or script');

    // Caption / script comes from the Files picker.
    NativeDocumentPicker.pick.mockResolvedValueOnce([
      { uri: 'file:///c/script.pdf', name: 'script.pdf', type: 'application/pdf', size: MB, error: null, isVirtual: false },
    ]);
    await press('Add Caption / script');
    expect(uploadMedia).toHaveBeenLastCalledWith(
      't',
      { uri: 'file:///c/script.pdf', fileName: 'script.pdf', type: 'application/pdf', fileSize: MB },
      'file',
      expect.any(Function),
    );
    expect(content(tree.toJSON())).toContain('script.pdf');

    // Thumbnail: the chooser, then the photo library.
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [{ uri: 'file:///t.jpg', fileName: 'thumb.jpg', type: 'image/jpeg', fileSize: MB }],
    });
    await press('Add Thumbnail');
    await press('Photo library');
    await act(async () => { jest.advanceTimersByTime(600); });
    for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
    expect(content(tree.toJSON())).toContain('thumb.jpg');

    await press('Submit work for review');
    expect(submitWork).toHaveBeenCalledWith('t', 'c1', expect.objectContaining({
      work_files: ['https://cdn/v.mp4'],
      caption_url: 'https://cdn/script.pdf',
      thumbnail_url: 'https://cdn/thumb.jpg',
    }));
  });

  test('a word document is refused for the caption and nothing is uploaded', async () => {
    await mount(deal);
    NativeDocumentPicker.pick.mockResolvedValueOnce([
      { uri: 'file:///c/s.docx', name: 's.docx', type: 'application/msword', size: MB, error: null, isVirtual: false },
    ]);
    await press('Add Caption / script');
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(content(tree.toJSON())).toContain('not a supported file');
  });

  test('without the flags no extra tiles show', async () => {
    await mount({ campaign: { id: 'c1' }, current_state: 'x' });
    expect(content(tree.toJSON())).not.toContain('Caption / script');
    expect(content(tree.toJSON())).not.toContain('Thumbnail');
  });
});
