import { useLiveEffect } from "../liveUpdates";
/**
 * Saved — the native screen for the Profile tab's "Saved" row.
 *
 * Reads the ids from GET /api/saved-briefs (stored on the user document as
 * `saved_briefs`, so saves follow the account across devices) and resolves each
 * one to a real campaign: from the campaign list when it is there, otherwise
 * from GET /api/campaigns/{id} like the website does. An id that no longer
 * resolves (removed brief) is dropped. A card opens the full brief, and the
 * brief's own button carries on to the bid, so a saved brief can be bid on
 * without going back to Browse.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { ToastBar, useToast } from '../components/Toast';
import {
  getCampaign,
  getCampaigns,
  getMyBids,
  getSavedBriefs,
  addSavedBrief,
  removeSavedBrief,
  type AuthUser,
} from '../api';
import { isOpenForBids, isSelectedCreator, loadErrorText, ownBidOn } from '../briefs';
import { BriefFlow, CampaignCard } from './BrowseCampaigns';
import { scale, fontScale } from '../theme';

type Campaign = Record<string, any> & { id: string };

type Props = {
  token: string;
  onBack: () => void;
  /** Sends the user somewhere useful when nothing is saved yet. */
  onBrowse: () => void;
  /** Needed to tell which briefs the creator is already hired on. */
  session?: AuthUser;
  /** KYC and profile gates send the creator to /kyc and /settings. */
  onNavigate?: (path: string) => void;
};

function SavedBriefs({ token, onBack, onBrowse, session, onNavigate }: Props) {
  const [items, setItems] = useState<Campaign[]>([]);
  // Ids still saved. Held apart from `items` so un-saving inside the brief view
  // and then re-saving it keeps working.
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [bids, setBids] = useState<Record<string, Record<string, any>>>({});
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const me = String(session?.user_id || '');

  const load = useCallback(async () => {
    setError('');
    try {
      const ids = await getSavedBriefs(token);
      setSavedIds(ids);
      if (!ids.length) {
        setItems([]);
        return;
      }
      // One list call covers most ids; the rest (closed, or a private brief)
      // are fetched by id as the website does. A 404 drops that id.
      const list = await getCampaigns(token);
      const byId = new Map(list.map(c => [String(c.id || c.campaign_id), c as Campaign]));
      const resolved = await Promise.all(
        ids.map(async id => {
          const found = byId.get(id);
          if (found) return { ...found, id } as Campaign;
          const one = await getCampaign(token, id).catch(() => null);
          return one ? ({ ...one, id } as Campaign) : null;
        }),
      );
      setItems(resolved.filter((c): c is Campaign => !!c));
    } catch (e) {
      setError(loadErrorText(e, 'your saved campaigns'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Already-bid state for the cards. Best effort.
    Promise.resolve()
      .then(() => getMyBids(token))
      .then(rows => {
        const next: Record<string, Record<string, any>> = {};
        for (const row of rows) {
          const id = String(row?.campaign?.id || row?.id || '');
          if (id && row.my_bid) next[id] = { ...row.my_bid, status: row.bid_status || row.my_bid.status };
        }
        setBids(next);
      })
      .catch(() => {});
  }, [token]);

  useLiveEffect(() => {
    load();
  }, [load]);

  const toggleSave = useCallback(
    (id: string) => {
      const wasSaved = savedIds.includes(id);
      setSavedIds(current => (wasSaved ? current.filter(x => x !== id) : [...current, id]));
      toast.show(wasSaved ? 'Removed from saved' : 'Saved to your list');
      // Roll back if the server refuses, so the list never claims a change that did not happen.
      (wasSaved ? removeSavedBrief : addSavedBrief)(token, id).catch(() => {
        setSavedIds(current => (wasSaved ? [...current, id] : current.filter(x => x !== id)));
        toast.show("Couldn't update saved briefs. Check your connection.");
      });
    },
    [savedIds, token, toast],
  );

  const rows = useMemo(() => items.filter(c => savedIds.includes(c.id)), [items, savedIds]);
  const closedOf = (c: Campaign) => !isOpenForBids(c) || isSelectedCreator(c, me);
  const bidFor = (c: Campaign) => bids[c.id] || ownBidOn(c, me);

  if (selected) {
    return (
      <>
        <BriefFlow
          campaign={selected}
          token={token}
          session={session}
          saved={savedIds.includes(selected.id)}
          onToggleSave={() => toggleSave(selected.id)}
          onBack={() => setSelected(null)}
          onNavigate={onNavigate}
          myBid={bidFor(selected)}
          closed={closedOf(selected)}
          onDone={message => {
            setSelected(null);
            toast.show(message);
            load();
          }}
        />
        <ToastBar message={toast.message} />
      </>
    );
  }

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
            {error ? (
              <View style={styles.card}>
                <Text style={styles.title}>Couldn&apos;t load your saves</Text>
                <Text style={styles.body}>{error}</Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    setLoading(true);
                    load();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                >
                  <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!error && !rows.length ? (
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

            {rows.map(item => (
              <CampaignCard
                key={item.id}
                campaign={item}
                saved
                closed={closedOf(item)}
                bid={bidFor(item)}
                onPress={() => setSelected(item)}
                onToggleSave={() => toggleSave(item.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
      <ToastBar message={toast.message} />
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
  // The cards bring their own side margin; only the empty/error card needs the gutter.
  content: { paddingVertical: scale(14), paddingBottom: scale(30) },
  card: {
    marginTop: scale(30),
    marginHorizontal: scale(18),
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
    minHeight: scale(46),
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
});

export default SavedBriefs;
