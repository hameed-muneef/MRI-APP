// تسجيل service worker مع تحديث تلقائي: عند جاهزية نسخة جديدة (وكانت النسخة القديمة
// تتحكم في الصفحة) يُعاد تحميل الصفحة مرة واحدة تلقائيًا — لا حاجة إلى refresh يدوي.
// في بيئة Capacitor الأصلية (Android/iOS) تُحزم الأصول محليًا داخل التطبيق، لذا يُتخطى SW
// لتفادي تضارب التخزين المؤقت وحلقات إعادة التحميل داخل WebView.
let reloaded = false;

const isCapacitorNative =
  typeof window !== 'undefined' &&
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
  Boolean((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());

if (!isCapacitorNative && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // إعادة تحميل واحدة عند تولي service worker جديد للسيطرة على الصفحة.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      // أول تثبيت على الجهاز: الصفحة أصلاً بالنسخة الجديدة — لا إعادة تحميل.
      if (!navigator.serviceWorker.controller) return;
      if(document.querySelector('.qm-steps')){
        const banner=document.createElement('div');banner.setAttribute('role','status');banner.className='qm-update-notice';banner.textContent='تحديث جاهز. أنهِ الجلسة واحفظها ثم أعد فتح التطبيق لتطبيقه؛ لن نقطع التسجيل أو التسميع.';document.body.appendChild(banner);return;
      }
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => { /* لا شيء — العمل دون SW ممكن */ });
  });
}
