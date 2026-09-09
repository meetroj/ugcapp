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
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';
import { BACKEND_URL, submitWork, uploadMedia } from '../api';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

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
};

type Tab = 'Overview' | 'Brief' | 'Deliverables' | 'Timeline' | 'Payments';

const TABS: Tab[] = [
  'Overview',
  'Brief',
  'Deliverables',
  'Timeline',
  'Payments',
];

/**
 * The rail in the design. compute_deal_state() on the backend returns a
 * sentence, not an index, so each state is mapped onto one of these steps.
 */
const STEPS = [
  'Accepted',
  'In Progress',
  'Submitted',
  'In Review',
  'Approved',
  'Paid',
];

const STEP_HINTS = [
  'Deal accepted',
  'Working on it',
  'Waiting for you',
  'Waiting for review',
  'Waiting for approval',
  'Waiting for payout',
];

/** Maps a backend state sentence to its index on the rail above. */
function stepIndexFor(state: string): number {
  const value = String(state || '').toLowerCase();
  if (value.includes('paid')) return 5;
  if (value.includes('approved')) return 4;
  if (value.includes('submitted') || value.includes('awaiting review'))
    return 3;
  if (value.includes('revision')) return 2;
  if (value.includes('content in progress')) return 1;
  return 0;
}

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
  if (!date) return '—';
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
  deal,
  token,
  onBack,
  onChat,
  onSubmitWork,
  unread = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Overview');
  const [submitting, setSubmitting] = useState(false);

  const campaign = deal.campaign || {};
  const brand = deal.brand || {};
  const creator = deal.creator || {};
  const escrow = deal.escrow || {};
  const submission = deal.content_submission || {};
  const revisions = deal.revision_tracker || {};

  const state = String(deal.current_state || '');
  const step = stepIndexFor(state);
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
  const totalAssets = Math.max(
    1,
    Array.isArray(submission.required_assets)
      ? submission.required_assets.length
      : 1,
  );
  const progressPct = Math.round((doneCount / totalAssets) * 100);

  const budget = escrow.held_amount ?? campaign.budget_max ?? campaign.budget;

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

  // Does this brief owe a finished cut on top of the raw footage? Any ONE deliverable
  // row asking for it is enough. A brief saved before the field existed reads false,
  // so its submit flow is the single-file one it has always been.
  const needsEdited =
    Array.isArray(campaign.deliverable_items) &&
    campaign.deliverable_items.some((d: any) => d && d.edited_required);

  const campaignId = String(campaign.id || deal.campaign_id || '');

  /**
   * The built-in submit flow: pick a video, push it through the generic
   * uploader, then POST /api/work/submit against this deal's campaign. A
   * parent-supplied onSubmitWork still wins so a future dedicated screen can
   * replace this without touching the button.
   */
  /** Pick one file and push it through the generic uploader. Null when the picker
   *  was dismissed, which is a cancel and not an error. */
  const pickAndUpload = async (): Promise<string | null> => {
    const picked = await launchImageLibrary({
      mediaType: 'mixed',
      selectionLimit: 1,
    });
    const asset = picked.assets?.[0];
    if (!asset?.uri) {
    // Only now is there something to upload, so this is where the busy state starts.
      return null;
    }
    setSubmitting(true);
    const url = await uploadMedia(
      token as string,
      { uri: asset.uri, fileName: asset.fileName, type: asset.type },
      'file',
    );
    if (!url) {
      throw new Error('The upload did not return a file URL.');
    }
    return url;
  };

  /** Says which file to pick next, so the two-file flow cannot be picked blind.
   *  Resolves false when the creator backs out. */
  const confirmStep = (title: string, message: string) =>
    new Promise<boolean>(resolve => {
      Alert.alert(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Choose file', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });

  const handleSubmitWork = async () => {
    if (onSubmitWork) {
      onSubmitWork();
      return;
    }
    if (!token || !campaignId) {
      return;
    }
    try {
      if (needsEdited) {
        // Two files, picked one at a time - the mobile equivalent of the web's two
        // upload zones. Bail out silently on cancel at any step; nothing is submitted
        // until BOTH files are in hand, so a half-finished flow leaves no trace.
        if (
          !(await confirmStep(
            'Edited file',
            'This brief asks for a finished cut as well as the raw footage. Pick the EDITED file first.',
          ))
        ) {
          return;
        }
        const edited = await pickAndUpload();
        if (!edited) {
          return;
        }
        if (
          !(await confirmStep(
            'Raw file',
            'Now pick the RAW footage the cut was made from.',
          ))
        ) {
          return;
        }
        const raw = await pickAndUpload();
        if (!raw) {
          return;
        }
        await submitWork(token, campaignId, {
          // Edited first: work_files[0] is the primary video the backend watermarks
          // and the brand's review screen plays, so the raw footage must not lead.
          work_files: [edited, raw],
          edited_files: [edited],
          raw_files: [raw],
        });
      } else {
        const url = await pickAndUpload();
        if (!url) {
          return;
        }
        await submitWork(token, campaignId, { work_files: [url] });
      }
      Alert.alert(
        'Work submitted',
        'Your work was sent to the brand for review. It appears under Deliverables once the deal refreshes.',
      );
    } catch (error) {
      Alert.alert(
        'Could not submit',
        error instanceof Error && error.message
          ? error.message
          : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // The submit button only renders when tapping it can actually do something.
  const canSubmitWork = !!onSubmitWork || (!!token && !!campaignId);

  return (
    <View style={styles.screen}>
      {/* --- dark header --- */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
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

      <ScrollView
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
              <Text style={styles.brandName}>{brand.name || 'Brand'}</Text>
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
                {brand.name || '—'}
              </Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Creator</Text>
              <Text style={styles.factValue} numberOfLines={1}>
                {creator.name || '—'}
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
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railScroll}
          >
            {STEPS.map((label, index) => {
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
                    {index < STEPS.length - 1 && (
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
                  <Text style={styles.railHint}>{STEP_HINTS[index]}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

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
          </View>
        )}

        {/* ---------------- BRIEF ---------------- */}
        {tab === 'Brief' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Campaign Brief</Text>

            <Text style={styles.groupTitle}>Campaign Basics</Text>
            <KeyValue label="Campaign" value={campaign.title || '—'} />
            <KeyValue label="Brand" value={brand.name || '—'} />
            <KeyValue label="Category" value={campaign.category || '—'} />
            <KeyValue label="Product" value={campaign.product_name || '—'} />
            <KeyValue
              label="Product Description"
              value={campaign.product_description || '—'}
            />
            <KeyValue label="Campaign Hook" value={campaign.hook || '—'} />
            <KeyValue label="Key Message" value={campaign.key_message || '—'} />
            <KeyValue
              label="Objectives"
              value={
                Array.isArray(campaign.objectives)
                  ? campaign.objectives.join(', ')
                  : campaign.objectives || '—'
              }
            />
            <KeyValue
              label="Target Audience"
              value={campaign.target_audience || '—'}
            />

            {Array.isArray(deal.brief_sections) &&
              deal.brief_sections.map((section: any) => (
                <View key={section.title} style={styles.briefSection}>
                  <Text style={styles.groupTitle}>{section.title}</Text>
                  <Text style={styles.bodyText}>{section.content}</Text>
                </View>
              ))}
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
                  Nothing submitted yet. Use the button below to upload your
                  work.
                </Text>
              </View>
            ) : (
              versions.map((version, index) => (
                <View key={version.version ?? index} style={styles.card}>
                  <View style={styles.deliverHead}>
                    <View style={styles.deliverNum}>
                      <Text style={styles.deliverNumText}>
                        {version.version ?? index + 1}
                      </Text>
                    </View>
                    <Text style={styles.deliverTitle}>
                      {String(
                        version.title || version.asset_type || 'Final Video',
                      )}
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

                  {mediaUrl(version.thumbnail_url) && (
                    <Image
                      source={{ uri: mediaUrl(version.thumbnail_url)! }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  )}

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
                        if (url) Linking.openURL(url).catch(() => {});
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
              ))
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
                      Upload / Submit Work
                    </Text>
                  </>
                )}
              </TouchableOpacity>
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
              onPress={onChat}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={styles.txIcon}>
                <Glyph name="headset" color="#3D4FD8" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.txTitle}>Need Help?</Text>
                <Text style={styles.txDate}>Contact Support</Text>
              </View>
              <Glyph name="chevron" color="#8A8FA8" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: { flex: 1, alignItems: 'center' },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
  },
  headerRef: { color: '#A7ADE0', fontSize: fontScale(11), marginTop: scale(2) },
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
  content: { padding: scale(12), paddingBottom: scale(30) + NAV_CLEARANCE },

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
  summaryCopy: { flex: 1, marginLeft: scale(11) },
  brandName: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  dealRef: { marginTop: scale(1), fontSize: fontScale(10), color: '#9295AA' },
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
    fontSize: fontScale(10),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#5A6072',
  },

  divider: { height: 1, marginVertical: scale(13), backgroundColor: '#EEEFF6' },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: scale(6) },
  fact: { flex: 1 },
  factLabel: { fontSize: fontScale(10), color: '#8B8FA6' },
  factValue: {
    marginTop: scale(4),
    fontSize: fontScale(12),
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
    fontSize: fontScale(9),
    color: '#A6AABC',
    textAlign: 'center',
  },

  tabBar: { paddingBottom: scale(10), gap: scale(6) },
  tabBtn: { paddingHorizontal: scale(12), paddingVertical: scale(8) },
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
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#8B8FA6',
  },
  accordionBody: { paddingBottom: scale(13), paddingLeft: scale(49) },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  badgePill: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(7),
  },
  badgePillText: {
    fontSize: fontScale(9),
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
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  bodyText: { fontSize: fontScale(12), lineHeight: fontScale(18), color: '#5A6072' },
  briefSection: { marginTop: scale(4) },

  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: scale(9),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F9',
    gap: scale(12),
  },
  kvLabel: { flex: 1, fontSize: fontScale(12), color: '#8B8FA6' },
  kvValue: {
    flex: 1.2,
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#11123D',
    textAlign: 'right',
  },

  progressLabel: {
    marginTop: scale(12),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#11123D',
  },
  progressCount: { marginTop: scale(3), fontSize: fontScale(11), color: '#8B8FA6' },
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
    fontSize: fontScale(10),
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
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  thumb: {
    marginTop: scale(12),
    width: '100%',
    height: scale(170),
    borderRadius: scale(12),
    backgroundColor: '#E7E8F4',
  },
  uploadLabel: { marginTop: scale(11), fontSize: fontScale(10), color: '#9295AA' },
  uploadDate: {
    marginTop: scale(2),
    fontSize: fontScale(12),
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
    height: scale(42),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
  },
  softBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    height: scale(42),
    borderRadius: scale(10),
    backgroundColor: '#EEF0FE',
  },
  ghostBtnText: {
    fontSize: fontScale(12),
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
  tlCopy: { flex: 1, paddingBottom: scale(18) },
  tlTitle: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
    textTransform: 'capitalize',
  },
  tlBody: { marginTop: scale(3), fontSize: fontScale(11), lineHeight: fontScale(16), color: '#5A6072' },
  tlDate: { marginTop: scale(3), fontSize: fontScale(10), color: '#A0A3B5' },

  escrowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securedPill: { flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  securedText: {
    fontSize: fontScale(11),
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
  escrowHint: { marginTop: scale(3), fontSize: fontScale(11), color: '#8B8FA6' },
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
  escrowStep: { fontSize: fontScale(10), color: '#8B8FA6' },

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
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  txDate: { marginTop: scale(2), fontSize: fontScale(10), color: '#9295AA' },
  txAmount: {
    fontSize: fontScale(12),
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
});

export default DealDetails;
