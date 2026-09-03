/**
 * Brand account settings — the native replacement for the web /settings page.
 * A brand tapping "Profile" from Settings used to land on the desktop website
 * inside the WebView; this screen edits the same two records through the
 * business settings API so the flow never leaves the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { SkeletonForm } from '../components/Skeleton';
import {
  getBusinessCompany,
  getBusinessProfile,
  saveBusinessCompany,
  saveBusinessProfile,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  /** Clears the stored session and returns to the auth screens. */
};

type Form = Record<string, string>;

type FieldSpec = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'url';
};

/** The two records the page edits, each mapped to its own endpoint. */
const PROFILE_FIELDS: FieldSpec[] = [
  { key: 'brand_name', label: 'Brand name', required: true },
  { key: 'contact_person', label: 'Contact person', required: true },
  {
    key: 'work_email',
    label: 'Work email',
    required: true,
    keyboard: 'email-address',
  },
  { key: 'phone_number', label: 'Phone number', keyboard: 'phone-pad' },
  { key: 'website_url', label: 'Website', keyboard: 'url' },
];

const COMPANY_FIELDS: FieldSpec[] = [
  { key: 'business_type', label: 'Business type', required: true },
  { key: 'business_category', label: 'Category', required: true },
  { key: 'gst_number', label: 'GST number' },
  {
    key: 'billing_address',
    label: 'Billing address',
    required: true,
    multiline: true,
  },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'country', label: 'Country', required: true },
];

/** Only the keys the API accepts — extra keys make the PUT fail validation. */
const PROFILE_KEYS = [
  'brand_name',
  'contact_person',
  'work_email',
  'phone_number',
  'website_url',
  'logo_url',
];
const COMPANY_KEYS = [
  'business_type',
  'gst_number',
  'business_category',
  'country',
  'billing_address',
  'city',
  'state',
];

const pick = (source: Record<string, any>, keys: string[]): Form => {
  const out: Form = {};
  keys.forEach(key => {
    const value = source ? source[key] : undefined;
    out[key] = value == null ? '' : String(value);
  });
  return out;
};

function Icon({
  name,
  color = '#7C819C',
  size = 20,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8" r="3.6" {...line} />
          <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" {...line} />
        </>
      )}
      {name === 'building' && (
        <>
          <Path d="M4 20V6.5L12 4l8 2.5V20" {...line} />
          <Path
            d="M9.5 20v-4h5v4M8.5 9h1.5M14 9h1.5M8.5 12.5h1.5M14 12.5h1.5"
            {...line}
          />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
    </Svg>
  );
}

/** Labelled field styled like the rest of the app — no web chrome anywhere. */
function Field({
  spec,
  value,
  onChange,
  error,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
}) {
  const lowercase =
    spec.keyboard === 'email-address' || spec.keyboard === 'url';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {spec.label}
        {spec.required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={[
          styles.input,
          spec.multiline && styles.inputMultiline,
          error && styles.inputError,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={spec.label}
        placeholderTextColor="#A9ADC2"
        keyboardType={spec.keyboard || 'default'}
        autoCapitalize={lowercase ? 'none' : 'sentences'}
        autoCorrect={false}
        multiline={spec.multiline}
      />
    </View>
  );
}

function BrandSettings({ token, onBack }: Props) {
  const [tab, setTab] = useState<'profile' | 'company'>('profile');
  const [profile, setProfile] = useState<Form>({});
  const [company, setCompany] = useState<Form>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [kyb, setKyb] = useState('');

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      getBusinessProfile(token),
      getBusinessCompany(token),
    ]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        setProfile(pick(results[0].value, PROFILE_KEYS));
      }
      if (results[1].status === 'fulfilled') {
        setCompany(pick(results[1].value, COMPANY_KEYS));
        setKyb(String(results[1].value?.kyb_status || ''));
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [token]);

  const save = useCallback(async () => {
    const onProfileTab = tab === 'profile';
    const fields = onProfileTab ? PROFILE_FIELDS : COMPANY_FIELDS;
    const values = onProfileTab ? profile : company;

    // The backend rejects blank required fields with a 400. Checking here keeps
    // the error on the field itself instead of in a generic banner.
    const blank = fields
      .filter(spec => spec.required && !String(values[spec.key] || '').trim())
      .map(spec => spec.key);
    setMissing(blank);
    if (blank.length) {
      setStatus({ ok: false, text: 'Fill in the highlighted fields.' });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      // Both helpers throw with the backend's own `detail` on a 4xx.
      const payload = pick(values, onProfileTab ? PROFILE_KEYS : COMPANY_KEYS);
      const data: any = onProfileTab
        ? await saveBusinessProfile(token, payload)
        : await saveBusinessCompany(token, payload);
      // The PUT echoes the stored record, so reloading from it shows exactly
      // what the server kept.
      if (onProfileTab) setProfile(pick(data, PROFILE_KEYS));
      else setCompany(pick(data, COMPANY_KEYS));
      setStatus({ ok: true, text: 'Changes saved.' });
    } catch (error: any) {
      setStatus({
        ok: false,
        text: error?.message || 'Could not save changes.',
      });
    } finally {
      setSaving(false);
    }
  }, [company, profile, tab, token]);

  const onProfileTab = tab === 'profile';
  const values = onProfileTab ? profile : company;
  const setValues = onProfileTab ? setProfile : setCompany;
  const fields = onProfileTab ? PROFILE_FIELDS : COMPANY_FIELDS;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#FFFFFF" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
      </View>

      <View style={styles.sheet}>
        <View style={styles.tabs}>
          {(['profile', 'company'] as const).map(key => {
            const active = tab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => {
                  setTab(key);
                  setStatus(null);
                  setMissing([]);
                }}
                accessibilityRole="button"
              >
                <Icon
                  name={key === 'profile' ? 'person' : 'building'}
                  color={active ? '#FFFFFF' : '#6E7391'}
                  size={16}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key === 'profile' ? 'Brand' : 'Company'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.content}>
            <SkeletonForm rows={6} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.card}>
                {!onProfileTab && !!kyb && (
                  <View style={styles.kybRow}>
                    <Text style={styles.kybLabel}>Verification</Text>
                    <View
                      style={[
                        styles.kybChip,
                        kyb === 'verified' && styles.kybChipOk,
                        kyb === 'rejected' && styles.kybChipBad,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kybChipText,
                          kyb === 'verified' && styles.kybChipTextOk,
                          kyb === 'rejected' && styles.kybChipTextBad,
                        ]}
                      >
                        {kyb.charAt(0).toUpperCase() + kyb.slice(1)}
                      </Text>
                    </View>
                  </View>
                )}

                {fields.map(spec => (
                  <Field
                    key={spec.key}
                    spec={spec}
                    value={values[spec.key] || ''}
                    error={missing.includes(spec.key)}
                    onChange={next =>
                      setValues(prev => ({ ...prev, [spec.key]: next }))
                    }
                  />
                ))}
              </View>

              {!!status && (
                <View
                  style={[
                    styles.status,
                    status.ok ? styles.statusOk : styles.statusBad,
                  ]}
                >
                  {status.ok && <Icon name="check" color="#0F7B43" size={15} />}
                  <Text
                    style={[
                      styles.statusText,
                      status.ok ? styles.statusTextOk : styles.statusTextBad,
                    ]}
                  >
                    {status.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.save, saving && styles.saveDisabled]}
                onPress={save}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Save changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the rounded sheet below covers the rest,
  // matching the creator tabs.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    // Transparent so the navy backdrop shows through, as on the creator tabs.
    backgroundColor: 'transparent',
  },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  tabs: {
    flexDirection: 'row',
    gap: scale(8),
    paddingHorizontal: scale(16),
    paddingTop: scale(16),
    paddingBottom: scale(4),
  },
  tab: {
    flex: 1,
    height: scale(40),
    borderRadius: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  tabActive: { backgroundColor: '#3D4FD8', borderColor: '#3D4FD8' },
  tabText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#6E7391',
  },
  tabTextActive: { color: '#FFFFFF' },

  loading: { marginTop: scale(40) },
  content: { padding: scale(16), paddingBottom: scale(40) },

  card: {
    padding: scale(16),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },

  kybRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(6),
  },
  kybLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  kybChip: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    borderRadius: scale(8),
    backgroundColor: '#FFF3DF',
  },
  kybChipOk: { backgroundColor: '#E2F7EE' },
  kybChipBad: { backgroundColor: '#FFE6E7' },
  kybChipText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#B4741B',
  },
  kybChipTextOk: { color: '#0F7B43' },
  kybChipTextBad: { color: '#C4373B' },

  field: { marginTop: scale(14) },
  fieldLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#15163F',
    marginBottom: scale(6),
  },
  required: { color: '#E5484D' },
  input: {
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    fontSize: fontScale(15),
    color: '#15163F',
    // Android adds vertical padding that makes the box taller than 46.
    paddingVertical: 0,
  },
  inputMultiline: {
    height: scale(86),
    paddingVertical: scale(12),
    textAlignVertical: 'top',
  },
  inputError: { borderColor: '#E5484D', backgroundColor: '#FFF6F6' },

  status: {
    marginTop: scale(14),
    padding: scale(12),
    borderRadius: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  statusOk: { backgroundColor: '#E2F7EE' },
  statusBad: { backgroundColor: '#FFE6E7' },
  statusText: {
    flex: 1,
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
  },
  statusTextOk: { color: '#0F7B43' },
  statusTextBad: { color: '#C4373B' },

  save: {
    marginTop: scale(16),
    height: scale(50),
    borderRadius: scale(14),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.6 },
  saveText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default BrandSettings;
