import {useEffect, useRef} from 'react';
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {decideBackAction, hasBackHandler, runBackHandler, type BackAction} from './back-stack';

interface Options {
  /** الشاشة الحالية. */
  view: string;
  /** العودة إلى الرئيسية من أي قسم. */
  onNavigateHome: () => void;
  /** تلميح «اضغط مرة أخرى للخروج» على الرئيسية. */
  onExitHint: () => void;
}

/**
 * يعالج زر الرجوع الأصلي في أندرويد (بما فيه إيماءة الرجوع)،
 * ويوفّر سلوكًا مكافئًا في المتصفح عبر popstate.
 *
 * الأولوية: طبقة داخلية ← الرئيسية ← تأكيد الخروج بضغطتين.
 * الصوت لا يتوقف عند الرجوع؛ يبقى في الخلفية.
 */
export function useAppBackButton({view, onNavigateHome, onExitHint}: Options): void {
  const viewRef = useRef(view);
  viewRef.current = view;
  const navigateHomeRef = useRef(onNavigateHome);
  navigateHomeRef.current = onNavigateHome;
  const exitHintRef = useRef(onExitHint);
  exitHintRef.current = onExitHint;
  const lastExitPressRef = useRef<number | null>(null);

  // أي انتقال بين الشاشات يُلغي مفعول ضغطة الخروج السابقة.
  useEffect(() => {
    lastExitPressRef.current = null;
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    let removeNative: (() => void) | null = null;
    let removeWeb: (() => void) | null = null;

    const handleBack = (): BackAction => {
      const decision = decideBackAction({
        view: viewRef.current,
        hasOverlay: hasBackHandler(),
        lastExitPressAt: lastExitPressRef.current,
        now: Date.now(),
      });
      lastExitPressRef.current = decision.lastExitPressAt;

      if (decision.action === 'overlay') {
        runBackHandler();
        return decision.action;
      }
      if (decision.action === 'home') {
        navigateHomeRef.current();
        return decision.action;
      }
      if (decision.action === 'exit') {
        if (Capacitor.isNativePlatform()) {
          void App.exitApp();
        }
        return decision.action;
      }
      exitHintRef.current();
      return decision.action;
    };

    if (Capacitor.isNativePlatform()) {
      void App.addListener('backButton', handleBack)
        .then((listener) => {
          if (cancelled) void listener.remove();
          else removeNative = () => void listener.remove();
        })
        .catch(() => {
          // إن تعذّر تسجيل المستمع يبقى سلوك WebView الافتراضي.
        });
    } else if (typeof window !== 'undefined') {
      const pushGuard = () => {
        try {
          window.history.pushState({...window.history.state, __rabbaniBackGuard: true}, '');
        } catch {
          // بعض المتصفحات تمنع تعديل التاريخ قبل تفاعل المستخدم.
        }
      };
      // مدخل واقٍ واحد حتى يصل رجوع المتصفح إلى التطبيق بدل مغادرته فورًا.
      // على الرئيسية تُستهلك أول ضغطة، والثانية تغادر الصفحة كالمعتاد.
      if (window.history.state?.__rabbaniBackGuard !== true) pushGuard();
      const onPopState = () => {
        // على الرئيسية بلا طبقات مفتوحة نسمح للمتصفح بالمغادرة كالمعتاد.
        if (!hasBackHandler() && viewRef.current === 'home') return;
        const action = handleBack();
        if (action === 'overlay' || action === 'home') pushGuard();
      };
      window.addEventListener('popstate', onPopState);
      removeWeb = () => window.removeEventListener('popstate', onPopState);
    }

    return () => {
      cancelled = true;
      removeNative?.();
      removeWeb?.();
    };
  }, []);
}
