import { buildGridIndex, searchGridIndex, type GridIndex } from './grid-index';
import type { MosqueTuple, NearbyMosque } from './types';

export type WorkerRequest =
  | {
      id: number;
      type: 'findNearby';
      countryCode: string;
      fileUrl: string;
      lat: number;
      lng: number;
      radiusMeters: number;
      limit: number;
    }
  | {
      id: number;
      type: 'dispose';
    };

export type WorkerResponse =
  | {
      id: number;
      ok: true;
      mosques: NearbyMosque[];
      widenedBeyondRadius: boolean;
      parseMs: number;
      searchMs: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

let loadedCountryCode: string | null = null;
let loadedIndex: GridIndex | null = null;

async function ensureCountryIndex(countryCode: string, fileUrl: string): Promise<{ index: GridIndex; parseMs: number }> {
  if (loadedCountryCode === countryCode && loadedIndex) {
    return { index: loadedIndex, parseMs: 0 };
  }
  // Release previous country before loading a new one to keep memory footprint bounded.
  loadedIndex = null;
  loadedCountryCode = null;

  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  const t0 = performance.now();
  const tuples = JSON.parse(text) as MosqueTuple[];
  const index = buildGridIndex(tuples);
  const parseMs = Math.round((performance.now() - t0) * 10) / 10;

  loadedCountryCode = countryCode;
  loadedIndex = index;
  return { index, parseMs };
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'dispose') {
    loadedIndex = null;
    loadedCountryCode = null;
    const reply: WorkerResponse = {
      id: msg.id,
      ok: true,
      mosques: [],
      widenedBeyondRadius: false,
      parseMs: 0,
      searchMs: 0,
    };
    self.postMessage(reply);
    return;
  }

  try {
    const { index, parseMs } = await ensureCountryIndex(msg.countryCode, msg.fileUrl);
    const tSearch = performance.now();
    const { items, widenedBeyondRadius } = searchGridIndex(
      index,
      msg.lat,
      msg.lng,
      msg.radiusMeters,
      msg.limit,
    );
    const searchMs = Math.round((performance.now() - tSearch) * 10) / 10;

    const reply: WorkerResponse = {
      id: msg.id,
      ok: true,
      mosques: items,
      widenedBeyondRadius,
      parseMs,
      searchMs,
    };
    self.postMessage(reply);
  } catch (err) {
    const reply: WorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Worker failure',
    };
    self.postMessage(reply);
  }
});
