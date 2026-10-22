import { useLiveEffect } from "../liveUpdates";
import { Alert } from '../components/AppAlert';
/**
 * Shipment Tracking — the native replacement for the web /shipment/{id} page.
 * Reads GET /api/shipment/{campaign_id}. That endpoint returns the product
 * and the brand's own pickup address but deliberately strips the creator's
 * delivery address (ops-only, so masked shipping holds) — so this shows
 * status, tracking, product details, pickup address and the checklist, and
 * states plainly that the delivery address is withheld.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SkeletonBanner, SkeletonList } from '../components/Skeleton';
import { useMediaOpener } from '../components/MediaViewer';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  ApiError,
  NetworkError,
  getShipment,
  getShippingAccountAddress,
  requestShipment,
  updateShipment,
  uploadMedia,
} from '../api';
import {
  isMockShipment,
  isRealShipment,
  lookupPincode,
  resolveMediaUrl,
  shipmentStatus,
} from '../shipmentStatus';
import { CONTENT_MAX_WIDTH, scale, fontScale } from '../theme';

type Props = {
  token: string;
  campaignId: string;
  /** Which hired creator to ship to on a multi-creator brief (default: the first). */
  creatorId?: string;
  onBack: () => void;
};

type Shipment = Record<string, any>;

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A real calendar date typed as YYYY-MM-DD (rejects 2026-13-45, which the shape check alone lets through). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Flattens the address doc saved by POST /api/shipping/address
 * (full_name, phone, line1, line2, city, state, pincode, country) into the
 * lines shown on the card. Blank parts are dropped so a partial address never
 * renders stray commas.
 */
function addressLines(address: unknown): string[] {
  if (!address || typeof address !== 'object') return [];
  const doc = address as Record<string, unknown>;
  const join = (...parts: unknown[]) =>
    parts
      .map(part => text(part))
      .filter(Boolean)
      .join(', ');
  return [
    text(doc.full_name),
    text(doc.phone),
    text(doc.line1),
    text(doc.line2),
    join(doc.city, doc.state, doc.pincode),
    text(doc.country),
  ].filter(Boolean);
}

/**
 * "20 x 15 x 10 cm" from the dimensions object the brand submitted with
 * POST /api/deals/{deal_id}/request-shipment. Returns '' unless all three
 * sides are present, since a partial box size is meaningless.
 */
function dimensionText(dimensions: unknown): string {
  if (!dimensions || typeof dimensions !== 'object') return '';
  const doc = dimensions as Record<string, unknown>;
  const sides = [doc.length, doc.width, doc.height].map(side => Number(side));
  if (sides.some(side => !side || Number.isNaN(side))) return '';
  return `${sides[0]} x ${sides[1]} x ${sides[2]} cm`;
}

/** Big status banner at the top, from the same status mapping as the list. */
export function bannerFor(shipment: Shipment | null): {
  label: string;
  bg: string;
  fg: string;
} {
  if (!isRealShipment(shipment)) {
    return { label: 'NOT REQUESTED', bg: '#F1F2F8', fg: '#6E7391' };
  }
  const chip = shipmentStatus(shipment);
  return { label: chip.label.toUpperCase(), bg: chip.bg, fg: chip.fg };
}

/** What the brand should expect next, per status (the website's "What to do next"). */
function noteFor(shipment: Shipment | null): { title: string; body: string } {
  switch (shipmentStatus(shipment).key) {
    case 'delivered':
      return {
        title: 'Delivered',
        body: 'The creator has received the product. Wait for them to submit the content, then review it.',
      };
    case 'transit':
      return {
        title: 'On its way',
        body: 'The product is on its way to the creator. Tracking updates appear here as the courier scans the package.',
      };
    case 'pickup':
      return {
        title: 'Label ready',
        body: 'Waiting for the courier to pick the parcel up from your address.',
      };
    case 'issue':
      return {
        title: 'Needs attention',
        body: 'This shipment was returned or lost. Contact support to arrange a new one.',
      };
    default:
      return {
        title: 'Shipment requested',
        body: 'Our team is preparing your pre-paid label. Tracking appears here once the package is dispatched.',
      };
  }
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
      {name === 'box' && (
        <>
          <Path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z" {...line} />
          <Path d="M4 7.5 12 11.5l8-4M12 11.5v9" {...line} />
        </>
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...line} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...line} />
          <Path d="M12 7.5V12l3 1.8" {...line} />
        </>
      )}
      {name === 'weight' && (
        <>
          <Path d="M5 8.5h14l1.5 11h-17Z" {...line} />
          <Circle cx="12" cy="5.5" r="2.2" {...line} />
        </>
      )}
      {name === 'ruler' && (
        <>
          <Rect x={2.6} y={8.5} width={18.8} height={7} rx={1.6} {...line} />
          <Path d="M7 8.5v3M11 8.5v4M15 8.5v3M19 8.5v4" {...line} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path
            d="M12 21c4-4.4 6-7.5 6-10a6 6 0 1 0-12 0c0 2.5 2 5.6 6 10Z"
            {...line}
          />
          <Circle cx="12" cy="11" r="2.3" {...line} />
        </>
      )}
      {name === 'truck' && (
        <>
          <Rect x={2.5} y={7} width={11} height={9} rx={1.8} {...line} />
          <Path d="M13.5 10.5H17l3 3v2.5h-6.5z" {...line} />
          <Circle cx="7" cy="18" r="1.8" {...line} />
          <Circle cx="16.5" cy="18" r="1.8" {...line} />
        </>
      )}
    </Svg>
  );
}

/** The three-point checklist; keys are the ones the website and backend store in `shipment_checklist`. */
const CHECKS = [
  { key: 'sealed', label: 'Package Sealed' },
  { key: 'correct_item', label: 'Correct Item' },
  { key: 'working', label: 'Working Condition' },
];

function BrandShipmentDetail({ token, campaignId, creatorId, onBack }: Props) {
  // "<campaign>~<creator>" addresses one creator's deal on a multi-creator brief.
  const dealId = creatorId ? `${campaignId}~${creatorId}` : campaignId;
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);
  // A failed load must not read as "Shipment requested".
  const [loadError, setLoadError] = useState('');
  // Tracking editor: open flag, the three fields, and the in-flight save.
  const [editing, setEditing] = useState(false);
  const [tracking, setTracking] = useState('');
  const [courier, setCourier] = useState('');
  const [expected, setExpected] = useState('');
  // The slip is optional (the website sends '' without one), uploaded before the save.
  const [slip, setSlip] = useState('');
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  // Request-a-shipment form, mirroring ShipLabelRequest on the backend:
  // description and weight required, dimensions optional, pickup address
  // required in full.
  const [requesting, setRequesting] = useState(false);
  const [ship, setShip] = useState({
    description: '',
    weight: '',
    length: '',
    width: '',
    height: '',
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
  });
  const setShipField = (key: keyof typeof ship, value: string) =>
    setShip(current => ({ ...current, [key]: value }));

  const load = useCallback(async () => {
    try {
      setShipment(await getShipment(token, campaignId, creatorId));
      setMissing(false);
      setLoadError('');
    } catch (error) {
      // A 404 means nothing has been requested yet: a normal state, not an
      // error. Anything else is a real failure, so say so with a Retry.
      if (error instanceof ApiError && error.status === 404) {
        setShipment(null);
        setMissing(true);
        setLoadError('');
      } else {
        setLoadError(
          error instanceof NetworkError
            ? "You're offline. Check your connection and try again."
            : error instanceof Error && error.message
            ? error.message
            : 'Could not load this shipment. Please try again.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campaignId, creatorId, token]);

  useLiveEffect(() => {
    load();
  }, [load]);

  /** Uploads the courier slip; the server requires one on every update. */
  const pickSlip = useCallback(async () => {
    if (uploadingSlip) return;
    const picked = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 2000,
      maxHeight: 2000,
      quality: 0.8,
    }).catch(() => null);
    const asset = picked?.assets?.[0];
    if (!asset?.uri) return;
    setUploadingSlip(true);
    try {
      setSlip(
        await uploadMedia(token, {
          uri: asset.uri,
          fileName: asset.fileName,
          type: asset.type,
        }),
      );
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error && error.message
          ? error.message
          : 'Could not upload the slip.',
      );
    } finally {
      setUploadingSlip(false);
    }
  }, [token, uploadingSlip]);

  /**
   * Opens the request form, seeding the pickup address from the same endpoint
   * the website uses (GET /shipping/account-address: Settings > Company), so
   * the common case is a couple of product fields. Never overwrites typing.
   */
  const openRequest = useCallback(async () => {
    setRequesting(true);
    const result = await getShippingAccountAddress(token).catch(() => null);
    const saved = result?.address;
    if (!saved) return;
    setShip(current =>
      current.line1 || current.pincode
        ? current
        : {
            ...current,
            full_name: text(saved.full_name),
            phone: text(saved.phone).replace(/\D/g, '').slice(-10),
            line1: text(saved.line1),
            line2: text(saved.line2),
            city: text(saved.city),
            state: text(saved.state),
            pincode: text(saved.pincode),
          },
    );
  }, [token]);

  // City and State follow the Pincode (India Post), as on the website, so they
  // can never disagree with it.
  useEffect(() => {
    if (!requesting || ship.pincode.length !== 6) return;
    let cancelled = false;
    lookupPincode(ship.pincode).then(info => {
      if (cancelled || !info) return;
      setShip(current => ({
        ...current,
        city: info.city || current.city,
        state: info.state || current.state,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [requesting, ship.pincode]);

  /** Everything the backend requires but the form has not been given. */
  const shipIssues = (): string[] => {
    const missingFields: string[] = [];
    if (ship.description.trim().length < 3) missingFields.push('Product description');
    if (!(Number(ship.weight) > 0)) missingFields.push('Weight in kg');
    if (!ship.full_name.trim()) missingFields.push('Pickup contact name');
    if (!/^\d{10}$/.test(ship.phone.replace(/\D/g, '')))
      missingFields.push('10-digit pickup phone');
    if (!ship.line1.trim()) missingFields.push('Pickup address');
    if (!ship.city.trim()) missingFields.push('Pickup city');
    if (!ship.state.trim()) missingFields.push('Pickup state');
    if (!/^[1-9][0-9]{5}$/.test(ship.pincode)) missingFields.push('6-digit pincode');
    return missingFields;
  };

  const submitRequest = useCallback(async () => {
    if (submitting.current) return;
    const gaps = shipIssues();
    if (gaps.length) {
      Alert.alert('Still needed', gaps.map(item => `•  ${item}`).join('\n'));
      return;
    }
    submitting.current = true;
    setSaving(true);
    // The bare campaign id addresses the first (or only) hired creator,
    // which is the same id every other call on this screen uses.
    const payload = {
      description: ship.description.trim(),
      weight: Number(ship.weight),
      dimensions: {
        length: ship.length ? Number(ship.length) : null,
        width: ship.width ? Number(ship.width) : null,
        height: ship.height ? Number(ship.height) : null,
      },
      pickup_address: {
        full_name: ship.full_name.trim(),
        phone: ship.phone.replace(/\D/g, ''),
        line1: ship.line1.trim(),
        line2: ship.line2.trim(),
        city: ship.city.trim(),
        state: ship.state.trim(),
        pincode: ship.pincode,
        country: 'India',
      },
    };
    try {
      // Same call as the website (ShipmentTracking.js handleShipProduct). NOT
      // /deals/{id}/ship-label: with no courier token that endpoint stores a
      // MOCK tracking number the brand would take for a real parcel.
      // request-shipment never invents one; the server itself generates the
      // real label straight away when the courier is configured and both
      // addresses are in, otherwise the ops queue prepares it.
      const res = (await requestShipment(token, dealId, payload)) as {
        tracking_number?: string;
        label_error?: string;
      };
      setRequesting(false);
      await load();
      Alert.alert(
        res?.tracking_number ? 'Label generated' : 'Shipment requested',
        res?.tracking_number
          ? `Tracking number: ${res.tracking_number}. The courier will pick it up from your address.`
          : res?.label_error
          ? `Our team will prepare your label shortly. (${res.label_error})`
          : 'Shipment requested - our team will prepare your label shortly.',
      );
    } catch (error) {
      Alert.alert(
        'Could not request',
        error instanceof NetworkError
          ? "You're offline. Check your connection and try again."
          : error instanceof Error && error.message
          ? error.message
          : 'Please try again.',
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }, [dealId, load, ship, token]);

  const saveTracking = useCallback(async () => {
    if (!tracking.trim() || !isIsoDate(expected) || saving) return;
    setSaving(true);
    try {
      await updateShipment(token, {
        campaign_id: campaignId,
        creator_id: creatorId,
        tracking_number: tracking.trim(),
        courier_slip: slip,
        expected_delivery: expected,
        courier_name: courier.trim() || undefined,
        shipment_checklist: {
          sealed: !!checks.sealed,
          correct_item: !!checks.correct_item,
          working: !!checks.working,
        },
      });
      setEditing(false);
      await load();
    } catch (error) {
      Alert.alert(
        'Could not save',
        error instanceof Error && error.message
          ? error.message
          : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [campaignId, checks, courier, creatorId, expected, load, saving, slip, token, tracking]);

  // Label, slip and unboxing video open in the app (Android saves a PDF to Downloads),
  // never in the phone's browser.
  const media = useMediaOpener();
  const openUrl = useCallback(
    (url: unknown) => {
      const target = resolveMediaUrl(url);
      if (target) media.open(target);
    },
    [media.open],
  );

  const banner = bannerFor(shipment);
  const note = noteFor(shipment);
  const mock = isMockShipment(shipment);
  // The website reads `shipment_checklist` (sealed, correct_item, working).
  const checklist = (shipment?.shipment_checklist || {}) as Record<string, unknown>;
  const notRequested = missing || (!!shipment && !isRealShipment(shipment));
  // `product` is the object stored by request-shipment; `product_summary` is
  // the same description flattened, kept as a fallback for older docs.
  const product = (shipment?.product || {}) as Record<string, unknown>;
  const description = text(
    product.description,
    text(shipment?.product_summary),
  );
  const weight = Number(product.weight) || 0;
  const dimensions = dimensionText(product.dimensions);
  const hasProduct = !!(description || weight || dimensions);
  const pickup = addressLines(shipment?.pickup_address);

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
        <Text style={styles.headerTitle}>Shipment Tracking</Text>
      </View>

      {loading ? (
        <View style={styles.content}>
          <SkeletonBanner height={110} />
          <SkeletonList count={3} lines={2} />
        </View>
      ) : (
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
          {/* No banner while the load itself failed: "NOT REQUESTED" would be a lie. */}
          {!(loadError && !shipment && !missing) && (
            <View style={[styles.banner, { backgroundColor: banner.bg }]}>
              <View style={styles.bannerIcon}>
                <Icon name="box" color={banner.fg} size={19} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.bannerLabel}>Status</Text>
                <Text style={[styles.bannerValue, { color: banner.fg }]}>
                  {banner.label}
                </Text>
              </View>
            </View>
          )}

          {loadError && !shipment && !missing ? (
            <View style={styles.noteCard} testID="shipment-error">
              <Text style={styles.noteTitle}>Couldn't load this shipment</Text>
              <Text style={styles.noteText}>{loadError}</Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                accessibilityRole="button"
                testID="shipment-retry"
              >
                <Text style={styles.actionBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : notRequested ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>No shipment requested</Text>
              <Text style={styles.noteText}>
                Send us the product and pickup details and our team prepares
                the label. Tracking then appears here.
              </Text>
              {/* The screen used to state this and offer no way to do it, so
                  the brand had to open the website to start the shipment. */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={openRequest}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>Request a shipment</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {!!loadError && (
                <View style={styles.noteCard} testID="shipment-stale">
                  <Text style={styles.noteText}>
                    {loadError} Showing the last details we loaded.
                  </Text>
                </View>
              )}
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>{note.title}</Text>
                <Text style={styles.noteText}>{note.body}</Text>
              </View>

              {mock && (
                <View style={[styles.noteCard, styles.warnCard]} testID="mock-shipment">
                  <Text style={styles.noteTitle}>Test shipment</Text>
                  <Text style={styles.noteText}>
                    This tracking number is a placeholder, not a real courier booking.
                    Contact support to get a real label before sending the product.
                  </Text>
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Tracking Information</Text>
                <View style={styles.infoRow}>
                  <Icon name="truck" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Tracking number</Text>
                    <Text style={styles.infoValue}>
                      {text(shipment?.tracking_number, '-')}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="box" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Courier</Text>
                    <Text style={styles.infoValue}>
                      {text(shipment?.courier_name, '-')}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="clock" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Expected delivery</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(shipment?.expected_delivery) || '-'}
                    </Text>
                  </View>
                </View>
                {!!shipment?.label_url && !mock && (
                  <TouchableOpacity
                    style={styles.linkRow}
                    onPress={() => openUrl(shipment?.label_url)}
                    accessibilityRole="link"
                    testID="download-label"
                  >
                    <Text style={styles.linkText}>Shipping label: Download &amp; print</Text>
                  </TouchableOpacity>
                )}
                {!!shipment?.courier_slip && (
                  <TouchableOpacity
                    style={styles.linkRow}
                    onPress={() => openUrl(shipment?.courier_slip)}
                    accessibilityRole="link"
                    testID="view-slip"
                  >
                    <Text style={styles.linkText}>Courier slip: View document</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!!shipment?.unboxing_video && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Unboxing Video</Text>
                  <TouchableOpacity
                    style={styles.linkRow}
                    onPress={() => openUrl(shipment?.unboxing_video)}
                    accessibilityRole="link"
                    testID="view-unboxing"
                  >
                    <Text style={styles.linkText}>View unboxing video</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!!shipment?.dispute && (
                <View style={[styles.noteCard, styles.disputeCard]} testID="shipment-dispute">
                  <Text style={[styles.noteTitle, styles.disputeText]}>Dispute Reported</Text>
                  <Text style={[styles.noteText, styles.disputeText]}>
                    {text(shipment.dispute?.reason, 'The creator reported a problem with this shipment.')}
                  </Text>
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Product Details</Text>
                {hasProduct ? (
                  <>
                    <View style={styles.infoRow}>
                      <Icon name="box" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Description</Text>
                        <Text style={styles.infoValue}>
                          {description || '-'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <Icon name="weight" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Weight</Text>
                        <Text style={styles.infoValue}>
                          {weight ? `${weight} kg` : '-'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <Icon name="ruler" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Dimensions</Text>
                        <Text style={styles.infoValue}>
                          {dimensions || '-'}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyLine}>
                    No product details were submitted with this shipment.
                  </Text>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Pickup Address</Text>
                {pickup.length ? (
                  <View style={styles.infoRow}>
                    <Icon name="pin" color="#9498B0" size={16} />
                    <View style={styles.flex}>
                      <Text style={styles.infoLabel}>Collected from</Text>
                      {pickup.map(line => (
                        <Text key={line} style={styles.addressLine}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.emptyLine}>
                    No pickup address on this shipment yet.
                  </Text>
                )}
                {/* The creator's address is deliberately withheld by the API
                    (masked shipping), so say so rather than showing a blank. */}
                <View style={styles.maskedNote}>
                  <Text style={styles.maskedText}>
                    The creator's delivery address is hidden for privacy. Our
                    ops team uses it to generate the label.
                  </Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Shipment Checklist</Text>
                {CHECKS.map(check => {
                  const done = !!checklist[check.key];
                  return (
                    <View key={check.key} style={styles.checkRow}>
                      <View style={[styles.box, done && styles.boxOn]}>
                        {done && (
                          <Icon name="check" color="#FFFFFF" size={12} />
                        )}
                      </View>
                      <Text style={styles.checkText}>{check.label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* The screen was read-only: a brand who had dispatched the
                  parcel could see there was no tracking number but had no way
                  to add one without opening the website. */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setTracking(text(shipment?.tracking_number));
                  setCourier(text(shipment?.courier_name));
                  // The field is an ISO date; stored values can carry a time.
                  setExpected(text(shipment?.expected_delivery).slice(0, 10));
                  setSlip(text(shipment?.courier_slip));
                  setChecks({
                    sealed: !!checklist.sealed,
                    correct_item: !!checklist.correct_item,
                    working: !!checklist.working,
                  });
                  setEditing(true);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>
                  {shipment?.tracking_number
                    ? 'Update tracking details'
                    : 'Add tracking details'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* Request a shipment. Scrolls, because the pickup address makes this
          taller than the keyboard leaves room for. */}
      <Modal
        visible={requesting}
        transparent
        animationType="fade"
        onRequestClose={() => setRequesting(false)}
      >
        <KeyboardAvoidingView
          style={styles.editBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.editSheet, styles.requestSheet]}>
            <Text style={styles.editTitle}>Request a shipment</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.editLabel}>What are you sending?</Text>
              <TextInput
                style={styles.editInput}
                value={ship.description}
                onChangeText={value => setShipField('description', value)}
                placeholder="e.g. Vitamin C serum, 30ml"
                placeholderTextColor="#A9ADC2"
              />

              <Text style={styles.editLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.editInput}
                value={ship.weight}
                onChangeText={value =>
                  setShipField('weight', value.replace(/[^0-9.]/g, ''))
                }
                placeholder="0.5"
                placeholderTextColor="#A9ADC2"
                keyboardType="decimal-pad"
              />

              <Text style={styles.editLabel}>Box size in cm, L x W x H (optional)</Text>
              <View style={styles.dimRow}>
                {(['length', 'width', 'height'] as const).map(side => (
                  <TextInput
                    key={side}
                    style={[styles.editInput, styles.dimInput]}
                    value={ship[side]}
                    onChangeText={value =>
                      setShipField(side, value.replace(/\D/g, ''))
                    }
                    placeholder={side[0].toUpperCase()}
                    accessibilityLabel={`Box ${side} in cm`}
                    placeholderTextColor="#A9ADC2"
                    keyboardType="number-pad"
                  />
                ))}
              </View>

              <Text style={styles.requestSection}>Pickup address</Text>
              <Text style={styles.requestHint}>
                Where our courier collects the parcel. The creator's delivery
                address stays with our team and is never shown to you.
              </Text>

              <Text style={styles.editLabel}>Contact name</Text>
              <TextInput
                style={styles.editInput}
                value={ship.full_name}
                onChangeText={value => setShipField('full_name', value)}
                placeholder="Who the courier asks for"
                placeholderTextColor="#A9ADC2"
              />

              <Text style={styles.editLabel}>Phone</Text>
              <TextInput
                style={styles.editInput}
                value={ship.phone}
                onChangeText={value =>
                  setShipField('phone', value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="10 digits"
                placeholderTextColor="#A9ADC2"
                keyboardType="phone-pad"
              />

              <Text style={styles.editLabel}>Address</Text>
              <TextInput
                style={styles.editInput}
                value={ship.line1}
                onChangeText={value => setShipField('line1', value)}
                placeholder="Building, street"
                placeholderTextColor="#A9ADC2"
              />
              <TextInput
                style={[styles.editInput, styles.editStacked]}
                value={ship.line2}
                onChangeText={value => setShipField('line2', value)}
                placeholder="Area, landmark (optional)"
                placeholderTextColor="#A9ADC2"
              />

              <View style={styles.dimRow}>
                <TextInput
                  style={[styles.editInput, styles.dimInput]}
                  value={ship.city}
                  onChangeText={value => setShipField('city', value)}
                  placeholder="City"
                  placeholderTextColor="#A9ADC2"
                />
                <TextInput
                  style={[styles.editInput, styles.dimInput]}
                  value={ship.state}
                  onChangeText={value => setShipField('state', value)}
                  placeholder="State"
                  placeholderTextColor="#A9ADC2"
                />
              </View>

              <Text style={styles.editLabel}>Pincode</Text>
              <TextInput
                style={styles.editInput}
                value={ship.pincode}
                onChangeText={value =>
                  setShipField('pincode', value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="6 digits"
                placeholderTextColor="#A9ADC2"
                keyboardType="number-pad"
              />
            </ScrollView>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editGhost}
                onPress={() => setRequesting(false)}
                accessibilityRole="button"
              >
                <Text style={styles.editGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSave}
                onPress={submitRequest}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.editSaveText}>Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tracking editor. POST /api/shipment/update takes the campaign id, so
          the same call covers both adding and correcting these three. */}
      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(false)}
      >
        <KeyboardAvoidingView
          style={styles.editBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.editSheet, styles.requestSheet]}>
            <Text style={styles.editTitle}>Tracking details</Text>
            {/* Scrolls: on a 320x568 phone the fields are taller than the screen, let alone with the keyboard up. */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.editLabel}>Tracking number</Text>
            <TextInput
              style={styles.editInput}
              value={tracking}
              onChangeText={setTracking}
              placeholder="e.g. 1234567890"
              placeholderTextColor="#A9ADC2"
              autoCapitalize="characters"
            />

            <Text style={styles.editLabel}>Courier</Text>
            <TextInput
              style={styles.editInput}
              value={courier}
              onChangeText={setCourier}
              placeholder="e.g. Delhivery"
              placeholderTextColor="#A9ADC2"
            />

            <Text style={styles.editLabel}>Expected delivery</Text>
            <TextInput
              style={styles.editInput}
              value={expected}
              onChangeText={value =>
                // Dashes appear on their own so the value is always the ISO
                // date the backend stores.
                setExpected(
                  value
                    .replace(/\D/g, '')
                    .slice(0, 8)
                    .replace(/^(\d{4})(\d)/, '$1-$2')
                    .replace(/^(\d{4}-\d{2})(\d)/, '$1-$2'),
                )
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A9ADC2"
              keyboardType="number-pad"
            />
            {expected.length === 10 && !isIsoDate(expected) && (
              <Text style={styles.fieldError} testID="expected-error">
                Enter a real date as YYYY-MM-DD.
              </Text>
            )}

            <Text style={styles.editLabel}>Courier slip (optional)</Text>
            <TouchableOpacity
              style={styles.slipBtn}
              onPress={pickSlip}
              disabled={uploadingSlip}
              accessibilityRole="button"
              accessibilityLabel={
                slip ? 'Courier slip attached, tap to replace' : 'Attach the courier slip'
              }
            >
              {uploadingSlip ? (
                <ActivityIndicator size="small" color="#3D4FD8" />
              ) : (
                <Text style={styles.slipText}>
                  {slip ? 'Slip attached - tap to replace' : 'Attach a photo of the slip'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.editLabel}>Shipment checklist</Text>
            {CHECKS.map(check => (
              <TouchableOpacity
                key={check.key}
                style={styles.checkToggle}
                onPress={() =>
                  setChecks(current => ({ ...current, [check.key]: !current[check.key] }))
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!checks[check.key] }}
                testID={`check-${check.key}`}
              >
                <View style={[styles.box, checks[check.key] && styles.boxOn]}>
                  {checks[check.key] && <Icon name="check" color="#FFFFFF" size={12} />}
                </View>
                <Text style={styles.checkText}>{check.label}</Text>
              </TouchableOpacity>
            ))}
            </ScrollView>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editGhost}
                onPress={() => setEditing(false)}
                accessibilityRole="button"
              >
                <Text style={styles.editGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                // The server needs a tracking number and an ISO date, so the
                // button stays off until it would actually be accepted.
                style={[
                  styles.editSave,
                  (!tracking.trim() || !isIsoDate(expected)) && styles.editSaveOff,
                ]}
                disabled={!tracking.trim() || !isIsoDate(expected) || saving}
                onPress={saveTracking}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.editSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {media.node}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  flex: { flex: 1, minWidth: 0 },
  header: {
    height: scale(56),
    paddingHorizontal: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  headerBtn: {
    width: scale(38),
    height: scale(38),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontScale(19),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },

  loading: { marginTop: scale(40) },
  // Tablet: one centred column.
  content: {
    padding: scale(16),
    paddingTop: scale(4),
    paddingBottom: scale(30),
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },

  banner: {
    padding: scale(15),
    borderRadius: scale(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  bannerIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: { fontSize: fontScale(10), color: '#6E7391' },
  bannerValue: {
    marginTop: scale(3),
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
  },

  noteCard: {
    marginTop: scale(12),
    padding: scale(14),
    borderRadius: scale(12),
    backgroundColor: '#FFF3DF',
  },
  noteTitle: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#8A5A12',
  },
  noteText: {
    marginTop: scale(4),
    fontSize: fontScale(12),
    lineHeight: fontScale(17),
    color: '#8A5A12',
  },

  card: {
    marginTop: scale(12),
    padding: scale(14),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  cardTitle: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
    marginBottom: scale(12),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
    marginBottom: scale(13),
  },
  infoLabel: { fontSize: fontScale(10), color: '#9498B0' },
  infoValue: {
    marginTop: scale(2),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#15163F',
  },

  // Address lines stack under one label, so they need tighter leading than the
  // single-value infoValue rows.
  addressLine: {
    marginTop: scale(2),
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
    lineHeight: fontScale(18),
  },
  emptyLine: { fontSize: fontScale(12), color: '#9498B0', lineHeight: fontScale(17) },
  maskedNote: {
    marginTop: scale(4),
    padding: scale(10),
    borderRadius: scale(10),
    backgroundColor: '#F4F5FB',
  },
  maskedText: { fontSize: fontScale(11), lineHeight: fontScale(16), color: '#6E7391' },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    marginBottom: scale(11),
  },
  box: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(6),
    borderWidth: 1.5,
    borderColor: '#C3C6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#1FA971', borderColor: '#1FA971' },
  checkText: { flex: 1, fontSize: fontScale(13), color: '#3B3F5C' },

  actionBtn: {
    marginTop: scale(16),
    height: scale(48),
    borderRadius: scale(13),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },

  editBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,12,38,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(22),
  },
  editSheet: {
    width: '100%',
    maxWidth: scale(360),
    maxHeight: '92%',
    borderRadius: scale(18),
    backgroundColor: '#FFFFFF',
    padding: scale(18),
  },
  editTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-Medium',
    color: '#15163F',
  },
  editLabel: {
    marginTop: scale(13),
    marginBottom: scale(5),
    fontSize: fontScale(11),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#7E829D',
  },
  editInput: {
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    // 16 so iOS does not zoom on focus.
    fontSize: 16,
    color: '#15163F',
  },
  fieldError: { marginTop: scale(4), fontSize: fontScale(12), color: '#C4373B' },
  slipBtn: {
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C6CBE8',
    backgroundColor: '#F7F8FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slipText: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  editActions: {
    flexDirection: 'row',
    gap: scale(10),
    marginTop: scale(18),
  },
  // The request form is much taller than the tracking editor, so it is
  // capped and scrolls rather than running off the top of the screen.
  requestSheet: { maxHeight: '86%' },
  editStacked: { marginTop: scale(10) },
  dimRow: { flexDirection: 'row', gap: scale(10) },
  dimInput: { flex: 1 },
  requestSection: {
    marginTop: scale(20),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  requestHint: {
    marginTop: scale(4),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#8A8FA8',
  },
  editGhost: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGhostText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  editSave: {
    flex: 1,
    height: scale(46),
    borderRadius: scale(12),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveOff: { opacity: 0.5 },
  warnCard: { backgroundColor: '#FDECEC' },
  disputeCard: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444' },
  disputeText: { color: '#991B1B' },
  linkRow: { minHeight: scale(44), justifyContent: 'center' },
  linkText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#3D4FD8',
  },
  checkToggle: {
    minHeight: scale(44),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  editSaveText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default BrandShipmentDetail;
