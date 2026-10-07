type RecordWithId = Record<string, any> & { id: string };

/** Preserve unchanged card identities and avoid a React update for unchanged live data. */
export function reconcileDirectory<T extends RecordWithId>(previous: T[], next: T[]): T[] {
  const old = new Map(previous.map(item => [item.id, item]));
  const merged = next.map(item => {
    const existing = old.get(item.id);
    return existing && JSON.stringify(existing) === JSON.stringify(item) ? existing : item;
  });
  return merged.length === previous.length && merged.every((item, index) => item === previous[index])
    ? previous : merged;
}

export type RowLayout = { y: number; height: number };
/** Horizontal visibility alone cannot decide whether a row is on the vertical screen. */
export function visibleCreatorRow(layouts: Array<RowLayout | undefined>, offset: number, height: number): number {
  if (height <= 0) return 0;
  let best = -1;
  let largest = 0;
  layouts.forEach((layout, index) => {
    if (!layout || layout.height <= 0) return;
    const overlap = Math.max(0, Math.min(layout.y + layout.height, offset + height) - Math.max(layout.y, offset));
    const fraction = overlap / layout.height;
    if (fraction >= 0.5 && fraction > largest) { largest = fraction; best = index; }
  });
  return best;
}
