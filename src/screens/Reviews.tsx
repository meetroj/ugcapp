/**
 * Reviews — native screen replacing the web /reviews page inside the shell.
 * Shows the star breakdown for the signed-in user's rating and the reviews the
 * other party left on completed campaigns. The layout is identical for both
 * roles; only the source of the reviews differs — a creator sees what brands
 * wrote about them, a brand sees what creators wrote about the brand.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SkeletonList } from '../components/Skeleton';
import {
  BACKEND_URL,
  getMe,
  getPublicProfile,
  getReviews,
  type AuthUser,
} from '../api';
import { colors, scale, fontScale } from '../theme';

type Review = Record<string, any> & { id: string };

type Props = {
  token: string;
  session: AuthUser;
  onBack: () => void;
  /** Opens the Messages page from the header chat button. */
  onMessages?: () => void;
  /** Unread count for the header chat badge. */
  unread?: number;
  /** Opens notification settings from the header bell. */
  onNotifications?: () => void;
};

/** Rows of the star breakdown, highest first — matches the design. */
const STAR_BUCKETS = [5, 4, 3, 2, 1] as const;

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const photoUrl = (path: unknown) => {
  if (typeof path !== 'string' || !path) return null;
  return /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;
};

/** "23 Aug 2026" — the date format on the review rows. */
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

type ReviewerEntry = [string, Record<string, unknown>];

/**
 * Looks up the users who wrote the given reviews, one request per distinct
 * reviewer, and returns a map of reviewer_id -> the display fields the card
 * reads. A failed lookup is skipped so one bad id can't blank the whole list.
 */
async function loadReviewers(
  reviews: Review[],
  token: string,
): Promise<Map<string, Record<string, unknown>>> {
  const ids = Array.from(
    new Set(
      reviews
        .map(review => String(review.reviewer_id ?? ''))
        .filter(id => id.length > 0),
    ),
  );

  const entries = await Promise.all(
    ids.map(async id => {
      try {
        const user: Record<string, any> = await getPublicProfile(token, id);
        const nested = user.profile || {};
        const entry: ReviewerEntry = [
          id,
          {
            reviewer_name:
              user.nickname || user.full_name || user.name || nested.full_name,
            reviewer_photo:
              user.profile_photo ||
              user.profile_picture ||
              nested.profile_picture ||
              nested.profile_photo,
          },
        ];
        return entry;
      } catch {
        return null;
      }
    }),
  );

  return new Map(entries.filter((entry): entry is ReviewerEntry => !!entry));
}

const STAR_PATH =
  'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45L2.6 9.45l6.5-.95L12 2.6Z';
/** Left half of the star, used to draw a half-filled rating. */
const HALF_STAR_PATH = 'M12 2.6 9.1 8.5l-6.5.95 4.7 4.6-1.1 6.45L12 17.45V2.6Z';

function Star({ fill = 1, size = 12 }: { fill?: number; size?: number }) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24">
      <Path d={STAR_PATH} fill="#DCDEE9" />
      {fill >= 0.75 && <Path d={STAR_PATH} fill="#FBB215" />}
      {fill > 0.15 && fill < 0.75 && <Path d={HALF_STAR_PATH} fill="#FBB215" />}
    </Svg>
  );
}

/** Five stars rounded to the nearest half, so 4.5 renders as in the design. */
function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <View style={styles.starRow}>
      {[0, 1, 2, 3, 4].map(index => (
        <Star
          key={index}
          size={size}
          fill={Math.max(0, Math.min(1, value - index))}
        />
      ))}
    </View>
  );
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
      {name === 'chat' && (
        <>
          <Path d="M4 4.5h16v11H9l-5 4Z" {...line} />
          <Circle cx="8.5" cy="10" r=".9" fill={color} />
          <Circle cx="12" cy="10" r=".9" fill={color} />
          <Circle cx="15.5" cy="10" r=".9" fill={color} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path
            d="M6.5 10a5.5 5.5 0 0 1 11 0v3.2l1.5 2.3H5l1.5-2.3V10Z"
            {...line}
          />
          <Path d="M10 18.5a2.2 2.2 0 0 0 4 0" {...line} />
        </>
      )}
      {name === 'trophy' && (
        <>
          <Path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" {...line} />
          <Path
            d="M8 5.5H5.5V7a3 3 0 0 0 3 3M16 5.5h2.5V7a3 3 0 0 1-3 3M9.5 20h5M12 13v7"
            {...line}
          />
        </>
      )}
      {name === 'reviews' && (
        <>
          <Rect x={3.5} y={3.5} width={11} height={14} rx={2} {...line} />
          <Path
            d="M17 7h3.5v11a2.5 2.5 0 0 1-2.5 2.5H7.5M7 8h4M7 11.5h4"
            {...line}
          />
        </>
      )}
    </Svg>
  );
}

function Reviews({
  token,
  session,
  onBack,
  onMessages,
  onNotifications,
  unread = 0,
}: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profile, setProfile] = useState<AuthUser>(session);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // A brand is rated by creators, a creator by brands, so each role reads its
  // own endpoint. Everything below this line is shared between the two.
  const isBrand = session.role === 'business';

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      getReviews(token, session.user_id, isBrand ? 'business' : 'creator'),
      getMe(token),
    ]).then(async results => {
      if (!active) return;

      if (results[0].status === 'fulfilled') {
        // getReviews already unwraps the bare array / {reviews: []} shapes.
        let rows: Review[] = results[0].value.map((review, index) => ({
          ...review,
          id: String((review as Review).id ?? index),
        })) as Review[];

        // The brand endpoint returns raw review documents with no reviewer
        // details, so the card would read "Creator" with a blank avatar.
        // Resolve each distinct reviewer once and attach name + photo.
        if (isBrand && rows.length) {
          const authors = await loadReviewers(rows, token);
          rows = rows.map(review => {
            const author = authors.get(String(review.reviewer_id ?? ''));
            return author ? { ...review, ...author } : review;
          });
        }

        if (!active) return;
        setReviews(rows);
      }
      if (results[1].status === 'fulfilled') {
        setProfile(results[1].value as AuthUser);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isBrand, session.user_id, token]);

  // Prefer the aggregate the backend already stores on the user; fall back to
  // averaging the loaded reviews so the card is never blank.
  const stats = useMemo(() => {
    const rated = reviews.filter(review => Number(review.rating) > 0);
    const total = Number(profile.total_reviews) || rated.length;
    const average =
      Number(profile.average_rating) ||
      (rated.length
        ? rated.reduce((sum, review) => sum + Number(review.rating), 0) /
          rated.length
        : 0);

    const counts = STAR_BUCKETS.map(
      bucket =>
        rated.filter(review => Math.round(Number(review.rating)) === bucket)
          .length,
    );
    const denominator = rated.length || 1;
    const percents = counts.map(count =>
      Math.round((count / denominator) * 100),
    );

    return {
      average,
      total,
      percents,
      fiveStar: counts[0],
      fiveStarPercent: percents[0],
    };
  }, [profile.average_rating, profile.total_reviews, reviews]);

  const visible = showAll ? reviews : reviews.slice(0, 3);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="back" color={colors.white} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reviews</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onMessages}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <Icon name="chat" color={colors.white} size={22} />
            {unread > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onNotifications}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Icon name="bell" color={colors.white} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <View style={styles.summaryBadge}>
                <Star fill={1} size={15} />
              </View>
              <Text style={styles.summaryLabel}>Average Rating</Text>
              <View style={styles.averageRow}>
                <Text style={styles.averageValue}>
                  {stats.average.toFixed(1)}
                </Text>
                <Star fill={1} size={16} />
              </View>
              <Text style={styles.summaryCaption}>
                Based on {stats.total} reviews
              </Text>
            </View>

            <View style={styles.breakdown}>
              {STAR_BUCKETS.map((bucket, index) => (
                <View key={bucket} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {bucket} {bucket === 1 ? 'Star' : 'Stars'}
                  </Text>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        { width: `${Math.max(stats.percents[index], 2)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.breakdownPercent}>
                    {stats.percents[index]}%
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <View style={styles.tileHead}>
                <View style={[styles.tileIcon, styles.tileIconGold]}>
                  <Icon name="trophy" color="#E9A100" size={15} />
                </View>
                <Text style={styles.tileTitle}>5-Star Reviews</Text>
              </View>
              <Text style={styles.tileValue}>{stats.fiveStar}</Text>
              <Text style={styles.tileCaptionGreen}>
                {stats.fiveStarPercent}% of all reviews
              </Text>
            </View>

            <View style={styles.tile}>
              <View style={styles.tileHead}>
                <View style={[styles.tileIcon, styles.tileIconBlue]}>
                  <Icon name="reviews" color="#5B5CF6" size={15} />
                </View>
                <Text style={styles.tileTitle}>Total Reviews</Text>
              </View>
              <Text style={styles.tileValue}>{stats.total}</Text>
              <Text style={styles.tileCaption}>From completed campaigns</Text>
            </View>
          </View>
        </View>

        <View style={styles.listHead}>
          <Text style={styles.listTitle}>Recent Reviews</Text>
          {reviews.length > 3 && (
            <TouchableOpacity
              onPress={() => setShowAll(value => !value)}
              accessibilityRole="button"
            >
              <Text style={styles.seeAll}>
                {showAll ? 'Show less' : 'See all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && <SkeletonList count={4} avatar lines={2} />}

        {!loading && !reviews.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptyText}>
              Ratings from {isBrand ? 'creators' : 'brands'} appear here once a
              campaign is completed.
            </Text>
          </View>
        )}

        {visible.map(review => (
          <ReviewCard key={review.id} review={review} isBrand={isBrand} />
        ))}
      </ScrollView>
    </View>
  );
}

function ReviewCard({
  review,
  isBrand,
}: {
  review: Review;
  /** A brand's reviews are written by creators, so the row shows the creator. */
  isBrand: boolean;
}) {
  const author = isBrand
    ? text(
        review.reviewer_name || review.creator_name || review.username,
        'Creator',
      )
    : text(
        review.brand_name || review.business_name || review.reviewer_name,
        'Brand',
      );
  const logo = photoUrl(
    isBrand
      ? review.reviewer_photo || review.creator_photo
      : review.brand_logo || review.business_logo,
  );
  const body = text(review.review || review.comment, '');
  const campaign = text(review.campaign_type || review.campaign_name, '');

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewTop}>
        <View style={styles.reviewLogo}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.reviewLogoImage} />
          ) : (
            <Text style={styles.reviewLogoText}>
              {author.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.reviewCopy}>
          <Text style={styles.reviewBrand}>{author}</Text>
          <Stars value={Number(review.rating) || 0} />
        </View>
        {!!campaign && (
          <View style={styles.campaignChip}>
            <Text style={styles.campaignChipText}>Campaign: {campaign}</Text>
          </View>
        )}
      </View>
      {!!body && <Text style={styles.reviewBody}>{body}</Text>}
      <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1330' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(12),
    paddingTop: scale(8),
    paddingBottom: scale(10),
  },
  headerBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontSize: fontScale(17),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: scale(18),
    height: scale(18),
    borderRadius: scale(9),
    paddingHorizontal: scale(4),
    backgroundColor: '#E23B3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: colors.white,
    fontSize: fontScale(10),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
  },

  // The content sits on the light sheet below the dark app bar.
  body: {
    flex: 1,
    backgroundColor: '#F6F7FC',
    borderTopLeftRadius: scale(18),
    borderTopRightRadius: scale(18),
  },
  content: { padding: scale(14), paddingBottom: scale(30) },

  card: {
    marginTop: scale(12),
    padding: scale(14),
    borderRadius: scale(16),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
    shadowColor: '#1B1B45',
    shadowOpacity: 0.06,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(4) },
    elevation: 2,
  },

  // --- rating summary ---
  summaryRow: { flexDirection: 'row' },
  summaryLeft: { width: scale(118) },
  summaryBadge: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(9),
    backgroundColor: '#FDF3DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    marginTop: scale(8),
    fontSize: fontScale(10),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#7C819C',
  },
  averageRow: {
    marginTop: scale(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
  },
  averageValue: {
    fontSize: fontScale(30),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#14153C',
  },
  summaryCaption: { marginTop: scale(6), fontSize: fontScale(9), color: '#8A8FA8' },
  breakdown: { flex: 1, justifyContent: 'center', gap: scale(7) },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: scale(7) },
  breakdownLabel: { width: scale(42), fontSize: fontScale(9), color: '#6E7391' },
  track: {
    flex: 1,
    height: scale(5),
    borderRadius: scale(3),
    backgroundColor: '#E9EAF3',
    overflow: 'hidden',
  },
  trackFill: { height: scale(5), borderRadius: scale(3), backgroundColor: '#4C5BF3' },
  breakdownPercent: {
    width: scale(28),
    textAlign: 'right',
    fontSize: fontScale(9),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },

  // --- stat tiles ---
  tileRow: { marginTop: scale(14), flexDirection: 'row', gap: scale(10) },
  tile: {
    flex: 1,
    padding: scale(11),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#ECEDF6',
    backgroundColor: '#FBFBFE',
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  tileIcon: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconGold: { backgroundColor: '#FDF3DC' },
  tileIconBlue: { backgroundColor: '#EEF0FE' },
  tileTitle: {
    fontSize: fontScale(10),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '700',
    color: '#5C6180',
  },
  tileValue: {
    marginTop: scale(8),
    fontSize: fontScale(22),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#14153C',
  },
  tileCaption: { marginTop: scale(3), fontSize: fontScale(9), color: '#8A8FA8' },
  tileCaptionGreen: { marginTop: scale(3), fontSize: fontScale(9), color: '#17AC54' },

  // --- review list ---
  listHead: {
    marginTop: scale(18),
    marginBottom: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '900',
    color: '#14153C',
  },
  seeAll: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C5BF3',
  },
  loading: { marginTop: scale(20) },
  empty: { marginTop: scale(24), alignItems: 'center' },
  emptyTitle: {
    fontSize: fontScale(14),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#25274C',
  },
  emptyText: {
    marginTop: scale(5),
    fontSize: fontScale(11),
    color: '#858AA3',
    textAlign: 'center',
  },
  reviewCard: {
    marginBottom: scale(10),
    padding: scale(12),
    borderRadius: scale(14),
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#ECEDF6',
    shadowColor: '#1B1B45',
    shadowOpacity: 0.05,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: scale(3) },
    elevation: 2,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center' },
  reviewLogo: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: '#14153C',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reviewLogoImage: { width: '100%', height: '100%' },
  reviewLogoText: {
    fontSize: fontScale(13),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#FFF',
  },
  reviewCopy: { flex: 1, marginLeft: scale(10) },
  reviewBrand: {
    fontSize: fontScale(12),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#14153C',
  },
  starRow: { marginTop: scale(3), flexDirection: 'row', gap: scale(2) },
  campaignChip: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    backgroundColor: '#EEF0FE',
  },
  campaignChipText: {
    fontSize: fontScale(8),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4C4DD6',
  },
  reviewBody: {
    marginTop: scale(9),
    fontSize: fontScale(11),
    lineHeight: fontScale(16),
    color: '#5C6180',
  },
  reviewDate: { marginTop: scale(8), fontSize: fontScale(9), color: '#9498B0' },
});

export default Reviews;
