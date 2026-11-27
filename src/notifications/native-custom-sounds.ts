import {listAllCustomSounds, type StoredCustomSound} from '../sounds/custom-store';
import {pruneNativeCustomSounds, saveNativeCustomSound} from '../lib/settings-opener';

/** True for a sound id that points at a file the user imported (it lives in the web layer, not in the app's raw resources). */
export function isImportedSoundId(id: string | undefined): boolean {
  if (!id) return false;
  return id === 'custom:alarm' || id === 'adhan' || /^(adhan|library):item:/.test(id);
}

const EXT_BY_MIME: Array<[RegExp, string]> = [
  [/ogg|opus/i, 'ogg'], [/wav/i, 'wav'], [/mp4|m4a/i, 'm4a'], [/aac/i, 'aac'], [/webm/i, 'webm'], [/flac/i, 'flac'], [/mpeg|mp3/i, 'mp3'],
];
const ALLOWED_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm']);

/** Pure. File extension the phone side accepts, from the original name first, then the MIME type; mp3 when unknown. */
export function nativeSoundExt(name: string, mime: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  const fromName = m ? m[1].toLowerCase() : '';
  if (fromName === 'oga' || fromName === 'opus') return 'ogg';
  if (ALLOWED_EXT.has(fromName)) return fromName;
  for (const [re, ext] of EXT_BY_MIME) if (re.test(mime || '')) return ext;
  return 'mp3';
}

/** Pure. A stable file key for a stored sound: letters and digits only, derived from its slot (so the same import keeps the same file). */
export function nativeSoundKey(slot: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slot.length; i += 1) {
    h ^= slot.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `c${h.toString(16).padStart(8, '0')}`;
}

/** Pure. The sound id an imported record answers to in the reminder pickers. */
export function soundIdOfSlot(slot: string): string {
  return slot === 'alarm' ? 'custom:alarm' : slot;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && Boolean(cap.isNativePlatform());
}

const sent = new Map<string, string>(); // key -> "size:updatedAt" already on the phone this session

/** For tests: forget what was already copied. */
export function resetNativeSoundCache(): void { sent.clear(); }

/**
 * Copies the imported files behind `soundIds` to the phone (once per change) and returns soundId -> "<key>.<ext>" for the
 * ones that arrived. Ids whose file could not be copied are left out, so their rows fall back to the normal sound.
 * Never throws. Does nothing outside the native app.
 */
export async function syncNativeCustomSounds(soundIds: Iterable<string | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = new Set([...soundIds].filter((id): id is string => isImportedSoundId(id)));
  if (!isNativePlatform() || wanted.size === 0) return out;
  let records: StoredCustomSound[] = [];
  try { records = await listAllCustomSounds(); } catch { return out; }
  const keep: string[] = [];
  for (const rec of records) {
    const key = nativeSoundKey(String(rec.slot));
    keep.push(key);
    const id = soundIdOfSlot(String(rec.slot));
    if (!wanted.has(id)) continue;
    const ext = nativeSoundExt(rec.name, rec.type);
    const stamp = `${rec.data.byteLength}:${rec.updatedAt ?? ''}:${ext}`;
    if (sent.get(key) !== stamp) {
      const ok = await saveNativeCustomSound(key, toBase64(rec.data), ext);
      if (!ok) continue;
      sent.set(key, stamp);
    }
    out.set(id, `${key}.${ext}`);
  }
  void pruneNativeCustomSounds(keep);
  return out;
}
