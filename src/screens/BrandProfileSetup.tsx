/**
 * Brand onboarding — the native replacement for the web
 * /profile-setup/business page. Field-for-field the same form the website
 * shows: business description, product type and industry category, then the
 * online presence block (website, Facebook, Instagram, LinkedIn).
 *
 * Submits PUT /api/profile/business, which sets profile_completed and moves
 * the account to PENDING approval.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import { launchImageLibrary } from 'react-native-image-picker';
import Svg, { Path } from 'react-native-svg';
import {
  BACKEND_URL,
  completeProfile,
  uploadMedia,
  type AuthUser,
} from '../api';
import { scale, fontScale } from '../theme';
import { useKeyboardVisible } from '../keyboard';

type Props = {
  token: string;
  session: AuthUser;
  /** Called once the profile is saved so the shell can refresh the session. */
  onDone: () => void;
  onLogout?: () => void;
};

type Form = Record<string, string>;

/** Exactly the options in the web page's industry <select>. */
const INDUSTRIES = [
  'Fashion & Apparel',
  'Beauty & Cosmetics',
  'Technology & Gadgets',
  'Food & Beverage',
  'Health & Fitness',
  'Home & Lifestyle',
  'Travel & Tourism',
  'Education',
  'Entertainment',
  'Other',
];

/**
 * Countries offered by the web page's country <select>.
 */
/**
 * The web page's dark navy theme. The backdrop is near-black, the form card is
 * a translucent navy panel on top of it (rgba(18,18,26,0.72) over the backdrop,
 * flattened here since RN has no backdrop blur), and everything on the card is
 * white or a white alpha. Periwinkle is the accent for the primary button, the
 * step badge, selected chips and the upload icons.
 */
const BACKDROP = '#0A0A16';
const CARD = '#13131D';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const ACCENT = '#6D7BFF';
/** Text on the card: labels and headings are plain white. */
const ACCENT_TEXT = '#FFFFFF';
/** Input and chip fill / hairline on the card. */
const INK_SOFT = 'rgba(255,255,255,0.04)';
const INK_BORDER = 'rgba(255,255,255,0.14)';
const INK_MUTED = 'rgba(255,255,255,0.6)';
const PLACEHOLDER = 'rgba(255,255,255,0.4)';
const ON_DARK_MUTED = 'rgba(255,255,255,0.66)';
const SHEET = '#17171F';

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'India',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'United Arab Emirates',
  'Singapore',
  'Netherlands',
  'Spain',
  'Italy',
  'Japan',
  'Brazil',
  'Mexico',
  'Other',
];

/**
 * Dial codes offered beside the phone field. The web renders a flag image per
 * row from flagcdn.com; a remote image per row is not worth the load here, so
 * the country code carries the meaning instead.
 */
const DIAL_CODES = [
  { label: 'IN', code: '+91' },
  { label: 'US', code: '+1' },
  { label: 'GB', code: '+44' },
  { label: 'AU', code: '+61' },
  { label: 'CA', code: '+1' },
  { label: 'DE', code: '+49' },
  { label: 'FR', code: '+33' },
  { label: 'AE', code: '+971' },
  { label: 'SG', code: '+65' },
];

/** Same two rules the web validates with — any real website, any IG handle. */
const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const IG_HANDLE_RE = /^@?[a-z0-9._]{1,30}$/i;

/**
 * Reduces whatever was pasted to a bare Instagram handle. A link copied out of
 * the app carries ?igsh=/&utm_source= tracking params and sometimes a /reel/
 * path; both have to go or the handle fails IG_HANDLE_RE.
 */
function instagramHandle(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/.*$/, '')
    .replace(/\/+$/, '');
}

/**
 * The backend validates website as a URL, so a bare "www.brand.com" is
 * rejected with a 422. Prepend the scheme when the user left it out.
 */
function withScheme(url: string): string {
  const value = String(url || '').trim();
  if (!value) {
    return value;
  }
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const photoUrl = (path: string) =>
  /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;

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
      {name === 'camera' && (
        <>
          <Path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" {...line} />
          <Path
            d="M12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
            {...line}
          />
        </>
      )}
      {name === 'chevron' && <Path d="m7.5 10 4.5 4.5L16.5 10" {...line} />}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
    </Svg>
  );
}

function BrandProfileSetup({ token, session, onDone, onLogout }: Props) {
  const [form, setForm] = useState<Form>({
    business_name: String(session.nickname || ''),
  });
  const insets = useSafeAreaInsets();
  // The keyboard covers the gesture bar, so the inset would only show as a gap.
  const keyboardUp = useKeyboardVisible();
  const [logo, setLogo] = useState('');
  const [picker, setPicker] = useState<null | 'industry' | 'country' | 'dial'>(null);
  const [dial, setDial] = useState(DIAL_CODES[0]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');

  const set = useCallback(
    (key: string, value: string) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  const pickLogo = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    setError('');
    try {
      const url = await uploadMedia(
        token,
        { uri: asset.uri, fileName: asset.fileName, type: asset.type },
        'photo',
      );
      setLogo(url);
    } catch (err: any) {
      setError(err?.message || 'Could not upload the logo.');
    } finally {
      setUploading(false);
    }
  }, [token]);

  const save = useCallback(async () => {
    // Required set is the web's: business name, website, phone and country.
    // Industry and GSTIN are optional there, so they are optional here too.
    const required = ['business_name', 'website', 'phone', 'country'];
    const blank = required.filter(key => !String(form[key] || '').trim());

    // Format checks the web runs alongside the required ones.
    const website = String(form.website || '').trim();
    if (website && !URL_RE.test(website) && !blank.includes('website')) {
      blank.push('website');
    }
    const instagram = String(form.instagram || '').trim();
    const badInstagram = !!instagram && !IG_HANDLE_RE.test(instagram);
    if (badInstagram) {
      blank.push('instagram');
    }

    setMissing(blank);
    if (blank.length) {
      setError(
        badInstagram && blank.length === 1
          ? 'Enter a valid Instagram username, for example @yourbrand.'
          : 'Fill in the highlighted fields.',
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      const industry = String(form.industry_category || '');
      await completeProfile(token, 'business', {
        business_name: form.business_name,
        website: withScheme(form.website),
        social_links: {
          ...(instagram
            ? { instagram: `https://instagram.com/${instagramHandle(instagram)}` }
            : {}),
          linkedin: '',
        },
        industry_category:
          industry === 'Other'
            ? String(form.custom_industry || '').trim() || 'Other'
            : industry,
        // Required by the backend's BusinessProfileUpdate model but no longer
        // collected by either client, so both send empty strings.
        business_description: '',
        product_type: '',
        country: form.country,
        phone: `${dial.code} ${String(form.phone || '').trim()}`.trim(),
        gstin: form.gstin || '',
        logo,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [dial, form, logo, onDone, token]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + scale(8) }]}>
        <Text style={styles.brand}>
          UGC<Text style={styles.brandDim}>ad.io</Text>
        </Text>
        <View style={styles.topTag}>
          <Text style={styles.topTagText}>Brand onboarding</Text>
        </View>
        {!!onLogout && (
          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Complete your business profile
            </Text>
            <TouchableOpacity
              style={styles.logoPicker}
              onPress={pickLogo}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Add a logo"
            >
              {uploading ? (
                <ActivityIndicator color="#5B5CF6" />
              ) : logo ? (
                <Image
                  source={{ uri: photoUrl(logo) }}
                  style={styles.logoImage}
                />
              ) : (
                <Icon name="camera" color="#9498B0" size={24} />
              )}
            </TouchableOpacity>
            <Text style={styles.logoHint}>
              {logo ? 'Tap to change logo' : 'Add your logo (optional)'}
            </Text>

            <Text style={styles.sectionTitle}>Business Information</Text>

            <Field
              label="Brand name"
              required
              value={form.business_name || ''}
              onChange={v => set('business_name', v)}
              placeholder="Acme Skincare"
              error={missing.includes('business_name')}
            />

            <Field
              label="Website"
              required
              value={form.website || ''}
              onChange={v => set('website', v)}
              placeholder="yourbrand.com"
              keyboard="url"
              error={missing.includes('website')}
            />

            <Field
              label="Instagram"
              value={form.instagram || ''}
              onChange={v => set('instagram', v)}
              placeholder="@yourbrand"
              error={missing.includes('instagram')}
            />

            {/* Dial code + number, matching the web's split control. */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Phone number
                <Text style={styles.required}> *</Text>
              </Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.dialButton}
                  onPress={() => setPicker('dial')}
                  accessibilityRole="button"
                  accessibilityLabel="Select country dial code"
                >
                  <Text style={styles.dialText}>
                    {dial.label} {dial.code}
                  </Text>
                  <Icon name="chevron" color="#7C819C" size={16} />
                </TouchableOpacity>
                <TextInput
                  style={[
                    styles.input,
                    styles.phoneInput,
                    missing.includes('phone') && styles.inputError,
                  ]}
                  value={form.phone || ''}
                  onChangeText={v => set('phone', v.replace(/\D/g, ''))}
                  placeholder="98765 43210"
                  placeholderTextColor={PLACEHOLDER}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Native stand-in for the web's country <select>. */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Country
                <Text style={styles.required}> *</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.select,
                  missing.includes('country') && styles.inputError,
                ]}
                onPress={() => setPicker('country')}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.selectText,
                    !form.country && styles.selectPlaceholder,
                  ]}
                >
                  {form.country || 'Select a country'}
                </Text>
                <Icon name="chevron" color="#7C819C" size={18} />
              </TouchableOpacity>
            </View>

            {/* Native stand-in for the web's industry <select>. Optional there. */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Industry Category</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setPicker('industry')}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.selectText,
                    !form.industry_category && styles.selectPlaceholder,
                  ]}
                >
                  {form.industry_category || 'Select an industry'}
                </Text>
                <Icon name="chevron" color="#7C819C" size={18} />
              </TouchableOpacity>
            </View>

            {/* Only the web's "Other" branch asks for a typed industry. */}
            {form.industry_category === 'Other' && (
              <Field
                label="Tell us your industry"
                value={form.custom_industry || ''}
                onChange={v => set('custom_industry', v)}
                placeholder="e.g., Pet care"
              />
            )}

            <Field
              label="GSTIN"
              value={form.gstin || ''}
              onChange={v => set('gstin', v.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
            />
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.note}>
            Your account goes to our team for a quick review after this. You can
            explore the app while it's pending.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: scale(12) + (keyboardUp ? 0 : insets.bottom) }]}>
          <TouchableOpacity
            style={[styles.submit, saving && styles.submitOff]}
            onPress={save}
            disabled={saving || uploading}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Submit for Review</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* One sheet serves all three lists; `picker` says which one is open. */}
      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPicker(null)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {picker === 'country'
                ? 'Select a country'
                : picker === 'dial'
                ? 'Select a dial code'
                : 'Select an industry'}
            </Text>
            <ScrollView>
              {picker === 'dial'
                ? DIAL_CODES.map(option => {
                    const active = dial.label === option.label;
                    return (
                      <TouchableOpacity
                        key={option.label}
                        style={styles.modalRow}
                        onPress={() => {
                          setDial(option);
                          setPicker(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.modalRowText,
                            active && styles.modalRowTextOn,
                          ]}
                        >
                          {option.label} {option.code}
                        </Text>
                        {active && (
                          <Icon name="check" color="#4C5BF3" size={18} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                : (picker === 'country' ? COUNTRIES : INDUSTRIES).map(option => {
                    const key =
                      picker === 'country' ? 'country' : 'industry_category';
                    const active = form[key] === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={styles.modalRow}
                        onPress={() => {
                          set(key, option);
                          setPicker(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.modalRowText,
                            active && styles.modalRowTextOn,
                          ]}
                        >
                          {option}
                        </Text>
                        {active && (
                          <Icon name="check" color="#4C5BF3" size={18} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/** Labelled text field — same styling as the rest of the native app. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  keyboard,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'url' | 'phone-pad';
  error?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error && styles.inputError,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || label}
        placeholderTextColor={PLACEHOLDER}
        keyboardType={keyboard || 'default'}
        autoCapitalize={keyboard === 'url' ? 'none' : 'sentences'}
        autoCorrect={false}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  dialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: INK_BORDER,
    backgroundColor: INK_SOFT,
  },
  dialText: { fontSize: fontScale(14), color: ACCENT_TEXT },
  phoneInput: { flex: 1 },
  flex: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(16),
    paddingBottom: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  brand: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    color: ACCENT,
  },
  brandDim: { color: '#FFFFFF' },
  topTag: {
    marginLeft: 'auto',
    paddingHorizontal: scale(12),
    paddingVertical: scale(5),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topTagText: { fontSize: fontScale(11.5), color: INK_MUTED },
  cardTitle: {
    marginBottom: scale(4),
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#FFFFFF',
  },
  header: {
    paddingHorizontal: scale(16),
    paddingTop: scale(12),
    paddingBottom: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: { marginTop: scale(2), fontSize: fontScale(11), color: ON_DARK_MUTED },
  logout: {
    paddingHorizontal: scale(8),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },

  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(24) },
  card: {
    padding: scale(16),
    paddingTop: scale(18),
    borderRadius: scale(16),
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  logoPicker: {
    alignSelf: 'center',
    width: scale(86),
    height: scale(86),
    borderRadius: scale(43),
    backgroundColor: INK_SOFT,
    borderWidth: 1,
    borderColor: INK_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  logoHint: {
    marginTop: scale(8),
    textAlign: 'center',
    fontSize: fontScale(11),
    color: INK_MUTED,
  },

  sectionTitle: {
    marginTop: scale(20),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: ACCENT_TEXT,
  },

  field: { marginTop: scale(14) },
  fieldLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: ACCENT_TEXT,
    marginBottom: scale(7),
  },
  required: { color: '#E5484D' },
  input: {
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: INK_SOFT,
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    fontSize: fontScale(15),
    color: ACCENT_TEXT,
  },
  inputMultiline: { minHeight: scale(96), textAlignVertical: 'top' },
  inputError: { borderColor: '#E5484D', backgroundColor: '#FFF6F6' },

  select: {
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: fontScale(15), color: ACCENT_TEXT },
  selectPlaceholder: { color: PLACEHOLDER },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(21,22,63,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    paddingHorizontal: scale(16),
    paddingTop: scale(16),
    paddingBottom: scale(24),
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    backgroundColor: SHEET,
    borderWidth: 1,
    borderColor: INK_BORDER,
  },
  modalTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: ACCENT_TEXT,
    marginBottom: scale(6),
  },
  modalRow: {
    paddingVertical: scale(14),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalRowText: { fontSize: fontScale(14), color: ACCENT_TEXT },
  modalRowTextOn: {
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: ACCENT,
  },

  errorBox: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFE6E7',
  },
  errorText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C4373B',
  },

  note: {
    marginTop: scale(14),
    fontSize: fontScale(11),
    lineHeight: fontScale(17),
    color: ON_DARK_MUTED,
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderTopWidth: 1,
    borderTopColor: '#EDEEF6',
    backgroundColor: BACKDROP,
  },
  submit: {
    height: scale(50),
    borderRadius: scale(14),
    backgroundColor: '#1B2A6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default BrandProfileSetup;
