import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import {
  BACKEND_URL,
  getMyDeals,
  getUnreadCount,
  type AuthUser,
  type Deal,
} from '../api';
import DealDetails from './DealDetails';
import AppHeader from '../components/AppHeader';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

type Work = Record<string, any> & { id: string };
type Tab = 'Requests' | 'Active' | 'Completed' | 'Cancelled';

function Icon({ name, color = '#595F80' }: { name: string; color?: string }) {
  const line = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      {name === 'bell' && (
        <>
          <Path
            d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
            {...line}
          />
          <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...line} />
        </>
      )}
      {name === 'chat' && <Path d="M4.5 5h15v10.5h-9L4.5 19V5Z" {...line} />}
      {name === 'filter' && <Path d="M4 6h16M7 11h10m-7 5h4" {...line} />}
      {name === 'chevron' && <Path d="m9 7 5 5-5 5" {...line} />}
      {name === 'down' && <Path d="m8 10 4 4 4-4" {...line} />}
      {name === 'bolt' && <Path d="m13 2-7 12h6l-1 8 7-12h-6l1-8Z" {...line} />}
      {name === 'check' && (
        <>
          <Circle cx="12" cy="12" r="9" {...line} />
          <Path d="m8 12 2.5 2.5L16 9" {...line} />
        </>
      )}
    </Svg>
  );
}

const stringValue = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback;

/**
 * Maps a deal's backend state onto one of this screen's four tabs.
 *
 * The backend states are human-readable sentences ('Paid - Complete',
 * 'Shipped - In Transit', …) rather than the short keys the tabs filter on, so
 * without this every deal fell through to 'Active' — a finished or cancelled
 * deal still showed up as ongoing work.
 */
function tabStateOf(deal: Deal): string {
  const state = String(deal.current_state || '').toLowerCase();
  if (!state) {
    return 'active';
  }
  if (state.includes('cancel') || state.includes('reject')) {
    return 'cancelled';
  }
  if (state.includes('dispute')) {
    return 'cancelled';
  }
  // 'Paid - Complete' is the only terminal success state.
  if (state.includes('paid') || state.includes('complete')) {
    return 'completed';
  }
  // A deal the creator has not accepted yet still needs a decision.
  if (state.includes('awaiting acceptance') || state.includes('invited')) {
    return 'request';
  }
  return 'active';
}

function ActiveWork({
  token,
  onNotifications,
  onMessages,
  onOpenThread,
  unread = 0,
}: {
  token: string;
  /**
   * Still accepted from WebShell, but no longer read: the deals endpoint
   * derives the creator from the token itself.
   */
  session?: AuthUser;
  /**
   * Opens the chat thread with a specific user. Used by the deal detail's Chat
   * button so it lands on the brand's conversation rather than the inbox.
   */
  onOpenThread?: (userId: string, name: string) => void;
  /** Opens the notification feed from the header bell. */
  onNotifications?: () => void;
  /** Opens Messages from the header chat icon. */
  onMessages?: () => void;
  /** Unread count for the chat badge. */
  unread?: number;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  const [tab, setTab] = useState<Tab>('Active');
  // The deal opened from a card's arrow; null keeps the list showing.
  const [openDeal, setOpenDeal] = useState<Work | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Distinguishes "you have no deals" from "we could not load them".
  const [failed, setFailed] = useState(false);
  // Real unread-notification count for the header bell (was hardcoded to 7).
  const [notifications, setNotifications] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // GET /api/deals/my — the backend derives the creator from the token and
    // serializes each deal for this viewer. The previous call
    // (/api/deals?creator_id=...) is the admin list route and answered 403 for
    // every creator, so this screen never showed a single real deal.
    getMyDeals(token)
      .then(deals => {
        if (cancelled) {
          return;
        }
        setWorks(
          deals.map((deal, index) => ({
            ...deal,
            id: String(deal.deal_id || index),
            // Deals carry a human-readable `current_state`; the tabs below
            // filter on a normalized key.
            status: tabStateOf(deal),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    // The bell badge is decorative — a failure here must not blank the screen.
    getUnreadCount(token)
      .then(count => {
        if (!cancelled) {
          setNotifications(count);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token]);

  const groups = useMemo(
    () => ({
      Requests: works.filter(work =>
        ['request', 'requested', 'pending'].includes(
          String(work.status).toLowerCase(),
        ),
      ),
      Active: works.filter(
        work =>
          !work.status ||
          ['active', 'accepted', 'in_progress', 'ongoing'].includes(
            String(work.status).toLowerCase(),
          ),
      ),
      Completed: works.filter(work =>
        ['completed', 'complete'].includes(String(work.status).toLowerCase()),
      ),
      Cancelled: works.filter(work =>
        ['cancelled', 'canceled', 'rejected'].includes(
          String(work.status).toLowerCase(),
        ),
      ),
    }),
    [works],
  );
  const visible = [...groups[tab]];

  // Detail view replaces the list in place — no navigator is installed, and
  // this keeps the WebShell route (/my-active-work) unchanged.
  if (openDeal) {
    return (
      <DealDetails
        deal={openDeal}
        token={token}
        unread={unread}
        onBack={() => setOpenDeal(null)}
        onChat={() => {
          // Chat with the brand on this deal. Falls back to the inbox when the
          // payload carries no brand id (nothing to open a thread on).
          const brand = (openDeal.brand || {}) as Record<string, any>;
          if (brand.id && onOpenThread) {
            onOpenThread(String(brand.id), String(brand.name || 'Brand'));
          } else {
            onMessages?.();
          }
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Active Work"
        onNotifications={onNotifications}
        onMessages={onMessages}
        notificationCount={notifications}
        unreadMessages={unread}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.toolsWrap}>
        <View style={styles.tools}>
          <TouchableOpacity
            style={styles.tool}
            onPress={() => setFilterOpen(value => !value)}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${tab}`}
            accessibilityState={{ expanded: filterOpen }}
          >
            <Icon name="filter" />
            <Text style={styles.toolText}>Filter: {tab}</Text>
            <Icon name="down" />
          </TouchableOpacity>
        </View>
        {filterOpen && (
          <View style={styles.filterMenu}>
            {(Object.keys(groups) as Tab[]).map(item => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.filterOption,
                  tab === item && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setTab(item);
                  setFilterOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    tab === item && styles.filterOptionTextActive,
                  ]}
                >
                  {item}
                </Text>
                <Text style={styles.filterCount}>{groups[item].length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        </View>
        {loading && <SkeletonList count={4} lines={2} footer />}
        {!loading && !visible.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {failed
                ? 'Could not load your work'
                : `No ${tab.toLowerCase()} work`}
            </Text>
            <Text style={styles.emptyText}>
              {failed
                ? 'Check your connection and try again.'
                : 'Campaigns in this stage will appear here.'}
            </Text>
          </View>
        )}
        {visible.map(work => (
          <WorkCard
            key={work.id}
            work={work}
            onOpen={() => setOpenDeal(work)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function WorkCard({ work, onOpen }: { work: Work; onOpen: () => void }) {
  const brand = stringValue(
    work.brand_name || work.business_name || work.brand?.name,
    'Brand',
  );
  const logo = stringValue(
    work.brand_logo || work.logo || work.brand?.logo,
    '',
  );
  const stages = ['Accepted', 'Video Submission', 'Review', 'Payout'];
  // The real state drives both the chip and the progress default: a card in
  // the Cancelled tab must not read "Active", and a brand-new deal with no
  // stage from the backend has reached nothing yet.
  const status = String(work.status || '').toLowerCase();
  const chip = ['completed', 'complete'].includes(status)
    ? { label: 'Completed', tint: '#514CF2' }
    : ['cancelled', 'canceled', 'rejected'].includes(status)
    ? { label: 'Cancelled', tint: '#E5484D' }
    : ['request', 'requested', 'pending'].includes(status)
    ? { label: 'Requested', tint: '#E5960B' }
    : { label: 'Active', tint: '#19B85A' };
  const fallbackStage = chip.label === 'Completed' ? 3 : 0;
  const currentStage = Math.max(
    0,
    Math.min(3, Number(work.current_stage ?? work.stage_index ?? fallbackStage)),
  );
  return (
    <View style={styles.workCard}>
      <View style={styles.greenRule} />
      <View style={styles.cardTop}>
        <View style={styles.brandLogo}>
          {logo ? (
            <Image
              source={{
                uri: /^https?:/.test(logo) ? logo : `${BACKEND_URL}${logo}`,
              }}
              style={styles.logoImage}
            />
          ) : (
            <Text style={styles.logoLetter}>{brand[0].toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.brandCopy}>
          <View style={styles.referenceRow}>
            <Text style={styles.reference}>
              {work.reference ||
                work.campaign_code ||
                `#${String(work.id).toUpperCase()}`}
            </Text>
            <Icon name="bolt" color={chip.tint} />
            <Text style={[styles.active, { color: chip.tint }]}>
              {chip.label}
            </Text>
          </View>
          <Text style={styles.brandName}>{brand}</Text>
          <Text style={styles.meta}>
            {stringValue(work.parent_brand, brand)}
            {stringValue(work.campaign_type || work.category, '')
              ? ` · Via ${stringValue(work.campaign_type || work.category, '')}`
              : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.arrowButton}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="View deal details"
        >
          <Icon name="chevron" color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.progressLabels}>
        {stages.map((stage, index) => (
          <Text
            key={stage}
            style={[
              styles.progressLabel,
              index <= currentStage && styles.progressLabelActive,
            ]}
          >
            {stage}
          </Text>
        ))}
      </View>
      <View style={styles.progressBars}>
        {stages.map((stage, index) => (
          <View
            key={stage}
            style={[
              styles.progressBar,
              index <= currentStage && styles.progressBarActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  appHeader: {
    height: scale(58),
    paddingHorizontal: scale(16),
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appLogo: { width: scale(120), height: scale(21) },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: scale(10) },
  bell: {
    width: scale(32),
    height: scale(32),
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
  body: {
    flex: 1,
    backgroundColor: '#F7F7FF',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
  },
  content: { padding: scale(18), paddingBottom: scale(30) + NAV_CLEARANCE },
  tools: {
    marginTop: scale(12),
    marginBottom: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // A bordered pill rather than bare text: the control is the only way to
  // change the list, so it needs to read as a button and clear the 44pt
  // minimum touch target.
  tool: {
    height: scale(44),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E6F0',
  },
  toolText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#25274C',
  },
  // Anchors the dropdown so it can float over the list below.
  toolsWrap: { zIndex: 10 },
  filterMenu: {
    // Overlays the content rather than pushing it down: the list keeps its
    // scroll position while the menu is open, so dismissing it does not jump
    // the rows back up under the finger.
    position: 'absolute',
    top: scale(68),
    left: 0,
    right: 0,
    zIndex: 20,
    padding: scale(6),
    borderRadius: scale(12),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E6F0',
    shadowColor: '#282850',
    shadowOpacity: 0.07,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: scale(3) },
    elevation: 3,
  },
  filterOption: {
    height: scale(46),
    paddingHorizontal: scale(13),
    borderRadius: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterOptionActive: { backgroundColor: '#F0EFFF' },
  filterOptionText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#626784',
  },
  filterOptionTextActive: { color: '#4741DB' },
  filterCount: { fontSize: fontScale(12), color: '#9094AA' },
  loading: { marginTop: scale(35) },
  empty: { marginTop: scale(40), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: { marginTop: scale(5), fontSize: fontScale(11), color: '#858AA3' },
  workCard: {
    position: 'relative',
    overflow: 'hidden',
    padding: scale(14),
    marginTop: scale(2),
    borderRadius: scale(13),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#ECECF5',
    shadowColor: '#282850',
    shadowOpacity: 0.07,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: scale(4) },
    elevation: 3,
  },
  greenRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: scale(3),
    backgroundColor: '#17C865',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(10),
    backgroundColor: '#211A87',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  logoLetter: {
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFF',
  },
  brandCopy: { flex: 1, marginLeft: scale(11) },
  referenceRow: { flexDirection: 'row', alignItems: 'center', gap: scale(3) },
  reference: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#26284C',
  },
  active: {
    fontSize: fontScale(9),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#17AC54',
  },
  brandName: {
    marginTop: scale(4),
    fontSize: fontScale(12),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#16183F',
  },
  meta: { marginTop: scale(4), fontSize: fontScale(9), color: '#8B90AA' },
  arrowButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: '#07073A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabels: {
    marginTop: scale(18),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    width: '24%',
    fontSize: fontScale(8),
    textAlign: 'center',
    color: '#8C90A8',
  },
  progressLabelActive: {
    color: '#4D66F3',
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
  },
  progressBars: { marginTop: scale(7), flexDirection: 'row', gap: scale(7) },
  progressBar: {
    flex: 1,
    height: scale(5),
    borderRadius: scale(3),
    backgroundColor: '#DEDFEA',
  },
  progressBarActive: { backgroundColor: '#5472F4' },
});

export default ActiveWork;
