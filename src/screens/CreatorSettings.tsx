/**
 * Creator account settings — the native version of the website's creator
 * profile editor (Frontend/src/components/CreatorProfileModal.js).
 *
 * Layout mirrors the web: "My Work" first (portfolio clips, add/edit/remove),
 * then "Profile Details" as collapsible sections — Basic Information, Location
 * & Contact, Skills & Languages, Recording Setup, Pricing & Delivery — each
 * holding the same fields, option lists and validation the web form uses.
 *
 * Two separate writes, matching the web exactly:
 *   • My Work      → PATCH /api/profile/portfolio  (replaces the array)
 *   • the sections → PUT   /api/profile/creator    (replaces the profile)
 *
 * The details write REPLACES the whole profile object, so `save` spreads the
 * profile that was loaded and overwrites only edited keys — dropping that
 * spread would wipe onboarding answers. It also re-submits the profile for
 * review; the website does the same on this save ("submitted for review"), so
 * that is expected here rather than a bug. The older PUT /profile/update-info
 * is deliberately NOT used: it whitelists bio/gender/country/age_range/
 * languages and silently discards address, skills, setup and pricing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Svg, { Path } from 'react-native-svg';
import { Text, TextInput } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonForm } from '../components/Skeleton';
import {
  BACKEND_URL,
  getMe,
  saveCreatorProfile,
  savePortfolio,
  uploadMedia,
  type AuthUser,
} from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  session: AuthUser;
  onBack: () => void;
};

/* ---------------------------------------------------------------- *
 * Option lists — copied from the web editor so both offer the same
 * choices. Diverging here would let a creator pick a value on the
 * phone that the website cannot display.
 * ---------------------------------------------------------------- */
const GENDERS = ['Male', 'Female', 'Other'];
const BODY_TYPES = ['Average', 'Slim', 'Athletic', 'Plus Size', 'No Preference'];
const SKIN_TONES = ['Fair', 'Brown', 'Dark', 'No preference'];
const SKILLS_OPTS = [
  'Script Writing',
  'Voiceovers',
  'Acting',
  'Videography (DOP)',
  'Video Editing',
  'Modelling',
];
const LANGUAGES_OPTS = [
  'English',
  'Hindi',
  'Bengali',
  'Marathi',
  'Tamil',
  'Telugu',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Bhojpuri',
];
const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
];
const STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];
const CORE_SETUP_OPTS = [
  'DSLR Camera',
  'Iphone',
  'Android Phone',
  'Tripod / Stable mount',
  'External microphone',
  'Quiet / noise-controlled room',
  'Artificial lighting',
  'Green screen',
  'Aesthetic background',
];
const APPEAR_IN_OPTS = [
  'Solo only',
  'Friends / peers',
  'Family members',
  'Pets / animals',
];
const WEEKLY_OPTS = [
  '1–5 hrs / week',
  '6–10 hrs / week',
  '11–20 hrs / week',
  '20+ hrs / week',
];
const TOPICS_OPTS = ['None', 'Alcohol', 'Gambling', 'Adult products'];

/** The web caps My Work at 5 clips; the same limit is enforced here. */
const MAX_WORK = 5;

type Form = Record<string, any>;
type WorkItem = Record<string, any>;

/** Portfolio entries are stored either as a bare URL or as an item object. */
function workUrl(item: WorkItem | string): string {
  if (typeof item === 'string') return item;
  return (
    item?.videoUrl || (Array.isArray(item?.urls) ? item.urls[0] : '') || ''
  );
}

/** Digits of an item's price, for the badge on its tile. '' when unpriced. */
function priceOf(item: WorkItem | string): string {
  if (typeof item === 'string') return '';
  return String(item?.price || '').replace(/[^0-9]/g, '');
}

/** Relative upload paths need the backend origin before they will load. */
function absolute(url: string): string {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_URL}${url}`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d={open ? 'm7 14 5-5 5 5' : 'm7 10 5 5 5-5'}
        stroke="#7E829D"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A labelled text field. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={next =>
          onChange(numeric ? next.replace(/[^0-9]/g, '') : next)
        }
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        keyboardType={numeric ? 'number-pad' : 'default'}
      />
    </View>
  );
}

/**
 * Single-choice list rendered as chips. The web uses a <select>; a native
 * picker would need an extra dependency, and chips keep every option one tap
 * away instead of behind a modal.
 */
function Choice({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.emptyHint}>{placeholder || 'No options'}</Text>
      ) : (
        <View style={styles.chips}>
          {options.map(option => {
            const on = value === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => onChange(on ? '' : option)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Multi-select chips — the web's ChipsPick. */
function MultiChoice({
  label,
  values,
  options,
  onToggle,
}: {
  label: string;
  values: string[];
  options: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map(option => {
          const on = values.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onToggle(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** One collapsible "Profile Details" card. */
function Section({
  title,
  sub,
  open,
  onToggle,
  children,
}: {
  title: string;
  sub: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.sectionText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Chevron open={open} />
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function CreatorSettings({ token, onBack }: Props) {
  // The profile exactly as loaded. Kept whole because the save replaces the
  // stored object — spreading this preserves keys this screen never edits.
  const [loaded, setLoaded] = useState<Form>({});
  const [form, setForm] = useState<Form>({});
  const [work, setWork] = useState<WorkItem[]>([]);
  /**
   * The clip whose details are being filled in. Held separately from `work` so
   * a cancelled edit leaves the saved array untouched. `index` is null while a
   * freshly uploaded clip has not been added to the array yet.
   */
  // Separate from `uploading`: the upload finishes before the details form
  // opens, and the form has its own in-flight state.
  const [savingWork, setSavingWork] = useState(false);
  const [draft, setDraft] = useState<{
    index: number | null;
    url: string;
    brand: string;
    category: string;
    price: string;
    delivery: string;
  } | null>(null);
  const [open, setOpen] = useState<string | null>('Basic Information');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const set = useCallback((key: string, value: any) => {
    setSaved(false);
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback((key: string, option: string) => {
    setSaved(false);
    setForm(prev => {
      const list: string[] = Array.isArray(prev[key]) ? prev[key] : [];
      return {
        ...prev,
        [key]: list.includes(option)
          ? list.filter(v => v !== option)
          : [...list, option],
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getMe(token);
        if (!active) return;
        const profile = (me?.profile || {}) as Form;
        const social = (profile.social_links || {}) as Form;
        const rate = (profile.rate_card || {}) as Form;
        setLoaded(profile);
        setForm({
          fullName: profile.fullName || '',
          age: String(profile.age || ''),
          gender: profile.gender || '',
          bodyType: profile.bodyType || '',
          skinTone: profile.skinTone || '',
          bio: profile.bio || profile.description || '',
          country: profile.country || '',
          state: profile.state || '',
          city: profile.city || '',
          pincode: profile.pincode || '',
          phone: profile.phone || '',
          address: profile.address || '',
          skills: Array.isArray(profile.skills)
            ? profile.skills
            : Array.isArray((me as Form)?.tags)
            ? (me as Form).tags
            : [],
          languages: Array.isArray(profile.languages) ? profile.languages : [],
          youtube: social.youtube || '',
          instagram: social.instagram || '',
          linkedin: social.linkedin || '',
          tiktok: social.tiktok || '',
          coreSetup: Array.isArray(profile.coreSetup) ? profile.coreSetup : [],
          appearIn: Array.isArray(profile.appearIn) ? profile.appearIn : [],
          bring: profile.bring || '',
          weekly:
            profile.weekly || profile.availability_calendar?.weekly || '',
          flexible: !!profile.flexible,
          topics: Array.isArray(profile.topics) ? profile.topics : [],
          expectedPayout: rate.expected_payout || profile.expectedPayout || '',
          deliveryDays: String(
            profile.delivery_days || rate.delivery_days || '',
          ),
        });
        const items = (me as Form)?.portfolio;
        setWork(Array.isArray(items) ? items : []);
      } catch {
        if (active) setError('Could not load your profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  /** Cities depend on the chosen state, mirroring the web's cascading select. */
  const cityHint = form.state
    ? 'Your city'
    : 'Choose a state first';

  const addWork = useCallback(async () => {
    if (work.length >= MAX_WORK) {
      Alert.alert(
        'Limit reached',
        `You can add a maximum of ${MAX_WORK} work videos.`,
      );
      return;
    }
    const picked = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
    });
    const file = picked.assets?.[0];
    if (!file?.uri) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadMedia(
        token,
        { ...file, uri: file.uri },
        'file',
      );
      // The clip is uploaded but NOT saved yet — the details form below adds
      // it once the creator fills in category / price / delivery, which is
      // what a brand actually sees on each video card.
      setDraft({
        index: null,
        url,
        brand: '',
        category: '',
        price: '',
        delivery: '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that video.');
    } finally {
      setUploading(false);
    }
  }, [token, work]);

  /** Reopens the details form for a clip that is already saved. */
  const editWork = useCallback(
    (index: number) => {
      const item = work[index];
      const meta: WorkItem = typeof item === 'string' ? {} : item || {};
      setDraft({
        index,
        url: workUrl(item),
        brand: String(meta.brand || ''),
        category: String(meta.category || ''),
        price: String(meta.price || ''),
        delivery: String(meta.delivery || ''),
      });
    },
    [work],
  );

  /**
   * Writes the draft back. A new clip is appended; an edited one replaces its
   * entry. The whole array is PATCHed either way, matching the endpoint.
   */
  const saveDraft = useCallback(async () => {
    if (!draft) return;
    const item: WorkItem = {
      title: 'Untitled',
      description: '',
      brand: draft.brand.trim(),
      category: draft.category.trim(),
      price: draft.price.trim(),
      delivery: draft.delivery.trim(),
      videoUrl: draft.url,
      urls: [draft.url],
    };
    const next =
      draft.index == null
        ? [...work, item]
        : work.map((existing, i) => (i === draft.index ? item : existing));
    setSavingWork(true);
    setError('');
    try {
      await savePortfolio(token, next);
      setWork(next);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those details.');
    } finally {
      setSavingWork(false);
    }
  }, [draft, token, work]);

  const removeWork = useCallback(
    (index: number) => {
      Alert.alert('Remove work', 'This clip will be removed from your profile.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const next = work.filter((_, i) => i !== index);
            try {
              await savePortfolio(token, next);
              setWork(next);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not remove that clip.',
              );
            }
          },
        },
      ]);
    },
    [token, work],
  );

  const onSave = useCallback(async () => {
    // The web requires a delivery time; without it brands have no turnaround.
    if (!(Number(form.deliveryDays) > 0)) {
      setError('Enter your typical delivery time (days) under Pricing.');
      setOpen('Pricing & Delivery');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const social = { ...((loaded.social_links || {}) as Form) };
      (['youtube', 'instagram', 'linkedin', 'tiktok'] as const).forEach(key => {
        if (form[key]) social[key] = form[key];
        else delete social[key];
      });
      const skills = Array.isArray(form.skills) ? form.skills : [];
      // Spread `loaded` first: this endpoint replaces the profile wholesale.
      await saveCreatorProfile(token, {
        ...loaded,
        fullName: form.fullName,
        age: form.age,
        gender: form.gender,
        bodyType: form.bodyType,
        skinTone: form.skinTone,
        bio: form.bio,
        country: form.country,
        state: form.state,
        city: form.city,
        pincode: form.pincode,
        phone: form.phone,
        address: form.address,
        languages: Array.isArray(form.languages) ? form.languages : [],
        skills,
        tags: skills,
        social_links: social,
        coreSetup: Array.isArray(form.coreSetup) ? form.coreSetup : [],
        appearIn: Array.isArray(form.appearIn) ? form.appearIn : [],
        bring: form.bring,
        weekly: form.weekly,
        flexible: !!form.flexible,
        topics: Array.isArray(form.topics) ? form.topics : [],
        availability_calendar: {
          ...((loaded.availability_calendar || {}) as Form),
          weekly: form.weekly,
          flexible: !!form.flexible,
        },
        expectedPayout: form.expectedPayout,
        payoutPeriod: 'Per Video',
        delivery_days: Number(form.deliveryDays),
        rate_card: {
          ...((loaded.rate_card || {}) as Form),
          expected_payout: form.expectedPayout,
          payout_period: 'Per Video',
          delivery_days: Number(form.deliveryDays),
        },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }, [form, loaded, token]);

  /** Two rows of three tiles — the cap the brief asks for. */
  const tiles = useMemo(() => work.slice(0, 6), [work]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Account Settings" onBack={onBack} />
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.content}>
            <SkeletonForm rows={6} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ---- My Work ---- */}
            <View style={styles.workHead}>
              <Text style={styles.blockTitle}>My Work</Text>
              <TouchableOpacity
                onPress={addWork}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Add work"
              >
                <Text style={styles.addWork}>
                  {uploading ? 'Uploading…' : '+ Add'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.workHint}>
              {work.length}/{MAX_WORK} clips · tap a clip to edit its details
            </Text>
            <View style={styles.workGrid}>
              {tiles.map((item, index) => {
                const url = absolute(workUrl(item));
                return (
                  <TouchableOpacity
                    key={`${url}-${index}`}
                    style={styles.tile}
                    onPress={() => editWork(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit work ${index + 1}`}
                  >
                    {url ? (
                      <Image
                        source={{ uri: url }}
                        style={styles.tileImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.tileImage} />
                    )}
                    {/* The price is what a brand scans for, so it is the one
                        field surfaced on the tile itself. */}
                    {!!priceOf(item) && (
                      <View style={styles.tilePrice}>
                        <Text style={styles.tilePriceText} numberOfLines={1}>
                          ₹{priceOf(item)}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.tileBadge}
                      onPress={() => removeWork(index)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove work ${index + 1}`}
                    >
                      <Text style={styles.tileBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {work.length === 0 && (
                <Text style={styles.emptyHint}>
                  No clips yet — add up to {MAX_WORK}.
                </Text>
              )}
            </View>

            {/* ---- Profile Details ---- */}
            <Text style={[styles.blockTitle, styles.detailsTitle]}>
              Profile Details
            </Text>

            <Section
              title="Basic Information"
              sub="Name, age, gender, skin tone & more"
              open={open === 'Basic Information'}
              onToggle={() =>
                setOpen(open === 'Basic Information' ? null : 'Basic Information')
              }
            >
              <Field
                label="Full Name"
                value={form.fullName || ''}
                onChange={v => set('fullName', v)}
              />
              <Field
                label="Age"
                value={form.age || ''}
                onChange={v => set('age', v)}
                numeric
                placeholder="For example 24"
              />
              <Choice
                label="Gender"
                value={form.gender || ''}
                options={GENDERS}
                onChange={v => set('gender', v)}
              />
              <Choice
                label="Body Type"
                value={form.bodyType || ''}
                options={BODY_TYPES}
                onChange={v => set('bodyType', v)}
              />
              <Choice
                label="Skin Tone"
                value={form.skinTone || ''}
                options={SKIN_TONES}
                onChange={v => set('skinTone', v)}
              />
              <Field
                label="Bio"
                value={form.bio || ''}
                onChange={v => set('bio', v)}
                placeholder="A short introduction brands see on your profile"
                multiline
              />
            </Section>

            <Section
              title="Location & Contact"
              sub="Address, phone number & pincode"
              open={open === 'Location & Contact'}
              onToggle={() =>
                setOpen(
                  open === 'Location & Contact' ? null : 'Location & Contact',
                )
              }
            >
              <Choice
                label="Country"
                value={form.country || ''}
                options={COUNTRIES}
                onChange={v => set('country', v)}
              />
              <Choice
                label="State"
                value={form.state || ''}
                options={STATES}
                onChange={v => {
                  set('state', v);
                  set('city', '');
                }}
              />
              <Field
                label="City"
                value={form.city || ''}
                onChange={v => set('city', v)}
                placeholder={cityHint}
              />
              <Field
                label="Pincode"
                value={form.pincode || ''}
                onChange={v => set('pincode', v)}
                numeric
              />
              <Field
                label="Phone"
                value={form.phone || ''}
                onChange={v => set('phone', v)}
                numeric
              />
              <Field
                label="Address"
                value={form.address || ''}
                onChange={v => set('address', v)}
                multiline
              />
            </Section>

            <Section
              title="Skills & Languages"
              sub="Your skills, languages & instagram"
              open={open === 'Skills & Languages'}
              onToggle={() =>
                setOpen(
                  open === 'Skills & Languages' ? null : 'Skills & Languages',
                )
              }
            >
              <MultiChoice
                label="Skills"
                values={form.skills || []}
                options={SKILLS_OPTS}
                onToggle={v => toggle('skills', v)}
              />
              <MultiChoice
                label="Languages"
                values={form.languages || []}
                options={LANGUAGES_OPTS}
                onToggle={v => toggle('languages', v)}
              />
              <Field
                label="Instagram"
                value={form.instagram || ''}
                onChange={v => set('instagram', v)}
                placeholder="@handle or link"
              />
              <Field
                label="YouTube"
                value={form.youtube || ''}
                onChange={v => set('youtube', v)}
                placeholder="Channel link"
              />
              <Field
                label="LinkedIn"
                value={form.linkedin || ''}
                onChange={v => set('linkedin', v)}
                placeholder="Profile link"
              />
              <Field
                label="TikTok"
                value={form.tiktok || ''}
                onChange={v => set('tiktok', v)}
                placeholder="@handle or link"
              />
            </Section>

            <Section
              title="Recording Setup"
              sub="Topics you avoid & preferences"
              open={open === 'Recording Setup'}
              onToggle={() =>
                setOpen(open === 'Recording Setup' ? null : 'Recording Setup')
              }
            >
              <MultiChoice
                label="Core Setup"
                values={form.coreSetup || []}
                options={CORE_SETUP_OPTS}
                onToggle={v => toggle('coreSetup', v)}
              />
              <MultiChoice
                label="Who Appears"
                values={form.appearIn || []}
                options={APPEAR_IN_OPTS}
                onToggle={v => toggle('appearIn', v)}
              />
              <MultiChoice
                label="Topics Avoided"
                values={form.topics || []}
                options={TOPICS_OPTS}
                onToggle={v => toggle('topics', v)}
              />
              <Choice
                label="Weekly Availability"
                value={form.weekly || ''}
                options={WEEKLY_OPTS}
                onChange={v => set('weekly', v)}
              />
              <TouchableOpacity
                style={styles.check}
                onPress={() => set('flexible', !form.flexible)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!form.flexible }}
              >
                <View style={[styles.box, form.flexible && styles.boxOn]}>
                  {!!form.flexible && <Text style={styles.tick}>✓</Text>}
                </View>
                <Text style={styles.checkText}>Flexible working hours</Text>
              </TouchableOpacity>
            </Section>

            <Section
              title="Pricing & Delivery"
              sub="Rate, payout & payment details"
              open={open === 'Pricing & Delivery'}
              onToggle={() =>
                setOpen(
                  open === 'Pricing & Delivery' ? null : 'Pricing & Delivery',
                )
              }
            >
              <Field
                label="Expected Payout"
                value={String(form.expectedPayout || '')}
                onChange={v => set('expectedPayout', v)}
                placeholder="For example 5000"
                numeric
              />
              <View style={styles.group}>
                <Text style={styles.label}>Payout Period</Text>
                <View style={[styles.input, styles.readonly]}>
                  <Text style={styles.readonlyText}>Per Video</Text>
                </View>
              </View>
              <Field
                label="Typical Delivery (days)"
                value={form.deliveryDays || ''}
                onChange={v => set('deliveryDays', v)}
                placeholder="e.g. 3"
                numeric
              />
            </Section>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {saved ? (
              <Text style={styles.saved}>
                Saved — your profile was submitted for review.
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.save, saving && styles.saveOff]}
              onPress={onSave}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save changes</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>
              Profile photo and banner are still changed on ugcad.io.
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/*
        Per-clip details. A brand's creator profile shows category, price and
        delivery under every video, so these are collected when the clip is
        added rather than left blank — an unpriced clip falls back to the
        creator's profile-wide rate on the brand's side.
      */}
      <Modal
        visible={!!draft}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDraft(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {draft?.index == null ? 'Add work details' : 'Edit work details'}
            </Text>
            <Text style={styles.modalHint}>
              Brands see these under your video.
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Field
                label="Brand name"
                value={draft?.brand || ''}
                onChange={next =>
                  setDraft(current => (current ? { ...current, brand: next } : current))
                }
                placeholder="Who was this made for?"
              />
              <Field
                label="Category"
                value={draft?.category || ''}
                onChange={next =>
                  setDraft(current =>
                    current ? { ...current, category: next } : current,
                  )
                }
                placeholder="e.g. Beauty"
              />
              <Field
                label="Price / video (₹)"
                value={draft?.price || ''}
                onChange={next =>
                  setDraft(current =>
                    current ? { ...current, price: next } : current,
                  )
                }
                placeholder="e.g. 2000"
                numeric
              />
              <Field
                label="Delivered in"
                value={draft?.delivery || ''}
                onChange={next =>
                  setDraft(current =>
                    current ? { ...current, delivery: next } : current,
                  )
                }
                placeholder="e.g. 2 days"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalGhost}
                onPress={() => setDraft(null)}
                disabled={savingWork}
                accessibilityRole="button"
              >
                <Text style={styles.modalGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={saveDraft}
                disabled={savingWork}
                accessibilityRole="button"
              >
                <Text style={styles.modalPrimaryText}>
                  {savingWork
                    ? 'Saving…'
                    : draft?.index == null
                    ? 'Add work'
                    : 'Update work'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  blockTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  detailsTitle: { marginTop: scale(20), marginBottom: scale(10) },

  workHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addWork: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5B5CF6',
  },
  workHint: {
    marginTop: scale(3),
    marginBottom: scale(9),
    fontSize: fontScale(11),
    color: '#8A8DA6',
  },
  // Three per row, two rows max — the tile width is a third of the sheet less
  // the gaps, so a full grid lines up without a trailing gap.
  workGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  tile: {
    width: '31.5%',
    aspectRatio: 0.72,
    borderRadius: scale(12),
    overflow: 'hidden',
    backgroundColor: '#E7E8F3',
  },
  tileImage: { width: '100%', height: '100%', backgroundColor: '#E7E8F3' },
  tileBadge: {
    position: 'absolute',
    top: scale(5),
    right: scale(5),
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: 'rgba(11,12,38,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tilePrice: {
    position: 'absolute',
    left: scale(5),
    bottom: scale(5),
    maxWidth: '80%',
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(7),
    backgroundColor: 'rgba(11,12,38,0.72)',
  },
  tilePriceText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Work details sheet ────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,13,35,0.45)',
  },
  modalSheet: {
    // Capped so the keyboard still leaves the action row reachable on a short
    // phone; the fields scroll inside.
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    paddingHorizontal: scale(18),
    paddingTop: scale(18),
    paddingBottom: scale(20),
  },
  modalTitle: {
    fontSize: fontScale(18),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  modalHint: {
    marginTop: scale(4),
    marginBottom: scale(14),
    fontSize: fontScale(12),
    color: '#858AA3',
  },
  modalActions: {
    flexDirection: 'row',
    gap: scale(10),
    marginTop: scale(14),
  },
  modalGhost: {
    flex: 1,
    height: scale(48),
    borderRadius: scale(13),
    borderWidth: 1.5,
    borderColor: '#DCDDF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#4C4DD6',
  },
  modalPrimary: {
    flex: 1.35,
    height: scale(48),
    borderRadius: scale(13),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  section: {
    marginBottom: scale(10),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: scale(13),
    gap: scale(10),
  },
  sectionText: { flex: 1 },
  sectionTitle: {
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#15163F',
  },
  sectionSub: {
    marginTop: scale(2),
    fontSize: fontScale(11),
    color: '#8A8DA6',
  },
  sectionBody: {
    paddingHorizontal: scale(14),
    paddingBottom: scale(14),
    borderTopWidth: 1,
    borderTopColor: '#F1F1F8',
    paddingTop: scale(12),
  },

  group: { marginBottom: scale(14) },
  label: {
    marginBottom: scale(6),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#7E829D',
  },
  input: {
    minHeight: scale(46),
    paddingHorizontal: scale(13),
    paddingVertical: scale(11),
    borderRadius: scale(13),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    fontSize: fontScale(13),
    color: '#181943',
  },
  multiline: { minHeight: scale(90), textAlignVertical: 'top' },
  readonly: { justifyContent: 'center', backgroundColor: '#F5F5FB' },
  readonlyText: { fontSize: fontScale(13), color: '#6C7091' },
  emptyHint: { fontSize: fontScale(12), color: '#9295AA' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(7) },
  chip: {
    paddingHorizontal: scale(11),
    paddingVertical: scale(7),
    borderRadius: scale(9),
    backgroundColor: '#F4F4FB',
    borderWidth: 1,
    borderColor: '#EAEAF4',
  },
  chipOn: { backgroundColor: '#EEEFFF', borderColor: '#C9CBFB' },
  chipText: { fontSize: fontScale(12), color: '#5C6180' },
  chipTextOn: {
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },

  check: { flexDirection: 'row', alignItems: 'center', gap: scale(9) },
  box: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(6),
    borderWidth: 1.5,
    borderColor: '#C9CBDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#5B5CF6', borderColor: '#5B5CF6' },
  tick: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  checkText: { fontSize: fontScale(13), color: '#2B2D55' },

  error: {
    marginBottom: scale(10),
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C0392B',
  },
  saved: {
    marginBottom: scale(10),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1FA971',
  },
  save: {
    marginTop: scale(4),
    height: scale(50),
    borderRadius: scale(14),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: { opacity: 0.6 },
  saveText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  note: {
    marginTop: scale(14),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#9295AA',
    textAlign: 'center',
  },
});

export default CreatorSettings;
