// لوحة الصوت — مكتبة النغمات والتنبيهات والأذان بتصنيفاتها (أذان / تكبيرات / نغمات عامة) مع الاستيراد والحفظ المحلي.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Play, Square, Trash2, Upload} from 'lucide-react';
import {authClient} from '../../auth';
import {LOCAL_ONLY} from '../../config';
import {BUILTIN_SOUNDS, playBuiltInTone, previewSound, type SoundOption} from '../../notifications/builtin-sounds';
import {getAudioElement, playAudio, stopAudio} from '../../notifications/audio';
import {listAudioResources, uploadAudioResource} from '../../notifications/service';
import type {AudioResource, NotificationChannel} from '../../notifications/types';
import {
  getCustomAlarmUrl,
  setCustomAlarmUrl,
  setCustomSoundUrl,
} from '../../notifications/sound-selection';
import {
  CUSTOM_SOUNDS_CHANGED_EVENT,
  customSoundUrl,
  deleteCustomSound,
  isSupportedAudioFile,
  listAllCustomSounds,
  resolveSoundCategory,
  saveCustomLibrarySound,
  updateCustomSoundCategory,
  type CustomSoundCategory,
  type SoundSlot,
} from '../../sounds/custom-store';
import {BUNDLED_ADHAN_SOUNDS, EID_TAKBEERAT_SOUND} from '../../sounds/adhan-catalog';

const MAX_SIZE = 10 * 1024 * 1024;
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'داخل التطبيق فقط',
  system: 'إشعار على الجهاز فقط',
  both: 'داخل التطبيق + إشعار على الجهاز',
};

const CHANNEL_DESCRIPTIONS: Record<NotificationChannel, string> = {
  both: 'يظهر في جرس الإشعارات داخل التطبيق، ويصلك إشعار على الهاتف أو المتصفح.',
  system: 'يصلك إشعار على الهاتف أو المتصفح خارج التطبيق، دون إضافته لجرس الإشعارات بالداخل.',
  in_app: 'يظهر في جرس الإشعارات داخل التطبيق فقط أثناء فتحه (دون إشعار خارجي على الجهاز).',
};

export const SOUND_CATEGORY_LABELS: Record<CustomSoundCategory, string> = {
  adhan: 'أذان',
  takbeer: 'تكبيرات',
  general: 'نغمات عامة',
};

type SoundFilter = 'all' | CustomSoundCategory;

type CustomLibraryEntry = {
  id: string;
  slot: SoundSlot;
  title: string;
  category: CustomSoundCategory;
  url: string;
  source: 'local' | 'cloud';
};

export function channelLabel(channel: NotificationChannel): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export function channelDescription(channel: NotificationChannel): string {
  return CHANNEL_DESCRIPTIONS[channel] ?? '';
}

let cloudSounds: AudioResource[] = [];
let cloudLoading: Promise<void> | null = null;

export function useCloudSounds(): AudioResource[] {
  const [list, setList] = useState(cloudSounds);
  useEffect(() => {
    if (LOCAL_ONLY || !authClient) return;
    let active = true;
    cloudLoading ??= listAudioResources()
      .then(rows => { cloudSounds = rows.filter(row => row.kind === 'adhan' || row.kind === 'tone'); })
      .catch(() => { cloudLoading = null; });
    void cloudLoading.then(() => { if (active) setList(cloudSounds); });
    return () => { active = false; };
  }, []);
  return list;
}

function useLocalCustomLibrary(): {
  items: CustomLibraryEntry[];
  reload: () => Promise<void>;
} {
  const [items, setItems] = useState<CustomLibraryEntry[]>([]);
  const blobUrlsRef = useRef<string[]>([]);

  const revokeAll = () => {
    for (const url of blobUrlsRef.current) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    blobUrlsRef.current = [];
  };

  const reload = useCallback(async () => {
    const records = await listAllCustomSounds();
    revokeAll();
    const next: CustomLibraryEntry[] = [];
    for (const rec of records) {
      const url = customSoundUrl(rec);
      blobUrlsRef.current.push(url);
      if (rec.slot === 'alarm') {
        setCustomAlarmUrl(url);
      }
      setCustomSoundUrl(rec.slot, url);
      const id = rec.slot === 'alarm' ? 'custom:alarm' : rec.slot;
      if (rec.slot === 'alarm') {
        setCustomSoundUrl('custom:alarm', url);
      }
      next.push({
        id,
        slot: rec.slot,
        title: rec.name.replace(/\.[^.]+$/, '') || rec.name,
        category: resolveSoundCategory(rec),
        url,
        source: 'local',
      });
    }
    setItems(next);
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = () => { void reload(); };
    window.addEventListener(CUSTOM_SOUNDS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(CUSTOM_SOUNDS_CHANGED_EVENT, onChanged);
      revokeAll();
    };
  }, [reload]);

  return {items, reload};
}

export function SoundSelectField({value, onChange, allowNone = true}:
  {value: string | undefined; onChange: (id: string | undefined) => void; allowNone?: boolean}) {
  const cloud = useCloudSounds();
  const {items: localCustom} = useLocalCustomLibrary();
  const customAlarmUrl = getCustomAlarmUrl();

  const customAdhans = localCustom.filter(item => item.category === 'adhan' && item.id !== 'custom:alarm');
  const customTakbeers = localCustom.filter(item => item.category === 'takbeer' && item.id !== 'custom:alarm');
  const customGenerals = localCustom.filter(item => item.category === 'general' && item.id !== 'custom:alarm');
  const legacyAlarm = localCustom.find(item => item.id === 'custom:alarm');

  return (
    <select value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
      {allowNone && <option value="">الافتراضي</option>}
      <optgroup label="أذان">
        {BUNDLED_ADHAN_SOUNDS.map(sound => <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>)}
        {customAdhans.map(sound => <option key={sound.id} value={sound.id}>{sound.title} (مستورد)</option>)}
      </optgroup>
      <optgroup label="تكبيرات">
        <option value={EID_TAKBEERAT_SOUND.soundId}>{EID_TAKBEERAT_SOUND.name}</option>
        {customTakbeers.map(sound => <option key={sound.id} value={sound.id}>{sound.title} (مستورد)</option>)}
      </optgroup>
      <optgroup label="نغمات عامة">
        {BUILTIN_SOUNDS.map(sound => <option key={sound.id} value={sound.id}>{sound.title}</option>)}
        {customGenerals.map(sound => <option key={sound.id} value={sound.id}>{sound.title} (مستورد)</option>)}
        {(legacyAlarm || customAlarmUrl) && <option value="custom:alarm">{legacyAlarm ? `${legacyAlarm.title} (مستورد)` : 'نغمة خارجية (ملف من جهازك)'}</option>}
      </optgroup>
      {cloud.length > 0 && <optgroup label="الأذان والنغمات المعتمدة">{cloud.map(sound => <option key={sound.id} value={sound.id}>{sound.title}</option>)}</optgroup>}
    </select>
  );
}

export default function SoundPanel({notify}: {notify: (message: string) => void}) {
  const [filter, setFilter] = useState<SoundFilter>('all');
  const [importCategory, setImportCategory] = useState<CustomSoundCategory>('general');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const endedCleanupRef = useRef<(() => void) | null>(null);
  const toneTimerRef = useRef<number | null>(null);

  const cloud = useCloudSounds();
  const {items: localCustom, reload} = useLocalCustomLibrary();

  const stop = useCallback(() => {
    if (toneTimerRef.current !== null) {
      window.clearTimeout(toneTimerRef.current);
      toneTimerRef.current = null;
    }
    if (endedCleanupRef.current) {
      endedCleanupRef.current();
      endedCleanupRef.current = null;
    }
    stopAudio();
    setPlaying(null);
  }, []);

  const play = (sound: SoundOption) => {
    stop();
    if (sound.kind === 'silent') {
      setMessage('صامت — لا صوت.');
      return;
    }
    setPlaying(sound.id);
    setMessage('');
    if (sound.url) {
      playAudio(sound.url, () => {
        playBuiltInTone('builtin:chime');
        setPlaying(null);
        setMessage('تعذر تشغيل ملف الصوت؛ شُغِّلت نغمة تنبيه بديلة.');
      });
      const el = getAudioElement();
      const onEnded = () => {
        setPlaying(current => (current === sound.id ? null : current));
        endedCleanupRef.current = null;
      };
      el.addEventListener('ended', onEnded, {once: true});
      endedCleanupRef.current = () => el.removeEventListener('ended', onEnded);
    } else {
      previewSound(sound);
      toneTimerRef.current = window.setTimeout(() => {
        setPlaying(current => (current === sound.id ? null : current));
        toneTimerRef.current = null;
      }, 2500);
    }
  };

  const handleFilterChange = (nextFilter: SoundFilter) => {
    setFilter(nextFilter);
    if (nextFilter !== 'all') {
      setImportCategory(nextFilter);
    }
  };

  const upload = async (file: File) => {
    if (!isSupportedAudioFile(file)) {
      setMessage('صيغة الملف غير مدعومة. الصيغ المدعومة: MP3، WAV، OGG، M4A، AAC، WEBM، FLAC.');
      return;
    }
    if (file.size === 0) {
      setMessage('الملف الصوتي فارغ أو غير صالح.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setMessage('حجم الملف أكبر من المسموح (10 ميغابايت).');
      return;
    }
    setBusy(true);
    setMessage('');
    const title = (file.name.replace(/\.[^.]+$/, '') || 'صوت مخصص').slice(0, 60);
    try {
      if (!LOCAL_ONLY && authClient) {
        await uploadAudioResource(file, title);
      }
      const saved = await saveCustomLibrarySound(file, importCategory);
      await reload();
      const categoryName = SOUND_CATEGORY_LABELS[importCategory];
      setMessage(`تم استيراد «${title}» وتصنيفه تحت «${categoryName}» وحفظه محليًا.`);
      notify(`تم استيراد «${title}» (${categoryName})`);
      if (filter !== 'all' && filter !== importCategory) {
        setFilter(importCategory);
      }
      void saved;
    } catch (error) {
      setMessage(`تعذر استيراد الصوت: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    } finally {
      setBusy(false);
    }
  };

  const changeCategory = async (item: CustomLibraryEntry, nextCategory: CustomSoundCategory) => {
    try {
      await updateCustomSoundCategory(item.slot, nextCategory);
      await reload();
      setMessage(`تم نقل «${item.title}» إلى تصنيف «${SOUND_CATEGORY_LABELS[nextCategory]}».`);
      notify(`تم تحديث تصنيف «${item.title}»`);
    } catch {
      setMessage('تعذر تحديث التصنيف.');
    }
  };

  const removeCustom = async (item: CustomLibraryEntry) => {
    if (playing === item.id) stop();
    await deleteCustomSound(item.slot);
    setCustomSoundUrl(item.id, undefined);
    if (item.slot === 'alarm') setCustomAlarmUrl(undefined);
    await reload();
    setMessage(`تم حذف «${item.title}».`);
    notify(`تم حذف «${item.title}»`);
  };

  useEffect(() => () => { stop(); }, [stop]);

  const counts = useMemo(() => {
    const adhan = BUNDLED_ADHAN_SOUNDS.length
      + cloud.filter(c => c.kind === 'adhan').length
      + localCustom.filter(c => c.category === 'adhan').length;
    const takbeer = 1 + localCustom.filter(c => c.category === 'takbeer').length;
    const general = BUILTIN_SOUNDS.length
      + cloud.filter(c => c.kind !== 'adhan').length
      + localCustom.filter(c => c.category === 'general').length;
    return {all: adhan + takbeer + general, adhan, takbeer, general};
  }, [cloud, localCustom]);

  const showAdhan = filter === 'all' || filter === 'adhan';
  const showTakbeer = filter === 'all' || filter === 'takbeer';
  const showGeneral = filter === 'all' || filter === 'general';

  const visibleCustom = localCustom.filter(item => filter === 'all' || item.category === filter);
  const visibleCloud = cloud.filter(item => {
    const cat: CustomSoundCategory = item.kind === 'adhan' ? 'adhan' : 'general';
    return filter === 'all' || cat === filter;
  });

  return (
    <div className="notif-sound-panel">
      <div className="notif-sound-filters" role="tablist" aria-label="تصنيف النغمات والأصوات">
        {(
          [
            {id: 'all', label: `الكل (${counts.all})`},
            {id: 'adhan', label: `أذان (${counts.adhan})`},
            {id: 'takbeer', label: `تكبيرات (${counts.takbeer})`},
            {id: 'general', label: `نغمات عامة (${counts.general})`},
          ] as {id: SoundFilter; label: string}[]
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={filter === tab.id ? 'active' : ''}
            onClick={() => handleFilterChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="notif-sound-import-box">
        <label className="notif-sound-cat-field">
          <span>تصنيف الصوت عند الاستيراد</span>
          <select
            aria-label="تصنيف الصوت المستورد"
            value={importCategory}
            disabled={busy}
            onChange={event => setImportCategory(event.target.value as CustomSoundCategory)}
          >
            <option value="adhan">أذان</option>
            <option value="takbeer">تكبيرات</option>
            <option value="general">نغمات عامة</option>
          </select>
        </label>
        <label className="notif-upload">
          <Upload size={16}/> {busy ? 'جارٍ الاستيراد…' : 'استيراد نغمة أو صوت (حتى 10 ميغابايت)'}
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.webm,.flac"
            disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        </label>
      </div>

      {message && <p role="status" className="muted small">{message}</p>}
      {playing && (
        <div className="notif-stop-bar">
          <button type="button" className="primary" onClick={stop}><Square size={15}/> إيقاف الصوت</button>
        </div>
      )}

      <ul className="notif-sound-list">
        {showAdhan && BUNDLED_ADHAN_SOUNDS.map(sound => (
          <li key={sound.soundId}>
            <div className="notif-sound-main">
              <strong>{sound.name}</strong>
              <small>أذان · مدمج</small>
            </div>
            <button
              type="button"
              className="soft-btn notif-play"
              onClick={() => playing === sound.soundId ? stop() : play({id: sound.soundId, title: sound.name, kind: 'adhan', url: sound.url})}
              aria-label={playing === sound.soundId ? `إيقاف ${sound.name}` : `تشغيل ${sound.name}`}
            >
              {playing === sound.soundId ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        ))}

        {showTakbeer && (
          <li key={EID_TAKBEERAT_SOUND.soundId}>
            <div className="notif-sound-main">
              <strong>{EID_TAKBEERAT_SOUND.name}</strong>
              <small>تكبيرات · مدمج</small>
            </div>
            <button
              type="button"
              className="soft-btn notif-play"
              onClick={() => playing === EID_TAKBEERAT_SOUND.soundId ? stop() : play({id: EID_TAKBEERAT_SOUND.soundId, title: EID_TAKBEERAT_SOUND.name, kind: 'adhan', url: EID_TAKBEERAT_SOUND.url})}
              aria-label={playing === EID_TAKBEERAT_SOUND.soundId ? `إيقاف ${EID_TAKBEERAT_SOUND.name}` : `تشغيل ${EID_TAKBEERAT_SOUND.name}`}
            >
              {playing === EID_TAKBEERAT_SOUND.soundId ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        )}

        {showGeneral && BUILTIN_SOUNDS.map(sound => (
          <li key={sound.id}>
            <div className="notif-sound-main">
              <strong>{sound.title}</strong>
              <small>نغمات عامة · {sound.description}</small>
            </div>
            {sound.kind === 'silent'
              ? <span className="muted small">—</span>
              : <button
                  type="button"
                  className="soft-btn notif-play"
                  onClick={() => playing === sound.id ? stop() : play(sound)}
                  aria-label={playing === sound.id ? `إيقاف ${sound.title}` : `تشغيل ${sound.title}`}
                >
                  {playing === sound.id ? <Square size={15}/> : <Play size={15}/>}
                </button>}
          </li>
        ))}

        {visibleCloud.map(sound => (
          <li key={sound.id}>
            <div className="notif-sound-main">
              <strong>{sound.title}</strong>
              <small>{sound.kind === 'adhan' ? 'أذان · معتمد' : 'نغمات عامة · معتمد'}</small>
            </div>
            <button
              type="button"
              className="soft-btn notif-play"
              onClick={() => playing === sound.id ? stop() : play(sound)}
              aria-label={playing === sound.id ? `إيقاف ${sound.title}` : `تشغيل ${sound.title}`}
            >
              {playing === sound.id ? <Square size={15}/> : <Play size={15}/>}
            </button>
          </li>
        ))}

        {visibleCustom.map(item => (
          <li key={item.slot}>
            <div className="notif-sound-main">
              <strong>{item.title}</strong>
              <small>{SOUND_CATEGORY_LABELS[item.category]} · صوت مستورد (محفوظ على الجهاز)</small>
            </div>
            <div className="notif-sound-actions">
              <select
                className="notif-sound-cat-select"
                aria-label={`تصنيف ${item.title}`}
                value={item.category}
                onChange={event => void changeCategory(item, event.target.value as CustomSoundCategory)}
              >
                <option value="adhan">أذان</option>
                <option value="takbeer">تكبيرات</option>
                <option value="general">نغمات عامة</option>
              </select>
              <button
                type="button"
                className="soft-btn notif-play"
                onClick={() => playing === item.id ? stop() : play({id: item.id, title: item.title, kind: 'custom', url: item.url})}
                aria-label={playing === item.id ? `إيقاف ${item.title}` : `تشغيل ${item.title}`}
              >
                {playing === item.id ? <Square size={15}/> : <Play size={15}/>}
              </button>
              <button
                type="button"
                className="soft-btn notif-play"
                onClick={() => void removeCustom(item)}
                aria-label={`حذف ${item.title}`}
              >
                <Trash2 size={15}/>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
