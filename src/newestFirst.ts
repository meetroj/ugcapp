/** Newest-first ordering shared by every list screen (deals, bids, reviews, shipments). */

const DATE_KEYS = ['submitted_at', 'submittedAt', 'updated_at', 'updatedAt', 'created_at', 'createdAt'];

/** ms timestamp of the first usable date on `item` (or its `campaign`), 0 when none. */
export function itemTime(item: unknown, ...nested: string[]): number {
  const rec = (item || {}) as Record<string, any>;
  for (const source of [rec, ...nested.map(key => rec[key] || {})]) {
    for (const key of DATE_KEYS) {
      const ms = Date.parse(String(source[key] ?? ''));
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

/** Copy sorted newest first; rows with no date keep their order at the end (stable sort). */
export function newestFirst<T>(list: T[], time: (item: T) => number = item => itemTime(item)): T[] {
  return [...list].sort((a, b) => time(b) - time(a));
}
