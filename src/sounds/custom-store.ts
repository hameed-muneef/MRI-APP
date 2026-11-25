// مخزن محلي (IndexedDB) للأصوات الخارجية (أذان / تكبيرات / نغمات عامة) التي يختارها المستخدم.
// يُستخدم لحفظ ملفات صوتية من جهاز المستخدم وتصنيفها وإدارتها عبر جلسات التطبيق.
const DB_NAME = 'rabbani-sounds';
const DB_VERSION = 1;
const STORE = 'sounds';

export type CustomSoundCategory = 'adhan' | 'takbeer' | 'general';

export type SoundSlot = 'adhan' | 'alarm' | `adhan:item:${string}` | `library:item:${string}`;

export interface StoredCustomSound {
  slot: SoundSlot;
  name: string;
  type: string;
  data: ArrayBuffer;
  category?: CustomSoundCategory;
  updatedAt?: string;
}

export const CUSTOM_SOUNDS_CHANGED_EVENT = 'rabbani:custom-sounds-changed';

function notifyCustomSoundsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CUSTOM_SOUNDS_CHANGED_EVENT));
  }
}

const SUPPORTED_AUDIO_MIME_RE = /^(?:audio\/|application\/ogg$)/i;
const SUPPORTED_AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|oga|opus|m4a|aac|webm|flac|3gp|amr)$/i;

export function isSupportedAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = (file.type || '').trim();
  if (mime && SUPPORTED_AUDIO_MIME_RE.test(mime)) return true;
  return SUPPORTED_AUDIO_EXT_RE.test(file.name || '');
}

function inferMimeFromName(name: string, rawType: string): string {
  const trimmed = (rawType || '').trim();
  if (trimmed) return trimmed;
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.ogg') || lower.endsWith('.oga') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.flac')) return 'audio/flac';
  return 'audio/mpeg';
}

export function resolveSoundCategory(rec: Pick<StoredCustomSound, 'slot' | 'category'>): CustomSoundCategory {
  if (rec.category === 'adhan' || rec.category === 'takbeer' || rec.category === 'general') {
    return rec.category;
  }
  const slot = String(rec.slot);
  if (slot === 'adhan' || slot.startsWith('adhan:item:')) return 'adhan';
  return 'general';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('التخزين المحلي غير متاح.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath: 'slot'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('تعذر فتح التخزين.'));
  }).catch(err => { dbPromise = null; throw err; });
  dbPromise = pending;
  return pending;
}

export async function saveCustomSound(slot: SoundSlot, file: File, category?: CustomSoundCategory): Promise<void> {
  const buf = await file.arrayBuffer();
  if (!buf || buf.byteLength === 0) {
    throw new Error('الملف الصوتي فارغ أو تعذرت قراءته.');
  }
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const resolvedCategory = category ?? resolveSoundCategory({slot});
  tx.objectStore(STORE).put({
    slot,
    name: file.name,
    type: inferMimeFromName(file.name, file.type),
    data: buf,
    category: resolvedCategory,
    updatedAt: new Date().toISOString(),
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ الملف الصوتي.'));
    tx.onabort = () => reject(tx.error ?? new Error('تعذر إتمام حفظ الملف الصوتي.'));
  });
  notifyCustomSoundsChanged();
}

export async function loadCustomSound(slot: SoundSlot): Promise<{name: string; type: string; data: ArrayBuffer; category?: CustomSoundCategory} | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<StoredCustomSound | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve(req.result as StoredCustomSound | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!rec) return null;
    return {name: rec.name, type: rec.type, data: rec.data, category: resolveSoundCategory(rec)};
  } catch {
    return null;
  }
}

export async function listAllCustomSounds(): Promise<StoredCustomSound[]> {
  try {
    const db = await openDb();
    const all = await new Promise<StoredCustomSound[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as StoredCustomSound[]);
      req.onerror = () => reject(req.error);
    });
    return all
      .map(item => ({...item, category: resolveSoundCategory(item)}))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  } catch {
    return [];
  }
}

export async function listCustomAdhans(): Promise<StoredCustomSound[]> {
  const all = await listAllCustomSounds();
  return all.filter(item => {
    const slot = String(item.slot);
    if (slot === 'adhan' || slot.startsWith('adhan:item:')) return true;
    return slot.startsWith('library:item:') && resolveSoundCategory(item) === 'adhan';
  });
}

export async function saveCustomAdhanEntry(file: File): Promise<SoundSlot> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slot: SoundSlot = `adhan:item:${id}`;
  await saveCustomSound(slot, file, 'adhan');
  return slot;
}

export async function saveCustomLibrarySound(file: File, category: CustomSoundCategory): Promise<StoredCustomSound> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slot: SoundSlot = `library:item:${id}`;
  await saveCustomSound(slot, file, category);
  const saved = await loadCustomSound(slot);
  if (!saved) {
    throw new Error('تعذر استرجاع الملف الصوتي بعد الحفظ.');
  }
  return {
    slot,
    name: saved.name,
    type: saved.type,
    data: saved.data,
    category,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateCustomSoundCategory(slot: SoundSlot, category: CustomSoundCategory): Promise<void> {
  const db = await openDb();
  const existing = await new Promise<StoredCustomSound | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(slot);
    req.onsuccess = () => resolve(req.result as StoredCustomSound | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!existing) return;
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({...existing, category, updatedAt: new Date().toISOString()});
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('تعذر تحديث تصنيف الصوت.'));
    tx.onabort = () => reject(tx.error ?? new Error('تعذر إتمام تحديث التصنيف.'));
  });
  notifyCustomSoundsChanged();
}

export async function deleteCustomSound(slot: SoundSlot): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notifyCustomSoundsChanged();
  } catch { /* ignore */ }
}

export function customSoundUrl(rec: {type: string; data: ArrayBuffer}): string {
  const blob = new Blob([rec.data], {type: rec.type || 'audio/mpeg'});
  return URL.createObjectURL(blob);
}
