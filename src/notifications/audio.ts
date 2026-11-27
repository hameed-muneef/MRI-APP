// خدمة إدارة الصوت (Sound & Audio Management Service)
// مكتبة الأصوات المركزية، المعاينة، والتحميل الآمن للملفات المخصصة.

import {authClient} from '../auth';
import {
  isBundledWebAssetUrl,
  isNativeCapacitorWebView,
  loadLocalAudioObjectUrlForWebView,
  resolveAudioUrlForWeb,
} from '../audio/url-resolver';
import {unlockBuiltInAudioContext} from './builtin-sounds';
import type {AudioResource} from './types';

let audioEl: HTMLAudioElement | null = null;
let activeObjectUrlRevoke: (() => void) | null = null;
let playToken = 0;
let audioElUnlocked = false;
let unlockListenersInstalled = false;

const SILENT_WAV_DATA_URL = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function revokeActiveBlob(): void {
  if (activeObjectUrlRevoke) {
    try { activeObjectUrlRevoke(); } catch { /* ignore */ }
    activeObjectUrlRevoke = null;
  }
}

export function getAudioElement(): HTMLAudioElement {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

/**
 * يفتح قفل تشغيل الصوت على المتصفح عند تفاعل المستخدم (ضغطة/لمسة/زر)،
 * حتى تتمكن التنبيهات المجدولة لاحقًا (الأذان/التذكيرات/المهام) من إطلاق الصوت بدون حظر التشغيل التلقائي.
 */
export function unlockAudioPlayback(): void {
  unlockBuiltInAudioContext();
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || audioElUnlocked) return;
  const el = getAudioElement();
  // لا تقاطع صوتًا يعمل حاليًا
  if (!el.paused && el.currentSrc) {
    audioElUnlocked = true;
    return;
  }
  try {
    el.muted = true;
    el.src = SILENT_WAV_DATA_URL;
    const promise = el.play();
    if (promise && typeof promise.then === 'function') {
      void promise.then(() => {
        audioElUnlocked = true;
        if (el.src === SILENT_WAV_DATA_URL) {
          el.pause();
          el.muted = false;
        }
      }).catch(() => {
        el.muted = false;
      });
    } else {
      audioElUnlocked = true;
      el.muted = false;
    }
  } catch {
    el.muted = false;
  }
}

export function installAudioUnlockListeners(): () => void {
  if (typeof window === 'undefined' || unlockListenersInstalled) return () => {};
  unlockListenersInstalled = true;
  const onGesture = () => {
    unlockAudioPlayback();
  };
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown', 'click'];
  for (const ev of events) {
    window.addEventListener(ev, onGesture, {capture: true, passive: true});
  }
  return () => {
    unlockListenersInstalled = false;
    for (const ev of events) {
      window.removeEventListener(ev, onGesture, {capture: true});
    }
  };
}

export function stopAudio(): void {
  playToken += 1;
  if (audioEl) {
    audioEl.onerror = null;
    audioEl.onended = null;
    try {
      audioEl.pause();
      if (audioEl.currentSrc && audioEl.currentSrc !== SILENT_WAV_DATA_URL) {
        audioEl.currentTime = 0;
      }
    } catch { /* ignore */ }
  }
  revokeActiveBlob();
}

export function playAudio(url: string, onFallback?: () => void): void {
  stopAudio();
  const token = ++playToken;
  const resolved = resolveAudioUrlForWeb(url);
  if (!resolved) {
    onFallback?.();
    return;
  }
  const el = getAudioElement();
  let fellBack = false;
  const triggerFallback = () => {
    if (fellBack || token !== playToken) return;
    fellBack = true;
    el.onerror = null;
    revokeActiveBlob();
    onFallback?.();
  };
  el.muted = false;
  el.volume = 1;
  el.onerror = onFallback ? triggerFallback : null;
  el.onended = () => {
    if (token === playToken) revokeActiveBlob();
  };

  // في Android WebView المحلي فقط نحتاج تحميل الأصل عبر Blob لتفادي قيود 206 Range.
  // أما على المتصفح، فيجب استدعاء el.play() فورًا وبشكل متزامن داخل حدث النقرة لحفظ صلاحية التشغيل.
  if (isNativeCapacitorWebView() && isBundledWebAssetUrl(resolved)) {
    void loadLocalAudioObjectUrlForWebView(resolved).then(localBlob => {
      if (token !== playToken) {
        localBlob?.revoke();
        return;
      }
      if (localBlob) {
        activeObjectUrlRevoke = localBlob.revoke;
        el.src = localBlob.url;
      } else {
        el.src = resolved;
      }
      void el.play().then(() => { audioElUnlocked = true; }).catch(() => {
        triggerFallback();
      });
    }).catch(() => {
      if (token !== playToken) return;
      el.src = resolved;
      void el.play().then(() => { audioElUnlocked = true; }).catch(() => {
        triggerFallback();
      });
    });
    return;
  }

  el.src = resolved;
  void el.play().then(() => { audioElUnlocked = true; }).catch(() => {
    // قد يُمنع التشغيل التلقائي أو يفشل تحميل الملف — فعّل البديل المدمج إن وُجد
    triggerFallback();
  });
}

export function previewAudio(resource: AudioResource): void {
  if (!resource.url) return;
  playAudio(resource.url);
}

// ---------- operations على الخادم ----------

export async function listAudioResources(): Promise<AudioResource[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.from('audio_resources').select('*').order('is_default', {ascending: false}).order('title', {ascending: true});
  if (error) throw error;
  return (data ?? []) as unknown as AudioResource[];
}

export async function uploadAudioFile(file: File, title: string): Promise<AudioResource> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');

  // التحقق من جهة العميل (يُعاد التحقق على الخادم)
  const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'];
  if (!allowed.includes(file.type)) throw new Error('صيغة الصوت غير مدعومة.');
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصوت أكبر من المسموح (10 ميغابايت).');

  const fileName = `audio_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const {error: uploadError} = await authClient.storage.from('audio').upload(fileName, file, {cacheControl: '3600'});
  if (uploadError) throw uploadError;
  const {data: urlData} = authClient.storage.from('audio').getPublicUrl(fileName);

  const {data, error} = await authClient.from('audio_resources').insert({
    title,
    kind: 'custom',
    url: urlData.publicUrl,
    is_uploaded: true,
    uploader_id: '', // يُحشَد من auth.uid() على الخادم
  }).select().single();
  if (error) throw error;
  return data as unknown as AudioResource;
}

export async function deleteAudioResource(id: string): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {error} = await authClient.from('audio_resources').delete().eq('id', id);
  if (error) throw error;
}

// ---------- أصوات افتراضية مدمجة (تُستخدم إذا لم تكن قاعدة البيانات متاحة) ----------

export const DEFAULT_AUDIO_RESOURCES: AudioResource[] = [
  {id: 'system-default', title: 'صوت النظام الافتراضي', kind: 'system', url: '', is_default: true, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'tone-short', title: 'نغمة إشعار قصيرة', kind: 'tone', url: 'builtin:soft', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'adhan-makkah', title: 'أذان الحرم المكي (فاروق حضراوي)', kind: 'adhan', url: '/sounds/adhan/adhan_hadrawi.ogg', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'adhan-madinah', title: 'أذان الحرم المدني', kind: 'adhan', url: '/sounds/adhan/adhan_madinah.ogg', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'silent', title: 'صامت', kind: 'system', url: 'builtin:silent', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
];

export function findAudioById(resources: AudioResource[], id: string): AudioResource | undefined {
  return resources.find(r => r.id === id);
}
