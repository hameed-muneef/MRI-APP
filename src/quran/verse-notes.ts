// ملاحظات فهم خاصة لكل آية (Phase 3): محلية فقط، منفصلة عن بيانات الحفظ والإتقان، قابلة للحذف.
import { z } from 'zod';

const KEY = 'rabbani-verse-notes-v1';

const noteSchema = z.object({ text: z.string().max(4000), updatedAt: z.string() });
const rootSchema = z.object({ version: z.literal(1), notes: z.record(z.string(), noteSchema) });

export type VerseNote = z.infer<typeof noteSchema>;
type NotesRoot = z.infer<typeof rootSchema>;

const emptyRoot = (): NotesRoot => ({ version: 1, notes: {} });

export function verseKeyOf(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function loadVerseNotes(): NotesRoot {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyRoot();
    const parsed = rootSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyRoot();
  } catch {
    return emptyRoot();
  }
}

function persist(root: NotesRoot): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(root));
    return true;
  } catch {
    return false;
  }
}

export function getVerseNote(surah: number, ayah: number): VerseNote | null {
  return loadVerseNotes().notes[verseKeyOf(surah, ayah)] ?? null;
}

export function saveVerseNote(surah: number, ayah: number, text: string): boolean {
  if(!canWrite())return false;
  const root = loadVerseNotes();
  const trimmed = text.trim().slice(0, 4000);
  if (!trimmed) return deleteVerseNote(surah, ayah);
  root.notes[verseKeyOf(surah, ayah)] = { text: trimmed, updatedAt: new Date().toISOString() };
  return persist(root);
}

export function deleteVerseNote(surah: number, ayah: number): boolean {
  if(!canWrite())return false;
  const root = loadVerseNotes();
  delete root.notes[verseKeyOf(surah, ayah)];
  return persist(root);
}

function canWrite():boolean{
  try{const raw=localStorage.getItem(KEY);return raw===null||rootSchema.safeParse(JSON.parse(raw)).success;}catch{return false;}
}
