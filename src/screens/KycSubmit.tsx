/**
 * KYC details — the native screen behind "Start KYC" / "Update Details".
 *
 * This used to collect the three text fields and then send the creator to the
 * website to finish, because the app had no image picker. It has one now
 * (`react-native-image-picker`, already used by the deal room and the profile
 * screens), so the whole submission happens here: the same payload the web's
 * CreatorKYC page posts, documents included.
 *
 * Validation mirrors the backend so a rejection is caught before the request:
 * PAN by format, Aadhaar by the Verhoeff checksum, IFSC and UPI by shape.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { getKyc, submitKyc, uploadMedia } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  onBack: () => void;
  token: string;
  /** Lets the parent refresh the status screen after a successful submit. */
  onSubmitted?: () => void;
};

/** Same rules the backend applies in /api/kyc/submit. */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;

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
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
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

/** The three documents the backend requires, in the order the form asks. */
const DOCS = [
  { key: 'pan_doc_url', label: 'PAN card' },
  { key: 'aadhaar_front_url', label: 'Aadhaar — front' },
  { key: 'aadhaar_back_url', label: 'Aadhaar — back' },
] as const;

type DocKey = (typeof DOCS)[number]['key'];

function KycSubmit({ onBack, token, onSubmitted }: Props) {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [line, setLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank'>('bank');
  const [upi, setUpi] = useState('');
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');

  const [docs, setDocs] = useState<Record<DocKey, string>>({
    pan_doc_url: '',
    aadhaar_front_url: '',
    aadhaar_back_url: '',
  });

  /** Which document is uploading, so only its tile shows a spinner. */
  const [uploading, setUploading] = useState<DocKey | ''>('');
  const [saving, setSaving] = useState(false);

  /**
   * Pre-fill from any existing submission, so "Update details" after a
   * rejection means correcting one field rather than retyping the form and
   * re-photographing three documents.
   */
  useEffect(() => {
    let active = true;
    getKyc(token)
      .then(record => {
        const prior = (record || {}) as Record<string, any>;
        if (!active || !prior.pan_number) return;
        const address = (prior.address || {}) as Record<string, any>;
        const bank = (prior.bank_details || {}) as Record<string, any>;
        setName(String(prior.full_legal_name || ''));
        setDob(String(prior.date_of_birth || ''));
        setGender(String(prior.gender || ''));
        setPan(String(prior.pan_number || ''));
        setAadhaar(String(prior.aadhaar_number || ''));
        setLine(String(address.line || ''));
        setCity(String(address.city || ''));
        setState(String(address.state || ''));
        setPincode(String(address.pincode || ''));
        setPayoutMethod(prior.upi_id ? 'upi' : 'bank');
        setUpi(String(prior.upi_id || ''));
        setHolder(String(bank.account_holder_name || ''));
        setBankName(String(bank.bank_name || ''));
        setAccount(String(bank.account_number || ''));
        setIfsc(String(bank.ifsc_code || ''));
        setDocs({
          pan_doc_url: String(prior.pan_doc_url || ''),
          aadhaar_front_url: String(prior.aadhaar_front_url || ''),
          aadhaar_back_url: String(prior.aadhaar_back_url || ''),
        });
      })
      // No record yet is the normal first-time case, not an error.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

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
  const ifscError = useMemo(
    () =>
      payoutMethod === 'bank' && ifsc && !IFSC_RE.test(ifsc)
        ? 'IFSC looks like ABCD0123456.'
        : '',
    [ifsc, payoutMethod],
  );
  const upiError = useMemo(
    () =>
      payoutMethod === 'upi' && upi && !UPI_RE.test(upi)
        ? 'UPI ID looks like name@bank.'
        : '',
    [payoutMethod, upi],
  );

  const pickDoc = async (key: DocKey) => {
    if (uploading) return;
    const picked = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      // The documents only need to be legible, and the backend rejects very
      // large files — a full-resolution phone photo is well past both.
      maxWidth: 2000,
      maxHeight: 2000,
      quality: 0.8,
    }).catch(() => null);
    const asset = picked?.assets?.[0];
    if (!asset?.uri) return;

    setUploading(key);
    try {
      const url = await uploadMedia(token, {
        uri: asset.uri,
        fileName: asset.fileName || `${key}.jpg`,
        type: asset.type || 'image/jpeg',
      });
      setDocs(current => ({ ...current, [key]: url }));
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error && error.message
          ? error.message
          : 'Could not upload that photo. Please try again.',
      );
    } finally {
      setUploading('');
    }
  };

  /** Everything still missing, named, so the alert can list it. */
  const issues = (): string[] => {
    const m: string[] = [];
    if (name.trim().length < 3) m.push('Full legal name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) m.push('Date of birth (YYYY-MM-DD)');
    if (!gender) m.push('Gender');
    if (!PAN_RE.test(pan)) m.push('Valid PAN number');
    if (!aadhaarValid(aadhaar)) m.push('Valid Aadhaar number');
    if (!line.trim()) m.push('Address');
    if (!city.trim()) m.push('City');
    if (!state.trim()) m.push('State');
    if (!PINCODE_RE.test(pincode)) m.push('6-digit pincode');
    DOCS.forEach(doc => {
      if (!docs[doc.key]) m.push(`${doc.label} photo`);
    });
    if (payoutMethod === 'upi') {
      if (!UPI_RE.test(upi)) m.push('Valid UPI ID');
    } else {
      if (!holder.trim()) m.push('Account holder name');
      if (!bankName.trim()) m.push('Bank name');
      if (!/^\d{6,18}$/.test(account)) m.push('Account number');
      if (!IFSC_RE.test(ifsc)) m.push('Valid IFSC code');
    }
    return m;
  };

  const submit = async () => {
    const missing = issues();
    if (missing.length) {
      Alert.alert(
        'Still needed',
        missing.map(item => `•  ${item}`).join('\n'),
        [{ text: 'OK' }],
      );
      return;
    }

    setSaving(true);
    try {
      await submitKyc(token, {
        full_legal_name: name.trim(),
        date_of_birth: dob,
        gender,
        pan_number: pan,
        aadhaar_number: aadhaar,
        address: {
          line: line.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode,
        },
        ...docs,
        ...(payoutMethod === 'upi'
          ? { upi_id: upi.trim() }
          : {
              bank_details: {
                account_holder_name: holder.trim(),
                bank_name: bankName.trim(),
                account_number: account,
                ifsc_code: ifsc,
              },
            }),
      });
      Alert.alert(
        'KYC submitted',
        'Our team will verify it shortly. You can track the status on this screen.',
        [{ text: 'OK', onPress: () => (onSubmitted ? onSubmitted() : onBack()) }],
      );
    } catch (error) {
      Alert.alert(
        'Could not submit',
        error instanceof Error && error.message
          ? error.message
          : 'Please check your details and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="KYC Details" onBack={onBack} />
      <KeyboardAvoidingView style={styles.sheet} behavior="padding">
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

          <Text style={styles.label}>Date of birth</Text>
          <TextInput
            style={styles.input}
            value={dob}
            onChangeText={text =>
              // Dashes appear on their own so the stored value is always the
              // ISO date the backend expects.
              setDob(
                text
                  .replace(/\D/g, '')
                  .slice(0, 8)
                  .replace(/^(\d{4})(\d)/, '$1-$2')
                  .replace(/^(\d{4}-\d{2})(\d)/, '$1-$2'),
              )
            }
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Gender</Text>
          <View style={styles.chips}>
            {['Male', 'Female', 'Other'].map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, gender === option && styles.chipOn]}
                onPress={() => setGender(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === option }}
              >
                <Text
                  style={[
                    styles.chipText,
                    gender === option && styles.chipTextOn,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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

          <Text style={styles.section}>Address</Text>
          <TextInput
            style={styles.input}
            value={line}
            onChangeText={setLine}
            placeholder="Flat / street"
            placeholderTextColor="#9CA3AF"
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowItem]}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#9CA3AF"
            />
            <TextInput
              style={[styles.input, styles.rowItem]}
              value={state}
              onChangeText={setState}
              placeholder="State"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <TextInput
            style={[styles.input, styles.inputStacked]}
            value={pincode}
            onChangeText={text => setPincode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="Pincode"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />

          <Text style={styles.section}>Documents</Text>
          <Text style={styles.sectionHint}>
            Photos of your PAN card and both sides of your Aadhaar. Make sure
            all four corners and the text are readable.
          </Text>
          {DOCS.map(doc => (
            <TouchableOpacity
              key={doc.key}
              style={styles.docRow}
              onPress={() => pickDoc(doc.key)}
              disabled={!!uploading}
              accessibilityRole="button"
              accessibilityLabel={`${doc.label}. ${
                docs[doc.key] ? 'Attached' : 'Not attached'
              }`}
            >
              {docs[doc.key] ? (
                <Image source={{ uri: docs[doc.key] }} style={styles.docThumb} />
              ) : (
                <View style={[styles.docThumb, styles.docEmpty]}>
                  <Text style={styles.docPlus}>+</Text>
                </View>
              )}
              <View style={styles.docText}>
                <Text style={styles.docLabel}>{doc.label}</Text>
                <Text style={styles.docState}>
                  {docs[doc.key] ? 'Attached — tap to replace' : 'Tap to attach'}
                </Text>
              </View>
              {uploading === doc.key && (
                <ActivityIndicator size="small" color="#4C5BF3" />
              )}
            </TouchableOpacity>
          ))}

          <Text style={styles.section}>Where we pay you</Text>
          <View style={styles.chips}>
            {(['bank', 'upi'] as const).map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, payoutMethod === option && styles.chipOn]}
                onPress={() => setPayoutMethod(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: payoutMethod === option }}
              >
                <Text
                  style={[
                    styles.chipText,
                    payoutMethod === option && styles.chipTextOn,
                  ]}
                >
                  {option === 'bank' ? 'Bank account' : 'UPI'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {payoutMethod === 'upi' ? (
            <>
              <Text style={styles.label}>UPI ID</Text>
              <TextInput
                style={styles.input}
                value={upi}
                onChangeText={setUpi}
                placeholder="name@bank"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              {upiError ? <Text style={styles.error}>{upiError}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.label}>Account holder name</Text>
              <TextInput
                style={styles.input}
                value={holder}
                onChangeText={setHolder}
                placeholder="As printed on the passbook"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.label}>Bank name</Text>
              <TextInput
                style={styles.input}
                value={bankName}
                onChangeText={setBankName}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.label}>Account number</Text>
              <TextInput
                style={styles.input}
                value={account}
                onChangeText={text =>
                  setAccount(text.replace(/\D/g, '').slice(0, 18))
                }
                placeholder="Account number"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
              />
              <Text style={styles.label}>IFSC code</Text>
              <TextInput
                style={styles.input}
                value={ifsc}
                onChangeText={text =>
                  setIfsc(
                    text
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 11),
                  )
                }
                placeholder="ABCD0123456"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
              />
              {ifscError ? <Text style={styles.error}>{ifscError}</Text> : null}
            </>
          )}

          <TouchableOpacity
            style={[styles.submit, saving && styles.submitOff]}
            onPress={submit}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitText}>Submit for verification</Text>
            )}
          </TouchableOpacity>
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
  section: {
    marginTop: scale(24),
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#181943',
  },
  sectionHint: {
    marginTop: scale(4),
    marginBottom: scale(4),
    fontSize: fontScale(11),
    lineHeight: fontScale(17),
    color: '#8A8FA8',
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
  inputStacked: { marginTop: scale(10) },
  row: { flexDirection: 'row', gap: scale(10), marginTop: scale(10) },
  rowItem: { flex: 1 },
  error: {
    marginTop: scale(6),
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  chip: {
    height: scale(38),
    paddingHorizontal: scale(15),
    borderRadius: scale(11),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  chipOn: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  chipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  chipTextOn: { color: '#FFFFFF' },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginTop: scale(10),
    padding: scale(10),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  docThumb: {
    width: scale(54),
    height: scale(54),
    borderRadius: scale(10),
    backgroundColor: '#F1F2F9',
  },
  docEmpty: { alignItems: 'center', justifyContent: 'center' },
  docPlus: { fontSize: fontScale(22), color: '#A9ADC2' },
  docText: { flex: 1 },
  docLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#181943',
  },
  docState: {
    marginTop: scale(3),
    fontSize: fontScale(11),
    color: '#8A8FA8',
  },

  submit: {
    marginTop: scale(26),
    height: scale(50),
    borderRadius: scale(14),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default KycSubmit;
