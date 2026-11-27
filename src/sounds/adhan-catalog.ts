// src/sounds/adhan-catalog.ts
// Authoritative local catalog of bundled Adhan MP3 recordings from Azan/.
// Eid Takbeerat is kept explicitly separate so it is never used as an ordinary prayer Adhan.

export interface AdhanCatalogEntry {
  id: string;
  soundId: string;
  name: string;
  rawName: string;
  fileName: string;
  url: string;
  isEidTakbeer: boolean;
}

export const ADHAN_SELECTION_STORAGE_KEY = 'rabbani-adhan-id';
export const DEFAULT_ADHAN_ID = 'almulla';

export const BUNDLED_ADHAN_SOUNDS: readonly AdhanCatalogEntry[] = [
  {
    id: 'almulla',
    soundId: 'adhan:almulla',
    name: 'الملا',
    rawName: 'adhan_almulla',
    fileName: 'adhan_almulla.ogg',
    url: '/sounds/adhan/adhan_almulla.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'ahmad',
    soundId: 'adhan:ahmad',
    name: 'أحمد العمادي',
    rawName: 'adhan_ahmad',
    fileName: 'adhan_ahmad.ogg',
    url: '/sounds/adhan/adhan_ahmad.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'madinah',
    soundId: 'adhan:madinah',
    name: 'أذان الحرم المدني',
    rawName: 'adhan_madinah',
    fileName: 'adhan_madinah.ogg',
    url: '/sounds/adhan/adhan_madinah.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'madinah2',
    soundId: 'adhan:madinah2',
    name: 'أذان الحرم المدني 2',
    rawName: 'adhan_madinah2',
    fileName: 'adhan_madinah2.ogg',
    url: '/sounds/adhan/adhan_madinah2.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'mohammed',
    soundId: 'adhan:mohammed',
    name: 'أذان محمد رمضان (الحرم)',
    rawName: 'adhan_mohammed',
    fileName: 'adhan_mohammed.ogg',
    url: '/sounds/adhan/adhan_mohammed.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'hamad',
    soundId: 'adhan:hamad',
    name: 'حمد الدغريري',
    rawName: 'adhan_hamad',
    fileName: 'adhan_hamad.ogg',
    url: '/sounds/adhan/adhan_hamad.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'alafasy',
    soundId: 'adhan:alafasy',
    name: 'مشاري راشد العفاسي',
    rawName: 'adhan_alafasy',
    fileName: 'adhan_alafasy.ogg',
    url: '/sounds/adhan/adhan_alafasy.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'qatami',
    soundId: 'adhan:qatami',
    name: 'ناصر القطامي',
    rawName: 'adhan_qatami',
    fileName: 'adhan_qatami.ogg',
    url: '/sounds/adhan/adhan_qatami.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'hamathani',
    soundId: 'adhan:hamathani',
    name: 'ماجد الهمثاني',
    rawName: 'adhan_hamathani',
    fileName: 'adhan_hamathani.ogg',
    url: '/sounds/adhan/adhan_hamathani.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'hadrawi',
    soundId: 'adhan:hadrawi',
    name: 'فاروق حضراوي (الحرم المكي)',
    rawName: 'adhan_hadrawi',
    fileName: 'adhan_hadrawi.ogg',
    url: '/sounds/adhan/adhan_hadrawi.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'zubaidi',
    soundId: 'adhan:zubaidi',
    name: 'حسان زبيدي (الحرم المكي)',
    rawName: 'adhan_zubaidi',
    fileName: 'adhan_zubaidi.ogg',
    url: '/sounds/adhan/adhan_zubaidi.ogg',
    isEidTakbeer: false,
  },
  {
    id: 'aqsa',
    soundId: 'adhan:aqsa',
    name: 'أذان المسجد الأقصى',
    rawName: 'adhan_aqsa',
    fileName: 'adhan_aqsa.ogg',
    url: '/sounds/adhan/adhan_aqsa.ogg',
    isEidTakbeer: false,
  },
];

export const EID_TAKBEERAT_SOUND: AdhanCatalogEntry = {
  id: 'eid',
  soundId: 'takbeer:eid',
  name: 'تكبيرات العيد',
  rawName: 'takbeerat_eid',
  fileName: 'takbeerat_eid.ogg',
  url: '/sounds/adhan/takbeerat_eid.ogg',
  isEidTakbeer: true,
};

/**
 * Resolves only ordinary prayer Adhan recordings (explicitly excludes Eid Takbeerat).
 */
export function findOrdinaryAdhan(idOrSoundId?: string): AdhanCatalogEntry | undefined {
  if (!idOrSoundId) return undefined;
  const trimmed = idOrSoundId.trim();
  if (!trimmed || trimmed === 'eid' || trimmed === 'takbeer:eid' || trimmed === 'takbeerat_eid') {
    return undefined;
  }
  const normalized = trimmed.startsWith('adhan:') ? trimmed.slice('adhan:'.length) : trimmed;
  return BUNDLED_ADHAN_SOUNDS.find(
    (entry) => entry.id === normalized || entry.soundId === trimmed || entry.rawName === normalized,
  );
}

export function getSelectedDefaultAdhanId(): string {
  try {
    if (typeof window === 'undefined') return DEFAULT_ADHAN_ID;
    const saved = window.localStorage.getItem(ADHAN_SELECTION_STORAGE_KEY);
    const match = findOrdinaryAdhan(saved ?? undefined);
    return match ? match.id : DEFAULT_ADHAN_ID;
  } catch {
    return DEFAULT_ADHAN_ID;
  }
}

export function resolvePrayerAdhan(prayerSoundId?: string, selectedDefaultId?: string): AdhanCatalogEntry {
  return (
    findOrdinaryAdhan(prayerSoundId) ??
    findOrdinaryAdhan(selectedDefaultId ?? getSelectedDefaultAdhanId()) ??
    BUNDLED_ADHAN_SOUNDS[0]
  );
}
