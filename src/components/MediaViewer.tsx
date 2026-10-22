/**
 * In-app viewers so a tap on a picture, video or document never throws the user into
 * the phone's browser.
 *
 * - image: full-screen Modal + Image with a Close button.
 * - video: the existing full-screen VideoPreview.
 * - file (PDF and other documents): Android hands it to the system DownloadManager
 *   (useMediaDownload: Downloads folder + notification); iOS shows it in a WebView
 *   modal (WKWebView renders PDFs) with Close and Share.
 * - page: any other link the brand pasted (a YouTube reference), shown in that same
 *   WebView modal on both platforms.
 *
 * `useMediaOpener` is the one entry point: `const media = useMediaOpener();`
 * `media.open(url)` (the kind is read from the file name, or pass it) and render
 * `{media.node}` once in the screen.
 * ponytail: no pinch/zoom on images and no Android in-app PDF page view (that needs a
 * PDF renderer package such as react-native-pdf); add when the app may take a dependency.
 */
import React, { useCallback, useState } from 'react';
import { Image, Modal, Platform, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Text } from './Text';
import { ToastBar, useToast } from './Toast';
import VideoPreview from './VideoPreview';
import { attachmentKind } from '../actionCards';
import { isDownloadable, useMediaDownload } from '../mediaDownload';
import { playableVideoUrl } from '../mediaPreview';
import { bodyFont, fontScale, scale } from '../theme';

export type MediaKind = 'image' | 'video' | 'file' | 'page';

/** A file on our own storage (media bucket or Cloudinary), not a web page. */
export const isOwnStorageUrl = (url: string): boolean =>
  /^https?:\/\/(?:[^/]*ugcad[^/]*\.s3[^/]*\.amazonaws\.com|res\.cloudinary\.com)\//i.test(url);

/** What a link is, from its file name; Cloudinary /video/ URLs are videos whatever the name. */
export function mediaKindOf(url: string): MediaKind {
  const kind = attachmentKind(url);
  if (kind === 'image') return 'image';
  if (kind === 'video' || /res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(url)) return 'video';
  return 'file';
}

type ViewerProps = { uri: string | null; kind: 'image' | 'doc'; onClose: () => void };

export default function MediaViewer({ uri, kind, onClose }: ViewerProps) {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      visible={!!uri}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
      onShow={() => setFailed(false)}
    >
      <View style={styles.screen}>
        {!!uri && kind === 'image' && (
          <Image source={{ uri }} style={styles.fill} resizeMode="contain" testID="media-image" />
        )}
        {!!uri && kind === 'doc' && (
          <WebView
            source={{ uri }}
            style={[styles.doc, { marginTop: insets.top + scale(68) }]}
            startInLoadingState
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
          />
        )}
        {failed && (
          <Text style={styles.error}>This file could not be loaded. Check your connection and try again.</Text>
        )}
        <View style={[styles.bar, { top: insets.top + scale(12) }]}>
          {kind === 'doc' && !!uri && (
            <TouchableOpacity
              style={styles.pill}
              accessibilityRole="button"
              accessibilityLabel="Share file"
              onPress={() => {
                Share.share({ url: uri }).catch(() => {});
              }}
            >
              <Text style={styles.label}>Share</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.pill}
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
            onPress={onClose}
          >
            <Text style={styles.label}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Opens any media link inside the app. Render `node` once in the screen. */
export function useMediaOpener() {
  const { message, show } = useToast();
  const { start: download, node: downloadNode } = useMediaDownload(show);
  const [shown, setShown] = useState<{ uri: string; kind: MediaKind } | null>(null);
  const close = useCallback(() => setShown(null), []);

  const open = useCallback(
    (url: unknown, kind?: MediaKind) => {
      if (!isDownloadable(url)) {
        show('This file link is not valid.');
        return;
      }
      const as = kind || mediaKindOf(url);
      if (as === 'file' && Platform.OS === 'android') {
        download(url);
        return;
      }
      setShown({ uri: as === 'video' ? playableVideoUrl(url) : url, kind: as });
    },
    [download, show],
  );

  const node = (
    <>
      <MediaViewer
        uri={shown && shown.kind !== 'video' ? shown.uri : null}
        kind={shown?.kind === 'image' ? 'image' : 'doc'}
        onClose={close}
      />
      <VideoPreview uri={shown?.kind === 'video' ? shown.uri : null} onClose={close} />
      {downloadNode}
      <ToastBar message={message} />
    </>
  );

  return { open, node };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  fill: { flex: 1 },
  doc: { flex: 1, backgroundColor: '#FFFFFF' },
  bar: {
    position: 'absolute',
    right: scale(16),
    flexDirection: 'row',
    gap: scale(10),
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: scale(18),
    justifyContent: 'center',
    borderRadius: scale(22),
    backgroundColor: 'rgba(21,22,63,0.85)',
  },
  label: { ...bodyFont(600), fontSize: fontScale(14), color: '#FFFFFF' },
  error: {
    position: 'absolute',
    left: scale(24),
    right: scale(24),
    top: '45%',
    textAlign: 'center',
    fontSize: fontScale(14),
    color: '#FFFFFF',
  },
});
