/**
 * Chat thread — the native message view for one conversation, replacing the
 * web chat page. Reads GET /api/chat/{other_user_id} and sends through
 * POST /api/chat/send. Offer / counter-offer / dispute cards are shown here
 * read-only and link to the campaign they belong to; acting on them moves
 * money, so those decisions live on the campaign screen rather than in chat.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonBlock } from '../components/Skeleton';
import {
  BACKEND_URL,
  getConversations,
  getMessages,
  respondToActionCard,
  sendActionCard,
  sendMessage,
  type ActionCardResponse,
  type ActionCardType,
  type AuthUser,
} from '../api';
import {
  ACTION_CARD_FIELDS,
  ACTION_CARD_LABELS,
  ACTION_CARD_LIMITS,
  DECLINE_REASONS,
  OFFER_CARD_TYPES,
  RESPONSE_LABELS,
  availableCards,
  initialForm,
  validateCard,
} from '../actionCards';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  session: AuthUser;
  /** The person on the other side of this thread. */
  otherUserId: string;
  /** Shown in the header until the first message resolves a better name. */
  title?: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
};

type Item = Record<string, any> & { id: string };

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/** "12:52" — the time stamp under each bubble. */
function clock(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
      {name === 'send' && <Path d="M4 12 20 4l-8 16-2.2-6.2L4 12Z" {...line} />}
      {name === 'clip' && (
        <Path
          d="M15.5 8 9.2 14.3a2.4 2.4 0 0 0 3.4 3.4l6.6-6.6a4.3 4.3 0 0 0-6-6l-6.7 6.6a6.2 6.2 0 0 0 8.8 8.8l5.6-5.6"
          {...line}
        />
      )}
      {name === 'brief' && (
        <>
          <Path d="M6.5 3.5h7l4.5 4.5v12h-11.5z" {...line} />
          <Path d="M13.5 3.5V8H18M9 12h6M9 15.5h4" {...line} />
        </>
      )}
      {name === 'dots' && (
        <>
          <Circle cx="5.5" cy="12" r="1.5" fill={color} />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="18.5" cy="12" r="1.5" fill={color} />
        </>
      )}
      {name === 'chat' && (
        <Path d="M4 5.5h16v11H9.5L5.5 20v-3.5H4z" {...line} />
      )}
      {name === 'tag' && (
        <>
          <Path d="M3.5 11.2V4h7.2l9 9-7.2 7.2-9-9Z" {...line} />
          <Circle cx="7.6" cy="7.6" r="1.4" {...line} />
        </>
      )}
      {name === 'shield' && (
        <Path d="M12 3.5 5.5 6v5.5c0 4 2.7 7.2 6.5 8.5 3.8-1.3 6.5-4.5 6.5-8.5V6L12 3.5Z" {...line} />
      )}
      {name === 'flag' && (
        <Path d="M6 21V4m0 .8h11l-2.2 4 2.2 4H6" {...line} />
      )}
      {name === 'note' && (
        <>
          <Path d="M5 4.5h14v15H5z" {...line} />
          <Path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" {...line} />
        </>
      )}
      {name === 'milestone' && (
        <>
          <Circle cx="12" cy="12" r="8.2" {...line} />
          <Path d="M12 7.4V12l3 1.8" {...line} />
        </>
      )}
      {name === 'alert' && (
        <>
          <Path d="M12 4.2 2.8 20h18.4L12 4.2Z" {...line} />
          <Path d="M12 10v4M12 17h.01" {...line} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...line} />}
      {name === 'chevron' && <Path d="m9 5 7 7-7 7" {...line} />}
    </Svg>
  );
}

/** Icon per card type, matching the web quick-action row. */
const CARD_ICONS: Record<ActionCardType, string> = {
  private_invitation: 'chat',
  custom_offer: 'tag',
  counter_offer: 'tag',
  revision_request: 'note',
  milestone_update: 'milestone',
  damage_report: 'alert',
  escalate_to_admin: 'shield',
  raise_dispute: 'flag',
};

/** "modified price" — card field keys are snake_case; show them as words. */
const humanise = (key: string) => key.replace(/_/g, ' ');

/** Card values may arrive as arrays or nested objects; flatten for display. */
function fieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map(entry =>
        entry && typeof entry === 'object'
          ? Object.values(entry).filter(Boolean).join(' - ')
          : String(entry),
      )
      .join(', ');
  }
  if (value && typeof value === 'object') {
    return Object.values(value).filter(Boolean).join(' - ');
  }
  return String(value ?? '');
}

/**
 * One structured offer / request in the thread.
 *
 * Response buttons appear only when the backend would actually accept them:
 * we must be the recipient (`!mine`), the card must still be `open`, and the
 * action must be in `available_actions` — which the backend omits entirely for
 * cards that take no response (milestone updates, escalations, disputes).
 */
function ActionCard({
  item,
  mine,
  busy,
  declining,
  declineReason,
  declineNote,
  onDeclineReason,
  onDeclineNote,
  onStartDecline,
  onCancelDecline,
  onSubmitDecline,
  onCounter,
  onRespond,
  onOpenDeal,
}: {
  item: Item;
  mine: boolean;
  busy: boolean;
  declining: boolean;
  declineReason: string;
  declineNote: string;
  onDeclineReason: (value: string) => void;
  onDeclineNote: (value: string) => void;
  onStartDecline: () => void;
  onCancelDecline: () => void;
  onSubmitDecline: () => void;
  onCounter: () => void;
  onRespond: (action: ActionCardResponse) => void;
  onOpenDeal?: () => void;
}) {
  const type = item.type as ActionCardType | undefined;
  const label = (type && ACTION_CARD_LABELS[type]) || humanise(String(type || 'Update'));
  const status = String(item.card_status || 'open');
  const fields: Record<string, unknown> = item.fields || {};
  const actions: ActionCardResponse[] = Array.isArray(item.available_actions)
    ? item.available_actions
    : [];
  const canRespond = !mine && status === 'open' && actions.length > 0;

  return (
    <View style={[styles.card, mine && styles.cardMine]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon
            name={(type && CARD_ICONS[type]) || 'note'}
            color="#3D4FD8"
            size={14}
          />
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.cardStatus, STATUS_TINT[status]]}>
          <Text style={styles.cardStatusText}>{status}</Text>
        </View>
      </View>

      {/* Six is what the web card shows; more would bury the buttons. */}
      {Object.keys(fields)
        .slice(0, 6)
        .map(key => (
          <View key={key} style={styles.cardRow}>
            <Text style={styles.cardKey}>{humanise(key)}</Text>
            <Text style={styles.cardVal} numberOfLines={3}>
              {fieldValue(fields[key])}
            </Text>
          </View>
        ))}

      {canRespond && !declining && (
        <View style={styles.cardActions}>
          {actions.map(action => {
            // Declining an offer needs a structured reason, so that button
            // opens the picker rather than firing the reject straight away.
            const needsReason =
              action === 'reject' && OFFER_CARD_TYPES.includes(type!);
            const primary = action === 'accept';
            return (
              <TouchableOpacity
                key={action}
                style={[styles.cardBtn, primary && styles.cardBtnPrimary]}
                disabled={busy}
                onPress={() => {
                  if (action === 'counter') return onCounter();
                  if (needsReason) return onStartDecline();
                  onRespond(action);
                }}
                accessibilityRole="button"
              >
                {busy && primary ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text
                    style={[
                      styles.cardBtnText,
                      primary && styles.cardBtnTextPrimary,
                    ]}
                  >
                    {RESPONSE_LABELS[action] || humanise(action)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {declining && (
        <View style={styles.decline}>
          <Text style={styles.declineLabel}>Reason for declining</Text>
          <View style={styles.declineOptions}>
            {DECLINE_REASONS.map(reason => {
              const on = declineReason === reason.value;
              return (
                <TouchableOpacity
                  key={reason.value}
                  style={[styles.declineChip, on && styles.declineChipOn]}
                  onPress={() => onDeclineReason(reason.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.declineChipText,
                      on && styles.declineChipTextOn,
                    ]}
                  >
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.declineNote}
            value={declineNote}
            onChangeText={onDeclineNote}
            placeholder="Optional comment (no contact details)"
            placeholderTextColor="#A9ADC2"
            multiline
          />
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.cardBtn}
              onPress={onCancelDecline}
              accessibilityRole="button"
            >
              <Text style={styles.cardBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardBtn, styles.cardBtnPrimary]}
              onPress={onSubmitDecline}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={[styles.cardBtnText, styles.cardBtnTextPrimary]}>
                  Send decline
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* An accepted invitation is the brand's cue to post the real brief. */}
      {status === 'accepted' && type === 'private_invitation' && !mine && (
        <Text style={styles.cardNote}>
          Accepted — waiting for the brand to post the brief.
        </Text>
      )}

      {!!onOpenDeal && (
        <TouchableOpacity
          style={styles.cardLink}
          onPress={onOpenDeal}
          accessibilityRole="button"
        >
          <Text style={styles.cardLinkText}>Open the campaign</Text>
          <Icon name="chevron" color="#3D4FD8" size={13} />
        </TouchableOpacity>
      )}

      <Text style={styles.cardTime}>
        {clock(item.timestamp || item.created_at)}
      </Text>
    </View>
  );
}

/** Status pill colour per card state. */
const STATUS_TINT: Record<string, { backgroundColor: string }> = {
  open: { backgroundColor: '#EEF0FE' },
  accepted: { backgroundColor: '#E7F7EE' },
  rejected: { backgroundColor: '#FDECEC' },
  countered: { backgroundColor: '#FFF4E5' },
  partial: { backgroundColor: '#FFF4E5' },
  expired: { backgroundColor: '#F1F2F8' },
};

function BrandChatThread({
  token,
  session,
  otherUserId,
  title,
  onBack,
  onNavigate,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();

  /**
   * The composer sits on the system gesture bar and pads itself by the bottom
   * inset to clear it. While the keyboard is up that inset is meaningless — the
   * gesture bar is covered — and keeping it would float the bar above the
   * keyboard, which is what left the visible gap. So the padding collapses to
   * the base value whenever the keyboard is showing.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardUp = keyboardHeight > 0;

  useEffect(() => {
    // 'Will' events fire before the animation on iOS; Android only has 'Did'.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      // The event carries the keyboard's own height. Under the forced
      // edge-to-edge window this is the only reliable number: the window no
      // longer resizes, so anything derived from the frame stays constant.
      Keyboard.addListener(show, event =>
        setKeyboardHeight(event?.endCoordinates?.height || 0),
      ),
      Keyboard.addListener(hide, () => setKeyboardHeight(0)),
    ];
    return () => subs.forEach(sub => sub.remove());
  }, []);

  /** The action card whose form is open, or null when the sheet is closed. */
  const [cardType, setCardType] = useState<ActionCardType | null>(null);
  const [cardForm, setCardForm] = useState<Record<string, string>>({});
  const [cardError, setCardError] = useState('');
  const [sendingCard, setSendingCard] = useState(false);

  /** The received card being declined, which needs a structured reason. */
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineNote, setDeclineNote] = useState('');
  /** Card id currently awaiting a respond() round-trip. */
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getMessages(token, otherUserId);
      setItems(
        list
          .map((item, index) => ({ ...item, id: String(item.id ?? index) }))
          .sort((a: Item, b: Item) => {
            const left =
              new Date(String(a.timestamp || a.created_at || '')).getTime() ||
              0;
            const right =
              new Date(String(b.timestamp || b.created_at || '')).getTime() ||
              0;
            return left - right;
          }),
      );
    } catch {
      // Keep what's on screen.
    } finally {
      setLoading(false);
    }
  }, [otherUserId, token]);

  /**
   * Deal state for this thread, which decides whether "Revision Request" is
   * offered. It rides on the conversations list rather than a dedicated
   * endpoint, so it is fetched separately and is allowed to fail — a missing
   * status simply hides the one button that depends on it.
   */
  const [dealStatus, setDealStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getConversations(token)
      .then(list => {
        if (!active) return;
        const row = list.find(
          item => String(item.user_id) === String(otherUserId),
        );
        setDealStatus(row?.associated_deal_status ?? null);
      })
      .catch(() => {
        // Non-critical: the action row just omits revision_request.
      });
    return () => {
      active = false;
    };
  }, [otherUserId, token]);

  const cards = availableCards(session.role, dealStatus);

  const openCard = useCallback((type: ActionCardType) => {
    setCardType(type);
    setCardForm(initialForm(type));
    setCardError('');
    Keyboard.dismiss();
  }, []);

  const closeCard = useCallback(() => {
    setCardType(null);
    setCardError('');
  }, []);

  /** Validates locally, then POSTs the card and refreshes the thread. */
  const submitCard = useCallback(async () => {
    if (!cardType || sendingCard) return;
    const problem = validateCard(cardType, cardForm);
    if (problem) {
      setCardError(problem);
      return;
    }
    setSendingCard(true);
    setCardError('');
    try {
      await sendActionCard(token, otherUserId, cardType, cardForm);
      setCardType(null);
      await load();
    } catch (err) {
      // The backend returns a useful `detail` for the cases that actually
      // happen here — contact info in a free-text field, the 3-round counter
      // cap, a wallet below the chat minimum — so show it rather than a
      // generic failure.
      setCardError(
        err instanceof Error ? err.message : 'Could not send that card.',
      );
    } finally {
      setSendingCard(false);
    }
  }, [cardForm, cardType, load, otherUserId, sendingCard, token]);

  /**
   * Accept / counter / flag a received card. Declining an OFFER card is routed
   * to the reason picker instead, because the backend records a structured
   * decline_reason for those.
   */
  const respond = useCallback(
    async (
      cardId: string,
      action: ActionCardResponse,
      extra: { decline_reason?: string; note?: string } = {},
    ) => {
      if (respondingTo) return;
      setRespondingTo(cardId);
      setError('');
      try {
        await respondToActionCard(token, cardId, action, extra);
        setDeclineId(null);
        await load();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not update that card.',
        );
      } finally {
        setRespondingTo(null);
      }
    },
    [load, respondingTo, token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError('');
    try {
      // sendMessage throws carrying the backend's own `detail`, which explains
      // contact-sharing blocks and low-balance refusals — more useful than a
      // generic failure.
      await sendMessage(token, otherUserId, message);
      setDraft('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  }, [draft, load, otherUserId, sending, token]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color="#15163F" size={22} />
        </TouchableOpacity>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {text(title, 'C').charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {text(title, 'Conversation')}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.briefBtn}
          onPress={() => onNavigate('/dashboard/business/post-brief')}
          accessibilityRole="button"
        >
          <Icon name="brief" color="#FFFFFF" size={14} />
          <Text style={styles.briefText}>Send a Brief</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        // Alternating bubble widths/sides so the thread reads as a
        // conversation while it loads rather than a blank panel.
        <View style={styles.loadingThread}>
          {[0, 1, 2, 3, 4, 5].map(index => (
            <View
              key={index}
              style={index % 2 ? styles.loadingMine : styles.loadingTheirs}
            >
              <SkeletonBlock
                width={index % 3 === 0 ? 200 : 140}
                height={index % 3 === 0 ? 54 : 38}
                radius={14}
              />
            </View>
          ))}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          // iOS resizes the view itself, so 'padding' still works there.
          //
          // Android is left undefined on purpose. targetSdk 36 + the
          // edgeToEdgeEnabled flag make edge-to-edge mandatory, and the
          // manifest's adjustResize then stops shrinking the window — so
          // 'height' measured a frame that never changed and lifted nothing,
          // leaving the keyboard over the composer and the action chips.
          // The composer block pads itself by the real keyboard height below.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            {!items.length && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Say hello to start the conversation.
                </Text>
              </View>
            )}

            {items.map(item => {
              const mine = String(item.sender_id) === String(session.user_id);
              const system = String(item.sender_id) === 'system';
              const body = text(item.message || item.title || item.type, '');
              const attachments: string[] = Array.isArray(item.attachment_urls)
                ? item.attachment_urls
                : [];

              // Offer / dispute cards carry structured terms and, when we are
              // the recipient, the buttons to answer them.
              const isCard =
                item.item_type === 'action_card' || (!!item.type && !item.message);

              if (isCard) {
                return (
                  <ActionCard
                    key={item.id}
                    item={item}
                    mine={mine}
                    busy={respondingTo === item.id}
                    declining={declineId === item.id}
                    declineReason={declineReason}
                    declineNote={declineNote}
                    onDeclineReason={setDeclineReason}
                    onDeclineNote={setDeclineNote}
                    onStartDecline={() => {
                      setDeclineId(item.id);
                      setDeclineReason('');
                      setDeclineNote('');
                    }}
                    onCancelDecline={() => setDeclineId(null)}
                    onSubmitDecline={() => {
                      if (!declineReason) {
                        setError('Please select a reason for declining.');
                        return;
                      }
                      respond(item.id, 'reject', {
                        decline_reason: declineReason,
                        note: declineNote,
                      });
                    }}
                    // Countering means sending a fresh counter_offer card with
                    // the new terms; the original is marked countered when that
                    // card is sent, exactly as the website does it.
                    onCounter={() => openCard('counter_offer')}
                    onRespond={action => respond(item.id, action)}
                    onOpenDeal={
                      item.campaign_id || item.deal_id
                        ? () =>
                            onNavigate(
                              `/campaigns/${String(
                                item.campaign_id || item.deal_id,
                              )}`,
                            )
                        : undefined
                    }
                  />
                );
              }

              if (system) {
                return (
                  <View key={item.id} style={styles.systemCard}>
                    <Text style={styles.systemText}>{body}</Text>
                  </View>
                );
              }

              return (
                <View
                  key={item.id}
                  style={[styles.bubbleRow, mine && styles.bubbleRowMine]}
                >
                  <View style={[styles.bubble, mine && styles.bubbleMine]}>
                    {!!body && (
                      <Text
                        style={[
                          styles.bubbleText,
                          mine && styles.bubbleTextMine,
                        ]}
                      >
                        {body}
                      </Text>
                    )}

                    {attachments.map((url, index) => {
                      const uri = photoUrl(url);
                      return uri ? (
                        <Image
                          key={`${item.id}-${index}`}
                          source={{ uri }}
                          style={styles.attachment}
                        />
                      ) : null;
                    })}

                    <Text style={[styles.stamp, mine && styles.stampMine]}>
                      {clock(item.timestamp || item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {!!error && (
            <View style={styles.errorBar}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/*
            Chips + composer move as ONE block. On Android the keyboard's own
            height is added as bottom padding here (see keyboardHeight): the
            edge-to-edge window never resizes, so nothing else lifts them.
            Padding only the composer would slide it up over the chips and cut
            them off — which is exactly what the row was doing before.
          */}
          <View
            style={[
              styles.dock,
              // Dynamic, so it cannot live in the stylesheet: the value is the
              // measured keyboard height for this device and this moment.
              Platform.OS === 'android' && { paddingBottom: keyboardHeight },
            ]}
          >
          {/* Quick actions — the structured cards this role may send. One
              horizontal row that scrolls sideways rather than wrapping, so the
              composer keeps its position no matter how many are available. */}
          {!!cards.length && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionRow}
              keyboardShouldPersistTaps="handled"
            >
              {cards.map(type => (
                <TouchableOpacity
                  key={type}
                  style={styles.actionChip}
                  onPress={() => openCard(type)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send a ${ACTION_CARD_LABELS[type]}`}
                >
                  <Icon name={CARD_ICONS[type]} color="#3D4FD8" size={15} />
                  <Text style={styles.actionChipText}>
                    {ACTION_CARD_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* The bottom nav no longer covers this screen, so the composer is
              the last thing above the system gesture bar — pad by the inset so
              the send button is not sitting under it. The inset drops out while
              the keyboard covers that bar, otherwise the composer floats. */}
          <View
            style={[
              styles.composer,
              { paddingBottom: keyboardUp ? scale(8) : scale(8) + insets.bottom },
            ]}
          >
            {/* Attachments need a native file picker, which this build doesn't
                include yet. Shown disabled rather than bouncing the user to
                the website. */}
            <View
              style={styles.composerBtn}
              accessibilityLabel="Attachments unavailable in the app"
            >
              <Icon name="clip" color="#D2D5E2" size={20} />
            </View>

            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor="#A9ADC2"
              multiline
            />

            <TouchableOpacity
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnOff]}
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Icon name="send" color="#FFFFFF" size={18} />
              )}
            </TouchableOpacity>
          </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Card composer. A sheet rather than a pushed screen: the thread stays
          visible behind it, which is the context the terms are written against. */}
      <Modal
        visible={!!cardType}
        transparent
        animationType="slide"
        onRequestClose={closeCard}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={styles.sheetDismiss}
            onPress={closeCard}
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.sheetWrap}
          >
            <View
              style={[
                styles.sheet,
                { paddingBottom: scale(12) + insets.bottom },
              ]}
            >
              <View style={styles.sheetGrip} />
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>
                  {cardType ? ACTION_CARD_LABELS[cardType] : ''}
                </Text>
                <TouchableOpacity
                  onPress={closeCard}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={styles.sheetClose}
                >
                  <Icon name="close" color="#6B7092" size={18} />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetBody}
              >
                {(cardType ? ACTION_CARD_FIELDS[cardType] : []).map(field => {
                  const value = cardForm[field.key] ?? '';
                  const limit =
                    cardType && ACTION_CARD_LIMITS[cardType]?.[field.key];

                  return (
                    <View key={field.key} style={styles.formField}>
                      <View style={styles.formLabelRow}>
                        <Text style={styles.formLabel}>{field.label}</Text>
                        {/* Escalations need 100–500 characters; show the count
                            live so the limit isn't discovered on submit. */}
                        {!!limit && (
                          <Text
                            style={[
                              styles.formCount,
                              (value.trim().length < limit.min ||
                                value.trim().length > limit.max) &&
                                styles.formCountBad,
                            ]}
                          >
                            {value.trim().length}/{limit.max}
                          </Text>
                        )}
                      </View>

                      {field.type === 'select' ? (
                        <View style={styles.formOptions}>
                          {(field.options || []).map(option => {
                            const on = value === option;
                            return (
                              <TouchableOpacity
                                key={option}
                                style={[
                                  styles.formOption,
                                  on && styles.formOptionOn,
                                ]}
                                onPress={() =>
                                  setCardForm(prev => ({
                                    ...prev,
                                    [field.key]: option,
                                  }))
                                }
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                              >
                                <Text
                                  style={[
                                    styles.formOptionText,
                                    on && styles.formOptionTextOn,
                                  ]}
                                >
                                  {option}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          style={[
                            styles.formInput,
                            field.type === 'textarea' && styles.formTextarea,
                          ]}
                          value={value}
                          onChangeText={next =>
                            setCardForm(prev => ({
                              ...prev,
                              [field.key]: next,
                            }))
                          }
                          placeholder={field.label}
                          placeholderTextColor="#A9ADC2"
                          keyboardType={
                            field.type === 'number' ? 'numeric' : 'default'
                          }
                          multiline={field.type === 'textarea'}
                        />
                      )}
                    </View>
                  );
                })}

                {!!cardError && (
                  <Text style={styles.formError}>{cardError}</Text>
                )}

                <TouchableOpacity
                  style={[styles.formSend, sendingCard && styles.formSendOff]}
                  onPress={submitCard}
                  disabled={sendingCard}
                  accessibilityRole="button"
                >
                  {sendingCard ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.formSendText}>
                      Send {cardType ? ACTION_CARD_LABELS[cardType] : ''}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingThread: { flex: 1, padding: scale(16), gap: scale(12) },
  loadingMine: { alignItems: 'flex-end' },
  loadingTheirs: { alignItems: 'flex-start' },
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F2F8',
  },
  headerBtn: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    height: scale(34),
    paddingHorizontal: scale(11),
    borderRadius: scale(10),
    backgroundColor: '#15163F',
  },
  briefText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },

  loading: { marginTop: scale(40) },
  content: { padding: scale(14), paddingBottom: scale(20) },

  bubbleRow: { marginBottom: scale(10), alignItems: 'flex-start' },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    padding: scale(11),
    borderRadius: scale(14),
    backgroundColor: '#F4F5FA',
  },
  bubbleMine: { backgroundColor: '#EEEFFF' },
  bubbleText: { fontSize: fontScale(13), lineHeight: fontScale(19), color: '#25274C' },
  bubbleTextMine: { color: '#25274C' },
  attachment: {
    marginTop: scale(8),
    width: scale(180),
    height: scale(180),
    borderRadius: scale(10),
    backgroundColor: '#E7E8F2',
  },
  stamp: { marginTop: scale(5), fontSize: fontScale(9), color: '#9498B0' },
  stampMine: { textAlign: 'right' },

  systemCard: {
    marginBottom: scale(10),
    padding: scale(11),
    borderRadius: scale(12),
    backgroundColor: '#E9F7EF',
    borderWidth: 1,
    borderColor: '#CFEBDC',
  },
  systemText: { fontSize: fontScale(12), lineHeight: fontScale(18), color: '#17603A' },
  systemAction: { marginTop: scale(8) },
  systemActionText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#0F7B43',
  },

  /* ---- action cards ---- */
  card: {
    marginBottom: scale(10),
    padding: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E6F2',
  },
  // Cards we sent align with our own bubbles.
  cardMine: { backgroundColor: '#FAFAFF', borderColor: '#DDE0F5' },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(10),
  },
  cardIcon: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(8),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#15163F',
  },
  cardStatus: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(20),
  },
  cardStatusText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#4A4F73',
    textTransform: 'capitalize',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(10),
    paddingVertical: scale(3),
  },
  cardKey: {
    width: '38%',
    fontSize: fontScale(11),
    color: '#8A8FA8',
    textTransform: 'capitalize',
  },
  cardVal: {
    flex: 1,
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#22254D',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
    marginTop: scale(11),
  },
  cardBtn: {
    minWidth: scale(78),
    paddingHorizontal: scale(14),
    paddingVertical: scale(9),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#D8DAEA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBtnPrimary: { backgroundColor: '#3D4FD8', borderColor: '#3D4FD8' },
  cardBtnText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3F4468',
  },
  cardBtnTextPrimary: { color: '#FFFFFF' },
  cardNote: {
    marginTop: scale(9),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#6B7092',
  },
  cardLink: {
    marginTop: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
  },
  cardLinkText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  cardTime: {
    marginTop: scale(8),
    fontSize: fontScale(10),
    color: '#A2A6BE',
  },

  /* ---- decline picker ---- */
  decline: { marginTop: scale(11), gap: scale(8) },
  declineLabel: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#4A4F73',
  },
  declineOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) },
  declineChip: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(6),
    borderRadius: scale(18),
    borderWidth: 1,
    borderColor: '#DFE1EF',
    backgroundColor: '#FFFFFF',
  },
  declineChipOn: { backgroundColor: '#EEF0FE', borderColor: '#3D4FD8' },
  declineChipText: { fontSize: fontScale(11), color: '#5A5F80' },
  declineChipTextOn: {
    color: '#3D4FD8',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  declineNote: {
    minHeight: scale(40),
    borderRadius: scale(10),
    backgroundColor: '#F4F5FA',
    paddingHorizontal: scale(11),
    paddingVertical: scale(9),
    fontSize: fontScale(12),
    color: '#15163F',
  },

  /* ---- quick-action row ---- */
  actionRow: {
    paddingHorizontal: scale(12),
    paddingTop: scale(8),
    paddingBottom: scale(6),
    gap: scale(8),
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: scale(12),
    paddingVertical: scale(9),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E1E3F2',
    backgroundColor: '#FFFFFF',
  },
  actionChipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#2B2F55',
  },

  /* ---- card composer sheet ---- */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(14,19,48,0.42)' },
  // Tapping the dimmed area above the sheet closes it.
  sheetDismiss: { flex: 1 },
  sheetWrap: { maxHeight: '88%' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    paddingHorizontal: scale(16),
    paddingTop: scale(10),
  },
  sheetGrip: {
    alignSelf: 'center',
    width: scale(38),
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: '#DDE0EC',
    marginBottom: scale(12),
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scale(6),
  },
  sheetTitle: {
    flex: 1,
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    color: '#15163F',
  },
  sheetClose: {
    width: scale(32),
    height: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { paddingTop: scale(6), paddingBottom: scale(10) },

  formField: { marginBottom: scale(13) },
  formLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(6),
  },
  formLabel: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#3F4468',
  },
  formCount: { fontSize: fontScale(11), color: '#8A8FA8' },
  formCountBad: {
    color: '#DC2626',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  formInput: {
    minHeight: scale(44),
    borderRadius: scale(12),
    backgroundColor: '#F4F5FA',
    paddingHorizontal: scale(13),
    paddingVertical: scale(11),
    fontSize: fontScale(14),
    color: '#15163F',
  },
  formTextarea: { minHeight: scale(96), textAlignVertical: 'top' },
  formOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(7) },
  formOption: {
    paddingHorizontal: scale(13),
    paddingVertical: scale(9),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: '#DFE1EF',
    backgroundColor: '#FFFFFF',
  },
  formOptionOn: { backgroundColor: '#EEF0FE', borderColor: '#3D4FD8' },
  formOptionText: { fontSize: fontScale(12), color: '#5A5F80' },
  formOptionTextOn: {
    color: '#3D4FD8',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  formError: {
    marginBottom: scale(10),
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    color: '#DC2626',
  },
  formSend: {
    height: scale(48),
    borderRadius: scale(14),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(2),
  },
  formSendOff: { opacity: 0.6 },
  formSendText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  errorBar: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(9),
    backgroundColor: '#FFE6E7',
  },
  errorText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C4373B',
  },

  /** Wraps the action chips + composer so both clear the keyboard together. */
  dock: {},
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: scale(8),
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
    borderTopWidth: 1,
    borderTopColor: '#F1F2F8',
    backgroundColor: '#FFFFFF',
  },
  composerBtn: {
    width: scale(38),
    height: scale(42),
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: scale(42),
    maxHeight: scale(110),
    borderRadius: scale(12),
    backgroundColor: '#F4F5FA',
    paddingHorizontal: scale(13),
    paddingTop: scale(11),
    paddingBottom: scale(11),
    fontSize: fontScale(14),
    color: '#15163F',
  },
  sendBtn: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    backgroundColor: '#4C5BF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: '#C3C6E8' },

  empty: { marginTop: scale(50), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: { marginTop: scale(5), fontSize: fontScale(12), color: '#858AA3' },
});

export default BrandChatThread;
