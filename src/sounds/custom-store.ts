// مخزن محلي (IndexedDB) للأصوات الخارجية (أذان / تنبيه) التي يختارها المستخدم.
// يُستخدم في نسخة local-only (بدون سحابة) لحفظ ملفات صوتية من جهاز المستخدم.
const DB_NAME = 'rabbani-sounds';
const DB_VERSION = 1;
const STORE = 'sounds';

export type SoundSlot = 'adhan' | 'alarm' | `adhan:item:${string}`;

export interface StoredCustomSound {
  slot: SoundSlot;
  name: string;
  type: string;
  data: ArrayBuffer;
  updatedAt?: string;
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

export async function saveCustomSound(slot: SoundSlot, file: File): Promise<void> {
  const db = await openDb();
  const buf = await file.arrayBuffer();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({slot, name: file.name, type: file.type, data: buf, updatedAt: new Date().toISOString()});
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadCustomSound(slot: SoundSlot): Promise<{name: string; type: string; data: ArrayBuffer} | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<StoredCustomSound | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve(req.result as StoredCustomSound | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!rec) return null;
    return {name: rec.name, type: rec.type, data: rec.data};
  } catch {
    return null;
  }
}

export async function listCustomAdhans(): Promise<StoredCustomSound[]> {
  try {
    const db = await openDb();
    const all = await new Promise<StoredCustomSound[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as StoredCustomSound[]);
      req.onerror = () => reject(req.error);
    });
    return all
      .filter(item => item.slot === 'adhan' || String(item.slot).startsWith('adhan:item:'))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  } catch {
    return [];
  }
}

export async function saveCustomAdhanEntry(file: File): Promise<SoundSlot> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slot: SoundSlot = `adhan:item:${id}`;
  await saveCustomSound(slot, file);
  return slot;
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
  } catch { /* ignore */ }
}

export function customSoundUrl(rec: {type: string; data: ArrayBuffer}): string {
  const blob = new Blob([rec.data], {type: rec.type || 'audio/mpeg'});
  return URL.createObjectURL(blob);
}
