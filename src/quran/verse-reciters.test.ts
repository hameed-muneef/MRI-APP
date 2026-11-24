import {describe, expect, it} from 'vitest';
import {VERSE_RECITERS, isVerseReciter, resolveVerseAudioUrl, searchVerseReciters, verseReciterLabel} from './verse-reciters';

describe('verse reciters', () => {
  it('has unique ids and names and only Hafs', () => {
    expect(new Set(VERSE_RECITERS.map(r => r.id)).size).toBe(VERSE_RECITERS.length);
    expect(new Set(VERSE_RECITERS.map(verseReciterLabel)).size).toBe(VERSE_RECITERS.length);
    expect(VERSE_RECITERS.every(r => r.riwaya === 'حفص عن عاصم')).toBe(true);
    expect(VERSE_RECITERS.length).toBeGreaterThanOrEqual(40);
  });
  it('keeps the original three ids valid', () => { for (const id of [6, 7, 9]) expect(isVerseReciter(id)).toBe(true); expect(isVerseReciter(999)).toBe(false); });
  it('resolves EveryAyah folder urls and rejects unknown ids', async () => {
    expect(await resolveVerseAudioUrl(101, 2, 255)).toBe('https://everyayah.com/data/MaherAlMuaiqly128kbps/002255.mp3');
    expect(await resolveVerseAudioUrl(999, 1, 1)).toBeNull();
  });
  it('searches Arabic names ignoring hamza and diacritics', () => {
    expect(searchVerseReciters('ماهر').map(r => r.id)).toEqual([101]);
    expect(searchVerseReciters('احمد').length).toBeGreaterThanOrEqual(2);
    expect(searchVerseReciters('حصري').length).toBe(3);
    expect(searchVerseReciters('xyz')).toEqual([]);
  });
});
