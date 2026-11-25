// سجل إنجاز مؤرّخ يبدأ من تفعيل الميزة فقط. لا يُنشأ منه أي تاريخ سابق.
// يُحفظ داخل State (achievementLog) فيدخل في النسخة الاحتياطية والمزامنة السحابية.
export type AchievementKind = 'bilquran_step' | 'adhkar_category' | 'wird_complete';
export type AchievementEntry = {id: string; kind: AchievementKind; date: string; refId: string; label?: string; at: string};

export const ACHIEVEMENT_LOG_LIMIT = 4000;
export const ACHIEVEMENT_LOG_EVENT = 'rabbani-achievement-log';

export function entryId(kind: AchievementKind, refId: string, date: string): string {
  return `${kind}:${refId}:${date}`;
}

export function makeEntry(kind: AchievementKind, refId: string, date: string, label?: string, now = new Date()): AchievementEntry {
  return {id: entryId(kind, refId, date), kind, date, refId, ...(label ? {label} : {}), at: now.toISOString()};
}

/** يضيف السجل إن لم يوجد بالمعرّف نفسه. يعيد المصفوفة ذاتها إن لم يتغير شيء. */
export function appendEntry(log: AchievementEntry[] | undefined, entry: AchievementEntry): AchievementEntry[] {
  const current = log ?? [];
  if (current.some(item => item.id === entry.id)) return current;
  return trim([...current, entry]);
}

/** دمج بالمعرّف: يُبقى الأقدم زمنًا عند التعارض، ويُحذف الأقدم تاريخًا عند تجاوز الحد. */
export function mergeLogs(a: AchievementEntry[] | undefined, b: AchievementEntry[] | undefined): AchievementEntry[] {
  const map = new Map<string, AchievementEntry>();
  for (const entry of [...(a ?? []), ...(b ?? [])]) {
    const old = map.get(entry.id);
    if (!old || entry.at < old.at) map.set(entry.id, entry);
  }
  return trim([...map.values()]);
}

function trim(list: AchievementEntry[]): AchievementEntry[] {
  if (list.length <= ACHIEVEMENT_LOG_LIMIT) return list;
  return [...list].sort((x, y) => y.date.localeCompare(x.date)).slice(0, ACHIEVEMENT_LOG_LIMIT);
}

/** تحميل الحالة السحابية: تُعتمد الحالة البعيدة وتُدمج سجلات الإنجاز المحلية والبعيدة بالمعرّف فلا يضيع شيء من أي جهاز. */
export function applyRemoteState<T extends {achievementLog?: AchievementEntry[]}>(current: T, remote: T): T {
  return {...remote, achievementLog: mergeLogs(current.achievementLog, remote.achievementLog)};
}

export function emitAchievement(entry: AchievementEntry): void {
  try { window.dispatchEvent(new CustomEvent<AchievementEntry>(ACHIEVEMENT_LOG_EVENT, {detail: entry})); } catch { /* ignore */ }
}
