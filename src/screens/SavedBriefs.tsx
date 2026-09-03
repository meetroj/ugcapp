/**
 * Saved — the native screen for the Profile tab's "Saved" row.
 *
 * Reads the ids from GET /api/saved-briefs (stored on the user document as
 * `saved_briefs`, so saves follow the account across devices) and resolves each
 * one against the campaign list to render a real card. Un-saving here calls
 * DELETE and drops the row immediately.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Path } from 'react-native-svg';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { getCampaigns, getSavedBriefs, removeSavedBrief } from '../api';
import { scale, fontScale } from '../theme';

type Campaign = Record<string, any> & { id: string };

type Props = {
  token: string;
  onBack: () => void;
  /** Sends the user somewhere useful when nothing is saved yet. */
  onBrowse: () => void;
};

const textOf = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const money = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

const nameOf = (c: Campaign) =>
  textOf(c.brand_name || c.brand?.name || c.company_name, 'Brand');

const titleOf = (c: Campaign) =>
  textOf(c.title || c.campaign_title || c.name, 'Untitled campaign');

function BookmarkIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" fill="#4943EB" stroke="#4943EB" />
    </Svg>
  );
}

function SavedBriefs({ token, onBack, onBrowse }: Props) {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const ids = await getSavedBriefs(token);
      if (!ids.length) {
        setItems([]);
        return;
      }
      // There is no bulk "campaigns by id" endpoint, so pull the list once and
      // match locally rather than firing one request per saved id.
      const list = await getCampaigns(token);
      const byId = new Map(
        list.map(c => [String(c.id || c.campaign_id), c as Campaign]),
      );
      // A saved campaign that has since been taken down resolves to nothing;
      // keep a stub so the row still appears and can be un-saved.
      setItems(
        ids.map(id => {
          const found = byId.get(id);
          return found ? { ...found, id } : { id, unavailable: true };
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const unsave = useCallback(
    (id: string) => {
      const previous = items;
      setItems(current => current.filter(c => c.id !== id));
      // Roll the row back if the server refuses, so the list never claims a
      // removal that did not happen.
      removeSavedBrief(token, id).catch(() => setItems(previous));
    },
    [items, token],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Saved" onBack={onBack} />
      <View style={styles.sheet}>
        {loading ? (
          <View style={styles.content}>
            <SkeletonList count={4} lines={2} />
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
            {failed ? (
              <View style={styles.card}>
                <Text style={styles.title}>Couldn&apos;t load your saves</Text>
                <Text style={styles.body}>
                  Check your connection and pull down to try again.
                </Text>
              </View>
            ) : null}

            {!failed && !items.length ? (
              <View style={styles.card}>
                <Text style={styles.title}>Nothing saved yet</Text>
                <Text style={styles.body}>
                  Tap the bookmark on any campaign in Browse Campaigns and it
                  will collect here.
                </Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={onBrowse}
                  accessibilityRole="button"
                >
                  <Text style={styles.buttonText}>Browse Campaigns</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {items.map(item => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowText}>
                  {item.unavailable ? (
                    <>
                      <Text style={styles.rowTitle}>
                        Campaign no longer available
                      </Text>
                      <Text style={styles.rowMeta}>
                        It may have closed or been removed.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.rowBrand}>{nameOf(item)}</Text>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {titleOf(item)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {money(item.budget || item.max_budget)}
                      </Text>
                    </>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => unsave(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove from saved"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <BookmarkIcon />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Navy backdrop behind the header; the sheet below covers the rest.
  screen: { flex: 1, backgroundColor: '#0E1330' },
  sheet: {
    flex: 1,
    backgroundColor: '#F8F8FE',
    borderTopLeftRadius: scale(22),
    borderTopRightRadius: scale(22),
    overflow: 'hidden',
  },
  content: { padding: scale(18), paddingBottom: scale(30), gap: scale(12) },
  card: {
    marginTop: scale(30),
    padding: scale(20),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
    alignItems: 'center',
  },
  title: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  body: {
    marginTop: scale(9),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
    textAlign: 'center',
  },
  button: {
    marginTop: scale(18),
    height: scale(46),
    paddingHorizontal: scale(22),
    borderRadius: scale(13),
    backgroundColor: '#5B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECF6',
  },
  rowText: { flex: 1 },
  rowBrand: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#7E829D',
  },
  rowTitle: {
    marginTop: scale(3),
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#11123D',
  },
  rowMeta: {
    marginTop: scale(4),
    fontSize: fontScale(12),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4943EB',
  },
});

export default SavedBriefs;
