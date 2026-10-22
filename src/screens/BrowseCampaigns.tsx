import { useLiveEffect } from "../liveUpdates";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import {
  addSavedBrief,
  BACKEND_URL,
  getBidReadiness,
  getCampaign,
  getCampaigns,
  getMyBids,
  getSavedBriefs,
  getUnreadCount,
  placeBid,
  getMe,
  removeSavedBrief,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import BottomSheet from '../components/BottomSheet';
import { Alert } from '../components/AppAlert';
import { ToastBar, useToast } from '../components/Toast';
import { mediaKindOf, useMediaOpener } from '../components/MediaViewer';
import {
  BROWSE_PAGE,
  BUDGET_OPTIONS,
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_FILTERS,
  DELIVERY_OPTIONS,
  SORT_OPTIONS,
  activeFilterCount,
  bidStatusLabel,
  biddable,
  briefSections,
  dateLabel,
  deliveryChip,
  filterBriefs,
  isOpenForBids,
  isSelectedCreator,
  loadErrorText,
  maxCampaignBid,
  moodImagesOf,
  isPrivateBrief,
  ownBidOn,
  parseDeliveryDays,
  pctLabel,
  referenceVideosOf,
  stripBrandOnlyLines,
  timeAgo,
  validateBid,
  type BrowseFilters,
} from '../briefs';
import { CONTENT_MAX_WIDTH, NAV_CLEARANCE, scale, fontScale } from '../theme';

// Tablet: keep the single-column pages a readable width, centred (no-op on phones).
const COLUMN = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

type Campaign = Record<string, any> & { id: string };

const textOf = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;
const money = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;
const campaignName = (c: Campaign) =>
  textOf(c.brand_name || c.business_name || c.brand?.name, 'Brand');
const titleOf = (c: Campaign) =>
  textOf(c.title || c.campaign_name || c.name, 'Creator Campaign');
const logoOf = (c: Campaign) => textOf(c.brand_logo || c.logo || c.brand?.logo);

const listOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(v => String(v).trim()).filter(Boolean)
    : [];

/**
 * Real tags only — tone and niche tags come from the brand's brief. An
 * untagged campaign renders no chips rather than invented ones.
 */
const tagsOf = (c: Campaign): string[] => {
  for (const key of ['tags', 'categories', 'tone_tags', 'creator_niche_tags']) {
    const values = listOf(c[key]);
    if (values.length) return values;
  }
  const category = textOf(c.category || c.product_category);
  return category ? [category] : [];
};

/** "Reel (9:16, 30s)" from the brief's structured deliverable, if set. */
const formatOf = (c: Campaign): string => {
  const item = Array.isArray(c.deliverable_items) ? c.deliverable_items[0] : null;
  const type = textOf(item?.type || c.video_format || c.brief_type);
  if (!type) return '';
  const aspect = textOf((item?.aspect_ratios || [])[0] || c.aspect_ratio);
  const seconds = Number(c.duration_seconds || 0);
  const duration = textOf(String(item?.duration ?? '')) || (seconds ? `${seconds}s` : '');
  const details = [aspect, duration].filter(Boolean).join(', ');
  return details ? `${type} (${details})` : type;
};

/** The brand's budget for the brief; empty string when it never set one. */
const budgetLabel = (c: Campaign): string => {
  const value = Number(
    c.budget || c.max_budget || c.budget_max || c.per_video_budget || c.compensation || 0,
  );
  return value > 0 ? money(value) : '';
};

/** Only a backend-provided match score is shown; there is no invented one. */
const matchOf = (c: Campaign): number | null => {
  const value = Number(c.match ?? c.match_percentage);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
};

function Icon({
  name,
  size = 20,
  color = '#646B91',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const p = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      {name === 'search' && (
        <>
          <Circle cx="10.5" cy="10.5" r="6" {...p} />
          <Path d="m15 15 5 5" {...p} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path
            d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
            {...p}
          />
          <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...p} />
        </>
      )}
      {name === 'chat' && <Path d="M4.5 5h15v10.5h-9L4.5 19V5Z" {...p} />}
      {name === 'bookmarkFilled' && (
        <Path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" fill={color} stroke={color} />
      )}
      {name === 'bookmark' && (
        <Path
          d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21Z"
          {...p}
        />
      )}
      {name === 'video' && (
        <>
          <Rect x="3" y="6" width="13" height="12" rx="2" {...p} />
          <Path d="m16 10 5-3v10l-5-3" {...p} />
        </>
      )}
      {name === 'back' && <Path d="m15 5-7 7 7 7" {...p} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8" {...p} />
          <Path d="M12 8v5l3 2" {...p} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect x="3" y="6" width="18" height="13" rx="3" {...p} />
          <Path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" {...p} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...p} />
          <Path d="M7 3v4m10-4v4M3 10h18" {...p} />
        </>
      )}
      {name === 'edit' && (
        <Path
          d="m4 20 4.2-1 10.7-10.7a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z"
          {...p}
        />
      )}
      {name === 'send' && <Path d="m3 11 18-8-8 18-2-8-8-2Zm8 2 5-5" {...p} />}
      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" {...p} />}
      {name === 'filter' && <Path d="M4 6h16M7 12h10M10 18h4" {...p} />}
    </Svg>
  );
}

function BrandLogo({
  campaign,
  large = false,
}: {
  campaign: Campaign;
  large?: boolean;
}) {
  const uri = logoOf(campaign);
  return (
    <View
      style={[
        styles.brandLogo,
        large && styles.brandLogoLarge,
        { borderColor: campaign.logoColor || '#ECECF5' },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri: /^https?:/.test(uri) ? uri : `${BACKEND_URL}${uri}` }}
          style={styles.logoImage}
          resizeMode="contain"
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.logoText, { color: campaign.logoColor || '#3734A9' }]}
        >
          {campaign.logoText || campaignName(campaign).slice(0, 2)}
        </Text>
      )}
    </View>
  );
}

/** Whatever the creator sent for this brief, from the campaign's own bids list. */
type OwnBid = Record<string, any>;

export default function BrowseCampaigns({
  token,
  session,
  onNotifications,
  onMessages,
  unread = 0,
  onNavigate,
  openId,
  initialQuery = '',
}: {
  token: string;
  session: AuthUser;
  onNavigate?: (path: string) => void;
  /** Opens the notification feed from the header bell. */
  onNotifications?: () => void;
  /** Opens Messages from the header chat icon. */
  onMessages?: () => void;
  /** Unread count for the chat badge. */
  unread?: number;
  /** `?open=<id>` deep link: opens that brief once the list has loaded. */
  openId?: string;
  /** `?q=` from the top search: pre-fills the search box. */
  initialQuery?: string;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Campaign ids the user has saved. Held here (not per card) so the browse
  // list and the details screen stay in agreement.
  const [saved, setSaved] = useState<string[]>([]);
  // The creator's own bids by campaign id, so a brief already bid on says so.
  const [bids, setBids] = useState<Record<string, OwnBid>>({});
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Why the list failed to load ('' = fine); keeps "nothing matches" apart from "could not load".
  const [loadError, setLoadError] = useState('');
  // Real unread-notification count for the header bell (was hardcoded to 7).
  const [notifications, setNotifications] = useState(0);
  const [filters, setFilters] = useState<BrowseFilters>({ ...DEFAULT_FILTERS, search: initialQuery });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shown, setShown] = useState(BROWSE_PAGE);
  const toast = useToast();
  const opened = useRef('');

  const me = String(session?.user_id || '');

  const loadCampaigns = useCallback(() => {
    getCampaigns(token, { status: 'active' })
      .then(list => {
        setCampaigns(list.map((c, i) => ({ ...c, id: String(c.id || c.campaign_id || i) })));
        setLoadError('');
      })
      .catch(error => setLoadError(loadErrorText(error, 'campaigns')))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });

    // Badge only — a failure here must not affect the campaign list.
    getUnreadCount(token)
      .then(setNotifications)
      .catch(() => {});

    // Which briefs already carry my bid. Best effort: the campaigns' own bids
    // list covers the same ground when this call fails.
    Promise.resolve()
      .then(() => getMyBids(token))
      .then(rows => {
        const next: Record<string, OwnBid> = {};
        for (const row of rows) {
          const id = String(row?.campaign?.id || row?.id || '');
          if (id && row.my_bid) {
            next[id] = { ...row.my_bid, status: row.bid_status || row.my_bid.status };
          }
        }
        setBids(next);
      })
      .catch(() => {});
  }, [token]);

  useLiveEffect(() => loadCampaigns(), [loadCampaigns]);

  // Which campaigns are already saved. Separate from the list fetch so a
  // failure here only costs the filled bookmarks, not the campaigns.
  useLiveEffect(() => {
    let active = true;
    getSavedBriefs(token)
      .then(ids => {
        if (active) {
          setSaved(ids);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  /**
   * Flips the bookmark. The icon updates immediately and the request follows;
   * if it fails the change is rolled back so the icon never claims a save the
   * server did not record.
   */
  const toggleSave = useCallback(
    (id: string) => {
      const wasSaved = saved.includes(id);
      setSaved(current =>
        wasSaved ? current.filter(x => x !== id) : [...current, id],
      );
      toast.show(wasSaved ? 'Removed from saved' : 'Saved to your list');
      const call = wasSaved ? removeSavedBrief : addSavedBrief;
      call(token, id).catch(() => {
        setSaved(current =>
          wasSaved ? [...current, id] : current.filter(x => x !== id),
        );
        toast.show("Couldn't update saved briefs. Check your connection.");
      });
    },
    [saved, token, toast],
  );

  // What the creator can still bid on: active, a slot left, not hired on it.
  // (Also drops their own private brief, which carries only `selected_creator`.)
  const open = useMemo(() => biddable(campaigns, me), [campaigns, me]);
  const visible = useMemo(() => filterBriefs(open, filters), [open, filters]);
  const page = visible.slice(0, shown);

  // A changed search/filter starts again from the first page.
  useEffect(() => setShown(BROWSE_PAGE), [filters]);
  useEffect(() => {
    if (initialQuery !== undefined) setFilters(f => ({ ...f, search: initialQuery }));
  }, [initialQuery]);

  // Deep link: ?open=<id> shows that brief's details once the list is in.
  useEffect(() => {
    if (!openId || opened.current === openId || loading) return;
    opened.current = openId;
    const found = open.find(c => c.id === openId);
    if (found) {
      setSelected(found);
      return;
    }
    // Not in the open list (closed or filled; a private brief goes to its deal): fetch it so a shared
    // link never lands on a bare list. BriefFlow shows it as closed if it is.
    getCampaign(token, openId)
      .then(one => {
        // A private brief is answered from the deal (accept / decline / counter), not bid on.
        if (isPrivateBrief(one)) onNavigate?.(`/my-deals/${openId}`);
        else setSelected({ ...one, id: openId });
      })
      .catch(error => toast.show(loadErrorText(error, 'that campaign')));
  }, [openId, open, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownBidFor = (c: Campaign): OwnBid | null => bids[c.id] || ownBidOn(c, me);
  const clearFilters = () => setFilters(f => ({ ...f, budget: 'any', delivery: 'any' }));
  const filterCount = activeFilterCount(filters);
  const searching = filters.search.trim().length > 0;

  if (selected)
    return (
      <>
        <BriefFlow
          campaign={selected}
          token={token}
          session={session}
          saved={saved.includes(selected.id)}
          onToggleSave={() => toggleSave(selected.id)}
          onBack={() => setSelected(null)}
          onNavigate={onNavigate}
          myBid={ownBidFor(selected)}
          closed={!isOpenForBids(selected) || isSelectedCreator(selected, me)}
          onDone={message => {
            setSelected(null);
            toast.show(message);
            loadCampaigns();
          }}
        />
        <ToastBar message={toast.message} />
      </>
    );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Campaigns"
        onNotifications={onNotifications}
        onMessages={onMessages}
        notificationCount={notifications}
        unreadMessages={unread}
      />
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.browseContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadCampaigns();
            }}
          />
        }
      >
        <View style={styles.search}>
          <Icon name="search" size={19} />
          <TextInput
            style={styles.searchInput}
            value={filters.search}
            onChangeText={search => setFilters(f => ({ ...f, search }))}
            placeholder="Search campaigns, brands, categories"
            placeholderTextColor="#9BA0B8"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search campaigns"
          />
          {searching && (
            <TouchableOpacity
              style={styles.searchClear}
              onPress={() => setFilters(f => ({ ...f, search: '' }))}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={16} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterBtn, filterCount > 0 && styles.filterBtnOn]}
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Filters"
          >
            <Icon name="filter" size={18} color={filterCount > 0 ? '#4943EB' : '#505675'} />
            <Text style={[styles.filterBtnText, filterCount > 0 && styles.filterBtnTextOn]}>
              Filters{filterCount > 0 ? ` (${filterCount})` : ''}
            </Text>
          </TouchableOpacity>
          <Text style={styles.sortNote} numberOfLines={1}>
            {SORT_OPTIONS.find(o => o.value === filters.sort)?.label}
          </Text>
          {filterCount > 0 && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
            >
              <Text style={styles.linkText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {searching && (
          <Text style={styles.searchNote}>
            {visible.length} match{visible.length === 1 ? '' : 'es'} for “{filters.search.trim()}”
          </Text>
        )}

        {!!loadError && !loading && !!campaigns.length && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.bannerBtn}
              onPress={loadCampaigns}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.bannerBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && <SkeletonList count={4} lines={2} footer />}
        {page.map(c => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onPress={() => setSelected(c)}
            saved={saved.includes(c.id)}
            onToggleSave={() => toggleSave(c.id)}
            bid={ownBidFor(c)}
          />
        ))}

        {visible.length > shown && (
          <TouchableOpacity
            style={styles.loadMore}
            onPress={() => setShown(n => n + BROWSE_PAGE)}
            accessibilityRole="button"
          >
            <Text style={styles.loadMoreText}>Load more briefs</Text>
          </TouchableOpacity>
        )}

        {!loading && !campaigns.length && !!loadError && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>{loadError}</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={loadCampaigns}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.emptyBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !loadError && !open.length && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No campaigns open right now</Text>
            <Text style={styles.emptyText}>New briefs appear here as brands post them. Pull down to refresh.</Text>
          </View>
        )}
        {!loading && !!open.length && !visible.length && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No campaigns found</Text>
            <Text style={styles.emptyText}>No campaigns match your search or filters right now.</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setFilters({ ...DEFAULT_FILTERS })}
              accessibilityRole="button"
              accessibilityLabel="Clear search and filters"
            >
              <Text style={styles.emptyBtnText}>Clear search and filters</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetOpen}
        title="Filters"
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              onPress={() => setFilters(f => ({ ...DEFAULT_FILTERS, search: f.search }))}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.sheetBtnGhostText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnPrimary]}
              onPress={() => setSheetOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Show results"
            >
              <Text style={styles.sheetBtnPrimaryText}>
                Show {visible.length} campaign{visible.length === 1 ? '' : 's'}
              </Text>
            </TouchableOpacity>
          </>
        }
      >
        <ChipGroup
          label="Budget"
          options={BUDGET_OPTIONS}
          value={filters.budget}
          onPick={budget => setFilters(f => ({ ...f, budget }))}
        />
        <ChipGroup
          label="Delivery"
          options={DELIVERY_OPTIONS}
          value={filters.delivery}
          onPick={delivery => setFilters(f => ({ ...f, delivery }))}
        />
        <ChipGroup
          label="Sort by"
          options={SORT_OPTIONS}
          value={filters.sort}
          onPick={sort => setFilters(f => ({ ...f, sort }))}
        />
      </BottomSheet>
      <ToastBar message={toast.message} />
    </View>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.chipGroupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map(option => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onPick(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${option.label}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function CampaignCard({
  campaign,
  onPress,
  saved,
  onToggleSave,
  bid,
  closed = false,
}: {
  campaign: Campaign;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
  bid: OwnBid | null;
  /** No longer open for bids (shown on Saved, which keeps closed briefs). */
  closed?: boolean;
}) {
  const tags = [...tagsOf(campaign).slice(0, 2), deliveryChip(campaign)];
  const age = timeAgo(campaign.created_at);
  const format = formatOf(campaign);
  const match = matchOf(campaign);
  const budget = budgetLabel(campaign);
  return (
    // The whole card opens the campaign; the bookmark and the button below
    // stop the press from bubbling so they keep their own behaviour.
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${campaignName(campaign)}: ${titleOf(campaign)}`}
    >
      <View style={styles.cardHead}>
        <BrandLogo campaign={campaign} />
        <View style={styles.brandCopy}>
          <View style={styles.inline}>
            <Text style={styles.brandName} numberOfLines={1}>{campaignName(campaign)}</Text>
            {!!age && (
              <>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.age}>{age}</Text>
              </>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.bookmarkBtn}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save campaign'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          // The card underneath opens the campaign; keep the tap here.
          onPress={event => {
            event.stopPropagation();
            onToggleSave();
          }}
        >
          <Icon
            name={saved ? 'bookmarkFilled' : 'bookmark'}
            size={21}
            color={saved ? '#4943EB' : undefined}
          />
        </TouchableOpacity>
      </View>
      <Text style={styles.campaignTitle}>{titleOf(campaign)}</Text>
      <View style={styles.tags}>
        {tags.map((t: string) => (
          <Text key={t} style={styles.tag}>
            {t}
          </Text>
        ))}
      </View>
      {!!format && (
        <View style={styles.format}>
          <Icon name="video" size={15} />
          <Text style={styles.formatText}>{format}</Text>
        </View>
      )}
      {closed && <Text style={styles.closedChip}>Closed: no longer open for bids</Text>}
      {!!bid && (
        <Text style={styles.bidChip}>
          Bid submitted · {money(bid.amount)} · {bidStatusLabel(String(bid.status || 'pending'))}
        </Text>
      )}
      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.budget}>{budget || 'Budget on request'}</Text>
          {match !== null && <Text style={styles.match}>{match}% match</Text>}
        </View>
        <TouchableOpacity style={styles.primarySmall} onPress={onPress}>
          <Text style={styles.primaryText}>{bid ? 'View your bid' : 'View details'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function Header({
  title,
  onBack,
  close,
  saved,
  onToggleSave,
}: {
  title: string;
  onBack: () => void;
  close?: boolean;
  /** Only meaningful when `close` is false — the right slot is a bookmark. */
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  // No inset padding: this bar renders inside WebShell's SafeAreaView (top
  // edge), which already clears the status bar.
  return (
    <View style={styles.subHeader}>
      <TouchableOpacity style={styles.headerBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="back" color="#171943" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity
        style={[styles.headerBtn, close && styles.closeBtn]}
        // Close dismisses the screen; the bookmark saves and must not navigate.
        onPress={close ? onBack : onToggleSave}
        accessibilityRole="button"
        accessibilityState={close ? undefined : { selected: !!saved }}
        accessibilityLabel={
          close ? 'Close' : saved ? 'Remove from saved' : 'Save campaign'
        }
      >
        <Icon
          name={close ? 'close' : saved ? 'bookmarkFilled' : 'bookmark'}
          color={!close && saved ? '#4943EB' : '#505675'}
        />
      </TouchableOpacity>
    </View>
  );
}

/**
 * One brief from details to a sent bid: details, then the gates the website
 * runs before its bid form (profile complete, KYC verified, platform-fee
 * notice), then the form. Shared by Browse and Saved.
 */
export function BriefFlow({
  campaign,
  token,
  session,
  saved,
  onToggleSave,
  onBack,
  onDone,
  onNavigate,
  myBid,
  closed = false,
}: {
  campaign: Campaign;
  token: string;
  session?: AuthUser;
  saved: boolean;
  onToggleSave: () => void;
  onBack: () => void;
  /** Called after a bid is sent, with the success message to show. */
  onDone: (message: string) => void;
  onNavigate?: (path: string) => void;
  /** The creator's existing bid on this brief, if any. */
  myBid?: OwnBid | null;
  /** The brief no longer takes bids: details only, no Submit button. */
  closed?: boolean;
}) {
  const [view, setView] = useState<'details' | 'bid'>('details');
  const [percent, setPercent] = useState(DEFAULT_COMMISSION_PERCENT);
  // Profile items still missing ([] = incomplete but the server named none); null = sheet closed.
  const [missing, setMissing] = useState<string[] | null>(null);
  const [feeOpen, setFeeOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const startBid = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      let me: Record<string, any> | null = null;
      const getUser = async () => {
        if (!me) me = ((await getMe(token).catch(error => {
          if (error?.name === 'NetworkError') throw error;
          return session || {};
        })) || {}) as Record<string, any>;
        return me;
      };
      let readiness: { can_bid: boolean; missing: string[]; commission_percent?: number };
      try {
        readiness = await getBidReadiness(token);
      } catch (error: any) {
        if (error?.name === 'NetworkError') throw error;
        // Older backend or a hiccup: fall back to the profile flag the app already holds.
        readiness = { can_bid: (await getUser()).profile_completed !== false, missing: [] };
      }
      if (readiness.commission_percent != null && Number.isFinite(readiness.commission_percent)) {
        setPercent(readiness.commission_percent);
      }
      // An incomplete profile can't bid: list what is missing instead of opening the form.
      if (!readiness.can_bid) {
        setMissing(readiness.missing);
        return;
      }
      const user = await getUser();
      const kyc = (user.kyc || {}) as Record<string, any>;
      if (kyc.status !== 'verified' && !user.kyc_verified) {
        Alert.alert('Verify your KYC', 'Verify your KYC before submitting a bid.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Verify KYC', onPress: () => onNavigate?.('/kyc') },
        ]);
        return;
      }
      setFeeOpen(true);
    } catch (error: any) {
      Alert.alert(
        error?.name === 'NetworkError' ? "You're offline" : 'Could not start your bid',
        loadErrorText(error, 'your profile'),
      );
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  return (
    <>
      {view === 'bid' ? (
        <SubmitBid
          campaign={campaign}
          token={token}
          percent={percent}
          onBack={() => setView('details')}
          onSubmitted={() => onDone('Bid submitted successfully!')}
        />
      ) : (
        <CampaignDetails
          campaign={campaign}
          saved={saved}
          onToggleSave={onToggleSave}
          onBack={onBack}
          onBid={startBid}
          checking={checking}
          myBid={myBid || null}
          closed={closed}
        />
      )}

      <BottomSheet
        visible={missing !== null}
        title="Complete your profile to bid"
        onClose={() => setMissing(null)}
        footer={
          <>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              onPress={() => setMissing(null)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetBtnGhostText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnPrimary]}
              onPress={() => {
                setMissing(null);
                onNavigate?.('/settings?tab=profile');
              }}
              accessibilityRole="button"
              accessibilityLabel="Complete profile"
            >
              <Text style={styles.sheetBtnPrimaryText}>Complete profile</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={styles.sheetBody}>
          Brands choose creators from their profile, so you can bid once these are filled in:
        </Text>
        {(missing || []).map(item => (
          <Text key={item} style={styles.sheetItem}>
            • {item}
          </Text>
        ))}
        {!missing?.length && <Text style={styles.sheetItem}>• Your profile details</Text>}
      </BottomSheet>

      <BottomSheet
        visible={feeOpen}
        title={`Platform fee: ${pctLabel(percent)}%`}
        onClose={() => setFeeOpen(false)}
        footer={
          <>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              onPress={() => setFeeOpen(false)}
              accessibilityRole="button"
            >
              <Text style={styles.sheetBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnPrimary]}
              onPress={() => {
                setFeeOpen(false);
                setView('bid');
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue to bid"
            >
              <Text style={styles.sheetBtnPrimaryText}>Continue to bid</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={styles.sheetBody}>
          UGC.ad keeps {pctLabel(percent)}% of your bid as its platform fee. It is deducted from your payout when the
          brand approves your work.
        </Text>
      </BottomSheet>
    </>
  );
}

function CampaignDetails({
  campaign,
  onBack,
  onBid,
  saved,
  onToggleSave,
  checking,
  myBid,
  closed,
}: {
  campaign: Campaign;
  onBack: () => void;
  onBid: () => void;
  saved: boolean;
  onToggleSave: () => void;
  checking: boolean;
  myBid: OwnBid | null;
  closed: boolean;
}) {
  const insets = useSafeAreaInsets();
  const tags = tagsOf(campaign);
  const format = formatOf(campaign);
  const match = matchOf(campaign);
  const budget = budgetLabel(campaign);
  const delivery =
    textOf(campaign.delivery) ||
    dateLabel(campaign.final_delivery_by || campaign.due_date || campaign.deadline);
  // The brand-only "Budget visibility" line is not for creators.
  const brief = stripBrandOnlyLines(textOf(campaign.brief || campaign.brief_text));
  const objective = textOf(
    campaign.objective ||
      (Array.isArray(campaign.objectives)
        ? campaign.objectives.join(', ')
        : campaign.objectives),
  );
  const sections = briefSections(campaign);
  const moods = moodImagesOf(campaign, BACKEND_URL);
  const videos = referenceVideosOf(campaign, BACKEND_URL);
  // Pictures and videos open in the app; never the phone's browser.
  const media = useMediaOpener();
  return (
    <View style={styles.subScreen}>
      <Header
        title="Campaign Details"
        onBack={onBack}
        saved={saved}
        onToggleSave={onToggleSave}
      />
      <ScrollView
        contentContainerStyle={[
          styles.detailContent,
          // With no pinned footer (bid already sent) the last row must clear the nav.
          (!!myBid || closed) && { paddingBottom: scale(24) + NAV_CLEARANCE + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailBrand}>
          <BrandLogo campaign={campaign} />
          <View style={styles.flexOne}>
            <Text style={styles.detailBrandName}>{campaignName(campaign)}</Text>
            {!!campaign.age && (
              <Text style={styles.detailAge}>{campaign.age}</Text>
            )}
          </View>
          {match !== null && (
            <Text style={styles.matchLabel}>
              Match <Text style={styles.matchStrong}>{match}%</Text>
            </Text>
          )}
        </View>
        {!!myBid && (
          <View style={styles.bidSummary} accessibilityLabel="Bid already submitted">
            <Text style={styles.bidSummaryTitle}>Bid Already Submitted</Text>
            <View style={styles.dataRow}>
              <Text style={styles.dataKey}>Your bid</Text>
              <Text style={styles.dataValue}>{money(myBid.amount)}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataKey}>Delivery</Text>
              <Text style={styles.dataValue}>
                {myBid.estimated_delivery_days ? `${myBid.estimated_delivery_days} days` : '-'}
              </Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataKey}>Status</Text>
              <Text style={styles.dataValue}>{bidStatusLabel(String(myBid.status || 'pending'))}</Text>
            </View>
            <Text style={styles.dataKey}>Your proposal</Text>
            <Text style={styles.bidSummaryProposal}>{textOf(myBid.proposal, 'No proposal added.')}</Text>
          </View>
        )}
        <View style={styles.statBoxes}>
          <View style={styles.statBox}>
            <Icon name="wallet" color="#514CF2" />
            <View style={styles.statCopy}>
              <Text style={styles.statLabel}>Budget</Text>
              <Text style={styles.statValue}>{budget || '-'}</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <Icon name="clock" color="#514CF2" />
            <View style={styles.statCopy}>
              <Text style={styles.statLabel}>Delivery</Text>
              <Text style={styles.statValue}>{delivery || '-'}</Text>
            </View>
          </View>
        </View>
        {closed && !myBid && <Text style={styles.closedNote}>This campaign is no longer open for bids.</Text>}
        {!!campaign.requires_shipment && (
          <Text style={styles.notice}>Product shipment included: the brand ships the product to you.</Text>
        )}
        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.slice(0, 3).map((t: string) => (
              <Text key={t} style={styles.detailTag}>
                {t}
              </Text>
            ))}
          </View>
        )}
        {!!format && (
          <View style={styles.format}>
            <Icon name="video" size={17} />
            <Text style={styles.detailFormatText}>{format}</Text>
          </View>
        )}
        {!!brief && (
          <Section title="CAMPAIGN BRIEF">
            <Text style={styles.body}>{brief}</Text>
          </Section>
        )}
        {!!objective && (
          <Section title="OBJECTIVES">
            <Text style={styles.body}>{objective}</Text>
          </Section>
        )}
        {moods.length > 0 && (
          <Section title="MOOD BOARD">
            <View style={styles.moodRow}>
              {moods.map((uri, index) => (
                <TouchableOpacity
                  key={`${uri}-${index}`}
                  onPress={() => media.open(uri, 'image')}
                  accessibilityRole="button"
                  accessibilityLabel={`Open mood board image ${index + 1}`}
                >
                  <Image source={{ uri }} style={styles.moodImage} />
                </TouchableOpacity>
              ))}
            </View>
          </Section>
        )}
        {videos.length > 0 && (
          <Section title="REFERENCE VIDEOS">
            {videos.map((uri, index) => (
              <TouchableOpacity
                key={`${uri}-${index}`}
                style={styles.linkRow}
                // A video file plays in the app player; any other link (a YouTube
                // reference) opens in the in-app page viewer.
                onPress={() => {
                  // A pasted link may lack its scheme ("youtube.com/...").
                  const link = /^https?:\/\//i.test(uri) ? uri : `https://${uri}`;
                  media.open(link, mediaKindOf(link) === 'video' ? 'video' : 'page');
                }}
                accessibilityRole="link"
                accessibilityLabel={`Open reference video ${index + 1}`}
              >
                <Text style={styles.linkRowText} numberOfLines={1}>
                  {uri}
                </Text>
              </TouchableOpacity>
            ))}
          </Section>
        )}
        {sections.map(section => (
          <Section key={section.title} title={section.title.toUpperCase()}>
            {section.rows.map(([k, v]) => (
              <View style={styles.dataRow} key={k}>
                <Text style={styles.dataKey}>{k}</Text>
                <Text style={styles.dataValue}>{v}</Text>
              </View>
            ))}
          </Section>
        ))}
      </ScrollView>

      {/* Pinned below the scroll area so Submit Bid is always reachable — the
          brief is long enough that it used to sit far off-screen. A brief
          already bid on has no button: the summary above is the whole story. */}
      {!myBid && !closed && (
        <View
          style={[
            styles.detailFooter,
            { paddingBottom: scale(12) + NAV_CLEARANCE + insets.bottom },
          ]}
        >
          <TouchableOpacity
            style={[styles.primary, checking && styles.primaryBusy]}
            onPress={onBid}
            disabled={checking}
            accessibilityRole="button"
          >
            {checking ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Icon name="send" color="#FFF" size={18} />
                <Text style={styles.detailBtnText}>Submit Your Bid</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      {media.node}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubmitBid({
  campaign,
  token,
  percent,
  onBack,
  onSubmitted,
}: {
  campaign: Campaign;
  token: string;
  percent: number;
  onBack: () => void;
  /** Called once the bid is on the server. */
  onSubmitted: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [proposal, setProposal] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [message, setMessage] = useState('');
  // The creator (not UGC.ad's team) cuts the edited file, so they quote raw + edited separately.
  const split = (
    Array.isArray(campaign.deliverable_items) ? campaign.deliverable_items : []
  ).some(
    (d: any) => d?.edited_required && (d?.edited_by || 'creator') === 'creator',
  );
  const total = Number(amount) || 0;
  const maximum = maxCampaignBid(campaign);
  const submit = async () => {
    if (sendingRef.current) return;
    const problem = validateBid(campaign, { amount, days, proposal });
    if (problem) {
      setMessage(problem);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setMessage('');
    try {
      // POST /api/campaigns/:id/bid — singular. This used to post to `/bids`,
      // which the backend does not serve: every bid 404'd and the creator was
      // told to "try again" on a request that could never succeed.
      await placeBid(token, campaign.id, {
        amount: total,
        bid_amount: total,

        delivery_days: parseDeliveryDays(days) as number,
        proposal,
        message: proposal,
      });
      onSubmitted();
    } catch (error: any) {
      // Show what the server actually said (e.g. "You have already submitted a
      // bid for this campaign") rather than a blanket retry prompt.
      setMessage(
        error?.name === 'NetworkError'
          ? "You're offline. Check your connection and try again."
          : error instanceof Error && error.message
            ? error.message
            : 'Could not submit the bid. Please try again.',
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  return (
    <View style={styles.subScreen}>
      <Header title="Submit Your Bid" onBack={onBack} close />
      {/* The proposal field and Submit button sit low in the form; without
          this the iOS keyboard covers them (Android resizes the window). */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior="padding"
        // Android only: iOS insets the scroll content instead (see AuthLayout),
        // which cannot leave stuck padding after the keyboard closes.
        enabled={Platform.OS === 'android'}
      >
      <ScrollView
        contentContainerStyle={styles.bidContent}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.bidFor} numberOfLines={2}>
          {titleOf(campaign)} · {campaignName(campaign)}
        </Text>
        <BidField label={split ? 'Combined payout per video (₹)' : 'Bid Amount per video (₹)'} icon="wallet">
          <TextInput value={amount} onChangeText={text => setAmount(text.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder="Enter your bid amount" placeholderTextColor="#9BA0B8" style={styles.bidInput} />
        </BidField>
        {split && <Text style={styles.fieldLabel}>One bid includes both the raw video and the edited video.</Text>}
        {maximum > 0 && <Text style={styles.hint}>Highest bid allowed: ₹{maximum.toLocaleString('en-IN')} per video.</Text>}
        <View style={styles.feeBox} accessibilityLabel="Platform fee notice">
          <Text style={styles.feeTitle}>UGC.ad platform fee: {pctLabel(percent)}%</Text>
          <Text style={styles.feeText}>Deducted from your payout when the brand approves your work.</Text>
        </View>
        <BidField label="Estimated Delivery (days)" icon="calendar">
          <TextInput
            value={days}
            // Whole days only: the site's field is min=1, step 1.
            onChangeText={text => setDays(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="How many days to complete?"
            placeholderTextColor="#9BA0B8"
            style={styles.bidInput}
          />
        </BidField>
        <Text style={styles.fieldLabel}>Your Proposal</Text>
        <View style={[styles.bidField, styles.proposalField]}>
          <View style={styles.fieldIcon}>
            <Icon name="edit" size={18} color="#625CF2" />
          </View>
          <TextInput
            value={proposal}
            onChangeText={setProposal}
            multiline
            placeholder="Describe your approach, experience, and why you're the right fit..."
            placeholderTextColor="#9BA0B8"
            style={[styles.bidInput, styles.proposalInput]}
          />
        </View>
        {!!message && (
          <Text style={styles.feedback} accessibilityLiveRegion="polite">
            {message}
          </Text>
        )}
        <View style={styles.bidActions}>
          <TouchableOpacity
            style={[styles.secondary, styles.actionButton]}
            onPress={onBack}
            disabled={sending}
          >
            <Text style={styles.bidCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primary, styles.actionButton]}
            onPress={submit}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Icon name="send" color="#FFF" size={17} />
                <Text style={styles.bidBtnText}>Submit Bid</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function BidField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.bidField}>
        <View style={styles.fieldIcon}>
          <Icon name={icon} size={18} color="#625CF2" />
        </View>
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  loading: { marginVertical: scale(8) },
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  // Sub-views keep their white Header, so they sit on the light background.
  subScreen: { flex: 1, backgroundColor: '#F8F8FE' },
  // The page sits on a light sheet, rounded at the top only.
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  browseContent: { ...COLUMN, paddingTop: scale(6), paddingBottom: scale(18) + NAV_CLEARANCE },
  search: {
    minHeight: scale(48),
    marginHorizontal: scale(16),
    marginTop: scale(12),
    paddingHorizontal: scale(13),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#DFE1EE',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, minWidth: 0, marginLeft: scale(8), paddingVertical: scale(8), color: '#15173F', fontSize: 16 },
  searchClear: { width: scale(44), height: scale(44), alignItems: 'center', justifyContent: 'center', marginRight: scale(-10) },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(16),
    marginTop: scale(10),
    marginBottom: scale(8),
  },
  filterBtn: {
    minHeight: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E1E2ED',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
  },
  filterBtnOn: { borderColor: '#4943EB', backgroundColor: '#F1F0FF' },
  filterBtnText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#24264E' },
  filterBtnTextOn: { color: '#4943EB' },
  sortNote: { flex: 1, minWidth: 0, fontSize: fontScale(13), color: '#777C98' },
  linkBtn: { minHeight: scale(44), justifyContent: 'center' },
  linkText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4943EB' },
  searchNote: { marginHorizontal: scale(16), marginBottom: scale(8), fontSize: fontScale(13), color: '#5E6484' },
  banner: {
    marginHorizontal: scale(16),
    marginBottom: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#FDECEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  bannerText: { flex: 1, minWidth: 0, fontSize: fontScale(13), color: '#B03030' },
  bannerBtn: { minHeight: scale(44), minWidth: scale(60), alignItems: 'center', justifyContent: 'center' },
  bannerBtnText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#B03030' },
  loadMore: {
    marginHorizontal: scale(16),
    marginTop: scale(4),
    minHeight: scale(48),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#DADCF2',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: { fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4943EB' },
  emptyBox: { margin: scale(24), alignItems: 'center' },
  emptyTitle: { fontSize: fontScale(15), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163F', textAlign: 'center' },
  emptyText: { marginTop: scale(8), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#777C98', textAlign: 'center' },
  emptyBtn: {
    marginTop: scale(16),
    minHeight: scale(46),
    paddingHorizontal: scale(20),
    borderRadius: scale(12),
    backgroundColor: '#4842E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#FFF' },
  chipGroup: { marginTop: scale(12) },
  chipGroupLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#676C91',
    marginBottom: scale(8),
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  chip: {
    minHeight: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E1E2ED',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { borderColor: '#4943EB', backgroundColor: '#EEEEFF' },
  chipText: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#4A4F72' },
  chipTextActive: { color: '#4943EB' },
  sheetBtn: { flex: 1, minHeight: scale(48), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  sheetBtnGhost: { borderWidth: 1, borderColor: '#DFE1EC', backgroundColor: '#FFF' },
  sheetBtnGhostText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#17193F' },
  sheetBtnPrimary: { flex: 1.6, backgroundColor: '#4842E8' },
  sheetBtnPrimaryText: { fontSize: fontScale(14), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#FFF' },
  sheetBody: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#4A4F73', marginBottom: scale(8) },
  sheetItem: { fontSize: fontScale(14), lineHeight: fontScale(24), color: '#15163A' },
  card: {
    marginHorizontal: scale(16),
    marginBottom: scale(10),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFEFF7',
    shadowColor: '#282852',
    shadowOpacity: 0.05,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: scale(3) },
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  bookmarkBtn: { minWidth: scale(44), minHeight: scale(44), alignItems: 'center', justifyContent: 'center', marginRight: scale(-10) },
  brandLogo: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(9),
    borderWidth: 1,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoLarge: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(10),
    backgroundColor: '#25208F',
  },
  logoImage: { width: '86%', height: '86%' },
  logoText: {
    fontSize: fontScale(10),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
  },
  brandCopy: { flex: 1, minWidth: 0, marginLeft: scale(10) },
  inline: { flexDirection: 'row', alignItems: 'center' },
  brandName: {
    flexShrink: 1,
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#16183F',
  },
  dot: { marginHorizontal: scale(7), color: '#8A8EA6' },
  age: { flexShrink: 0, fontSize: fontScale(11), color: '#858AA3' },
  campaignTitle: {
    marginTop: scale(9),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#1A1B46',
  },
  tags: { marginTop: scale(7), flexDirection: 'row', flexWrap: 'wrap', gap: scale(7) },
  tag: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(6),
    overflow: 'hidden',
    backgroundColor: '#F4F3FF',
    fontSize: fontScale(11),
    color: '#5E5BDD',
  },
  format: { marginTop: scale(8), flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  formatText: { flexShrink: 1, fontSize: fontScale(12), color: '#5E6484' },
  bidChip: {
    marginTop: scale(8),
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(6),
    overflow: 'hidden',
    backgroundColor: '#E2F7EE',
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#1B7F55',
  },
  closedChip: {
    marginTop: scale(8),
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(6),
    overflow: 'hidden',
    backgroundColor: '#ECEDF5',
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6079',
  },
  cardBottom: {
    marginTop: scale(8),
    paddingTop: scale(8),
    borderTopWidth: 1,
    borderTopColor: '#E7E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budget: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '900',
    color: '#171943',
  },
  match: {
    marginTop: scale(1),
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#554EF1',
  },
  primarySmall: {
    height: scale(44),
    minWidth: scale(92),
    paddingHorizontal: scale(13),
    borderRadius: scale(9),
    backgroundColor: '#4842E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  subHeader: {
    height: scale(57),
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDEEF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(8),
  },
  headerBtn: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { borderRadius: scale(10), backgroundColor: '#F0F1F6' },
  headerTitle: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#16183E',
  },
  detailContent: { ...COLUMN, padding: scale(16), paddingBottom: scale(24) },
  detailBrand: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  // Detail-view sizes. The browse cards deliberately stay compact so more of
  // them fit on screen, so these override the shared card styles rather than
  // enlarging both.
  detailBrandName: {
    fontSize: fontScale(16),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#16183F',
  },
  detailAge: { fontSize: fontScale(13), color: '#858AA3' },
  detailTag: {
    paddingHorizontal: scale(11),
    paddingVertical: scale(6),
    borderRadius: scale(7),
    overflow: 'hidden',
    backgroundColor: '#F4F3FF',
    fontSize: fontScale(12),
    color: '#5E5BDD',
  },
  detailFormatText: { fontSize: fontScale(13), color: '#5E6484' },
  matchLabel: { fontSize: fontScale(12), color: '#7C819C' },
  matchStrong: {
    color: '#4D48EF',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '900',
    fontSize: fontScale(16),
  },
  bidSummary: {
    marginTop: scale(14),
    padding: scale(14),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#DADDFF',
    backgroundColor: '#F1F1FF',
  },
  bidSummaryTitle: {
    marginBottom: scale(10),
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11145C',
  },
  bidSummaryProposal: { marginTop: scale(4), fontSize: fontScale(14), lineHeight: fontScale(21), color: '#333858' },
  notice: {
    marginTop: scale(12),
    padding: scale(10),
    borderRadius: scale(10),
    overflow: 'hidden',
    backgroundColor: '#FFF4DE',
    fontSize: fontScale(13),
    color: '#8A5A00',
  },
  closedNote: {
    marginTop: scale(12),
    padding: scale(10),
    borderRadius: scale(10),
    overflow: 'hidden',
    backgroundColor: '#ECEDF5',
    fontSize: fontScale(13),
    color: '#5C6079',
  },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  moodImage: { width: scale(96), height: scale(96), borderRadius: scale(10), backgroundColor: '#ECEDF5' },
  linkRow: {
    minHeight: scale(44),
    paddingHorizontal: scale(12),
    marginBottom: scale(8),
    borderRadius: scale(10),
    backgroundColor: '#F2F2FC',
    justifyContent: 'center',
  },
  linkRowText: { fontSize: fontScale(13), color: '#4943EB' },
  statBoxes: { flexDirection: 'row', gap: scale(10), marginTop: scale(14) },
  statBox: {
    flex: 1,
    minWidth: 0,
    minHeight: scale(72),
    paddingVertical: scale(8),
    borderRadius: scale(12),
    backgroundColor: '#F2F2FC',
    paddingHorizontal: scale(13),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: fontScale(12), color: '#777C99' },
  statValue: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#191B44',
    marginTop: scale(3),
  },
  section: { marginTop: scale(22) },
  sectionTitle: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#5854EF',
    marginBottom: scale(10),
    letterSpacing: 0.4,
  },
  body: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#252747' },
  dataRow: { flexDirection: 'row', marginBottom: scale(10) },
  dataKey: { width: scale(118), flexShrink: 0, fontSize: fontScale(13), color: '#858AA3' },
  dataValue: { flex: 1, minWidth: 0, fontSize: fontScale(14), lineHeight: fontScale(20), color: '#262847' },
  primary: {
    height: scale(50),
    borderRadius: scale(11),
    backgroundColor: '#4842E8',
    flexDirection: 'row',
    gap: scale(7),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(6),
  },
  primaryBusy: { opacity: 0.75 },
  // Separate from the compact `primaryText` on the browse cards, which stays
  // small so the card stays dense.
  detailFooter: {
    ...COLUMN,
    paddingHorizontal: scale(16),
    paddingTop: scale(10),
    paddingBottom: scale(12),
    borderTopWidth: 1,
    borderTopColor: '#ECEDF5',
    backgroundColor: '#FFFFFF',
  },
  detailBtnText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  // Paired side-by-side in the bid form, so a touch smaller than the
  // full-width detail CTAs.
  bidBtnText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  bidCancelText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#17193F',
  },
  secondary: {
    height: scale(50),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#DFE1EC',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(9),
  },
  bidContent: { ...COLUMN, padding: scale(16), paddingBottom: scale(24) + NAV_CLEARANCE },
  bidFor: { fontSize: fontScale(13), color: '#8A8FB5', marginTop: scale(4) },
  fieldLabel: {
    marginTop: scale(14),
    marginBottom: scale(8),
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#27294E',
  },
  hint: { marginTop: scale(6), fontSize: fontScale(13), color: '#777C98' },
  feeBox: {
    marginTop: scale(12),
    padding: scale(12),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E6E9FF',
    backgroundColor: '#F6F7FF',
    gap: scale(3),
  },
  feeTitle: { fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#15163A' },
  feeText: { fontSize: fontScale(13), color: '#4A4F73' },
  bidField: {
    minHeight: scale(50),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#DADCF2',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(9),
  },
  fieldIcon: {
    width: scale(29),
    height: scale(29),
    borderRadius: scale(7),
    backgroundColor: '#F0EFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidInput: {
    flex: 1,
    height: scale(48),
    minWidth: 0,
    paddingHorizontal: scale(10),
    fontSize: 16,
    color: '#1D1F43',
  },
  proposalField: { height: scale(150), alignItems: 'flex-start', paddingTop: scale(10) },
  proposalInput: {
    height: scale(128),
    textAlignVertical: 'top',
    paddingTop: scale(5),
    lineHeight: fontScale(20),
  },
  feedback: {
    fontSize: fontScale(14),
    color: '#D14343',
    textAlign: 'center',
    marginTop: scale(13),
  },
  bidActions: { flexDirection: 'row', gap: scale(8), marginTop: scale(18) },
  actionButton: { flex: 1, marginTop: 0 },
});
