/**
 * "View details" on a private brief card: the brief opens right here in the chat as a
 * sheet, so the creator can read it before answering, instead of being sent to a deal
 * screen. Data = the card's own fields, completed from the campaign when it can be read.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { Text } from './Text';
import { getCampaign } from '../api';
import { briefSections, stripBrandOnlyLines } from '../briefs';
import { fontScale, scale } from '../theme';

type Row = [string, string];

const inr = (n: unknown) => {
  const v = Number(n);
  return v > 0 ? `₹${v.toLocaleString('en-IN')}` : '';
};
const day = (value: unknown) => {
  if (!value) return '';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The headline rows at the top of the sheet; blank values are dropped. Exported for tests. */
export function summaryRows(card: Record<string, any>, campaign: Record<string, any> | null): Row[] {
  const f = card.fields || {};
  const c = campaign || {};
  const rows: Row[] = [
    ['Brand', c.brand_name || c.business_name || card.sender_nickname],
    ['Price', inr(f.budget || c.per_video_budget || c.budget_max || c.budget_min)],
    // Before the full brief has loaded (or if it cannot), the card's own summary stands in.
    ...(campaign ? [] : [['Deliverables', f.deliverable_summary] as Row]),
    ['Respond by', day(f.response_deadline || f.expires_at)],
  ].map(([k, v]) => [k, String(v ?? '').trim()] as Row);
  return rows.filter(([, v]) => !!v);
}

export default function PrivateBriefSheet({
  visible,
  token,
  card,
  onClose,
}: {
  visible: boolean;
  token: string;
  card: Record<string, any> | null;
  onClose: () => void;
}) {
  const [campaign, setCampaign] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const id = String(card?.deal_id || '');

  useEffect(() => {
    if (!visible || !id || /^DEAL-/i.test(id)) return;
    let alive = true;
    setLoading(true);
    getCampaign(token, id)
      .then(c => alive && setCampaign(c as Record<string, any>))
      .catch(() => alive && setCampaign(null)) // the card's own fields still show
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [visible, id, token]);

  const f = card?.fields || {};
  const title = String(campaign?.title || f.campaign_name || 'Private brief');
  const description = stripBrandOnlyLines(String(campaign?.brief_text || '')).trim();
  const sections = campaign ? briefSections(campaign) : [];

  return (
    <BottomSheet visible={visible && !!card} title={title} onClose={onClose}>
      {loading && <ActivityIndicator style={styles.spinner} color="#4C4DD6" />}
      {card && summaryRows(card, campaign).map(([label, value]) => (
        <View key={label} style={styles.row} testID={`brief-row-${label}`}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      {!!description && (
        <View style={styles.section}>
          <Text style={styles.heading}>Description</Text>
          <Text style={styles.body}>{description}</Text>
        </View>
      )}
      {sections.map(section => (
        <View key={section.title} style={styles.section} testID={`brief-section-${section.title}`}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.rows.map(([label, value]) => (
            <View key={label} style={styles.dataRow}>
              <Text style={styles.dataKey}>{label}</Text>
              <Text style={styles.dataValue}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.hint}>Use Accept or Decline on the card to answer this brief.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: scale(10) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: scale(16),
    paddingVertical: scale(11),
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F7',
  },
  label: { fontSize: fontScale(12.5), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#8A8FAA' },
  value: { flex: 1, textAlign: 'right', fontSize: fontScale(14), fontFamily: 'Inter-Bold', fontWeight: '700', color: '#15163F' },
  section: { marginTop: scale(20) },
  // Section headings are bold and dark so each group reads as its own block.
  heading: {
    fontSize: fontScale(16),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#15163F',
    marginBottom: scale(10),
  },
  body: { fontSize: fontScale(14), lineHeight: fontScale(21), color: '#4A4E6B' },
  dataRow: { flexDirection: 'row', marginBottom: scale(10) },
  dataKey: { width: scale(118), flexShrink: 0, fontSize: fontScale(13), color: '#858AA3' },
  dataValue: { flex: 1, minWidth: 0, fontSize: fontScale(14), lineHeight: fontScale(20), color: '#262847' },
  hint: { marginTop: scale(18), fontSize: fontScale(12.5), lineHeight: fontScale(18), color: '#8A8FAA' },
});
