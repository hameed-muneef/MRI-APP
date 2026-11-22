// سجل موحّد لمعالجات زر الرجوع داخل الواجهة.
// كل طبقة مفتوحة (نافذة، لوحة، قائمة، قسم داخلي) تسجّل معالجًا هنا،
// ويُستدعى آخر معالج مُسجَّل أولًا — أي الطبقة الأعلى ظهورًا.
export type BackHandler = () => void;

interface BackHandlerEntry {
  id: number;
  handler: BackHandler;
}

const handlers: BackHandlerEntry[] = [];
let nextId = 1;

/** يسجّل معالجًا ويعيد دالة لإلغاء التسجيل (تنظيف useEffect). */
export function registerBackHandler(handler: BackHandler): () => void {
  const entry: BackHandlerEntry = {id: nextId++, handler};
  handlers.push(entry);
  return () => {
    const index = handlers.findIndex((item) => item.id === entry.id);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** ينفّذ معالج الطبقة الأعلى. يعيد true إذا كان هناك معالج فعلي. */
export function runBackHandler(): boolean {
  const entry = handlers[handlers.length - 1];
  if (!entry) return false;
  try {
    entry.handler();
    return true;
  } catch {
    // نزيل المعالج المعطوب حتى لا يمنع الرجوع في المرات التالية.
    const index = handlers.findIndex((item) => item.id === entry.id);
    if (index >= 0) handlers.splice(index, 1);
    return false;
  }
}

export function hasBackHandler(): boolean {
  return handlers.length > 0;
}

/** نافذة تأكيد الخروج عند الضغط مرتين على الرئيسية. */
export const EXIT_CONFIRM_WINDOW_MS = 2000;

export type BackAction = 'overlay' | 'home' | 'exit' | 'hint';

export interface BackDecisionInput {
  /** الشاشة الحالية (home أو أي قسم). */
  view: string;
  /** هل هناك طبقة داخلية مسجّلة (نافذة/لوحة/قسم فرعي)؟ */
  hasOverlay: boolean;
  /** وقت آخر ضغطة تأكيد خروج، أو null. */
  lastExitPressAt: number | null;
  /** الوقت الحالي (Date.now). */
  now: number;
  /** مهلة الضغطتين. */
  exitWindowMs?: number;
}

export interface BackDecision {
  action: BackAction;
  lastExitPressAt: number | null;
}

/**
 * يقرّر ما يجب فعله عند الضغط على الرجوع:
 * 1) إغلاق الطبقة الداخلية إن وُجدت.
 * 2) العودة للرئيسية من أي قسم آخر.
 * 3) الخروج إذا كانت الضغطة الثانية خلال المهلة.
 * 4) إظهار تلميح «اضغط مرة أخرى» في غير ذلك.
 */
export function decideBackAction(input: BackDecisionInput): BackDecision {
  const windowMs = input.exitWindowMs ?? EXIT_CONFIRM_WINDOW_MS;

  if (input.hasOverlay) {
    return {action: 'overlay', lastExitPressAt: null};
  }

  if (input.view !== 'home') {
    return {action: 'home', lastExitPressAt: null};
  }

  const elapsed = input.lastExitPressAt == null ? Infinity : input.now - input.lastExitPressAt;
  if (elapsed >= 0 && elapsed <= windowMs) {
    return {action: 'exit', lastExitPressAt: null};
  }

  return {action: 'hint', lastExitPressAt: input.now};
}
