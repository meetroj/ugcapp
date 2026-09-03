/**
 * KYC details — the native screen behind "Start KYC" / "Update Details", which
 * previously pushed the user out to the website.
 *
 * Scope note: POST /api/kyc/submit requires three uploaded document images
 * (PAN, Aadhaar front, Aadhaar back) and rejects the request without them. The
 * app has no image-picker dependency installed, so the photos cannot be
 * captured or uploaded natively yet — that needs a new native module and a
 * rebuild, not a JS change.
 *
 * So this screen collects and validates everything it legitimately can (name,
 * PAN, Aadhaar — using the same rules the backend enforces) and is explicit
 * that the documents must be attached on the website to finish. It does not
 * POST a submission it knows the backend would reject.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { scale, fontScale } from '../theme';

type Props = {
  onBack: () => void;
};

/** Same rules the backend applies in /api/kyc/submit. */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Aadhaar is 12 digits and must pass the Verhoeff checksum, as on the server. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 7, 2],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function aadhaarValid(value: string): boolean {
  if (!/^[2-9][0-9]{11}$/.test(value)) return false;
  let c = 0;
  value
    .split('')
    .reverse()
    .forEach((digit, index) => {
      c = VERHOEFF_D[c][VERHOEFF_P[index % 8][Number(digit)]];
    });
  return c === 0;
}

const SITE_KYC = 'https://www.ugcad.io/kyc';

function KycSubmit({ onBack }: Props) {
  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');

  const panError = useMemo(
    () =>
      pan && !PAN_RE.test(pan)
        ? 'PAN should be 10 characters, like ABCDE1234F.'
        : '',
    [pan],
  );
  const aadhaarError = useMemo(
    () =>
      aadhaar.length === 12 && !aadhaarValid(aadhaar)
        ? 'That Aadhaar number is not valid. Check the 12 digits.'
        : '',
    [aadhaar],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="KYC Details" onBack={onBack} />
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Check your details against your documents before you submit —
            mismatches are the most common reason KYC is rejected.
          </Text>

          <Text style={styles.label}>Name as printed on PAN</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>PAN number</Text>
          <TextInput
            style={styles.input}
            value={pan}
            onChangeText={text =>
              setPan(
                text
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 10),
              )
            }
            placeholder="ABCDE1234F"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
          />
          {panError ? <Text style={styles.error}>{panError}</Text> : null}

          <Text style={styles.label}>Aadhaar number</Text>
          <TextInput
            style={styles.input}
            value={aadhaar}
            onChangeText={text =>
              setAadhaar(text.replace(/\D/g, '').slice(0, 12))
            }
            placeholder="12 digits"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />
          {aadhaarError ? (
            <Text style={styles.error}>{aadhaarError}</Text>
          ) : null}

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Documents finish on the web</Text>
            <Text style={styles.noticeBody}>
              Verification also needs photos of your PAN card and both sides of
              your Aadhaar. Uploading photos isn't supported in the app yet, so
              open ugcad.io to attach them and submit.
            </Text>
            <TouchableOpacity
              style={styles.noticeBtn}
              onPress={() => Linking.openURL(SITE_KYC).catch(() => {})}
              accessibilityRole="button"
            >
              <Text style={styles.noticeBtnText}>Open ugcad.io/kyc</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    overflow: 'hidden',
  },
  content: { padding: scale(16), paddingBottom: scale(34) },
  intro: {
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
    marginBottom: scale(6),
  },
  label: {
    marginTop: scale(14),
    marginBottom: scale(6),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#7E829D',
  },
  input: {
    height: scale(48),
    paddingHorizontal: scale(13),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    fontSize: fontScale(13),
    color: '#181943',
  },
  error: {
    marginTop: scale(6),
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
  notice: {
    marginTop: scale(22),
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFF4DE',
    borderWidth: 1,
    borderColor: '#F5E2BC',
  },
  noticeTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#8A6412',
  },
  noticeBody: {
    marginTop: scale(7),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#8A6412',
  },
  noticeBtn: {
    marginTop: scale(12),
    height: scale(44),
    borderRadius: scale(12),
    backgroundColor: '#B4790B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default KycSubmit;
