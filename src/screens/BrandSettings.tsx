/**
 * Brand account settings — the native replacement for the web /settings page.
 * A brand tapping "Profile" from Settings used to land on the desktop website
 * inside the WebView; this screen edits the same two records through the
 * business settings API so the flow never leaves the app.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { launchImageLibrary } from 'react-native-image-picker';
import Svg, { Circle, Path } from 'react-native-svg';
import { Alert } from '../components/AppAlert';
import ChoiceSheet from '../components/ChoiceSheet';
import { SkeletonForm } from '../components/Skeleton';
import { ToastBar, useToast } from '../components/Toast';
import {
  BACKEND_URL,
  getBusinessCompany,
  getBusinessProfile,
  removeBusinessLogo,
  saveBusinessCompany,
  saveBusinessProfile,
  uploadBusinessLogo,
} from '../api';
import { CONTENT_MAX_WIDTH, scale, fontScale } from '../theme';
import { BillingPanel, TeamPanel } from './BrandTeam';

type Props = {
  token: string;
  onBack: () => void;
  /** Opens an app path (the wallet, for billing history). Billing hides that button without it. */
  onNavigate?: (path: string) => void;
};

type Form = Record<string, string>;

type FieldSpec = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'number-pad';
  /** Pick-from-list field (the website renders these as dropdowns). */
  options?: string[];
  /** Digits only, cut to this length (pincode). */
  digits?: number;
};

// Same option lists as the website's Company Details form (ProfileSettings.js).
export const BUSINESS_TYPES = [
  'Sole Proprietorship',
  'Partnership',
  'LLP (Limited Liability Partnership)',
  'Private Limited (Pvt Ltd)',
  'One Person Company (OPC)',
  'Public Limited',
  'Individual / Freelancer',
  'NGO / Non-profit',
  'Other',
];
export const BUSINESS_CATEGORIES = [
  'Fashion & Apparel',
  'Beauty & Cosmetics',
  'Health & Wellness',
  'Food & Beverage',
  'Electronics & Tech',
  'Home & Living',
  'Fitness & Sports',
  'Jewellery & Accessories',
  'Travel & Hospitality',
  'Baby & Kids',
  'Automotive',
  'Finance & Fintech',
  'Education',
  'Gaming',
  'Pets',
  'Other',
];
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

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
  {
    key: 'business_type',
    label: 'Business type',
    required: true,
    options: BUSINESS_TYPES,
  },
  {
    key: 'business_category',
    label: 'Category',
    required: true,
    options: BUSINESS_CATEGORIES,
  },
  { key: 'gst_number', label: 'GST number' },
  {
    key: 'billing_address',
    label: 'Billing address',
    required: true,
    multiline: true,
  },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true, options: INDIAN_STATES },
  { key: 'pincode', label: 'Pincode', keyboard: 'number-pad', digits: 6 },
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
  // The server rebuilds the company record from this body and overwrites a
  // missing pincode with "" (server.py update_business_settings_company), so it
  // must be sent back on every save to be kept.
  'pincode',
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
  onPick,
  error,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (next: string) => void;
  /** Opens the option sheet for a pick-from-list field. */
  onPick?: () => void;
  error?: boolean;
}) {
  const lowercase =
    spec.keyboard === 'email-address' || spec.keyboard === 'url';
  if (spec.options && onPick) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          {spec.label}
          {spec.required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <TouchableOpacity
          style={[styles.input, styles.pickInput, error && styles.inputError]}
          onPress={onPick}
          accessibilityRole="button"
          accessibilityLabel={`${spec.label}: ${value || 'not selected'}`}
        >
          <Text style={value ? styles.pickValue : styles.pickPlaceholder} numberOfLines={1}>
            {value || `Select ${spec.label.toLowerCase()}`}
          </Text>
          <Text style={styles.pickCaret}>▾</Text>
        </TouchableOpacity>
      </View>
    );
  }
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

type Tab = 'profile' | 'company' | 'team' | 'billing';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'profile', label: 'Brand' },
  { key: 'company', label: 'Company' },
  { key: 'team', label: 'Team' },
  { key: 'billing', label: 'Billing' },
];

/** Relative upload paths need the backend origin before they will load. */
const logoSrc = (url: string) =>
  !url ? '' : /^https?:\/\//i.test(url) ? url : `${BACKEND_URL}${url}`;

function BrandSettings({ token, onBack, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<Form>({});
  const [company, setCompany] = useState<Form>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [kyb, setKyb] = useState('');
  // A failed load must not leave an empty form to be saved over the real
  // record, so each record keeps its own error with a Retry.
  const [loadErrors, setLoadErrors] = useState<{ profile?: string; company?: string }>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState<FieldSpec | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef(false);
  const { message: toast, show: showToast } = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      getBusinessProfile(token),
      getBusinessCompany(token),
    ]).then(results => {
      if (!active) return;
      const errors: { profile?: string; company?: string } = {};
      if (results[0].status === 'fulfilled') {
        setProfile(pick(results[0].value, PROFILE_KEYS));
      } else {
        errors.profile =
          (results[0].reason as Error)?.message || 'Could not load your brand details.';
      }
      if (results[1].status === 'fulfilled') {
        setCompany(pick(results[1].value, COMPANY_KEYS));
        setKyb(String(results[1].value?.kyb_status || ''));
      } else {
        errors.company =
          (results[1].reason as Error)?.message || 'Could not load your company details.';
      }
      setLoadErrors(errors);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  /** Pick, upload and store a new logo (POST /business/settings/logo). */
  const changeLogo = useCallback(async () => {
    if (logoRef.current) return;
    const picked = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    }).catch(() => null);
    const file = picked?.assets?.[0];
    if (!file?.uri) return;
    logoRef.current = true;
    setLogoBusy(true);
    try {
      const url = await uploadBusinessLogo(token, { ...file, uri: file.uri });
      setProfile(prev => ({ ...prev, logo_url: url }));
      showToast('Logo updated');
    } catch (error: any) {
      Alert.alert('Logo not updated', error?.message || 'Failed to upload logo');
    } finally {
      logoRef.current = false;
      setLogoBusy(false);
    }
  }, [showToast, token]);

  const removeLogo = useCallback(() => {
    Alert.alert('Remove logo', 'Your brand logo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (logoRef.current) return;
          logoRef.current = true;
          setLogoBusy(true);
          try {
            await removeBusinessLogo(token);
            setProfile(prev => ({ ...prev, logo_url: '' }));
            showToast('Logo removed');
          } catch (error: any) {
            Alert.alert('Logo not removed', error?.message || 'Failed to remove logo');
          } finally {
            logoRef.current = false;
            setLogoBusy(false);
          }
        },
      },
    ]);
  }, [showToast, token]);

  const save = useCallback(async () => {
    if (savingRef.current || (tab !== 'profile' && tab !== 'company')) return;
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
    // The server answers a bad email with a 422 that reads as noise; say it here.
    if (onProfileTab && !/^\S+@\S+\.\S+$/.test(String(values.work_email).trim())) {
      setMissing(['work_email']);
      setStatus({ ok: false, text: 'Enter a valid work email.' });
      return;
    }
    if (!onProfileTab && values.pincode && values.pincode.length !== 6) {
      setMissing(['pincode']);
      setStatus({ ok: false, text: 'Pincode must be 6 digits.' });
      return;
    }

    savingRef.current = true;
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
      savingRef.current = false;
      setSaving(false);
    }
  }, [company, profile, tab, token]);

  const onProfileTab = tab === 'profile';
  const isForm = tab === 'profile' || tab === 'company';
  const values = onProfileTab ? profile : company;
  const setValues = onProfileTab ? setProfile : setCompany;
  const fields = onProfileTab ? PROFILE_FIELDS : COMPANY_FIELDS;
  const tabError = tab === 'profile' ? loadErrors.profile : tab === 'company' ? loadErrors.company : '';
  const brandInitial = String(profile.brand_name || '?').charAt(0).toUpperCase();

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
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, active && styles.tabActive]}
                testID={'settings-tab-' + key}
                onPress={() => {
                  setTab(key);
                  setStatus(null);
                  setMissing([]);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {label}
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
            behavior="padding"
          >
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {tab === 'team' && (
                <TeamPanel token={token} onToast={showToast} />
              )}
              {tab === 'billing' && (
                <BillingPanel
                  token={token}
                  onOpenWallet={
                    onNavigate
                      ? () => onNavigate('/dashboard/business/wallet')
                      : undefined
                  }
                />
              )}

              {isForm && !!tabError && (
                <View style={[styles.card, styles.loadError]}>
                  <Text style={styles.loadErrorText}>{tabError}</Text>
                  <TouchableOpacity
                    style={styles.save}
                    onPress={() => setReloadKey(key => key + 1)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.saveText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isForm && !tabError && (
              <View style={styles.card}>
                {onProfileTab && (
                  <View style={styles.logoRow}>
                    <View style={styles.logoBox}>
                      {profile.logo_url ? (
                        <Image
                          source={{ uri: logoSrc(profile.logo_url) }}
                          style={styles.logoImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.logoInitial}>{brandInitial}</Text>
                      )}
                    </View>
                    <View style={styles.logoActions}>
                      <TouchableOpacity
                        style={styles.logoBtn}
                        onPress={changeLogo}
                        disabled={logoBusy}
                        accessibilityRole="button"
                        accessibilityLabel={profile.logo_url ? 'Change logo' : 'Upload logo'}
                      >
                        {logoBusy ? (
                          <ActivityIndicator size="small" color="#3D4FD8" />
                        ) : (
                          <Text style={styles.logoBtnText}>
                            {profile.logo_url ? 'Change logo' : 'Upload logo'}
                          </Text>
                        )}
                      </TouchableOpacity>
                      {!!profile.logo_url && (
                        <TouchableOpacity
                          style={styles.logoBtn}
                          onPress={removeLogo}
                          disabled={logoBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Remove logo"
                        >
                          <Text style={[styles.logoBtnText, styles.logoRemoveText]}>
                            Remove logo
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

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
                    onPick={spec.options ? () => setPicker(spec) : undefined}
                    onChange={next =>
                      setValues(prev => ({
                        ...prev,
                        [spec.key]: spec.digits
                          ? next.replace(/\D/g, '').slice(0, spec.digits)
                          : next,
                      }))
                    }
                  />
                ))}
              </View>
              )}

              {isForm && !tabError && !!status && (
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

              {isForm && !tabError && (
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
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>

      <ChoiceSheet
        visible={!!picker}
        title={picker ? `Select ${picker.label.toLowerCase()}` : ''}
        options={(picker?.options || []).map(option => ({
          label: option,
          onPress: () => {
            if (picker) setCompany(prev => ({ ...prev, [picker.key]: option }));
          },
        }))}
        onClose={() => setPicker(null)}
      />
      <ToastBar message={toast} />
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

  // Tablet: tabs and form share one centred column.
  tabs: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: scale(8),
    paddingHorizontal: scale(16),
    paddingTop: scale(16),
    paddingBottom: scale(4),
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: scale(44),
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
  content: {
    padding: scale(16),
    paddingBottom: scale(40),
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },

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
    // 16 so iOS does not zoom on focus.
    fontSize: 16,
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
  pickInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickValue: { flex: 1, minWidth: 0, fontSize: 16, color: '#15163F' },
  pickPlaceholder: { flex: 1, minWidth: 0, fontSize: 16, color: '#A9ADC2' },
  pickCaret: { fontSize: fontScale(14), color: '#7E829D', marginLeft: scale(8) },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(14),
    marginBottom: scale(4),
  },
  logoBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(16),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  logoInitial: {
    fontSize: fontScale(26),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#3D4FD8',
  },
  logoActions: { flex: 1, minWidth: 0, gap: scale(8) },
  logoBtn: {
    minHeight: scale(44),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(12),
  },
  logoBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  logoRemoveText: { color: '#C4373B' },
  loadError: { marginBottom: scale(12) },
  loadErrorText: {
    fontSize: fontScale(13),
    color: '#C4373B',
    marginBottom: scale(8),
  },

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
