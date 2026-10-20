/**
 * Shipment helpers shared by the brand's shipments list and detail screens, so
 * both read the same backend fields the website does (BusinessDashboard.js
 * shipments tab, ShipmentTracking.js).
 */
import { BACKEND_URL } from './api';

type Doc = Record<string, any> | null | undefined;

export type ShipStatus = {
  key: 'nocreator' | 'ready' | 'awaiting' | 'pickup' | 'transit' | 'delivered' | 'issue';
  label: string;
  bg: string;
  fg: string;
};

/** Statuses at which a shipment doc counts as real (website: hasRealShipment). */
const REAL_STATUSES = [
  'requested',
  'awaiting_pickup',
  'label_generated',
  'shipped',
  'in_transit',
  'delivered',
  'received',
];

/** The backend refuses shipping for these ("closed and cannot request shipment"). */
const CLOSED = ['draft', 'rejected', 'cancelled', 'banned'];

/** Campaigns that need a physical shipment (website: requires_shipment or shipment_option yes). */
export const needsShipment = (campaign: Doc) =>
  !!campaign &&
  (!!campaign.requires_shipment || campaign.shipment_option === 'yes') &&
  !CLOSED.includes(String(campaign.status || '').toLowerCase());

/** A stale or empty record still needs shipping, so it is not a real shipment. */
export function isRealShipment(shipment: Doc): boolean {
  if (!shipment) return false;
  const status = String(shipment.status || '').toLowerCase();
  return (
    !!shipment.requested ||
    !!shipment.tracking_number ||
    !!shipment.label_url ||
    REAL_STATUSES.includes(status) ||
    status === 'returned' ||
    status === 'lost'
  );
}

/**
 * The backend writes a MOCK AWB ("MOCK<id>", courier "Shiprocket (mock)",
 * label "/mock-labels/..") when /deals/{id}/ship-label runs without a courier
 * token. Never present that as a real parcel.
 */
export function isMockShipment(shipment: Doc): boolean {
  if (!shipment) return false;
  return (
    /^MOCK/i.test(String(shipment.tracking_number || '')) ||
    /mock/i.test(String(shipment.courier_name || '')) ||
    String(shipment.label_url || '').startsWith('/mock-labels/')
  );
}

/**
 * Chip for a shipment, from the real backend `status` values (requested,
 * awaiting_pickup, shipped / in_transit, delivered / received, returned, lost).
 * A tracking number alone does NOT mean in transit: a label can exist while
 * the courier has not collected the parcel.
 */
export function shipmentStatus(shipment: Doc, hasCreator = true): ShipStatus {
  if (!hasCreator) {
    return { key: 'nocreator', label: 'Awaiting creator', bg: '#F1F2F8', fg: '#6E7391' };
  }
  if (!isRealShipment(shipment)) {
    return { key: 'ready', label: 'Ready to ship', bg: '#EEEFFF', fg: '#4C4DD6' };
  }
  const raw = String(shipment?.status || '').toLowerCase();
  if (raw === 'delivered' || raw === 'received' || shipment?.received_at) {
    return { key: 'delivered', label: 'Delivered', bg: '#E2F7EE', fg: '#0F7B43' };
  }
  if (raw === 'shipped' || raw === 'in_transit') {
    return { key: 'transit', label: 'In transit', bg: '#E4F0FF', fg: '#1F62B8' };
  }
  if (raw === 'returned' || raw === 'lost') {
    return {
      key: 'issue',
      label: raw === 'lost' ? 'Lost' : 'Returned',
      bg: '#FDECEC',
      fg: '#C4373B',
    };
  }
  if (shipment?.tracking_number) {
    return { key: 'pickup', label: 'Awaiting pickup', bg: '#FFF3DF', fg: '#B4741B' };
  }
  return {
    key: 'awaiting',
    label: shipment?.awaiting_creator_address ? 'Awaiting address' : 'Awaiting label',
    bg: '#FFF3DF',
    fg: '#B4741B',
  };
}

/** Uploaded files come back as "/uploads/.."; absolute URLs are used as they are. */
export function resolveMediaUrl(url: unknown): string {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${BACKEND_URL}${value.startsWith('/') ? '' : '/'}${value}`;
}

/**
 * India Post lookup the website uses so the pickup City and State always match
 * the Pincode. Returns null on any failure, so typing never gets blocked.
 */
export async function lookupPincode(pin: string): Promise<{ city: string; state: string } | null> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const json = await res.json();
    const office = json?.[0]?.PostOffice?.[0];
    if (!office) return null;
    return { city: office.District || '', state: office.State || '' };
  } catch {
    return null;
  }
}
