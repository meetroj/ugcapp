/**
 * Thin wrapper over @react-native-documents/picker: the system Files picker
 * for things the photo gallery cannot hand over (PDFs, scripts).
 *
 * Call sites get plain `{uri, name, type, size}` items, an empty list when the
 * user backs out, and an Error with a sentence they can read when something is
 * wrong. Type and size are checked here, before anything is uploaded, so one
 * bad pick attaches nothing (same all-or-nothing rule as the website).
 *
 * No keepLocalCopy: React Native's fetch/FormData reads content:// (Android)
 * and file:// (iOS import mode) uris directly, so uploads need no extra copy.
 */
import { Platform } from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types as pickerTypes,
} from '@react-native-documents/picker';

export type DocKind = 'pdf' | 'image' | 'video';

export type PickedDocument = {
  uri: string;
  name: string;
  /** MIME type; guessed from the extension when the provider gives none. */
  type: string;
  /** Bytes; 0 when the provider did not report one (the server still enforces its limits). */
  size: number;
};

export type PickDocumentsOptions = {
  /** What may be picked. Defaults to PDF only. */
  types?: DocKind[];
  allowMultiple?: boolean;
  /** Per-file cap in bytes. Omit for no client-side cap. */
  maxBytes?: number;
};

export const MB = 1024 * 1024;

const LABEL: Record<DocKind, string> = { pdf: 'PDF', image: 'image', video: 'video' };

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  mkv: 'video/x-matroska',
};

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.split('?')[0]);
  return match ? match[1].toLowerCase() : '';
}

/** Last path segment, decoded; the provider's name wins when there is one. */
function nameFrom(uri: string, name: string | null | undefined): string {
  if (name && name.trim()) return name.trim();
  const last = uri.split('?')[0].split('/').pop() || 'file';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** pdf / image / video from the MIME type, else the extension; null for anything else. */
export function docKindOf(name: string, type?: string | null): DocKind | null {
  const mime = String(type || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const guessed = EXT_MIME[extensionOf(name)] || '';
  if (guessed === 'application/pdf') return 'pdf';
  if (guessed.startsWith('image/')) return 'image';
  if (guessed.startsWith('video/')) return 'video';
  return null;
}

/** "PDF", "PDF or image" - for the wrong-type message. */
function listKinds(kinds: DocKind[]): string {
  const labels = kinds.map(kind => LABEL[kind]);
  return labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
    : labels[0];
}

function libraryTypes(kinds: DocKind[]): string[] {
  return kinds.map(kind =>
    kind === 'pdf'
      ? pickerTypes.pdf
      : kind === 'image'
      ? pickerTypes.images
      : pickerTypes.video,
  ) as string[];
}

/**
 * Runs `open` once a ChoiceSheet that launched it has finished closing. iOS
 * refuses to present a native picker while a Modal is still dismissing (the
 * picker silently never appears), so it waits out the fade; Android needs no wait.
 */
export function afterSheetCloses(open: () => void) {
  if (Platform.OS === 'ios') setTimeout(open, 450);
  else open();
}

/**
 * Opens the system file picker. Resolves to the validated files, or [] if the
 * user cancelled. Throws an Error with a readable message for a wrong type, an
 * oversized file, a file the provider could not read, or a picker failure.
 */
export async function pickDocuments(
  options: PickDocumentsOptions = {},
): Promise<PickedDocument[]> {
  const kinds = options.types && options.types.length ? options.types : ['pdf' as DocKind];

  let picked;
  try {
    picked = await pick({
      type: libraryTypes(kinds),
      allowMultiSelection: !!options.allowMultiple,
      mode: 'import',
    });
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === errorCodes.OPERATION_CANCELED) return [];
      if (error.code === errorCodes.IN_PROGRESS) {
        throw new Error('A file picker is already open. Finish or close it first.');
      }
      if (error.code === errorCodes.UNABLE_TO_OPEN_FILE_TYPE) {
        throw new Error(`That file type cannot be opened. Allowed: ${listKinds(kinds)}.`);
      }
    }
    throw new Error('Could not open your files. Please try again.');
  }

  const files: PickedDocument[] = [];
  for (const item of picked || []) {
    const name = nameFrom(item.uri || '', item.name);
    if (item.error) throw new Error(`Could not read "${name}". Choose another file.`);
    if (item.isVirtual) {
      throw new Error(`"${name}" is a cloud-only file. Download it as a PDF first.`);
    }
    const kind = docKindOf(name, item.type);
    if (!kind || !kinds.includes(kind)) {
      throw new Error(`"${name}" is not a supported file. Allowed: ${listKinds(kinds)}.`);
    }
    const size = Number(item.size) || 0;
    if (options.maxBytes && size > options.maxBytes) {
      const limit = Math.round((options.maxBytes / MB) * 10) / 10;
      throw new Error(`"${name}" is larger than ${limit} MB. Choose a smaller file.`);
    }
    files.push({
      uri: item.uri,
      name,
      type: item.type || EXT_MIME[extensionOf(name)] || 'application/octet-stream',
      size,
    });
  }
  return files;
}
