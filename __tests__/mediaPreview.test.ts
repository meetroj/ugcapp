import { MEDIA_URL, previewOf } from '../src/mediaPreview';

test('a Cloudinary video maps to its preview clip and poster', () => {
  expect(
    previewOf('https://res.cloudinary.com/abc/video/upload/v1759/ugcad/uploads/x_y.mov'),
  ).toEqual({
    clip: `${MEDIA_URL}/previews/ugcad/uploads/x_y.mp4`,
    poster: `${MEDIA_URL}/previews/ugcad/uploads/x_y.jpg`,
  });
});

test('a video already in the bucket maps the same way', () => {
  expect(previewOf(`${MEDIA_URL}/ugcad/uploads/x.mp4`)?.clip).toBe(
    `${MEDIA_URL}/previews/ugcad/uploads/x.mp4`,
  );
});

test('previews, images, local files and empties have no preview', () => {
  expect(previewOf(`${MEDIA_URL}/previews/ugcad/uploads/x.mp4`)).toBeNull();
  expect(previewOf('https://res.cloudinary.com/abc/image/upload/v1/a.jpg')).toBeNull();
  expect(previewOf('http://localhost:8000/uploads/x.mp4')).toBeNull();
  expect(previewOf(null)).toBeNull();
});
