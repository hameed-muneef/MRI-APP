// رسائل الحالة القصيرة: الرسالة الجديدة يجب أن تُعرض كامل مدّتها،
// ولا يمسحها مؤقّت الرسالة السابقة (كان يحدث عند إجراءين متتاليين مثل: إنشاء منبه ثم استيراد نسخة).

export const TOAST_MS = 2600;

export type ToastSetter = (message: string) => void;

export interface ToastNotifier {
  notify(message: string): void;
  dispose(): void;
}

export function createToastNotifier(setToast: ToastSetter): ToastNotifier {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    notify(message: string) {
      clear();
      setToast(message);
      timer = setTimeout(() => {
        timer = null;
        setToast('');
      }, TOAST_MS);
    },
    dispose() {
      clear();
    },
  };
}
