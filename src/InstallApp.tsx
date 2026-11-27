// زر تثبيت التطبيق: يستمع لـ beforeinstallprompt (كروم/أندرويد/سطح المكتب) ويستدعي مربّع التثبيت الأصلي.
// على iPhone لا يوجد مربّع تثبيت برمجي — الإرشاد يظهر في لوحة «تثبيت التطبيق» بالإعدادات.
import {useEffect, useState, type JSX} from 'react';
import {Download, Smartphone} from 'lucide-react';
import {useBackHandler} from './navigation/useBackHandler';
import {useScrollLock} from './navigation/useScrollLock';

type BIPEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: string}>};

// يُسجَّل على مستوى الوحدة (قبل رندر React) حتى لا نفوت حدث beforeinstallprompt إذا أطلقه المتصفح مبكرًا.
let earlyPrompt: BIPEvent | null = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  earlyPrompt = event as BIPEvent;
  (window as {__bipFired?: boolean}).__bipFired = true;
});
// إن كان التطبيق مثبتًا فعلًا فلا داعي لكل ما يلي.
let earlyInstalled = isStandalone();
window.addEventListener('appinstalled', () => { earlyInstalled = true; });

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as {standalone?: boolean}).standalone === true;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

type InstallCapability = {
  promptEvent: BIPEvent | null;
  ios: boolean;
  installed: boolean;
  setPromptEvent: (event: BIPEvent | null) => void;
};

function useInstallCapability(): InstallCapability {
  // البداية من التقاط الوحدة المبكر — الحدث قد يُطلق قبل تركيب المستمعين داخل React.
  const [promptEvent, setPromptEvent] = useState<BIPEvent | null>(() => earlyPrompt);
  const [installed, setInstalled] = useState<boolean>(() => earlyInstalled || isStandalone());
  useEffect(() => {
    const onBIP = (event: Event) => {
      event.preventDefault(); // نمنع الشريط التلقائي ونحفظ الحدث لاستدعائه من زرّنا
      setPromptEvent(event as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return {promptEvent, ios: isIOS(), installed, setPromptEvent};
}

// زر أعلى الصفحة: يظهر عند إتاحة التثبيت البرمجي أو على iOS Safari لإرشاد المستخدم
export function InstallAppButton(): JSX.Element | null {
  const {promptEvent, ios, installed, setPromptEvent} = useInstallCapability();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  useScrollLock(showIOSGuide);
  useBackHandler(() => setShowIOSGuide(false), showIOSGuide);
  const isNative = typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
    && Boolean((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());
  if (installed || isNative) return null;
  if (promptEvent) {
    const install = async () => {
      await promptEvent.prompt();
      const {outcome} = await promptEvent.userChoice;
      if (outcome === 'accepted') setPromptEvent(null);
    };
    return (
      <button type="button" className="icon-btn install-app" aria-label="تثبيت التطبيق" title="تثبيت التطبيق" onClick={install}>
        <Download size={18}/>
      </button>
    );
  }
  if (ios) {
    return (
      <>
        <button type="button" className="icon-btn install-app" aria-label="تثبيت التطبيق على الآيفون" title="تثبيت التطبيق" onClick={() => setShowIOSGuide(true)}>
          <Download size={18}/>
        </button>
        {showIOSGuide && (
          <div className="ios-install-backdrop" role="dialog" aria-modal="true" aria-label="تثبيت التطبيق على الآيفون والآيباد" onClick={() => setShowIOSGuide(false)}>
            <div className="panel ios-install-modal" dir="rtl" onClick={e => e.stopPropagation()}>
              <h3><Smartphone size={18}/> تثبيت التطبيق على الآيفون</h3>
              <p className="muted">1. اضغط زر <strong>مشاركة</strong> (المربع والسهم) في شريط Safari.<br/>2. مرر للأسفل واختر <strong>«إضافة إلى الشاشة الرئيسية»</strong>.</p>
              <button type="button" className="primary" onClick={() => setShowIOSGuide(false)}>إغلاق</button>
            </div>
          </div>
        )}
      </>
    );
  }
  return null;
}

// لوحة الإعدادات: تشرح التثبيت على كل منصة
export function InstallGuidePanel(): JSX.Element | null {
  const {promptEvent, ios, installed, setPromptEvent} = useInstallCapability();
  const [done, setDone] = useState(false);
  if (installed || done) {
    return (
      <section className="panel">
        <h3><Smartphone size={18}/> تثبيت التطبيق</h3>
        <p className="muted">التطبيق مثبَّت على هذا الجهاز ويعمل بملء الشاشة مثل باقي التطبيقات.</p>
      </section>
    );
  }
  if (!ios && !promptEvent) {
    return null;
  }
  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const {outcome} = await promptEvent.userChoice;
    if (outcome === 'accepted') { setPromptEvent(null); setDone(true); }
  };
  return (
    <section className="panel">
      <h3><Smartphone size={18}/> تثبيت التطبيق</h3>
      {ios ? (
        <p className="muted">
          على الآيفون/الآيباد: افتح هذا الموقع في Safari ثم اضغط زر <strong>مشاركة</strong> (المربع والسهم) واختر
          <strong> «إضافة إلى الشاشة الرئيسية»</strong>.
        </p>
      ) : (
        <>
          <p className="muted">ثبّت المنصة على جهازك لتفتح بملء الشاشة وتعمل حتى دون اتصال.</p>
          <button className="primary" onClick={install}><Download size={17}/> تثبيت التطبيق</button>
        </>
      )}
    </section>
  );
}
