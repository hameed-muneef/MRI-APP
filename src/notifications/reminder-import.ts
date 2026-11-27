// استيراد تذكيرات من ملف: قراءة، تحقّق، إزالة التكرار، واختيار نمط المنبه لكل صفّ أو للملف كله.
// منطق خالص بلا React ولا تخزين، حتى يُختبر وحده ويُستخدم من لوحة المنبهات.
import type {Reminder, ReminderRecurrence} from './types';

export type ImportMode = 'alarm' | 'reminder';
/** اختيار الملف كله: النمط الذي يذكره كل صفّ، وإن لم يذكر فتنبيه عادي. */
export type ImportDefaultMode = ImportMode | 'file';

export type ImportedItem = {
  /** مفتاح ثابت للصفّ داخل الملف: يُستخدم للاختيار لكل صفّ وإزالة التكرار. */
  key: string;
  title: string;
  description: string;
  /** YYYY-MM-DDTHH:MM:00 بالتوقيت المحلي، كما يخزّنه التطبيق. */
  scheduled_at: string;
  recurrence: ReminderRecurrence;
  /** النمط الذي طلبه الملف نفسه إن ذكره، وإلا undefined فيتبع اختيار المستخدم. */
  fileMode?: ImportMode;
  /** أيام الأسبوع (0-6) وكل كم يوم، إن ذكرها الملف؛ وإلا تُشتقّ من التكرار. */
  days?: number[];
  intervalDays?: number;
  alarmMode: boolean;
  /** صفّ مكرّر: موجود في التطبيق أو مكرّر داخل الملف. يُتجاهل عند الإضافة. */
  duplicate: boolean;
  /** سبب رفض الصفّ بالعربية، إن كان غير صالح. */
  problem?: string;
};

export type ImportResult = {
  items: ImportedItem[];
  /** مشكلة تمنع الاستيراد كله (ملف غير صالح، كبير، أو بترميز غير مفهوم). */
  fileProblem?: string;
};

export const MAX_IMPORT_BYTES = 512 * 1024;
/** نفس حدّ التخزين المحلي: ما زاد عليه لا يُحفظ ويُفقد عند إعادة التحميل. */
export const MAX_STORED_REMINDERS = 200;
export const MAX_IMPORT_ITEMS = 200;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;

const RECURRENCES: ReminderRecurrence[] = ['none', 'daily', 'weekday', 'weekdays', 'weekly', 'monthly', 'custom', 'specific_dates'];

const MODE_WORDS: Record<string, ImportMode> = {
  alarm: 'alarm',
  'alarm_mode': 'alarm',
  alarmmode: 'alarm',
  'منبه': 'alarm',
  'نمط منبه': 'alarm',
  reminder: 'reminder',
  'notification': 'reminder',
  'تنبيه': 'reminder',
  'تذكير': 'reminder',
};

/** يحوّل بايتات الملف إلى نص، ويرفض الملفات الكبيرة أو غير الصالحة بترميز UTF-8. */
export function decodeImportBytes(bytes: Uint8Array): {text?: string; fileProblem?: string} {
  if (!bytes || !bytes.length) return {fileProblem: 'الملف فارغ.'};
  if (bytes.length > MAX_IMPORT_BYTES) return {fileProblem: 'الملف أكبر من ٥١٢ كيلوبايت. قسّمه إلى ملفات أصغر.'};
  try {
    const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/^\uFEFF/, '');
    if (!text.trim()) return {fileProblem: 'الملف فارغ.'};
    return {text};
  } catch {
    return {fileProblem: 'تعذّر قراءة الملف: تأكد أنه نصّ بترميز UTF-8.'};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMode(value: unknown): ImportMode | undefined {
  if (typeof value === 'boolean') return value ? 'alarm' : 'reminder';
  const key = str(value).toLowerCase();
  return MODE_WORDS[key];
}

function normalizeRecurrence(value: unknown): ReminderRecurrence {
  const key = str(value).toLowerCase();
  const found = RECURRENCES.find(item => item === key);
  return found ?? 'none';
}

/** يقبل ISO كاملًا أو تاريخًا ووقتًا منفصلين أو وقتًا وحده مع تاريخ اليوم. */
function normalizeSchedule(row: Record<string, unknown>, now: Date): string | undefined {
  const iso = str(row.scheduled_at) || str(row.at) || str(row.when);
  if (iso) {
    const at = new Date(iso);
    if (!isNaN(at.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:00`;
    }
  }
  const time = str(row.time) || str(row['وقت']);
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return undefined;
  const date = str(row.date) || str(row['تاريخ']);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${day}T${match[1].padStart(2, '0')}:${match[2]}:00`;
}

function identity(title: string, scheduled_at: string, recurrence: ReminderRecurrence): string {
  const at = new Date(scheduled_at);
  const time = isNaN(at.getTime()) ? '' : `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${title.trim().toLowerCase()}|${time}|${recurrence}`;
}

/**
 * يقرأ ملف التذكيرات. يقبل مصفوفة صفوف، أو كائنًا فيه reminders/items، ويطبّق النمط الافتراضي
 * على كل صفّ لم يذكر نمطه بنفسه. التكرار يُعلَّم ولا يُحذف، حتى يخبر المستخدم بما سيُتجاهل.
 */
export function parseReminderImport(
  text: string,
  options: {defaultMode: ImportMode; existing?: Reminder[]; now?: Date},
): ImportResult {
  const now = options.now ?? new Date();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {items: [], fileProblem: 'ملف التذكيرات غير صالح: ليس JSON مقروءًا.'};
  }
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).reminders ?? (raw as Record<string, unknown>).items)
      : undefined;
  if (!Array.isArray(rows)) return {items: [], fileProblem: 'لا يحتوي الملف على قائمة تذكيرات.'};
  if (!rows.length) return {items: [], fileProblem: 'قائمة التذكيرات في الملف فارغة.'};

  const seen = new Set<string>();
  for (const existing of options.existing ?? []) {
    seen.add(identity(existing.title, existing.scheduled_at, existing.recurrence));
  }

  const items: ImportedItem[] = [];
  rows.slice(0, MAX_IMPORT_ITEMS).forEach((entry, index) => {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const title = str(row.title) || str(row.name) || str(row['عنوان']);
    const scheduled_at = normalizeSchedule(row, now);
    const recurrence = normalizeRecurrence(row.recurrence ?? row.repeat ?? row['تكرار']);
    const description = (str(row.description) || str(row.body) || str(row['وصف'])).slice(0, MAX_DESCRIPTION);
    const fileMode = normalizeMode(row.mode ?? row.alarm_mode ?? row.alarmMode ?? row['نمط']);
    const rawDays = Array.isArray(row.days_of_week) ? row.days_of_week : Array.isArray(row.days) ? row.days : [];
    const days = rawDays
      .map(day => Number(day))
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    const intervalDays = Number(row.interval_days ?? row.intervalDays);
    const key = `import-${index}`;
    let problem: string | undefined;
    if (!title) problem = 'بلا عنوان.';
    else if (!scheduled_at) problem = 'بلا وقت صالح (استخدم HH:MM أو scheduled_at).';
    const duplicate = !problem && seen.has(identity(title.slice(0, MAX_TITLE), scheduled_at!, recurrence));
    if (!problem) seen.add(identity(title.slice(0, MAX_TITLE), scheduled_at!, recurrence));
    items.push({
      key,
      title: title.slice(0, MAX_TITLE),
      description,
      scheduled_at: scheduled_at ?? '',
      recurrence,
      fileMode,
      days: days.length ? [...new Set(days)].sort((a, b) => a - b) : undefined,
      intervalDays: Number.isFinite(intervalDays) && intervalDays > 0 ? Math.min(365, Math.round(intervalDays)) : undefined,
      alarmMode: (fileMode ?? options.defaultMode) === 'alarm',
      duplicate,
      problem,
    });
  });

  if (rows.length > MAX_IMPORT_ITEMS) {
    return {
      items,
      fileProblem: `الملف يحتوي ${rows.length} تذكيرًا، والحدّ ${MAX_IMPORT_ITEMS} في المرة. قسّمه إلى ملفات أصغر.`,
    };
  }
  return {items};
}

/**
 * النمط النهائي لكل صفّ: اختيار الصفّ أولًا، ثم اختيار الملف كله، وأخيرًا ما ذكره الملف نفسه
 * (وحين لا يذكر شيئًا يبقى تنبيهًا عاديًا). «حسب الملف» هو الافتراضي فلا يتغيّر ما قصده الملف.
 */
export function resolveModes(
  items: ImportedItem[],
  options: {defaultMode: ImportDefaultMode; overrides?: Record<string, ImportMode>},
): ImportedItem[] {
  const overrides = options.overrides ?? {};
  return items.map(item => {
    const mode = overrides[item.key]
      ?? (options.defaultMode === 'file' ? (item.fileMode ?? 'reminder') : options.defaultMode);
    return {...item, alarmMode: mode === 'alarm'};
  });
}

/** كم تذكيرًا يمكن أن يستوعبه التخزين الآن (الحدّ ٢٠٠ ويُحفظ الأقدم). */
export function roomFor(existingCount: number): number {
  const count = Number.isFinite(existingCount) ? Math.max(0, Math.floor(existingCount)) : 0;
  return Math.max(0, MAX_STORED_REMINDERS - count);
}

/** الصفوف التي ستُضاف فعلًا: صالحة وغير مكرّرة. */
export function importableItems(items: ImportedItem[]): ImportedItem[] {
  return items.filter(item => !item.problem && !item.duplicate);
}

/** يحوّل صفًّا مقبولًا إلى تذكير جاهز للتخزين. */
export function importedToReminder(item: ImportedItem, id: string, now = new Date()): Reminder {
  return {
    id,
    user_id: '',
    title: item.title,
    description: item.description,
    scheduled_at: item.scheduled_at,
    recurrence: item.recurrence,
    recurrence_config: {
      start_date: item.scheduled_at.slice(0, 10),
      days_of_week: item.recurrence === 'weekdays'
        ? (item.days?.length ? item.days : [1, 2, 3, 4, 5])
        : item.recurrence === 'weekly'
          ? [item.days?.[0] ?? new Date(item.scheduled_at).getDay()]
          : undefined,
      interval_days: item.recurrence === 'custom' ? (item.intervalDays ?? 2) : undefined,
      specific_dates: item.recurrence === 'specific_dates' ? [item.scheduled_at.slice(0, 10)] : undefined,
    },
    category: 'reminder',
    enabled: true,
    alarm_mode: item.alarmMode ? true : undefined,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  } as Reminder;
}
