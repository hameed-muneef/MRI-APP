import {useCallback, useEffect, useState} from 'react';
import {BellRing, Clock3, ChevronLeft} from 'lucide-react';
import usePrayerTimes from '../usePrayerTimes';
import {sanitizePrayerLocation, type PrayerLocation} from '../prayer-location';
import {loadReminders} from '../notifications/prefs-store';
import {
  NATIVE_SCHEDULE_UPDATED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
} from '../notifications/native-prayer-scheduler';
import {formatRemaining, nextPrayer, upcomingReminders} from '../notifications/upcoming';
import {requestNotificationSection} from './notifications/NotificationSettings';
import type {Reminder} from '../notifications/types';
import type {View} from '../app-state';

const timeFmt = new Intl.DateTimeFormat('ar-EG', {hour: 'numeric', minute: '2-digit'});
const dayFmt = new Intl.DateTimeFormat('ar-EG', {weekday: 'short', day: 'numeric', month: 'short'});

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatReminderWhen(at: Date, now: Date, isSnoozed?: boolean): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayLabel = isSameLocalDay(at, now)
    ? 'اليوم'
    : isSameLocalDay(at, tomorrow)
      ? 'غدًا'
      : dayFmt.format(at);
  const remaining = formatRemaining(at.getTime() - now.getTime());
  return isSnoozed ? `مؤجل مؤقتًا · ${remaining}` : `${dayLabel} · ${remaining}`;
}

export default function HomeDashboard({
  prayers,
  prayerLocation,
  navigate,
}: {
  prayers: Record<string, string>;
  prayerLocation?: PrayerLocation;
  navigate: (view: View) => void;
}) {
  const located = usePrayerTimes(Boolean(prayerLocation), sanitizePrayerLocation(prayerLocation));
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refreshReminders = useCallback(() => {
    let active = true;
    void loadReminders()
      .then(result => {
        if (active) setReminders(result.reminders);
      })
      .catch(() => {
        if (active) setReminders([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cancelInitial = refreshReminders();
    const onChanged = () => {
      setNow(new Date());
      void loadReminders()
        .then(result => setReminders(result.reminders))
        .catch(() => {});
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onChanged);
    window.addEventListener('storage', onChanged);
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      cancelInitial();
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onChanged);
      window.removeEventListener('storage', onChanged);
      window.clearInterval(timer);
    };
  }, [refreshReminders]);

  const next = nextPrayer({...prayers, ...located.prayers}, now);
  const upcoming = reminders ? upcomingReminders(reminders, now, 3) : [];

  return (
    <section className="home-dashboard" aria-label="القادم اليوم">
      <button
        type="button"
        className="home-next-card home-next-card-prayer"
        onClick={() => {
          requestNotificationSection('prayer');
          navigate('settings');
        }}
      >
        <span className="home-next-icon" aria-hidden="true">
          <Clock3 size={21}/>
        </span>
        <span className="home-next-body">
          <span className="home-next-kicker">
            <small>الصلاة القادمة</small>
            {next && (
              <span className="home-next-countdown">
                {next.tomorrow ? `غدًا · ${formatRemaining(next.at.getTime() - now.getTime())}` : formatRemaining(next.at.getTime() - now.getTime())}
              </span>
            )}
          </span>
          {next ? (
            <span className="home-next-headline">
              <strong>{next.prayer}</strong>
              <span className="home-next-time" dir="ltr">{timeFmt.format(next.at)}</span>
            </span>
          ) : (
            <>
              <strong>لم تُضبط مواقيت الصلاة</strong>
              <small>اختر مدينتك من إعدادات الصلاة</small>
            </>
          )}
        </span>
        <ChevronLeft size={18} className="home-next-chevron" aria-hidden="true"/>
      </button>

      <button
        type="button"
        className="home-next-card home-next-card-reminders"
        onClick={() => {
          requestNotificationSection('reminders');
          navigate('settings');
        }}
      >
        <span className="home-next-icon" aria-hidden="true">
          <BellRing size={21}/>
        </span>
        <span className="home-next-body">
          <span className="home-next-kicker">
            <small>التذكيرات القادمة</small>
            {upcoming.length > 0 && (
              <span className="home-next-countdown">{upcoming.length} قادمة</span>
            )}
          </span>
          {reminders === null ? (
            <strong>جارٍ التحميل…</strong>
          ) : upcoming.length === 0 ? (
            <>
              <strong>لا توجد تذكيرات قادمة</strong>
              <small>اضغط لإضافة منبه أو اختيار قالب يومي</small>
            </>
          ) : (
            <ul className="home-upcoming-list">
              {upcoming.map(({reminder, at, isSnoozed}) => (
                <li key={reminder.id} className="home-upcoming-row">
                  <span className="home-upcoming-title-line">
                    <strong>{reminder.title}</strong>
                    <span className="home-next-time" dir="ltr">{timeFmt.format(at)}</span>
                  </span>
                  <small>{formatReminderWhen(at, now, isSnoozed)}</small>
                </li>
              ))}
            </ul>
          )}
        </span>
        <ChevronLeft size={18} className="home-next-chevron" aria-hidden="true"/>
      </button>
    </section>
  );
}
