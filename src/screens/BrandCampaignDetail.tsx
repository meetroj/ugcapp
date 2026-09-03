/**
 * Campaign detail — the native replacement for the web /campaigns/{id} page.
 * Three tabs from the design: Overview (progress + creator + deliverables),
 * About Campaign (the full brief) and Work Review (submissions on this
 * campaign). Reads GET /api/campaigns/{id} and GET /api/work/campaign/{id}.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  SkeletonBanner,
  SkeletonChips,
  SkeletonList,
} from '../components/Skeleton';
import { BACKEND_URL, getCampaign, getCampaignWork } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  campaignId: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  /** Opens a native chat thread with the selected creator. */
  onOpenThread?: (userId: string, name: string) => void;
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
  return (
    <View style={styles.summaryCell}>
      <View style={styles.summaryIcon}>
        <Icon name={icon} color="#4C5BF3" size={15} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.summaryValue} numberOfLines={1}>
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
        <Text style={styles.factValue} numberOfLines={1}>
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
}: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const insets = useSafeAreaInsets();
  const [work, setWork] = useState<Work[]>([]);
  const [tab, setTab] = useState(0);
  /** Campaign Progress starts open; the header arrow folds it away. */
  const [progressOpen, setProgressOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // The brief and its submissions fail independently: a campaign with no
    // submitted work yet is a normal state, so an empty work list must not
    // blank out the brief itself.
    const [detail, submissions] = await Promise.allSettled([
      getCampaign(token, campaignId),
      getCampaignWork(token, campaignId),
    ]);

    // Leaving `campaign` null on failure is what renders the "Couldn't load
    // this campaign" state below.
    if (detail.status === 'fulfilled') {
      setCampaign(detail.value);
    }

    setWork(
      submissions.status === 'fulfilled'
        ? submissions.value.map((item, index) => ({
            ...item,
            id: String(item.id ?? index),
          }))
        : [],
    );

    setLoading(false);
    setRefreshing(false);
  }, [campaignId, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={[styles.header, { paddingTop: insets.top }]}>
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
          <View style={[styles.header, { paddingTop: insets.top }]}>
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
              Pull down to retry, or go back and open it again.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const current = stageIndex(campaign);
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

  return (
    <View style={styles.screen}>
      {/* Navy bar + rounded sheet, matching the brand tab screens. */}
      <View style={styles.topBar}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
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
            <Text style={styles.statusText}>{status || 'draft'}</Text>
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
            value={formatDate(campaign.created_at) || '—'}
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
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {label}
                  {index === 2 && work.length > 0 ? ` (${work.length})` : ''}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
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
                    Campaign Progress
                  </Text>
                  <View style={styles.cardHeadRight}>
                    {!progressOpen && (
                      <Text style={styles.cardHeadHint}>
                        {STAGES[current]?.label || ''}
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
                        '—',
                      )}
                    />
                    <CreatorFact
                      icon="globe"
                      label="Language"
                      value={text(campaign.creator_language, '—')}
                    />
                    <CreatorFact
                      icon="clapper"
                      label="Content Type"
                      value={text(
                        campaign.creator_content_type || campaign.video_format,
                        'Reels',
                      )}
                    />
                    <CreatorFact
                      icon="badge"
                      label="Level"
                      value={text(
                        campaign.creator_level || campaign.creator_level_label,
                        'New',
                      )}
                    />
                    <CreatorFact
                      icon="rupee"
                      label="Starting Rate"
                      value={
                        campaign.creator_starting_rate
                          ? rupees(campaign.creator_starting_rate)
                          : '—'
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
            </View>
          )}

          {tab === 2 && (
            <>
              {!work.length ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No submissions yet</Text>
                  <Text style={styles.emptyText}>
                    Work from the creator appears here once submitted.
                  </Text>
                </View>
              ) : (
                work.map(item => {
                  const thumb = photoUrl(
                    item.preview_url ||
                      item.thumbnail_url ||
                      item.watermarked_url,
                  );
                  return (
                    <View key={item.id} style={styles.workCard}>
                      <View style={styles.workMedia}>
                        {thumb ? (
                          <Image
                            source={{ uri: thumb }}
                            style={styles.workMediaImg}
                          />
                        ) : (
                          <View style={styles.workMediaFallback} />
                        )}
                        <View style={styles.playBtn}>
                          <Icon name="play" color="#15163F" size={18} />
                        </View>
                      </View>
                      <View style={styles.workBody}>
                        <Text style={styles.workTitle}>
                          {text(item.creator_name, 'Creator')}
                        </Text>
                        <Text style={styles.workMeta}>
                          Submitted{' '}
                          {formatDate(item.submitted_at || item.created_at)} ·{' '}
                          {text(item.status, 'submitted').replace(/_/g, ' ')}
                        </Text>
                        <TouchableOpacity
                          style={styles.reviewBtn}
                          onPress={() =>
                            onNavigate('/dashboard/business/work-review')
                          }
                          accessibilityRole="button"
                        >
                          <Text style={styles.reviewText}>
                            Open in Work Review
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </View>
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
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Spans the whole bar so the title centres on the screen, not on the gap
  // between the back arrow and the status chip.
  headerTitleWrap: {
    position: 'absolute',
    left: scale(52),
    right: scale(52),
    top: 0,
    bottom: 0,
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
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
    borderRadius: scale(8),
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statusText: {
    fontSize: fontScale(10),
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
  summaryCopy: { flex: 1 },
  summaryDivider: { width: 1, height: scale(30), backgroundColor: '#EDEEF6' },
  summaryLabel: {
    fontSize: fontScale(9),
    color: '#9498B0',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  summaryValue: {
    marginTop: scale(2),
    fontSize: fontScale(11),
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
  tab: { flex: 1, paddingVertical: scale(11), alignItems: 'center' },
  tabText: {
    fontSize: fontScale(12),
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

  loading: { marginTop: scale(40) },
  content: { padding: scale(16), paddingBottom: scale(30) },
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
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#9498B0',
  },
  stageLabelOn: {
    color: '#15163F',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  stageNote: { marginTop: scale(2), fontSize: fontScale(10), color: '#4C5BF3' },

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
    fontSize: fontScale(11),
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
  factCopy: { flex: 1 },
  factLabel: {
    fontSize: fontScale(9),
    color: '#9498B0',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  factValue: {
    marginTop: scale(2),
    fontSize: fontScale(11),
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
  creatorMeta: { marginTop: scale(2), fontSize: fontScale(11), color: '#777B96' },
  creatorActions: { marginTop: scale(13), flexDirection: 'row', gap: scale(9) },
  ghostBtn: {
    flex: 1,
    height: scale(42),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  ghostText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  solidBtn: {
    flex: 1,
    height: scale(42),
    borderRadius: scale(11),
    backgroundColor: '#1B2A6B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  solidText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(8),
  },
  deliverableText: { flex: 1, fontSize: fontScale(12), color: '#3B3F5C' },

  detailRow: { marginBottom: scale(12) },
  detailLabel: { fontSize: fontScale(10), color: '#9498B0' },
  detailValue: {
    marginTop: scale(3),
    fontSize: fontScale(13),
    lineHeight: fontScale(19),
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
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
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
    fontSize: fontScale(11),
    color: '#777B96',
    textTransform: 'capitalize',
  },
  reviewBtn: {
    marginTop: scale(11),
    height: scale(40),
    borderRadius: scale(11),
    backgroundColor: '#F4F5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#4C5BF3',
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
    fontSize: fontScale(12),
    color: '#858AA3',
    textAlign: 'center',
  },
});

export default BrandCampaignDetail;
