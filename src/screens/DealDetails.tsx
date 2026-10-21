import VideoPreview from '../components/VideoPreview';
import { Alert } from '../components/AppAlert';
/**
 * Deal Details — the screen behind the arrow on an Active Work card.
 *
 * The deal object is handed in from the list rather than refetched: the backend
 * has no GET /deals/{id}, only /deals/my, and that list already returns the
 * complete build_deal_response payload this screen renders.
 *
 * Five tabs sit under a summary card and a six-step progress rail. Every tab
 * reads from the same deal object, so switching tabs costs no network.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';
import UploadProgressBar from '../components/UploadProgressBar';
import {
  addDealEvidence,
  archiveDeal,
  getBusinessReviews,
  getCampaign,
  getMyDeals,
  BACKEND_URL,
  escalateDeal,
  reportDealDamage,
  respondToRevision,
  uploadMedia,
} from '../api';
import {
  canEscalate,
  canMarkReceived,
  canReportDamage,
  dealAmount,
  dealSteps,
  dealSubs,
  disputeOpen as isDisputeOpen,
  fullBriefRows,
  hasShipping,
  isState,
  needsRevision,
  parseChange,
  primaryAction,
  REVISION_RESPONSE_LABEL,
  stepIndexFor,
  toChangeItems,
} from '../dealRoom';
import DealBooking from './DealBooking';
import DealChat from './DealChat';
import DeliveryAddress from './DeliveryAddress';
import DeliveryReceipt from './DeliveryReceipt';
import { HelpSheet, RateBrandSheet } from './DealSheets';
import WorkSubmitSheet from './WorkSubmitSheet';
import { CONTENT_MAX_WIDTH, NAV_CLEARANCE, scale, fontScale } from '../theme';

/** Loose shape: the backend returns a wide payload and fields vary by state. */
export type Deal = Record<string, any>;

type Props = {
  deal: Deal;
  /** Needed for the built-in submit-work flow (upload + POST /work/submit). */
  token?: string;
  onBack: () => void;
  onChat: () => void;
  /** Overrides the built-in submit flow when a parent wants its own. */
  onSubmitWork?: () => void;
  unread?: number;
  /**
   * Refetches the deal after an action that changes its state. Without it the
   * screen would keep rendering the deal as it was before the receipt was
   * confirmed or the dispute opened.
   */
  onChanged?: () => void;
  /** Leaves the detail view — used after archiving, which removes the deal. */
  onArchived?: () => void;
  /** Opens on this tab (e.g. Deliverables from Active Work's "See what they asked for"). */
  initialTab?: Tab;
};

export type Tab = 'Overview' | 'Brief' | 'Deliverables' | 'Timeline' | 'Payments';

/**
 * campaignId -> whether this creator already rated the brand, kept for the
 * session so reopening a paid deal does not ask again or re-fetch.
 */
const RATE_STATE = new Map<string, 'todo' | 'done'>();

const TABS: Tab[] = [
  'Overview',
  'Brief',
  'Deliverables',
  'Timeline',
  'Payments',
];

const money = (value: unknown) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const shortDate = (value: unknown) => {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const longDate = (value: unknown) => {
  const date = parseDate(value);
  if (!date) return '';
  return `${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}, ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const mediaUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

// Poster frame for a submitted video, so the version card shows the clip
// instead of a blank tile when the backend sent no thumbnail (an <Image>
// can't render an .mp4). Cloudinary videos get a `so_0` JPG.
const posterFrom = (u: string | null): string | null => {
  if (!u) return null;
  const isVid = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u);
  if (!isVid) return u;
  const m = u.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i);
  if (m) return `${m[1]}so_0/${m[2].replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg')}`;
  return null;
};

function Glyph({ name, color = '#3B3F63' }: { name: string; color?: string }) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      {name === 'doc' && (
        <>
          <Path d="M6 3.5h7L18.5 9v11.5H6V3.5Z" {...line} />
          <Path d="M13 3.5V9h5.5" {...line} />
        </>
      )}
      {name === 'box' && (
        <>
          <Path d="M12 3 4.5 7v10L12 21l7.5-4V7L12 3Z" {...line} />
          <Path d="M4.5 7 12 11l7.5-4M12 11v10" {...line} />
        </>
      )}
      {name === 'upload' && (
        <Path d="M12 15.5V4m0 0L8 8m4-4 4 4M4.5 16v2.5h15V16" {...line} />
      )}
      {name === 'revision' && (
        <>
          <Path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9" {...line} />
          <Path d="M20 4.5V9h-4.5" {...line} />
          <Path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15" {...line} />
          <Path d="M4 19.5V15h4.5" {...line} />
        </>
      )}
      {name === 'pulse' && <Path d="M3 12h3.5L9 5l3 14 2.5-7H21" {...line} />}
      {name === 'wallet' && (
        <>
          <Rect x={3} y={6} width={18} height={13} rx={3} {...line} />
          <Path d="M3 10.5h18" {...line} />
          <Circle cx="16.5" cy="15" r="1.1" fill={color} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...line} />
          <Path d="M12 7.5V12l3 1.8" {...line} />
        </>
      )}
      {name === 'chevron' && <Path d="m8 10 4 4 4-4" {...line} />}
      {name === 'play' && <Path d="M9 6.5v11l9-5.5-9-5.5Z" {...line} />}
      {name === 'download' && (
        <Path d="M12 4v10m0 0-4-4m4 4 4-4M5 18.5h14" {...line} />
      )}
      {name === 'headset' && (
        <>
          <Path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" {...line} />
          <Rect x={3} y={13.5} width={4} height={6} rx={2} {...line} />
          <Rect x={17} y={13.5} width={4} height={6} rx={2} {...line} />
        </>
      )}
      {name === 'tick' && (
        <>
          <Circle cx="12" cy="12" r="8.5" fill="#16A34A" stroke="none" />
          <Path
            d="m8.2 12.2 2.6 2.6 5-5.2"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'shield' && (
        <>
          <Path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Z" {...line} />
          <Path d="m9 12 2 2 4-4" {...line} />
        </>
      )}
    </Svg>
  );
}

/** Collapsible row used down the Overview tab. */
/**
 * One deal action, laid out like an Accordion header so the actions sit in
 * the same rhythm as the sections above them. `warn` tints the destructive
 * ones — dispute, damage, escalation — without making them shout.
 */
function ActionRow({
  label,
  caption,
  onPress,
  busy,
  tone,
}: {
  label: string;
  caption: string;
  onPress: () => void;
  busy?: boolean;
  tone?: 'warn';
}) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${caption}`}
    >
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, tone === 'warn' && styles.actionWarn]}>
          {label}
        </Text>
        <Text style={styles.actionCaption}>{caption}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color="#3D4FD8" />
      ) : (
        <Text
          style={[styles.actionChevron, tone === 'warn' && styles.actionWarn]}
        >
          ›
        </Text>
      )}
    </TouchableOpacity>
  );
}

function Accordion({
  icon,
  title,
  subtitle,
  badge,
  badgeTone,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'pending' | 'progress' | 'done';
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tone =
    badgeTone === 'done'
      ? styles.badgeDone
      : badgeTone === 'progress'
      ? styles.badgeProgress
      : styles.badgePending;
  const toneText =
    badgeTone === 'done'
      ? styles.badgeDoneText
      : badgeTone === 'progress'
      ? styles.badgeProgressText
      : styles.badgePendingText;

  return (
    <View style={styles.accordion}>
      <TouchableOpacity
        style={styles.accordionHead}
        onPress={() => setOpen(value => !value)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.accordionIcon}>
          <Glyph name={icon} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.accordionTitle}>{title}</Text>
          <Text style={styles.accordionSub}>{subtitle}</Text>
        </View>
        {!!badge && (
          <View style={[styles.badgePill, tone]}>
            <Text style={[styles.badgePillText, toneText]}>{badge}</Text>
          </View>
        )}
        <View style={open ? styles.chevronOpen : undefined}>
          <Glyph name="chevron" color="#8A8FA8" />
        </View>
      </TouchableOpacity>
      {open && !!children && (
        <View style={styles.accordionBody}>{children}</View>
      )}
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function DealDetails({
  deal: initialDeal,
  token,
  onBack,
  onChat,
  onSubmitWork,
  unread = 0,
  onChanged,
  onArchived,
  initialTab,
}: Props) {
  const [deal, setDeal] = useState(initialDeal);
  const [refreshing, setRefreshing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const mounted = useRef(false);
  const refreshingDeal = useRef(false);
  useEffect(() => { setDeal(initialDeal); }, [initialDeal]);
  const dealKey = String(initialDeal.deal_id || initialDeal.campaign?.id || '');
  const refreshDeal = useCallback(async () => {
    if (!token || refreshingDeal.current) { setRefreshing(false); return; }
    refreshingDeal.current = true;
    try {
      const fresh = await getMyDeals(token);
      const next = fresh.find(item => String(item.deal_id || item.campaign?.id) === dealKey);
      if (mounted.current && next) setDeal(next);
    } catch {
      // Keep submitted versions visible when the connection is interrupted.
    } finally {
      refreshingDeal.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [dealKey, token]);
  useEffect(() => {
    mounted.current = true;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refreshDeal();
    }, 10000);
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') refreshDeal();
    });
    return () => { mounted.current = false; clearInterval(interval); subscription.remove(); };
  }, [refreshDeal]);
  const [tab, setTab] = useState<Tab>(initialTab || 'Overview');
  // pickAndUpload() (damage / evidence photos) drives these two.
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  /** Which deal action is in flight, so only that row shows a spinner. */
  const [busyAction, setBusyAction] = useState<string>('');
  /**
   * Open text prompt. Alert.prompt is iOS-only, so actions that need a
   * sentence from the creator (escalation) render their own sheet rather than
   * silently doing nothing on Android.
   */
  const [prompt, setPrompt] = useState<{
    title: string;
    message: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [promptText, setPromptText] = useState('');
  // Sheets opened from the deal: submit work, mark received, deal chat, help, rate.
  const [workOpen, setWorkOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefill, setChatPrefill] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [addressSignal, setAddressSignal] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const addressY = useRef(0);
  // "View full brief": the deal only carries a few short sections, the site
  // fetches the whole campaign once on demand.
  const [briefOpen, setBriefOpen] = useState(false);
  const [fullBrief, setFullBrief] = useState<Record<string, any> | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');

  const campaign = deal.campaign || {};
  const brand = deal.brand || {};
  const creator = deal.creator || {};
  const escrow = deal.escrow || {};
  const submission = deal.content_submission || {};
  const revisions = deal.revision_tracker || {};

  const state = String(deal.current_state || '');
  const ships = hasShipping(deal);
  const steps = dealSteps(ships);
  const hints = dealSubs(ships);
  const step = stepIndexFor(state, ships);
  // The rail is wider than a phone: bring the current step into view instead of starting at step 1.
  const railRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    railRef.current?.scrollTo({ x: Math.max(0, (step - 1) * scale(86)), animated: false });
  }, [step]);
  const reference = String(deal.deal_id || campaign.id || '')
    .toUpperCase()
    .slice(0, 14);

  const versions: any[] = Array.isArray(submission.versions)
    ? submission.versions
    : [];
  const latest = versions.length ? versions[versions.length - 1] : null;
  const doneCount = versions.filter(
    version => String(version.status).toLowerCase() === 'approved',
  ).length;
  // The payload's required_assets is an object of flags; the count is separate.
  const requiredCount = Number(submission.required_count);
  const totalAssets = Math.max(
    1,
    Number.isFinite(requiredCount) && requiredCount > 0
      ? requiredCount
      : Array.isArray(submission.required_assets)
      ? submission.required_assets.length
      : 1,
  );
  const progressPct = Math.round((doneCount / totalAssets) * 100);

  // Escrow when funded, else the brief's budget or the bid (not "Rs. 0" for an unfunded deal).
  const budget = dealAmount(deal) || campaign.budget;

  const timeline = useMemo(() => {
    const feed: any[] = Array.isArray(deal.activity_feed)
      ? [...deal.activity_feed]
      : [];
    feed.sort(
      (a, b) =>
        (parseDate(a.timestamp)?.getTime() || 0) -
        (parseDate(b.timestamp)?.getTime() || 0),
    );
    return feed;
  }, [deal.activity_feed]);

  const deductions: any[] = Array.isArray(escrow.deductions)
    ? escrow.deductions
    : [];

  const campaignId = String(campaign.id || deal.campaign_id || '');

  // Raw → edited flow (brief wants an edited cut): the raw video goes first;
  // once the brand approves it the creator uploads the edited video (creator
  // edits) or UGC.ad's editors take over (nothing more to upload).
  const editFlow = deal.edit_flow || null;
  const stage: 'raw' | 'edited' | null =
    editFlow?.stage === 'raw' || editFlow?.stage === 'edited' ? editFlow.stage : null;
  const stageLabel =
    stage === 'raw' ? 'raw video' : stage === 'edited' ? 'edited video' : 'work';
  const stageDue = stage === 'raw' ? editFlow?.raw_due : stage === 'edited' ? editFlow?.edited_due : null;

  /** Pick one file and push it through the generic uploader. Null when the picker
   *  was dismissed, which is a cancel and not an error. */
  const pickAndUpload = async (): Promise<string | null> => {
    const picked = await launchImageLibrary({
      mediaType: 'mixed',
      selectionLimit: 1,
    });
    const asset = picked.assets?.[0];
    if (!asset?.uri) {
      return null;
    }
    // Only now is there something to upload, so this is where the busy state starts.
    setSubmitting(true);
    setUploadPercent(0);
    const url = await uploadMedia(
      token as string,
      { uri: asset.uri, fileName: asset.fileName, type: asset.type, fileSize: asset.fileSize },
      'file',
      setUploadPercent,
    );
    if (!url) {
      throw new Error('The upload did not return a file URL.');
    }
    return url;
  };

  /** pickAndUpload for the Alert buttons: a failed upload must clear the busy
   *  state and say so, not leave the progress bar stuck behind an unhandled rejection. */
  const pickSafely = async (): Promise<string | null> => {
    try {
      return await pickAndUpload();
    } catch (error) {
      setSubmitting(false);
      setUploadPercent(null);
      Alert.alert(
        'Upload failed',
        (error as any)?.name === 'NetworkError'
          ? "You're offline. Check your connection and try again."
          : error instanceof Error && error.message
          ? error.message
          : 'Please try again.',
      );
      return null;
    }
  };

  /**
   * Opens the submit-work sheet (several files, description, raw/edited zones;
   * WorkSubmitSheet.tsx). A parent-supplied onSubmitWork still wins so a
   * dedicated screen can replace it without touching the buttons.
   */
  const handleSubmitWork = () => {
    if (onSubmitWork) {
      onSubmitWork();
      return;
    }
    if (!token || !campaignId) {
      return;
    }
    setWorkOpen(true);
  };

  // The submit button only renders when tapping it can actually do something.
  const canSubmitWork = !!onSubmitWork || (!!token && !!campaignId);

  // Why the upload button is hidden, in the creator's words — so the
  // Deliverables tab explains the next step instead of showing a dead blank.
  // can_submit_content only turns true at "Received — Content in Progress" or
  // "Revision Requested", so everything before that is a wait on shipment.
  const submitBlockedReason = (() => {
    const s = state.toLowerCase();
    if (s.includes('awaiting shipment') || s.includes('accepted'))
      return 'Waiting for the brand to ship the product. Once it arrives and you confirm receipt, you can upload your work here.';
    if (s.includes('transit') || s.includes('shipped'))
      return 'Your product is on the way. Confirm receipt when it arrives to unlock the upload.';
    if (s.includes('delivered'))
      return 'Your product was delivered. Confirm you received it to start uploading your work.';
    return 'You can upload your work once the deal reaches the content stage.';
  })();

  // ── Deal actions ─────────────────────────────────────────────────────────
  // Everything below moves the deal forward and used to live only on the
  // website's deal room. Each wraps one endpoint, reports the backend's own
  // refusal message, and asks the parent to refetch so the rail and the
  // buttons reflect the new state.

  const dealId = String(deal.deal_id || campaignId || '');

  /** Runs one action with a spinner, an error alert and a refresh. True when it worked. */
  const runAction = async (
    key: string,
    work: () => Promise<unknown>,
    done?: string,
  ): Promise<boolean> => {
    if (!token || !dealId || busyAction) return false;
    setBusyAction(key);
    try {
      await work();
      if (done) Alert.alert('Done', done);
      await refreshDeal();
      onChanged?.();
      return true;
    } catch (error) {
      Alert.alert(
        'Could not complete',
        error instanceof Error && error.message
          ? error.message
          : 'Please try again.',
      );
      return false;
    } finally {
      setBusyAction('');
      // pickAndUpload() raises `submitting` when it starts an upload and only
      // this clears it. Actions that upload first (damage report, evidence)
      // would otherwise leave it set for the rest of the screen's life.
      setSubmitting(false);
    }
  };

  /** Collects one line of text. Alert.prompt is iOS-only, so this is a sheet. */
  const askForText = (
    title: string,
    message: string,
    onSubmit: (value: string) => void,
  ) => {
    setPrompt({ title, message, onSubmit });
  };

  /** Refetch the deal and tell the parent, after a sheet changed something. */
  const refreshAll = async () => {
    await refreshDeal();
    onChanged?.();
  };

  const openChat = (prefill = '') => {
    setChatPrefill(prefill);
    setChatOpen(true);
  };

  // Mark received opens DeliveryReceipt.tsx: unboxing video (required) plus
  // the "damaged or wrong items" report, then POST /deals/{id}/receipt.
  const handleConfirmReceipt = () => setReceiptOpen(true);

  const handleReportDamage = () =>
    Alert.alert(
      'Report a problem',
      'Tell the brand the product arrived damaged or wrong. Add a photo as evidence.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add photo',
          onPress: async () => {
            const url = await pickSafely();
            if (!url) return;
            runAction(
              'damage',
              () => reportDealDamage(token!, dealId, [url]),
              'Reported. Our team and the brand have been notified.',
            );
          },
        },
        {
          text: 'Report without photo',
          onPress: () =>
            runAction(
              'damage',
              () => reportDealDamage(token!, dealId, []),
              'Reported. Our team and the brand have been notified.',
            ),
        },
      ],
    );

  // Open damage report: more proof can be added (the site's "Add Evidence").
  const handleAddEvidence = () =>
    Alert.alert('Add evidence', 'Add a photo or video of the problem.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Choose file',
        onPress: async () => {
          const url = await pickSafely();
          if (!url) return;
          runAction(
            'evidence',
            () => addDealEvidence(token!, dealId, [url]),
            'Evidence added.',
          );
        },
      },
    ]);

  // Revision answers (the site's RevisionTracker). Accepting is all-or-nothing:
  // it agrees to the whole list; partial disagreement goes through chat or
  // "beyond the brief".
  const changeItems = useMemo(() => toChangeItems(revisions), [revisions]);

  const acceptRevision = () =>
    runAction(
      'revision',
      () => respondToRevision(token!, dealId, 'accepted', changeItems),
      'Revision response submitted. Submit the updated cut under Deliverables.',
    );

  const flagRevision = () =>
    Alert.alert(
      'These changes go beyond the brief?',
      'The brand is told. Talk it through in the deal chat. If you cannot agree you can escalate to admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, flag it',
          style: 'destructive',
          onPress: () =>
            runAction(
              'revision',
              () => respondToRevision(token!, dealId, 'flagged'),
              'Flagged. Work it out with the brand in the deal chat.',
            ),
        },
      ],
    );

  // Talk first: opens the deal chat with a ready-to-send scope question.
  const discussRevision = () =>
    openChat(
      'Hi! Before I start on these revisions, could we confirm exactly how many changes are included in this request so we are on the same page?',
    );

  // Creators cannot raise a dispute (POST /deals/{id}/dispute answers 403).
  // The only path is to escalate, and only after flagging a revision or
  // reporting a damaged product (POST /deals/{id}/escalate answers 400 else).
  const handleEscalate = () =>
    askForText(
      'Escalate to admin',
      'Tell the review team what you could not resolve with the brand.',
      value =>
        runAction(
          'escalate',
          () => escalateDeal(token!, dealId, value),
          'Escalated to admin. The review team will be in touch.',
        ),
    );

  const handleArchive = () =>
    Alert.alert(
      'Archive this deal',
      'It disappears from your active list. Nothing about the payment changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            // Only leave the screen when the server really archived it;
            // otherwise the 10 s refresh would bring the deal straight back.
            const ok = await runAction('archive', () => archiveDeal(token!, dealId));
            if (ok) onArchived?.();
          },
        },
      ],
    );

  // Which actions apply right now. The payload already carries the flags the
  // backend knows about (can_mark_received, can_report_damage, ...); a button
  // never appears for something the API would refuse.
  const shipment = (deal.shipment || {}) as Record<string, any>;
  const canConfirmReceipt = canMarkReceived(deal);
  const damageAllowed = canReportDamage(deal);
  const revisionPending = needsRevision(deal) && !revisions.creator_response;
  const hasDispute = isDisputeOpen(deal);
  const showEscalate = canEscalate(deal);
  const isPaid = isState(deal, 'Paid - Complete');
  const primary = primaryAction(deal);

  // Rate the brand once the deal is paid (POST /reviews). Asked once per deal
  // per session; stays silent if the reviews lookup fails.
  const businessId = String(campaign.business_id || brand.id || '');
  const [rated, setRated] = useState<'unknown' | 'todo' | 'done'>(
    RATE_STATE.get(campaignId) || 'unknown',
  );
  useEffect(() => {
    if (!isPaid || !token || !campaignId || !businessId || RATE_STATE.has(campaignId)) return;
    getBusinessReviews(token, businessId)
      .then(list => {
        const done = list.some(
          review => review.campaign_id === campaignId && review.reviewer_id === creator.id,
        );
        RATE_STATE.set(campaignId, done ? 'done' : 'todo');
        if (!mounted.current) return;
        setRated(done ? 'done' : 'todo');
        if (!done) setRateOpen(true);
      })
      .catch(() => {});
  }, [isPaid, token, campaignId, businessId, creator.id]);

  const loadFullBrief = async () => {
    if (!token || !campaignId) return;
    setBriefLoading(true);
    setBriefError('');
    try {
      setFullBrief((await getCampaign(token, campaignId)) as Record<string, any>);
    } catch (error) {
      setBriefError(
        error instanceof Error && error.message
          ? error.message
          : 'Could not load the full brief.',
      );
    } finally {
      setBriefLoading(false);
    }
  };

  const toggleFullBrief = () => {
    const next = !briefOpen;
    setBriefOpen(next);
    if (next && !fullBrief) loadFullBrief();
  };

  /** The one "what do I do next" button (MyDealsPage getPrimaryActionConfig). */
  const onPrimary = () => {
    if (primary.disabled) return;
    switch (primary.type) {
      case 'receipt':
        handleConfirmReceipt();
        break;
      case 'content':
        handleSubmitWork();
        break;
      case 'add_evidence':
        handleAddEvidence();
        break;
      case 'archive':
        handleArchive();
        break;
      case 'ship_address':
        // The address card lives on Overview: go there, open the form, scroll to it.
        setTab('Overview');
        setAddressSignal(n => n + 1);
        setTimeout(() => scrollRef.current?.scrollTo({ y: addressY.current, animated: true }), 120);
        break;
      case 'track_shipment':
        if (shipment.courier_tracking_url) {
          Linking.openURL(String(shipment.courier_tracking_url)).catch(() => {});
        }
        break;
      default:
        break;
    }
  };

  /** Revision card: the brand's checklist plus how the creator answers it. */
  const renderRevision = (withUpload = true) => {
    if (!needsRevision(deal)) return null;
    const response = revisions.creator_response as string | undefined;
    const pushedBack = response === 'scope_creep' || response === 'partial_dispute';
    const accepted = new Set(
      (Array.isArray(revisions.accepted_changes) ? revisions.accepted_changes : []).map(
        (item: unknown) => String(item).toLowerCase(),
      ),
    );
    return (
      <View style={styles.card} testID="revision-panel">
        <Text style={styles.sectionTitle}>Revision requested</Text>
        <Text style={styles.bodyText}>
          {revisions.revision_limit != null
            ? `Revision ${revisions.revision_count_used || 0} of ${revisions.revision_limit} used`
            : `Revisions used: ${revisions.revision_count_used || 0}`}
          {revisions.new_deadline_at ? ` · New deadline ${longDate(revisions.new_deadline_at)}` : ''}
        </Text>
        <Text style={styles.groupTitle}>
          {`Requested changes${changeItems.length ? ` · ${changeItems.length}` : ''}`}
        </Text>
        {changeItems.length ? (
          changeItems.map((line, index) => {
            const change = parseChange(line);
            return (
              <View key={`${line}-${index}`} style={styles.changeRow}>
                <Text style={styles.changeTick}>
                  {response && accepted.has(line.toLowerCase()) ? '✓' : '•'}
                </Text>
                <Text style={styles.changeText}>
                  {!!change.timestamp && <Text style={styles.changeChip}>{`${change.timestamp} `}</Text>}
                  {!!change.severity && (
                    <Text style={[styles.changeChip, change.severity === 'must-fix' && styles.changeMust]}>
                      {change.severity === 'must-fix' ? 'Must-fix ' : 'Preference '}
                    </Text>
                  )}
                  {change.text}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.bodyText}>
            The brand has asked for changes. Message them if you are unsure what to change.
          </Text>
        )}

        {response ? (
          <>
            <Text style={[styles.bodyText, styles.mt12]}>
              {REVISION_RESPONSE_LABEL[response] || `Response recorded: ${response}`}
            </Text>
            {pushedBack && !!token && (
              <View style={styles.revisionButtons}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => openChat()} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Chat with brand</Text>
                </TouchableOpacity>
                {showEscalate && (
                  <TouchableOpacity
                    style={styles.ghostBtn}
                    onPress={handleEscalate}
                    disabled={busyAction === 'escalate'}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ghostBtnText, styles.actionWarn]}>Escalate to admin</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : (
          !!token && (
            <View style={styles.revisionButtons}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={acceptRevision}
                disabled={!revisionPending || busyAction === 'revision'}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Accept &amp; revise</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={discussRevision} accessibilityRole="button">
                <Text style={styles.ghostBtnText}>Chat with brand about changes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={flagRevision}
                disabled={busyAction === 'revision'}
                accessibilityRole="button"
              >
                <Text style={[styles.ghostBtnText, styles.actionWarn]}>These changes go beyond the brief</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {withUpload && deal.can_submit_content && canSubmitWork && (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.mt12]}
            onPress={handleSubmitWork}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Upload revised video</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderVersionCards = () => (versions.map((version, index) => (
                <View key={`${version.stage || ''}${version.version ?? index}`} style={styles.card}>
                  <View style={styles.deliverHead}>
                    <View style={styles.deliverNum}>
                      <Text style={styles.deliverNumText}>
                        {version.version ?? index + 1}
                      </Text>
                    </View>
                    <Text style={styles.deliverTitle}>
                      {version.stage === 'raw'
                        ? 'Raw video'
                        : version.stage === 'edited'
                        ? 'Edited video'
                        : String(version.title || version.asset_type || 'Final Video')}
                    </Text>
                    <View
                      style={[
                        styles.badgePill,
                        String(version.status).toLowerCase() === 'approved'
                          ? styles.badgeDone
                          : styles.badgePending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgePillText,
                          String(version.status).toLowerCase() === 'approved'
                            ? styles.badgeDoneText
                            : styles.badgePendingText,
                        ]}
                      >
                        {version.status || 'submitted'}
                      </Text>
                    </View>
                  </View>

                  {(() => {
                    // Prefer a real thumbnail; otherwise a poster frame of the
                    // submitted video so the card isn't blank.
                    const poster =
                      mediaUrl(version.thumbnail_url) ||
                      posterFrom(mediaUrl(version.video_url));
                    return poster ? (
                      <View style={styles.thumbWrap}>
                        <Image
                          source={{ uri: poster }}
                          style={styles.thumb}
                          resizeMode="cover"
                        />
                        {/* Until the brand approves, the website shows the creator's own
                            upload under a UGC watermark; same cue here. */}
                        {String(version.status).toLowerCase() !== 'approved' && (
                          <View style={styles.watermark} pointerEvents="none">
                            <Text style={styles.watermarkText}>UGC.ad{'\n'}preview</Text>
                          </View>
                        )}
                        <View style={styles.thumbPlay}>
                          <Glyph name="play" color="#FFFFFF" />
                        </View>
                      </View>
                    ) : null;
                  })()}

                  {!!version.submitted_at && (
                    <>
                      <Text style={styles.uploadLabel}>Uploaded on</Text>
                      <Text style={styles.uploadDate}>
                        {longDate(version.submitted_at)}
                      </Text>
                    </>
                  )}

                  <View style={styles.deliverActions}>
                    <TouchableOpacity
                      style={[styles.ghostBtn, styles.flex]}
                      disabled={!version.video_url}
                      onPress={() => {
                        const url = mediaUrl(version.video_url);
                        if (url) setPreviewUri(url);
                      }}
                      accessibilityRole="button"
                    >
                      <Glyph name="play" color="#3D4FD8" />
                      <Text style={styles.ghostBtnText}>Preview</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.softBtn, styles.flex]}
                      disabled={!version.raw_footage_url && !version.video_url}
                      onPress={() => {
                        const url = mediaUrl(
                          version.raw_footage_url || version.video_url,
                        );
                        if (url) Linking.openURL(url).catch(() => {});
                      }}
                      accessibilityRole="button"
                    >
                      <Glyph name="download" color="#3D4FD8" />
                      <Text style={styles.ghostBtnText}>Download</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )));

  return (
    <View style={styles.screen}>
      {/* --- dark header --- */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M14.5 5.5 8 12l6.5 6.5"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>

        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Deal Details</Text>
          {!!reference && <Text style={styles.headerRef}>{reference}</Text>}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onChat}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"
                stroke="#FFFFFF"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            </Svg>
            {unread > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Same keyboard handling as AuthLayout: Android pads by the measured
          overlap (RN 0.87 is edge-to-edge, so adjustResize no longer shrinks
          the window); iOS insets the scroll content instead. Without it the
          counter-price and delivery-address fields sit under the keyboard. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        enabled={Platform.OS === 'android'}
      >
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          refreshDeal();
        }} />}
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* --- summary card --- */}
        <View style={styles.card}>
          <View style={styles.summaryTop}>
            <View style={styles.brandLogo}>
              {mediaUrl(brand.logo_url) ? (
                <Image
                  source={{ uri: mediaUrl(brand.logo_url)! }}
                  style={styles.brandLogoImage}
                />
              ) : (
                <Text style={styles.brandLogoText}>
                  {String(brand.name || 'B')
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              )}
            </View>

            <View style={styles.summaryCopy}>
              <Text style={styles.brandName} numberOfLines={2}>{brand.name || 'Brand'}</Text>
              <Text style={styles.dealRef}>{reference}</Text>
              <View style={styles.statePill}>
                <Text style={styles.stateText} numberOfLines={1}>
                  {'•'} {state || 'In progress'}
                </Text>
              </View>
              <View style={styles.tagRow}>
                {[campaign.category, campaign.content_type]
                  .filter(Boolean)
                  .map((tag: string) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.factRow}>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Brand</Text>
              <Text style={styles.factValue} numberOfLines={1}>
                {brand.name || '-'}
              </Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Creator</Text>
              <Text style={styles.factValue} numberOfLines={1}>
                {creator.name || '-'}
              </Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Budget</Text>
              <Text style={styles.factValue}>{money(budget)}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Deadline</Text>
              <Text style={styles.factValue}>{shortDate(deal.deadline)}</Text>
            </View>
          </View>
        </View>

        {/* --- progress rail --- */}
        <View style={styles.card}>
          <ScrollView
            ref={railRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railScroll}
          >
            {steps.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <View key={label} style={styles.railStep}>
                  <View style={styles.railLineRow}>
                    {index > 0 && (
                      <View
                        style={[
                          styles.railLine,
                          index <= step && styles.railLineDone,
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.railDot,
                        done && styles.railDotDone,
                        active && styles.railDotActive,
                      ]}
                    >
                      {done ? (
                        <Svg width={13} height={13} viewBox="0 0 24 24">
                          <Path
                            d="m6 12 4 4 8-8"
                            stroke="#FFFFFF"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </Svg>
                      ) : (
                        <Text
                          style={[
                            styles.railNum,
                            active && styles.railNumActive,
                          ]}
                        >
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    {index < steps.length - 1 && (
                      <View
                        style={[
                          styles.railLine,
                          index < step && styles.railLineDone,
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.railLabel,
                      (done || active) && styles.railLabelOn,
                    ]}
                  >
                    {label}
                  </Text>
                  <Text style={styles.railHint}>{hints[index]}</Text>
                </View>
              );
            })}
          </ScrollView>
      <VideoPreview uri={previewUri} onClose={() => setPreviewUri(null)} />
        </View>

        {/* A direct booking is not real work until the creator answers it. */}
        {!!token && <DealBooking deal={deal} token={token} onDone={refreshAll} />}

        {/* The one thing to do next (the site's primary action button). */}
        {!!token && primary.type !== 'passive' && !primary.disabled && (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.nextBtn]}
            onPress={onPrimary}
            disabled={!!busyAction}
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            testID="next-action"
          >
            <Text style={styles.primaryBtnText}>{primary.label}</Text>
          </TouchableOpacity>
        )}
        {!!token && primary.disabled && (primary.type === 'ship_address_done' || primary.type === 'track_shipment') && (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              {primary.type === 'track_shipment'
                ? `${primary.label}. The brand has not added a tracking link yet.`
                : primary.label}
            </Text>
          </View>
        )}

        {/* --- tabs --- */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map(name => {
            const active = tab === name;
            return (
              <TouchableOpacity
                key={name}
                onPress={() => setTab(name)}
                style={styles.tabBtn}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextOn]}>
                  {name}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ---------------- OVERVIEW ---------------- */}
        {tab === 'Overview' && ships && !!token && !!campaignId && (
          <View onLayout={event => { addressY.current = event.nativeEvent.layout.y; }}>
            <DeliveryAddress
              token={token}
              campaignId={campaignId}
              openSignal={addressSignal}
              onSaved={refreshAll}
            />
            <View style={[styles.card, styles.shipCard]}>
              <Text style={styles.sectionTitle}>Shipment Tracking</Text>
              <KeyValue label="Courier Partner" value={String(shipment.courier_name || shipment.courier_partner || 'Not assigned')} />
              <KeyValue label="Tracking ID" value={String(shipment.tracking_id || 'Pending')} />
              <KeyValue label="Status" value={String(shipment.courier_status || 'Pending')} />
              <KeyValue
                label="Expected Delivery"
                value={
                  shipment.expected_delivery_at
                    ? shortDate(shipment.expected_delivery_at)
                    : deal.receipt?.received_at
                    ? 'Delivered'
                    : 'Awaiting courier update'
                }
              />
              {!!deal.receipt?.received_at && (
                <KeyValue label="Date Received" value={shortDate(deal.receipt.received_at)} />
              )}
              {!!shipment.courier_tracking_url && (
                <TouchableOpacity
                  style={[styles.ghostBtn, styles.mt12]}
                  onPress={() => Linking.openURL(String(shipment.courier_tracking_url)).catch(() => {})}
                  accessibilityRole="link"
                >
                  <Text style={styles.ghostBtnText}>Track Package</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {tab === 'Overview' && (
          <View style={styles.card}>
            <Accordion
              icon="doc"
              title="Campaign Brief"
              subtitle="View campaign basics, requirements and creative guidelines"
            >
              <Text style={styles.bodyText}>
                Open the Brief tab for the full campaign details.
              </Text>
            </Accordion>

            <Accordion
              icon="box"
              title="Deliverables"
              subtitle={`${doneCount} of ${totalAssets} completed`}
              badge={doneCount >= totalAssets ? 'Completed' : 'Pending'}
              badgeTone={doneCount >= totalAssets ? 'done' : 'pending'}
            >
              <Text style={styles.bodyText}>
                Open the Deliverables tab to review or submit files.
              </Text>
            </Accordion>

            <Accordion
              icon="upload"
              title="Content Submission"
              subtitle="Watermarked preview until brand approval"
            >
              <Text style={styles.bodyText}>
                {latest
                  ? `Latest version ${latest.version} submitted ${longDate(
                      latest.submitted_at,
                    )}.`
                  : 'No content submitted yet.'}
              </Text>
            </Accordion>

            <Accordion
              icon="revision"
              title="Revision Tracker"
              // Only a backend-provided limit is shown; inventing one would
              // promise the creator free revisions the deal may not carry.
              subtitle={
                revisions.revision_limit != null
                  ? `Revision ${revisions.revision_count_used || 0} of ${
                      revisions.revision_limit
                    } used`
                  : `Revisions used: ${revisions.revision_count_used || 0}`
              }
            >
              {revisions.latest_feedback ? (
                <Text style={styles.bodyText}>{revisions.latest_feedback}</Text>
              ) : (
                <Text style={styles.bodyText}>No revisions requested.</Text>
              )}
            </Accordion>

            {renderRevision()}
            {versions.length > 0 && renderVersionCards()}
            <Accordion
              icon="pulse"
              title="Activity Timeline"
              subtitle="Track all updates and activities in this deal"
            >
              <Text style={styles.bodyText}>
                Open the Timeline tab for the full history.
              </Text>
            </Accordion>

            <Accordion
              icon="wallet"
              title="Payment / Escrow"
              subtitle={`Escrow secured • ${money(escrow.held_amount)}`}
            >
              <Text style={styles.bodyText}>
                Open the Payments tab for the full breakdown.
              </Text>
            </Accordion>

            {/* Everything the deal can do from here. Each row only appears
                when the backend would actually accept it. Creators have no
                "Raise a dispute" row: POST /deals/{id}/dispute answers 403
                for them, so the path is flag -> chat -> escalate. */}
            {!!token && !!dealId && (
              <>
                {hasDispute && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      A dispute is open on this deal. The review team is handling it and will contact you. Watch your notifications for updates.
                    </Text>
                  </View>
                )}
                {canConfirmReceipt && (
                  <ActionRow
                    label="Mark received"
                    caption="Upload your unboxing video. Report damage here too"
                    busy={busyAction === 'receipt'}
                    onPress={handleConfirmReceipt}
                  />
                )}
                {damageAllowed && (
                  <ActionRow
                    label="Report damaged or wrong product"
                    caption="Sends photo evidence to the brand and our team"
                    tone="warn"
                    busy={busyAction === 'damage'}
                    onPress={handleReportDamage}
                  />
                )}
                {showEscalate && (
                  <ActionRow
                    label="Escalate to admin"
                    caption="Raise it with the brand first. Escalate if you cannot resolve it together"
                    tone="warn"
                    busy={busyAction === 'escalate'}
                    onPress={handleEscalate}
                  />
                )}
                <ActionRow
                  label="Open deal chat"
                  caption={
                    Number(deal.unread_count) > 0
                      ? `${deal.unread_count} unread from the brand`
                      : 'Message the brand about this deal'
                  }
                  onPress={() => openChat()}
                />
                {isPaid && rated !== 'done' && (
                  <ActionRow
                    label="Rate the brand"
                    caption="Tell other creators how the collaboration went"
                    onPress={() => setRateOpen(true)}
                  />
                )}
                {isPaid && (
                  <ActionRow
                    label="Archive this deal"
                    caption="Hide it from your active list"
                    busy={busyAction === 'archive'}
                    onPress={handleArchive}
                  />
                )}
              </>
            )}
            <ActionRow
              label="Get help"
              caption="Email, call or WhatsApp our team"
              onPress={() => setHelpOpen(true)}
            />
          </View>
        )}

        {/* ---------------- BRIEF ---------------- */}
        {tab === 'Brief' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Campaign Brief</Text>

            <Text style={styles.groupTitle}>Campaign Basics</Text>
            <KeyValue label="Campaign" value={campaign.title || '-'} />
            <KeyValue label="Brand" value={brand.name || '-'} />
            <KeyValue label="Category" value={campaign.category || '-'} />
            <KeyValue label="Product" value={campaign.product_name || '-'} />
            <KeyValue
              label="Product Description"
              value={campaign.product_description || '-'}
            />
            <KeyValue label="Campaign Hook" value={campaign.hook || '-'} />
            <KeyValue label="Key Message" value={campaign.key_message || '-'} />
            <KeyValue label="Video Language" value={campaign.language || '-'} />
            <KeyValue
              label="Objectives"
              value={
                Array.isArray(campaign.objectives)
                  ? campaign.objectives.join(', ')
                  : campaign.objectives || '-'
              }
            />
            <KeyValue
              label="Target Audience"
              value={campaign.target_audience || '-'}
            />

            {Array.isArray(deal.brief_sections) &&
              deal.brief_sections.map((section: any) => (
                <View key={section.title} style={styles.briefSection}>
                  <Text style={styles.groupTitle}>{section.title}</Text>
                  <Text style={styles.bodyText}>{section.content}</Text>
                </View>
              ))}

            {!!campaignId && !!token && (
              <TouchableOpacity
                style={[styles.ghostBtn, styles.mt12]}
                onPress={toggleFullBrief}
                accessibilityRole="button"
                accessibilityState={{ expanded: briefOpen }}
              >
                <Text style={styles.ghostBtnText}>{briefOpen ? 'Show less' : 'View full brief'}</Text>
              </TouchableOpacity>
            )}
            {briefOpen && briefLoading && <ActivityIndicator style={styles.mt12} color="#3D4FD8" />}
            {briefOpen && !!briefError && (
              <View style={styles.mt12}>
                <Text style={styles.errorText}>{briefError}</Text>
                <TouchableOpacity
                  style={[styles.ghostBtn, styles.mt12]}
                  onPress={loadFullBrief}
                  accessibilityRole="button"
                >
                  <Text style={styles.ghostBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {briefOpen && !!fullBrief && (
              fullBriefRows(fullBrief).length ? (
                fullBriefRows(fullBrief).map(row => (
                  <View key={row.label} style={styles.briefSection}>
                    <Text style={styles.groupTitle}>{row.label}</Text>
                    <Text style={styles.bodyText}>{row.value}</Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.bodyText, styles.mt12]}>No additional brief details available.</Text>
              )
            )}
          </View>
        )}

        {/* ---------------- DELIVERABLES ---------------- */}
        {tab === 'Deliverables' && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Deliverables</Text>
              <Text style={styles.progressLabel}>Overall Progress</Text>
              <Text style={styles.progressCount}>
                {doneCount} of {totalAssets} completed
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progressPct}%` }]}
                />
              </View>
              <Text style={styles.progressPct}>{progressPct}%</Text>
            </View>

            {versions.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.bodyText}>
                  {deal.can_submit_content
                    ? 'Nothing submitted yet. Use the button below to upload your work.'
                    : submitBlockedReason}
                </Text>
                {/* Whenever the creator can confirm receipt (the product has
                    shipped / has tracking), offer it here with the unboxing
                    upload — that's what unblocks the work upload. */}
                {!deal.can_submit_content && canConfirmReceipt && (
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.mt12]}
                      onPress={handleConfirmReceipt}
                      accessibilityRole="button"
                    >
                      <Glyph name="tick" color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>
                        Upload unboxing &amp; mark received
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>
            ) : (
              renderVersionCards()
            )}

            {deal.current_state === 'Raw Approved - UGC.ad Editing' && (
              <View style={styles.card}>
                <Text style={styles.bodyText}>
                  Your raw video was approved. UGC.ad's team is editing it - nothing more to upload.
                </Text>
              </View>
            )}

            {renderRevision(false)}
            {deal.can_submit_content && canSubmitWork && !!stageDue && (
              <Text style={styles.bodyText}>
                {stage === 'raw' ? 'Raw video' : 'Edited video'} due by {longDate(stageDue)}
              </Text>
            )}
            {deal.can_submit_content && canSubmitWork && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSubmitWork}
                disabled={submitting}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Glyph name="upload" color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>
                      {state.toLowerCase().includes('revision') ? 'Upload revised video' : stage ? `Upload ${stageLabel}` : 'Upload / Submit Work'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {deal.can_submit_content && canSubmitWork && (
              <UploadProgressBar percent={submitting ? uploadPercent : null} />
            )}
          </>
        )}

        {/* ---------------- TIMELINE ---------------- */}
        {tab === 'Timeline' && (
          <View style={styles.card}>
            {timeline.length === 0 ? (
              <Text style={styles.bodyText}>No activity recorded yet.</Text>
            ) : (
              timeline.map((event, index) => (
                <View key={event.id || index} style={styles.tlRow}>
                  <View style={styles.tlRail}>
                    <View style={styles.tlDot} />
                    {index < timeline.length - 1 && (
                      <View style={styles.tlLine} />
                    )}
                  </View>
                  <View style={styles.tlCopy}>
                    <Text style={styles.tlTitle}>
                      {String(event.event_type || 'update').replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.tlBody}>{event.message}</Text>
                    <Text style={styles.tlDate}>
                      {longDate(event.timestamp)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------------- PAYMENTS ---------------- */}
        {tab === 'Payments' && (
          <>
            <View style={styles.card}>
              <View style={styles.escrowHead}>
                <Text style={styles.sectionTitle}>Escrow Status</Text>
                <View style={styles.securedPill}>
                  <Glyph name="shield" color="#16A34A" />
                  <Text style={styles.securedText}>
                    {escrow.status === 'released' ? 'Released' : 'Secured'}
                  </Text>
                </View>
              </View>

              <Text style={styles.escrowAmount}>
                {money(escrow.held_amount)}
              </Text>
              <Text style={styles.escrowHint}>
                Funds are held securely in escrow
              </Text>

              <View style={styles.escrowTrack}>
                <View
                  style={[
                    styles.escrowFill,
                    escrow.status === 'released' && styles.escrowFillFull,
                  ]}
                />
              </View>
              <View style={styles.escrowLabels}>
                <Text style={styles.escrowStep}>Funded</Text>
                <Text style={styles.escrowStep}>In Escrow</Text>
                <Text style={styles.escrowStep}>Release</Text>
              </View>

              <View style={styles.divider} />

              <KeyValue label="Escrow Held" value={money(escrow.held_amount)} />
              {deductions.map((item, index) => (
                <KeyValue
                  key={item.label || index}
                  label={item.label}
                  value={`- ${money(item.amount)}`}
                />
              ))}
              <KeyValue label="Net Payable" value={money(escrow.net_payable)} />
              <KeyValue
                label="Estimated Payout"
                value={
                  escrow.estimated_payout_at
                    ? shortDate(escrow.estimated_payout_at)
                    : 'Not scheduled'
                }
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Transaction History</Text>
              {escrow.held_amount ? (
                <View style={styles.txRow}>
                  <View style={styles.txIcon}>
                    <Glyph name="download" color="#16A34A" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.txTitle}>Escrow Funded</Text>
                    <Text style={styles.txDate}>
                      {longDate(
                        campaign.work_started_at || campaign.created_at,
                      )}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.txAmount}>
                      {money(escrow.held_amount)}
                    </Text>
                    <View style={[styles.badgePill, styles.badgeDone]}>
                      <Text
                        style={[styles.badgePillText, styles.badgeDoneText]}
                      >
                        Success
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.bodyText}>No transactions yet.</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.helpCard}
              onPress={() => setHelpOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={styles.txIcon}>
                <Glyph name="headset" color="#3D4FD8" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.txTitle}>Need Help?</Text>
                <Text style={styles.txDate}>Email, call or WhatsApp our team</Text>
              </View>
              <Glyph name="chevron" color="#8A8FA8" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Text prompt for the actions that need a sentence. Android has no
          Alert.prompt, so without this the dispute and escalation buttons
          would open a dialog with nowhere to type. */}
      <Modal
        visible={!!prompt}
        transparent
        animationType="fade"
        onRequestClose={() => setPrompt(null)}
      >
        <KeyboardAvoidingView style={styles.promptBackdrop} behavior="padding">
          <View style={styles.promptSheet}>
            <Text style={styles.promptTitle}>{prompt?.title}</Text>
            <Text style={styles.promptMessage}>{prompt?.message}</Text>
            <TextInput
              style={styles.promptInput}
              value={promptText}
              onChangeText={setPromptText}
              placeholder="Type here…"
              placeholderTextColor="#A9ADC2"
              multiline
              autoFocus
            />
            <View style={styles.promptActions}>
              <TouchableOpacity
                style={[styles.ghostBtn, styles.flex]}
                onPress={() => {
                  setPrompt(null);
                  setPromptText('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.promptSend,
                  !promptText.trim() && styles.promptSendOff,
                ]}
                disabled={!promptText.trim()}
                onPress={() => {
                  const value = promptText.trim();
                  const submit = prompt?.onSubmit;
                  setPrompt(null);
                  setPromptText('');
                  submit?.(value);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {!!token && (
        <>
          <WorkSubmitSheet
            visible={workOpen}
            token={token}
            deal={deal}
            onClose={() => setWorkOpen(false)}
            onSubmitted={refreshAll}
          />
          <DeliveryReceipt
            visible={receiptOpen}
            token={token}
            dealId={dealId}
            canMark={canConfirmReceipt}
            onClose={() => setReceiptOpen(false)}
            onDone={refreshAll}
          />
          <DealChat
            visible={chatOpen}
            token={token}
            dealId={dealId}
            title={`${brand.name || 'Brand'} \u00B7 ${campaign.title || 'Deal chat'}`}
            messages={Array.isArray(deal.chat_summary?.messages) ? deal.chat_summary.messages : []}
            prefill={chatPrefill}
            onClose={() => { setChatOpen(false); setChatPrefill(''); }}
            onSent={refreshDeal}
          />
          <RateBrandSheet
            visible={rateOpen}
            token={token}
            campaignId={campaignId}
            businessId={businessId}
            brandName={String(brand.name || '')}
            onClose={() => setRateOpen(false)}
            onDone={() => { RATE_STATE.set(campaignId, 'done'); setRated('done'); }}
          />
        </>
      )}
      <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(10),
    paddingTop: scale(6),
    paddingBottom: scale(14),
  },
  headerBtn: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  headerRef: { color: '#A7ADE0', fontSize: fontScale(12), marginTop: scale(2) },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBadge: {
    position: 'absolute',
    top: scale(2),
    right: scale(2),
    minWidth: scale(17),
    height: scale(17),
    borderRadius: scale(9),
    paddingHorizontal: scale(4),
    backgroundColor: '#E23B3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },

  body: {
    flex: 1,
    backgroundColor: '#F5F6FB',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
  },
  // Tablet: a centred, readable column (no-op on phones).
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(12),
    paddingBottom: scale(30) + NAV_CLEARANCE,
  },

  card: {
    marginBottom: scale(12),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
  },

  summaryTop: { flexDirection: 'row' },
  brandLogo: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(12),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoImage: { width: '100%', height: '100%' },
  brandLogoText: {
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#5B5CF6',
  },
  summaryCopy: { flex: 1, minWidth: 0, marginLeft: scale(11) },
  brandName: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  dealRef: { marginTop: scale(1), fontSize: fontScale(11), color: '#8B8FA6' },
  statePill: {
    marginTop: scale(6),
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    backgroundColor: '#EEF0FE',
  },
  stateText: {
    fontSize: fontScale(11),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  tagRow: { marginTop: scale(6), flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) },
  tag: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    backgroundColor: '#F1F2F8',
  },
  tagText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#5A6072',
  },

  divider: { height: 1, marginVertical: scale(13), backgroundColor: '#EEEFF6' },
  // 2x2 so money and dates are not squeezed into a quarter of a 320pt card.
  factRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: scale(12), rowGap: scale(12) },
  fact: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
  factLabel: { fontSize: fontScale(11), color: '#8B8FA6' },
  factValue: {
    marginTop: scale(4),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },

  railScroll: { paddingRight: scale(4) },
  railStep: { width: scale(86), alignItems: 'center' },
  railLineRow: { flexDirection: 'row', alignItems: 'center' },
  railLine: { width: scale(22), height: scale(2), backgroundColor: '#E3E4EF' },
  railLineDone: { backgroundColor: '#171A5C' },
  railDot: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    backgroundColor: '#EFEFF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDotDone: { backgroundColor: '#171A5C' },
  railDotActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#171A5C',
  },
  railNum: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#9295AA',
  },
  railNumActive: { color: '#171A5C' },
  railLabel: {
    marginTop: scale(7),
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#9295AA',
    textAlign: 'center',
  },
  railLabelOn: { color: '#11123D' },
  railHint: {
    marginTop: scale(3),
    fontSize: fontScale(10),
    color: '#8B8FA6',
    textAlign: 'center',
  },

  tabBar: { paddingBottom: scale(10), gap: scale(6) },
  tabBtn: { minHeight: scale(44), justifyContent: 'center', paddingHorizontal: scale(12), paddingVertical: scale(8) },
  tabText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#8B8FA6',
  },
  tabTextOn: { color: '#3D4FD8' },
  tabUnderline: {
    marginTop: scale(6),
    height: scale(3),
    borderRadius: scale(2),
    backgroundColor: '#3D4FD8',
  },

  accordion: { borderBottomWidth: 1, borderBottomColor: '#F0F1F7' },
  accordionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(13),
    gap: scale(11),
  },
  accordionIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(11),
    backgroundColor: '#F1F2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  accordionSub: {
    marginTop: scale(3),
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    color: '#7A7F9C',
  },
  accordionBody: { paddingBottom: scale(13), paddingLeft: scale(49) },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  badgePill: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(7),
  },
  badgePillText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  badgePending: { backgroundColor: '#FFF4E0' },
  badgeProgress: { backgroundColor: '#EEF0FE' },
  badgeDone: { backgroundColor: '#E7F7EE' },
  badgePendingText: { color: '#A96A05' },
  badgeProgressText: { color: '#3D4FD8' },
  badgeDoneText: { color: '#12854A' },

  sectionTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  groupTitle: {
    marginTop: scale(14),
    marginBottom: scale(4),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  bodyText: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#5A6072' },
  briefSection: { marginTop: scale(4) },

  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: scale(9),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F9',
    gap: scale(12),
  },
  kvLabel: { flex: 1, minWidth: 0, fontSize: fontScale(13), color: '#7A7F9C' },
  kvValue: {
    flex: 1.2,
    minWidth: 0,
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#11123D',
    textAlign: 'right',
  },

  progressLabel: {
    marginTop: scale(12),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#11123D',
  },
  progressCount: { marginTop: scale(3), fontSize: fontScale(12), color: '#7A7F9C' },
  progressTrack: {
    marginTop: scale(9),
    height: scale(7),
    borderRadius: scale(4),
    backgroundColor: '#EDEEF5',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#16A34A' },
  progressPct: {
    marginTop: scale(5),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#12854A',
    textAlign: 'right',
  },

  deliverHead: { flexDirection: 'row', alignItems: 'center', gap: scale(9) },
  deliverNum: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverNumText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#3D4FD8',
  },
  deliverTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  thumbWrap: { marginTop: scale(12), position: 'relative' },
  thumb: {
    width: '100%',
    height: scale(170),
    borderRadius: scale(12),
    backgroundColor: '#E7E8F4',
  },
  thumbPlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadLabel: { marginTop: scale(11), fontSize: fontScale(11), color: '#8B8FA6' },
  uploadDate: {
    marginTop: scale(2),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#11123D',
  },
  deliverActions: { marginTop: scale(13), flexDirection: 'row', gap: scale(10) },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    minHeight: scale(44),
    paddingHorizontal: scale(10),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
  },

  // Deal actions, sharing the accordion's row rhythm.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingVertical: scale(13),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F7',
  },
  actionText: { flex: 1, minWidth: 0 },
  actionLabel: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  actionCaption: {
    marginTop: scale(2),
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    color: '#7A7F9C',
  },
  actionChevron: { fontSize: fontScale(20), color: '#8A8FA8' },
  actionWarn: { color: '#C0392B' },

  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  promptSheet: {
    width: '100%',
    maxWidth: scale(360),
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(16),
  },
  promptTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-Medium',
    color: '#15163F',
  },
  promptMessage: {
    marginTop: scale(6),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#5A6072',
  },
  promptInput: {
    marginTop: scale(12),
    minHeight: scale(92),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    padding: scale(12),
    fontSize: 16,
    color: '#15163F',
    textAlignVertical: 'top',
  },
  promptActions: {
    flexDirection: 'row',
    gap: scale(10),
    marginTop: scale(12),
  },
  promptSend: { flex: 1, marginTop: 0 },
  promptSendOff: { opacity: 0.5 },
  softBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    minHeight: scale(44),
    borderRadius: scale(10),
    backgroundColor: '#EEF0FE',
  },
  ghostBtnText: {
    flexShrink: 1,
    fontSize: fontScale(13),
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(9),
    height: scale(50),
    borderRadius: scale(12),
    backgroundColor: '#171A5C',
  },
  mt12: { marginTop: scale(12) },
  primaryBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  tlRow: { flexDirection: 'row' },
  tlRail: { width: scale(22), alignItems: 'center' },
  tlDot: {
    marginTop: scale(4),
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: '#3D4FD8',
  },
  tlLine: { flex: 1, width: scale(2), backgroundColor: '#E3E4EF' },
  tlCopy: { flex: 1, minWidth: 0, paddingBottom: scale(18) },
  tlTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
    textTransform: 'capitalize',
  },
  tlBody: { marginTop: scale(3), fontSize: fontScale(13), lineHeight: fontScale(19), color: '#5A6072' },
  tlDate: { marginTop: scale(3), fontSize: fontScale(11), color: '#8B8FA6' },

  escrowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securedPill: { flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  securedText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#16A34A',
  },
  escrowAmount: {
    marginTop: scale(11),
    fontSize: fontScale(26),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  escrowHint: { marginTop: scale(3), fontSize: fontScale(13), color: '#7A7F9C' },
  escrowTrack: {
    marginTop: scale(14),
    height: scale(5),
    borderRadius: scale(3),
    backgroundColor: '#EDEEF5',
    overflow: 'hidden',
  },
  escrowFill: { width: '50%', height: '100%', backgroundColor: '#16A34A' },
  escrowFillFull: { width: '100%' },
  escrowLabels: {
    marginTop: scale(7),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  escrowStep: { fontSize: fontScale(11), color: '#7A7F9C' },

  txRow: {
    marginTop: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
  },
  txIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(11),
    backgroundColor: '#F1F2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  txDate: { marginTop: scale(2), fontSize: fontScale(12), color: '#7A7F9C' },
  txAmount: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
    textAlign: 'right',
  },

  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
  },

  nextBtn: { marginBottom: scale(12) },
  shipCard: { marginTop: scale(12) },
  errorText: { fontSize: fontScale(13), color: '#C0392B' },
  notice: {
    marginTop: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FFF4E0',
  },
  noticeText: { fontSize: fontScale(13), lineHeight: fontScale(19), color: '#8A5A00' },
  revisionButtons: { marginTop: scale(12), gap: scale(8) },
  changeRow: { flexDirection: 'row', marginTop: scale(6) },
  changeTick: { width: scale(18), fontSize: fontScale(13), color: '#12854A' },
  changeText: { flex: 1, fontSize: fontScale(13), lineHeight: fontScale(19), color: '#25274C' },
  changeChip: { fontSize: fontScale(11), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#6B7094' },
  changeMust: { color: '#C0392B' },
  watermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermarkText: {
    textAlign: 'center',
    fontSize: fontScale(22),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '-24deg' }],
  },
});

export default DealDetails;
