/**
 * Downloads a video without ever leaving the app (never Linking.openURL: that
 * threw the brand into the phone's browser on an amazonaws.com page).
 *
 * No file-system package is installed, so each platform uses what it has:
 * - Android: a 1px WebView loads the "save as" link and react-native-webview's own
 *   DownloadListener queues it in the system DownloadManager (Downloads folder, with
 *   a progress notification). Needs a link that answers with Content-Disposition:
 *   attachment, which GET /work/{id}/download?as_link=1 and Cloudinary fl_attachment do.
 * - iOS: the system share sheet (Save to Files, AirDrop, ...).
 *   ponytail: a true "Save Video" to Photos needs a local file, so add
 *   react-native-blob-util (download to a temp file, then Share.share the file:// url).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Share, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';

// The WebView only has to live long enough to hand the link to the DownloadManager.
const HANDOFF_MS = 20000;

export const isDownloadable = (url: unknown): url is string =>
  typeof url === 'string' && /^https?:\/\//i.test(url);

/** A Cloudinary file link told to arrive as an attachment (other links are returned as they are). */
export const asAttachmentUrl = (url: string): string =>
  url.replace(
    /(res\.cloudinary\.com\/[^/]+\/(?:video|image)\/upload\/)(?!fl_attachment)/,
    '$1fl_attachment/',
  );

export function useMediaDownload(notify: (message: string) => void) {
  const [job, setJob] = useState<{ url: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setJob(null);
  }, []);

  const start = useCallback(
    async (url: string) => {
      if (!isDownloadable(url)) {
        notify('Download failed: the link is not valid.');
        return;
      }
      if (Platform.OS !== 'android') {
        try {
          const result = await Share.share({ url });
          if (result.action === Share.sharedAction) notify('Video ready. Choose Save to Files to keep it.');
        } catch {
          notify('Download failed. Please try again.');
        }
        return;
      }
      notify('Downloading. It saves to your Downloads folder; progress shows in your notifications.');
      if (timer.current) clearTimeout(timer.current);
      setJob({ url, id: Date.now() });
      timer.current = setTimeout(stop, HANDOFF_MS);
    },
    [notify, stop],
  );

  // Render this once in the screen (it is nothing on iOS or while idle).
  const node = job ? (
    <WebView
      key={job.id}
      source={{ uri: job.url }}
      style={styles.hidden}
      pointerEvents="none"
      downloadingMessage="Downloading video"
      lackPermissionToDownloadMessage="Allow storage access to save the video"
      onError={() => {
        notify('Download failed. The link may have expired - try again.');
        stop();
      }}
      onHttpError={() => {
        notify('Download failed. The link may have expired - try again.');
        stop();
      }}
    />
  ) : null;

  return { start, node };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
