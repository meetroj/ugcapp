/**
 * Brand onboarding — the native replacement for the web
 * /profile-setup/business page. Field-for-field the same form the website
 * shows: business description, product type and industry category, then the
 * online presence block (website, Facebook, Instagram, LinkedIn).
 *
 * Submits PUT /api/profile/business, which sets profile_completed and moves
 * the account to PENDING approval.
 *
 * The website and Instagram fields are checked twice, exactly like the web
 * page: a format regex as you type, then a live probe on blur that asks the
 * backend to actually resolve the site / look the handle up. The regex alone
 * happily accepts "asdasd.com" — only the probe catches a domain that doesn't
 * exist.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import {
  checkInstagramLive,
  checkWebsiteLive,
  completeProfile,
  getMe,
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

/** Leading glyph per probe verdict — the web renders the same three. */
const PROBE_PREFIX: Record<string, string> = {
  checking: '',
  valid: '✓ ',
  invalid: '✕ ',
  uncertain: '⚠ ',
};

type Probe = {
  status: 'checking' | 'valid' | 'invalid' | 'uncertain';
  msg: string;
} | null;

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
  const [picker, setPicker] = useState<null | 'industry' | 'country' | 'dial'>(null);
  const [dial, setDial] = useState(DIAL_CODES[0]);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');
  // Live reachability verdicts, cleared whenever the field is edited so an old
  // answer never describes a new value.
  const [webCheck, setWebCheck] = useState<Probe>(null);
  const [igCheck, setIgCheck] = useState<Probe>(null);

  const set = useCallback(
    (key: string, value: string) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  /**
   * Prefill with the profile already on file, so a brand asked for "more info"
   * (or just re-editing) doesn't retype the whole form — the same thing the web
   * page does. Reads /auth/me rather than the session, whose copy of `profile`
   * can be a login response old enough to predate the last edit.
   *
   * The stored shape differs from this form's, so every field is mapped back
   * explicitly: spreading would silently drop all of them.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      let profile: Record<string, any> | null = null;
      try {
        const me = await getMe(token);
        profile = (me?.profile as Record<string, any>) || null;
      } catch {
        // Never block a first-time signup on this — an empty form is the
        // correct fallback.
        profile = (session.profile as Record<string, any>) || null;
      }
      if (!alive || !profile || !Object.keys(profile).length) return;

      const industry = String(profile.industry_category || '');
      const knownIndustry = INDUSTRIES.includes(industry);

      // Phone is stored with the dial code baked in ("+91 98765 43210").
      const storedPhone = String(profile.phone || '').trim();
      const matchedDial =
        DIAL_CODES.find(option => storedPhone.startsWith(`${option.code} `)) ||
        DIAL_CODES.find(option => storedPhone.startsWith(option.code));
      const barePhone = matchedDial
        ? storedPhone.slice(matchedDial.code.length).trim()
        : storedPhone;
      if (matchedDial) setDial(matchedDial);

      setForm(current => ({
        ...current,
        business_name: profile.business_name || current.business_name,
        website: profile.website || current.website || '',
        instagram:
          instagramHandle(String((profile.social_links || {}).instagram || '')) ||
          current.instagram ||
          '',
        phone: barePhone || current.phone || '',
        country: profile.country || current.country || '',
        industry_category: industry
          ? knownIndustry
            ? industry
            : 'Other'
          : current.industry_category || '',
        custom_industry:
          industry && !knownIndustry
            ? industry
            : current.custom_industry || '',
        gstin: profile.gstin || current.gstin || '',
      }));
    })();
    return () => {
      alive = false;
    };
  }, [session.profile, token]);

  /**
   * Website probe, run on blur. Skipped when the value is not even a
   * well-formed URL — the format error already covers that case.
   */
  const probeWebsite = useCallback(async () => {
    const value = String(form.website || '').trim();
    if (!value || !URL_RE.test(value)) {
      setWebCheck(null);
      return;
    }
    setWebCheck({ status: 'checking', msg: 'Checking website…' });
    const result = await checkWebsiteLive(token, value);
    setWebCheck(
      result.valid
        ? { status: 'valid', msg: 'Website is live and reachable.' }
        : result.uncertain
        ? {
            status: 'uncertain',
            msg: "We couldn't complete the check. You can continue.",
          }
        : {
            status: 'invalid',
            msg: "We couldn't reach this website — check the address.",
          },
    );
  }, [form.website, token]);

  /**
   * Instagram probe, run on blur. Instagram serves servers a login wall, so a
   * `uncertain` verdict is normal and only warns — it never blocks the form.
   */
  const probeInstagram = useCallback(async () => {
    const value = String(form.instagram || '').trim();
    if (!value || !IG_HANDLE_RE.test(value)) {
      setIgCheck(null);
      return;
    }
    setIgCheck({ status: 'checking', msg: 'Checking Instagram…' });
    const result = await checkInstagramLive(token, instagramHandle(value));
    setIgCheck(
      result.valid
        ? { status: 'valid', msg: 'Instagram account found.' }
        : result.reason === 'not_found'
        ? { status: 'invalid', msg: "This Instagram username doesn't exist." }
        : {
            status: 'uncertain',
            msg: "Format looks fine, but Instagram blocks automated checks so we can't confirm it exists.",
          },
    );
  }, [form.instagram, token]);

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

    // The format regex passes anything domain-shaped, so a made-up address
    // only gets caught here. If the field was never blurred there is no
    // verdict yet — run the probe now rather than letting it through.
    let web = webCheck;
    if (!web || web.status === 'checking') {
      // Takes a few seconds, so hold the button in its saving state — without
      // this the form looks frozen and invites a second tap.
      setSaving(true);
      setError('');
      setWebCheck({ status: 'checking', msg: 'Checking website…' });
      const result = await checkWebsiteLive(token, website);
      web = result.valid
        ? { status: 'valid' as const, msg: 'Website is live and reachable.' }
        : result.uncertain
        ? {
            status: 'uncertain' as const,
            msg: "We couldn't complete the check. You can continue.",
          }
        : {
            status: 'invalid' as const,
            msg: "We couldn't reach this website — check the address.",
          };
      setWebCheck(web);
    }
    if (web.status === 'invalid') {
      setSaving(false);
      setMissing(['website']);
      setError(
        "That website doesn't seem to be reachable. Please enter a valid business website.",
      );
      return;
    }
    // A handle Instagram positively reported as missing blocks too; an
    // "uncertain" verdict (login wall) does not.
    if (igCheck?.status === 'invalid') {
      setSaving(false);
      setMissing(['instagram']);
      setError("That Instagram account doesn't exist. Please check the username.");
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
        // The logo upload was dropped from onboarding; brands add one later
        // from Settings, and the backend treats an empty string as "none".
        logo: '',
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [dial, form, igCheck, onDone, token, webCheck]);

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
              onChange={v => {
                set('website', v);
                setWebCheck(null);
              }}
              onBlur={probeWebsite}
              placeholder="yourbrand.com"
              keyboard="url"
              error={missing.includes('website') || webCheck?.status === 'invalid'}
              probe={webCheck}
            />

            <Field
              label="Instagram"
              value={form.instagram || ''}
              onChange={v => {
                set('instagram', v);
                setIgCheck(null);
              }}
              onBlur={probeInstagram}
              placeholder="@yourbrand"
              keyboard="url"
              error={missing.includes('instagram') || igCheck?.status === 'invalid'}
              probe={igCheck}
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
            disabled={saving}
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
  onBlur,
  probe,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'url' | 'phone-pad';
  error?: boolean;
  onBlur?: () => void;
  /** Live reachability verdict, rendered as a coloured line under the input. */
  probe?: Probe;
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
        onBlur={onBlur}
      />
      {!!probe && (
        <Text
          style={[
            styles.probeLine,
            probe.status === 'valid' && styles.probeOk,
            probe.status === 'invalid' && styles.probeBad,
            probe.status === 'uncertain' && styles.probeWarn,
          ]}
        >
          {PROBE_PREFIX[probe.status]}
          {probe.msg}
        </Text>
      )}
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
    // Same white-alpha hairline as the rest of the card. The old light-theme
    // grey (#E2E4F0) read as bright white lines on the dark backdrop.
    borderColor: INK_BORDER,
    backgroundColor: INK_SOFT,
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    fontSize: fontScale(15),
    color: ACCENT_TEXT,
  },
  inputMultiline: { minHeight: scale(96), textAlignVertical: 'top' },
  // Red-tinted, not white: a white fill under white text made the field vanish.
  inputError: { borderColor: '#E5484D', backgroundColor: 'rgba(229,72,77,0.14)' },
  // The web's coloured probe line: green reachable, red dead, amber unknown.
  probeLine: { marginTop: scale(5), fontSize: fontScale(12), color: '#94A3B8' },
  probeOk: { color: '#34D399' },
  probeBad: { color: '#F87171' },
  probeWarn: { color: '#FBBF24' },

  select: {
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: INK_BORDER,
    // Dark fill like the inputs. The old near-white (#FBFBFE) under white
    // selectText made Country/Industry unreadable white-on-white boxes.
    backgroundColor: INK_SOFT,
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(229,72,77,0.16)',
  },
  errorText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#FF8B8F',
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
    // White-alpha hairline; the light-theme grey showed as a hard white line.
    borderTopColor: 'rgba(255,255,255,0.08)',
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
