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
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
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
  const [logo, setLogo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
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
    // The web marks description, product type and industry as required and
    // leaves everything in the online-presence block optional.
    const required = [
      'business_name',
      'business_description',
      'product_type',
      'industry_category',
    ];
    const blank = required.filter(key => !String(form[key] || '').trim());
    setMissing(blank);
    if (blank.length) {
      setError('Fill in the highlighted fields.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await completeProfile(token, 'business', {
        business_name: form.business_name,
        business_description: form.business_description,
        product_type: form.product_type,
        industry_category: form.industry_category,
        website: form.website || '',
        social_links: {
          facebook: form.facebook || '',
          instagram: form.instagram || '',
          linkedin: form.linkedin || '',
        },
        logo,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [form, logo, onDone, token]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Complete your business profile</Text>
          <Text style={styles.headerSub}>
            Tell creators about your brand and products
          </Text>
        </View>
        {!!onLogout && (
          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>

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
              label="Business Description"
              required
              multiline
              value={form.business_description || ''}
              onChange={v => set('business_description', v)}
              placeholder="Describe your business, products, and what makes your brand unique..."
              error={missing.includes('business_description')}
            />

            <Field
              label="Product Type"
              required
              value={form.product_type || ''}
              onChange={v => set('product_type', v)}
              placeholder="e.g., Clothing, Electronics, Skincare"
              error={missing.includes('product_type')}
            />

            {/* Native stand-in for the web's industry <select>. */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Industry Category
                <Text style={styles.required}> *</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.select,
                  missing.includes('industry_category') && styles.inputError,
                ]}
                onPress={() => setPickerOpen(true)}
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

            <Text style={styles.sectionTitle}>Online Presence</Text>

            <Field
              label="Website URL"
              value={form.website || ''}
              onChange={v => set('website', v)}
              placeholder="https://yourbrand.com"
              keyboard="url"
            />

            <Field
              label="Facebook"
              value={form.facebook || ''}
              onChange={v => set('facebook', v)}
              placeholder="facebook.com/yourpage"
            />

            <Field
              label="Instagram"
              value={form.instagram || ''}
              onChange={v => set('instagram', v)}
              placeholder="@yourbrand"
            />

            <Field
              label="LinkedIn"
              value={form.linkedin || ''}
              onChange={v => set('linkedin', v)}
              placeholder="linkedin.com/company/yourbrand"
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

        <View style={styles.footer}>
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

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPickerOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select an industry</Text>
            <ScrollView>
              {INDUSTRIES.map(industry => {
                const active = form.industry_category === industry;
                return (
                  <TouchableOpacity
                    key={industry}
                    style={styles.modalRow}
                    onPress={() => {
                      set('industry_category', industry);
                      setPickerOpen(false);
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
                      {industry}
                    </Text>
                    {active && <Icon name="check" color="#4C5BF3" size={18} />}
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
        placeholderTextColor="#A9ADC2"
        keyboardType={keyboard || 'default'}
        autoCapitalize={keyboard === 'url' ? 'none' : 'sentences'}
        autoCorrect={false}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  flex: { flex: 1 },
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
    color: '#15163F',
  },
  headerSub: { marginTop: scale(2), fontSize: fontScale(11), color: '#777B96' },
  logout: {
    paddingHorizontal: scale(8),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#4C5BF3',
  },

  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(24) },
  card: {
    padding: scale(16),
    paddingTop: scale(18),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },

  logoPicker: {
    alignSelf: 'center',
    width: scale(86),
    height: scale(86),
    borderRadius: scale(43),
    backgroundColor: '#F4F5FA',
    borderWidth: 1,
    borderColor: '#E2E4F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  logoHint: {
    marginTop: scale(8),
    textAlign: 'center',
    fontSize: fontScale(11),
    color: '#8A8FA8',
  },

  sectionTitle: {
    marginTop: scale(20),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  field: { marginTop: scale(14) },
  fieldLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#15163F',
    marginBottom: scale(7),
  },
  required: { color: '#E5484D' },
  input: {
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    fontSize: fontScale(15),
    color: '#15163F',
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
  selectText: { fontSize: fontScale(15), color: '#15163F' },
  selectPlaceholder: { color: '#A9ADC2' },

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
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
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
  modalRowText: { fontSize: fontScale(14), color: '#15163F' },
  modalRowTextOn: {
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
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
    color: '#8A8FA8',
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderTopWidth: 1,
    borderTopColor: '#EDEEF6',
    backgroundColor: '#FFFFFF',
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
