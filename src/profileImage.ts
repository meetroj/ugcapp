/**
 * Size gate for profile photo and banner uploads. The website refuses a banner
 * over 5 MB before sending it (CreatorProfileModal.js onPickBanner); the app
 * applies the same limit to both images so a huge camera photo fails fast with a
 * clear message instead of a slow upload that the server may reject.
 */
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TOO_LARGE_MESSAGE = 'Image too large. Maximum 5MB.';

/** An unknown size passes: the picker does not always report one, and the server still decides. */
export function imageTooLarge(fileSize?: number | null): boolean {
  return typeof fileSize === 'number' && fileSize > MAX_PROFILE_IMAGE_BYTES;
}
