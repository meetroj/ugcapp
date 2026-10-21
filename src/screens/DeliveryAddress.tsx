/**
 * "Confirm your delivery address" card for the creator's Deal Room (the site's
 * components/ShippingDetailsCard.js). Only shown when a physical product ships.
 * GET /api/shipping/address?campaign_id= says what is saved and whether each
 * side confirmed; POST /api/shipping/address saves it. The brand never sees
 * the address, only a confirmed/pending chip.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { Alert } from '../components/AppAlert';
import {
  getShippingAddress,
  saveShippingAddress,
  type ShippingAddress,
  type ShippingStatus,
} from '../api';
import { fontScale, scale } from '../theme';

const EMPTY: ShippingAddress = {
  full_name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India',
};
const REQUIRED: (keyof ShippingAddress)[] = ['full_name', 'phone', 'line1', 'city', 'state', 'pincode'];

/** Same rule as the site: every required field, 10-digit phone, 6-digit pincode. */
export const isValidAddress = (a?: Partial<ShippingAddress> | null) =>
  !!a &&
  REQUIRED.every(k => String(a[k] || '').trim()) &&
  /^\d{6}$/.test(String(a.pincode).trim()) &&
  /^\d{10}$/.test(String(a.phone).replace(/\D/g, '').slice(-10));

export const sameAddress = (a?: Partial<ShippingAddress> | null, b?: Partial<ShippingAddress> | null) =>
  (['line1', 'city', 'pincode'] as const).every(
    k => String(a?.[k] || '').trim().toLowerCase() === String(b?.[k] || '').trim().toLowerCase(),
  );

const oneLine = (a: ShippingAddress) =>
  [a.line1, a.line2, a.city, `${a.state} ${a.pincode}`, a.country].filter(Boolean).join(', ');

type Props = {
  token: string;
  /** The deal's campaign.id (the endpoint also accepts DEAL-xxxx). */
  campaignId: string;
  /** Called after a save so the Deal Room refetches (primary action changes). */
  onSaved?: (bothReady: boolean) => void;
  /** Bump to open the form (the "Confirm Delivery Address" next-action button). */
  openSignal?: number;
};

export default function DeliveryAddress({ token, campaignId, onSaved, openSignal = 0 }: Props) {
  const [status, setStatus] = useState<ShippingStatus | null>(null);
  const [form, setForm] = useState<ShippingAddress>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!campaignId) {
      setLoading(false);
      return;
    }
    try {
      const data = await getShippingAddress(token, campaignId);
      if (!alive.current) return;
      setStatus(data);
      setLoadError('');
      // Whatever is already known seeds the form: last address first, else the account's.
      setForm({ ...EMPTY, ...(data.address || data.account_address || {}) });
      setEditing(false);
    } catch (e) {
      if (!alive.current) return;
      setStatus(null);
      setLoadError(e instanceof Error && e.message ? e.message : "Couldn't load your shipping details.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [campaignId, token]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (openSignal > 0) setEditing(true);
  }, [openSignal]);

  const set = (key: keyof ShippingAddress, value: string) => setForm(f => ({ ...f, [key]: value }));

  const save = async (addr: ShippingAddress) => {
    if (lock.current) return;
    if (!isValidAddress(addr)) {
      setError('Fill all fields. Phone must be 10 digits and pincode 6 digits.');
      return;
    }
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      const data = await saveShippingAddress(token, campaignId, { ...EMPTY, ...addr });
      Alert.alert(
        'Address saved',
        data.both_ready
          ? 'Both addresses confirmed. The team will dispatch shortly.'
          : 'Saved. Waiting for the brand to confirm.',
      );
      setEditing(false);
      await load();
      onSaved?.(!!data.both_ready);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save address');
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#3D4FD8" />
        <Text style={styles.muted}>Loading shipping details...</Text>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button">
          <Text style={styles.ghostText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!status || !status.requires_shipment || status.my_role !== 'creator') return null;

  const dispatched = ['shipped', 'in_transit', 'delivered', 'received'].includes(String(status.shipment_status));
  const saved = status.address;
  const account = status.account_address;
  const accountComplete = !!account && (status.account_missing || []).length === 0;
  const mine = status.creator_confirmed;
  const theirs = status.brand_confirmed;

  const options: { key: string; title: string; addr: ShippingAddress }[] = [];
  if (saved && isValidAddress(saved)) options.push({ key: 'saved', title: 'Your last delivery address', addr: saved });
  if (accountComplete && isValidAddress(account) && !(saved && sameAddress(saved, account))) {
    options.push({ key: 'account', title: 'Address from your account', addr: account as ShippingAddress });
  }
  const showForm = editing || (!mine && options.length === 0);
  const showChoices = !mine && !showForm && options.length > 0;
  const prefilledFromAccount = !!account && !saved && !accountComplete;

  const field = (label: string, key: keyof ShippingAddress, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={String(form[key] || '')}
        onChangeText={(v: string) => set(key, v)}
        editable={!saving}
        placeholderTextColor="#A9ADC2"
        {...extra}
      />
    </View>
  );

  return (
    <View style={styles.card} testID="delivery-address-card">
      <Text style={styles.title}>Confirm your delivery address</Text>
      <Text style={styles.sub}>The product will be couriered here. The brand never sees your address.</Text>

      <View style={styles.chips}>
        <Text style={[styles.chip, mine ? styles.chipOk : styles.chipWait]}>
          {`You ${mine ? 'confirmed' : 'pending'}`}
        </Text>
        <Text style={[styles.chip, theirs ? styles.chipOk : styles.chipWait]}>
          {`Brand ${theirs ? 'confirmed' : 'pending'}`}
        </Text>
        {status.both_ready && (
          <Text style={[styles.chip, styles.chipReady]}>{dispatched ? 'Dispatched' : 'Ready to dispatch'}</Text>
        )}
      </View>

      {showChoices && (
        <View>
          <Text style={styles.lead}>We already have an address for you. Pick one, or enter a new one.</Text>
          {options.map(o => (
            <View key={o.key} style={styles.choice}>
              <Text style={styles.src}>{o.title.toUpperCase()}</Text>
              <Text style={styles.addrName}>{`${o.addr.full_name} · ${o.addr.phone}`}</Text>
              <Text style={styles.addrLine}>{oneLine(o.addr)}</Text>
              <TouchableOpacity style={styles.saveBtn} disabled={saving} onPress={() => save(o.addr)} accessibilityRole="button" accessibilityLabel={`Deliver here: ${o.title}`}>
                {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.saveText}>Deliver here</Text>}
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.ghostBtn} onPress={() => { setForm({ ...EMPTY }); setEditing(true); }} accessibilityRole="button">
            <Text style={styles.ghostText}>Enter a new address</Text>
          </TouchableOpacity>
        </View>
      )}

      {mine && !showForm && !!saved && (
        <View>
          <Text style={styles.addrName}>{`${saved.full_name} · ${saved.phone}`}</Text>
          <Text style={styles.addrLine}>{oneLine(saved)}</Text>
          {!dispatched && (
            <TouchableOpacity style={styles.ghostBtn} onPress={() => { setForm({ ...EMPTY, ...saved }); setEditing(true); }} accessibilityRole="button">
              <Text style={styles.ghostText}>Edit address</Text>
            </TouchableOpacity>
          )}
          {status.both_ready && (
            <Text style={styles.note}>Both addresses are in. Our team will generate the label and ship. You will get tracking here.</Text>
          )}
          {!theirs && <Text style={styles.note}>Waiting on the brand to confirm their address.</Text>}
        </View>
      )}

      {mine && !showForm && !saved && (
        <Text style={styles.note}>Your delivery address is confirmed for this deal.</Text>
      )}

      {showForm && (
        <View>
          {prefilledFromAccount && <Text style={styles.lead}>Pre-filled from your account. Just add what is missing.</Text>}
          {!!account && !prefilledFromAccount && !sameAddress(form, account) && (
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setForm({ ...EMPTY, ...account })} accessibilityRole="button">
              <Text style={styles.ghostText}>Use the address from my account</Text>
            </TouchableOpacity>
          )}
          {field('Full name', 'full_name', { placeholder: 'Name for the courier', autoComplete: 'name' })}
          {field('Phone', 'phone', { placeholder: '10-digit mobile', keyboardType: 'number-pad', maxLength: 10, onChangeText: (v: string) => set('phone', v.replace(/\D/g, '').slice(0, 10)) })}
          {field('Address line 1', 'line1', { placeholder: 'House / building, street' })}
          {field('Address line 2 (optional)', 'line2', { placeholder: 'Area, landmark' })}
          {field('City', 'city')}
          {field('State', 'state')}
          {field('Pincode', 'pincode', { placeholder: '6-digit', keyboardType: 'number-pad', maxLength: 6, onChangeText: (v: string) => set('pincode', v.replace(/\D/g, '').slice(0, 6)) })}
          {field('Country', 'country')}
          <View style={styles.actions}>
            {(!!saved || options.length > 0) && (
              <TouchableOpacity style={[styles.ghostBtn, styles.flex]} onPress={() => { setForm({ ...EMPTY, ...(saved || account || {}) }); setEditing(false); setError(''); }} disabled={saving} accessibilityRole="button">
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, styles.flex, !isValidAddress(form) && styles.saveOff]} disabled={saving || !isValidAddress(form)} onPress={() => save(form)} accessibilityRole="button" accessibilityLabel="Confirm delivery address">
              {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.saveText}>Confirm delivery address</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: scale(12),
    padding: scale(14),
    borderRadius: scale(14),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EBF4',
  },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: fontScale(15), fontFamily: 'ReadexPro-SemiBold', fontWeight: '800', color: '#15163A' },
  sub: { marginTop: scale(3), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#6B7094' },
  muted: { marginTop: scale(6), fontSize: fontScale(14), color: '#6B7094', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginVertical: scale(10) },
  chip: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: scale(12),
    overflow: 'hidden',
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },
  chipOk: { backgroundColor: '#E8F7EF', color: '#0F7A43' },
  chipWait: { backgroundColor: '#FFF4E5', color: '#A35B00' },
  chipReady: { backgroundColor: '#EEF0FF', color: '#3730A3' },
  lead: { marginBottom: scale(10), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#585C7E' },
  choice: {
    marginBottom: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E6E8F3',
  },
  src: { fontSize: fontScale(12), fontFamily: 'Inter-ExtraBold', fontWeight: '800', color: '#7A7F9C' },
  addrName: { marginTop: scale(4), fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#15163A' },
  addrLine: { marginTop: scale(2), fontSize: fontScale(14), lineHeight: fontScale(20), color: '#585C7E' },
  note: { marginTop: scale(10), fontSize: fontScale(13), lineHeight: fontScale(18), color: '#6B7094' },
  field: { marginTop: scale(10) },
  fieldLabel: { marginBottom: scale(4), fontSize: fontScale(13), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#5B6573' },
  // 16px so iOS does not zoom the screen when the field is focused.
  input: {
    minHeight: scale(46),
    paddingHorizontal: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#15163A',
  },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: scale(14) },
  saveBtn: {
    minHeight: scale(46),
    marginTop: scale(10),
    paddingHorizontal: scale(14),
    borderRadius: scale(11),
    backgroundColor: '#4452F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', textAlign: 'center' },
  ghostBtn: {
    minHeight: scale(46),
    marginTop: scale(10),
    paddingHorizontal: scale(14),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: '#D6DBFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { color: '#4452F0', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', textAlign: 'center' },
  errorText: { marginTop: scale(10), fontSize: fontScale(14), color: '#C0392B' },
});
