import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
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
  getCampaigns,
  getSavedBriefs,
  getUnreadCount,
  placeBid,
  removeSavedBrief,
  type AuthUser,
} from '../api';
import AppHeader from '../components/AppHeader';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Campaign = Record<string, any> & { id: string };
type Screen = 'browse' | 'details' | 'bid';

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

/** "12 Sep 2026" from an ISO date, or the raw text the backend sent. */
const dateLabel = (value: unknown): string => {
  const raw = textOf(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

/**
 * Browse filters. Each option carries a predicate so the list can be filtered
 * locally — the campaigns endpoint has no query params for these.
 */
type FilterKey = 'budget' | 'delivery' | 'sort';

const budgetOf = (c: Campaign) =>
  Number(c.budget || c.max_budget || c.compensation || 0);

const deliveryDaysOf = (c: Campaign) =>
  Number(c.delivery_days || c.delivery || 0);

const FILTERS: {
  key: FilterKey;
  label: string;
  options: { value: string; test?: (c: Campaign) => boolean }[];
}[] = [
  {
    key: 'budget',
    label: 'BUDGET',
    options: [
      { value: 'Any budget' },
      { value: 'Under ₹5k', test: c => budgetOf(c) < 5000 },
      {
        value: '₹5k - ₹20k',
        test: c => budgetOf(c) >= 5000 && budgetOf(c) <= 20000,
      },
      { value: 'Over ₹20k', test: c => budgetOf(c) > 20000 },
    ],
  },
  {
    key: 'delivery',
    label: 'DELIVERY',
    options: [
      { value: 'Any time' },
      {
        value: 'Within 3 days',
        test: c => deliveryDaysOf(c) > 0 && deliveryDaysOf(c) <= 3,
      },
      {
        value: 'Within a week',
        test: c => deliveryDaysOf(c) > 0 && deliveryDaysOf(c) <= 7,
      },
    ],
  },
  {
    key: 'sort',
    label: 'SORT BY',
    options: [
      { value: 'Recommended' },
      { value: 'Highest budget' },
      { value: 'Newest' },
    ],
  },
];

export default function BrowseCampaigns({
  token,
  session,
  onNotifications,
  onMessages,
  unread = 0,
}: {
  token: string;
  session: AuthUser;
  /** Opens the notification feed from the header bell. */
  onNotifications?: () => void;
  /** Opens Messages from the header chat icon. */
  onMessages?: () => void;
  /** Unread count for the chat badge. */
  unread?: number;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Campaign ids the user has saved. Held here (not per card) so the browse
  // list and the details screen stay in agreement.
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [screen, setScreen] = useState<Screen>('browse');
  const [loading, setLoading] = useState(true);
  // Separates "nothing matches your filters" from "the list failed to load".
  const [failed, setFailed] = useState(false);
  // Real unread-notification count for the header bell (was hardcoded to 7).
  const [notifications, setNotifications] = useState(0);
  // Selected option per filter, and which dropdown is currently open.
  const [picked, setPicked] = useState<Record<FilterKey, string>>({
    budget: 'Any budget',
    delivery: 'Any time',
    sort: 'Recommended',
  });
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);

  useEffect(() => {
    getCampaigns(token, { status: 'active' })
      .then(list => {
        setCampaigns(
          list.map((c, i) => ({
            ...c,
            id: String(c.id || c.campaign_id || i),
          })),
        );
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));

    // Badge only — a failure here must not affect the campaign list.
    getUnreadCount(token)
      .then(setNotifications)
      .catch(() => {});
  }, [token]);

  // Which campaigns are already saved. Separate from the list fetch so a
  // failure here only costs the filled bookmarks, not the campaigns.
  useEffect(() => {
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
      const call = wasSaved ? removeSavedBrief : addSavedBrief;
      call(token, id).catch(() => {
        setSaved(current =>
          wasSaved ? [...current, id] : current.filter(x => x !== id),
        );
      });
    },
    [saved, token],
  );

  const open = (campaign: Campaign) => {
    setSelected(campaign);
    setScreen('details');
  };

  // Apply the budget/delivery predicates, then the chosen sort.
  const visible = useMemo(() => {
    let rows = campaigns;
    for (const group of FILTERS) {
      if (group.key === 'sort') continue;
      const option = group.options.find(o => o.value === picked[group.key]);
      if (option?.test) rows = rows.filter(option.test);
    }
    if (picked.sort === 'Highest budget') {
      rows = [...rows].sort((a, b) => budgetOf(b) - budgetOf(a));
    } else if (picked.sort === 'Newest') {
      rows = [...rows].sort(
        (a, b) =>
          new Date(String(b.created_at || 0)).getTime() -
          new Date(String(a.created_at || 0)).getTime(),
      );
    }
    return rows;
  }, [campaigns, picked]);

  if (screen === 'details' && selected)
    return (
      <CampaignDetails
        campaign={selected}
        saved={saved.includes(selected.id)}
        onToggleSave={() => toggleSave(selected.id)}
        onBack={() => setScreen('browse')}
        onBid={() => setScreen('bid')}
      />
    );
  if (screen === 'bid' && selected)
    return (
      <SubmitBid
        campaign={selected}
        token={token}
        session={session}
        onBack={() => setScreen('details')}
      />
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
      >
        <View style={styles.filters}>
          {FILTERS.map(group => {
            const isOpen = openFilter === group.key;
            return (
              <View key={group.key} style={styles.filterWrap}>
                <Text style={styles.filterLabel}>{group.label}</Text>
                <TouchableOpacity
                  style={[styles.filter, isOpen && styles.filterActive]}
                  onPress={() => setOpenFilter(isOpen ? null : group.key)}
                  accessibilityRole="button"
                >
                  <Text style={styles.filterText} numberOfLines={1}>
                    {picked[group.key]}
                  </Text>
                  <Text style={styles.down}>{isOpen ? '⌃' : '⌄'}</Text>
                </TouchableOpacity>

                {/* Absolutely positioned so opening a filter overlays the list
                    instead of pushing it down, unlike the inline menu on
                    Active Work. zIndex keeps it above the cards below. */}
                {isOpen && (
                  <View style={styles.dropdown}>
                    {group.options.map(option => {
                      const active = picked[group.key] === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.dropdownItem,
                            active && styles.dropdownItemActive,
                          ]}
                          onPress={() => {
                            setPicked(current => ({
                              ...current,
                              [group.key]: option.value,
                            }));
                            setOpenFilter(null);
                          }}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[
                              styles.dropdownText,
                              active && styles.dropdownTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {option.value}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {loading && <SkeletonList count={4} lines={2} footer />}
        {visible.map(c => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onPress={() => open(c)}
            saved={saved.includes(c.id)}
            onToggleSave={() => toggleSave(c.id)}
          />
        ))}
        {!loading && !campaigns.length && (
          <Text style={styles.empty}>
            {failed
              ? "Couldn't load campaigns. Check your connection and try again."
              : 'No campaigns match your search.'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function CampaignCard({
  campaign,
  onPress,
  saved,
  onToggleSave,
}: {
  campaign: Campaign;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const tags = tagsOf(campaign);
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
            <Text style={styles.brandName}>{campaignName(campaign)}</Text>
            {!!campaign.age && (
              <>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.age}>{campaign.age}</Text>
              </>
            )}
          </View>
        </View>
        <TouchableOpacity
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
      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.slice(0, 3).map((t: string) => (
            <Text key={t} style={styles.tag}>
              {t}
            </Text>
          ))}
        </View>
      )}
      {!!format && (
        <View style={styles.format}>
          <Icon name="video" size={15} />
          <Text style={styles.formatText}>{format}</Text>
        </View>
      )}
      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.budget}>{budget || 'Budget on request'}</Text>
          {match !== null && <Text style={styles.match}>{match}% match</Text>}
        </View>
        <TouchableOpacity style={styles.primarySmall} onPress={onPress}>
          <Text style={styles.primaryText}>View details</Text>
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
  // First thing under the status bar on its own white ground, so it pads
  // itself down rather than sitting beneath the clock on iOS.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.subHeader,
        { height: styles.subHeader.height + insets.top, paddingTop: insets.top },
      ]}
    >
      <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
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

function CampaignDetails({
  campaign,
  onBack,
  onBid,
  saved,
  onToggleSave,
}: {
  campaign: Campaign;
  onBack: () => void;
  onBid: () => void;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tags = tagsOf(campaign);
  const format = formatOf(campaign);
  const match = matchOf(campaign);
  const budget = budgetLabel(campaign);
  const delivery =
    textOf(campaign.delivery) ||
    dateLabel(campaign.final_delivery_by || campaign.due_date || campaign.deadline);
  const brief = textOf(campaign.brief || campaign.brief_text);
  const objective = textOf(
    campaign.objective ||
      (Array.isArray(campaign.objectives)
        ? campaign.objectives.join(', ')
        : campaign.objectives),
  );

  // Only rows the brand actually filled in; an empty brief shows an honest
  // gap rather than a fabricated product.
  const productRows: Array<[string, string]> = (
    [
      ['Product', textOf(campaign.product || campaign.product_name)],
      ['Category', textOf(campaign.category || campaign.product_category)],
      ['Description', textOf(campaign.description || campaign.product_description)],
      ['Hook', textOf(campaign.hook || campaign.campaign_hook)],
      ['Key message', textOf(campaign.key_message)],
      ['Target audience', textOf(campaign.audience || campaign.target_audience)],
    ] as Array<[string, string]>
  ).filter(([, value]) => !!value);

  // "2 x Reel (9:16, 30s)" per structured deliverable, plus the free-text
  // extras ("1 x Story") the brief may carry.
  const deliverableRows: string[] = (
    Array.isArray(campaign.deliverable_items) ? campaign.deliverable_items : []
  )
    .map((item: any) => {
      const type = textOf(item?.type);
      if (!type) return '';
      const aspect = textOf((item?.aspect_ratios || [])[0]);
      const duration = textOf(String(item?.duration ?? ''));
      const details = [aspect, duration].filter(Boolean).join(', ');
      const label = details ? `${type} (${details})` : type;
      return `${Number(item?.quantity) || 1} x ${label}`;
    })
    .filter(Boolean)
    .concat(listOf(campaign.additional_deliverables));

  const includeRows: Array<[string, string]> = (
    [
      ['Required phrases', listOf(campaign.required_phrases).join(', ')],
      ['Required shots', listOf(campaign.required_shots).join(', ')],
      ['Call to action', textOf(campaign.call_to_action)],
      ['Hashtags', listOf(campaign.hashtags).join(' ')],
      ['Promo code', textOf(campaign.promo_code)],
    ] as Array<[string, string]>
  ).filter(([, value]) => !!value);

  const avoidRows: Array<[string, string]> = (
    [
      [
        'Competitors',
        campaign.no_competitors
          ? textOf(campaign.competitors_text, 'No competitor brands')
          : '',
      ],
      ['Other products', campaign.no_other_products ? 'Not allowed' : ''],
      ['Profanity', campaign.no_profanity ? 'Not allowed' : ''],
      ['Political content', campaign.no_political ? 'Not allowed' : ''],
      ['Also avoid', textOf(campaign.avoid_text || campaign.what_not_to_do)],
    ] as Array<[string, string]>
  ).filter(([, value]) => !!value);
  return (
    <View style={styles.subScreen}>
      <Header
        title="Campaign Details"
        onBack={onBack}
        saved={saved}
        onToggleSave={onToggleSave}
      />
      <ScrollView
        contentContainerStyle={styles.detailContent}
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
        <View style={styles.statBoxes}>
          <View style={styles.statBox}>
            <Icon name="wallet" color="#514CF2" />
            <View>
              <Text style={styles.statLabel}>Budget</Text>
              <Text style={styles.statValue}>{budget || '—'}</Text>
            </View>
          </View>
          <View style={styles.statBox}>
            <Icon name="clock" color="#514CF2" />
            <View>
              <Text style={styles.statLabel}>Delivery</Text>
              <Text style={styles.statValue}>{delivery || '—'}</Text>
            </View>
          </View>
        </View>
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
        {productRows.length > 0 && (
          <Section title="PRODUCT">
            {productRows.map(([k, v]) => (
              <View style={styles.dataRow} key={k}>
                <Text style={styles.dataKey}>{k}</Text>
                <Text style={styles.dataValue}>{v}</Text>
              </View>
            ))}
          </Section>
        )}
        {deliverableRows.length > 0 && (
          <Section title="DELIVERABLES">
            {deliverableRows.map((label, index) => (
              <View style={styles.dataRow} key={`${index}-${label}`}>
                <Text style={styles.dataKey}>Deliverable {index + 1}</Text>
                <Text style={styles.dataValue}>{label}</Text>
              </View>
            ))}
          </Section>
        )}
        {includeRows.length > 0 && (
          <Section title="MUST INCLUDE">
            {includeRows.map(([k, v]) => (
              <View style={styles.dataRow} key={k}>
                <Text style={styles.dataKey}>{k}</Text>
                <Text style={styles.dataValue}>{v}</Text>
              </View>
            ))}
          </Section>
        )}
        {avoidRows.length > 0 && (
          <Section title="MUST AVOID">
            {avoidRows.map(([k, v]) => (
              <View style={styles.dataRow} key={k}>
                <Text style={styles.dataKey}>{k}</Text>
                <Text style={styles.dataValue}>{v}</Text>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>

      {/* Pinned below the scroll area so Submit Bid is always reachable — the
          brief is long enough that it used to sit far off-screen. */}
      <View
        style={[
          styles.detailFooter,
          { paddingBottom: scale(12) + NAV_CLEARANCE + insets.bottom },
        ]}
      >
        <TouchableOpacity style={styles.primary} onPress={onBid}>
          <Icon name="send" color="#FFF" size={18} />
          <Text style={styles.detailBtnText}>Submit Your Bid</Text>
        </TouchableOpacity>
      </View>
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
  onBack,
}: {
  campaign: Campaign;
  token: string;
  session: AuthUser;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [proposal, setProposal] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => {
    if (!amount || !days || !proposal.trim()) {
      setMessage('Please complete all three fields.');
      return;
    }
    setSending(true);
    setMessage('');
    try {
      // POST /api/campaigns/:id/bid — singular. This used to post to `/bids`,
      // which the backend does not serve: every bid 404'd and the creator was
      // told to "try again" on a request that could never succeed.
      await placeBid(token, campaign.id, {
        amount: Number(amount),
        bid_amount: Number(amount),
        delivery_days: Number(days),
        proposal,
        message: proposal,
      });
      setMessage('Your bid was submitted successfully.');
    } catch (error) {
      // Show what the server actually said (e.g. "You already bid on this
      // campaign") rather than a blanket retry prompt.
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Could not submit the bid. Please try again.',
      );
    } finally {
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={styles.bidContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BidField label="Bid Amount (₹)" icon="wallet">
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="Enter your bid amount"
            placeholderTextColor="#9BA0B8"
            style={styles.bidInput}
          />
        </BidField>
        <BidField label="Estimated Delivery (days)" icon="calendar">
          <TextInput
            value={days}
            onChangeText={setDays}
            keyboardType="numeric"
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
            maxLength={1000}
            placeholder="Describe your approach, experience, and why you're the right fit..."
            placeholderTextColor="#9BA0B8"
            style={[styles.bidInput, styles.proposalInput]}
          />
          <Text style={styles.counter}>{proposal.length}/1000</Text>
        </View>
        {!!message && (
          <Text
            style={[
              styles.feedback,
              message.startsWith('Your') && styles.success,
            ]}
          >
            {message}
          </Text>
        )}
        <View style={styles.bidActions}>
          <TouchableOpacity
            style={[styles.secondary, styles.actionButton]}
            onPress={onBack}
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
  browseContent: { paddingTop: scale(6), paddingBottom: scale(18) + NAV_CLEARANCE },
  topbar: {
    height: scale(56),
    paddingHorizontal: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  appLogo: { width: scale(120), height: scale(21) },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  bell: {
    width: scale(31),
    height: scale(31),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: scale(-1),
    top: scale(-2),
    width: scale(14),
    height: scale(14),
    borderRadius: scale(7),
    backgroundColor: '#FF4057',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: fontScale(8),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  avatar: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  search: {
    height: scale(47),
    marginHorizontal: scale(16),
    marginTop: scale(10),
    paddingHorizontal: scale(13),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#DFE1EE',
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, marginLeft: scale(8), color: '#15173F', fontSize: fontScale(13) },
  // Leads the sheet now that the duplicate page title is gone; the header
  // above already names the screen.
  filters: {
    flexDirection: 'row',
    paddingHorizontal: scale(16),
    gap: scale(10),
    marginTop: scale(13),
    marginBottom: scale(10),
    // Keeps the open dropdown above the campaign cards below it.
    zIndex: 20,
  },
  filterWrap: { flex: 1, position: 'relative' },
  filterLabel: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#676C91',
    marginBottom: scale(5),
  },
  filter: {
    height: scale(36),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#E1E2ED',
    backgroundColor: '#FFF',
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterActive: { borderColor: '#4943EB' },
  filterText: {
    flex: 1,
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#24264E',
  },
  // The ⌄/⌃ glyphs sit low in their em box, so they read as dropped
  // against the label baseline. The negative top margin lifts them back
  // to optical centre with the filter text.
  down: { color: '#686E91', fontSize: fontScale(16), marginLeft: scale(4), marginTop: scale(-4) },
  // Overlays the content below instead of pushing it down: absolute + zIndex.
  dropdown: {
    position: 'absolute',
    top: scale(58),
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 8,
    padding: scale(5),
    borderRadius: scale(12),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E1E2ED',
    shadowColor: '#24245A',
    shadowOpacity: 0.16,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(6) },
  },
  dropdownItem: { paddingVertical: scale(9), paddingHorizontal: scale(9), borderRadius: scale(8) },
  dropdownItemActive: { backgroundColor: '#EEEEFF' },
  dropdownText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4A4F72',
  },
  dropdownTextActive: { color: '#4943EB' },
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
  brandCopy: { flex: 1, marginLeft: scale(10) },
  inline: { flexDirection: 'row', alignItems: 'center' },
  brandName: {
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#16183F',
  },
  dot: { marginHorizontal: scale(7), color: '#8A8EA6' },
  age: { fontSize: fontScale(10), color: '#858AA3' },
  campaignTitle: {
    marginTop: scale(9),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#1A1B46',
  },
  tags: { marginTop: scale(7), flexDirection: 'row', gap: scale(7) },
  tag: {
    paddingHorizontal: scale(9),
    paddingVertical: scale(4),
    borderRadius: scale(6),
    overflow: 'hidden',
    backgroundColor: '#F4F3FF',
    fontSize: fontScale(9),
    color: '#5E5BDD',
  },
  format: { marginTop: scale(8), flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  formatText: { fontSize: fontScale(10), color: '#5E6484' },
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
    fontSize: fontScale(10),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#554EF1',
  },
  primarySmall: {
    height: scale(36),
    minWidth: scale(92),
    paddingHorizontal: scale(13),
    borderRadius: scale(9),
    backgroundColor: '#4842E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFF',
  },
  empty: { margin: scale(30), textAlign: 'center', color: '#777C98' },
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
    width: scale(38),
    height: scale(38),
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
  detailContent: { padding: scale(16), paddingBottom: scale(24) },
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
  detailAge: { fontSize: fontScale(12), color: '#858AA3' },
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
  statBoxes: { flexDirection: 'row', gap: scale(10), marginTop: scale(14) },
  statBox: {
    flex: 1,
    height: scale(72),
    borderRadius: scale(12),
    backgroundColor: '#F2F2FC',
    paddingHorizontal: scale(13),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
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
  dataKey: { width: scale(118), fontSize: fontScale(13), color: '#858AA3' },
  dataValue: { flex: 1, fontSize: fontScale(13), lineHeight: fontScale(19), color: '#262847' },
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
  // Separate from the compact `primaryText` on the browse cards, which stays
  // small so the card stays dense.
  detailFooter: {
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
  bidContent: { padding: scale(12), paddingBottom: scale(24) + NAV_CLEARANCE },
  fieldLabel: {
    marginTop: scale(14),
    marginBottom: scale(8),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#27294E',
  },
  bidField: {
    minHeight: scale(47),
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
    height: scale(45),
    paddingHorizontal: scale(10),
    fontSize: fontScale(11),
    color: '#1D1F43',
  },
  proposalField: { height: scale(134), alignItems: 'flex-start', paddingTop: scale(10) },
  proposalInput: {
    height: scale(104),
    textAlignVertical: 'top',
    paddingTop: scale(5),
    lineHeight: fontScale(16),
  },
  counter: {
    position: 'absolute',
    right: scale(9),
    bottom: scale(7),
    fontSize: fontScale(9),
    color: '#898EA7',
  },
  feedback: {
    fontSize: fontScale(10),
    color: '#D14343',
    textAlign: 'center',
    marginTop: scale(13),
  },
  success: { color: '#16854A' },
  bidActions: { flexDirection: 'row', gap: scale(8), marginTop: scale(18) },
  actionButton: { flex: 1, marginTop: 0 },
});
