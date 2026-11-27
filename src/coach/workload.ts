import type {TodayItem} from './course';

// Minutes-based workload check. Pure and deterministic.
// The app records no actual task durations yet, so every estimate here is a fixed default per kind.
// The result says so (basis: 'default') and the UI shows the "not enough data to personalize" message.

export type WorkloadLevel = 'ok' | 'tight' | 'over';

export type WorkloadStatus = {
  plannedMinutes: number;
  freeMinutes: number;
  level: WorkloadLevel;
  exceedsCapacity: boolean;
  basis: 'default';
};

/** Default minutes for one open item. Replaced by history-based estimates in a later phase. */
export function defaultMinutes(item: Pick<TodayItem, 'source' | 'period'>): number {
  if (item.source === 'habit') return 10;
  if (item.source === 'course') return item.period === 'daily' ? 30 : 20;
  if (item.period === 'daily') return 15;
  if (item.period === 'weekly') return 30;
  return 45;
}

/** Share of free time above which the day counts as tight. */
export const TIGHT_SHARE = 0.8;

export function analyzeWorkload({
  items,
  freeMinutes,
  openCount,
  capacity,
}: {
  items: Array<Pick<TodayItem, 'source' | 'period'>>;
  freeMinutes: number;
  openCount: number;
  capacity: number;
}): WorkloadStatus {
  const plannedMinutes = items.reduce((sum, item) => sum + defaultMinutes(item), 0);
  const free = Math.max(0, Math.round(freeMinutes));
  let level: WorkloadLevel = 'ok';
  if (plannedMinutes > 0) {
    if (plannedMinutes > free) level = 'over';
    else if (plannedMinutes > free * TIGHT_SHARE) level = 'tight';
  }
  return {
    plannedMinutes,
    freeMinutes: free,
    level,
    exceedsCapacity: openCount > capacity,
    basis: 'default',
  };
}
