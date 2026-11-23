import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  audioUrl,
  defaultMoshaf,
  FAMOUS_RECITER_IDS,
  moshafCategory,
  normalizeArabicSearch,
  parseRecitersPayload,
  reciterHasSurah,
  searchReciters,
} from './audio';
import {
  everyAyahUrl,
  resolveAyahSourceForMp3QuranReciter,
} from './ayah-audio';

describe('quran/audio directory & search', () => {
  it('normalizes Arabic search queries across alef, diacritics, ta marbuta, and Abd al-', () => {
    expect(normalizeArabicSearch('مِشَارِي رَاشِد الْعَفَاسِي')).toBe('مشاري راشد العفاسي');
    expect(normalizeArabicSearch('عبد الباسط عبد الصمد')).toBe('عبدالباسط عبدالصمد');
    expect(normalizeArabicSearch('قراءة ورش')).toBe('قراءه ورش');
  });

  it('classifies moshaf narrations into hafs / warsh / qalun / other', () => {
    expect(moshafCategory('حفص عن عاصم - مرتل')).toBe('hafs');
    expect(moshafCategory('ورش عن نافع')).toBe('warsh');
    expect(moshafCategory('قالون عن نافع')).toBe('qalun');
    expect(moshafCategory('الدوري عن أبي عمرو')).toBe('other');
  });

  it('parses reciters payload, normalizes HTTPS servers, ranks famous reciters first', () => {
    const parsed = parseRecitersPayload([
      {
        id: 999,
        name: 'قارئ آخر',
        moshaf: [{ id: 9001, name: 'حفص عن عاصم', server: 'http://server.example.com/q1/', surah_list: '1,2' }],
      },
      {
        id: 102,
        name: 'ماهر المعيقلي',
        moshaf: [
          { id: 1022, name: 'مصحف مجود ناقص', server: '//server.example.com/m_short/', surah_list: '1,114' },
          {
            id: 1021,
            name: 'حفص عن عاصم - مرتل',
            server: 'http://cdn.example.com/maher',
            surah_list: Array.from({ length: 114 }, (_, i) => i + 1).join(','),
          },
        ],
      },
      {
        id: 123,
        name: 'مشاري العفاسي',
        moshaf: [{ id: 1231, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.example.com/afasy/', surah_list: '1,2,3' }],
      },
    ]);

    expect(parsed.map(r => r.id)).toEqual([123, 102, 999]);
    expect(parsed[0].famous).toBe(true);
    expect(parsed[2].famous).toBe(false);
    expect(parsed[1].moshaf[0].id).toBe(1021);
    expect(parsed[1].moshaf[0].server).toBe('https://cdn.example.com/maher/');
    expect(parsed[1].moshaf[1].server).toBe('https://server.example.com/m_short/');
    expect(audioUrl(parsed[1].moshaf[0], 2)).toBe('https://cdn.example.com/maher/002.mp3');
    expect(reciterHasSurah(parsed[1].moshaf[1], 114)).toBe(true);
    expect(reciterHasSurah(parsed[1].moshaf[1], 5)).toBe(false);
    expect(defaultMoshaf(parsed[1])?.id).toBe(1021);
  });

  it('loads and indexes the bundled 244+ reciters catalog cleanly', () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/quran/reciters.json'), 'utf8'));
    const reciters = parseRecitersPayload(raw.reciters);

    expect(reciters.length).toBeGreaterThanOrEqual(240);
    expect(FAMOUS_RECITER_IDS.every(id => reciters.some(r => r.id === id))).toBe(true);

    const dosariMatches = searchReciters(reciters, 'الدوسري');
    expect(dosariMatches.some(r => r.name.includes('ياسر'))).toBe(true);

    const warshMatches = searchReciters(reciters, 'ورش');
    expect(warshMatches.length).toBeGreaterThanOrEqual(10);
  });
});

describe('quran/ayah-audio expanded per-ayah mapping', () => {
  it('resolves Quran.com, special Mujawwad/Muallim modes, and verified EveryAyah folders', () => {
    expect(resolveAyahSourceForMp3QuranReciter(123, 'حفص عن عاصم - مرتل')).toEqual({ kind: 'qurancom', recitationId: 7 });
    expect(resolveAyahSourceForMp3QuranReciter(51, 'حفص عن عاصم - مجود')).toEqual({ kind: 'qurancom', recitationId: 1 });
    expect(resolveAyahSourceForMp3QuranReciter(118, 'المصحف المعلم')).toEqual({ kind: 'qurancom', recitationId: 12 });
    expect(resolveAyahSourceForMp3QuranReciter(102, 'حفص عن عاصم - مرتل')).toEqual({ kind: 'everyayah', folder: 'MaherAlMuaiqly128kbps' });
    expect(resolveAyahSourceForMp3QuranReciter(92, 'حفص عن عاصم - مرتل')).toEqual({ kind: 'everyayah', folder: 'Yasser_Ad-Dussary_128kbps' });
    expect(resolveAyahSourceForMp3QuranReciter(999999)).toBeNull();
    expect(everyAyahUrl('MaherAlMuaiqly128kbps', 2, 255)).toBe(
      'https://everyayah.com/data/MaherAlMuaiqly128kbps/002255.mp3',
    );
  });
});
