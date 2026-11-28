// محرك الإشعارات الحي: يشغّل المراقب الزمني ويوصل الأحداث المستحقة بصوتها المختار.
// يعمل فقط أثناء فتح التطبيق (قيد المتصفح)، وهو موثق في إعدادات الإشعارات.

import {useEffect, useRef} from 'react';
import {filterMasteryReminders} from '../quran-mastery/reminders';
import {loadMasteryState} from '../quran-mastery/storage';
import {useCentralLocation} from '../hooks/useCentralLocation';
import usePrayerTimes from '../usePrayerTimes';
import {sanitizePrayerLocation, type PrayerLocation} from '../prayer-location';
import {useDueWatcher, type DueItem} from './engine';
import {loadPrefs, loadReminders} from './prefs-store';
import {listAudioResources} from './service';
import {playAudio, stopAudio} from './audio';
import {playBuiltInTone} from './builtin-sounds';
import {deliverDeviceNotification, deliverReminder, recordNotification} from './delivery';
import {checkPermissions, isNativePlatform, scheduleNativePersonalReminders, NOTIFICATIONS_CHANGED_EVENT} from './native-prayer-scheduler';
import {soundPlanForPrayer, soundPlanForReminder, soundPlanForTask, type SoundPlan} from './sound-selection';
import {resolvePrayerAdhan} from '../sounds/adhan-catalog';
import {resolveSchedulingLocation} from './scheduling-location';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  getTaskNotificationSettings,
  type AudioResource,
  type NotificationPreference,
  type Reminder,
} from './types';
import type {Task, TaskSchedule} from '../app-state';
import type {DayPlan} from '../DayPlanner';
import type {Goal} from '../goal-plan';
import type {MemorizationPassage} from '../quran/types';
import type {TaskScheduleContext} from './task-planner';
import SoundStopButton from './SoundStopButton';

const REFRESH_MS = 60000;
// A single browser tab can briefly have two watcher deliveries during React
// remounts or visibility changes. Keep the audio claim outside the component
// so a remount cannot play the same prayer twice within the same short window.
const recentAudioClaims = new Map<string, number>();
function claimAudio(key: string, now = Date.now()): boolean {
  const previous = recentAudioClaims.get(key);
  if (previous && now - previous < 15_000) return false;
  // Coordinate open tabs as well as remounts in one tab. localStorage is
  // deliberately best-effort: if it is unavailable, the in-memory guard
  // above still prevents the common React remount duplicate.
  try {
    const storageKey = `rabbani-audio-claim:${key}`;
    const stored = Number(window.localStorage.getItem(storageKey) ?? 0);
    if (stored && now - stored < 15_000) return false;
    window.localStorage.setItem(storageKey, String(now));
    const confirmed = Number(window.localStorage.getItem(storageKey) ?? 0);
    if (confirmed !== now) return false;
  } catch {
    // Private browsing or blocked storage: continue with the local guard.
  }
  recentAudioClaims.set(key, now);
  for (const [oldKey, claimedAt] of recentAudioClaims) {
    if (now - claimedAt >= 15_000) recentAudioClaims.delete(oldKey);
  }
  return true;
}

function play(plan: SoundPlan, fallbackToneId = 'builtin:soft') {
  stopAudio();
  if (plan.mode === 'tone') playBuiltInTone(plan.id);
  else if (plan.mode === 'file') playAudio(plan.url, () => playBuiltInTone(fallbackToneId));
}

type Props = {
  prayers: Record<string, string>;
  prayerLocation?: PrayerLocation;
  passages?: MemorizationPassage[];
  tasks?: Task[];
  goals?: Goal[];
  taskSchedules?: Record<string, TaskSchedule>;
  dayPlan?: DayPlan;
  onToast: (message: string) => void;
};

export default function LiveNotifications({prayers, prayerLocation, passages, tasks, goals, taskSchedules, dayPlan, onToast}: Props) {
  // الموقع المركزي المشترك: إن وُجد موقع للجهاز أو موقع يدوي تُحسب المواقيت منه دون طلب إضافي.
  const sharedLocation = useCentralLocation();
  const located = usePrayerTimes(Boolean(prayerLocation) || Boolean(sharedLocation.coords), sanitizePrayerLocation(prayerLocation));
  const mergedPrayers = {...prayers, ...located.prayers};
  const taskContext: TaskScheduleContext | undefined = tasks && taskSchedules
    ? {tasks, goals: goals ?? [], taskSchedules, dayPlan, prayers: mergedPrayers}
    : undefined;
  const state = useRef({
    reminders: [] as Reminder[],
    prefs: DEFAULT_NOTIFICATION_PREFERENCE as NotificationPreference,
    library: [] as AudioResource[],
    prayers: {} as Record<string, string>,
    passages: [] as MemorizationPassage[],
    taskContext: undefined as TaskScheduleContext | undefined,
    nativeSystemActive: false,
    ready: false,
  });
  state.current.prayers = mergedPrayers;
  state.current.passages = passages ?? [];
  state.current.taskContext = taskContext;

  useEffect(() => { state.current.passages = passages ?? []; }, [passages]);
  useEffect(() => { state.current.taskContext = taskContext; }, [tasks, goals, taskSchedules, dayPlan, prayers, located.prayers]);

  useEffect(() => {
    let active = true;
    const native = isNativePlatform();
    let nativeSignature='';
    let refreshing=false;
    let refreshAgain=false;
    const refresh = async () => {
      if(refreshing){refreshAgain=true;return;}
      refreshing=true;
      try{
      const [prefs, reminders, library, perms] = await Promise.all([
        loadPrefs().catch(() => null),
        loadReminders().catch(() => null),
        listAudioResources().catch(() => null),
        native ? checkPermissions().catch(() => null) : Promise.resolve(null),
      ]);
      if (!active) return;
      if(native&&prefs&&reminders){const learning=loadMasteryState();const signature=JSON.stringify([reminders.reminders,prefs.prefs,learning.schedules,learning.plans,perms,new Date().toDateString()]);if(signature!==nativeSignature){await scheduleNativePersonalReminders(reminders.reminders,prefs.prefs);nativeSignature=signature;}}
      if (prefs) state.current.prefs = prefs.prefs;
      if (reminders) state.current.reminders = filterMasteryReminders(reminders.reminders,loadMasteryState());
      if (library) state.current.library = library;
      state.current.nativeSystemActive = Boolean(native && perms?.display === 'granted');
      state.current.ready = true;
      }finally{refreshing=false;if(active&&refreshAgain){refreshAgain=false;void refresh();}}
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => {if (document.visibilityState === 'visible') void refresh()};
    const onChanged = () => {void refresh()};
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener('rabbani-mastery-changed',onChanged);
    window.addEventListener('storage',onChanged);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener('rabbani-mastery-changed',onChanged);
      window.removeEventListener('storage',onChanged);
    };
  }, []);

  useDueWatcher(
    () => state.current.ready ? {
      reminders: state.current.reminders,
      prayers: state.current.prayers,
      prefs: state.current.prefs,
      passages: state.current.passages,
      taskContext: state.current.taskContext,
    } : null,
    (item: DueItem) => {
      const {prefs, library, nativeSystemActive} = state.current;
      if (item.kind === 'reminder') {
        const requested = prefs.reminder_settings?.default_channel ?? 'both';
        const channel = requested === 'system' ? 'system' : 'both';
        const handledNatively = nativeSystemActive;
        if (!handledNatively) {
          play(soundPlanForReminder(item.reminder.sound_id, prefs, library));
          void deliverReminder(item.reminder, channel);
        } else if (channel === 'both') {
          void recordNotification('reminder', item.reminder.title, item.reminder.description || 'تذكير مخصص', 'settings');
        }
        if (channel === 'both') onToast(item.reminder.title);
        return;
      }
      if (item.kind === 'task') {
        if (!claimAudio(item.key)) return;
        const taskSettings = getTaskNotificationSettings(prefs);
        const requested = taskSettings.channel ?? 'both';
        const channel = requested === 'system' ? 'system' : 'both';
        const handledNatively = nativeSystemActive;
        if (!handledNatively) {
          play(soundPlanForTask(taskSettings.sound_id, prefs, library));
          void deliverDeviceNotification(item.event.title, {
            body: item.event.body,
            tag: item.key,
            requireInteraction: true,
            link: 'tasks',
            soundId: taskSettings.sound_id,
            silent: taskSettings.sound_id === 'builtin:silent',
          });
        }
        if (channel === 'both') {
          onToast(item.event.title);
          void recordNotification('task', item.event.title, item.event.body, 'tasks');
        }
        return;
      }
      if (item.kind === 'review') {
        const passage = item.passage;
        const surahName = passage.surah ? `سورة ${passage.surah}` : 'مقطع';
        const ayahRange = passage.ayahStart && passage.ayahEnd ? ` (آية ${passage.ayahStart}–${passage.ayahEnd})` : '';
        const title = `مراجعة حفظ — ${surahName}${ayahRange}`;
        const body = 'حان وقت مراجعة مقطعك المحفوظ. «وَذَكِّرْ فَإِنَّ الذِّكْرَىٰ تَنفَعُ الْمُؤْمِنِينَ»';
        const requested = prefs.reminder_settings?.default_channel ?? 'both';
        const channel = requested === 'system' ? 'system' : 'both';
        const handledNatively = nativeSystemActive;
        if (!handledNatively) {
          play(soundPlanForReminder(prefs.reminder_settings?.default_sound_id, prefs, library));
          void deliverDeviceNotification(title, {
            body,
            tag: item.key,
            requireInteraction: true,
            soundId: prefs.reminder_settings?.default_sound_id,
            silent: prefs.reminder_settings?.default_sound_id === 'builtin:silent',
          });
        }
        if (channel === 'both') {
          onToast(title);
          void recordNotification('reminder', title, body, 'settings');
        }
        return;
      }
      const {event} = item;
      if (!claimAudio(item.key)) return;
      const requested = prefs.prayer_settings?.[event.prayer]?.channel ?? 'both';
      const channel = requested === 'system' ? 'system' : 'both';
      const setting = prefs.prayer_settings?.[event.prayer];
      const hasNativeSchedule = Boolean(resolveSchedulingLocation(prayerLocation));
      const handledNatively = nativeSystemActive && hasNativeSchedule && Boolean(setting?.enabled) && setting?.adhan_type !== 'silent';
      if (!handledNatively) {
        let plan = soundPlanForPrayer(event, prefs, library);
        // Never substitute a short chime for the selected Adhan recording on prayer arrival.
        if (event.kind === 'at' && setting?.adhan_type !== 'silent' && plan.mode === 'tone' && plan.id !== 'builtin:silent') {
          const adhan = resolvePrayerAdhan(setting?.sound_id);
          plan = {mode: 'file', id: adhan.soundId, url: adhan.url};
        }
        play(plan, event.kind === 'at' ? 'builtin:chime' : 'builtin:soft');
        void deliverDeviceNotification(event.title, {
          body: event.body,
          tag: event.key,
          requireInteraction: event.kind === 'at',
          soundId: setting?.sound_id,
          silent: item.silent || plan.mode === 'none',
        });
      }
      if (channel === 'both') {
        onToast(event.title);
        void recordNotification('prayer', event.title, event.body, 'settings');
      }
    },
  );
  return <SoundStopButton/>;
    }
