/**
 * KYC screens: documents can be an image or a PDF (picked from the Files app,
 * 5 MB cap, like the website's CreatorKYC), the form waits for the saved record
 * instead of flashing empty, and the status screen no longer shows a
 * made-up "Not started" while it is still loading.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import KycSubmit, { isPdfUrl } from '../src/screens/KycSubmit';
import KycVerification from '../src/screens/KycVerification';
import { Alert } from '../src/components/AppAlert';
import { getKyc, getPayoutOverview, submitKyc, uploadMedia } from '../src/api';

const {
  NativeDocumentPicker,
} = require('../node_modules/@react-native-documents/picker/lib/module/spec/NativeDocumentPicker');

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  getKyc: jest.fn(),
  getPayoutOverview: jest.fn(),
  submitKyc: jest.fn(),
  uploadMedia: jest.fn(),
}));
jest.mock('../src/components/AppAlert', () => ({ Alert: { alert: jest.fn() } }));

jest.setTimeout(60000);
const MB = 1024 * 1024;

const rejected = {
  status: 'rejected',
  pan_number: 'ABCDE1234F',
  full_legal_name: 'Asha Rao',
  date_of_birth: '1995-05-05',
  gender: 'female',
  address: { line: '1 MG Road', city: 'Indore', state: 'MP', pincode: '452001' },
  pan_doc_url: 'https://cdn/pan.jpg',
};

const content = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(content).join('');

let tree: any;
const button = (label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((node: any) => content(node) === label || String(node.props.accessibilityLabel || '').startsWith(label));
const press = async (label: string) => {
  expect(button(label)).toBeTruthy();
  await act(async () => {
    await button(label).props.onPress();
  });
};
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (globalThis as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
  (getPayoutOverview as jest.Mock).mockResolvedValue({ upi_id: 'asha@okbank' });
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});

test('isPdfUrl only matches pdf files', () => {
  expect(isPdfUrl('https://cdn/a.pdf')).toBe(true);
  expect(isPdfUrl('https://cdn/a.PDF?x=1')).toBe(true);
  expect(isPdfUrl('https://cdn/a.jpg')).toBe(false);
  expect(isPdfUrl('https://cdn/pdf/a.png')).toBe(false);
});

describe('KycSubmit', () => {
  const mount = async () => {
    await act(async () => {
      tree = Renderer.create(<KycSubmit token="t" onBack={() => {}} />);
    });
    await flush();
  };

  test('shows a spinner until the saved record arrives, then the form', async () => {
    let resolve: (v: any) => void = () => {};
    (getKyc as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
    await act(async () => {
      tree = Renderer.create(<KycSubmit token="t" onBack={() => {}} />);
    });
    expect(tree.root.findAllByProps({ testID: 'kyc-loading' }).length).toBeGreaterThan(0);
    expect(content(tree.toJSON())).not.toContain('Submit for verification');
    await act(async () => { resolve({}); });
    await flush();
    expect(tree.root.findAllByProps({ testID: 'kyc-loading' })).toHaveLength(0);
    expect(content(tree.toJSON())).toContain('Submit for verification');
  });

  test('a PDF from Files is uploaded and sent as the PAN document', async () => {
    (getKyc as jest.Mock).mockResolvedValue(rejected);
    (uploadMedia as jest.Mock).mockResolvedValue('https://cdn/pan.pdf');
    (submitKyc as jest.Mock).mockResolvedValue({});
    await mount();
    expect(content(tree.toJSON())).toContain('Attach');

    NativeDocumentPicker.pick.mockResolvedValueOnce([
      { uri: 'file:///c/pan.pdf', name: 'pan.pdf', type: 'application/pdf', size: MB, error: null, isVirtual: false },
    ]);
    await press('PAN card photo');
    await press('Files (image or PDF)');
    await act(async () => { jest.advanceTimersByTime(600); });
    await flush();

    expect(uploadMedia).toHaveBeenCalledWith('t', {
      uri: 'file:///c/pan.pdf',
      fileName: 'pan.pdf',
      type: 'application/pdf',
      fileSize: MB,
    });
    expect(content(tree.toJSON())).toContain('PDF');

    await press('Submit for verification');
    expect(submitKyc).toHaveBeenCalledWith(
      't',
      expect.objectContaining({
        pan_doc_url: 'https://cdn/pan.pdf',
        full_legal_name: 'Asha Rao',
        upi_id: 'asha@okbank',
      }),
    );
  });

  test('a PDF over 5 MB is refused before any upload', async () => {
    (getKyc as jest.Mock).mockResolvedValue(rejected);
    await mount();
    NativeDocumentPicker.pick.mockResolvedValueOnce([
      { uri: 'file:///c/big.pdf', name: 'big.pdf', type: 'application/pdf', size: 6 * MB, error: null, isVirtual: false },
    ]);
    await press('PAN card photo');
    await press('Files (image or PDF)');
    await act(async () => { jest.advanceTimersByTime(600); });
    await flush();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Could not attach', '"big.pdf" is larger than 5 MB. Choose a smaller file.');
  });

  test('a Word file is refused with the allowed types', async () => {
    (getKyc as jest.Mock).mockResolvedValue(rejected);
    await mount();
    NativeDocumentPicker.pick.mockResolvedValueOnce([
      { uri: 'file:///c/id.docx', name: 'id.docx', type: 'application/msword', size: MB, error: null, isVirtual: false },
    ]);
    await press('PAN card photo');
    await press('Files (image or PDF)');
    await act(async () => { jest.advanceTimersByTime(600); });
    await flush();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not attach',
      expect.stringContaining('Allowed: image or PDF.'),
    );
  });

  test('a submission already under review shows the lock, not the form', async () => {
    (getKyc as jest.Mock).mockResolvedValue({ status: 'pending' });
    await mount();
    expect(content(tree.toJSON())).toContain('KYC is under review');
    expect(content(tree.toJSON())).not.toContain('Submit for verification');
  });
});

describe('KycVerification', () => {
  test('does not claim "Not started" while the status is still loading', async () => {
    (getKyc as jest.Mock).mockReturnValue(new Promise(() => {}));
    await act(async () => {
      tree = Renderer.create(<KycVerification token="t" />);
    });
    const text = content(tree.toJSON());
    expect(text).not.toContain('Not started');
    expect(text).not.toContain('Start KYC');
    expect(text).not.toContain('Verify Your Identity');
  });

  test('masks the Aadhaar number to its last four digits whatever separators it has', async () => {
    (getKyc as jest.Mock).mockResolvedValue({
      status: 'verified',
      pan_number: 'ABCDE1234F',
      aadhaar_number: '1234-5678 9012',
    });
    await act(async () => {
      tree = Renderer.create(<KycVerification token="t" />);
    });
    await flush();
    expect(content(tree.toJSON())).toContain('XXXX XXXX 9012');
  });
});
