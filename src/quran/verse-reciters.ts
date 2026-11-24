// قراء الاستماع على مستوى الآية (للحفظ والمراجعة). كلهم برواية حفص عن عاصم، مطابقة لنص المصحف المعروض.
// المصادر: Quran.com (معرّف التلاوة) وEveryAyah.com (مجلد ثابت لكل آية). لا نضيف قارئًا لم يُتحقق
// من وجود ملف آيته الأولى ومنتصف المصحف وآخره. قراء مكتبة MP3Quran الآخرون يعملون على مستوى السورة فقط
// ولا يظهرون هنا لأن لا حدود آيات لهم، فلا نزعم تشغيلهم آية بآية.
import {everyAyahUrl, fetchAyahAudioUrl} from './ayah-audio';

export type VerseReciter = {id: number; name: string; style?: string; riwaya: 'حفص عن عاصم'; source: 'qurancom' | 'everyayah'; recitationId?: number; folder?: string};
const H = 'حفص عن عاصم' as const;
const qc = (id: number, name: string, style?: string): VerseReciter => ({id, name, style, riwaya: H, source: 'qurancom', recitationId: id});
const ea = (id: number, name: string, folder: string, style?: string): VerseReciter => ({id, name, style, riwaya: H, source: 'everyayah', folder});

export const VERSE_RECITERS: VerseReciter[] = [
  qc(7, 'مشاري راشد العفاسي'),
  qc(6, 'محمود خليل الحصري', 'مرتل'),
  qc(9, 'محمد صديق المنشاوي', 'مرتل'),
  qc(3, 'عبدالرحمن السديس'),
  qc(10, 'سعود الشريم'),
  qc(4, 'أبو بكر الشاطري'),
  qc(5, 'هاني الرفاعي'),
  qc(11, 'محمد الطبلاوي'),
  qc(2, 'عبد الباسط عبد الصمد', 'مرتل'),
  qc(1, 'عبد الباسط عبد الصمد', 'مجود'),
  qc(8, 'محمد صديق المنشاوي', 'مجود'),
  qc(12, 'محمود خليل الحصري', 'معلم'),
  ea(121, 'محمود خليل الحصري', 'Husary_128kbps_Mujawwad', 'مجود'),
  ea(101, 'ماهر المعيقلي', 'MaherAlMuaiqly128kbps'),
  ea(102, 'صلاح البدير', 'Salah_Al_Budair_128kbps'),
  ea(103, 'سعد الغامدي', 'Ghamadi_40kbps'),
  ea(104, 'علي الحذيفي', 'Hudhaify_128kbps'),
  ea(105, 'ياسر الدوسري', 'Yasser_Ad-Dussary_128kbps'),
  ea(106, 'ناصر القطامي', 'Nasser_Alqatami_128kbps'),
  ea(107, 'فارس عباد', 'Fares_Abbad_64kbps'),
  ea(108, 'علي جابر', 'Ali_Jaber_64kbps'),
  ea(109, 'أحمد العجمي', 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net'),
  ea(110, 'عبدالله بصفر', 'Abdullah_Basfar_192kbps'),
  ea(111, 'محمد أيوب', 'Muhammad_Ayyoub_128kbps'),
  ea(112, 'محمد جبريل', 'Muhammad_Jibreel_128kbps'),
  ea(113, 'مصطفى إسماعيل', 'Mustafa_Ismail_48kbps'),
  ea(114, 'صلاح بوخاطر', 'Salaah_AbdulRahman_Bukhatir_128kbps'),
  ea(115, 'محسن القاسم', 'Muhsin_Al_Qasim_192kbps'),
  ea(116, 'عبدالله عواد الجهني', 'Abdullaah_3awwaad_Al-Juhaynee_128kbps'),
  ea(117, 'عبدالله مطرود', 'Abdullah_Matroud_128kbps'),
  ea(118, 'أحمد نعينع', 'Ahmed_Neana_128kbps'),
  ea(119, 'محمد عبدالكريم', 'Muhammad_AbdulKareem_128kbps'),
  ea(120, 'خليفة الطنيجي', 'khalefa_al_tunaiji_64kbps'),
  ea(122, 'محمود علي البنا', 'mahmoud_ali_al_banna_32kbps'),
  ea(123, 'خالد القحطاني', 'Khaalid_Abdullaah_al-Qahtaanee_192kbps'),
  ea(124, 'علي حجاج السويسي', 'Ali_Hajjaj_AlSuesy_128kbps'),
  ea(125, 'سهل ياسين', 'Sahl_Yassin_128kbps'),
  ea(126, 'ياسر سلامة', 'Yaser_Salamah_128kbps'),
  ea(127, 'أكرم العلاقمي', 'Akram_AlAlaqimy_128kbps'),
  ea(128, 'أيمن سويد', 'Ayman_Sowaid_64kbps'),
];

export const verseReciterLabel = (r: VerseReciter) => r.style ? `${r.name} (${r.style})` : r.name;
export const verseReciterById = (id: number) => VERSE_RECITERS.find(r => r.id === id);
export const isVerseReciter = (id: number) => VERSE_RECITERS.some(r => r.id === id);

export async function resolveVerseAudioUrl(id: number, surah: number, ayah: number, signal?: AbortSignal): Promise<string | null> {
  const r = verseReciterById(id);
  if (!r) return null;
  if (r.source === 'everyayah') return r.folder ? everyAyahUrl(r.folder, surah, ayah) : null;
  return fetchAyahAudioUrl(r.recitationId ?? id, surah, ayah, signal);
}

/** بحث بالاسم دون اعتبار التشكيل أو الهمزات. */
const norm = (s: string) => s.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase().trim();
export function searchVerseReciters(q: string, list: VerseReciter[] = VERSE_RECITERS): VerseReciter[] {
  const n = norm(q);
  if (!n) return list;
  return list.filter(r => norm(verseReciterLabel(r)).includes(n));
}
