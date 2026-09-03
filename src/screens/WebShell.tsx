/**
 * The WebView shell around the live PWA, shown once the user is authenticated.
 * All UI comes from the website; this file only adds the native behaviour
 * a browser tab can't provide (back button, external links, offline, refresh).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { getChatUnreadCount, type AuthUser } from '../api';
import CreatorHome from './CreatorHome';
import AppProfileMenu from './AppProfileMenu';
import CreatorProfile from './CreatorProfile';
import AppSettings from './AppSettings';
import BrandSettings from './BrandSettings';
import BrandCampaigns from './BrandCampaigns';
import BrandCreators from './BrandCreators';
import CreatorPublicProfile from './CreatorPublicProfile';
import BrandWallet from './BrandWallet';
import BrandBids from './BrandBids';
import BrandWorkReview from './BrandWorkReview';
import BrandShipments from './BrandShipments';
import BrandMessages from './BrandMessages';
import BrandChatThread from './BrandChatThread';
import BrandPostBrief from './BrandPostBrief';
import BrandCampaignDetail from './BrandCampaignDetail';
import BrandShipmentDetail from './BrandShipmentDetail';
import MyDeals from './MyDeals';
import MyBids from './MyBids';
import CreatorSettings from './CreatorSettings';
import WithdrawalRequest from './WithdrawalRequest';
import SavedBriefs from './SavedBriefs';
import KycSubmit from './KycSubmit';
import LegalDocument, { type LegalDocId } from './LegalDocument';
import BrowseCampaigns from './BrowseCampaigns';
import ActiveWork from './ActiveWork';
import KycVerification from './KycVerification';
import PrivacySecurity from './PrivacySecurity';
import FollowUs from './FollowUs';
import Earnings from './Earnings';
import Reviews from './Reviews';
import NotificationSettings from './NotificationSettings';
import NotificationFeed from './NotificationFeed';
import type {
  WebViewNavigation,
  ShouldStartLoadRequest,
} from 'react-native-webview/lib/WebViewTypes';
import { NAV_CLEARANCE, scale, fontScale } from '../theme';

/** Load the local PWA in development so every screen uses the local backend. */
const SITE_ORIGIN = __DEV__ ? 'http://localhost:3000' : 'https://www.ugcad.io';

/** Hosts allowed to render inside the app. Anything else opens in the real browser. */
const INTERNAL_HOSTS = ['ugcad.io', 'www.ugcad.io', '10.0.2.2', 'localhost'];

/** Matches the PWA manifest's theme_color so the shell and site agree. */
const THEME_COLOR = '#667eea';

// Bottom-nav tints. The bar is a floating navy pill, matching the dark headers
// the tab screens sit under: inactive icons are a muted slate, and the active
// one goes white so it reads clearly against the dark surface.
const NAV_SURFACE = '#15163F';
const ACTIVE_TINT = '#FFFFFF';
const INACTIVE_TINT = '#7B7F9E';
/** Diameter of the active-tab dot under each nav icon. */
const DOT_SIZE = scale(6);
// The raised centre button keeps the brand purple so it still stands out.
const FAB_TINT = '#4C5BF3';
// Diameter of the raised centre button and the notch it sits in.
const FAB_SIZE = scale(58);
// Height of the white pill, and the geometry of the scoop cut out of its top
// edge. The notch is drawn a little wider than the button so a ring of
// background shows around it instead of the white touching the purple.
const NAV_BAR_HEIGHT = scale(62);
// Tab-bar glyphs; the viewBox is 24, so this scales the whole set at once.
const NAV_ICON_SIZE = scale(26);
const NAV_RADIUS = scale(26);
const NOTCH_GAP = scale(6);
const NOTCH_RADIUS = FAB_SIZE / 2 + NOTCH_GAP;

/**
 * Backend notification links still use a few legacy shapes the app has since
 * replaced. Rewriting them here keeps every entry point — tab, card, or
 * notification tap — landing on the native screen instead of the WebView.
 */
function normalizePath(path: string): string {
  const cut = path.search(/[?#]/);
  const pure = cut === -1 ? path : path.slice(0, cut);
  if (pure === '/chat') return '/messages';
  if (pure === '/dashboard/business') return '/dashboard/business/browse-creator';
  // '/dashboard/business/campaign/<id>' (and .../campaigns/<id>/shortlist)
  // are the web's campaign detail; the app's is '/campaigns/<id>'.
  const campaign = /^\/dashboard\/business\/campaigns?\/([^/]+)/.exec(pure);
  if (campaign) return `/campaigns/${campaign[1]}`;
  return path;
}

function hostOf(url: string): string {
  const match = /^https?:\/\/([^/:?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : '';
}

function isInternal(url: string): boolean {
  const host = hostOf(url);
  return INTERNAL_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
}

function WebShell({
  token,
  session,
  initialPath,
  onLogout,
}: {
  token: string;
  session: AuthUser;
  initialPath: string;
  /** Clears the session in App, returning the user to the auth screens. */
  onLogout?: () => void;
}): React.JSX.Element {
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  // Set while a back navigation is in flight. onNavigationStateChange fires for
  // the page we are returning *to*, and without this flag it would push that
  // page onto the stack again — the stack would grow on every back press and
  // the user could never reach the exit.
  const goingBack = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [webPath, setWebPath] = useState(initialPath);
  const [feedOpen, setFeedOpen] = useState(false);
  // Display name for the open chat thread. The list knows it; the URL only
  // carries the id, so it is stashed here when a thread is opened.
  const [chatName, setChatName] = useState('Chat');
  // The creator record tapped on the Creators tab. The profile screen
  // seeds its header from this while GET /api/profile/:id is in flight.
  const [creatorSeed, setCreatorSeed] = useState<Record<string, any> | null>(
    null,
  );
  // Paths visited before the current one, oldest first. Native screens swap in
  // and out by path alone, so without this stack there is nothing for the
  // hardware back button to return to and Android would close the app.
  const [history, setHistory] = useState<string[]>([]);
  // Unread chat messages, for the header badge on screens that show one.
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    // Badge only — a failure must not disturb the shell.
    getChatUnreadCount(token)
      .then(count => {
        if (active) setUnread(count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  const creatorApp =
    session.role === 'creator' && session.profile_completed !== false;
  const brandApp =
    session.role === 'business' && session.profile_completed !== false;
  const mobileDashboard =
    (session.role === 'creator' || session.role === 'business') &&
    session.profile_completed !== false;
  // Fallback destination when a screen's back is pressed on a cold entry, i.e.
  // there is no history to pop (deep link, or Messages opened as the very first
  // screen). Normal in-app navigation returns to the real previous screen.
  // The brand's landing screen is the Creators tab; the old
  // /dashboard/business summary screen has been removed.
  const homePath = creatorApp
    ? '/dashboard/creator'
    : '/dashboard/business/browse-creator';
  // Native matching is on the bare pathname: '/my-deals?tab=requested' from a
  // notification must open the native screen, with the query kept only for
  // whatever actually falls through to the WebView URL.
  const purePath = currentPath.split(/[?#]/)[0];
  const showingCreatorHome = creatorApp && purePath === '/dashboard/creator';
  const showingBrowseCampaigns = creatorApp && purePath === '/browse-briefs';
  const showingActiveWork = creatorApp && purePath === '/my-active-work';
  const showingEarnings = creatorApp && purePath === '/withdrawal';
  // The withdrawal form is native too, so Earnings never leaves the app.
  const showingWithdrawalForm = creatorApp && purePath === '/withdrawal/new';
  const showingKyc = creatorApp && purePath === '/kyc';
  const showingKycSubmit = creatorApp && purePath === '/kyc/edit';
  // Reviews is native for both roles — the screen itself picks the right
  // endpoint, so a brand gets the same layout filled with creator ratings.
  const showingReviews = mobileDashboard && purePath === '/reviews';
  // Creators get the full native profile page; brands keep the simple menu
  // until their own design lands.
  const showingCreatorProfile = creatorApp && purePath === '/app/profile';
  const showingProfileMenu =
    mobileDashboard && !creatorApp && purePath === '/app/profile';
  const showingSettings = mobileDashboard && purePath === '/app/settings';
  // A brand editing its account used to land on the desktop /settings page in
  // the WebView; it now gets the native form instead. Creators still use the
  // web page, which has creator-only fields the native screen doesn't cover.
  const showingBrandSettings = brandApp && purePath === '/settings';
  // Creators get their own native account form on the same path.
  const showingCreatorSettings = creatorApp && purePath === '/settings';
  const showingBrandCampaigns =
    brandApp && purePath === '/dashboard/business/all-campaigns';
  const showingBrandCreators =
    brandApp && purePath === '/dashboard/business/browse-creator';
  // '?amount=' is the deliberate handoff to the web checkout (the recharge
  // needs a payment-gateway SDK the app doesn't bundle), so that one query
  // keeps falling through to the WebView instead of matching the native tab.
  const showingBrandWallet =
    brandApp &&
    purePath === '/dashboard/business/wallet' &&
    !/[?&]amount=/.test(currentPath);
  const showingBrandBids =
    brandApp && purePath === '/dashboard/business/pending-bids';
  const showingBrandWorkReview =
    brandApp && purePath === '/dashboard/business/work-review';
  const showingBrandShipments =
    brandApp && purePath === '/dashboard/business/shipments';
  // Only the bare conversation list is native. Opening a thread navigates to
  // '/messages?user=<id>', which keeps its query string in currentPath and so
  // falls through to the WebView — the thread view (attachments, offer cards,
  // disputes) stays on the web.
  // Messages is native for both roles — the conversation list is role-agnostic
  // (the backend returns the other participant either way).
  const showingBrandMessages = mobileDashboard && purePath === '/messages';
  // A thread: /messages/<otherUserId>. Rendered by the native Chat screen so
  // no conversation ever falls through to the website.
  const chatMatch = /^\/messages\/([^/]+)$/.exec(purePath);
  const showingChat = mobileDashboard && !!chatMatch;
  const showingBrandPostBrief =
    brandApp && purePath === '/dashboard/business/post-brief';
  // Detail routes carry an id, so they match by prefix rather than equality.
  const campaignMatch = /^\/campaigns\/([^/]+)$/.exec(purePath);
  const showingBrandCampaignDetail = brandApp && !!campaignMatch;
  const shipmentMatch = /^\/shipment\/([^/]+)$/.exec(purePath);
  const showingBrandShipmentDetail = brandApp && !!shipmentMatch;
  // A creator's public profile: /creator/<id>. The screen fetches by id, so it
  // renders natively from anywhere — the Creators tab just also hands over its
  // directory record as a seed so the header paints without waiting.
  const creatorMatch = /^\/creator\/([^/]+)$/.exec(purePath);
  const showingCreatorPublic = brandApp && !!creatorMatch;
  const showingMyDeals = creatorApp && purePath === '/my-deals';
  const showingMyBids = creatorApp && purePath === '/my-bids';
  const showingSaved = creatorApp && purePath === '/saved-briefs';
  // Static policy pages — the last routes that used to drop the user onto the
  // website. They now render natively.
  const LEGAL_PATHS: LegalDocId[] = [
    '/privacy-policy',
    '/terms',
    '/community-guidelines',
    '/cookie-policy',
  ];
  const legalDocId = LEGAL_PATHS.find(path => path === purePath);
  const showingLegal = mobileDashboard && !!legalDocId;
  const showingPrivacy =
    mobileDashboard && purePath === '/app/privacy-security';
  const showingFollowUs = mobileDashboard && purePath === '/app/follow-us';
  const showingNotificationSettings =
    mobileDashboard && purePath === '/app/notification-settings';

  // Secondary screens reached from elsewhere rather than from the tab bar.
  // They carry a back arrow in their own header, so the bottom nav is hidden
  // to keep a single, unambiguous way out.
  const hidesBottomNav =
    showingBrandShipments ||
    showingBrandBids ||
    // Messages and a chat thread are focused tasks with their own back arrow.
    // The thread also puts its composer flush against the bottom edge, and the
    // floating bar was rendering on top of it — the "Type a message..." field
    // was there all along, just covered.
    showingBrandMessages ||
    showingChat ||
    // Posting a campaign is a full-screen form: the floating bar would sit on
    // top of the fields and its own footer action.
    showingBrandPostBrief ||
    showingBrandWorkReview ||
    showingReviews ||
    // Creator secondary screens, all reached from the profile menu or a card
    // rather than from a tab, and all carrying their own back arrow.
    showingMyDeals ||
    showingMyBids ||
    showingSaved ||
    showingKyc ||
    showingKycSubmit ||
    showingSettings ||
    showingBrandSettings ||
    showingCreatorSettings ||
    showingNotificationSettings ||
    showingPrivacy ||
    // The public profile is full-bleed: a cover banner at the top and a pinned
    // Send Message bar at the bottom, both of which the nav would sit on.
    showingCreatorPublic ||
    showingFollowUs;

  // True whenever a native screen has replaced the WebView. The WebView is
  // unmounted in that case, so its own back history cannot be used.
  const showingNative =
    showingCreatorHome ||
    showingBrowseCampaigns ||
    showingActiveWork ||
    showingKyc ||
    showingKycSubmit ||
    showingEarnings ||
    showingWithdrawalForm ||
    showingReviews ||
    showingPrivacy ||
    showingFollowUs ||
    showingNotificationSettings ||
    showingCreatorProfile ||
    showingSettings ||
    showingBrandSettings ||
    showingCreatorSettings ||
    showingBrandCampaigns ||
    showingBrandCreators ||
    showingCreatorPublic ||
    showingBrandWallet ||
    showingBrandBids ||
    showingBrandWorkReview ||
    showingBrandShipments ||
    showingBrandMessages ||
    showingChat ||
    showingBrandPostBrief ||
    showingBrandCampaignDetail ||
    showingBrandShipmentDetail ||
    showingMyDeals ||
    showingMyBids ||
    showingSaved ||
    showingLegal ||
    showingProfileMenu;

  const reload = useCallback(() => {
    setErrored(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  /**
   * Pushes a new screen, remembering where we came from. The push reads
   * `currentPath` directly rather than queueing setHistory from inside
   * setCurrentPath's updater: updaters must stay pure, and nesting one state
   * setter inside another double-pushed the entry whenever React re-ran it,
   * which made Back need two presses to leave a screen.
   */
  const navigateTo = useCallback(
    (target: string) => {
      // Notification links can carry absolute URLs. Internal ones fold back
      // to a path; anything else belongs to the system browser, not the shell.
      if (/^https?:\/\//i.test(target)) {
        if (!isInternal(target)) {
          Linking.openURL(target).catch(() => {});
          return;
        }
        target = target.replace(/^https?:\/\/[^/]*/i, '') || '/';
      }
      const path = normalizePath(target);
      if (currentPath !== path) {
        setHistory(stack => [...stack, currentPath]);
      }
      setCurrentPath(path);
      setWebPath(path);
    },
    [currentPath],
  );

  /**
   * Steps back one screen. Returns false when there is nowhere left to go,
   * which is the signal to let Android close the app.
   */
  const goBack = useCallback((): boolean => {
    if (history.length === 0) {
      return false;
    }
    const previous = history[history.length - 1];
    // Returning to a web path remounts the WebView at that URL, which fires
    // onNavigationStateChange; the flag stops it re-pushing what we just popped.
    goingBack.current = true;
    setHistory(stack => stack.slice(0, -1));
    setCurrentPath(previous);
    setWebPath(previous);
    return true;
  }, [history]);

  /**
   * Back target for a screen's own back / close button. Returns to whatever the
   * user actually came from, so opening Messages (or any screen) from Browse
   * returns to Browse rather than to a hardcoded page. `fallback` is only used
   * on a cold entry, when there is no history to pop.
   */
  const backTo = useCallback(
    (fallback: string) => () => {
      if (!goBack()) {
        navigateTo(fallback);
      }
    },
    [goBack, navigateTo],
  );

  // Hardware back closes overlays first, then walks back through the screens
  // we pushed, then through the WebView's own history. Only when all three are
  // exhausted do we return false and let Android exit the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (feedOpen) {
        setFeedOpen(false);
        return true;
      }
      if (errored) {
        return goBack();
      }
      // A native screen is on top: it has no WebView history of its own, so
      // our stack is the only thing that can move us backwards.
      if (showingNative) {
        return goBack();
      }
      if (canGoBack.current) {
        goingBack.current = true;
        webRef.current?.goBack();
        return true;
      }
      return goBack();
    });
    return () => sub.remove();
  }, [errored, feedOpen, goBack, showingNative]);

  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
    try {
      const path = new URL(nav.url).pathname;
      if (goingBack.current) {
        goingBack.current = false;
        setCurrentPath(path);
        return;
      }
      // Links followed inside the WebView also become history entries, so the
      // back button treats web and native screens the same way.
      setCurrentPath(prev => {
        if (prev !== path) {
          setHistory(stack => [...stack, prev]);
        }
        return path;
      });
    } catch {}
  }, []);

  // Keep third-party flows (OAuth, payments, mailto/tel) out of the webview.
  const onShouldStartLoad = useCallback((req: ShouldStartLoadRequest) => {
    const { url } = req;

    if (url.startsWith('about:') || url.startsWith('data:')) {
      return true;
    }

    if (!/^https?:\/\//i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }

    if (isInternal(url)) {
      return true;
    }

    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const onLoadEnd = useCallback(() => {
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onError = useCallback(() => {
    setErrored(true);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
  }, []);

  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'right', 'bottom', 'left']}
    >
      {/* RN 0.87 is edge-to-edge; the bar is translucent and takes no colour prop. */}
      <StatusBar barStyle="dark-content" />

      {showingCreatorHome ? (
        <CreatorHome
          token={token}
          session={session}
          onBrowse={() => navigateTo('/browse-briefs')}
          onOpenNotifications={() => setFeedOpen(true)}
          onOpenMessages={() => navigateTo('/messages')}
          onOpenProfile={() => navigateTo('/app/profile')}
          onOpenEarnings={() => navigateTo('/withdrawal')}
          onOpenDeals={() => navigateTo('/my-deals')}
        />
      ) : showingBrowseCampaigns ? (
        <BrowseCampaigns
          token={token}
          session={session}
          unread={unread}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingActiveWork ? (
        <ActiveWork
          token={token}
          session={session}
          unread={unread}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
          onOpenThread={(userId, name) => {
            setChatName(name);
            navigateTo(`/messages/${userId}`);
          }}
        />
      ) : showingKyc ? (
        <KycVerification
          token={token}
          session={session}
          unread={unread}
          onBack={backTo('/dashboard/creator')}
          onGoToEarnings={() => navigateTo('/withdrawal')}
          onUpdateDetails={() => navigateTo('/kyc/edit')}
          onMessages={() => navigateTo('/messages')}
          onNotifications={() => setFeedOpen(true)}
          onContactSupport={() =>
            Linking.openURL('mailto:support@ugcad.io').catch(() => {})
          }
        />
      ) : showingEarnings ? (
        <Earnings
          token={token}
          session={session}
          unread={unread}
          onRequestWithdrawal={() => navigateTo('/withdrawal/new')}
          onMessages={() => navigateTo('/messages')}
          onNotifications={() => setFeedOpen(true)}
        />
      ) : showingReviews ? (
        <Reviews
          token={token}
          session={session}
          unread={unread}
          onBack={backTo('/app/profile')}
          onMessages={() => navigateTo('/messages')}
          onNotifications={() => setFeedOpen(true)}
        />
      ) : showingPrivacy ? (
        <PrivacySecurity
          onBack={backTo('/app/profile')}
          onNavigate={navigateTo}
          unread={unread}
        />
      ) : showingFollowUs ? (
        <FollowUs
          onBack={backTo('/app/profile')}
          onNavigate={navigateTo}
          unread={unread}
        />
      ) : showingNotificationSettings ? (
        <NotificationSettings
          token={token}
          session={session}
          onBack={backTo('/app/profile')}
          onChat={() => navigateTo('/messages')}
        />
      ) : showingCreatorProfile ? (
        <CreatorProfile
          token={token}
          session={session}
          onNavigate={navigateTo}
          onLogout={onLogout}
        />
      ) : showingBrandSettings ? (
        <BrandSettings
          token={token}
          onBack={backTo('/app/settings')}
        />
      ) : showingBrandCampaigns ? (
        <BrandCampaigns
          token={token}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingBrandCreators ? (
        <BrandCreators
          token={token}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
          onOpenCreator={creator => {
            setCreatorSeed(creator);
            navigateTo(`/creator/${creator.id}`);
          }}
        />
      ) : showingCreatorPublic ? (
        <CreatorPublicProfile
          token={token}
          creatorId={creatorMatch![1]}
          seed={
            creatorSeed && String(creatorSeed.id) === creatorMatch![1]
              ? (creatorSeed as never)
              : null
          }
          onBack={backTo('/dashboard/business/browse-creator')}
          onMessage={() => navigateTo(`/messages/${creatorMatch![1]}`)}
          onSendBrief={() => navigateTo('/dashboard/business/post-brief')}
        />
      ) : showingBrandWallet ? (
        <BrandWallet
          token={token}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingBrandBids ? (
        <BrandBids
          token={token}
          onBack={backTo('/dashboard/business/all-campaigns')}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingBrandWorkReview ? (
        <BrandWorkReview
          token={token}
          onBack={backTo('/dashboard/business/all-campaigns')}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingBrandShipments ? (
        <BrandShipments
          token={token}
          onBack={backTo('/dashboard/business/all-campaigns')}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingBrandPostBrief ? (
        <BrandPostBrief
          token={token}
          onBack={backTo('/dashboard/business/all-campaigns')}
          onDone={id =>
            navigateTo(
              id ? `/campaigns/${id}` : '/dashboard/business/all-campaigns',
            )
          }
        />
      ) : showingBrandCampaignDetail ? (
        <BrandCampaignDetail
          token={token}
          campaignId={campaignMatch![1]}
          onBack={backTo('/dashboard/business/all-campaigns')}
          onNavigate={navigateTo}
          onOpenThread={(userId, nickname) => {
            setChatName(nickname);
            navigateTo(`/messages/${userId}`);
          }}
        />
      ) : showingBrandShipmentDetail ? (
        <BrandShipmentDetail
          token={token}
          campaignId={shipmentMatch![1]}
          onBack={backTo('/dashboard/business/shipments')}
        />
      ) : showingChat ? (
        <BrandChatThread
          token={token}
          session={session}
          otherUserId={chatMatch![1]}
          title={chatName}
          onBack={backTo('/messages')}
          onNavigate={navigateTo}
        />
      ) : showingBrandMessages ? (
        <BrandMessages
          token={token}
          onNavigate={navigateTo}
          onOpenThread={(userId, nickname) => {
            setChatName(nickname);
            navigateTo(`/messages/${userId}`);
          }}
          onBack={backTo(homePath)}
        />
      ) : showingMyDeals ? (
        <MyDeals
          token={token}
          unread={unread}
          onBack={backTo('/app/profile')}
          onMessages={() => navigateTo('/messages')}
          onOpenThread={(userId, name) => {
            setChatName(name);
            navigateTo(`/messages/${userId}`);
          }}
        />
      ) : showingKycSubmit ? (
        <KycSubmit onBack={backTo('/kyc')} />
      ) : showingWithdrawalForm ? (
        <WithdrawalRequest
          token={token}
          available={Number(session.balance || 0)}
          onBack={backTo('/withdrawal')}
          onVerifyKyc={() => navigateTo('/kyc')}
        />
      ) : showingCreatorSettings ? (
        <CreatorSettings
          token={token}
          session={session}
          onBack={backTo('/app/settings')}
        />
      ) : showingMyBids ? (
        <MyBids
          token={token}
          unread={unread}
          onBack={backTo('/app/profile')}
          onMessages={() => navigateTo('/messages')}
        />
      ) : showingSaved ? (
        <SavedBriefs
          token={token}
          onBack={backTo('/app/profile')}
          onBrowse={() => navigateTo('/browse-briefs')}
        />
      ) : showingLegal ? (
        <LegalDocument
          docId={legalDocId!}
          onBack={backTo('/app/privacy-security')}
        />
      ) : showingSettings ? (
        <AppSettings onBack={backTo('/app/profile')} onNavigate={navigateTo} />
      ) : showingProfileMenu ? (
        <AppProfileMenu
          session={session}
          onNavigate={navigateTo}
          onNotifications={() => setFeedOpen(true)}
          onMessages={() => navigateTo('/messages')}
          onLogout={onLogout}
        />
      ) : errored ? (
        // Pull-to-refresh needs a scrollable parent, hence the ScrollView.
        <ScrollView
          contentContainerStyle={styles.errorBox}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <Text style={styles.errorTitle}>Can't reach UGCad</Text>
          <Text style={styles.errorBody}>
            Check your internet connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: `${SITE_ORIGIN}${webPath}` }}
          injectedJavaScriptBeforeContentLoaded={`localStorage.setItem('token', ${JSON.stringify(
            token,
          )}); true;`}
          style={styles.web}
          // --- session persistence: keeps users logged in across restarts ---
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          cacheEnabled
          // --- file uploads from camera / gallery ---
          allowFileAccess
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // --- navigation control ---
          onNavigationStateChange={onNavStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          setSupportMultipleWindows={false}
          // --- lifecycle ---
          onLoadEnd={onLoadEnd}
          onError={onError}
          onHttpError={onError}
          pullToRefreshEnabled
          overScrollMode="never"
          renderLoading={() => <View />}
          injectedJavaScript={
            mobileDashboard ? MOBILE_APP_LAYOUT_SCRIPT : undefined
          }
        />
      )}

      {/* The spinner belongs to the WebView, so it only shows when the WebView
          is what's mounted — showingNative already tracks that for every
          native route, new ones included. */}
      {loading && !errored && !showingNative && (
        <View
          style={[styles.loader, mobileDashboard && styles.loaderWithNav]}
          pointerEvents="none"
        >
          <ActivityIndicator size="large" color={THEME_COLOR} />
        </View>
      )}

      <NotificationFeed
        token={token}
        visible={feedOpen}
        onClose={() => setFeedOpen(false)}
        onNavigate={navigateTo}
      />

      {mobileDashboard && !hidesBottomNav && (
        <AppBottomNav
          role={session.role as 'creator' | 'business'}
          currentPath={purePath}
          onNavigate={navigateTo}
        />
      )}
    </SafeAreaView>
  );
}

const MOBILE_APP_LAYOUT_SCRIPT = `(function(){
  var s=document.getElementById('ugcapp-native-shell');
  if(!s){
    s=document.createElement('style');
    s.id='ugcapp-native-shell';
    s.textContent='html,body,#root{width:100%!important;max-width:100%!important;overflow-x:hidden!important}.pcd-sidebar,.pcd-hamburger{display:none!important}.pcd-shell{display:block!important;width:100%!important;max-width:100%!important;min-height:100%!important}.pcd-main{margin-left:0!important;width:100%!important;max-width:100%!important}.pcd-topbar{width:100%!important;max-width:100%!important;min-height:58px!important;padding:10px 12px!important;box-sizing:border-box!important}.pcd-content{width:100%!important;max-width:100%!important;padding:12px!important;box-sizing:border-box!important}.pcd-table-wrap{max-width:100%!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch}.pcd-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}img,video,canvas{max-width:100%}input,select,textarea{max-width:100%;box-sizing:border-box}[role=dialog]{max-width:calc(100vw - 24px)!important}@media(max-width:600px){.pcd-topbar h1{font-size:18px!important}.pcd-topbar p{font-size:11px!important}.pcd-top-actions{gap:6px!important}.pcd-logout{display:none!important}.pcd-content{padding:10px!important}.pcd-stat-grid{gap:10px!important}}';
    document.head.appendChild(s);
  }
})();true;`;

type NavIconName =
  | 'home'
  | 'campaigns'
  | 'creators'
  | 'deals'
  | 'earnings'
  | 'messages'
  | 'profile'
  | 'plus'
  | 'wallet';

function NavIcon({
  name,
  color,
  size = 22,
}: {
  name: NavIconName;
  color: string;
  /** Tab-bar icons run larger than the FAB's "+", hence the override. */
  size?: number;
}) {
  const shared = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      {/* Four-square grid, matching the Dashboard tab in the app design. */}
      {name === 'home' && (
        <>
          <Rect x={3.5} y={3.5} width={7} height={7} rx={1.8} {...shared} />
          <Rect x={13.5} y={3.5} width={7} height={7} rx={1.8} {...shared} />
          <Rect x={3.5} y={13.5} width={7} height={7} rx={1.8} {...shared} />
          <Rect x={13.5} y={13.5} width={7} height={7} rx={1.8} {...shared} />
        </>
      )}
      {/* Briefcase: campaigns are the work on offer. */}
      {name === 'campaigns' && (
        <>
          <Rect x={3} y={7.5} width={18} height={12.5} rx={2.5} {...shared} />
          <Path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" {...shared} />
          <Path d="M3 12.5h18" {...shared} />
        </>
      )}
      {/* Clipboard with a tick — work in progress. */}
      {name === 'deals' && (
        <>
          <Rect x={5} y={4.5} width={14} height={16} rx={2.5} {...shared} />
          <Path
            d="M9 4.5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7Z"
            {...shared}
          />
          <Path d="m9.2 13 2 2 3.6-3.8" {...shared} />
        </>
      )}
      {/* Wallet — reads better at 22px than a rupee-in-a-circle. */}
      {name === 'earnings' && (
        <>
          <Rect x={3} y={6} width={18} height={13} rx={3} {...shared} />
          <Path d="M3 10.5h18" {...shared} />
          <Circle cx="16.5" cy="15" r="1.1" fill={color} />
        </>
      )}
      {name === 'creators' && (
        <>
          <Circle cx="9" cy="8" r="3" {...shared} />
          <Circle cx="17" cy="9" r="2.3" {...shared} />
          <Path
            d="M3.5 20a5.5 5.5 0 0 1 11 0M14 15.2a4.5 4.5 0 0 1 6.5 4"
            {...shared}
          />
        </>
      )}
      {/* Rounded speech bubble with a tail, as drawn in the design. */}
      {name === 'messages' && (
        <>
          <Path
            d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5Z"
            {...shared}
          />
          <Circle cx="8.8" cy="10" r=".9" fill={color} />
          <Circle cx="12" cy="10" r=".9" fill={color} />
          <Circle cx="15.2" cy="10" r=".9" fill={color} />
        </>
      )}
      {/* Person inside a ring — the design shows a circular avatar outline. */}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="12" r="9" {...shared} />
          <Circle cx="12" cy="9.8" r="3" {...shared} />
          <Path d="M6.6 19a5.7 5.7 0 0 1 10.8 0" {...shared} />
        </>
      )}
      {/* Centre action on the brand nav — post a campaign. */}
      {name === 'plus' && <Path d="M12 5.5v13M5.5 12h13" {...shared} />}
      {name === 'wallet' && (
        <>
          <Rect x={3.5} y={6} width={17} height={13} rx={2.5} {...shared} />
          <Path d="M3.5 10.5h17M16 14.5h1.5" {...shared} />
        </>
      )}
    </Svg>
  );
}

/**
 * The white pill behind the nav icons, drawn as a path so the top edge can dip
 * into a concave notch around the centre "+". A plain View can only round its
 * corners, so the white would otherwise run straight behind the button.
 *
 * The path runs clockwise from the bottom-left: up the left side, along the top
 * to the notch, around the scoop, on to the right corner, then back along the
 * bottom. `width` comes from onLayout because the bar is full-width and the
 * notch has to land dead centre of whatever that measures.
 */
function NavBarShape({ width }: { width: number }) {
  const h = NAV_BAR_HEIGHT;
  const r = NAV_RADIUS;
  const mid = width / 2;
  const n = NOTCH_RADIUS;
  // Where the top edge leaves and rejoins the straight line.
  const left = mid - n;
  const right = mid + n;

  const d = [
    `M0 ${h - r}`,
    `V${r}`,
    `A${r} ${r} 0 0 1 ${r} 0`,
    `H${left}`,
    // The scoop: a half-circle centred on the top edge, so it matches the FAB,
    // whose own centre sits on that same line (navDock pads by FAB_SIZE / 2).
    // sweep-flag 0 makes it curve downwards into the bar.
    `A${n} ${n} 0 0 0 ${right} 0`,
    `H${width - r}`,
    `A${r} ${r} 0 0 1 ${width} ${r}`,
    `V${h - r}`,
    `A${r} ${r} 0 0 1 ${width - r} ${h}`,
    `H${r}`,
    `A${r} ${r} 0 0 1 0 ${h - r}`,
    'Z',
  ].join(' ');

  return (
    <Svg width={width} height={h} style={styles.navShape}>
      <Path d={d} fill={NAV_SURFACE} />
    </Svg>
  );
}

function AppBottomNav({
  role,
  currentPath,
  onNavigate,
}: {
  role: 'creator' | 'business';
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  // The dock is absolutely positioned, so it anchors to the padding box's edge
  // and ignores SafeAreaView's bottom padding. Add the inset back by hand, or
  // the pill sits inside the system gesture bar.
  const insets = useSafeAreaInsets();
  // Measured width of the pill. The notch has to be centred on the real bar
  // width, which depends on the screen, so it can't be a constant.
  const [barWidth, setBarWidth] = useState(0);
  type NavItem = {
    label: string;
    icon: NavIconName;
    path: string;
    /**
     * Paths that light this tab up. A plain string also matches nested routes
     * (`/x` covers `/x/123`); `{ path, exact: true }` matches only itself, for
     * landing routes that are a prefix of sibling tabs' paths.
     */
    matches: Array<string | { path: string; exact: true }>;
    /** Renders as the raised centre "+" button instead of a normal tab. */
    fab?: boolean;
  };

  const creatorItems: NavItem[] = [
    {
      label: 'Home',
      icon: 'home',
      path: '/dashboard/creator',
      matches: [{ path: '/dashboard/creator', exact: true }],
    },
    {
      label: 'Campaigns',
      icon: 'campaigns',
      path: '/browse-briefs',
      matches: ['/browse-briefs', '/my-bids'],
    },
    {
      label: 'Active Work',
      icon: 'deals',
      path: '/my-active-work',
      matches: ['/my-active-work', '/my-deals'],
    },
    {
      label: 'Earnings',
      icon: 'earnings',
      path: '/withdrawal',
      matches: ['/withdrawal'],
    },
    {
      label: 'Profile',
      icon: 'profile',
      path: '/app/profile',
      matches: [
        '/app/profile',
        '/app/settings',
        '/app/privacy-security',
        '/app/follow-us',
        '/settings',
        '/portfolio',
        '/reviews',
      ],
    },
  ];

  const businessItems: NavItem[] = [
    {
      label: 'Creators',
      icon: 'creators',
      path: '/dashboard/business/browse-creator',
      matches: ['/dashboard/business/browse-creator', '/browse-approved-gigs'],
    },
    {
      label: 'Campaigns',
      icon: 'campaigns',
      path: '/dashboard/business/all-campaigns',
      matches: [
        '/dashboard/business/all-campaigns',
        '/dashboard/business/pending-bids',
        '/dashboard/business/work-review',
        '/dashboard/business/shipments',
      ],
    },
    // Centre action: posting a campaign is the brand's primary job, so it gets
    // the raised "+" instead of a labelled tab.
    {
      label: 'Post',
      icon: 'plus',
      path: '/dashboard/business/post-brief',
      matches: ['/dashboard/business/post-brief'],
      fab: true,
    },
    {
      label: 'Wallet',
      icon: 'wallet',
      path: '/dashboard/business/wallet',
      matches: ['/dashboard/business/wallet'],
    },
    {
      label: 'Profile',
      icon: 'profile',
      path: '/app/profile',
      matches: [
        '/app/profile',
        '/app/settings',
        '/app/privacy-security',
        '/app/follow-us',
        '/settings',
        '/reviews',
      ],
    },
  ];

  const items = role === 'creator' ? creatorItems : businessItems;

  // The raised centre action is pulled out of the row so it can sit in the
  // bar's notch; the remaining items split the bar evenly around it.
  const fabItem = items.find(item => item.fab);
  const rowItems = items.filter(item => !item.fab);
  const isActive = (item: NavItem) =>
    item.matches.some(match => {
      if (typeof match !== 'string') return currentPath === match.path;
      return currentPath === match || currentPath.startsWith(`${match}/`);
    });

  // The gap goes in the middle of the row, so the icons split evenly either
  // side of the centre button rather than bunching to one end.
  const splitAt = Math.ceil(rowItems.length / 2);

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    const color = active ? ACTIVE_TINT : INACTIVE_TINT;

    return (
      <TouchableOpacity
        key={item.label}
        style={styles.navItem}
        onPress={() => onNavigate(item.path)}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
      >
        <NavIcon name={item.icon} color={color} size={NAV_ICON_SIZE} />
        {/* Active state is a dot under the icon, not a label. Drawn as an SVG
            circle rather than a rounded View: at 6dp a View's corner radius
            lands on a fractional pixel and Android's renderer squares it off,
            which no borderRadius value reliably fixed. The <Svg> box is always
            rendered so the row never shifts when the active tab changes; only
            the circle's fill switches. */}
        <Svg width={DOT_SIZE} height={DOT_SIZE}>
          <Circle
            cx={DOT_SIZE / 2}
            cy={DOT_SIZE / 2}
            r={DOT_SIZE / 2}
            fill={active ? ACTIVE_TINT : 'transparent'}
          />
        </Svg>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[styles.navDock, { paddingBottom: 10 + insets.bottom }]}
      pointerEvents="box-none"
    >
      <View
        style={[styles.bottomNav, !!fabItem && styles.bottomNavNotched]}
        onLayout={event => setBarWidth(event.nativeEvent.layout.width)}
      >
        {/* The notched white pill. Only drawn once the width is measured; the
            icons still lay out underneath, so nothing jumps on first paint. */}
        {!!fabItem && barWidth > 0 && <NavBarShape width={barWidth} />}
        {rowItems.slice(0, splitAt).map(renderItem)}
        {/* Spacer holding open the gap the centre button sits in. */}
        {!!fabItem && <View style={styles.fabSlot} />}
        {rowItems.slice(splitAt).map(renderItem)}
      </View>

      {!!fabItem && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => onNavigate(fabItem.path)}
          accessibilityRole="button"
          accessibilityLabel="Post a campaign"
          activeOpacity={0.85}
        >
          <NavIcon name={fabItem.icon} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#ffffff' },
  // Transparent dock: holds the floating pill and the raised centre button,
  // and lets taps through the gap on either side of the bar.
  // Floats over the content rather than taking layout height, so screens
  // scroll behind the pill. Scrollable screens pad their content by
  // NAV_CLEARANCE so the last item still clears it.
  navDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: scale(16),
    paddingBottom: scale(10),
    paddingTop: FAB_SIZE / 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  bottomNav: {
    width: '100%',
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NAV_SURFACE,
    borderRadius: NAV_RADIUS,
    shadowColor: '#0B0C24',
    shadowOpacity: 0.22,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: scale(6) },
    elevation: 10,
  },
  // With a notch the white comes from the SVG path instead, so the View itself
  // goes transparent — a solid background would fill the scoop back in. The
  // shadow goes with it: Android draws `elevation` from the background shape,
  // so leaving it here would cast a square shadow across the scoop.
  bottomNavNotched: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  // The drawn pill. iOS shadows follow the path's alpha, so the notch stays
  // clean; Android has no elevation to give a bare SVG, so it renders flat.
  navShape: {
    position: 'absolute',
    top: 0,
    left: 0,
    shadowColor: '#0B0C24',
    shadowOpacity: 0.22,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: scale(6) },
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
    height: '100%',
  },
  // Reserves the centre gap so the four icons sit either side of the button.
  fabSlot: { width: FAB_SIZE },
  // Raised centre action, overlapping the top edge of the pill.
  fab: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: FAB_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3D4FD8',
    shadowOpacity: 0.4,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(6) },
    elevation: 12,
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loaderWithNav: { bottom: NAV_CLEARANCE },
  errorBox: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(32),
  },
  errorTitle: {
    fontSize: fontScale(20),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '600',
    color: '#111827',
  },
  errorBody: {
    marginTop: scale(8),
    fontSize: fontScale(15),
    color: '#6b7280',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: scale(24),
    paddingHorizontal: scale(32),
    paddingVertical: scale(12),
    borderRadius: scale(8),
    backgroundColor: THEME_COLOR,
  },
  retryText: {
    color: '#ffffff',
    fontSize: fontScale(16),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
});

export default WebShell;
