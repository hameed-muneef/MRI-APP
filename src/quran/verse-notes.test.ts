import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getVerseNote, saveVerseNote, deleteVerseNote, loadVerseNotes } from './verse-notes';
import { attributionLabel } from '../views/quran/UnderstandingSheet';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});

describe('private verse notes', () => {
  it('saves, reads and deletes a note locally', () => {
    expect(getVerseNote(1, 1)).toBeNull();
    expect(saveVerseNote(1, 1, 'معنى أولي')).toBe(true);
    expect(getVerseNote(1, 1)?.text).toBe('معنى أولي');
    expect(deleteVerseNote(1, 1)).toBe(true);
    expect(getVerseNote(1, 1)).toBeNull();
  });
  it('an empty note deletes instead of storing blank text', () => {
    saveVerseNote(2, 5, 'x');
    saveVerseNote(2, 5, '   ');
    expect(getVerseNote(2, 5)).toBeNull();
  });
  it('corrupt stored data falls back to empty without throwing', () => {
    localStorage.setItem('rabbani-verse-notes-v1', '{broken');
    expect(loadVerseNotes().notes).toEqual({});
    localStorage.setItem('rabbani-verse-notes-v1', JSON.stringify({ version: 2, notes: {} }));
    expect(loadVerseNotes().notes).toEqual({});
  });
});

describe('attribution label', () => {
  it('names the source beside every text, unchanged wording', () => {
    expect(attributionLabel('تفسير السعدي')).toMatchInlineSnapshot(`"المصدر: تفسير السعدي، عبر Quran.com API v4، إصدار النص غير محدد من المزود"`);
  });
});
