/**
 * Where a portfolio video's small preview clip and poster picture live.
 *
 * Every portfolio video has a ~2 MB 480p clip and a still picture in the media
 * bucket at previews/<same path>.mp4|.jpg, so a tile can play without
 * downloading the multi-megabyte original. The path is read straight from the
 * stored video URL, whether it still points at Cloudinary or already at the
 * bucket. The website uses the same rule; keep the two in step.
 */
export const MEDIA_URL = 'https://ugcad-media.s3.ap-south-1.amazonaws.com';

const VIDEO_PATH = [
  /^https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/(?:v\d+\/)?(.+)\.(?:mp4|mov|webm|m4v)(?:[?#].*)?$/i,
  /^https?:\/\/ugcad-media\.s3[^/]*\/(?!previews\/)(.+)\.(?:mp4|mov|webm|m4v)(?:[?#].*)?$/i,
];

export function previewOf(uri: string | null | undefined) {
  for (const re of VIDEO_PATH) {
    const m = uri ? re.exec(uri) : null;
    if (m) {
      return {
        clip: `${MEDIA_URL}/previews/${m[1]}.mp4`,
        poster: `${MEDIA_URL}/previews/${m[1]}.jpg`,
      };
    }
  }
  return null;
}
