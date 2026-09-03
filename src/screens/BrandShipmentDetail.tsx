/**
 * Shipment Tracking — the native replacement for the web /shipment/{id} page.
 * Reads GET /api/shipment/{campaign_id}. That endpoint returns the product
 * and the brand's own pickup address but deliberately strips the creator's
 * delivery address (ops-only, so masked shipping holds) — so this shows
 * status, tracking, product details, pickup address and the checklist, and
 * states plainly that the delivery address is withheld.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SkeletonBanner, SkeletonList } from '../components/Skeleton';
import { ApiError, getShipment } from '../api';
import { scale, fontScale } from '../theme';

type Props = {
  token: string;
  campaignId: string;
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

/** Big status banner at the top, derived from the shipment document. */
function bannerFor(shipment: Shipment | null): {
  label: string;
  bg: string;
  fg: string;
} {
  if (!shipment) {
    return { label: 'NOT REQUESTED', bg: '#F1F2F8', fg: '#6E7391' };
  }
  const status = String(shipment.status || '').toLowerCase();
  if (status === 'delivered' || shipment.received_at) {
    return { label: 'DELIVERED', bg: '#E2F7EE', fg: '#0F7B43' };
  }
  if (status === 'shipped' || shipment.tracking_number) {
    return { label: 'IN TRANSIT', bg: '#E4F0FF', fg: '#1F62B8' };
  }
  return { label: 'AWAITING LABEL', bg: '#EEEFFF', fg: '#4C4DD6' };
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

/** The three-point checklist from the design. */
const CHECKS = [
  { key: 'package_sealed', label: 'Package Sealed' },
  { key: 'correct_item', label: 'Correct Item' },
  { key: 'working_condition', label: 'Working Condition' },
];

function BrandShipmentDetail({ token, campaignId, onBack }: Props) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setShipment(await getShipment(token, campaignId));
      setMissing(false);
    } catch (error) {
      // A 404 means nothing has been requested yet — a normal state, not an
      // error. Anything else keeps what is already on screen.
      if (error instanceof ApiError && error.status === 404) {
        setShipment(null);
        setMissing(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campaignId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const banner = bannerFor(shipment);
  const checklist = (shipment?.checklist || {}) as Record<string, unknown>;
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
      <View style={[styles.header, { paddingTop: insets.top }]}>
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

          {missing ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>No shipment requested</Text>
              <Text style={styles.noteText}>
                Once you request a shipment for this campaign, tracking will
                appear here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Shipment requested</Text>
                <Text style={styles.noteText}>
                  {shipment?.tracking_number
                    ? 'Your package is on its way to the creator.'
                    : 'Our team is preparing your pre-paid label. Tracking appears here once dispatched.'}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Tracking Information</Text>
                <View style={styles.infoRow}>
                  <Icon name="truck" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Tracking number</Text>
                    <Text style={styles.infoValue}>
                      {text(shipment?.tracking_number, '—')}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="box" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Courier</Text>
                    <Text style={styles.infoValue}>
                      {text(shipment?.courier_name, '—')}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="clock" color="#9498B0" size={16} />
                  <View style={styles.flex}>
                    <Text style={styles.infoLabel}>Expected delivery</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(shipment?.expected_delivery) || '—'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Product Details</Text>
                {hasProduct ? (
                  <>
                    <View style={styles.infoRow}>
                      <Icon name="box" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Description</Text>
                        <Text style={styles.infoValue}>
                          {description || '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <Icon name="weight" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Weight</Text>
                        <Text style={styles.infoValue}>
                          {weight ? `${weight} kg` : '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <Icon name="ruler" color="#9498B0" size={16} />
                      <View style={styles.flex}>
                        <Text style={styles.infoLabel}>Dimensions</Text>
                        <Text style={styles.infoValue}>
                          {dimensions || '—'}
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
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7FD' },
  flex: { flex: 1 },
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
  content: { padding: scale(16), paddingTop: scale(4), paddingBottom: scale(30) },

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
});

export default BrandShipmentDetail;
