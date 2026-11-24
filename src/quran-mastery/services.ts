import {fetchAyahAudioUrl} from '../quran/ayah-audio';
import type {QuranAsset, QuranVerse} from '../quran/types';
import type {VerseRange} from './types';
/** Shared canonical selection. Returns source objects, never reconstructs Quran text. */
export function selectRange(asset: QuranAsset, range: VerseRange): QuranVerse[] {
  if (!Number.isInteger(range.surah) || !Number.isInteger(range.ayahStart) || !Number.isInteger(range.ayahEnd)) return [];
  const verses = asset.verses.filter(v=>v.s===range.surah && v.a>=range.ayahStart && v.a<=range.ayahEnd);
  return verses.length === range.ayahEnd-range.ayahStart+1 ? verses : [];
}
export {fetchAyahAudioUrl as resolveSessionAudio};
/** Session audio only uses the existing Hafs-compatible Quran.com adapter. */
export const SESSION_RECITERS = [{id:7,name:'مشاري راشد العفاسي'},{id:6,name:'محمود خليل الحصري'},{id:9,name:'محمد صديق المنشاوي (مرتل)'}];
