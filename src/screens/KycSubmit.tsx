import { Alert } from '../components/AppAlert';
/**
 * KYC details — the native screen behind "Start KYC" / "Update Details".
 *
 * The whole submission happens here and posts the same payload as the
 * website's CreatorKYC page. Documents are an image (photo library, via
 * `react-native-image-picker`) or an image / PDF from the Files app (via
 * `../documentPicker`), up to 5 MB each, like the website. Rules mirror
 * CreatorKYC.js and server.py /kyc/submit so a rejection is caught before the
 * request: PAN by format, Aadhaar (optional) by the Verhoeff checksum, IFSC /
 * UPI by shape, bank accounts 9-18 digits, the creator must be 18+, and only
 * the PAN document is required.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import ChoiceSheet from '../components/ChoiceSheet';
import { getKyc, getPayoutOverview, submitKyc, uploadMedia } from '../api';
import { CONTENT_COLUMN, scale, fontScale } from '../theme';
import { afterSheetCloses, pickDocuments } from '../documentPicker';
import {
  GENDERS,
  IFSC_RE,
  MAX_KYC_DOC_BYTES,
  PAN_RE,
  UPI_RE,
  aadhaarValid,
  ageFromDob,
  daysInMonth,
  errorMessage,
  kycIssues,
  kycStatusOf,
  lookupPincode,
} from '../payoutRules';

type Props = {
  onBack: () => void;
  token: string;
  /** Lets the parent refresh the status screen after a successful submit. */
  onSubmitted?: () => void;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Documents the form asks for. Only the PAN card is required (CreatorKYC.js). */
const DOCS = [
  { key: 'pan_doc_url', label: 'PAN card photo' },
  { key: 'aadhaar_front_url', label: 'Aadhaar - front' },
  { key: 'aadhaar_back_url', label: 'Aadhaar - back' },
] as const;

type DocKey = (typeof DOCS)[number]['key'];

const pad = (n: number) => String(n).padStart(2, '0');

/** An uploaded document that is a PDF (it cannot be drawn as a thumbnail). */
export const isPdfUrl = (url: string) => /\.pdf(\?|#|$)/i.test(url);

function KycSubmit({ onBack, token, onSubmitted }: Props) {
  const [name, setName] = useState('');
  // Date of birth is picked as day / month / year (no typed text), then joined.
  const [dobY, setDobY] = useState(0);
  const [dobM, setDobM] = useState(0);
  const [dobD, setDobD] = useState(0);
  const [dobSheet, setDobSheet] = useState<'' | 'day' | 'month' | 'year'>('');
  const [gender, setGender] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [line, setLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [pinHint, setPinHint] = useState<'' | 'loading' | 'found' | 'not-found'>(
    '',
  );

  // UPI first, like the website.
  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank'>('upi');
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
  /** Which document's "photo or file" choice is open. */
  const [docSheet, setDocSheet] = useState<DocKey | ''>('');
  // The saved record decides whether the form shows at all, so wait for it once.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  // 'pending' / 'verified': the backend refuses a second submission.
  const [locked, setLocked] = useState<'' | 'pending' | 'verified'>('');
  const [loadError, setLoadError] = useState('');

  const dob =
    dobY && dobM && dobD ? `${dobY}-${pad(dobM)}-${pad(dobD)}` : '';
  const dobAge = dob ? ageFromDob(dob) : null;
  const dobError =
    dobAge !== null && dobAge < 18
      ? 'You must be at least 18 to receive payouts.'
      : '';
  const maxYear = new Date().getFullYear() - 18;

  const setDobFromIso = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return;
    setDobY(Number(m[1]));
    setDobM(Number(m[2]));
    setDobD(Number(m[3]));
  };

  /** Picks one part of the date and keeps the day inside the month. */
  const pickDob = (part: 'day' | 'month' | 'year', value: number) => {
    const year = part === 'year' ? value : dobY;
    const month = part === 'month' ? value : dobM;
    if (part === 'year') setDobY(value);
    if (part === 'month') setDobM(value);
    if (part === 'day') setDobD(value);
    if (year && month && dobD > daysInMonth(year, month)) {
      setDobD(daysInMonth(year, month));
    }
  };

  /**
   * Pre-fill from any existing submission, so "Update details" after a
   * rejection means correcting one field rather than retyping the form and
   * re-photographing documents. The saved payout account lives on the user
   * (not inside the kyc record), so it comes from /payout/overview.
   */
  const loadSaved = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoadError('');
      const [kycResult, payoutResult] = await Promise.allSettled([
        getKyc(token),
        getPayoutOverview(token),
      ]);
      if (!isActive()) return;

      if (kycResult.status === 'rejected') {
        setLoadError(
          errorMessage(kycResult.reason, 'Could not load your saved details.'),
        );
      } else {
        const prior = (kycResult.value || {}) as Record<string, any>;
        const status = kycStatusOf(prior);
        if (status === 'pending' || status === 'verified') setLocked(status);
        if (prior.pan_number) {
          const address = (prior.address || {}) as Record<string, any>;
          setName(String(prior.full_legal_name || ''));
          setDobFromIso(String(prior.date_of_birth || ''));
          setGender(String(prior.gender || '').toLowerCase());
          setPan(String(prior.pan_number || ''));
          setAadhaar(String(prior.aadhaar_number || ''));
          setLine(String(address.line || ''));
          setCity(String(address.city || ''));
          setState(String(address.state || ''));
          setPincode(String(address.pincode || ''));
          setDocs({
            pan_doc_url: String(prior.pan_doc_url || ''),
            aadhaar_front_url: String(prior.aadhaar_front_url || ''),
            aadhaar_back_url: String(prior.aadhaar_back_url || ''),
          });
          if (prior.payout_method === 'bank') setPayoutMethod('bank');
        }
      }

      if (payoutResult.status === 'fulfilled') {
        const saved = payoutResult.value as Record<string, any>;
        const bank = (saved?.bank_details || {}) as Record<string, any>;
        if (saved?.upi_id) setUpi(String(saved.upi_id));
        if (bank.account_number) {
          setHolder(String(bank.account_holder_name || ''));
          setBankName(String(bank.bank_name || ''));
          setAccount(String(bank.account_number || ''));
          setIfsc(String(bank.ifsc_code || ''));
        }
      }
    },
    [token],
  );

  useEffect(() => {
    let active = true;
    loadSaved(() => active).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadSaved]);

  // Fill city and state from the pincode, as the website does.
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) {
      setPinHint('');
      return undefined;
    }
    let active = true;
    setPinHint('loading');
    lookupPincode(pincode).then(location => {
      if (!active) return;
      if (!location) {
        setPinHint('not-found');
        return;
      }
      setCity(location.city);
      setState(location.state);
      setPinHint('found');
    });
    return () => {
      active = false;
    };
  }, [pincode]);

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
  const accountError =
    payoutMethod === 'bank' && account && !/^\d{9,18}$/.test(account)
      ? 'Account numbers are 9 to 18 digits.'
      : '';

  /** Uploads one already-checked document and keeps its URL for the submit. */
  const uploadDoc = async (
    key: DocKey,
    file: { uri: string; fileName: string; type: string; fileSize?: number },
  ) => {
    setUploading(key);
    try {
      const url = await uploadMedia(token, file);
      setDocs(current => ({ ...current, [key]: url }));
    } catch (error) {
      Alert.alert('Upload failed', errorMessage(error, 'Could not upload that file. Please try again.'));
    } finally {
      setUploading('');
    }
  };

  /** From the photo library: an image, shrunk so it stays under the 5 MB cap. */
  const pickPhoto = async (key: DocKey) => {
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
    if (picked?.errorMessage) {
      Alert.alert('Could not open photos', picked.errorMessage);
      return;
    }
    const asset = picked?.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > MAX_KYC_DOC_BYTES) {
      Alert.alert('File too large', 'Maximum 5MB. Pick a smaller photo.');
      return;
    }
    await uploadDoc(key, {
      uri: asset.uri,
      fileName: asset.fileName || `${key}.jpg`,
      type: asset.type || 'image/jpeg',
      fileSize: asset.fileSize,
    });
  };

  /** From the Files app: an image or a PDF, like the website's "Upload image or PDF". */
  const pickFile = async (key: DocKey) => {
    if (uploading) return;
    let picked;
    try {
      picked = await pickDocuments({ types: ['image', 'pdf'], maxBytes: MAX_KYC_DOC_BYTES });
    } catch (error) {
      Alert.alert('Could not attach', errorMessage(error, 'Could not open your files.'));
      return;
    }
    const file = picked[0];
    if (!file) return;
    await uploadDoc(key, { uri: file.uri, fileName: file.name, type: file.type, fileSize: file.size });
  };

  const form = () => ({
    name,
    dob,
    gender,
    pan,
    aadhaar,
    line,
    city,
    state,
    pincode,
    panDoc: docs.pan_doc_url,
    payoutMethod,
    upi,
    holder,
    account,
    ifsc,
  });

  const submit = async () => {
    if (submitting.current) return;
    const missing = kycIssues(form());
    if (missing.length) {
      Alert.alert(
        'Still needed',
        missing.map(item => `•  ${item}`).join('\n'),
        [{ text: 'OK' }],
      );
      return;
    }

    submitting.current = true;
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
        errorMessage(error, 'Please check your details and try again.'),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const dobOptions = (part: 'day' | 'month' | 'year') => {
    if (part === 'month') {
      return MONTHS.map((label, index) => ({
        label,
        onPress: () => pickDob('month', index + 1),
      }));
    }
    if (part === 'year') {
      return Array.from({ length: 83 }, (_, i) => maxYear - i).map(year => ({
        label: String(year),
        onPress: () => pickDob('year', year),
      }));
    }
    const days = dobY && dobM ? daysInMonth(dobY, dobM) : 31;
    return Array.from({ length: days }, (_, i) => i + 1).map(day => ({
      label: String(day),
      onPress: () => pickDob('day', day),
    }));
  };

  const renderDoc = (doc: (typeof DOCS)[number]) => (
    <TouchableOpacity
      key={doc.key}
      style={styles.docRow}
      onPress={() => setDocSheet(doc.key)}
      disabled={!!uploading}
      accessibilityRole="button"
      accessibilityLabel={`${doc.label}. ${
        docs[doc.key] ? 'Attached' : 'Not attached'
      }`}
    >
      {docs[doc.key] && isPdfUrl(docs[doc.key]) ? (
        <View style={[styles.docThumb, styles.docEmpty]}>
          <Text style={styles.docPdf}>PDF</Text>
        </View>
      ) : docs[doc.key] ? (
        <Image
          source={{ uri: docs[doc.key] }}
          style={styles.docThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.docThumb, styles.docEmpty]}>
          <Text style={styles.docPlus}>+</Text>
        </View>
      )}
      <View style={styles.docText}>
        <Text style={styles.docLabel}>{doc.label}</Text>
        <Text style={styles.docState}>
          {docs[doc.key] ? 'Attached - tap to replace' : 'Tap to attach (image or PDF, up to 5MB)'}
        </Text>
      </View>
      {uploading === doc.key && (
        <ActivityIndicator size="small" color="#4C5BF3" />
      )}
    </TouchableOpacity>
  );

  if (locked) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="KYC Details" onBack={onBack} />
        <View style={styles.sheet}>
          <View style={styles.content}>
            <Text style={styles.section}>
              {locked === 'verified' ? 'KYC is verified' : 'KYC is under review'}
            </Text>
            <Text style={styles.sectionHint}>
              {locked === 'verified'
                ? 'Your identity is confirmed, so there is nothing more to submit.'
                : 'You can submit again only if the review is rejected.'}
            </Text>
            <TouchableOpacity
              style={styles.submit}
              onPress={onBack}
              accessibilityRole="button"
            >
              <Text style={styles.submitText}>Back to KYC status</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="KYC Details" onBack={onBack} />
        <View style={[styles.sheet, styles.loading]} testID="kyc-loading">
          <ActivityIndicator color="#4C5BF3" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="KYC Details" onBack={onBack} />
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Check your details against your documents before you submit -
            mismatches are the most common reason KYC is rejected. Your ID and
            payout details are visible only to you and our review team.
          </Text>

          {loadError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>
                {loadError} You can still fill in the form.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => loadSaved()}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.label}>Name as printed on PAN</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Date of birth</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.input, styles.rowItem, styles.pickBtn]}
              onPress={() => setDobSheet('day')}
              accessibilityRole="button"
              accessibilityLabel="Birth day"
            >
              <Text style={dobD ? styles.pickText : styles.pickPlaceholder}>
                {dobD || 'Day'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.input, styles.rowItemWide, styles.pickBtn]}
              onPress={() => setDobSheet('month')}
              accessibilityRole="button"
              accessibilityLabel="Birth month"
            >
              <Text style={dobM ? styles.pickText : styles.pickPlaceholder}>
                {dobM ? MONTHS[dobM - 1] : 'Month'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.input, styles.rowItem, styles.pickBtn]}
              onPress={() => setDobSheet('year')}
              accessibilityRole="button"
              accessibilityLabel="Birth year"
            >
              <Text style={dobY ? styles.pickText : styles.pickPlaceholder}>
                {dobY || 'Year'}
              </Text>
            </TouchableOpacity>
          </View>
          {dobError ? <Text style={styles.error}>{dobError}</Text> : null}

          <Text style={styles.label}>Gender</Text>
          <View style={styles.chips}>
            {GENDERS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, gender === option.value && styles.chipOn]}
                onPress={() => setGender(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === option.value }}
              >
                <Text
                  style={[
                    styles.chipText,
                    gender === option.value && styles.chipTextOn,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>PAN card</Text>
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
          <Text style={styles.sectionHint}>
            A clear photo or PDF of your PAN card. All four corners visible, no
            glare.
          </Text>
          {renderDoc(DOCS[0])}

          <Text style={styles.section}>Aadhaar card (optional)</Text>
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
          {renderDoc(DOCS[1])}
          {renderDoc(DOCS[2])}

          <Text style={styles.section}>Residential address</Text>
          <TextInput
            style={styles.input}
            value={line}
            onChangeText={setLine}
            placeholder="House / flat, street, area"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={[styles.input, styles.inputStacked]}
            value={pincode}
            onChangeText={text => setPincode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="Pincode (6 digits)"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
          />
          {pinHint === 'loading' ? (
            <Text style={styles.hint}>Finding city and state…</Text>
          ) : null}
          {pinHint === 'found' ? (
            <Text style={styles.hint}>City and state filled automatically.</Text>
          ) : null}
          {pinHint === 'not-found' ? (
            <Text style={styles.hint}>
              Pincode not found. Enter city and state manually.
            </Text>
          ) : null}
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

          <Text style={styles.section}>Where we pay you</Text>
          <Text style={styles.sectionHint}>
            Where we send your earnings after a deal completes. Choose one.
          </Text>
          <View style={styles.chips}>
            {(['upi', 'bank'] as const).map(option => (
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
                  {option === 'bank' ? 'Bank account' : 'UPI ID'}
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
                onChangeText={text => setUpi(text.trim())}
                placeholder="name@bank"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
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
              <Text style={styles.label}>Bank name (optional)</Text>
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
              {accountError ? (
                <Text style={styles.error}>{accountError}</Text>
              ) : null}
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
          <Text style={styles.hint}>
            By submitting you confirm these documents are yours. A PAN can only
            be linked to one account.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={!!dobSheet}
        title={
          dobSheet === 'day'
            ? 'Birth day'
            : dobSheet === 'month'
            ? 'Birth month'
            : 'Birth year'
        }
        options={dobSheet ? dobOptions(dobSheet) : []}
        onClose={() => setDobSheet('')}
      />
      <ChoiceSheet
        visible={!!docSheet}
        title="Attach a document"
        options={[
          {
            label: 'Photo library',
            onPress: () => afterSheetCloses(() => pickPhoto(docSheet as DocKey)),
          },
          {
            label: 'Files (image or PDF)',
            onPress: () => afterSheetCloses(() => pickFile(docSheet as DocKey)),
          },
        ]}
        onClose={() => setDocSheet('')}
      />
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
  // A tablet keeps the form a phone-width column instead of stretching it edge to edge.
  content: { ...CONTENT_COLUMN, padding: scale(16), paddingBottom: scale(34) },
  loading: { alignItems: 'center', justifyContent: 'center' },
  intro: {
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#7E829D',
    marginBottom: scale(6),
  },
  label: {
    marginTop: scale(14),
    marginBottom: scale(6),
    fontSize: fontScale(13),
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
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
    color: '#8A8FA8',
  },
  hint: {
    marginTop: scale(6),
    fontSize: fontScale(13),
    lineHeight: fontScale(18),
    color: '#8A8FA8',
  },
  input: {
    height: scale(48),
    paddingHorizontal: scale(13),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    // 16 keeps iOS from zooming into the field and is easier to read.
    fontSize: 16,
    color: '#181943',
  },
  inputStacked: { marginTop: scale(10) },
  row: { flexDirection: 'row', gap: scale(10), marginTop: scale(10) },
  rowItem: { flex: 1 },
  rowItemWide: { flex: 2 },
  pickBtn: { justifyContent: 'center' },
  pickText: { fontSize: 16, color: '#181943' },
  pickPlaceholder: { fontSize: 16, color: '#9CA3AF' },
  error: {
    marginTop: scale(6),
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
  errorBox: {
    marginTop: scale(8),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
  },
  errorBoxText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B3261E',
  },
  retryBtn: {
    marginTop: scale(4),
    minHeight: scale(44),
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  chip: {
    minHeight: scale(44),
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
    fontSize: fontScale(14),
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
  docPdf: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  docText: { flex: 1, minWidth: 0 },
  docLabel: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#181943',
  },
  docState: {
    marginTop: scale(3),
    fontSize: fontScale(13),
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
