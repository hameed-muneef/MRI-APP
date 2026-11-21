import type { TravelMode } from '../../lib/geo';

export interface Mosque {
  id: string;
  name: string;
  lat: number;
  lng: number;
  locationText?: string;
}

export interface NearbyMosque extends Mosque {
  distanceMeters: number;
}

/** Compact tuple stored in public/data/<cc>.json: [id, name, lat, lon, locationText?] */
export type MosqueTuple =
  | readonly [id: string, name: string, lat: number, lon: number]
  | readonly [id: string, name: string, lat: number, lon: number, loc: string];

export interface CountryMeta {
  code: string;
  nameAr: string;
  count: number;
  file: string;
  rawBytes: number;
  gzipBytes: number;
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: readonly [number, number, number, number];
  /** [centerLat, centerLon] */
  center: readonly [number, number];
}

export interface MosqueMeta {
  version: number;
  dataDate: string;
  attribution: string;
  totalCount: number;
  fields: string[];
  countries: Record<string, CountryMeta>;
}

export interface FindNearbyResult {
  mosques: NearbyMosque[];
  countryCode: string;
  countryNameAr: string;
  outsideCoveredRegion: boolean;
  /** True when search widened beyond requested radius because too few results were inside radius. */
  widenedBeyondRadius: boolean;
  parseMs: number;
  searchMs: number;
}

export type { TravelMode };
