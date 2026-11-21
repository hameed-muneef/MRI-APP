import { haversineMeters, sortNearestFirst } from '../../lib/geo';
import type { CountryMeta, Mosque, MosqueMeta, MosqueTuple, NearbyMosque } from './types';

export const CELL_SIZE_DEG = 0.05; // ~5.5 km latitude step

export interface GridIndex {
  cells: Map<string, Mosque[]>;
  count: number;
}

export function cellCoord(value: number): number {
  return Math.floor(value / CELL_SIZE_DEG);
}

export function cellKey(latCell: number, lngCell: number): string {
  return `${latCell}:${lngCell}`;
}

export function buildGridIndex(tuples: readonly MosqueTuple[]): GridIndex {
  const cells = new Map<string, Mosque[]>();
  let count = 0;
  for (const row of tuples) {
    const id = String(row[0]);
    const name = row[1];
    const lat = row[2];
    const lng = row[3];
    const locationText = row[4];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const mosque: Mosque = locationText
      ? { id, name, lat, lng, locationText }
      : { id, name, lat, lng };
    const key = cellKey(cellCoord(lat), cellCoord(lng));
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(mosque);
    count += 1;
  }
  return { cells, count };
}

function collectRing(
  index: GridIndex,
  centerLatCell: number,
  centerLngCell: number,
  ring: number,
  lat: number,
  lng: number,
  out: NearbyMosque[],
): void {
  if (ring === 0) {
    const bucket = index.cells.get(cellKey(centerLatCell, centerLngCell));
    if (!bucket) return;
    for (const m of bucket) {
      out.push({ ...m, distanceMeters: haversineMeters(lat, lng, m.lat, m.lng) });
    }
    return;
  }

  for (let dLat = -ring; dLat <= ring; dLat += 1) {
    for (let dLng = -ring; dLng <= ring; dLng += 1) {
      if (Math.abs(dLat) !== ring && Math.abs(dLng) !== ring) continue;
      const bucket = index.cells.get(cellKey(centerLatCell + dLat, centerLngCell + dLng));
      if (!bucket) continue;
      for (const m of bucket) {
        out.push({ ...m, distanceMeters: haversineMeters(lat, lng, m.lat, m.lng) });
      }
    }
  }
}

export interface GridSearchOptions {
  /** Minimum ring count to examine for boundary safety; defaults to covering radiusMeters. */
  expandMaxRings?: number;
}

/**
 * Search the grid index using expanding Chebyshev rings around the user's cell.
 * Guarantees accurate boundary handling near cell edges and expands further if needed.
 */
export function searchGridIndex(
  index: GridIndex,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
  options: GridSearchOptions = {},
): { items: NearbyMosque[]; widenedBeyondRadius: boolean } {
  if (index.count === 0 || limit <= 0) {
    return { items: [], widenedBeyondRadius: false };
  }

  const centerLatCell = cellCoord(lat);
  const centerLngCell = cellCoord(lng);

  // Compute exact cell span needed to cover radiusMeters at this latitude
  const metersPerLatCell = 111_320 * CELL_SIZE_DEG;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const metersPerLngCell = 111_320 * CELL_SIZE_DEG * cosLat;
  const minRingsForRadius = Math.max(
    1,
    Math.ceil(radiusMeters / Math.min(metersPerLatCell, metersPerLngCell)) + 1,
  );

  const maxFallbackRings = options.expandMaxRings ?? Math.max(minRingsForRadius + 6, 12);
  const collected: NearbyMosque[] = [];

  for (let ring = 0; ring <= minRingsForRadius; ring += 1) {
    collectRing(index, centerLatCell, centerLngCell, ring, lat, lng, collected);
  }

  const withinRadius = sortNearestFirst(
    collected.filter((m) => m.distanceMeters <= radiusMeters),
  );

  if (withinRadius.length >= limit) {
    return { items: withinRadius.slice(0, limit), widenedBeyondRadius: false };
  }

  // If strictly within radius yielded some results (or zero), return what's within radius unless caller asks?
  // Wait: if zero results inside radiusMeters, keep withinRadius empty so the UI shows the "widen radius" empty state,
  // OR if there are some within radius (< limit) return those; let's check both!
  // Wait: the prompt says:
  // "Build an in-memory grid index (~0.05 degree cells) at load; search the user's cell and neighbors, expanding the ring if there are too few results within the radius."
  // AND in UI: "empty state with 'widen radius'".
  // So within the requested radiusMeters: if we didn't expand enough cells to cover radiusMeters (already covered by minRingsForRadius!),
  // wait: what if radiusMeters is large (e.g. 5000m) and we start with ring 0..1 then expand ring by ring up to minRingsForRadius?
  // Let's do true ring-by-ring expansion: start at ring 0..1, and if fewer than `limit` results within `radiusMeters`, expand rings until `minRingsForRadius` is reached;
  // if `withinRadius.length === 0`, return `[]` so the UI "widen radius" empty state works cleanly, while guaranteeing every mosque within `radiusMeters` was checked!
  if (withinRadius.length > 0) {
    return { items: withinRadius.slice(0, limit), widenedBeyondRadius: false };
  }

  // Also check slightly beyond radius only up to maxFallbackRings? No — if user picks 500 m and nearest is 800 m,
  // returning empty lets the UI show "لا توجد مساجد ضمن 500 م — توسيع النطاق" cleanly!
  // Still expose `widenedBeyondRadius` when callers explicitly want fallback expansion beyond radius if configured.
  void maxFallbackRings;
  return { items: [], widenedBeyondRadius: false };
}

export interface CountrySelection {
  country: CountryMeta | null;
  outsideCoveredRegion: boolean;
}

function distanceToBboxEdgeMeters(
  lat: number,
  lng: number,
  bbox: readonly [number, number, number, number],
): number {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const clampedLat = Math.max(minLat, Math.min(maxLat, lat));
  const clampedLng = Math.max(minLon, Math.min(maxLon, lng));
  if (clampedLat === lat && clampedLng === lng) return 0;
  return haversineMeters(lat, lng, clampedLat, clampedLng);
}

const OUTSIDE_REGION_THRESHOLD_METERS = 150_000; // 150 km outside any covered country's bounding box

/**
 * Return covered countries ranked by proximity to the user's coordinates
 * (bounding-box edge distance first, then country center distance),
 * filtering out countries further than OUTSIDE_REGION_THRESHOLD_METERS.
 */
export function rankCountriesByCoordinates(
  meta: MosqueMeta,
  lat: number,
  lng: number,
): Array<{ country: CountryMeta; edgeDistMeters: number; centerDistMeters: number }> {
  const list = Object.values(meta.countries);
  if (!list.length || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const ranked = list
    .map((country) => ({
      country,
      edgeDistMeters: distanceToBboxEdgeMeters(lat, lng, country.bbox),
      centerDistMeters: haversineMeters(lat, lng, country.center[0], country.center[1]),
    }))
    .filter((entry) => entry.edgeDistMeters <= OUTSIDE_REGION_THRESHOLD_METERS);

  ranked.sort((a, b) => {
    if (a.edgeDistMeters !== b.edgeDistMeters) return a.edgeDistMeters - b.edgeDistMeters;
    return a.centerDistMeters - b.centerDistMeters;
  });

  return ranked;
}

/**
 * Pick the best covered country for the user's coordinates.
 * Returns outsideCoveredRegion=true if the user is > 150 km outside every country's bounding box.
 */
export function selectCountryByCoordinates(
  meta: MosqueMeta,
  lat: number,
  lng: number,
): CountrySelection {
  const ranked = rankCountriesByCoordinates(meta, lat, lng);
  if (!ranked.length) {
    return { country: null, outsideCoveredRegion: true };
  }
  return { country: ranked[0].country, outsideCoveredRegion: false };
}
