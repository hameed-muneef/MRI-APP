import { buildGridIndex, rankCountriesByCoordinates, searchGridIndex, type GridIndex } from './grid-index';
import type { WorkerRequest, WorkerResponse } from './mosques.worker';
import type { FindNearbyResult, MosqueMeta, MosqueTuple } from './types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type WorkerRequestPayload = DistributiveOmit<WorkerRequest, 'id'>;

export interface MosqueProvider {
  getMeta(): Promise<MosqueMeta>;
  findNearby(
    lat: number,
    lng: number,
    radiusMeters: number,
    limit: number,
    countryOverride?: string,
  ): Promise<FindNearbyResult>;
  dispose(): void;
}

export class LocalFileProvider implements MosqueProvider {
  private readonly basePath: string;
  private metaPromise: Promise<MosqueMeta> | null = null;
  private worker: Worker | null = null;
  private nextReqId = 1;
  private pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

  // Main-thread fallback cache (used only if Worker API is unavailable, e.g. Node/Vitest)
  private fallbackCountry: string | null = null;
  private fallbackIndex: GridIndex | null = null;

  constructor(basePath = '/data') {
    this.basePath = basePath.replace(/\/$/, '');
  }

  async getMeta(): Promise<MosqueMeta> {
    if (!this.metaPromise) {
      this.metaPromise = fetch(`${this.basePath}/meta.json`).then(async (res) => {
        if (!res.ok) throw new Error(`فشل تحميل بيانات المساجد (${res.status})`);
        return (await res.json()) as MosqueMeta;
      }).catch((err: unknown) => {
        this.metaPromise = null;
        throw err;
      });
    }
    return this.metaPromise;
  }

  private getWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./mosques.worker.ts', import.meta.url), { type: 'module' });
        this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
          const entry = this.pending.get(event.data.id);
          if (!entry) return;
          this.pending.delete(event.data.id);
          entry.resolve(event.data);
        });
        this.worker.addEventListener('error', () => {
          for (const entry of this.pending.values()) {
            entry.reject(new Error('تعذر تشغيل معالج البحث المحلي'));
          }
          this.pending.clear();
          this.worker?.terminate();
          this.worker = null;
        });
      } catch {
        this.worker = null;
      }
    }
    return this.worker;
  }

  private runInWorker(req: WorkerRequestPayload): Promise<WorkerResponse> {
    const worker = this.getWorker();
    if (!worker) {
      return Promise.reject(new Error('worker-unavailable'));
    }
    const id = this.nextReqId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  private async runOnMainThread(
    countryCode: string,
    fileUrl: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    limit: number,
  ): Promise<{ mosques: FindNearbyResult['mosques']; widenedBeyondRadius: boolean; parseMs: number; searchMs: number }> {
    let parseMs = 0;
    if (this.fallbackCountry !== countryCode || !this.fallbackIndex) {
      this.fallbackIndex = null;
      this.fallbackCountry = null;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const t0 = performance.now();
      const tuples = JSON.parse(text) as MosqueTuple[];
      this.fallbackIndex = buildGridIndex(tuples);
      this.fallbackCountry = countryCode;
      parseMs = Math.round((performance.now() - t0) * 10) / 10;
    }

    const t1 = performance.now();
    const { items, widenedBeyondRadius } = searchGridIndex(this.fallbackIndex, lat, lng, radiusMeters, limit);
    const searchMs = Math.round((performance.now() - t1) * 10) / 10;
    return { mosques: items, widenedBeyondRadius, parseMs, searchMs };
  }

  private async queryCountry(
    countryCode: string,
    countryNameAr: string,
    fileUrl: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    limit: number,
  ): Promise<FindNearbyResult> {
    try {
      const reply = await this.runInWorker({
        type: 'findNearby',
        countryCode,
        fileUrl,
        lat,
        lng,
        radiusMeters,
        limit,
      });
      if (!reply.ok) {
        throw new Error(reply.error);
      }
      return {
        mosques: reply.mosques,
        countryCode,
        countryNameAr,
        outsideCoveredRegion: false,
        widenedBeyondRadius: reply.widenedBeyondRadius,
        parseMs: reply.parseMs,
        searchMs: reply.searchMs,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'worker-unavailable') {
        const res = await this.runOnMainThread(countryCode, fileUrl, lat, lng, radiusMeters, limit);
        return {
          ...res,
          countryCode,
          countryNameAr,
          outsideCoveredRegion: false,
        };
      }
      throw err;
    }
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number,
    limit: number,
    countryOverride?: string,
  ): Promise<FindNearbyResult> {
    const meta = await this.getMeta();
    const candidates = countryOverride
      ? (() => {
          const explicit = meta.countries[countryOverride.toUpperCase()];
          return explicit ? [{ country: explicit, edgeDistMeters: 0, centerDistMeters: 0 }] : [];
        })()
      : rankCountriesByCoordinates(meta, lat, lng);

    if (!candidates.length) {
      return {
        mosques: [],
        countryCode: '',
        countryNameAr: '',
        outsideCoveredRegion: true,
        widenedBeyondRadius: false,
        parseMs: 0,
        searchMs: 0,
      };
    }

    const primary = candidates[0].country;
    const primaryResult = await this.queryCountry(
      primary.code,
      primary.nameAr,
      `${this.basePath}/${primary.file}`,
      lat,
      lng,
      radiusMeters,
      limit,
    );

    if (primaryResult.mosques.length > 0 || countryOverride) {
      return primaryResult;
    }

    // If coordinates fall in an overlapping bounding box or border zone, check adjacent candidate(s).
    const borderMarginMeters = Math.max(radiusMeters, 15_000);
    for (const candidate of candidates.slice(1, 3)) {
      if (candidate.edgeDistMeters > borderMarginMeters) break;
      const alt = candidate.country;
      const altResult = await this.queryCountry(
        alt.code,
        alt.nameAr,
        `${this.basePath}/${alt.file}`,
        lat,
        lng,
        radiusMeters,
        limit,
      );
      if (altResult.mosques.length > 0) {
        return altResult;
      }
    }

    return primaryResult;
  }

  dispose(): void {
    for (const entry of this.pending.values()) {
      entry.reject(new Error('disposed'));
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.fallbackIndex = null;
    this.fallbackCountry = null;
  }
}
