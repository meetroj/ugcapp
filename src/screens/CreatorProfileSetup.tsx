/**
 * Creator onboarding — the native replacement for the web
 * /profile-setup/creator page. Field-for-field the same form the website
 * shows: username, bio, intro video, portfolio, tags, social links, the
 * three-package rate card, payment methods and the terms checkboxes.
 *
 * The web renders all eight sections on one long page; on a phone that is a
 * punishing scroll, so the same fields are split across four steps. The
 * payload sent to PUT /api/profile/creator is identical either way.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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

type Props = {
  token: string;
  /**
   * Still accepted so the shell can pass it uniformly with the brand screen,
   * but the web form seeds nothing from the session — username and bio are
   * both typed from scratch — so nothing reads it.
   */
  session?: AuthUser;
  onDone: () => void;
  onLogout?: () => void;
};

type Form = Record<string, string>;

/** Same rule the web enforces before it will submit. */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Web caps the bio at 500 characters and the "included" notes at 500 too. */
const BIO_MAX = 500;
const INCLUDED_MAX = 500;

/** Web rejects videos over 50MB and portfolio files over 10MB. */
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const PORTFOLIO_MAX_BYTES = 10 * 1024 * 1024;

const STEPS = ['About you', 'Your work', 'Rates & payment', 'Terms'];

/**
 * The three packages the web rate card collects. Price is required on all
 * three; the "what's included" note beside it is free text.
 */
const PACKAGES = [
  {
    title: 'Basic — 30s Video',
    price: 'video_30s',
    included: 'video_30s_included',
    pricePlaceholder: '100',
    includedPlaceholder:
      'e.g., 1 x 30-second video, B-Roll included, Subtitles, 1 revision, 3 months usage rights',
  },
  {
    title: 'Standard — 60s Video',
    price: 'video_60s',
    included: 'video_60s_included',
    pricePlaceholder: '150',
    includedPlaceholder:
      'e.g., 1 x 60-second video, B-Roll, Graphics, Subtitles, 2 revisions, 6 months usage rights',
  },
  {
    title: 'Premium — Photo Post / Bundle',
    price: 'photo_post',
    included: 'photo_post_included',
    pricePlaceholder: '80',
    includedPlaceholder:
      'e.g., Photo post + 60s video, Full source files, Unlimited revisions, 12 months usage rights',
  },
];

const isVideo = (url: string) => /\.(mp4|mov|webm|avi)$/i.test(url);

const mediaUrl = (path: string) =>
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
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'plus' && <Path d="M12 5.5v13M5.5 12h13" {...line} />}
      {name === 'video' && (
        <>
          <Path d="M3.5 6.5h11v11h-11z" {...line} />
          <Path d="m14.5 12 6-3.5v7z" {...line} />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
      {name === 'trash' && (
        <Path d="M5 7h14M10 7V5.5h4V7M6.5 7l.8 12h9.4l.8-12" {...line} />
      )}
    </Svg>
  );
}

function CreatorProfileSetup({ token, onDone, onLogout }: Props) {
  const [step, setStep] = useState(0);
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<Form>({});
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [introVideo, setIntroVideo] = useState('');
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [receiveBriefs, setReceiveBriefs] = useState(true);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState('');

  const set = useCallback(
    (key: string, value: string) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  const username = form.username || '';
  const bio = form.bio || '';

  /**
   * Mirrors the web's eight-section progress meter so the percentage a
   * creator sees here matches what they'd see on the site.
   */
  const progressPct = useMemo(() => {
    const done = [
      bio.trim().length > 0 && USERNAME_RE.test(username.trim()),
      !!introVideo,
      portfolio.length > 0,
      tags.length > 0,
      !!(form.instagram || form.youtube),
      !!(form.video_30s && form.video_60s && form.photo_post),
      !!form.upi,
      termsAgreed,
    ].filter(Boolean).length;
    return Math.round((done / 8) * 100);
  }, [
    bio,
    form,
    introVideo,
    portfolio.length,
    tags.length,
    termsAgreed,
    username,
  ]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag)) return;
    setTags(prev => [...prev, tag]);
    setTagInput('');
  }, [tagInput, tags]);

  const pickIntroVideo = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > VIDEO_MAX_BYTES) {
      setError('Video file too large. Maximum 50MB allowed.');
      return;
    }

    setUploadingVideo(true);
    setError('');
    try {
      setIntroVideo(
        await uploadMedia(
          token,
          { uri: asset.uri, fileName: asset.fileName, type: asset.type },
          'file',
        ),
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to upload video');
    } finally {
      setUploadingVideo(false);
    }
  }, [token]);

  const addPortfolio = useCallback(async () => {
    // The web lets you multi-select; image-picker does too, and each file is
    // uploaded separately so one oversized pick doesn't lose the rest.
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      selectionLimit: 0,
      quality: 0.8,
    });
    const assets = (result.assets || []).filter(asset => !!asset.uri);
    if (!assets.length) return;

    setUploadingPortfolio(true);
    setError('');
    try {
      const urls: string[] = [];
      for (const asset of assets) {
        if (asset.fileSize && asset.fileSize > PORTFOLIO_MAX_BYTES) {
          throw new Error(
            `${
              asset.fileName || 'That file'
            } is too large. Maximum 10MB per file.`,
          );
        }
        urls.push(
          await uploadMedia(
            token,
            { uri: asset.uri!, fileName: asset.fileName, type: asset.type },
            'file',
          ),
        );
      }
      setPortfolio(prev => [...prev, ...urls]);
    } catch (err: any) {
      // The backend OCR-scans uploads and rejects images carrying contact
      // details, so this message is worth showing verbatim.
      setError(err?.message || 'Failed to upload portfolio items');
    } finally {
      setUploadingPortfolio(false);
    }
  }, [token]);

  /** The web validates username, tags and terms; each is checked on its step. */
  const checkStep = useCallback(
    (index: number): string[] => {
      if (index === 0) {
        const blank: string[] = [];
        if (!USERNAME_RE.test(username.trim())) blank.push('username');
        if (!bio.trim()) blank.push('bio');
        return blank;
      }
      if (index === 1) return tags.length ? [] : ['tags'];
      if (index === 2) {
        return PACKAGES.map(p => p.price)
          .concat('upi')
          .filter(key => !String(form[key] || '').trim());
      }
      return termsAgreed ? [] : ['terms'];
    },
    [bio, form, tags.length, termsAgreed, username],
  );

  const messageFor = useCallback(
    (index: number, blank: string[]) => {
      if (index === 0) {
        return blank.includes('username') && username.trim()
          ? 'Username must be 3–20 characters: lowercase letters, numbers, or underscores'
          : 'Fill in the highlighted fields.';
      }
      if (index === 1) return 'Please add at least one tag/niche';
      if (index === 3) return 'Please agree to the terms and conditions';
      return 'Fill in the highlighted fields.';
    },
    [username],
  );

  const next = useCallback(() => {
    const blank = checkStep(step);
    setMissing(blank);
    if (blank.length) {
      setError(messageFor(step, blank));
      return;
    }
    setError('');
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }, [checkStep, messageFor, step]);

  const save = useCallback(async () => {
    // Re-check every step, not just the last one, so a creator who jumped
    // back and cleared a required field can't submit an invalid profile.
    for (let index = 0; index < STEPS.length; index += 1) {
      const blank = checkStep(index);
      if (blank.length) {
        setStep(index);
        setMissing(blank);
        setError(messageFor(index, blank));
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      await completeProfile(token, 'creator', {
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        tags,
        social_links: {
          instagram: form.instagram || '',
          youtube: form.youtube || '',
          tiktok: form.tiktok || '',
        },
        rate_card: {
          video_30s: form.video_30s || '',
          video_30s_included: form.video_30s_included || '',
          video_60s: form.video_60s || '',
          video_60s_included: form.video_60s_included || '',
          photo_post: form.photo_post || '',
          photo_post_included: form.photo_post_included || '',
        },
        payment_methods: {
          upi: form.upi || '',
          bank_account: form.bank_account || '',
        },
        receive_briefs: receiveBriefs,
        terms_agreed: termsAgreed,
        intro_video: introVideo,
        portfolio,
        availability_calendar: {},
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [
    bio,
    checkStep,
    form,
    introVideo,
    messageFor,
    onDone,
    portfolio,
    receiveBriefs,
    tags,
    termsAgreed,
    token,
    username,
  ]);

  const last = step === STEPS.length - 1;
  const busy = uploadingVideo || uploadingPortfolio;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {step > 0 ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setStep(s => s - 1)}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="back" color="#15163F" size={22} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Complete your creator profile</Text>
          <Text style={styles.headerSub}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]} · {progressPct}%
            complete
          </Text>
        </View>
        {!!onLogout && step === 0 && (
          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.progress}>
        {STEPS.map((_, index) => (
          <View
            key={index}
            style={[styles.progressBar, index <= step && styles.progressOn]}
          />
        ))}
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
            {step === 0 && (
              <>
                <SectionHead
                  number={1}
                  title="About You"
                  hint="Introduce yourself in your own words."
                />

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Username
                    <Text style={styles.required}> *</Text>
                  </Text>
                  <Text style={styles.labelMeta}>
                    3–20 chars · lowercase, numbers, _
                  </Text>
                  <View
                    style={[
                      styles.usernameWrap,
                      missing.includes('username') && styles.inputError,
                    ]}
                  >
                    <Text style={styles.usernamePrefix}>@</Text>
                    <TextInput
                      style={styles.usernameInput}
                      value={username}
                      // Same sanitising the web does as you type.
                      onChangeText={value =>
                        set(
                          'username',
                          value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                        )
                      }
                      placeholder="yourname"
                      placeholderTextColor="#A9ADC2"
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <Text style={styles.charCount}>
                    {username.length}/20 characters
                  </Text>
                </View>

                <Field
                  label="Bio"
                  meta="(100 words max)"
                  required
                  multiline
                  value={bio}
                  onChange={v => set('bio', v)}
                  placeholder="Tell brands about yourself, your style, and expertise..."
                  maxLength={BIO_MAX}
                  counter
                  error={missing.includes('bio')}
                />
              </>
            )}

            {step === 1 && (
              <>
                <SectionHead
                  number={2}
                  title="Intro Video"
                  optional
                  hint="A 30–60s clip introducing yourself helps brands trust you faster."
                />
                <TouchableOpacity
                  style={[
                    styles.dropzone,
                    !!introVideo && styles.dropzoneFilled,
                  ]}
                  onPress={pickIntroVideo}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {uploadingVideo ? (
                    <ActivityIndicator color="#5B5CF6" />
                  ) : introVideo ? (
                    <>
                      <Icon name="check" color="#2F9E62" size={26} />
                      <Text style={styles.dropzoneText}>Video uploaded</Text>
                      <Text style={styles.dropzoneSub}>Tap to replace</Text>
                    </>
                  ) : (
                    <>
                      <Icon name="video" color="#4C5BF3" size={26} />
                      <Text style={styles.dropzoneText}>Choose video</Text>
                      <Text style={styles.dropzoneSub}>
                        MP4, MOV, WEBM · Max 50MB
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {!!introVideo && (
                  <TouchableOpacity
                    onPress={() => setIntroVideo('')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ghostBtn}>Remove video</Text>
                  </TouchableOpacity>
                )}

                <SectionHead
                  number={3}
                  title="Portfolio"
                  optional
                  hint="Past work that shows your style. Max 10MB per file."
                />
                <TouchableOpacity
                  style={styles.dropzone}
                  onPress={addPortfolio}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {uploadingPortfolio ? (
                    <ActivityIndicator color="#5B5CF6" />
                  ) : (
                    <>
                      <Icon name="plus" color="#4C5BF3" size={22} />
                      <Text style={styles.dropzoneText}>
                        Add portfolio items
                      </Text>
                      <Text style={styles.dropzoneSub}>
                        Images or videos · Select multiple
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {portfolio.length > 0 && (
                  <View style={styles.portfolioGrid}>
                    {portfolio.map((url, index) => (
                      <View key={url + index} style={styles.portfolioItem}>
                        {isVideo(url) ? (
                          <View style={styles.portfolioVideo}>
                            <Icon name="video" color="#6C71A0" size={20} />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: mediaUrl(url) }}
                            style={styles.portfolioImage}
                          />
                        )}
                        <TouchableOpacity
                          style={styles.portfolioRemove}
                          onPress={() =>
                            setPortfolio(prev =>
                              prev.filter(item => item !== url),
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Remove item"
                        >
                          <Text style={styles.portfolioRemoveText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <SectionHead
                  number={4}
                  title="Tags & Niche"
                  hint="Help brands discover you by your strengths."
                />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Add Tags
                    <Text style={styles.required}> *</Text>
                  </Text>
                  <Text style={styles.labelMeta}>
                    (Fashion, Beauty, Tech, etc.)
                  </Text>
                  <View style={styles.tagRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.tagInput,
                        missing.includes('tags') && styles.inputError,
                      ]}
                      value={tagInput}
                      onChangeText={setTagInput}
                      onSubmitEditing={addTag}
                      placeholder="Type and press Enter"
                      placeholderTextColor="#A9ADC2"
                      returnKeyType="done"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.tagAdd}
                      onPress={addTag}
                      accessibilityRole="button"
                    >
                      <Text style={styles.tagAddText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                  {tags.length > 0 && (
                    <View style={styles.chipWrap}>
                      {tags.map(tag => (
                        <View key={tag} style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>{tag}</Text>
                          <TouchableOpacity
                            onPress={() =>
                              setTags(prev => prev.filter(item => item !== tag))
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${tag}`}
                          >
                            <Text style={styles.tagBadgeRemove}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <SectionHead
                  number={5}
                  title="Social Links"
                  pill="Private"
                  hint="Used internally for verification — hidden from public view."
                />
                <Field
                  label="Instagram"
                  value={form.instagram || ''}
                  onChange={v => set('instagram', v)}
                  placeholder="@username"
                />
                <Field
                  label="YouTube"
                  value={form.youtube || ''}
                  onChange={v => set('youtube', v)}
                  placeholder="Channel URL"
                />
              </>
            )}

            {step === 2 && (
              <>
                <SectionHead
                  number={6}
                  title="Rate Card"
                  hint="Set your price for each package and describe what is included."
                />
                {PACKAGES.map(pkg => (
                  <View key={pkg.price} style={styles.package}>
                    <Text style={styles.packageTitle}>{pkg.title}</Text>
                    <Field
                      label="Price ($)"
                      required
                      value={form[pkg.price] || ''}
                      onChange={v => set(pkg.price, v)}
                      placeholder={pkg.pricePlaceholder}
                      keyboard="numeric"
                      error={missing.includes(pkg.price)}
                    />
                    <Field
                      label="What's Included"
                      multiline
                      value={form[pkg.included] || ''}
                      onChange={v => set(pkg.included, v)}
                      placeholder={pkg.includedPlaceholder}
                      maxLength={INCLUDED_MAX}
                      counter
                    />
                  </View>
                ))}

                <SectionHead
                  number={7}
                  title="Payment Methods"
                  hint="Where you'd like to receive payouts."
                />
                <Field
                  label="UPI ID"
                  required
                  value={form.upi || ''}
                  onChange={v => set('upi', v)}
                  placeholder="yourname@upi"
                  error={missing.includes('upi')}
                />
                <Field
                  label="Bank Account (Last 4 digits)"
                  value={form.bank_account || ''}
                  onChange={v => set('bank_account', v)}
                  placeholder="XXXX1234"
                />
              </>
            )}

            {step === 3 && (
              <>
                <SectionHead
                  number={8}
                  title="Preferences & Terms"
                  hint="Final step before review."
                />
                <Checkbox
                  label="I want to receive campaign briefs"
                  checked={receiveBriefs}
                  onToggle={() => setReceiveBriefs(v => !v)}
                />
                <Checkbox
                  label="I agree to the Terms & Conditions"
                  checked={termsAgreed}
                  onToggle={() => setTermsAgreed(v => !v)}
                  error={missing.includes('terms')}
                />
              </>
            )}
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {last && (
            <Text style={styles.note}>
              {progressPct}% complete · Your profile will be reviewed by our
              team within 24–48 hours.
            </Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: scale(12) + insets.bottom }]}>
          <TouchableOpacity
            style={[styles.submit, (saving || busy) && styles.submitOff]}
            onPress={last ? save : next}
            disabled={saving || busy}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {last ? 'Submit for Review' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The numbered section header the web shows above each block of fields. */
function SectionHead({
  number,
  title,
  hint,
  optional,
  pill,
}: {
  number: number;
  title: string;
  hint: string;
  optional?: boolean;
  pill?: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionNumber}>
        <Text style={styles.sectionNumberText}>{number}</Text>
      </View>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {(optional || !!pill) && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{pill || 'Optional'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionHint}>{hint}</Text>
      </View>
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
  meta,
  maxLength,
  counter,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'numeric';
  error?: boolean;
  meta?: string;
  maxLength?: number;
  counter?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {!!meta && <Text style={styles.labelMeta}>{meta}</Text>}
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
        autoCorrect={false}
        multiline={multiline}
        maxLength={maxLength}
      />
      {!!counter && !!maxLength && (
        <Text style={styles.charCount}>
          {value.length}/{maxLength} characters
        </Text>
      )}
    </View>
  );
}

/** Native stand-in for the web's `<input type="checkbox">` rows. */
function Checkbox({
  label,
  checked,
  onToggle,
  error,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  error?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.checkboxRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkbox,
          checked && styles.checkboxOn,
          error && styles.checkboxError,
        ]}
      >
        {checked && <Icon name="check" color="#FFFFFF" size={14} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: scale(10),
    paddingTop: scale(10),
    paddingBottom: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
  },
  headerBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
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

  progress: {
    flexDirection: 'row',
    gap: scale(5),
    paddingHorizontal: scale(16),
    paddingBottom: scale(12),
  },
  progressBar: {
    flex: 1,
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: '#E4E5F0',
  },
  progressOn: { backgroundColor: '#4C5BF3' },

  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(24) },
  card: {
    padding: scale(16),
    paddingTop: scale(18),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },

  sectionHead: {
    marginTop: scale(18),
    marginBottom: scale(2),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(10),
  },
  sectionNumber: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNumberText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  sectionCopy: { flex: 1 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: scale(7) },
  sectionTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  pill: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
    borderRadius: scale(6),
    backgroundColor: '#F0F1F7',
  },
  pillText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#7C819C',
  },
  sectionHint: { marginTop: scale(3), fontSize: fontScale(11), lineHeight: fontScale(16), color: '#777B96' },

  field: { marginTop: scale(14) },
  fieldLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#15163F',
    marginBottom: scale(7),
  },
  labelMeta: { marginTop: scale(-4), marginBottom: scale(7), fontSize: fontScale(11), color: '#8A8FA8' },
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
  inputMultiline: { minHeight: scale(84), textAlignVertical: 'top' },
  inputError: { borderColor: '#E5484D', backgroundColor: '#FFF6F6' },
  charCount: {
    marginTop: scale(5),
    fontSize: fontScale(10),
    color: '#9498B0',
    textAlign: 'right',
  },

  usernameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
  },
  usernamePrefix: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#8A8FA8',
  },
  usernameInput: {
    flex: 1,
    paddingVertical: scale(12),
    paddingHorizontal: scale(4),
    fontSize: fontScale(15),
    color: '#15163F',
  },

  dropzone: {
    marginTop: scale(12),
    paddingVertical: scale(22),
    borderRadius: scale(14),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C3C6E8',
    backgroundColor: '#FBFBFE',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
  },
  dropzoneFilled: { borderColor: '#8FD3AC', backgroundColor: '#F4FCF7' },
  dropzoneText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  dropzoneSub: { fontSize: fontScale(11), color: '#8A8FA8' },
  ghostBtn: {
    marginTop: scale(9),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#C4373B',
    textAlign: 'center',
  },

  portfolioGrid: {
    marginTop: scale(12),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  portfolioItem: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(10),
    overflow: 'hidden',
    backgroundColor: '#E7E8F2',
  },
  portfolioImage: { width: '100%', height: '100%' },
  portfolioVideo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioRemove: {
    position: 'absolute',
    top: scale(3),
    right: scale(3),
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: 'rgba(21,22,63,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioRemoveText: {
    color: '#FFFFFF',
    fontSize: fontScale(14),
    lineHeight: fontScale(16),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },

  tagRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  tagInput: { flex: 1 },
  tagAdd: {
    height: scale(46),
    paddingHorizontal: scale(16),
    borderRadius: scale(12),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  chipWrap: {
    marginTop: scale(10),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    height: scale(32),
    paddingHorizontal: scale(12),
    borderRadius: scale(8),
    backgroundColor: '#4C5BF3',
  },
  tagBadgeText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagBadgeRemove: {
    fontSize: fontScale(15),
    lineHeight: fontScale(17),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  package: {
    marginTop: scale(14),
    padding: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#FAFAFE',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  packageTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  checkboxRow: {
    marginTop: scale(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  checkbox: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(6),
    borderWidth: 1.5,
    borderColor: '#C3C6E8',
    backgroundColor: '#FBFBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  checkboxError: { borderColor: '#E5484D' },
  checkboxLabel: { flex: 1, fontSize: fontScale(13), color: '#15163F' },

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

export default CreatorProfileSetup;
