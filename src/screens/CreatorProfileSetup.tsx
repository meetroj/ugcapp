/**
 * Creator onboarding — the native replacement for the web
 * /profile-setup/creator page.
 *
 * The web runs four steps (sign-up counts as step 1, so it labels them "Step 2
 * of 5" through "Step 5 of 5"): Profile Basics, Contact Information, Build Your
 * Creator Portfolio, then Recording Setup & Equipment. Every field and the
 * whole submit payload match it key-for-key, because the same profile is read
 * back by the web dashboard and the admin review screens.
 *
 * What deliberately differs is the chrome, not the data: the web uses icon
 * grids and hover cards, this uses the chip / select / sheet vocabulary the
 * rest of the native app already speaks.
 *
 * Two web-only conveniences are left out because they need services the app has
 * no client for: the PIN-code-to-city lookup that cross-checks the address, and
 * the per-platform live link probes. The required and format checks still run.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
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
  session?: AuthUser;
  onDone: () => void;
  onLogout?: () => void;
};

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
/** Selected chip: a tinted wash rather than a solid fill. */
const CHIP_ON = 'rgba(109,123,255,0.20)';
const SHEET = '#17171F';

const STEP_META = [
  {
    title: 'Profile Basics',
    sub: 'Just the essentials to get your creator profile started.',
  },
  {
    title: 'Contact Information',
    sub: 'We use this to communicate about projects and payments.',
  },
  {
    title: 'Build Your Creator Portfolio',
    sub: 'This is the profile brands will see when shortlisting creators.',
  },
  {
    title: 'Recording Setup & Equipment',
    sub: 'Select what you have access to, so brands can match you to the right projects.',
  },
];
const TOTAL_STEPS = STEP_META.length;

/** National-number length per dial code; anything else allows up to 15. */
const PHONE_LEN: Record<string, number> = {
  '+91': 10,
  '+1': 10,
  '+44': 10,
  '+61': 9,
};
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

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** The City list is driven by the chosen State, exactly as on the web. */
const CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Tirupati', 'Kakinada'],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang'],
  Assam: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur'],
  Bihar: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai'],
  Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Raigarh'],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh'],
  Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Kullu', 'Manali'],
  Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Hubballi-Dharwad', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari', 'Tumakuru'],
  Kerala: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Solapur', 'Thane', 'Navi Mumbai', 'Kolhapur'],
  Manipur: ['Imphal', 'Thoubal', 'Bishnupur'],
  Meghalaya: ['Shillong', 'Tura', 'Jowai'],
  Mizoram: ['Aizawl', 'Lunglei', 'Champhai'],
  Nagaland: ['Kohima', 'Dimapur', 'Mokokchung'],
  Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri'],
  Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar'],
  Sikkim: ['Gangtok', 'Namchi', 'Gyalshing'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'],
  Telangana: ['Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'],
  Tripura: ['Agartala', 'Udaipur', 'Dharmanagar'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Noida', 'Bareilly'],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh', 'Nainital'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Darjeeling', 'Kharagpur'],
  'Andaman and Nicobar Islands': ['Port Blair'],
  Chandigarh: ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Silvassa', 'Daman', 'Diu'],
  Delhi: ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Saket'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla'],
  Ladakh: ['Leh', 'Kargil'],
  Lakshadweep: ['Kavaratti'],
  Puducherry: ['Puducherry', 'Karaikal', 'Yanam', 'Mahe'],
};

const GENDERS = ['Male', 'Female', 'Other'];
const BODY_TYPES = ['Average', 'Slim', 'Athletic', 'Plus Size', 'No Preference'];
const SKIN_TONES = ['Fair', 'Brown', 'Dark', 'No preference'];

/** How the content is made. Mirrors CONTENT_CATEGORIES on the web. */
const CONTENT_STYLES = [
  { value: 'testimonial', label: 'Testimonial / Review' },
  { value: 'product_demo', label: 'Product Demo' },
  { value: 'try_on', label: 'Try-On / Haul' },
  { value: 'grwm', label: 'GRWM (Get Ready With Me)' },
  { value: 'day_in_life', label: 'Day-in-the-Life / Vlog' },
  { value: 'transformation', label: 'Before & After / Transformation' },
  { value: 'food', label: 'Recipe / Food' },
  { value: 'voiceover', label: 'Voiceover / Faceless' },
  { value: 'asmr', label: 'ASMR' },
  { value: 'ugc_ad', label: 'Problem-Solution Ad / Skit' },
  { value: 'comparison', label: 'Comparison / This vs That' },
  { value: 'street_interview', label: 'Street Interview / Vox Pop' },
  { value: 'custom', label: 'Custom' },
];

/** What the content is ABOUT. The same ten the brand signup uses. */
const NICHE_CATEGORIES = [
  { value: 'fashion', label: 'Fashion & Apparel' },
  { value: 'beauty', label: 'Beauty & Cosmetics' },
  { value: 'tech', label: 'Technology & Gadgets' },
  { value: 'food', label: 'Food & Beverage' },
  { value: 'fitness', label: 'Health & Fitness' },
  { value: 'home', label: 'Home & Lifestyle' },
  { value: 'travel', label: 'Travel & Tourism' },
  { value: 'education', label: 'Education' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'other', label: 'Other' },
];

const SKILLS = [
  'Script Writing',
  'Voiceovers',
  'Acting',
  'Videography (DOP)',
  'Video Editing',
  'Modelling',
];

const PLATFORMS = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
];

const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati',
  'Kannada', 'Malayalam', 'Punjabi', 'Bhojpuri',
];
const FLUENCY = ['Native', 'Fluent', 'Conversational'];
const WEEKLY = [
  '1-5 hrs / week',
  '6-10 hrs / week',
  '11-20 hrs / week',
  '20+ hrs / week',
];
const TOPICS = ['None', 'Alcohol', 'Gambling', 'Adult products'];
const PAYOUT_PERIODS = ['Per Video'];

const CORE_SETUP = [
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
const APPEAR_IN = [
  'Solo only',
  'Friends / peers',
  'Family members',
  'Pets / animals',
];

/** The three yes/no add-ons on the last step. */
const ADDONS = [
  {
    key: 'ownAccount',
    title: 'Post content from your own account',
    note: 'Includes organic posts or collab posts.',
    yes: 'Yes, I can post from my account',
  },
  {
    key: 'runAds',
    title: 'Run ads via your account (Collab / Branded Ads)',
    note: 'Only for brand-approved, paid collaborations.',
    yes: 'Yes, I am open to running ads',
  },
  {
    key: 'newAccount',
    title: 'Create a new account for a brand',
    note: 'For brands that need a fresh account for campaigns.',
    yes: 'Yes, I can set up an account',
  },
];

/** Required per step. The web keeps the photo and the map link optional. */
const STEP1_FIELDS = [
  'firstName',
  'lastName',
  'age',
  'gender',
  'bodyType',
  'skinTone',
];
const STEP2_FIELDS = [
  'phone',
  'pincode',
  'country',
  'state',
  'city',
  'address',
];

/** Web caps portfolio video at 100MB and the profile photo at 5MB. */
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const onlyDigits = (value: string) => String(value ?? '').replace(/\D/g, '');
const phoneMax = (dial: string) => PHONE_LEN[dial] || 15;
const phoneValid = (value: string, dial: string) =>
  onlyDigits(value).length === phoneMax(dial);
const isFilled = (value: unknown) => String(value ?? '').trim() !== '';

/**
 * A pasted international number arrives with the country code merged in. Drop
 * it, but only when that is the sole reason the number is too long — so a real
 * number that happens to start with "91" is left alone.
 */
function stripDialPrefix(digits: string, dial: string): string {
  const cc = onlyDigits(dial);
  const max = phoneMax(dial);
  return cc && digits.startsWith(cc) && digits.length > max
    ? digits.slice(cc.length)
    : digits;
}

const mediaUrl = (path: string) =>
  /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;

type PortfolioItem = {
  id: string;
  price: string;
  category: string;
  delivery: string;
  videoUrl: string;
};

type Data = {
  profile_picture: string;
  firstName: string;
  lastName: string;
  age: string;
  gender: string;
  contentStyles: string[];
  contentCategories: string[];
  customCategory: string;
  bodyType: string;
  skinTone: string;
  bio: string;
  dialCode: string;
  phone: string;
  pincode: string;
  country: string;
  state: string;
  city: string;
  address: string;
  mapLink: string;
  skills: string[];
  links: Record<string, string>;
  followers: Record<string, string>;
  portfolio: PortfolioItem[];
  languages: string[];
  langFluency: Record<string, string>;
  coreSetup: string[];
  appearIn: string[];
  ownAccount: string;
  runAds: string;
  newAccount: string;
  bring: string;
  weekly: string;
  flexible: boolean;
  lastSalary: string;
  expectedPayout: string;
  payoutPeriod: string;
  deliveryDays: string;
  topics: string[];
};

const EMPTY: Data = {
  profile_picture: '',
  firstName: '',
  lastName: '',
  age: '',
  gender: '',
  contentStyles: [],
  contentCategories: [],
  customCategory: '',
  bodyType: '',
  skinTone: '',
  bio: '',
  dialCode: '+91',
  phone: '',
  pincode: '',
  country: 'India',
  state: '',
  city: '',
  address: '',
  mapLink: '',
  skills: [],
  links: { youtube: '', linkedin: '', instagram: '', tiktok: '' },
  followers: { youtube: '', linkedin: '', instagram: '', tiktok: '' },
  portfolio: [],
  languages: [],
  langFluency: {},
  coreSetup: [],
  appearIn: [],
  ownAccount: '',
  runAds: '',
  newAccount: '',
  bring: '',
  weekly: '',
  flexible: false,
  lastSalary: '',
  expectedPayout: '',
  payoutPeriod: 'Per Video',
  deliveryDays: '',
  topics: ['None'],
};

function CreatorProfileSetup({ token, session, onDone, onLogout }: Props) {
  const insets = useSafeAreaInsets();
  // The keyboard covers the gesture bar, so the inset would only show as a gap.
  const keyboardUp = useKeyboardVisible();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Data>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [picker, setPicker] = useState<null | {
    field: keyof Data;
    title: string;
    items: { label: string; value: string }[];
    /** Multi pickers toggle and stay open; single ones close on choice. */
    multi?: boolean;
  }>(null);

  // Its category is chosen from a list, not typed, so it matches the values
  // brands filter on.
  const [draftPicker, setDraftPicker] = useState(false);

  // Draft for the portfolio item being added.
  const [draft, setDraft] = useState({
    price: '',
    category: '',
    delivery: '',
    videoUrl: '',
  });

  const set = useCallback(
    <K extends keyof Data>(key: K, value: Data[K]) =>
      setData(prev => ({ ...prev, [key]: value })),
    [],
  );

  /**
   * The mobile number is captured at sign-up and stored on the user (not under
   * `profile`), so carry it into the contact step rather than asking twice.
   * Never overwrites a number already typed here.
   */
  useEffect(() => {
    const signupPhone = session?.phone;
    const signupDial = session?.dial_code;
    if (typeof signupPhone !== 'string' || !signupPhone.trim()) {
      return;
    }
    setData(prev =>
      prev.phone
        ? prev
        : {
            ...prev,
            phone: onlyDigits(signupPhone),
            dialCode:
              typeof signupDial === 'string' && signupDial.trim()
                ? signupDial
                : prev.dialCode,
          },
    );
  }, [session]);

  const toggle = useCallback(
    (key: 'contentStyles' | 'contentCategories' | 'skills' | 'languages' | 'coreSetup' | 'appearIn' | 'topics', value: string) =>
      setData(prev => {
        const list = prev[key];
        const next = list.includes(value)
          ? list.filter(item => item !== value)
          : [...list, value];
        return { ...prev, [key]: next };
      }),
    [],
  );

  const cities = useMemo(
    () => CITIES_BY_STATE[data.state] || [],
    [data.state],
  );

  /** Which required fields on the current step are still incomplete. */
  const checksFor = useCallback(
    (which: number): Record<string, boolean> => {
    if (which === 1) {
      const base: Record<string, boolean> = Object.fromEntries(
        STEP1_FIELDS.map(key => [key, isFilled((data as any)[key])]),
      );
      // Both pickers need at least one, and a "custom" style needs its text.
      base.contentStyles = data.contentStyles.length > 0;
      base.contentCategories = data.contentCategories.length > 0;
      return base;
    }
    if (which === 2) {
      const base: Record<string, boolean> = Object.fromEntries(
        STEP2_FIELDS.map(key => [key, isFilled((data as any)[key])]),
      );
      base.phone = base.phone && phoneValid(data.phone, data.dialCode);
      return base;
    }
    if (which === 3) {
      return {
        skills: data.skills.length > 0,
        profileLink: PLATFORMS.some(p => isFilled(data.links[p.key])),
        portfolio: data.portfolio.length > 0,
        languages: data.languages.length > 0,
        expectedPayout: isFilled(data.expectedPayout),
        deliveryDays: Number(data.deliveryDays) > 0,
      };
    }
    // The web leaves the last step entirely optional.
    return {};
    },
    [data],
  );

  const checks = useMemo(() => checksFor(step), [checksFor, step]);

  const stepComplete = Object.values(checks).every(Boolean);
  const bad = (key: string) => showErrors && checks[key] === false;

  const pickPhoto = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return;
    }
    if ((asset.fileSize || 0) > PHOTO_MAX_BYTES) {
      setError('Image is too large. Maximum 5MB.');
      return;
    }
    setPhotoUploading(true);
    setError('');
    try {
      const url = await uploadMedia(
        token,
        { uri: asset.uri, fileName: asset.fileName, type: asset.type },
        'photo',
      );
      set('profile_picture', url);
    } catch (err: any) {
      const message = err?.message || 'Photo upload failed.';
      setError(message);
      Alert.alert('Photo upload failed', message);
    } finally {
      setPhotoUploading(false);
    }
  }, [set, token]);

  const pickVideo = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return;
    }
    if ((asset.fileSize || 0) > VIDEO_MAX_BYTES) {
      setError('Video is too large. Maximum 100MB.');
      return;
    }
    setVideoUploading(true);
    setError('');
    try {
      const url = await uploadMedia(token, {
        uri: asset.uri,
        fileName: asset.fileName,
        type: asset.type,
      });
      setDraft(prev => ({ ...prev, videoUrl: url }));
    } catch (err: any) {
      const message = err?.message || 'Video upload failed.';
      setError(message);
      Alert.alert('Video upload failed', message);
    } finally {
      setVideoUploading(false);
    }
  }, [token]);

  const addPortfolioItem = useCallback(() => {
    if (!draft.videoUrl) {
      const message =
        'Upload the video first — the sample is the video, so there is nothing to add without it.';
      setError(message);
      Alert.alert('No video yet', message);
      return;
    }
    setError('');
    setData(prev => ({
      ...prev,
      portfolio: [
        ...prev.portfolio,
        { ...draft, id: `pf-${prev.portfolio.length + 1}-${draft.videoUrl}` },
      ],
    }));
    setDraft({ price: '', category: '', delivery: '', videoUrl: '' });
  }, [draft]);

  const removePortfolioItem = useCallback(
    (id: string) =>
      setData(prev => ({
        ...prev,
        portfolio: prev.portfolio.filter(item => item.id !== id),
      })),
    [],
  );

  const submit = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const styleValue = (value: string) =>
        value === 'custom'
          ? data.customCategory.trim() || 'Custom'
          : value;
      const styles = data.contentStyles.map(styleValue);
      const niches = data.contentCategories;
      const fullName = [data.firstName, data.lastName]
        .map(part => part.trim())
        .filter(Boolean)
        .join(' ');

      await completeProfile(token, 'creator', {
        ...data,
        fullName,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        content_styles: styles,
        content_style: styles[0] || '',
        content_categories: niches,
        niche: niches[0] || '',
        category: niches[0] || styles[0] || '',
        primary_category: niches[0] || styles[0] || '',
        bio: data.bio || '',
        tags: data.skills,
        // The deployed backend types portfolio as List[str], so the raw objects
        // 422 — send URL refs here and keep the structured items alongside.
        portfolio: data.portfolio.map(item => item.videoUrl).filter(Boolean),
        portfolio_items: data.portfolio.filter(item => !!item.videoUrl),
        social_links: Object.fromEntries(
          Object.entries(data.links).filter(([, value]) => value && value.trim()),
        ),
        delivery_days: data.deliveryDays ? Number(data.deliveryDays) : '',
        rate_card: {
          last_salary: data.lastSalary || '',
          expected_payout: data.expectedPayout || '',
          payout_period: data.payoutPeriod || '',
          delivery_days: data.deliveryDays ? Number(data.deliveryDays) : '',
        },
        availability_calendar: {
          weekly: data.weekly || '',
          flexible: !!data.flexible,
        },
        payment_methods: {},
        receive_briefs: true,
        terms_agreed: true,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit profile');
    } finally {
      setSaving(false);
    }
  }, [data, onDone, token]);

  const next = useCallback(() => {
    if (!stepComplete) {
      setShowErrors(true);
      setError('Fill in the highlighted fields.');
      return;
    }
    setShowErrors(false);
    setError('');
    if (step < TOTAL_STEPS) {
      setStep(current => current + 1);
      return;
    }
    submit();
  }, [step, stepComplete, submit]);

  const back = useCallback(() => {
    setShowErrors(false);
    setError('');
    setStep(current => Math.max(1, current - 1));
  }, []);

  const openPicker = useCallback(
    (field: keyof Data, title: string, options: string[]) =>
      setPicker({
        field,
        title,
        items: options.map(option => ({ label: option, value: option })),
      }),
    [],
  );

  const openMultiPicker = useCallback(
    (
      field: keyof Data,
      title: string,
      items: { label: string; value: string }[],
    ) => setPicker({ field, title, items, multi: true }),
    [],
  );

  const percent = useMemo(() => {
    let credit = 1;
    for (let s = 1; s <= TOTAL_STEPS; s += 1) {
      const values = Object.values(checksFor(s));
      if (values.length) {
        credit += values.filter(Boolean).length / values.length;
      }
    }
    return Math.round((credit / (TOTAL_STEPS + 1)) * 100);
  }, [checksFor]);

  const meta = STEP_META[step - 1];

  return (
    <View style={styles.screen}>
      {/* Topbar: wordmark + the role tag, exactly as the web page opens. */}
      <View style={[styles.topbar, { paddingTop: insets.top + scale(8) }]}>
        <Text style={styles.brand}>
          UGC<Text style={styles.brandDim}>ad.io</Text>
        </Text>
        <View style={styles.topTag}>
          <Text style={styles.topTagText}>Creator onboarding</Text>
        </View>
        {!!onLogout && (
          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Field-granular completion, like the web: sign-up counts as one whole
          step and every filled field nudges the bar up inside the current one. */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Your Profile is <Text style={styles.progressPct}>{percent}%</Text>{' '}
          Complete
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  Step {step + 1} of {TOTAL_STEPS + 1}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{meta.title}</Text>
              <TouchableOpacity
                style={styles.photoPicker}
                onPress={pickPhoto}
                disabled={photoUploading}
                accessibilityRole="button"
                accessibilityLabel="Add a profile photo"
              >
                {photoUploading ? (
                  <ActivityIndicator color="#5B5CF6" />
                ) : data.profile_picture ? (
                  <Image
                    source={{ uri: mediaUrl(data.profile_picture) }}
                    style={styles.photoImage}
                  />
                ) : (
                  <Text style={styles.photoPlus}>+</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.photoHint}>
                {data.profile_picture
                  ? 'Tap to change photo'
                  : 'Add a profile photo (optional)'}
              </Text>

              <Field
                label="First name"
                required
                value={data.firstName}
                onChange={v => set('firstName', v)}
                placeholder="Priya"
                error={bad('firstName')}
              />
              <Field
                label="Last name"
                required
                value={data.lastName}
                onChange={v => set('lastName', v)}
                placeholder="Sharma"
                error={bad('lastName')}
              />
              <Field
                label="Age"
                required
                value={data.age}
                onChange={v => set('age', onlyDigits(v).slice(0, 2))}
                placeholder="24"
                keyboard="phone-pad"
                error={bad('age')}
              />

              <Chips
                label="Gender"
                required
                options={GENDERS}
                selected={data.gender ? [data.gender] : []}
                onPress={value => set('gender', value)}
                error={bad('gender')}
              />

              <MultiSelect
                label="How do you make content?"
                required
                placeholder="Select content styles"
                items={CONTENT_STYLES}
                selected={data.contentStyles}
                onPress={() =>
                  openMultiPicker(
                    'contentStyles',
                    'How do you make content?',
                    CONTENT_STYLES,
                  )
                }
                error={bad('contentStyles')}
              />

              <MultiSelect
                label="What do you make content about?"
                required
                placeholder="Select categories"
                items={NICHE_CATEGORIES}
                selected={data.contentCategories}
                onPress={() =>
                  openMultiPicker(
                    'contentCategories',
                    'What do you make content about?',
                    NICHE_CATEGORIES,
                  )
                }
                error={bad('contentCategories')}
              />

              <Chips
                label="Body type"
                required
                options={BODY_TYPES}
                selected={data.bodyType ? [data.bodyType] : []}
                onPress={value => set('bodyType', value)}
                error={bad('bodyType')}
              />
              <Chips
                label="Skin tone"
                required
                options={SKIN_TONES}
                selected={data.skinTone ? [data.skinTone] : []}
                onPress={value => set('skinTone', value)}
                error={bad('skinTone')}
              />
            </View>
          )}

          {step === 2 && (
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  Step {step + 1} of {TOTAL_STEPS + 1}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{meta.title}</Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Phone number<Text style={styles.required}> *</Text>
                </Text>
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={styles.dialButton}
                    onPress={() =>
                      openPicker(
                        'dialCode',
                        'Select a dial code',
                        DIAL_CODES.map(item => item.code),
                      )
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.dialText}>{data.dialCode}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[
                      styles.input,
                      styles.phoneInput,
                      bad('phone') && styles.inputError,
                    ]}
                    value={data.phone}
                    onChangeText={v =>
                      set(
                        'phone',
                        stripDialPrefix(onlyDigits(v), data.dialCode).slice(
                          0,
                          phoneMax(data.dialCode),
                        ),
                      )
                    }
                    placeholder="98765 43210"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <Select
                label="Country"
                required
                value={data.country}
                placeholder="Select a country"
                onPress={() => openPicker('country', 'Select a country', COUNTRIES)}
                error={bad('country')}
              />
              <Select
                label="State"
                required
                value={data.state}
                placeholder="Select a state"
                onPress={() => openPicker('state', 'Select a state', STATES)}
                error={bad('state')}
              />
              <Select
                label="City"
                required
                value={data.city}
                placeholder={
                  data.state ? 'Select a city' : 'Choose a state first'
                }
                onPress={() =>
                  data.state && openPicker('city', 'Select a city', cities)
                }
                error={bad('city')}
              />
              <Field
                label="Pincode"
                required
                value={data.pincode}
                onChange={v => set('pincode', onlyDigits(v).slice(0, 6))}
                placeholder="560001"
                keyboard="phone-pad"
                error={bad('pincode')}
              />
              <Field
                label="Address"
                required
                multiline
                value={data.address}
                onChange={v => set('address', v)}
                placeholder="Flat, street, area"
                error={bad('address')}
              />
              <Field
                label="Map link"
                value={data.mapLink}
                onChange={v => set('mapLink', v)}
                placeholder="Google Maps link (optional)"
                keyboard="url"
              />
            </View>
          )}

          {step === 3 && (
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  Step {step + 1} of {TOTAL_STEPS + 1}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{meta.title}</Text>
              <Chips
                label="Your skills"
                hint="Pick at least one."
                required
                options={SKILLS}
                selected={data.skills}
                onPress={value => toggle('skills', value)}
                error={bad('skills')}
              />

              <Text style={styles.sectionTitle}>Social profiles</Text>
              <Text style={styles.sectionNote}>
                At least one link is required. Follower counts are optional.
              </Text>
              {PLATFORMS.map(platform => (
                <View key={platform.key} style={styles.field}>
                  <View style={styles.platformHead}>
                    <PlatformBadge platform={platform.key} />
                    <Text style={styles.fieldLabel}>{platform.label}</Text>
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      bad('profileLink') && styles.inputError,
                    ]}
                    value={data.links[platform.key] || ''}
                    onChangeText={v =>
                      set('links', { ...data.links, [platform.key]: v })
                    }
                    placeholder={`${platform.label} link or handle`}
                    placeholderTextColor={PLACEHOLDER}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}

              <Text style={styles.sectionTitle}>Portfolio samples</Text>
              <Text style={styles.sectionNote}>
                Add at least one sample. Brands watch these first.
              </Text>

              {data.portfolio.map(item => (
                <View key={item.id} style={styles.portfolioRow}>
                  <Text style={styles.portfolioText} numberOfLines={1}>
                    {item.category || 'Sample'}
                    {item.price ? ` · ${item.price}` : ''}
                    {item.delivery ? ` · ${item.delivery} days` : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removePortfolioItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove sample"
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View
                style={[
                  styles.draftBox,
                  bad('portfolio') && styles.inputError,
                ]}
              >
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={pickVideo}
                  disabled={videoUploading}
                  accessibilityRole="button"
                >
                  {videoUploading ? (
                    <ActivityIndicator color="#5B5CF6" />
                  ) : (
                    <Text style={styles.uploadText}>
                      {draft.videoUrl ? 'Video ready ✓' : 'Upload a video'}
                    </Text>
                  )}
                </TouchableOpacity>
                <Field
                  label="Price"
                  value={draft.price}
                  onChange={v =>
                    setDraft(prev => ({ ...prev, price: onlyDigits(v) }))
                  }
                  placeholder="2000"
                  keyboard="phone-pad"
                />
                <Select
                  label="Category"
                  value={draft.category}
                  placeholder="Select a category"
                  onPress={() => setDraftPicker(true)}
                />
                <Field
                  label="Delivery (days)"
                  value={draft.delivery}
                  onChange={v =>
                    setDraft(prev => ({ ...prev, delivery: onlyDigits(v) }))
                  }
                  placeholder="5"
                  keyboard="phone-pad"
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addPortfolioItem}
                  accessibilityRole="button"
                >
                  <Text style={styles.addButtonText}>Add sample</Text>
                </TouchableOpacity>
              </View>

              <Chips
                label="Languages"
                hint="Pick at least one, then set fluency."
                required
                options={LANGUAGES}
                selected={data.languages}
                onPress={value => toggle('languages', value)}
                error={bad('languages')}
              />
              {data.languages.map(language => (
                <Chips
                  key={language}
                  label={`${language} fluency`}
                  options={FLUENCY}
                  selected={
                    data.langFluency[language]
                      ? [data.langFluency[language]]
                      : []
                  }
                  onPress={value =>
                    set('langFluency', {
                      ...data.langFluency,
                      [language]: value,
                    })
                  }
                />
              ))}

              <Text style={styles.sectionTitle}>Rates</Text>
              <Field
                label="Expected payout"
                required
                value={data.expectedPayout}
                onChange={v => set('expectedPayout', v)}
                placeholder="5000"
                keyboard="phone-pad"
                error={bad('expectedPayout')}
              />
              <Select
                label="Payout period"
                value={data.payoutPeriod}
                placeholder="Per Video"
                onPress={() =>
                  openPicker('payoutPeriod', 'Payout period', PAYOUT_PERIODS)
                }
              />
              <Field
                label="Delivery days"
                required
                value={data.deliveryDays}
                onChange={v => set('deliveryDays', onlyDigits(v))}
                placeholder="5"
                keyboard="phone-pad"
                error={bad('deliveryDays')}
              />
            </View>
          )}

          {step === 4 && (
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  Step {step + 1} of {TOTAL_STEPS + 1}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{meta.title}</Text>
              <Chips
                label="Core setup"
                hint="Everything you can shoot with."
                options={CORE_SETUP}
                selected={data.coreSetup}
                onPress={value => toggle('coreSetup', value)}
              />
              <Chips
                label="Who can appear in your videos?"
                options={APPEAR_IN}
                selected={data.appearIn}
                onPress={value => toggle('appearIn', value)}
              />

              {ADDONS.map(addon => {
                const value = (data as any)[addon.key] as string;
                return (
                  <View key={addon.key} style={styles.addon}>
                    <Text style={styles.addonTitle}>{addon.title}</Text>
                    <Text style={styles.addonNote}>{addon.note}</Text>
                    <View style={styles.chipRow}>
                      {[addon.yes, 'No'].map(option => {
                        const active = value === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            style={[styles.chip, active && styles.chipOn]}
                            onPress={() =>
                              set(addon.key as keyof Data, option as never)
                            }
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                active && styles.chipTextOn,
                              ]}
                            >
                              {option}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <Field
                label="Anything else you can bring?"
                multiline
                value={data.bring}
                onChange={v => set('bring', v)}
                placeholder="Props, locations, a studio..."
              />
              <Chips
                label="Weekly availability"
                options={WEEKLY}
                selected={data.weekly ? [data.weekly] : []}
                onPress={value => set('weekly', value)}
              />
              <Chips
                label="Topics you will NOT cover"
                options={TOPICS}
                selected={data.topics}
                onPress={value => toggle('topics', value)}
              />
            </View>
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.note}>
            Your profile goes to our team for a quick review after this. You can
            explore the app while it is pending.
          </Text>
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: scale(12) + (keyboardUp ? 0 : insets.bottom) }]}
        >
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={back}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>← Go Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.submit, saving && styles.submitOff]}
            onPress={next}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {step < TOTAL_STEPS ? 'Proceed →' : 'Submit Application'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{picker?.title}</Text>
              {/* A multi picker has no closing tap of its own, so it needs a
                  way out that is not "dismiss by tapping the backdrop". */}
              {picker?.multi && (
                <TouchableOpacity
                  onPress={() => setPicker(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Mirrors the web's toggle-all control: one tap takes every option,
                a second clears them. */}
            {picker?.multi &&
              (() => {
                const current = (data as any)[picker.field];
                const chosen = Array.isArray(current) ? current : [];
                const all = chosen.length === picker.items.length;
                return (
                  <TouchableOpacity
                    style={styles.modalAllRow}
                    onPress={() =>
                      set(
                        picker.field,
                        (all
                          ? []
                          : picker.items.map(item => item.value)) as never,
                      )
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalAllText}>
                      {all ? 'Clear all' : 'Select all'}
                    </Text>
                    <Text style={styles.selectCount}>
                      {chosen.length} of {picker.items.length}
                    </Text>
                  </TouchableOpacity>
                );
              })()}

            <ScrollView>
              {(picker?.items || []).map(item => {
                if (!picker) {
                  return null;
                }
                const current = (data as any)[picker.field];
                const active = picker.multi
                  ? Array.isArray(current) && current.includes(item.value)
                  : current === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={styles.modalRow}
                    onPress={() => {
                      if (picker.multi) {
                        // Toggle and stay open — picking several is the point.
                        toggle(picker.field as any, item.value);
                        return;
                      }
                      // Changing the state invalidates the chosen city.
                      if (picker.field === 'state') {
                        setData(prev => ({
                          ...prev,
                          state: item.value,
                          city: '',
                        }));
                      } else {
                        set(picker.field, item.value as never);
                      }
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
                      {item.label}
                    </Text>
                    {active && <Text style={styles.modalTick}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* The portfolio item's category. Its own sheet because the draft lives
          outside `data`, which every other picker writes into. */}
      <Modal
        visible={draftPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setDraftPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDraftPicker(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select a category</Text>
            <ScrollView>
              {NICHE_CATEGORIES.map(item => {
                const active = draft.category === item.label;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={styles.modalRow}
                    onPress={() => {
                      setDraft(prev => ({ ...prev, category: item.label }));
                      setDraftPicker(false);
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
                      {item.label}
                    </Text>
                    {active && <Text style={styles.modalTick}>✓</Text>}
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

/**
 * The real brand marks, drawn as vector paths on a tile in each network's own
 * colour — the same badges the web puts beside its profile-link rows. Instagram
 * is the one that needs a gradient rather than a flat fill; the others are a
 * single brand colour.
 */
function PlatformBadge({ platform }: { platform: string }) {
  const size = scale(26);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FEDA75" />
          <Stop offset="0.35" stopColor="#FA7E1E" />
          <Stop offset="0.6" stopColor="#D62976" />
          <Stop offset="0.8" stopColor="#962FBF" />
          <Stop offset="1" stopColor="#4F5BD5" />
        </LinearGradient>
      </Defs>

      {platform === 'youtube' && (
        <>
          <Rect x={0} y={3} width={24} height={18} rx={5} fill="#FF0000" />
          <Path d="M9.8 8.2l6.2 3.8-6.2 3.8z" fill="#FFFFFF" />
        </>
      )}

      {platform === 'linkedin' && (
        <>
          <Rect x={0} y={0} width={24} height={24} rx={5} fill="#0A66C2" />
          {/* The "i": dot over a stem. */}
          <Circle cx={7} cy={7.4} r={1.5} fill="#FFFFFF" />
          <Rect x={5.7} y={10} width={2.6} height={8} fill="#FFFFFF" />
          {/* The "n": stem plus the arch that leans off it. */}
          <Rect x={10.3} y={10} width={2.6} height={8} fill="#FFFFFF" />
          <Path
            d="M12.9 18v-4.1a2.6 2.6 0 0 1 5.2 0V18h-2.6v-3.8a1 1 0 0 0-2 0V18z"
            fill="#FFFFFF"
          />
        </>
      )}

      {platform === 'instagram' && (
        <>
          <Rect x={0} y={0} width={24} height={24} rx={6} fill="url(#ig)" />
          <Rect
            x={5}
            y={5}
            width={14}
            height={14}
            rx={4.5}
            stroke="#FFFFFF"
            strokeWidth={1.8}
            fill="none"
          />
          <Circle
            cx={12}
            cy={12}
            r={3.2}
            stroke="#FFFFFF"
            strokeWidth={1.8}
            fill="none"
          />
          <Circle cx={16.4} cy={7.7} r={1} fill="#FFFFFF" />
        </>
      )}

      {platform === 'tiktok' && (
        <>
          <Rect x={0} y={0} width={24} height={24} rx={6} fill="#111111" />
          {/* Note head with the flag curling off the top of its stem. */}
          <Path
            d="M13.4 5h2.1c.2 1.6 1.2 2.7 2.8 2.9v2.1a5 5 0 0 1-2.8-.9v4.6a4 4 0 1 1-4-4c.2 0 .4 0 .6.05v2.15a1.9 1.9 0 1 0 1.3 1.8z"
            fill="#FFFFFF"
          />
        </>
      )}
    </Svg>
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

/** Read-only row that opens the shared picker sheet. */
function Select({
  label,
  value,
  placeholder,
  onPress,
  required,
  error,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.select, error && styles.inputError]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Dropdown for the two content pickers. They are multi-select, so the row
 * summarises what is chosen rather than showing a single value, and the sheet
 * it opens keeps toggling until dismissed. A long chip grid pushed the rest of
 * the step off screen; this keeps the step scannable.
 */
function MultiSelect({
  label,
  placeholder,
  items,
  selected,
  onPress,
  required,
  error,
}: {
  label: string;
  placeholder: string;
  items: { label: string; value: string }[];
  selected: string[];
  onPress: () => void;
  required?: boolean;
  error?: boolean;
}) {
  const chosen = items
    .filter(item => selected.includes(item.value))
    .map(item => item.label);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.select, error && styles.inputError]}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Text
          style={[styles.selectText, !chosen.length && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {chosen.length ? chosen.join(', ') : placeholder}
        </Text>
      </TouchableOpacity>
      {!!chosen.length && (
        <Text style={styles.selectCount}>
          {chosen.length} of {items.length} selected
        </Text>
      )}
    </View>
  );
}

/**
 * Tappable chips. `values` lets the label shown differ from the value stored,
 * which the two content pickers need — they display a label but submit a slug.
 */
function Chips({
  label,
  hint,
  options,
  values,
  selected,
  onPress,
  required,
  error,
}: {
  label: string;
  hint?: string;
  options: string[];
  values?: string[];
  selected: string[];
  onPress: (value: string) => void;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {!!hint && <Text style={styles.sectionNote}>{hint}</Text>}
      <View style={[styles.chipRow, error && styles.chipRowError]}>
        {options.map((option, index) => {
          const value = values ? values[index] : option;
          const active = selected.includes(value);
          return (
            <TouchableOpacity
              key={value}
              style={[styles.chip, active && styles.chipOn]}
              onPress={() => onPress(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKDROP },
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
  progressPct: { color: '#FFFFFF', fontFamily: 'ReadexPro-SemiBold' },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: scale(11),
    paddingVertical: scale(4),
    borderRadius: scale(999),
    backgroundColor: ACCENT,
  },
  stepBadgeText: {
    fontSize: fontScale(10.5),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#FFFFFF',
  },
  cardTitle: {
    marginTop: scale(11),
    fontSize: fontScale(21),
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
    color: '#FFFFFF',
  },
  headerSub: {
    marginTop: scale(2),
    fontSize: fontScale(12.5),
    color: ON_DARK_MUTED,
  },
  logout: { fontSize: fontScale(13), color: 'rgba(255,255,255,0.78)' },
  progressRow: { paddingHorizontal: scale(16), paddingBottom: scale(10) },
  progressText: { fontSize: fontScale(13), color: '#FFFFFF' },
  progressTrack: {
    marginTop: scale(6),
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: ACCENT },
  content: { paddingHorizontal: scale(16), paddingBottom: scale(24) },
  card: {
    backgroundColor: CARD,
    borderRadius: scale(16),
    padding: scale(16),
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  photoPicker: {
    alignSelf: 'center',
    width: scale(88),
    height: scale(88),
    borderRadius: scale(44),
    backgroundColor: INK_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoPlus: { fontSize: fontScale(28), color: ACCENT_TEXT },
  photoHint: {
    marginTop: scale(8),
    marginBottom: scale(8),
    textAlign: 'center',
    fontSize: fontScale(12),
    color: INK_MUTED,
  },
  sectionTitle: {
    marginTop: scale(18),
    marginBottom: scale(4),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    color: ACCENT_TEXT,
  },
  sectionNote: {
    marginBottom: scale(8),
    fontSize: fontScale(12),
    color: INK_MUTED,
  },
  field: { marginTop: scale(14) },
  fieldLabel: {
    marginBottom: scale(6),
    fontSize: fontScale(13),
    color: ACCENT_TEXT,
  },
  required: { color: '#E5484D' },
  input: {
    borderWidth: 1,
    borderColor: INK_BORDER,
    borderRadius: scale(10),
    paddingHorizontal: scale(12),
    paddingVertical: scale(11),
    fontSize: fontScale(14),
    color: ACCENT_TEXT,
    backgroundColor: INK_SOFT,
  },
  inputMultiline: { minHeight: scale(88), textAlignVertical: 'top' },
  inputError: { borderColor: '#E5484D' },
  platformHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(6),
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  dialButton: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: INK_BORDER,
    backgroundColor: INK_SOFT,
  },
  dialText: { fontSize: fontScale(14), color: ACCENT_TEXT },
  phoneInput: { flex: 1 },
  select: {
    borderWidth: 1,
    borderColor: INK_BORDER,
    borderRadius: scale(10),
    paddingHorizontal: scale(12),
    paddingVertical: scale(13),
    backgroundColor: INK_SOFT,
  },
  selectText: { fontSize: fontScale(14), color: ACCENT_TEXT },
  selectPlaceholder: { color: PLACEHOLDER },
  selectCount: {
    marginTop: scale(6),
    fontSize: fontScale(11.5),
    color: INK_MUTED,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  chipRowError: {
    borderWidth: 1,
    borderColor: '#E5484D',
    borderRadius: scale(10),
    padding: scale(6),
  },
  chip: {
    paddingHorizontal: scale(12),
    paddingVertical: scale(8),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: INK_BORDER,
    backgroundColor: INK_SOFT,
  },
  chipOn: { borderColor: ACCENT, backgroundColor: CHIP_ON },
  chipText: { fontSize: fontScale(12.5), color: ACCENT_TEXT },
  chipTextOn: { color: '#FFFFFF' },
  portfolioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(8),
    paddingVertical: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#EEEFF6',
  },
  portfolioText: { flex: 1, fontSize: fontScale(13), color: ACCENT_TEXT },
  removeText: { fontSize: fontScale(12.5), color: '#E5484D' },
  draftBox: {
    marginTop: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: INK_SOFT,
  },
  uploadButton: {
    paddingVertical: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(7,7,78,0.35)',
    alignItems: 'center',
  },
  uploadText: { fontSize: fontScale(13), color: ACCENT },
  addButton: {
    marginTop: scale(14),
    paddingVertical: scale(11),
    borderRadius: scale(10),
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  addButtonText: { fontSize: fontScale(13.5), color: '#FFFFFF' },
  addon: {
    marginTop: scale(16),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: INK_SOFT,
  },
  addonTitle: { fontSize: fontScale(13.5), color: ACCENT_TEXT },
  addonNote: {
    marginTop: scale(2),
    marginBottom: scale(8),
    fontSize: fontScale(12),
    color: INK_MUTED,
  },
  errorBox: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(10),
    backgroundColor: '#FDECEC',
  },
  errorText: { fontSize: fontScale(13), color: '#B4232A' },
  note: {
    marginTop: scale(14),
    fontSize: fontScale(12),
    color: ON_DARK_MUTED,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: scale(10),
    paddingHorizontal: scale(16),
    paddingTop: scale(12),
    backgroundColor: BACKDROP,
  },
  backButton: {
    paddingHorizontal: scale(20),
    paddingVertical: scale(14),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  backText: { fontSize: fontScale(14), color: '#FFFFFF' },
  submit: {
    flex: 1,
    paddingVertical: scale(14),
    borderRadius: scale(999),
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: {
    fontSize: fontScale(14.5),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,14,34,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: SHEET,
    borderWidth: 1,
    borderColor: INK_BORDER,
    borderTopLeftRadius: scale(18),
    borderTopRightRadius: scale(18),
    padding: scale(16),
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(12),
  },
  modalDone: { fontSize: fontScale(14), color: ACCENT },
  modalAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: scale(11),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(7,7,78,0.08)',
  },
  modalAllText: { fontSize: fontScale(13.5), color: ACCENT },
  modalTick: { fontSize: fontScale(14), color: ACCENT },
  modalTitle: {
    marginBottom: scale(8),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    color: ACCENT_TEXT,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(12),
    paddingVertical: scale(13),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(7,7,78,0.08)',
  },
  modalRowText: { fontSize: fontScale(14), color: ACCENT_TEXT },
  modalRowTextOn: { color: ACCENT },
});

export default CreatorProfileSetup;
