import { useLiveEffect } from "../liveUpdates";
import { submissionHistory } from '../submissionHistory';
import ReviewPlayer from '../components/ReviewPlayer';
import RateCreatorSheet from '../components/RateCreatorSheet';
import { Alert } from '../components/AppAlert';
/**
 * Campaign detail — the native replacement for the web /campaigns/{id} page.
 * Three tabs from the design: Overview (progress + creator + deliverables),
 * About Campaign (the full brief) and Work Review (submissions on this
 * campaign). Reads GET /api/campaigns/{id}, GET /api/deals/business (one deal
 * per hired creator: progress, revision tracker, deal chat) and
 * GET /api/work/campaign/{id}.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';import { Text } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  SkeletonBanner,
  SkeletonChips,
  SkeletonList,
} from '../components/Skeleton';
import {
  approveWork,
  BACKEND_URL,
  confirmScript,
  declineBid,
  decideBookingPrice,
  finishHiring,
  getCampaign,
  getBusinessDeals,
  getCampaignWork,
  getCreatorReviews,
  getShortlist,
  inviteShortlistedCreator,
  postReview,
  requestNewShortlist,
  selectCreator,
  sendBookingBrief,
  sendDealMessage,
  submitCampaign,
} from '../api';
import {
  approveConfirm,
  approveLabel,
  approveMessage,
  bidDays,
  canReviewAfterApprove,
  dealProgressStep,
  dealStateIndex,
  editModeOf,
  findCreatorDeal,
  hireMessage,
  hireUnfunded,
  hireUnfundedMessage,
  hiredCreatorIds,
  revisionChanges,
  WALLET_RECHARGE_PATH,
  workStatusOf,
} from '../brandHiring';
import { errorMessage } from '../payoutRules';
import WorkRevisionRequest from './WorkRevisionRequest';
import Video from 'react-native-video';
import { CONTENT_MAX_WIDTH, scale, fontScale, NAV_CLEARANCE } from '../theme';

type Props = {
  token: string;
  campaignId: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  /** Opens a native chat thread with the selected creator. */
  onOpenThread?: (userId: string, name: string) => void;
  /**
   * A hired creator to bring forward (the `?creator=` of a notification link
   * such as "creator accepted your booking"). Ignored if they are not hired.
   */
  focusCreatorId?: string;
};

type Campaign = Record<string, any>;
type Work = Record<string, any> & { id: string };

// LayoutAnimation is opt-in on Android; without this the progress list would
// snap open/shut instead of sliding down.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = ['Overview', 'About', 'Work Review'];

/** Labels for a submission's state, as the website's Work Review card shows them. */
const WORK_STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  pending_review: 'Pending Review',
  submitted: 'Pending Review',
  revision_requested: 'Revision',
  awaiting_edit: 'With UGC.ad Editors',
  awaiting_edited: 'Creator Editing',
};

/** The lifecycle shown as the progress rail on the Overview tab. */
const STAGES = [
  { key: 'brief_sent', label: 'Brief Sent' },
  { key: 'product_shipped', label: 'Product Shipped' },
  { key: 'product_received', label: 'Product Received' },
  { key: 'content_submitted', label: 'Content Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'completed', label: 'Completed' },
];

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/**
 * The clean delivered file of an approved submission, as a link that downloads.
 *
 * Deliveries are stored under edited_files / raw_files / work_files, so
 * `video_url` is usually empty; the backend lists them in `files` (edited
 * first). Same fallback order as GET /api/work/{id}/download. Cloudinary plays
 * a video in the browser unless told to send it as an attachment.
 */
export function downloadUrlOf(item: Record<string, any>): string | null {
  const files = Array.isArray(item.files) ? item.files : [];
  const delivered = files.find(f => f?.kind === 'edited') || files[0];
  const url = photoUrl(
    item.video_url ||
      delivered?.url ||
      (Array.isArray(item.work_files) ? item.work_files[0] : undefined) ||
      item.preview_url,
  );
  return url
    ? url.replace(
        /(res\.cloudinary\.com\/[^/]+\/(?:video|image)\/upload\/)(?!fl_attachment)/,
        '$1fl_attachment/',
      )
    : null;
}

const rupees = (value: unknown) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** How far along the rail this campaign is, from its status. */
function stageIndex(campaign: Campaign): number {
  const status = String(campaign.status || '').toLowerCase();
  if (status === 'completed') return 5;
  if (status === 'work_submitted') return 4;
  if (status === 'in_progress') return 2;
  if (status === 'active' || status === 'pending_approval') return 0;
  return 0;
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
      {name === 'back' && <Path d="m14.5 5-6 7 6 7" {...line} />}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
      {name === 'chat' && <Path d="M4 4.5h16v11H9l-5 4Z" {...line} />}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8" r="3.6" {...line} />
          <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" {...line} />
        </>
      )}
      {name === 'play' && <Path d="M9 6.5v11l9-5.5z" fill={color} />}
      {name === 'download' && (
        <Path d="M12 4v10m-4-4 4 4 4-4M5 19h14" {...line} />
      )}
      {name === 'chevron-down' && <Path d="m6 9.5 6 6 6-6" {...line} />}
      {name === 'chevron-up' && <Path d="m6 14.5 6-6 6 6" {...line} />}
      {name === 'copy' && (
        <>
          <Path d="M9 9h10v11H9z" {...line} />
          <Path d="M15 9V5H5v10h4" {...line} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Path d="M4.5 6.5h15v13h-15z" {...line} />
          <Path d="M4.5 10.5h15M9 4.5v4M15 4.5v4" {...line} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Path d="M4 7.5h16v11H4z" {...line} />
          <Path d="M4 7.5 15 4v3.5M16 13h2" {...line} />
        </>
      )}
      {name === 'instagram' && (
        <>
          <Path
            d="M4.5 8a3.5 3.5 0 0 1 3.5-3.5h8A3.5 3.5 0 0 1 19.5 8v8a3.5 3.5 0 0 1-3.5 3.5H8A3.5 3.5 0 0 1 4.5 16z"
            {...line}
          />
          <Circle cx="12" cy="12" r="3.2" {...line} />
          <Circle cx="16.6" cy="7.4" r="0.9" fill={color} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path
            d="M12 20.5s6-5.4 6-9.5a6 6 0 1 0-12 0c0 4.1 6 9.5 6 9.5Z"
            {...line}
          />
          <Circle cx="12" cy="11" r="2.2" {...line} />
        </>
      )}
      {name === 'globe' && (
        <>
          <Circle cx="12" cy="12" r="7.5" {...line} />
          <Path
            d="M4.5 12h15M12 4.5c2 2.4 3 5 3 7.5s-1 5.1-3 7.5c-2-2.4-3-5-3-7.5s1-5.1 3-7.5Z"
            {...line}
          />
        </>
      )}
      {name === 'clapper' && (
        <>
          <Path d="M4 9.5h16v10H4z" {...line} />
          <Path d="M4 9.5 5.5 5l14 1.5-1 3" {...line} />
        </>
      )}
      {name === 'badge' && (
        <>
          <Circle cx="12" cy="9.5" r="4.8" {...line} />
          <Path d="m9 14 -1 6 4-2 4 2-1-6" {...line} />
        </>
      )}
      {name === 'rupee' && (
        <>
          <Circle cx="12" cy="12" r="7.5" {...line} />
          <Path
            d="M9.5 8h5M9.5 10.8h5M13.5 8c1.4 0 2 1.2 2 2.4s-.9 2.4-2.6 2.4H9.5l4 3.2"
            {...line}
          />
        </>
      )}
    </Svg>
  );
}

/** One icon + label + value cell in the strip under the header. */
function SummaryCell({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  // Three cells share the strip: under 420dp the icon would leave the value
  // no room, so only the text shows (and it shrinks before it truncates).
  const roomy = useWindowDimensions().width >= 420;
  return (
    <View style={styles.summaryCell}>
      {roomy && (
        <View style={styles.summaryIcon}>
          <Icon name={icon} color="#4C5BF3" size={15} />
        </View>
      )}
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={styles.summaryValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** One icon + label + value cell in the creator card's 3-column fact grid. */
function CreatorFact({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.factCell}>
      <View style={styles.factIcon}>
        <Icon name={icon} color="#4C5BF3" size={15} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={styles.factValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Label/value pair used across the About tab. */
function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function BrandCampaignDetail({
  token,
  campaignId,
  onBack,
  onNavigate,
  onOpenThread,
  focusCreatorId,
}: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [work, setWork] = useState<Work[]>([]);
  // One deal per hired creator: drives progress, the revision card and deal chat.
  const [deals, setDeals] = useState<Record<string, any>[]>([]);
  // Which hired creator the panels are showing (multi-creator briefs).
  const [activeCreatorId, setActiveCreatorId] = useState<string | null>(
    focusCreatorId ? String(focusCreatorId) : null,
  );
  // Why the campaign could not be loaded ('' when it did).
  const [loadError, setLoadError] = useState('');
  // The submission whose Request-Revision composer is open, and the id of the
  // one being approved (blocks a double-tap + shows progress). Mirrors the
  // standalone BrandWorkReview screen so a brand can review right here on the
  // campaign's Work Review tab instead of being bounced to another screen.
  const [revising, setRevising] = useState<Work | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  // Which submission's inline video is currently playing (tap to toggle).
  const [playingWork, setPlayingWork] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    uri: string;
    watermark: boolean;
    title?: string;
  } | null>(null);
  const [tab, setTab] = useState(0);
  /** Campaign Progress starts open; the header arrow folds it away. */
  const [progressOpen, setProgressOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // UGC.ad script review (status === awaiting_brand_confirmation).
  const [scriptBusy, setScriptBusy] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  // Which bid (by creator id) is being accepted/declined right now.
  const [bidBusy, setBidBusy] = useState('');
  const [finishingHiring, setFinishingHiring] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  // Ops-curated shortlist (briefs posted with "Request matches").
  const [shortlist, setShortlist] = useState<Record<string, any> | null>(null);
  const [shortlistBusy, setShortlistBusy] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState('');
  // Direct booking: counter-offer answer and the brief to send.
  const [bookingBusy, setBookingBusy] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState('');
  // Reviews this brand already left, by creator id (rating), and the sheet target.
  const [myReviews, setMyReviews] = useState<Record<string, number>>({});
  const [rateFor, setRateFor] = useState<{ id: string; name: string } | null>(null);
  // Deal chat composer.
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  // Hire/approve/revise are one-way money moves: a ref blocks a fast double tap.
  const actionRef = useRef(false);

  // A notification link can bring a different creator forward later.
  useEffect(() => {
    if (focusCreatorId) setActiveCreatorId(String(focusCreatorId));
  }, [focusCreatorId]);

  const load = useCallback(async () => {
    // The brief and its submissions fail independently: a campaign with no
    // submitted work yet is a normal state, so an empty work list must not
    // blank out the brief itself.
    const [detail, dealList] = await Promise.allSettled([
      getCampaign(token, campaignId), getBusinessDeals(token),
    ]);

    // Leaving `campaign` null on failure is what renders the "Couldn't load
    // this campaign" state below, with the reason and a Retry.
    if (detail.status === 'fulfilled') {
      setCampaign(detail.value);
      setLoadError('');
    } else {
      setLoadError(errorMessage(detail.reason, 'Could not load this campaign.'));
    }
    if (dealList.status === 'fulfilled') setDeals(dealList.value as any[]);

    // Without a creator id the backend returns only the LATEST submission on the
    // brief, so on a multi-creator brief ask for each hired creator's separately.
    const hired: string[] =
      detail.status === 'fulfilled' ? hiredCreatorIds(detail.value) : [];
    const results = await Promise.allSettled(
      hired.length > 1
        ? hired.map(id => getCampaignWork(token, campaignId, id))
        : [getCampaignWork(token, campaignId)],
    );
    const seen = new Set<string>();
    setWork(
      [...results.flatMap(r => (r.status === 'fulfilled' ? r.value : [])),
        ...submissionHistory(dealList.status === 'fulfilled' ? dealList.value : [], campaignId)]
        .map((item, index) => ({ ...item, id: String(item.id ?? index) }))
        .filter(item => !seen.has(item.id) && !!seen.add(item.id)),
    );

    // The ops shortlist exists only for briefs posted with "Request matches".
    if (detail.status === 'fulfilled' && detail.value?.match_status) {
      try {
        setShortlist(await getShortlist(token, campaignId));
      } catch {
        // Non-fatal: the panel falls back to its "being curated" message.
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [campaignId, token]);

  // Which of this brand's reviews exist, so a rated creator shows "You rated N".
  const hiredKey = campaign ? hiredCreatorIds(campaign).join(',') : '';
  useEffect(() => {
    if (!campaign || !hiredKey) return undefined;
    let live = true;
    (async () => {
      const found: Record<string, number> = {};
      for (const creatorId of hiredKey.split(',')) {
        try {
          const reviews = await getCreatorReviews(token, creatorId);
          const mine = reviews.find(
            (review: any) =>
              String(review.campaign_id) === String(campaignId) &&
              (!campaign.business_id ||
                String(review.business_id) === String(campaign.business_id)),
          );
          if (mine) found[creatorId] = Number(mine.rating) || 0;
        } catch {
          // Unknown: the Add a review button stays and the server refuses a repeat.
        }
      }
      if (live) setMyReviews(found);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, hiredKey, token, campaignId]);

  // Approving releases escrow to the creator and can't be undone, so confirm
  // first. Uses the work-submission id (what /api/work/campaign/{id} returns),
  // which /api/work/{id}/approve expects.
  const runApprove = useCallback(
    async (item: Work) => {
      if (actionRef.current) return;
      actionRef.current = true;
      setApproving(item.id);
      try {
        const result = await approveWork(token, item.id);
        load();
        const withMode = { ...item, edit_mode: editModeOf(campaign) };
        const canRate = !!item.creator_id && canReviewAfterApprove(result as any, withMode);
        Alert.alert('Approved', approveMessage(result as any, withMode), [
          {
            text: canRate ? 'Continue' : 'OK',
            onPress: () =>
              canRate &&
              setRateFor({
                id: String(item.creator_id),
                name: text(item.creator_name, 'this creator'),
              }),
          },
        ]);
      } catch (err: any) {
        Alert.alert('Not approved', errorMessage(err, 'Could not approve this work.'));
      } finally {
        actionRef.current = false;
        setApproving(null);
      }
    },
    [token, load, campaign],
  );

  const confirmApprove = useCallback(
    (item: Work) => {
      const { title, body } = approveConfirm(
        { ...item, edit_mode: editModeOf(campaign) },
        text(item.creator_name, 'the creator'),
      );
      Alert.alert(title, body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => runApprove(item) },
      ]);
    },
    [runApprove, campaign],
  );

  const handlePublish = useCallback(() => {
    Alert.alert(
      'Publish this campaign?',
      'It goes to our team for review, then to creators. Your wallet is charged the budget + fees on publish.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishBusy(true);
            try {
              await submitCampaign(token, campaignId);
              Alert.alert('Submitted', 'Your campaign was sent for review.');
              load();
            } catch (e) {
              Alert.alert(
                'Could not publish',
                errorMessage(e, 'Please try again.'),
              );
            } finally {
              setPublishBusy(false);
            }
          },
        },
      ],
    );
  }, [campaignId, load, token]);

  const handleFinishHiring = useCallback((hired: number, remaining: number) => {
    Alert.alert(
      `Finish hiring with ${hired} creator${hired === 1 ? '' : 's'}?`,
      `The ${remaining} unfilled slot${remaining === 1 ? '' : 's'} will close and the unused budget will be refunded to your wallet. Your hired creators will continue their work.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish hiring',
          onPress: async () => {
            setFinishingHiring(true);
            try {
              await finishHiring(token, campaignId);
              await load();
              Alert.alert('Hiring closed', 'Unused budget refunded to your wallet.');
            } catch (e) {
              Alert.alert('Could not finish hiring', errorMessage(e, 'Please try again.'));
            } finally {
              setFinishingHiring(false);
            }
          },
        },
      ],
    );
  }, [campaignId, load, token]);

  const handleAcceptBid = useCallback(
    (creatorId: string, who: string) => {
      Alert.alert(
        `Hire ${who}?`,
        'Their bid amount moves into escrow and they are hired for this campaign. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Hire',
            onPress: async () => {
              if (actionRef.current) return;
              actionRef.current = true;
              setBidBusy(creatorId);
              try {
                const result = await selectCreator(token, campaignId, creatorId);
                // Only a physical brief has a product to ship.
                const ship = campaign?.requires_shipment || campaign?.shipment_required;
                if (hireUnfunded(result)) {
                  // A short wallet still hires; prompt (not block) to fund the escrow.
                  Alert.alert('Hired', hireUnfundedMessage(result, who), [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Add funds', onPress: () => onNavigate(WALLET_RECHARGE_PATH) },
                  ]);
                } else {
                  Alert.alert(
                    'Hired',
                    `${hireMessage(result, who)}${ship ? ' Ship the product to get started.' : ''}`,
                  );
                }
                load();
              } catch (e) {
                // Includes a short wallet ("needs Rs. X more") worded by the backend.
                Alert.alert('Could not hire', errorMessage(e, 'Please try again.'));
              } finally {
                actionRef.current = false;
                setBidBusy('');
              }
            },
          },
        ],
      );
    },
    [campaign, campaignId, load, onNavigate, token],
  );

  const handleDeclineBid = useCallback(
    (creatorId: string, who: string) => {
      Alert.alert(`Decline ${who}?`, "They'll be told this bid wasn't selected.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setBidBusy(creatorId);
            try {
              await declineBid(token, campaignId, creatorId);
              load();
            } catch (e) {
              Alert.alert('Could not decline', errorMessage(e, 'Please try again.'));
            } finally {
              setBidBusy('');
            }
          },
        },
      ]);
    },
    [campaignId, load, token],
  );

  // ----- direct booking: the creator's counter-offer and the brief to send
  const answerPrice = useCallback(
    (action: 'accept' | 'reject') => {
      const run = async () => {
        if (actionRef.current) return;
        actionRef.current = true;
        setBookingBusy(true);
        try {
          const res = await decideBookingPrice(token, campaignId, action);
          if (action === 'accept') {
            const diff = Number(res?.difference_charged || 0);
            Alert.alert(
              'New price accepted',
              diff > 0
                ? `${rupees(diff)} more was charged from your wallet.`
                : diff < 0
                ? `${rupees(-diff)} was refunded to your wallet.`
                : 'The booking is confirmed. Send the brief next.',
            );
          } else {
            Alert.alert('Booking cancelled', 'You have been refunded in full.');
          }
          await load();
        } catch (e) {
          // A short wallet arrives as the backend's own "needs Rs. X more" text.
          Alert.alert('Could not update the booking', errorMessage(e, 'Please try again.'));
        } finally {
          actionRef.current = false;
          setBookingBusy(false);
        }
      };
      if (action === 'reject') {
        Alert.alert(
          'Cancel this booking?',
          'The creator is told you did not accept their price and you are refunded in full.',
          [
            { text: 'Keep booking', style: 'cancel' },
            { text: 'Cancel and refund', style: 'destructive', onPress: run },
          ],
        );
      } else {
        run();
      }
    },
    [campaignId, load, token],
  );

  const sendBrief = useCallback(async () => {
    if (actionRef.current) return;
    if (!briefText.trim()) {
      Alert.alert('Write the brief', 'Tell the creator what to make before sending.');
      return;
    }
    actionRef.current = true;
    setBookingBusy(true);
    try {
      await sendBookingBrief(token, campaignId, briefText.trim());
      setBriefOpen(false);
      setBriefText('');
      Alert.alert('Brief sent', 'The work has started.');
      await load();
    } catch (e) {
      Alert.alert('Could not send the brief', errorMessage(e, 'Please try again.'));
    } finally {
      actionRef.current = false;
      setBookingBusy(false);
    }
  }, [briefText, campaignId, load, token]);

  // ----- ops-curated shortlist
  const inviteFromShortlist = useCallback(
    async (creatorId: string, name: string) => {
      if (actionRef.current) return;
      actionRef.current = true;
      setShortlistBusy(true);
      try {
        await inviteShortlistedCreator(token, campaignId, creatorId, {
          message: inviteNote.trim(),
        });
        setInviting(null);
        setInviteNote('');
        await load();
        Alert.alert(
          'Invitation sent',
          `${name} has a private offer in Messages. The rest of this shortlist is closed.`,
          [
            {
              text: 'Open chat',
              onPress: () => (onOpenThread ? onOpenThread(creatorId, name) : onNavigate('/messages')),
            },
          ],
        );
      } catch (e) {
        Alert.alert('Could not send the invitation', errorMessage(e, 'Please try again.'));
      } finally {
        actionRef.current = false;
        setShortlistBusy(false);
      }
    },
    [campaignId, inviteNote, load, onNavigate, onOpenThread, token],
  );

  const askForNewShortlist = useCallback(async () => {
    if (actionRef.current) return;
    actionRef.current = true;
    setShortlistBusy(true);
    try {
      await requestNewShortlist(token, campaignId);
      await load();
      Alert.alert('New shortlist requested', 'Our team will curate fresh matches for this brief.');
    } catch (e) {
      Alert.alert('Could not request a new shortlist', errorMessage(e, 'Please try again.'));
    } finally {
      actionRef.current = false;
      setShortlistBusy(false);
    }
  }, [campaignId, load, token]);

  // ----- review the creator once the deal is complete
  const submitReview = useCallback(
    async (stars: number, review: string) => {
      if (!rateFor) return;
      await postReview(token, {
        campaign_id: campaignId,
        creator_id: rateFor.id,
        rating: stars,
        review,
      });
      setMyReviews(prev => ({ ...prev, [rateFor.id]: stars }));
      setRateFor(null);
      Alert.alert('Review submitted', 'Thanks for the feedback!');
    },
    [campaignId, rateFor, token],
  );

  // ----- deal chat (shared thread with the creator, including platform lines)
  const sendChat = useCallback(
    async (dealId: string) => {
      const body = chatText.trim();
      if (!body || chatBusy) return;
      setChatBusy(true);
      try {
        await sendDealMessage(token, dealId, body);
        setChatText('');
        await load();
      } catch (e) {
        Alert.alert('Could not send', errorMessage(e, 'Please try again.'));
      } finally {
        setChatBusy(false);
      }
    },
    [chatBusy, chatText, load, token],
  );

  const handleScript = useCallback(
    async (action: 'confirm' | 'request_changes') => {
      if (action === 'request_changes' && !changeNote.trim()) {
        Alert.alert('Add a note', 'Tell the team what to change in the script.');
        return;
      }
      setScriptBusy(true);
      try {
        const res = await confirmScript(token, campaignId, action, changeNote.trim() || undefined);
        Alert.alert('Done', res?.message || (action === 'confirm' ? 'Your brief is now live.' : 'Change request sent.'));
        setChangesOpen(false);
        setChangeNote('');
        load();
      } catch (e) {
        Alert.alert('Could not submit', errorMessage(e, 'Please try again.'));
      } finally {
        setScriptBusy(false);
      }
    },
    [campaignId, changeNote, load, token],
  );

  useLiveEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="back" color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitle}>Campaign</Text>
            </View>
            <View style={styles.headerBtn} />
          </View>
        </View>
        <View style={styles.sheet}>
          <View style={styles.content}>
            <SkeletonBanner height={140} />
            <SkeletonChips count={3} />
            <SkeletonList count={3} lines={3} />
          </View>
        </View>
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="back" color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitle}>Campaign</Text>
            </View>
            <View style={styles.headerBtn} />
          </View>
        </View>
        <View style={styles.sheet}>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn't load this campaign</Text>
            <Text style={styles.emptyText}>
              {loadError || 'Please try again, or go back and open it again.'}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setLoading(true);
                load();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading this campaign"
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const status = String(campaign.status || '').replace(/_/g, ' ');
  // Short human-facing code for the strip: the backend's own code when it
  // sends one, otherwise CMP- plus the tail of the id.
  const campaignCode =
    text(campaign.campaign_code || campaign.code) ||
    `CMP-${String(campaign.id || campaignId)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toUpperCase()}`;
  const creatorName = text(
    campaign.selected_creator_name || campaign.creator_name,
    '',
  );
  const creatorAvatar = photoUrl(
    campaign.creator_photo || campaign.creator_profile_photo,
  );
  // Every hired creator, named from their bid. The single-creator card above only
  // knows the first pick, so a multi-creator brief lists the rest here.
  const selectedIds = hiredCreatorIds(campaign);
  const wanted = Math.max(1, Number(campaign.creators_wanted) || 1);
  const remainingSlots = Math.max(0, wanted - selectedIds.length);
  const hiringOpen = campaign.status === 'active' && remainingSlots > 0;
  const hiredList: { id: string; name: string }[] = selectedIds.map((id: string) => {
    const bid = (Array.isArray(campaign.bids) ? campaign.bids : []).find(
      (b: any) => String(b?.creator_id) === String(id),
    );
    const hired = (Array.isArray(campaign.hired_creators) ? campaign.hired_creators : []).find((creator: any) => String(creator.id) === id);
    return {
      id: String(id),
      name: text(hired?.name || bid?.creator_name || bid?.creator_nickname || bid?.creator?.full_name || bid?.creator?.name || (String(campaign.selected_creator) === id ? creatorName : ''), 'Creator'),
    };
  });
  // The creator the panels follow: the one picked on the switcher, else the one a
  // notification link asked for, else the first hire.
  const activeId =
    activeCreatorId && selectedIds.includes(String(activeCreatorId))
      ? String(activeCreatorId)
      : selectedIds[0] || null;
  const activeName = hiredList.find(c => c.id === activeId)?.name || '';
  const activeDeal = findCreatorDeal(deals, campaignId, activeId);
  // Progress follows that creator's own deal (as the website does); a brief
  // with no deal yet falls back to the campaign status.
  const current = dealProgressStep(activeDeal, STAGES.length) ?? stageIndex(campaign);
  // On a multi-creator brief only the active creator's submissions are shown.
  const workShown =
    hiredList.length > 1 && activeId
      ? work.filter(item => {
          const owner = item.creator_id ?? item.creatorId;
          return owner == null || String(owner) === activeId;
        })
      : work;
  // Direct bookings carry their state on the deal's campaign; fall back to the brief.
  const booking = activeDeal?.campaign?.booking_status ? activeDeal.campaign : campaign;
  const bookingStatus = String(booking?.booking_status || '');
  const showBooking =
    !!bookingStatus &&
    bookingStatus !== 'declined' &&
    !(bookingStatus === 'accepted' && booking.brief_sent);
  const dealDone =
    dealStateIndex(activeDeal?.current_state) >= 6 || campaign.status === 'completed';

  // Switcher between hired creators (multi-creator briefs only).
  const creatorTabs =
    hiredList.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.creatorTabs}
        contentContainerStyle={styles.creatorTabsInner}
      >
        {hiredList.map(c => {
          const on = c.id === activeId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.creatorTab, on && styles.creatorTabOn]}
              onPress={() => setActiveCreatorId(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Show ${c.name}`}
            >
              <Text style={[styles.creatorTabText, on && styles.creatorTabTextOn]} numberOfLines={1}>
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    ) : null;
  const needsShipping = !!(
    campaign.requires_shipment || campaign.shipment_required
  );

  return (
    <View style={styles.screen}>
      {/* Navy bar + rounded sheet, matching the brand tab screens. */}
      <View style={styles.topBar}>
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

          {/* Absolutely positioned so the title stays optically centred
              whatever the back arrow and the status chip measure. */}
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>
              {text(campaign.title, 'Campaign')}
            </Text>
          </View>

          <View style={styles.statusChip}>
            <Text style={styles.statusText} numberOfLines={1}>
              {status || 'draft'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.summaryStrip}>
          <SummaryCell icon="copy" label="Campaign ID" value={campaignCode} />
          <View style={styles.summaryDivider} />
          <SummaryCell
            icon="calendar"
            label="Launched on"
            value={formatDate(campaign.created_at) || '-'}
          />
          <View style={styles.summaryDivider} />
          <SummaryCell
            icon="wallet"
            label="Total Budget"
            value={rupees(
              campaign.budget || campaign.total_budget || campaign.budget_max,
            )}
          />
        </View>

        <View style={styles.tabs}>
          {TABS.map((label, index) => {
            const active = tab === index;
            return (
              <TouchableOpacity
                key={label}
                style={styles.tab}
                onPress={() => setTab(index)}
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} textBreakStrategy="simple">
                  {label}
                  {index === 2 && workShown.length > 0 ? ` (${workShown.length})` : ''}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <KeyboardAvoidingView
          style={styles.flexFill}
          // 'padding' on both: Android is edge-to-edge, so `undefined` left the
          // keyboard covering the brief, invite and deal-chat inputs.
          behavior="padding"
        >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          {tab === 0 && (
            <>
              {!!loadError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{loadError}</Text>
                  <TouchableOpacity
                    style={styles.errorBannerBtn}
                    onPress={() => {
                      setRefreshing(true);
                      load();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading"
                  >
                    <Text style={styles.errorBannerBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {creatorTabs}
              {workShown.filter(item => !item.historical && item.status === 'revision_requested').map(item => {
                // The deal's tracker has the structured change list, the deadline and
                // how the creator answered; without a deal only the last note is known.
                const tracker =
                  findCreatorDeal(deals, campaignId, item.creator_id)?.revision_tracker || null;
                const lastFeedback = String(
                  item.revisions?.[item.revisions.length - 1]?.feedback || '',
                );
                const changes = revisionChanges(
                  tracker || { latest_feedback: lastFeedback },
                );
                const answer: Record<string, string> = {
                  accepted: 'Creator accepted the revision and is reworking the content.',
                  scope_creep:
                    'Creator says these changes go beyond the brief. Nothing is disputed yet - reply in the deal chat to agree what is in scope.',
                  partial_dispute:
                    'Creator accepted some changes and pushed back on the rest. Nothing is disputed yet - reply in the deal chat to settle the remaining items.',
                };
                return (
                  <View key={`revision-${item.id}`} style={styles.card}>
                    <Text style={styles.cardTitle}>Revision requested</Text>
                    <Text style={styles.bidProposal}>
                      {text(item.creator_name, 'Creator')} is preparing a revised video. The previous upload remains in Work Review.
                    </Text>
                    {!!tracker && (
                      <Text style={styles.bidMeta}>
                        {Number(tracker.revision_count_used) || 0}
                        {tracker.revision_limit ? ` of ${tracker.revision_limit}` : ''} revisions used
                      </Text>
                    )}
                    {changes.length > 0 && (
                      <View style={styles.changeList}>
                        <Text style={styles.changeHead}>Changes you asked for</Text>
                        {changes.map((change, i) => (
                          <View key={i} style={styles.changeRow}>
                            {!!change.severity && (
                              <Text style={styles.changeSev}>{change.severity}</Text>
                            )}
                            <Text style={styles.changeText}>
                              {change.text}
                              {change.ref ? `  (ref: ${change.ref})` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!!tracker && (
                      <Text style={styles.bidMeta}>
                        New deadline:{' '}
                        {tracker.new_deadline_at
                          ? new Date(tracker.new_deadline_at).toLocaleString()
                          : 'Not scheduled'}
                      </Text>
                    )}
                    {!!tracker && (
                      <Text style={styles.workHistory}>
                        {answer[String(tracker.creator_response)] ||
                          'Waiting for the creator to respond to this revision request.'}
                      </Text>
                    )}
                  </View>
                );
              })}
              {/* A draft can't reach creators until it's published for review. */}
              {String(campaign.status) === 'draft' && (
                <View style={styles.draftCard}>
                  <Text style={styles.draftTitle}>This campaign is a draft</Text>
                  <Text style={styles.draftSub}>
                    Publish it to send it to our team for review, then on to creators.
                  </Text>
                  <TouchableOpacity
                    style={styles.publishBtn}
                    onPress={handlePublish}
                    disabled={publishBusy}
                    accessibilityRole="button"
                  >
                    {publishBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.publishBtnText}>Publish Campaign</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {String(campaign.status) === 'awaiting_brand_confirmation' && (
                <View style={styles.scriptCard}>
                  <Text style={styles.scriptTitle}>📝 Your script is ready - review it</Text>
                  <Text style={styles.scriptSub}>
                    UGC.ad wrote this script for your campaign. Creators only see the brief after you confirm.
                  </Text>
                  <ScrollView style={styles.scriptBox} nestedScrollEnabled>
                    <Text style={styles.scriptText}>
                      {text(campaign.script_text, 'No script text attached - contact support.')}
                    </Text>
                  </ScrollView>
                  {changesOpen && (
                    <TextInput
                      style={styles.scriptInput}
                      value={changeNote}
                      onChangeText={setChangeNote}
                      placeholder="What should the team change? Be specific - tone, hook, product points…"
                      placeholderTextColor="#9498B0"
                      multiline
                    />
                  )}
                  <View style={styles.scriptActions}>
                    {!changesOpen ? (
                      <>
                        <TouchableOpacity
                          style={[styles.scriptBtn, styles.scriptBtnPrimary]}
                          onPress={() => handleScript('confirm')}
                          disabled={scriptBusy}
                          accessibilityRole="button"
                        >
                          {scriptBusy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.scriptBtnPrimaryText}>Confirm - send to creators</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.scriptBtn, styles.scriptBtnGhost]}
                          onPress={() => setChangesOpen(true)}
                          disabled={scriptBusy}
                          accessibilityRole="button"
                        >
                          <Text style={styles.scriptBtnGhostText}>Request changes</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.scriptBtn, styles.scriptBtnPrimary]}
                          onPress={() => handleScript('request_changes')}
                          disabled={scriptBusy}
                          accessibilityRole="button"
                        >
                          {scriptBusy ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.scriptBtnPrimaryText}>Send change request</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.scriptBtn, styles.scriptBtnGhost]}
                          onPress={() => { setChangesOpen(false); setChangeNote(''); }}
                          disabled={scriptBusy}
                          accessibilityRole="button"
                        >
                          <Text style={styles.scriptBtnGhostText}>Back</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}
              {/* Direct booking: answer the creator's price, or send the brief once accepted. */}
              {showBooking && (
                <View style={styles.card}>
                  {bookingStatus === 'pending_creator' && (
                    <>
                      <Text style={styles.cardTitle}>Booking sent</Text>
                      <Text style={styles.bidProposal}>
                        {rupees(booking.amount_paid)} is held in escrow. Waiting for the
                        creator to accept - you're refunded in full if they decline.
                      </Text>
                    </>
                  )}
                  {bookingStatus === 'price_revision' && (() => {
                    const booked = Number(booking.budget_max || booking.budget_min || 0);
                    const asking = Number(booking.proposed_amount || 0);
                    const fee = Number(booking.fee_percent);
                    return (
                      <>
                        <Text style={styles.cardTitle}>The creator proposed a new price</Text>
                        {!!booking.proposed_message && (
                          <Text style={styles.bidProposal}>"{String(booking.proposed_message)}"</Text>
                        )}
                        <Text style={styles.bidMeta}>You booked at {rupees(booked)}</Text>
                        <Text style={styles.bookingAsk}>They're asking {rupees(asking)}</Text>
                        {Number.isFinite(fee) && fee >= 0 && (
                          <Text style={styles.bidMeta}>
                            {asking >= booked ? 'Extra to pay (incl. fee): ' : 'To be refunded: '}
                            {rupees(Math.abs(Math.round((asking - booked) * (1 + fee / 100))))}
                          </Text>
                        )}
                        <View style={styles.bidActions}>
                          <TouchableOpacity
                            style={[styles.bidBtn, styles.bidDecline]}
                            onPress={() => answerPrice('reject')}
                            disabled={bookingBusy}
                            accessibilityRole="button"
                          >
                            <Text style={styles.bidDeclineText}>Cancel and refund</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.bidBtn, styles.bidAccept]}
                            onPress={() => answerPrice('accept')}
                            disabled={bookingBusy}
                            accessibilityRole="button"
                          >
                            {bookingBusy ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.bidAcceptText}>Accept new price</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </>
                    );
                  })()}
                  {bookingStatus === 'accepted' && !booking.brief_sent && (
                    <>
                      <Text style={styles.cardTitle}>Send your brief to start the work</Text>
                      <Text style={styles.bidProposal}>
                        The creator accepted and is waiting. They can't start until the brief arrives.
                      </Text>
                      {!briefOpen ? (
                        <TouchableOpacity
                          style={[styles.bidBtn, styles.bidAccept, styles.fullBtn]}
                          onPress={() => {
                            setBriefText(String(booking.brief_draft?.brief_text || ''));
                            setBriefOpen(true);
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.bidAcceptText}>Write the brief</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TextInput
                            style={styles.scriptInput}
                            value={briefText}
                            onChangeText={setBriefText}
                            placeholder="What should the creator make?"
                            placeholderTextColor="#9498B0"
                            multiline
                            editable={!bookingBusy}
                          />
                          <Text style={styles.bidMeta}>
                            Pre-filled from what you wrote at checkout. Contact details are not allowed.
                          </Text>
                          <View style={styles.bidActions}>
                            <TouchableOpacity
                              style={[styles.bidBtn, styles.bidDecline]}
                              onPress={() => setBriefOpen(false)}
                              disabled={bookingBusy}
                              accessibilityRole="button"
                            >
                              <Text style={styles.bidDeclineText}>Back</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.bidBtn, styles.bidAccept]}
                              onPress={sendBrief}
                              disabled={bookingBusy || !briefText.trim()}
                              accessibilityRole="button"
                            >
                              {bookingBusy ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.bidAcceptText}>Send brief</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* Ops-curated shortlist (brief posted with "Request matches"). */}
              {!!campaign.match_status && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    Curated shortlist
                    {Number(shortlist?.shortlist_request_count) > 0
                      ? `  (request #${shortlist!.shortlist_request_count})`
                      : ''}
                  </Text>
                  {campaign.match_status === 'fulfilled' ? (
                    <Text style={styles.bidProposal}>
                      You've invited a creator from this shortlist. Track the conversation in your chats.
                    </Text>
                  ) : !Array.isArray(shortlist?.candidates) || !shortlist!.candidates.length ? (
                    <Text style={styles.bidProposal}>
                      Our team is curating creator matches for this brief. You'll be notified as
                      soon as your shortlist is ready.
                      {Number(shortlist?.shortlist_request_count) > 0
                        ? ' New shortlist requested - sit tight while we find fresh matches.'
                        : ''}
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.bidProposal}>
                        Pick one creator to invite. Inviting sends a private offer and closes the rest of this shortlist.
                      </Text>
                      {shortlist!.candidates.map((cand: any) => {
                        const c = cand.creator || {};
                        const name = text(c.public_creator_id, 'Creator');
                        const dismissed = cand.status === 'dismissed';
                        const invited = cand.status === 'invited';
                        const facts = [
                          c.city_tier,
                          Array.isArray(c.languages) && c.languages.length
                            ? c.languages.slice(0, 3).join(', ')
                            : '',
                          typeof c.deliverables_completed === 'number'
                            ? `${c.deliverables_completed} deliverables`
                            : '',
                          c.content_style,
                        ].filter(Boolean);
                        return (
                          <View key={String(cand.creator_id)} style={[styles.bidRow, dismissed && styles.dismissed]}>
                            <View style={styles.bidTop}>
                              <Text style={styles.bidName} numberOfLines={1}>{name}</Text>
                              {invited && <Text style={styles.invitedTag}>Invited</Text>}
                            </View>
                            <Text style={styles.bidMeta}>{text(c.primary_category, 'UGC Creator')}</Text>
                            {facts.length > 0 && <Text style={styles.bidMeta}>{facts.join(' · ')}</Text>}
                            {!!cand.ops_note && (
                              <Text style={styles.bidProposal}>"{String(cand.ops_note)}"</Text>
                            )}
                            {inviting === cand.creator_id ? (
                              <>
                                <TextInput
                                  style={styles.scriptInput}
                                  value={inviteNote}
                                  onChangeText={setInviteNote}
                                  placeholder="Add a message to your invitation (optional)"
                                  placeholderTextColor="#9498B0"
                                  multiline
                                  editable={!shortlistBusy}
                                />
                                <View style={styles.bidActions}>
                                  <TouchableOpacity
                                    style={[styles.bidBtn, styles.bidDecline]}
                                    onPress={() => setInviting(null)}
                                    disabled={shortlistBusy}
                                    accessibilityRole="button"
                                  >
                                    <Text style={styles.bidDeclineText}>Back</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.bidBtn, styles.bidAccept]}
                                    onPress={() => inviteFromShortlist(String(cand.creator_id), name)}
                                    disabled={shortlistBusy}
                                    accessibilityRole="button"
                                  >
                                    {shortlistBusy ? (
                                      <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                      <Text style={styles.bidAcceptText}>Send invitation</Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </>
                            ) : (
                              <View style={styles.bidActions}>
                                <TouchableOpacity
                                  style={[styles.bidBtn, styles.bidDecline]}
                                  onPress={() => onNavigate(`/creator/${encodeURIComponent(String(cand.creator_id))}`)}
                                  accessibilityRole="button"
                                >
                                  <Text style={styles.bidDeclineText}>Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.bidBtn, styles.bidAccept, (dismissed || invited) && styles.btnOff]}
                                  onPress={() => {
                                    setInviteNote('');
                                    setInviting(String(cand.creator_id));
                                  }}
                                  disabled={shortlistBusy || dismissed || invited}
                                  accessibilityRole="button"
                                >
                                  <Text style={styles.bidAcceptText}>Invite</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                      <TouchableOpacity
                        style={styles.linkBtn}
                        onPress={askForNewShortlist}
                        disabled={shortlistBusy}
                        accessibilityRole="button"
                      >
                        <Text style={styles.linkBtnText}>Not the right fit? Request a new shortlist</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {hiringOpen && selectedIds.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Hiring</Text>
                  <Text style={styles.bidProposal}>
                    {selectedIds.length} of {wanted} creators hired. You can close the remaining slots now.
                  </Text>
                  <TouchableOpacity
                    style={[styles.bidBtn, styles.bidAccept]}
                    onPress={() => handleFinishHiring(selectedIds.length, remainingSlots)}
                    disabled={finishingHiring || !!bidBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Finish hiring"
                  >
                    {finishingHiring ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.bidAcceptText}>
                        Finish hiring with {selectedIds.length} creator{selectedIds.length === 1 ? '' : 's'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {(() => {
                if (!hiringOpen) return null;
                const bids = Array.isArray(campaign.bids) ? campaign.bids : [];
                // Hide bids that are declined OR already hired, and the whole
                // card once a creator is selected — the decision is made.
                const hiredIds = new Set(
                  (Array.isArray(campaign.selected_creators)
                    ? campaign.selected_creators
                    : [campaign.selected_creator]
                  )
                    .filter(Boolean)
                    .map(String),
                );
                const open = bids.filter((b: any) => {
                  const st = String(b?.status || 'pending').toLowerCase();
                  return (
                    st !== 'declined' &&
                    st !== 'accepted' &&
                    st !== 'selected' &&
                    !hiredIds.has(String(b?.creator_id ?? ''))
                  );
                });
                if (!open.length) return null;
                return (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Creator Bids ({open.length})</Text>
                    {open.map((b: any, i: number) => {
                      const cid = String(b.creator_id ?? '');
                      const who = text(b.creator_name || b.creator_nickname, 'Creator');
                      const busy = bidBusy === cid;
                      return (
                        <View key={cid || i} style={styles.bidRow}>
                          <View style={styles.bidTop}>
                            <Text style={styles.bidName} numberOfLines={1}>{who}</Text>
                            <Text style={styles.bidAmount}>{rupees(b.amount || b.price)}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.ghostBtn}
                            onPress={() => onNavigate(`/creator/${encodeURIComponent(cid)}`)}
                            disabled={!cid}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${who}'s profile`}
                          >
                            <Text style={styles.bidDeclineText}>View creator profile</Text>
                          </TouchableOpacity>
                          {!!text(b.proposal || b.message) && (
                            <Text style={styles.bidProposal} numberOfLines={3}>
                              {text(b.proposal || b.message)}
                            </Text>
                          )}
                          {bidDays(b) != null && (
                            <Text style={styles.bidMeta}>Delivery in {bidDays(b)} days</Text>
                          )}
                          {b.raw_amount != null && (
                            <Text style={styles.bidMeta}>
                              Raw {rupees(b.raw_amount)} + Edited {rupees(b.edited_amount)}
                            </Text>
                          )}
                          <View style={styles.bidActions}>
                            <TouchableOpacity
                              style={[styles.bidBtn, styles.bidDecline]}
                              onPress={() => handleDeclineBid(cid, who)}
                              disabled={busy || finishingHiring || !cid}
                              accessibilityRole="button"
                            >
                              <Text style={styles.bidDeclineText}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.bidBtn, styles.bidAccept]}
                              onPress={() => handleAcceptBid(cid, who)}
                              disabled={busy || finishingHiring || !cid}
                              accessibilityRole="button"
                            >
                              {busy ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.bidAcceptText}>Accept &amp; Hire</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              <View style={styles.card}>
                {/* Tapping the row (or the arrow) folds the stage rail away, so
                  the creator and deliverables cards come up without a scroll. */}
                <TouchableOpacity
                  style={styles.cardHead}
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    setProgressOpen(open => !open);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: progressOpen }}
                  accessibilityLabel={
                    progressOpen
                      ? 'Collapse campaign progress'
                      : 'Expand campaign progress'
                  }
                >
                  <Text style={[styles.cardTitle, styles.cardHeadTitle]}>
                    Campaign Progress{hiredList.length > 1 && activeName ? ` - ${activeName}` : ''}
                  </Text>
                  <View style={styles.cardHeadRight}>
                    {!progressOpen && (
                      <Text style={styles.cardHeadHint}>
                        {STAGES[current]?.label || 'Completed'}
                      </Text>
                    )}
                    <View style={styles.cardChevron}>
                      <Icon
                        name={progressOpen ? 'chevron-up' : 'chevron-down'}
                        color="#4C5BF3"
                        size={18}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
                {progressOpen &&
                  STAGES.map((stage, index) => {
                    const done = index < current;
                    const active = index === current;
                    return (
                      <View key={stage.key} style={styles.stageRow}>
                        <View style={styles.stageRail}>
                          <View
                            style={[
                              styles.stageDot,
                              done && styles.stageDotDone,
                              active && styles.stageDotActive,
                            ]}
                          >
                            {done && (
                              <Icon name="check" color="#FFFFFF" size={11} />
                            )}
                          </View>
                          {index < STAGES.length - 1 && (
                            <View
                              style={[
                                styles.stageLine,
                                done && styles.stageLineDone,
                              ]}
                            />
                          )}
                        </View>
                        <View style={styles.stageCopy}>
                          <Text
                            style={[
                              styles.stageLabel,
                              (done || active) && styles.stageLabelOn,
                            ]}
                          >
                            {stage.label}
                          </Text>
                          {active && (
                            <Text style={styles.stageNote}>In progress</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
              </View>

              {!!creatorName && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Creator</Text>
                  <View style={styles.creatorRow}>
                    {creatorAvatar ? (
                      <Image
                        source={{ uri: creatorAvatar }}
                        style={styles.creatorAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.creatorAvatar,
                          styles.creatorAvatarFallback,
                        ]}
                      >
                        <Text style={styles.creatorAvatarText}>
                          {creatorName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.creatorCopy}>
                      <Text style={styles.creatorName}>{creatorName}</Text>
                      <Text style={styles.creatorMeta}>
                        {text(
                          campaign.creator_category ||
                            campaign.creator_primary_category ||
                            campaign.product_category,
                          'Creator',
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Full details: two rows of three facts, as in the design. */}
                  <View style={styles.factGrid}>
                    <CreatorFact
                      icon="instagram"
                      label="Platform"
                      value={text(campaign.creator_platform, 'Instagram')}
                    />
                    <CreatorFact
                      icon="pin"
                      label="Location"
                      value={text(
                        campaign.creator_location || campaign.creator_city,
                        '-',
                      )}
                    />
                    <CreatorFact
                      icon="globe"
                      label="Language"
                      value={text(campaign.creator_language, '-')}
                    />
                    <CreatorFact
                      icon="clapper"
                      label="Content Type"
                      value={text(
                        campaign.creator_content_type || campaign.video_format,
                        '-',
                      )}
                    />
                    <CreatorFact
                      icon="badge"
                      label="Level"
                      value={text(
                        campaign.creator_level || campaign.creator_level_label,
                        '-',
                      )}
                    />
                    <CreatorFact
                      icon="rupee"
                      label="Starting Rate"
                      value={
                        campaign.creator_starting_rate
                          ? rupees(campaign.creator_starting_rate)
                          : '-'
                      }
                    />
                  </View>

                  <View style={styles.creatorActions}>
                    <TouchableOpacity
                      style={styles.ghostBtn}
                      onPress={() =>
                        onNavigate(
                          campaign.selected_creator
                            ? `/creator/${campaign.selected_creator}`
                            : '/dashboard/business/browse-creator',
                        )
                      }
                      accessibilityRole="button"
                    >
                      <Icon name="person" color="#5C6180" size={14} />
                      <Text style={styles.ghostText}>View Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.solidBtn}
                      onPress={() =>
                        campaign.selected_creator && onOpenThread
                          ? onOpenThread(
                              String(campaign.selected_creator),
                              creatorName,
                            )
                          : onNavigate('/messages')
                      }
                      accessibilityRole="button"
                    >
                      <Icon name="chat" color="#FFFFFF" size={14} />
                      <Text style={styles.solidText}>Chat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Ship Product — only for a physical brief with a creator hired.
                  Opens the native shipment screen (pickup address + Delhivery
                  label), so the brand can ship straight from the app. */}
              {hiredList.length > 1 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    Hired creators ({hiredList.length})
                  </Text>
                  {hiredList.map(c => (
                    <View
                      key={c.id}
                      style={[styles.hiredCreator, c.id === activeId && styles.hiredCreatorOn]}
                    >
                      <Text style={styles.hiredCreatorName}>
                        {c.name}
                      </Text>
                      <View style={styles.hiredCreatorActions}>
                        <TouchableOpacity
                          style={styles.ghostBtn}
                          onPress={() => onNavigate(`/creator/${c.id}`)}
                          accessibilityRole="button"
                        >
                          <Icon name="person" color="#5C6180" size={14} />
                          <Text style={styles.ghostText}>Profile</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.ghostBtn}
                          onPress={() =>
                            onOpenThread
                              ? onOpenThread(c.id, c.name)
                              : onNavigate('/messages')
                          }
                          accessibilityRole="button"
                        >
                          <Icon name="chat" color="#5C6180" size={14} />
                          <Text style={styles.ghostText}>Chat</Text>
                        </TouchableOpacity>
                        {needsShipping && (
                          <TouchableOpacity
                            style={styles.solidBtn}
                            onPress={() =>
                              onNavigate(
                                `/shipment/${campaignId}?creator=${encodeURIComponent(c.id)}`,
                              )
                            }
                            accessibilityRole="button"
                          >
                            <Text style={styles.solidText}>📦 Ship</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                !!creatorName &&
                needsShipping && (
                  <TouchableOpacity
                    style={styles.shipBtn}
                    onPress={() => onNavigate(`/shipment/${campaignId}`)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.shipBtnText}>📦  Ship Product</Text>
                  </TouchableOpacity>
                )
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Deliverables</Text>
                {(Array.isArray(campaign.deliverable_items)
                  ? campaign.deliverable_items
                  : []
                ).map((item: Record<string, any>, index: number) => (
                  <View key={index} style={styles.deliverableRow}>
                    <Icon name="check" color="#1FA971" size={15} />
                    <Text style={styles.deliverableText}>
                      {Number(item.quantity) || 1} × {text(item.type, 'Video')}
                      {item.duration ? ` (${item.duration})` : ''}
                      {Array.isArray(item.aspect_ratios) &&
                      item.aspect_ratios.length
                        ? ` · ${item.aspect_ratios.join(', ')}`
                        : ''}
                    </Text>
                  </View>
                ))}
                {!campaign.deliverable_items?.length && (
                  <Text style={styles.detailValue}>
                    {text(campaign.video_format, 'Not specified')}
                  </Text>
                )}
              </View>
            </>
          )}

          {tab === 1 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Campaign Details</Text>
              <Row label="Campaign" value={text(campaign.title)} />
              <Row label="Category" value={text(campaign.product_category)} />
              <Row label="Product" value={text(campaign.product_name)} />
              <Row
                label="Product description"
                value={text(campaign.product_description)}
              />
              <Row label="Hook" value={text(campaign.campaign_hook)} />
              <Row label="Key message" value={text(campaign.key_message)} />
              <Row
                label="Things to avoid"
                value={text(campaign.what_not_to_do)}
              />
              <Row label="Brief" value={text(campaign.brief_text)} />
              <Row label="Video format" value={text(campaign.video_format)} />
              <Row label="Aspect ratio" value={text(campaign.aspect_ratio)} />
              <Row
                label="Duration"
                value={
                  campaign.duration_seconds
                    ? `${campaign.duration_seconds}s`
                    : ''
                }
              />
              <Row label="Creator level" value={text(campaign.creator_level)} />
              <Row
                label="Revisions"
                value={
                  campaign.free_revisions != null
                    ? String(campaign.free_revisions)
                    : ''
                }
              />

              {/* Duplicate: opens the post-brief wizard prefilled from this
                  campaign as a fresh draft to edit and republish. */}
              <TouchableOpacity
                style={styles.dupBtn}
                onPress={() =>
                  onNavigate(
                    `/dashboard/business/post-brief?from=${encodeURIComponent(campaignId)}`,
                  )
                }
                accessibilityRole="button"
              >
                <Icon name="copy" color="#4C4DD6" size={15} />
                <Text style={styles.dupBtnText}>Duplicate this campaign</Text>
              </TouchableOpacity>
            </View>
          )}

          {tab === 2 && (
            <>
              {creatorTabs}
              {!workShown.length ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No submissions yet</Text>
                  <Text style={styles.emptyText}>
                    {hiredList.length > 1 && activeName
                      ? `Once ${activeName} submits their content, it will appear here for you to review and approve.`
                      : 'Work from the creator appears here once submitted.'}
                  </Text>
                </View>
              ) : (
                workShown.map(item => {
                  const videoSrc = photoUrl(
                    item.preview_url ||
                      (Array.isArray(item.work_files)
                        ? item.work_files[0]
                        : undefined) ||
                      item.video_url,
                  );
                  const wsStatus = workStatusOf(item, campaign);
                  const approved = wsStatus === 'approved';
                  const revisionRequested = wsStatus === 'revision_requested';
                  // With editors (or the creator cutting the edit): nothing to decide yet.
                  const waitingOnEdit =
                    wsStatus === 'awaiting_edit' || wsStatus === 'awaiting_edited';
                  // Before approval the brand only sees a watermark-protected
                  // preview; approval clears the flag and releases the clean file.
                  const showMark =
                    item.status !== 'approved' && item.watermark_protected !== false;
                  const isPlaying = playingWork === item.id;
                  const creatorKey = String(item.creator_id ?? '');
                  const itemDeal = findCreatorDeal(deals, campaignId, creatorKey);
                  const itemDone =
                    approved &&
                    (dealStateIndex(itemDeal?.current_state) >= 6 ||
                      campaign.status === 'completed' ||
                      !itemDeal);
                  const rated = myReviews[creatorKey];
                  return (
                    <View key={item.id} style={styles.workCard}>
                      <TouchableOpacity
                        style={styles.workMedia}
                        activeOpacity={0.9}
                        onPress={() =>
                          setPlayingWork(isPlaying ? null : item.id)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                      >
                        {videoSrc ? (
                          <Video
                            source={{ uri: videoSrc }}
                            style={styles.workMediaImg}
                            paused={!isPlaying}
                            resizeMode="cover"
                            repeat
                          />
                        ) : (
                          <View style={styles.workMediaFallback} />
                        )}
                        {showMark && (
                          <View style={styles.workMark} pointerEvents="none">
                            <Text style={styles.workMarkText}>
                              UGCad · SAMPLE
                            </Text>
                          </View>
                        )}
                        {!isPlaying && (
                          <View style={styles.playBtn}>
                            <Icon name="play" color="#15163F" size={18} />
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.reviewBtn}
                        onPress={() => {
                          setPlayingWork(null);
                          if (videoSrc) {
                            setPreview({
                              uri: videoSrc,
                              watermark: showMark,
                              title: text(campaign.title) || undefined,
                            });
                          }
                        }}
                        disabled={!videoSrc} accessibilityRole="button" accessibilityLabel="Open full-screen video">
                        <Text style={styles.reviewText}>View full video</Text>
                      </TouchableOpacity>
                      <View style={styles.workBody}>
                        <Text style={styles.workTitle}>
                          {text(item.creator_name, 'Creator')}
                          {Number(item.version) > 1 ? `  ·  Revision v${item.version}` : ''}
                        </Text>
                        <Text style={styles.workMeta}>
                          Submitted{' '}
                          {formatDate(item.submitted_at || item.created_at)} ·{' '}
                          {item.historical
                            ? 'Previous upload'
                            : WORK_STATUS_LABEL[wsStatus] ||
                              text(wsStatus, 'submitted').replace(/_/g, ' ')}
                        </Text>
                        {revisionRequested && (
                          <Text style={styles.workHistory}>
                            Revision requested - awaiting the creator's revised video.
                            This upload stays available for comparison.
                          </Text>
                        )}
                        {waitingOnEdit && (
                          <Text style={styles.workHistory}>
                            {wsStatus === 'awaiting_edit'
                              ? "UGC.ad's editors are working on this video. You can review it once the edited cut is ready."
                              : 'You approved the raw video. The creator is editing it and will submit the edited cut next.'}
                          </Text>
                        )}
                        {approved ? (
                          <TouchableOpacity
                            style={styles.workDownload}
                            onPress={() => {
                              const unavailable = () =>
                                Alert.alert(
                                  'Could not open',
                                  'The download link is unavailable.',
                                );
                              const url = downloadUrlOf(item);
                              if (!url) return unavailable();
                              Linking.openURL(url).catch(unavailable);
                            }}
                            accessibilityRole="button"
                          >
                            <Icon name="download" color="#FFFFFF" size={15} />
                            <Text style={styles.workDownloadText}>
                              Download video
                            </Text>
                          </TouchableOpacity>
                        ) : !revisionRequested && !waitingOnEdit && !item.historical ? (
                          <View style={styles.workActions}>
                            <TouchableOpacity
                              style={[
                                styles.workApprove,
                                styles.workAction,
                                approving === item.id && styles.workApproveOff,
                              ]}
                              disabled={approving === item.id}
                              onPress={() => confirmApprove(item)}
                              accessibilityRole="button"
                            >
                              {approving === item.id ? (
                                <ActivityIndicator
                                  color="#FFFFFF"
                                  size="small"
                                />
                              ) : (
                                <Text style={styles.workApproveText}>
                                  {approveLabel({ ...item, edit_mode: editModeOf(campaign) })}
                                </Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.reviewBtn, styles.workAction]}
                              disabled={approving === item.id}
                              onPress={() => setRevising(item)}
                              accessibilityRole="button"
                            >
                              <Text style={styles.reviewText}>
                                Request Revision
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                        {/* Once the deal is complete the brand can rate the creator. */}
                        {!item.historical && itemDone && !!creatorKey && (
                          rated ? (
                            <Text style={styles.ratedNote}>You rated {rated} star{rated === 1 ? '' : 's'}</Text>
                          ) : (
                            <TouchableOpacity
                              style={styles.reviewBtn}
                              onPress={() =>
                                setRateFor({
                                  id: creatorKey,
                                  name: text(item.creator_name, 'this creator'),
                                })
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Add a review"
                            >
                              <Text style={styles.reviewText}>Add a review</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    </View>
                  );
                })
              )}

              {/* Deal chat: the thread the creator writes to in My Deals, with the
                  platform's own status lines. */}
              {!!activeDeal?.deal_id && (() => {
                const messages: Record<string, any>[] = Array.isArray(
                  activeDeal.chat_summary?.messages,
                )
                  ? activeDeal.chat_summary.messages.slice(-12)
                  : [];
                return (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Deal chat</Text>
                    <Text style={styles.bidMeta}>
                      Shared with the creator. Status updates from the platform appear here too.
                    </Text>
                    {messages.length ? (
                      messages.map((m, i) => (
                        <View
                          key={String(m.id ?? i)}
                          style={[
                            styles.chatMsg,
                            m.sender_type === 'system' && styles.chatMsgSystem,
                            m.sender_type === 'creator' && styles.chatMsgCreator,
                          ]}
                        >
                          {m.sender_type !== 'system' && (
                            <Text style={styles.chatName}>{text(m.sender_name, 'Member')}</Text>
                          )}
                          <Text style={styles.chatBody}>{String(m.message || '')}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.bidProposal}>
                        No messages yet. Say hello, or answer the creator's questions about the brief.
                      </Text>
                    )}
                    <TextInput
                      style={styles.chatInput}
                      value={chatText}
                      onChangeText={setChatText}
                      placeholder="Type a message..."
                      placeholderTextColor="#9498B0"
                      multiline
                      editable={!chatBusy}
                    />
                    <TouchableOpacity
                      style={[styles.bidBtn, styles.bidAccept, styles.fullBtn, (!chatText.trim() || chatBusy) && styles.btnOff]}
                      onPress={() => sendChat(String(activeDeal.deal_id))}
                      disabled={!chatText.trim() || chatBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Send message"
                    >
                      {chatBusy ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.bidAcceptText}>Send</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <ReviewPlayer
        uri={preview ? preview.uri : null}
        watermark={!!preview?.watermark}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />

      {/* Rate the creator once the deal is complete (also offered right after the
          approval that paid them). */}
      <RateCreatorSheet
        visible={!!rateFor}
        creatorName={rateFor?.name || 'this creator'}
        onSubmit={submitReview}
        onClose={() => setRateFor(null)}
      />

      <Modal
        visible={!!revising}
        animationType="slide"
        onRequestClose={() => setRevising(null)}
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
      >
        {!!revising && (
          <WorkRevisionRequest
            token={token}
            work={revising}
            onClose={() => setRevising(null)}
            onDone={() => {
              setRevising(null);
              load();
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy, like the brand tab screens: the sheet's rounded top corners are
  // transparent, so this is what shows through the curve under the header.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  topBar: { backgroundColor: '#0E1330' },
  // Content sheet: curves over the navy header strip like the other tabs.
  sheet: {
    flex: 1,
    backgroundColor: '#F7F7FD',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
    paddingTop: scale(14),
  },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Transparent so the navy backdrop shows through.
    backgroundColor: 'transparent',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Spans the whole bar so the title centres on the screen, not on the gap
  // between the back arrow and the status chip.
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: scale(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statusChip: {
    maxWidth: '38%',
    flexShrink: 0,
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
    borderRadius: scale(8),
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statusText: {
    fontSize: fontScale(11),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },

  summaryStrip: {
    marginHorizontal: scale(16),
    marginBottom: scale(12),
    paddingVertical: scale(10),
    paddingHorizontal: scale(8),
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    paddingHorizontal: scale(6),
  },
  summaryIcon: {
    width: scale(26),
    height: scale(26),
    borderRadius: scale(8),
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryDivider: { width: 1, height: scale(30), backgroundColor: '#EDEEF6' },
  summaryLabel: {
    fontSize: fontScale(11),
    color: '#9498B0',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  summaryValue: {
    marginTop: scale(2),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#EDEEF6',
  },
  tab: { flex: 1, minHeight: 44, paddingVertical: scale(8), alignItems: 'center', justifyContent: 'center' },
  tabText: {
    textAlign: 'center',
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#9498B0',
  },
  tabTextActive: { color: '#4C5BF3' },
  tabUnderline: {
    position: 'absolute',
    bottom: scale(-1),
    height: scale(2),
    width: '70%',
    backgroundColor: '#4C5BF3',
    borderRadius: scale(1),
  },

  flexFill: { flex: 1 },
  loading: { marginTop: scale(40) },
  // Clear the floating bottom nav + FAB, or the last card scrolls under them.
  // Capped and centred so a tablet gets a column, not a stretched phone.
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: scale(16),
    paddingBottom: scale(30) + NAV_CLEARANCE,
  },
  // Skeletons render outside the ScrollView, so they need their own padding.
  loadingContent: { padding: scale(16), gap: scale(12) },

  card: {
    marginBottom: scale(12),
    padding: scale(14),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  scriptCard: {
    marginBottom: scale(12),
    padding: scale(16),
    borderRadius: scale(14),
    backgroundColor: '#FFFDF4',
    borderWidth: 1,
    borderColor: '#E7D9A0',
  },
  draftCard: {
    marginBottom: scale(12),
    padding: scale(16),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  draftTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  draftSub: {
    marginTop: scale(4),
    fontSize: fontScale(14),
    lineHeight: fontScale(18),
    color: '#5C6079',
  },
  publishBtn: {
    marginTop: scale(12),
    minHeight: 48,
    borderRadius: scale(12),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scriptTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#1F2340',
    marginBottom: scale(6),
  },
  scriptSub: {
    fontSize: fontScale(14),
    color: '#6B6236',
    lineHeight: fontScale(18),
    marginBottom: scale(12),
  },
  scriptBox: {
    maxHeight: scale(200),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEE4BD',
    borderRadius: scale(10),
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
  },
  scriptText: { fontSize: fontScale(14), color: '#2A2E4A', lineHeight: fontScale(20) },
  scriptInput: {
    marginTop: scale(12),
    minHeight: scale(72),
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: scale(10),
    padding: scale(10),
    // 16 keeps iOS from zooming the screen when the field gets focus.
    fontSize: 16,
    color: '#15163F',
    textAlignVertical: 'top',
  },
  scriptActions: { gap: scale(10), marginTop: scale(12) },
  scriptBtn: {
    minHeight: 46,
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  scriptBtnPrimary: { backgroundColor: '#15163F' },
  scriptBtnPrimaryText: {
    textAlign: 'center',
    lineHeight: fontScale(18),
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scriptBtnGhost: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E7D9A0' },
  scriptBtnGhostText: {
    textAlign: 'center',
    lineHeight: fontScale(18),
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#8A7A2E',
  },
  bidRow: {
    paddingTop: scale(12),
    marginTop: scale(10),
    borderTopWidth: 1,
    borderTopColor: '#F0F1F8',
  },
  bidTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scale(8) },
  bidName: {
    flex: 1,
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  bidAmount: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C4DD6',
  },
  bidProposal: { marginTop: scale(5), fontSize: fontScale(14), lineHeight: fontScale(18), color: '#5C6079' },
  bidMeta: { marginTop: scale(4), fontSize: fontScale(13), color: '#9498B0' },
  bidActions: { flexDirection: 'row', gap: scale(10), marginTop: scale(10) },
  bidBtn: { flex: 1, minHeight: 44, paddingVertical: scale(6), borderRadius: scale(11), alignItems: 'center', justifyContent: 'center' },
  bidDecline: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E4E5F2' },
  bidDeclineText: { textAlign: 'center', paddingHorizontal: scale(4), fontSize: fontScale(13), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#6E7391' },
  bidAccept: { backgroundColor: '#15163F' },
  bidAcceptText: { textAlign: 'center', paddingHorizontal: scale(4), fontSize: fontScale(13), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#FFFFFF' },
  shipBtn: {
    minHeight: 50,
    borderRadius: scale(14),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(12),
  },
  dupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    minHeight: 46,
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderColor: '#DCDDF6',
    marginTop: scale(14),
  },
  dupBtnText: {
    fontSize: fontScale(13.5),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#4C4DD6',
  },
  shipBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    marginBottom: scale(12),
  },

  stageRow: { flexDirection: 'row' },
  stageRail: { width: scale(24), alignItems: 'center' },
  stageDot: {
    width: scale(18),
    height: scale(18),
    borderRadius: scale(9),
    borderWidth: 2,
    borderColor: '#DDDFEC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotDone: { backgroundColor: '#1FA971', borderColor: '#1FA971' },
  stageDotActive: { borderColor: '#4C5BF3', borderWidth: 3 },
  stageLine: { width: scale(2), flex: 1, minHeight: scale(22), backgroundColor: '#E4E5F0' },
  stageLineDone: { backgroundColor: '#1FA971' },
  stageCopy: { flex: 1, paddingBottom: scale(16), paddingLeft: scale(10) },
  stageLabel: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#9498B0',
  },
  stageLabelOn: {
    color: '#15163F',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  stageNote: { marginTop: scale(2), fontSize: fontScale(12), color: '#4C5BF3' },

  // Collapse row on the Campaign Progress card.
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The title already carries its own bottom margin for the open state.
  cardHeadTitle: { flex: 1, marginBottom: 0 },
  cardHeadRight: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  // Current stage, shown only while the rail is folded away.
  cardHeadHint: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  cardChevron: {
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Creator card's 3-column fact grid: two rows of three, divider above.
  factGrid: {
    marginTop: scale(13),
    paddingTop: scale(13),
    borderTopWidth: 1,
    borderTopColor: '#EDEEF6',
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: scale(14),
  },
  factCell: {
    width: '33.33%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    paddingRight: scale(6),
  },
  factIcon: {
    width: scale(27),
    height: scale(27),
    borderRadius: scale(8),
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  factCopy: { flex: 1, minWidth: 0 },
  factLabel: {
    fontSize: fontScale(11),
    color: '#9498B0',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  factValue: {
    marginTop: scale(2),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  // Shared by the photo and the initial fallback so both crop to the circle.
  creatorAvatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: '#EDEEF6',
  },
  // Only the initial fallback needs to centre its letter.
  creatorAvatarFallback: {
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorAvatarText: {
    fontSize: fontScale(17),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  creatorCopy: { flex: 1, marginLeft: scale(12) },
  creatorName: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  creatorMeta: { marginTop: scale(2), fontSize: fontScale(13), color: '#777B96' },
  creatorActions: { marginTop: scale(13), flexDirection: 'row', gap: scale(9) },
  ghostBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  ghostText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  solidBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: scale(11),
    backgroundColor: '#1B2A6B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  solidText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  hiredCreator: {
    paddingVertical: scale(10),
    gap: scale(8),
  },
  hiredCreatorOn: {
    backgroundColor: '#F3F4FF',
    borderRadius: scale(10),
    paddingHorizontal: scale(8),
  },
  creatorTabs: { flexGrow: 0, flexShrink: 0, marginBottom: scale(10) },
  creatorTabsInner: { gap: scale(8) },
  creatorTab: {
    minHeight: 44,
    maxWidth: scale(180),
    paddingHorizontal: scale(14),
    borderRadius: scale(22),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E4F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorTabOn: { backgroundColor: '#15163F', borderColor: '#15163F' },
  creatorTabText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  creatorTabTextOn: { color: '#FFFFFF' },
  retryBtn: {
    marginTop: scale(14),
    minHeight: 44,
    paddingHorizontal: scale(26),
    borderRadius: scale(12),
    backgroundColor: '#15163F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorBanner: {
    marginBottom: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  errorBannerText: { flex: 1, fontSize: fontScale(14), color: '#B3261E' },
  errorBannerBtn: {
    minHeight: 44,
    minWidth: scale(60),
    paddingHorizontal: scale(12),
    borderRadius: scale(10),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBannerBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#B3261E',
  },
  changeList: { marginTop: scale(10), gap: scale(6) },
  changeHead: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#9498B0',
  },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(8) },
  changeSev: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#B26B00',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
    borderRadius: scale(6),
    overflow: 'hidden',
  },
  changeText: { flex: 1, fontSize: fontScale(14), lineHeight: fontScale(18), color: '#25274C' },
  bookingAsk: {
    marginTop: scale(4),
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  fullBtn: { flex: 0, alignSelf: 'stretch', marginTop: scale(12) },
  btnOff: { opacity: 0.45 },
  dismissed: { opacity: 0.5 },
  invitedTag: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#1F8A4C',
    backgroundColor: '#EEFAF1',
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    overflow: 'hidden',
  },
  linkBtn: { marginTop: scale(12), minHeight: 44, justifyContent: 'center' },
  linkBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  ratedNote: { marginTop: scale(11), fontSize: fontScale(14), color: '#B26B00' },
  chatMsg: {
    marginTop: scale(8),
    padding: scale(10),
    borderRadius: scale(10),
    backgroundColor: '#F4F5FA',
  },
  chatMsgSystem: { backgroundColor: '#FFF8E6' },
  chatMsgCreator: { backgroundColor: '#EEF0FF' },
  chatName: { fontSize: fontScale(12), color: '#777B96', marginBottom: scale(2) },
  chatBody: { fontSize: fontScale(14), lineHeight: fontScale(18), color: '#25274C' },
  chatInput: {
    marginTop: scale(12),
    minHeight: 44,
    maxHeight: scale(110),
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: scale(10),
    padding: scale(10),
    fontSize: 16,
    color: '#15163F',
    textAlignVertical: 'top',
  },
  hiredCreatorName: {
    flexShrink: 1,
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
    color: '#15163F',
  },
  hiredCreatorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(8),
  },
  deliverableText: { flex: 1, fontSize: fontScale(14), color: '#3B3F5C' },

  // Each point gets clear separation: a hairline divider + generous gap, so the
  // About tab reads as a list rather than a compact wall of text.
  detailRow: {
    paddingVertical: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F8',
  },
  detailLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#9498B0',
  },
  detailValue: {
    marginTop: scale(5),
    fontSize: fontScale(14),
    lineHeight: fontScale(20),
    color: '#25274C',
  },

  workCard: {
    marginBottom: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
    overflow: 'hidden',
  },
  workMedia: {
    height: scale(150),
    backgroundColor: '#EFEFF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workMediaImg: { width: '100%', height: '100%' },
  workMediaFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E7E8F2',
  },
  playBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workBody: { padding: scale(13) },
  workTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  workMeta: {
    marginTop: scale(3),
    fontSize: fontScale(13),
    color: '#777B96',
    textTransform: 'capitalize',
  },
  reviewBtn: {
    marginTop: scale(11),
    minHeight: 44,
    borderRadius: scale(11),
    backgroundColor: '#F4F5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: {
    textAlign: 'center',
    paddingHorizontal: scale(6),
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
  },
  workActions: { marginTop: scale(11), gap: scale(9), flexDirection: 'row' },
  workAction: { flex: 1, marginTop: 0, minHeight: 44 },
  workApprove: {
    minHeight: 44,
    borderRadius: scale(11),
    backgroundColor: '#22A565',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workApproveOff: { backgroundColor: '#6FBF8E' },
  workApproveText: {
    textAlign: 'center',
    paddingHorizontal: scale(6),
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  workMark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-20deg' }],
  },
  workMarkText: {
    color: 'rgba(255,255,255,0.22)',
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    letterSpacing: 1,
  },
  workHistory: {
    marginTop: scale(8),
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#B26B00',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: scale(10),
    paddingVertical: scale(7),
    borderRadius: scale(9),
    overflow: 'hidden',
  },
  workDownload: {
    marginTop: scale(11),
    minHeight: 44,
    borderRadius: scale(11),
    backgroundColor: '#4C5BF3',
    flexDirection: 'row',
    gap: scale(7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  workDownloadText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  empty: { marginTop: scale(30), padding: scale(22), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(14),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandCampaignDetail;
