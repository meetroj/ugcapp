import { downloadUrlOf } from '../src/screens/BrandCampaignDetail';

const CLD = 'https://res.cloudinary.com/abc/video/upload/v1/ugcad/uploads';

test('an approved delivery stored only in files/work_files still downloads', () => {
  // The shape every approved delivery has today: no video_url, no preview_url.
  const item = {
    status: 'approved',
    video_url: null,
    preview_url: null,
    work_files: [`${CLD}/raw.mp4`],
    files: [
      { kind: 'raw', label: 'Raw video', url: `${CLD}/raw.mp4` },
      { kind: 'edited', label: 'Edited video', url: `${CLD}/edited.mp4` },
    ],
  };
  expect(downloadUrlOf(item)).toBe(
    'https://res.cloudinary.com/abc/video/upload/fl_attachment/v1/ugcad/uploads/edited.mp4',
  );
});

test('falls back to work_files, and leaves non-Cloudinary links alone', () => {
  expect(downloadUrlOf({ work_files: ['https://ugcad-media.s3.ap-south-1.amazonaws.com/a.mp4'] })).toBe(
    'https://ugcad-media.s3.ap-south-1.amazonaws.com/a.mp4',
  );
});

test('nothing to download gives null, not a dead link', () => {
  expect(downloadUrlOf({ status: 'approved' })).toBeNull();
});
