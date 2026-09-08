/**
 * Post a Campaign — the native brief wizard. This mirrors the web
 * /dashboard/business/post-brief flow (Frontend/src/pages/PostABrief.js)
 * section-for-section, so a brief posted from the phone carries the same
 * detail as one posted from the browser.
 *
 * Eight sections, same order and same field set as the web:
 *   A Campaign Basics · B Deliverables · C Must-Include · D Must-Avoid
 *   E Style Guidance  · F Usage Rights · G Timeline & Budget · H Review
 *
 * Two submit paths, both native:
 *   - "Save draft"  -> status 'draft', no validation, partial data allowed.
 *   - "Publish"     -> status 'pending_approval'; an admin reviews it before
 *                      creators ever see it, so publishing is not going live.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import { createCampaign, getBusinessProfile } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
  /** Called after a successful create so the caller can leave the form. */
  onDone: (campaignId: string | null) => void;
};

/** Web parity: same rates used on the review section's cost breakdown. */
const COMMISSION_RATE = 0.25;

/**
 * One-time listing fee, tiered by the size of the brief. Mirrors listingFeeFor()
 * in the web wizard and campaign_listing_fee() in the backend's server.py — the
 * backend is what actually debits the wallet, so keep all three in sync.
 *   1 creator,  1 deliverable    -> ₹500
 *   1 creator,  2+ deliverables  -> ₹1,500
 *   2–10 creators                -> ₹1,500
 *   11+ creators                 -> ₹3,000
 * `deliverables` is the TOTAL asset count (sum of every row's quantity), so one
 * creator x 3 Reels is a 3-deliverable brief. Charged once, never per creator.
 */
const listingFeeFor = (creators: number, deliverables: number): number => {
  const c = Math.max(1, Number(creators) || 1);
  const d = Math.max(1, Number(deliverables) || 1);
  if (c >= 11) return 3000;
  if (c > 1) return 1500;
  return d > 1 ? 1500 : 500;
};

const STEPS = [
  'Campaign Basics',
  'Deliverables',
  'Must-Include',
  'Must-Avoid',
  'Style Guidance',
  'Usage Rights',
  'Timeline & Budget',
  'Review & Publish',
];

/**
 * Option lists copied verbatim from the web wizard. These strings are stored
 * as-is on the campaign, so they must not drift from the web's values.
 */
const CATEGORIES = [
  'Beauty',
  'Tech',
  'Fitness',
  'Fashion',
  'Travel',
  'Food',
  'Gaming',
  'Lifestyle',
  'Home Decor',
  'Wellness',
];
const OBJECTIVES = [
  'Awareness',
  'Product launch',
  'Seasonal push',
  'Testimonial',
  'Tutorial',
  'Unboxing',
  'Comparison',
  'Sale promotion',
  'Customer education',
  'Other',
];
const DELIVERABLE_TYPES = [
  'Reel (9:16, under 30s)',
  'Short-form (30-60s)',
  'YouTube Short (9:16, 60s max)',
  'Long-form video (2+ minutes)',
  'Static post',
  'Carousel post',
  'Story set (3-5 frames)',
];
const ASPECTS = ['9:16', '1:1', '16:9', '4:5'];
const CTAS = ['Visit website', 'Use code', 'Swipe up', 'Follow brand', 'None'];
const TONES = [
  'Casual',
  'Energetic',
  'Informative',
  'Humorous',
  'Aspirational',
  'Authentic',
  'Educational',
  'Trustworthy',
];
const PACING = ['Fast-cut', 'Medium', 'Slow & reflective', 'No preference'];
const MUSIC = [
  'Original creator audio',
  'Trending sound',
  'Brand-provided audio file',
  'No preference',
];
const CREATOR_LEVELS = ['New', 'Verified', 'L1', 'L2', 'Elite'];
const QUALITY_TIERS = ['A', 'A+', 'A++'];
const GENDER_OPTIONS = ['No Preference', 'Female', 'Male', 'Non-binary'];
const CITIES = [
  'Any City',
  'Mumbai',
  'Delhi NCR',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
];
const NICHE_TAGS = [
  'Beauty',
  'Skincare',
  'Fashion',
  'Fitness',
  'Food',
  'Lifestyle',
  'Tech',
  'Travel',
  'Home Decor',
  'Wellness',
  'Parenting',
  'Gaming',
];
const RIGHTS_DURATIONS = [
  '3 months',
  '6 months',
  '1 year',
  '2 years',
  'Perpetual',
];
const EXCLUSIVITY = ['None', '15 days', '30 days', '60 days', '90 days'];
const MODIFICATION_RIGHTS = [
  'Yes (full rights)',
  'Limited (minor edits only)',
  'No (use as-is)',
];
const VIDEO_DELIVERABLES = [
  'Reel',
  'Short-form',
  'YouTube Short',
  'Long-form video',
];
const PLATFORMS = [
  "Brand's own Instagram",
  "Brand's own TikTok / Reels",
  "Brand's own YouTube",
  "Brand's own website",
  "Brand's email marketing",
  'Paid ads on Meta platforms',
  'Paid ads on Google / YouTube',
  'Paid ads on other platforms',
  'Out-of-home (billboards, print)',
  'B2B sales materials (pitch decks, demos)',
  'Third-party aggregators / marketplaces',
];

/** Deliverable types that require a duration — same rule as the web. */
const isVideoDeliverable = (type = '') =>
  VIDEO_DELIVERABLES.some(label => type.startsWith(label));

/** "15-20 seconds" -> 15. Falls back to 30 like the web helper does. */
const parseDurationSeconds = (value = '') => {
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : 30;
};

/** Date maths on plain YYYY-MM-DD strings, matching the web's addDays(). */
const addDays = (dateString: string, days: number) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Where an unfinished brief is parked. Closing the form — deliberately or by
 * accident — leaves the answers here, so reopening resumes on the same step
 * instead of starting from a blank section 1.
 */
const DRAFT_KEY = 'ugcad.postbrief.draft';

/**
 * What the brand is promoting. Only a physical product ships, so choosing any
 * other option drops the shipping-date requirement — same rule as the web.
 */
const PRODUCT_TYPES = [
  {
    value: 'physical',
    label: 'Physical product',
    hint: 'You ship an item to the creator',
  },
  {
    value: 'digital',
    label: 'Digital / App',
    hint: 'App, software or download — nothing to ship',
  },
  {
    value: 'service',
    label: 'Service',
    hint: 'A service, subscription or experience',
  },
  { value: 'other', label: 'Other', hint: 'Describe it yourself' },
];
const typeNeedsShipping = (t: string) => t === 'physical';

/** Today as YYYY-MM-DD, in local time (toISOString would shift across UTC). */
const todayISO = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The form stores dates as YYYY-MM-DD (what the API wants), but brands read and
 * type them day-first, so the input shows DD-MM-YYYY. These two convert between
 * the stored and displayed shapes.
 */
const isoToDisplay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const displayToIso = (display: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display || '');
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  // Reject impossible days (32-13-2026) rather than letting Date roll them over.
  if (
    Number.isNaN(date.getTime()) ||
    date.getDate() !== Number(dd) ||
    date.getMonth() + 1 !== Number(mm)
  ) {
    return '';
  }
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Types the separators for the brand: keep only digits, then re-insert the
 * dashes at the day/month boundaries so "01" becomes "01-" without them ever
 * pressing "-".
 */
const maskDate = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  let out = parts[0];
  if (digits.length >= 2) out += `-${parts[1]}`;
  if (digits.length >= 4) out += `-${parts[2]}`;
  return out;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Deliverable = {
  id: string;
  type: string;
  quantity: number;
  duration: string;
  aspectRatios: string[];
  rawRequired: boolean;
};

let deliverableSeq = 0;
const createDeliverable = (): Deliverable => ({
  id: `d${++deliverableSeq}`,
  type: '',
  quantity: 1,
  duration: '',
  aspectRatios: ['9:16'],
  rawRequired: false,
});

type FormState = {
  campaignName: string;
  brandName: string;
  category: string;
  productName: string;
  productDescription: string;
  campaignHook: string;
  keyMessage: string;
  objectives: string[];
  targetAudience: string;
  budgetVisible: boolean;
  deliverables: Deliverable[];
  productVisible: boolean;
  visibilitySeconds: string;
  verbalMention: boolean;
  productNames: string;
  requiredPhrases: string[];
  requiredShots: string[];
  callToAction: string;
  promoCode: string;
  hashtags: string;
  brandHandleTag: boolean;
  noCompetitors: boolean;
  competitors: string;
  noOtherProducts: boolean;
  noProfanity: boolean;
  noPolitical: boolean;
  avoidFilters: boolean;
  filterTypes: string;
  avoidText: string;
  tones: string[];
  pacing: string;
  referenceVideos: string[];
  musicPreference: string;
  platforms: string[];
  rightsDuration: string;
  exclusivity: string;
  whitelisting: boolean;
  modificationRights: string;
  productType: string;
  productTypeOther: string;
  productShippingBy: string;
  draftDeliveryBy: string;
  revisions: number;
  finalDeliveryBy: string;
  budgetMode: 'fixed' | 'range';
  fixedBudget: string;
  budgetMin: string;
  budgetMax: string;
  creatorLevel: string;
  qualityTier: string;
  genderPreference: string;
  cityFilter: string;
  nicheTags: string[];
};

/** Same defaults as the web's initialForm so both start identically. */
const initialForm: FormState = {
  campaignName: '',
  brandName: '',
  category: '',
  productName: '',
  productDescription: '',
  campaignHook: '',
  keyMessage: '',
  objectives: [],
  targetAudience: '',
  budgetVisible: true,
  deliverables: [createDeliverable()],
  productVisible: true,
  visibilitySeconds: '',
  verbalMention: true,
  productNames: '',
  requiredPhrases: [''],
  requiredShots: [''],
  callToAction: 'Visit website',
  promoCode: '',
  hashtags: '',
  brandHandleTag: true,
  noCompetitors: true,
  competitors: '',
  noOtherProducts: true,
  noProfanity: true,
  noPolitical: true,
  avoidFilters: false,
  filterTypes: '',
  avoidText: '',
  tones: [],
  pacing: 'No preference',
  referenceVideos: [''],
  musicPreference: 'No preference',
  platforms: [],
  rightsDuration: '',
  exclusivity: 'None',
  whitelisting: false,
  modificationRights: '',
  productType: 'physical',
  productTypeOther: '',
  productShippingBy: '',
  draftDeliveryBy: '',
  revisions: 2,
  finalDeliveryBy: '',
  budgetMode: 'fixed',
  fixedBudget: '',
  budgetMin: '',
  budgetMax: '',
  creatorLevel: '',
  qualityTier: '',
  genderPreference: 'No Preference',
  cityFilter: 'Any City',
  nicheTags: [],
};

/** Per-section message shown when Continue is blocked, mirroring web rules. */
const STEP_HINTS = [
  'Campaign name (3-80), product name, description (20+), hook (10+), key message (10+), category, one objective, and audience (50-200) are all required.',
  'Every deliverable needs a type, quantity 1-5, at least one aspect ratio, and a duration for video types.',
  'Fill the visibility seconds, the product name to mention, and a promo code if the CTA is "Use code".',
  'Keep "specific things to avoid" under 200 characters.',
  'Pick at least one tone and a pacing preference.',
  'Pick at least one platform, a rights duration, exclusivity, and modification rights.',
  'Shipping, draft and final dates, a budget above zero, creator level and quality tier are all required.',
  '',
];

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
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
      {name === 'plus' && <Path d="M12 5.5v13M5.5 12h13" {...line} />}
      {name === 'minus' && <Path d="M5.5 12h13" {...line} />}
      {name === 'trash' && (
        <Path d="M5 7h14M10 7V5h4v2m-7 0 .8 12h6.4L17 7" {...line} />
      )}
    </Svg>
  );
}

/** Labelled text field, styled like the rest of the native app. */
/**
 * Renders the length rule for a field in one place, so the placeholder and the
 * hint below the box can never disagree about the limit.
 */
function limitText(min?: number, max?: number): string {
  if (min && max) return `${min}-${max} characters`;
  if (max) return `max ${max} characters`;
  if (min) return `min ${min} characters`;
  return '';
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  keyboard,
  hint,
  min,
  max,
  maxWords,
  wordNoun,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: 'default' | 'numeric';
  hint?: string;
  /** Length rule. Shown in the placeholder AND tracked live in the hint. */
  min?: number;
  max?: number;
  /** Cap on whitespace-separated items (hashtags), not characters. */
  maxWords?: number;
  /** What maxWords counts, for the copy: "hashtags", "words". */
  wordNoun?: string;
}) {
  const noun = wordNoun || 'words';
  const words = value.split(/\s+/).filter(Boolean).length;
  const rule = maxWords ? `max ${maxWords} ${noun}` : limitText(min, max);
  // The placeholder vanishes as soon as the field has text, so the limit also
  // rides along in the hint below — that is the copy still on screen while the
  // brand is actually typing and approaching the cap.
  const base = placeholder || label;
  const withRule = rule ? `${base} (${rule})` : base;
  const counter = maxWords
    ? `${words}/${maxWords} ${noun}`
    : rule
    ? max
      ? `${value.length}/${max} characters${min ? ` (${min} minimum)` : ''}`
      : `${value.length} characters (${min} minimum)`
    : '';
  const below = hint || counter;
  // Turn the hint red once the entry breaks the rule, so the cap is not just
  // stated but visibly enforced.
  const bad = maxWords
    ? words > maxWords
    : (!!max && value.length > max) ||
      (!!min && value.length > 0 && value.length < min);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={withRule}
        placeholderTextColor="#A9ADC2"
        keyboardType={keyboard || 'default'}
        multiline={multiline}
        autoCorrect={false}
      />
      {!!below && (
        <Text style={[styles.hint, bad && styles.hintBad]}>{below}</Text>
      )}
    </View>
  );
}

/**
 * Date entry with both routes the brief asks for: type it as DD-MM-YYYY (the
 * dashes appear on their own) or pick it from the calendar.
 *
 * `min` is the earliest selectable day. Shipping passes tomorrow, so today and
 * every earlier day are greyed out and unpressable — a brand cannot promise to
 * ship a product on a date that has already started.
 */
function DateField({
  label,
  value,
  onChange,
  required,
  min,
  hint,
}: {
  label: string;
  value: string;
  onChange: (nextIso: string) => void;
  required?: boolean;
  /** Earliest allowed date, YYYY-MM-DD. */
  min?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(() => isoToDisplay(value));
  // The calendar opens on the month already chosen, else the first allowed one.
  const [cursor, setCursor] = useState(() => value || min || todayISO());

  // Keep the box in step when the value is set elsewhere (e.g. the suggested
  // draft date), but never fight the brand while they are mid-type.
  useEffect(() => {
    const next = isoToDisplay(value);
    setTyped(prev => (displayToIso(prev) === value ? prev : next));
  }, [value]);

  const onType = (raw: string) => {
    const masked = maskDate(raw);
    setTyped(masked);
    const iso = displayToIso(masked);
    // Only publish a complete, real, in-range date; partial typing must not
    // clear a date the brand already picked.
    if (iso && (!min || iso >= min)) onChange(iso);
    else if (masked === '') onChange('');
  };

  const view = new Date(`${(cursor || todayISO()).slice(0, 7)}-01T00:00:00`);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const shiftMonth = (by: number) =>
    setCursor(`${pad(year)}-${pad(month + 1 + by)}-01`.length === 10
      ? new Date(year, month + by, 1).toISOString().slice(0, 10)
      : cursor);

  const invalid = typed.length === 10 && !displayToIso(typed);
  const tooEarly =
    !!min && !!displayToIso(typed) && displayToIso(typed) < min;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.dateRow}>
        <TextInput
          style={[styles.input, styles.dateInput]}
          value={typed}
          onChangeText={onType}
          placeholder="DD-MM-YYYY"
          placeholderTextColor="#A9ADC2"
          keyboardType="number-pad"
          maxLength={10}
        />
        <TouchableOpacity
          style={styles.calendarBtn}
          onPress={() => {
            setCursor(value || min || todayISO());
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open calendar for ${label}`}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4.5 6.5h15v13h-15zM8 4v4m8-4v4M4.5 10.5h15"
              stroke="#4C5BF3"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      </View>
      {(invalid || tooEarly) && (
        <Text style={[styles.hint, styles.hintBad]}>
          {invalid
            ? 'Enter a real date as DD-MM-YYYY.'
            : 'Cannot be today — earliest is tomorrow.'}
        </Text>
      )}
      {!invalid && !tooEarly && !!hint && <Text style={styles.hint}>{hint}</Text>}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.calendarBackdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity style={styles.calendar} activeOpacity={1}>
            <View style={styles.calendarHead}>
              <TouchableOpacity
                onPress={() => shiftMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.calendarNav}
              >
                <Text style={styles.calendarNavText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>
                {MONTH_NAMES[month]} {year}
              </Text>
              <TouchableOpacity
                onPress={() => shiftMonth(1)}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.calendarNav}
              >
                <Text style={styles.calendarNavText}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={`${d}${i}`} style={styles.weekDay}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, index) => {
                if (day === null) {
                  return <View key={`b${index}`} style={styles.day} />;
                }
                const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
                const blocked = !!min && iso < min;
                const picked = iso === value;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.day, picked && styles.dayOn]}
                    disabled={blocked}
                    onPress={() => {
                      onChange(iso);
                      setTyped(isoToDisplay(iso));
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={iso}
                    accessibilityState={{ disabled: blocked, selected: picked }}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        blocked && styles.dayOff,
                        picked && styles.dayTextOn,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.calendarNote}>
              Today and earlier dates cannot be selected.
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/** Chip row. Single-select by default, multi-select when the caller toggles. */
function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  required,
  compact,
}: {
  label?: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.field}>
      {!!label && (
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      )}
      <View style={styles.chipWrap}>
        {options.map(option => {
          const active = selected.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.chip,
                compact && styles.chipCompact,
                active && styles.chipActive,
              ]}
              onPress={() => onToggle(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** Yes/No segmented control — the native stand-in for the web's .brief-segment. */
function Segment({
  label,
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
  required,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.segment}>
        {[true, false].map(option => (
          <TouchableOpacity
            key={String(option)}
            style={[styles.segmentBtn, value === option && styles.segmentOn]}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option }}
          >
            <Text
              style={[
                styles.segmentText,
                value === option && styles.segmentTextOn,
              ]}
            >
              {option ? yesLabel : noLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Checkbox row for the Must-Avoid rules. */
function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.checkRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked && <Icon name="check" color="#FFFFFF" size={13} />}
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Read-only label/value row used on the review section. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value || '—'}</Text>
    </View>
  );
}

function BrandPostBrief({ token, onBack, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState('');
  // Nothing is written until the saved draft has been read back, otherwise the
  // empty initial form would overwrite it on the very first render.
  const [restored, setRestored] = useState(false);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (active && raw) {
          const saved = JSON.parse(raw) as {
            form?: Partial<FormState>;
            step?: number;
          };
          if (saved?.form) {
            // Spread over initialForm so a draft written by an older build,
            // missing fields added since, still loads instead of throwing.
            setForm(current => ({ ...current, ...saved.form }));
            setStep(Math.min(Math.max(1, saved.step || 1), STEPS.length));
            setResumed(true);
          }
        }
      } catch {
        // A corrupt draft must never block the form — fall through to blank.
      } finally {
        if (active) setRestored(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step })).catch(
      () => {},
    );
  }, [form, step, restored]);

  const set = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) =>
      setForm(current => ({ ...current, [field]: value })),
    [],
  );

  const toggleArray = useCallback((field: keyof FormState, value: string) => {
    setForm(current => {
      const values = (current[field] as string[]) || [];
      return {
        ...current,
        [field]: values.includes(value)
          ? values.filter(item => item !== value)
          : [...values, value],
      };
    });
  }, []);

  /** Prefill the brand name and default category from the business profile. */
  useEffect(() => {
    let alive = true;
    getBusinessProfile(token)
      .then((profile: any) => {
        if (!alive || !profile) return;
        setForm(current => ({
          ...current,
          brandName: current.brandName || profile.brand_name || '',
          category:
            current.category ||
            profile.primary_category ||
            profile.business_category ||
            '',
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const budget =
    Number(form.budgetMode === 'fixed' ? form.fixedBudget : form.budgetMax) ||
    0;
  const commission = Math.round(budget * COMMISSION_RATE);
  // Total assets requested = sum of every deliverable row's quantity. The app form
  // is single-creator (it sends no creators_wanted, so the backend treats it as 1),
  // so only the deliverable count moves the tier here.
  const totalDeliverables = form.deliverables.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
    0,
  );
  const listingFee = listingFeeFor(1, totalDeliverables);
  const totalDebit = budget + commission + listingFee;
  const paidAdsSelected = form.platforms.some(p =>
    p.toLowerCase().includes('paid ads'),
  );

  // Earliest shippable day. The web blocks today for the same reason: a brand
  // cannot promise to ship on a date that has already begun.
  const tomorrowISO = useMemo(() => addDays(todayISO(), 1), []);
  const needsShipping = typeNeedsShipping(form.productType);

  const draftDeliverySuggestion = useMemo(
    () => addDays(form.productShippingBy, 7),
    [form.productShippingBy],
  );
  const finalDeliverySuggestion = useMemo(
    () =>
      addDays(
        form.draftDeliveryBy,
        Math.max(1, Number(form.revisions || 0) * 2),
      ),
    [form.draftDeliveryBy, form.revisions],
  );

  // Same auto-fill chain as the web: shipping -> draft (+7d) -> final (+2d per revision).
  useEffect(() => {
    if (!form.draftDeliveryBy && draftDeliverySuggestion) {
      set('draftDeliveryBy', draftDeliverySuggestion);
    }
  }, [draftDeliverySuggestion, form.draftDeliveryBy, set]);

  useEffect(() => {
    if (!form.finalDeliveryBy && finalDeliverySuggestion) {
      set('finalDeliveryBy', finalDeliverySuggestion);
    }
  }, [finalDeliverySuggestion, form.finalDeliveryBy, set]);

  /** Pricing nudges shown on the review section, same rules as the web. */
  const pricingLifts = [
    form.rightsDuration === 'Perpetual'
      ? 'Perpetual rights: +40% suggested'
      : '',
    form.whitelisting ? 'Whitelisting enabled: +30% suggested' : '',
    form.exclusivity === '90 days' ? '90-day exclusivity: +25% suggested' : '',
    paidAdsSelected ? 'Paid ads allowed: +20% suggested' : '',
  ].filter(Boolean);

  const updateDeliverable = useCallback(
    (id: string, patch: Partial<Deliverable>) =>
      setForm(current => ({
        ...current,
        deliverables: current.deliverables.map(item =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      })),
    [],
  );

  const addDeliverable = useCallback(() => {
    setForm(current =>
      // The backend caps a brief at 5 deliverable rows.
      current.deliverables.length >= 5
        ? current
        : {
            ...current,
            deliverables: [...current.deliverables, createDeliverable()],
          },
    );
  }, []);

  const removeDeliverable = useCallback((id: string) => {
    setForm(current =>
      current.deliverables.length === 1
        ? current
        : {
            ...current,
            deliverables: current.deliverables.filter(item => item.id !== id),
          },
    );
  }, []);

  const addTextItem = useCallback((field: keyof FormState, max: number) => {
    setForm(current => {
      const values = (current[field] as string[]) || [];
      return values.length >= max
        ? current
        : { ...current, [field]: [...values, ''] };
    });
  }, []);

  const updateTextItem = useCallback(
    (field: keyof FormState, index: number, value: string) =>
      setForm(current => ({
        ...current,
        [field]: (current[field] as string[]).map((item, idx) =>
          idx === index ? value : item,
        ),
      })),
    [],
  );

  /** Section gates — identical conditions to the web's isStepValid(). */
  const isStepValid = useCallback(
    (target: number) => {
      if (target === 1)
        return (
          form.campaignName.trim().length >= 3 &&
          form.campaignName.trim().length <= 80 &&
          form.productName.trim().length >= 2 &&
          form.productDescription.trim().length >= 20 &&
          form.campaignHook.trim().length >= 10 &&
          form.keyMessage.trim().length >= 10 &&
          !!form.category &&
          form.objectives.length > 0 &&
          form.targetAudience.trim().length >= 20 &&
          form.targetAudience.trim().length <= 200
        );
      if (target === 2)
        return (
          form.deliverables.length > 0 &&
          form.deliverables.every(
            item =>
              item.type &&
              item.quantity >= 1 &&
              item.quantity <= 5 &&
              item.aspectRatios.length > 0 &&
              (!isVideoDeliverable(item.type) || item.duration),
          )
        );
      if (target === 3)
        return (
          (!form.productVisible || !!form.visibilitySeconds) &&
          (!form.verbalMention || !!form.productNames) &&
          !!form.callToAction &&
          (form.callToAction !== 'Use code' || !!form.promoCode)
        );
      if (target === 4) return form.avoidText.length <= 200;
      if (target === 5) return form.tones.length > 0 && !!form.pacing;
      if (target === 6)
        return (
          form.platforms.length > 0 &&
          !!form.rightsDuration &&
          !!form.exclusivity &&
          !!form.modificationRights
        );
      if (target === 7)
        return (
          (!typeNeedsShipping(form.productType) || !!form.productShippingBy) &&
          !!form.draftDeliveryBy &&
          !!form.finalDeliveryBy &&
          budget > 0 &&
          !!form.creatorLevel &&
          !!form.qualityTier
        );
      return true;
    },
    [budget, form],
  );

  /** The Must-Avoid rules, flattened the same way the web flattens them. */
  const avoidRules = useMemo(
    () =>
      [
        form.noCompetitors
          ? `No competitor brands visible${
              form.competitors ? `: ${form.competitors}` : ''
            }`
          : '',
        form.noOtherProducts ? 'No other products in frame' : '',
        form.noProfanity ? 'No profanity or adult language' : '',
        form.noPolitical ? 'No political or religious content' : '',
        form.avoidFilters
          ? `Avoid filters / effects${
              form.filterTypes ? `: ${form.filterTypes}` : ''
            }`
          : '',
        form.avoidText ? `Specific avoid: ${form.avoidText}` : '',
      ]
        .filter(Boolean)
        .join('; ') || 'None',
    [form],
  );

  /**
   * The human-readable brief blob. Line-for-line the same as the web's
   * briefText(), because admins and creators read this text directly.
   */
  const briefText = useCallback(
    () =>
      [
        `Campaign: ${form.campaignName}`,
        `Brand: ${form.brandName}`,
        `Category: ${form.category}`,
        `Product: ${form.productName}`,
        `Product description: ${form.productDescription}`,
        `Hook: ${form.campaignHook}`,
        `Key message: ${form.keyMessage}`,
        `Objectives: ${form.objectives.join(', ')}`,
        `Target audience: ${form.targetAudience}`,
        `Budget visibility: ${
          form.budgetVisible
            ? 'Visible to creators'
            : 'Hidden from creators - admin flag'
        }`,
        '',
        'Deliverables:',
        ...form.deliverables.map(
          (item, index) =>
            `${index + 1}. ${item.quantity} x ${item.type}; duration ${
              item.duration || 'n/a'
            }; ratios ${item.aspectRatios.join(', ')}; raw files ${
              item.rawRequired ? 'required' : 'not required'
            }`,
        ),
        '',
        `Must include: product visible ${
          form.productVisible ? `${form.visibilitySeconds}s minimum` : 'no'
        }; verbal mention ${
          form.verbalMention ? form.productNames : 'no'
        }; CTA ${form.callToAction}; promo ${
          form.promoCode || 'n/a'
        }; hashtags ${form.hashtags || 'n/a'}; brand tag ${
          form.brandHandleTag ? 'yes' : 'no'
        }`,
        `Required phrases: ${
          form.requiredPhrases.filter(Boolean).join(', ') || 'none'
        }`,
        `Required shots: ${
          form.requiredShots.filter(Boolean).join(', ') || 'none'
        }`,
        `Must avoid: competitors ${
          form.noCompetitors
            ? form.competitors || 'listed competitors'
            : 'not specified'
        }; other products ${
          form.noOtherProducts ? 'no' : 'allowed'
        }; profanity ${
          form.noProfanity ? 'no' : 'allowed'
        }; political/religious ${
          form.noPolitical ? 'no' : 'allowed'
        }; filters ${
          form.avoidFilters ? form.filterTypes || 'avoid' : 'allowed'
        }; specific avoid ${form.avoidText || 'none'}`,
        `Style guidance: tones ${form.tones.join(', ')}; pacing ${
          form.pacing
        }; music ${form.musicPreference}; references ${
          form.referenceVideos.filter(Boolean).join(', ') || 'none'
        }`,
        `Usage rights: platforms ${form.platforms.join(', ')}; duration ${
          form.rightsDuration
        }; exclusivity ${form.exclusivity}; whitelisting ${
          form.whitelisting ? 'yes' : 'no'
        }; modification ${form.modificationRights}`,
        `Creator targeting: level ${form.creatorLevel}; quality ${
          form.qualityTier
        }; gender ${form.genderPreference}; city ${form.cityFilter}; niches ${
          form.nicheTags.join(', ') || 'none'
        }`,
        `Timeline: ship by ${form.productShippingBy}; draft by ${form.draftDeliveryBy}; revisions ${form.revisions}; final by ${form.finalDeliveryBy}`,
        `Budget: ${
          form.budgetMode === 'fixed'
            ? `fixed Rs. ${form.fixedBudget}`
            : `range Rs. ${form.budgetMin} - Rs. ${form.budgetMax}`
        }`,
        `Commission: platform 25%, total wallet debit Rs. ${totalDebit}, creator receives Rs. ${budget} pre-tax`,
      ].join('\n'),
    [budget, form, totalDebit],
  );

  /**
   * The payload. Same keys the web POSTs, plus the structured Section 3-7
   * fields the backend's BriefSectionsMixin persists, so nothing the brand
   * typed is lost to the brief_text blob alone.
   */
  const buildPayload = useCallback(
    (status: 'draft' | 'pending_approval') => {
      const primary = form.deliverables[0] || ({} as Deliverable);
      return {
        status,
        title: form.campaignName,
        brief_text: briefText(),
        budget_min:
          form.budgetMode === 'fixed' ? budget : Number(form.budgetMin || 0),
        budget_max: budget,
        objectives: form.objectives,
        // Only physical products ship; a digital/service brief must not ask
        // the creator to wait for a parcel that will never arrive.
        requires_shipment: needsShipping,
        shipment_required: needsShipping,
        shipment_option: needsShipping ? 'yes' : 'no',
        due_date: form.finalDeliveryBy,
        deadline: form.finalDeliveryBy,
        revision_limit: Number(form.revisions || 0),
        product_name: form.productName,
        product_category: form.category,
        product_description: form.productDescription,
        brief_type: primary.type,
        campaign_hook: form.campaignHook,
        key_message: form.keyMessage,
        what_not_to_do: avoidRules,
        tone_reference: form.pacing,
        tone_tags: form.tones,
        video_format: primary.type,
        aspect_ratio: (primary.aspectRatios || [])[0] || '',
        duration_seconds: parseDurationSeconds(primary.duration),
        additional_deliverables: form.deliverables
          .slice(1)
          .map(item => `${item.quantity} x ${item.type}`),
        free_revisions: Number(form.revisions || 0),
        creator_level: form.creatorLevel,
        content_quality_tier: form.qualityTier,
        gender_preference: form.genderPreference,
        city_filter: form.cityFilter,
        creator_niche_tags: form.nicheTags,
        per_video_budget: budget,
        total_budget: budget,
        currency: 'INR',
        brand_name: form.brandName,

        // Structured sections (BriefSectionsMixin) — queryable, not just prose.
        target_audience: form.targetAudience,
        budget_visible: form.budgetVisible,
        // Quantity drives the escrow hold and the completion gate, so this list
        // must match exactly what the brand priced on the review section.
        deliverable_items: form.deliverables.map(item => ({
          type: item.type,
          quantity: item.quantity,
          duration: item.duration || undefined,
          aspect_ratios: item.aspectRatios,
          raw_required: item.rawRequired,
        })),
        product_visible: form.productVisible,
        product_visible_seconds: form.visibilitySeconds,
        verbal_mention: form.verbalMention,
        verbal_mention_text: form.productNames,
        required_phrases: form.requiredPhrases.filter(Boolean),
        required_shots: form.requiredShots.filter(Boolean),
        call_to_action: form.callToAction,
        promo_code: form.promoCode,
        hashtags: form.hashtags,
        brand_handle_tag: form.brandHandleTag,
        no_competitors: form.noCompetitors,
        competitors_text: form.competitors,
        no_other_products: form.noOtherProducts,
        no_profanity: form.noProfanity,
        no_political: form.noPolitical,
        avoid_filters: form.avoidFilters,
        filter_types_text: form.filterTypes,
        avoid_text: form.avoidText,
        pacing: form.pacing,
        music_preference: form.musicPreference,
        reference_videos: form.referenceVideos.filter(Boolean),
        usage_platforms: form.platforms,
        rights_duration: form.rightsDuration,
        exclusivity: form.exclusivity,
        whitelisting: form.whitelisting,
        modification_rights: form.modificationRights,
        product_type: form.productType,
        product_type_other:
          form.productType === 'other' ? form.productTypeOther : '',
        // Only a physical product ships; sending a stale date for the others
        // would make the deal ask the creator to wait for a parcel.
        product_shipping_by: needsShipping ? form.productShippingBy : '',
        draft_delivery_by: form.draftDeliveryBy,
        final_delivery_by: form.finalDeliveryBy,
        budget_mode: form.budgetMode,
      };
    },
    [avoidRules, briefText, budget, form, needsShipping],
  );

  const submit = useCallback(
    async (mode: 'draft' | 'publish') => {
      // A draft may be partial; publishing must clear every section gate first.
      if (mode === 'publish') {
        const firstBad = STEPS.findIndex((_, index) => !isStepValid(index + 1));
        if (firstBad >= 0) {
          setStep(firstBad + 1);
          setError(STEP_HINTS[firstBad] || 'Please complete this section.');
          return;
        }
      }

      setBusy(mode);
      setError('');
      try {
        // createCampaign throws an ApiError carrying the backend's `detail`,
        // which covers the refusals this form can hit — notably the 402 for
        // booking a creator, which must go through checkout instead.
        const data = await createCampaign(
          token,
          buildPayload(mode === 'draft' ? 'draft' : 'pending_approval'),
        );
        // The brief now lives on the server; keeping the local copy would
        // resurrect it as an unfinished draft the next time the form opens.
        await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        onDone(data?.id ? String(data.id) : null);
      } catch (err: any) {
        setError(err?.message || 'Could not save the campaign.');
      } finally {
        setBusy(null);
      }
    },
    [buildPayload, isStepValid, onDone, token],
  );

  const goNext = useCallback(() => {
    if (!isStepValid(step)) {
      setError(STEP_HINTS[step - 1] || 'Please complete this section.');
      return;
    }
    setError('');
    setStep(current => Math.min(STEPS.length, current + 1));
  }, [isStepValid, step]);

  const goBack = useCallback(() => {
    setError('');
    setStep(current => Math.max(1, current - 1));
  }, []);

  /** Repeatable free-text rows (required phrases, shots, reference videos). */
  const renderTextList = (
    field: keyof FormState,
    max: number,
    placeholder: string,
  ) => {
    const values = (form[field] as string[]) || [];
    return (
      <View>
        {values.map((item, index) => (
          <TextInput
            key={`${String(field)}-${index}`}
            style={[styles.input, index > 0 && styles.inputStacked]}
            value={item}
            onChangeText={value => updateTextItem(field, index, value)}
            placeholder={placeholder}
            placeholderTextColor="#A9ADC2"
          />
        ))}
        {values.length < max && (
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => addTextItem(field, max)}
            accessibilityRole="button"
          >
            <Icon name="plus" color="#4C5BF3" size={15} />
            <Text style={styles.addRowText}>Add item</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const last = step === STEPS.length;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={step === 1 ? onBack : goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#15163F" size={22} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Post a Campaign</Text>
          <Text style={styles.headerStep}>
            Section {String.fromCharCode(64 + step)} of H · {STEPS[step - 1]}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => submit('draft')}
          disabled={busy !== null}
          accessibilityRole="button"
        >
          <Text style={styles.saveDraft}>
            {busy === 'draft' ? 'Saving…' : 'Save Draft'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progress}>
        {STEPS.map((label, index) => (
          <View
            key={label}
            style={[styles.progressBar, index < step && styles.progressOn]}
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
          // Keeps the focused input above the keyboard instead of behind it.
          automaticallyAdjustKeyboardInsets
        >
          {resumed && (
            <View style={styles.resumed}>
              <Text style={styles.resumedText}>
                Resumed your unfinished brief — continuing from
                {` ${STEPS[step - 1]}`}.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setForm(initialForm);
                  setStep(1);
                  setResumed(false);
                  AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
                }}
                accessibilityRole="button"
                accessibilityLabel="Start over"
              >
                <Text style={styles.resumedAction}>Start over</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.card}>
            {step === 1 && (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    What are you promoting?
                    <Text style={styles.required}> *</Text>
                  </Text>
                  <View style={styles.typeGrid}>
                    {PRODUCT_TYPES.map(item => {
                      const on = form.productType === item.value;
                      return (
                        <TouchableOpacity
                          key={item.value}
                          style={[styles.typeCard, on && styles.typeCardOn]}
                          onPress={() => set('productType', item.value)}
                          accessibilityRole="button"
                          accessibilityLabel={item.label}
                          accessibilityState={{ selected: on }}
                        >
                          <Text
                            style={[styles.typeLabel, on && styles.typeLabelOn]}
                          >
                            {item.label}
                          </Text>
                          <Text style={styles.typeHint}>{item.hint}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {form.productType === 'other' && (
                    <TextInput
                      style={[styles.input, styles.typeOther]}
                      value={form.productTypeOther}
                      onChangeText={v => set('productTypeOther', v)}
                      placeholder="Describe what you are promoting"
                      placeholderTextColor="#A9ADC2"
                    />
                  )}
                  {!needsShipping && (
                    <Text style={styles.typeNote}>
                      No physical product — the shipping date is skipped.
                    </Text>
                  )}
                </View>
                <Field
                  label="Campaign name"
                  required
                  value={form.campaignName}
                  onChange={v => set('campaignName', v.slice(0, 80))}
                  placeholder="Summer Launch - Unboxing"
                  min={3}
                  max={80}
                />
                <Field
                  label="Brand name"
                  value={form.brandName}
                  onChange={v => set('brandName', v)}
                  placeholder="Your brand"
                />
                <ChipGroup
                  label="Category"
                  required
                  options={CATEGORIES}
                  selected={form.category ? [form.category] : []}
                  onToggle={v => set('category', v)}
                />
                <Field
                  label="Product name"
                  required
                  value={form.productName}
                  onChange={v => set('productName', v)}
                  placeholder="Glow Serum 30ml"
                  min={2}
                />
                <Field
                  label="Campaign hook"
                  required
                  multiline
                  value={form.campaignHook}
                  onChange={v => set('campaignHook', v)}
                  placeholder="Start with a morning routine problem-solution moment"
                  min={10}
                />
                <Field
                  label="Product description"
                  required
                  multiline
                  value={form.productDescription}
                  onChange={v => set('productDescription', v)}
                  placeholder="Describe the product, who it helps, and what creators should understand before filming."
                  min={20}
                />
                <Field
                  label="Key message"
                  required
                  multiline
                  value={form.keyMessage}
                  onChange={v => set('keyMessage', v)}
                  placeholder="The one message every video should communicate"
                  min={10}
                />
                <ChipGroup
                  label="Campaign objective"
                  required
                  options={OBJECTIVES}
                  selected={form.objectives}
                  onToggle={v => set('objectives', [v])}
                />
                <Field
                  label="Target audience"
                  required
                  multiline
                  value={form.targetAudience}
                  onChange={v => set('targetAudience', v.slice(0, 200))}
                  placeholder="Urban women 25-35 interested in clean skincare."
                  min={20}
                  max={200}
                />
                <Segment
                  label="Show the budget to creators?"
                  value={form.budgetVisible}
                  onChange={v => set('budgetVisible', v)}
                />
              </>
            )}

            {step === 2 &&
              form.deliverables.map((item, index) => (
                <View key={item.id} style={styles.deliverable}>
                  <View style={styles.deliverableHead}>
                    <Text style={styles.deliverableTitle}>
                      Deliverable {index + 1}
                    </Text>
                    {form.deliverables.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeDeliverable(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove deliverable ${index + 1}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="trash" color="#C4373B" size={18} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ChipGroup
                    label="Deliverable type"
                    required
                    compact
                    options={DELIVERABLE_TYPES}
                    selected={item.type ? [item.type] : []}
                    onToggle={v => updateDeliverable(item.id, { type: v })}
                  />

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>
                      Quantity<Text style={styles.required}> *</Text>
                    </Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() =>
                          updateDeliverable(item.id, {
                            quantity: Math.max(1, item.quantity - 1),
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Fewer"
                      >
                        <Icon name="minus" color="#15163F" size={16} />
                      </TouchableOpacity>
                      <Text style={styles.stepValue}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        // The backend caps a deliverable row at 5.
                        onPress={() =>
                          updateDeliverable(item.id, {
                            quantity: Math.min(5, item.quantity + 1),
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="More"
                      >
                        <Icon name="plus" color="#15163F" size={16} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Field
                    label="Duration"
                    required={isVideoDeliverable(item.type)}
                    value={item.duration}
                    onChange={v => updateDeliverable(item.id, { duration: v })}
                    placeholder="15-20 seconds"
                  />

                  <ChipGroup
                    label="Aspect ratio"
                    required
                    compact
                    options={ASPECTS}
                    selected={item.aspectRatios}
                    onToggle={ratio =>
                      updateDeliverable(item.id, {
                        aspectRatios: item.aspectRatios.includes(ratio)
                          ? item.aspectRatios.filter(r => r !== ratio)
                          : [...item.aspectRatios, ratio],
                      })
                    }
                  />

                  <Segment
                    label="Raw file delivery required"
                    required
                    value={item.rawRequired}
                    onChange={v =>
                      updateDeliverable(item.id, { rawRequired: v })
                    }
                  />

                  {index === form.deliverables.length - 1 &&
                    form.deliverables.length < 5 && (
                      <TouchableOpacity
                        style={styles.addRow}
                        onPress={addDeliverable}
                        accessibilityRole="button"
                      >
                        <Icon name="plus" color="#4C5BF3" size={15} />
                        <Text style={styles.addRowText}>Add deliverable</Text>
                      </TouchableOpacity>
                    )}
                </View>
              ))}

            {step === 3 && (
              <>
                <Segment
                  label="Product must be visible on screen"
                  value={form.productVisible}
                  onChange={v => set('productVisible', v)}
                />
                {form.productVisible && (
                  <Field
                    label="Minimum visibility duration (seconds)"
                    required
                    keyboard="numeric"
                    value={form.visibilitySeconds}
                    onChange={v => set('visibilitySeconds', v)}
                    placeholder="5"
                  />
                )}
                <Segment
                  label="Verbal mention required"
                  value={form.verbalMention}
                  onChange={v => set('verbalMention', v)}
                />
                {form.verbalMention && (
                  <Field
                    label="Exact product name(s)"
                    required
                    value={form.productNames}
                    onChange={v => set('productNames', v)}
                    placeholder="Glow Serum"
                  />
                )}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Required phrases (up to 5)
                  </Text>
                  {renderTextList(
                    'requiredPhrases',
                    5,
                    'Perfect for oily skin',
                  )}
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Required visual shots (up to 5)
                  </Text>
                  {renderTextList('requiredShots', 5, 'Close-up of label')}
                </View>
                <ChipGroup
                  label="Call to action"
                  required
                  options={CTAS}
                  selected={form.callToAction ? [form.callToAction] : []}
                  onToggle={v => set('callToAction', v)}
                />
                {form.callToAction === 'Use code' && (
                  <Field
                    label="Promo code"
                    required
                    value={form.promoCode}
                    onChange={v => set('promoCode', v)}
                    placeholder="GLOW20"
                  />
                )}
                <Field
                  label="Required hashtags"
                  value={form.hashtags}
                  onChange={v =>
                    // Web parity: whitespace-separated, capped at 10 tags.
                    set(
                      'hashtags',
                      v.split(/\s+/).filter(Boolean).slice(0, 10).join(' '),
                    )
                  }
                  placeholder="#brand #launch"
                  maxWords={10}
                  wordNoun="hashtags"
                />
                <Segment
                  label="Brand handle tag"
                  required
                  value={form.brandHandleTag}
                  onChange={v => set('brandHandleTag', v)}
                />
              </>
            )}

            {step === 4 && (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Standard restrictions</Text>
                  <CheckRow
                    label="No competitor brands visible"
                    checked={form.noCompetitors}
                    onToggle={() => set('noCompetitors', !form.noCompetitors)}
                  />
                  <CheckRow
                    label="No other products in frame"
                    checked={form.noOtherProducts}
                    onToggle={() =>
                      set('noOtherProducts', !form.noOtherProducts)
                    }
                  />
                  <CheckRow
                    label="No profanity or adult language"
                    checked={form.noProfanity}
                    onToggle={() => set('noProfanity', !form.noProfanity)}
                  />
                  <CheckRow
                    label="No political or religious content"
                    checked={form.noPolitical}
                    onToggle={() => set('noPolitical', !form.noPolitical)}
                  />
                  <CheckRow
                    label="Avoid specific filters / effects"
                    checked={form.avoidFilters}
                    onToggle={() => set('avoidFilters', !form.avoidFilters)}
                  />
                </View>
                {form.noCompetitors && (
                  <Field
                    label="Competitor list"
                    value={form.competitors}
                    onChange={v => set('competitors', v)}
                    placeholder="Brand A, Brand B"
                  />
                )}
                {form.avoidFilters && (
                  <Field
                    label="Which filters/effects?"
                    value={form.filterTypes}
                    onChange={v => set('filterTypes', v)}
                    placeholder="Heavy beauty filters"
                  />
                )}
                <Field
                  label="Specific things to avoid"
                  multiline
                  value={form.avoidText}
                  onChange={v => set('avoidText', v.slice(0, 200))}
                  placeholder="Anything else creators must not do"
                  max={200}
                />
              </>
            )}

            {step === 5 && (
              <>
                <ChipGroup
                  label="Tone"
                  required
                  options={TONES}
                  selected={form.tones}
                  onToggle={v => toggleArray('tones', v)}
                />
                <ChipGroup
                  label="Pacing preference"
                  required
                  options={PACING}
                  selected={form.pacing ? [form.pacing] : []}
                  onToggle={v => set('pacing', v)}
                />
                <ChipGroup
                  label="Music preference"
                  options={MUSIC}
                  selected={form.musicPreference ? [form.musicPreference] : []}
                  onToggle={v => set('musicPreference', v)}
                />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Reference videos (up to 3)
                  </Text>
                  {renderTextList(
                    'referenceVideos',
                    3,
                    'Paste reference video link',
                  )}
                </View>
              </>
            )}

            {step === 6 && (
              <>
                <ChipGroup
                  label="Platforms where content can be posted"
                  required
                  compact
                  options={PLATFORMS}
                  selected={form.platforms}
                  onToggle={v => toggleArray('platforms', v)}
                />
                <ChipGroup
                  label="Duration of rights"
                  required
                  options={RIGHTS_DURATIONS}
                  selected={form.rightsDuration ? [form.rightsDuration] : []}
                  onToggle={v => set('rightsDuration', v)}
                />
                <ChipGroup
                  label="Exclusivity period"
                  required
                  options={EXCLUSIVITY}
                  selected={form.exclusivity ? [form.exclusivity] : []}
                  onToggle={v => set('exclusivity', v)}
                />
                <Segment
                  label="Whitelisting / allowlisting"
                  required
                  yesLabel="Yes (+30%)"
                  value={form.whitelisting}
                  onChange={v => set('whitelisting', v)}
                />
                <ChipGroup
                  label="Modification rights"
                  required
                  compact
                  options={MODIFICATION_RIGHTS}
                  selected={
                    form.modificationRights ? [form.modificationRights] : []
                  }
                  onToggle={v => set('modificationRights', v)}
                />
              </>
            )}

            {step === 7 && (
              <>
                <ChipGroup
                  label="Minimum creator level"
                  required
                  options={CREATOR_LEVELS}
                  selected={form.creatorLevel ? [form.creatorLevel] : []}
                  onToggle={v => set('creatorLevel', v)}
                />
                <ChipGroup
                  label="Content quality tier"
                  required
                  options={QUALITY_TIERS}
                  selected={form.qualityTier ? [form.qualityTier] : []}
                  onToggle={v => set('qualityTier', v)}
                />
                <ChipGroup
                  label="Gender preference"
                  options={GENDER_OPTIONS}
                  selected={
                    form.genderPreference ? [form.genderPreference] : []
                  }
                  onToggle={v => set('genderPreference', v)}
                />
                <ChipGroup
                  label="City filter"
                  compact
                  options={CITIES}
                  selected={form.cityFilter ? [form.cityFilter] : []}
                  onToggle={v => set('cityFilter', v)}
                />
                <ChipGroup
                  label="Creator niche tags"
                  options={NICHE_TAGS}
                  selected={form.nicheTags}
                  onToggle={v => toggleArray('nicheTags', v)}
                />

                {needsShipping && (
                  <DateField
                    label="Product shipping by"
                    required
                    value={form.productShippingBy}
                    onChange={v => set('productShippingBy', v)}
                    min={tomorrowISO}
                    hint="Cannot be today — earliest is tomorrow."
                  />
                )}
                <DateField
                  label="Content draft delivery by"
                  required
                  value={form.draftDeliveryBy}
                  onChange={v => set('draftDeliveryBy', v)}
                  min={form.productShippingBy || tomorrowISO}
                  hint={
                    draftDeliverySuggestion
                      ? `Suggested from shipping date: ${draftDeliverySuggestion}`
                      : 'Suggested as product shipping + 7 days.'
                  }
                />
                <Field
                  label="Revisions included"
                  required
                  keyboard="numeric"
                  value={String(form.revisions)}
                  onChange={v => set('revisions', Number(v) || 0)}
                  hint="Extra revisions: Rs. 500 each (Rs. 300 creator, Rs. 200 platform)"
                />
                <DateField
                  label="Final content delivery by"
                  required
                  value={form.finalDeliveryBy}
                  onChange={v => set('finalDeliveryBy', v)}
                  min={form.draftDeliveryBy || tomorrowISO}
                />

                <ChipGroup
                  label="Budget"
                  required
                  options={['Fixed amount', 'Range']}
                  selected={[
                    form.budgetMode === 'fixed' ? 'Fixed amount' : 'Range',
                  ]}
                  onToggle={v =>
                    set('budgetMode', v === 'Fixed amount' ? 'fixed' : 'range')
                  }
                />
                {form.budgetMode === 'fixed' ? (
                  <Field
                    label="Fixed budget (Rs.)"
                    required
                    keyboard="numeric"
                    value={form.fixedBudget}
                    onChange={v => set('fixedBudget', v)}
                    placeholder="1900"
                  />
                ) : (
                  <>
                    <Field
                      label="Min budget (Rs.)"
                      keyboard="numeric"
                      value={form.budgetMin}
                      onChange={v => set('budgetMin', v)}
                      placeholder="1500"
                    />
                    <Field
                      label="Max budget (Rs.)"
                      required
                      keyboard="numeric"
                      value={form.budgetMax}
                      onChange={v => set('budgetMax', v)}
                      placeholder="2500"
                    />
                  </>
                )}
              </>
            )}

            {step === 8 && (
              <>
                <Text style={styles.sectionTitle}>Review your brief</Text>
                <ReviewRow label="Campaign" value={form.campaignName} />
                <ReviewRow label="Brand" value={form.brandName} />
                <ReviewRow label="Category" value={form.category} />
                <ReviewRow label="Product" value={form.productName} />
                <ReviewRow
                  label="Objectives"
                  value={form.objectives.join(', ')}
                />
                <ReviewRow
                  label="Deliverables"
                  value={form.deliverables
                    .map(item => `${item.quantity} x ${item.type || 'not set'}`)
                    .join(', ')}
                />
                <ReviewRow label="Tone" value={form.tones.join(', ')} />
                <ReviewRow
                  label="Usage rights"
                  value={`${form.platforms.length} platform(s) · ${
                    form.rightsDuration || 'not set'
                  }`}
                />
                <ReviewRow label="Exclusivity" value={form.exclusivity} />
                <ReviewRow
                  label="Creator"
                  value={`${form.creatorLevel || 'any level'} · ${
                    form.qualityTier || 'any tier'
                  } · ${form.cityFilter}`}
                />
                <ReviewRow label="Ship by" value={form.productShippingBy} />
                <ReviewRow label="Draft by" value={form.draftDeliveryBy} />
                <ReviewRow label="Final by" value={form.finalDeliveryBy} />

                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Creator payout</Text>
                    <Text style={styles.summaryValue}>
                      ₹{budget.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      Platform commission (25%)
                    </Text>
                    <Text style={styles.summaryValue}>
                      ₹{commission.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Listing fee (one-time)</Text>
                    <Text style={styles.summaryValue}>
                      ₹{listingFee.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <Text style={styles.summaryTotalLabel}>
                      Total wallet debit
                    </Text>
                    <Text style={styles.summaryTotalValue}>
                      ₹{totalDebit.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <Text style={styles.summaryNote}>
                    Published briefs are reviewed by our team before creators
                    can see them.
                  </Text>
                </View>

                {pricingLifts.length > 0 && (
                  <View style={styles.lifts}>
                    <Text style={styles.liftsTitle}>Pricing suggestions</Text>
                    {pricingLifts.map(lift => (
                      <Text key={lift} style={styles.liftText}>
                        • {lift}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: scale(12) + insets.bottom }]}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={goBack}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, busy !== null && styles.nextBtnOff]}
            onPress={last ? () => submit('publish') : goNext}
            disabled={busy !== null}
            accessibilityRole="button"
          >
            {busy === 'publish' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.nextText}>
                {last ? 'Publish Campaign' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: scale(10),
    paddingTop: scale(8),
    paddingBottom: scale(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  headerBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  headerStep: { marginTop: scale(2), fontSize: fontScale(11), color: '#777B96' },
  saveDraft: {
    paddingHorizontal: scale(8),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },

  progress: {
    flexDirection: 'row',
    gap: scale(4),
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

  // The tail padding is deliberately generous: with the keyboard up, the last
  // field in a section (budget, price) used to sit under it with nothing left
  // to scroll into, so it could not be read while being typed.
  content: { padding: scale(16), paddingTop: 0, paddingBottom: scale(140) },
  card: {
    padding: scale(16),
    paddingTop: scale(2),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  sectionTitle: {
    marginTop: scale(16),
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
  hint: { marginTop: scale(5), fontSize: fontScale(11), color: '#8A8FA8' },
  // The counter turns red while the entry is outside its length rule.
  hintBad: { color: '#D2454B' },
  resumed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(10),
    marginBottom: scale(10),
    padding: scale(11),
    borderRadius: scale(12),
    backgroundColor: '#EAF7F2',
    borderWidth: 1,
    borderColor: '#CDEBE0',
  },
  resumedText: { flex: 1, fontSize: fontScale(11.5), color: '#186A4B' },
  resumedAction: {
    fontSize: fontScale(11.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#0F7B43',
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  typeCard: {
    width: '48%',
    padding: scale(11),
    borderRadius: scale(13),
    borderWidth: 1.5,
    borderColor: '#E7E8F4',
    backgroundColor: '#FBFBFE',
  },
  typeCardOn: { borderColor: '#4C5BF3', backgroundColor: '#EEEFFF' },
  typeLabel: {
    fontSize: fontScale(12.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#15163F',
  },
  typeLabelOn: { color: '#2F3ACF' },
  typeHint: {
    marginTop: scale(3),
    fontSize: fontScale(10.5),
    lineHeight: fontScale(14),
    color: '#8A8FA8',
  },
  typeOther: { marginTop: scale(9) },
  typeNote: {
    marginTop: scale(8),
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#0891B2',
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  dateInput: { flex: 1 },
  calendarBtn: {
    width: scale(46),
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#F3F4FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  calendar: {
    width: '100%',
    maxWidth: scale(340),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(14),
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(8),
  },
  calendarNav: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4FE',
  },
  calendarNavText: {
    fontSize: fontScale(19),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  calendarTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#15163F',
  },
  weekRow: { flexDirection: 'row', marginBottom: scale(2) },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: fontScale(10.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#9497B4',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    width: `${100 / 7}%`,
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: {
    // The pill is inset so neighbouring days keep their spacing.
    borderRadius: scale(10),
    backgroundColor: '#4C5BF3',
  },
  dayText: { fontSize: fontScale(13), color: '#2B2D55' },
  // Past days stay visible but read as unavailable rather than disappearing.
  dayOff: { color: '#C7C9DA' },
  dayTextOn: {
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calendarNote: {
    marginTop: scale(6),
    fontSize: fontScale(10.5),
    color: '#8A8FA8',
    textAlign: 'center',
  },
  input: {
    minHeight: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    fontSize: fontScale(15),
    color: '#15163F',
    paddingVertical: scale(12),
  },
  inputStacked: { marginTop: scale(8) },
  inputMultiline: { minHeight: scale(86), textAlignVertical: 'top' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  chip: {
    height: scale(36),
    paddingHorizontal: scale(14),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  chipCompact: { height: scale(32), paddingHorizontal: scale(11) },
  chipActive: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  chipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  chipTextActive: { color: '#FFFFFF' },

  segment: { flexDirection: 'row', gap: scale(8) },
  segmentBtn: {
    flex: 1,
    height: scale(40),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  segmentOn: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  segmentText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  segmentTextOn: { color: '#FFFFFF' },

  deliverable: {
    marginTop: scale(16),
    paddingTop: scale(4),
    paddingBottom: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F8',
  },
  deliverableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deliverableTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: scale(14) },
  stepBtn: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    minWidth: scale(22),
    textAlign: 'center',
  },

  addRow: {
    marginTop: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  addRowText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },

  checkRow: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  box: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(6),
    borderWidth: 1.5,
    borderColor: '#C3C6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#4C5BF3', borderColor: '#4C5BF3' },
  checkText: { flex: 1, fontSize: fontScale(13), color: '#3B3F5C' },

  reviewRow: {
    marginTop: scale(12),
    paddingBottom: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#F2F3F9',
  },
  reviewLabel: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8A8FA8',
  },
  reviewValue: { marginTop: scale(3), fontSize: fontScale(13), color: '#15163F' },

  summary: {
    marginTop: scale(18),
    padding: scale(14),
    borderRadius: scale(12),
    backgroundColor: '#F4F5FA',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(8),
  },
  summaryLabel: { fontSize: fontScale(13), color: '#5C6180' },
  summaryValue: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#3B3F5C',
  },
  summaryTotal: {
    marginBottom: 0,
    paddingTop: scale(8),
    borderTopWidth: 1,
    borderTopColor: '#E2E4F0',
  },
  summaryTotalLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  summaryTotalValue: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#15163F',
  },
  summaryNote: {
    marginTop: scale(10),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#777B96',
  },

  lifts: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFF8E8',
  },
  liftsTitle: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#8A6100',
    marginBottom: scale(6),
  },
  liftText: { fontSize: fontScale(11), lineHeight: fontScale(17), color: '#8A6100' },

  errorBox: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFE6E7',
  },
  errorText: {
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C4373B',
  },

  footer: {
    flexDirection: 'row',
    gap: scale(10),
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    borderTopWidth: 1,
    borderTopColor: '#EDEEF6',
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: scale(100),
    height: scale(48),
    borderRadius: scale(13),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#5C6180',
  },
  nextBtn: {
    flex: 1,
    height: scale(48),
    borderRadius: scale(13),
    backgroundColor: '#1B2A6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnOff: { opacity: 0.6 },
  nextText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default BrandPostBrief;
