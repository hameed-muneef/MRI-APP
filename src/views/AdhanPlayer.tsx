// مشغّل أذان: تشغيل الأذان الافتراضي المختار من لوحة الأصوات، أو تكبيرات العيد،
// أو ملف أذان خارجي من جهاز المستخدم. لا يغيّر المؤذن الافتراضي — ذلك من لوحة الأصوات.
import {useEffect, useRef, useState} from 'react';
import {Play, Square, Volume2, Trash2} from 'lucide-react';
import {
  saveCustomAdhanEntry,
  listCustomAdhans,
  deleteCustomSound,
  customSoundUrl,
  type SoundSlot,
} from '../sounds/custom-store';
import {
  BUNDLED_ADHAN_SOUNDS,
  EID_TAKBEERAT_SOUND,
  getSelectedDefaultAdhanId,
} from '../sounds/adhan-catalog';
import {NOTIFICATIONS_CHANGED_EVENT} from '../notifications/native-prayer-scheduler';
import {playBuiltInTone} from '../notifications/builtin-sounds';
import {loadLocalAudioObjectUrlForWebView, resolveAudioUrlForWeb} from '../audio/url-resolver';

type ExternalAdhanItem = {slot: SoundSlot; name: string; url: string};

const EXTERNAL_SLOT_KEY = 'rabbani-external-adhan-slot';

export default function AdhanPlayer({notify}: {notify: (text: string) => void}) {
  const [selected, setSelected] = useState<'default' | 'external' | string>('default');
  const [defaultAdhanId, setDefaultAdhanId] = useState<string>(() => getSelectedDefaultAdhanId());
  const [externals, setExternals] = useState<ExternalAdhanItem[]>([]);
  const [selectedExternalSlot, setSelectedExternalSlot] = useState<SoundSlot | ''>(() => {
    try { return (localStorage.getItem(EXTERNAL_SLOT_KEY) as SoundSlot) || ''; } catch { return ''; }
  });
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const playBlobRevokeRef = useRef<(() => void) | null>(null);
  const playTokenRef = useRef(0);

  const reloadExternals = async (preferredSlot?: SoundSlot) => {
    for (const u of objectUrlsRef.current) {
      try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    }
    objectUrlsRef.current = [];
    const list = await listCustomAdhans();
    const mapped: ExternalAdhanItem[] = list.map(rec => {
      const url = customSoundUrl(rec);
      objectUrlsRef.current.push(url);
      return {slot: rec.slot, name: rec.name, url};
    });
    setExternals(mapped);
    if (preferredSlot && mapped.some(x => x.slot === preferredSlot)) {
      setSelectedExternalSlot(preferredSlot);
      try { localStorage.setItem(EXTERNAL_SLOT_KEY, preferredSlot); } catch { /* ignore */ }
    } else if (mapped.length > 0 && !mapped.some(x => x.slot === selectedExternalSlot)) {
      setSelectedExternalSlot(mapped[0].slot);
      try { localStorage.setItem(EXTERNAL_SLOT_KEY, mapped[0].slot); } catch { /* ignore */ }
    } else if (mapped.length === 0) {
      setSelectedExternalSlot('');
      try { localStorage.removeItem(EXTERNAL_SLOT_KEY); } catch { /* ignore */ }
    }
  };

  // يتبع المؤذن الافتراضي المختار في لوحة الأصوات عند تغيّره.
  useEffect(() => {
    const syncDefault = () => setDefaultAdhanId(getSelectedDefaultAdhanId());
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, syncDefault);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, syncDefault);
  }, []);

  useEffect(() => {
    if (selected === 'external') {
      void reloadExternals();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => () => {
    playTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (playBlobRevokeRef.current) {
      try { playBlobRevokeRef.current(); } catch { /* ignore */ }
      playBlobRevokeRef.current = null;
    }
    for (const u of objectUrlsRef.current) {
      try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    }
    objectUrlsRef.current = [];
  }, []);

  const defaultSound = BUNDLED_ADHAN_SOUNDS.find(s => s.id === defaultAdhanId) ?? BUNDLED_ADHAN_SOUNDS[0];
  const activeExternal = externals.find(e => e.slot === selectedExternalSlot) ?? externals[0] ?? null;
  const playUrl =
    selected === 'external'
      ? (activeExternal?.url ?? null)
      : selected === 'default'
        ? defaultSound.url
        : EID_TAKBEERAT_SOUND.url;

  const stopPlayback = () => {
    playTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (playBlobRevokeRef.current) {
      try { playBlobRevokeRef.current(); } catch { /* ignore */ }
      playBlobRevokeRef.current = null;
    }
    setPlaying(false);
  };

  const toggle = (overrideUrl?: string) => {
    if (playing && !overrideUrl) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const rawTarget = overrideUrl ?? playUrl;
    const targetUrl = resolveAudioUrlForWeb(rawTarget);
    if (!targetUrl) {
      notify('اختر أو أضف ملف أذان خارجي أولًا.');
      return;
    }
    const token = ++playTokenRef.current;
    const audio = new Audio();
    audioRef.current = audio;
    setPlaying(true);
    let handledError = false;
    const onUnavailable = () => {
      if (handledError || token !== playTokenRef.current) return;
      handledError = true;
      setPlaying(false);
      audioRef.current = null;
      if (playBlobRevokeRef.current) {
        try { playBlobRevokeRef.current(); } catch { /* ignore */ }
        playBlobRevokeRef.current = null;
      }
      playBuiltInTone('builtin:chime');
      notify('ملف الأذان غير متوفر في هذه الحزمة؛ شُغِّلت نغمة بديلة (يمكنك اختيار ملف من جهازك).');
    };
    audio.addEventListener('ended', () => {
      if (token !== playTokenRef.current) return;
      setPlaying(false);
      audioRef.current = null;
      if (playBlobRevokeRef.current) {
        try { playBlobRevokeRef.current(); } catch { /* ignore */ }
        playBlobRevokeRef.current = null;
      }
    }, {once: true});
    audio.addEventListener('error', onUnavailable, {once: true});

    void loadLocalAudioObjectUrlForWebView(targetUrl).then(localBlob => {
      if (token !== playTokenRef.current) {
        localBlob?.revoke();
        return;
      }
      if (localBlob) {
        playBlobRevokeRef.current = localBlob.revoke;
        audio.src = localBlob.url;
      } else {
        audio.src = targetUrl;
      }
      audio.play().catch(onUnavailable);
    }).catch(() => {
      if (token !== playTokenRef.current) return;
      audio.src = targetUrl;
      audio.play().catch(onUnavailable);
    });
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const slot = await saveCustomAdhanEntry(file);
      await reloadExternals(slot);
      notify(`تم حفظ الأذان الخارجي: ${file.name}`);
    } catch {
      notify('تعذر حفظ الملف.');
    }
  };

  const removeExternal = async (slot: SoundSlot) => {
    stopPlayback();
    await deleteCustomSound(slot);
    await reloadExternals();
    notify('تم حذف ملف الأذان الخارجي.');
  };

  return (
    <section className="panel adhan-player" dir="rtl">
      <h3><Volume2 size={18}/> تشغيل الأذان الآن</h3>
      <p className="muted">استمع للأذان الافتراضي أو لتكبيرات العيد، أو شغّل ملف أذان من جهازك.</p>
      <div className="adhan-row">
        <select
          className="adhan-select"
          value={selected}
          onChange={event => {
            stopPlayback();
            setSelected(event.target.value);
          }}
          aria-label="ما الذي تريد تشغيله"
        >
          <option value="default">الأذان الافتراضي ({defaultSound.name})</option>
          <option value={EID_TAKBEERAT_SOUND.id}>{EID_TAKBEERAT_SOUND.name}</option>
          <option value="external">أذان خارجي (ملفات من جهازك)</option>
        </select>
        <button type="button" className={playing ? 'soft-btn selected' : 'primary'} onClick={() => toggle()} aria-pressed={playing}>
          {playing ? <Square size={16}/> : <Play size={16}/>} {playing ? 'إيقاف' : 'تشغيل الأذان'}
        </button>
      </div>
      {selected === 'external' && (
        <div className="adhan-external">
          {externals.map(item => (
            <div className="adhan-ext-row" key={item.slot}>
              <button
                type="button"
                className={activeExternal?.slot === item.slot ? 'soft-btn adhan-ext-row-main selected' : 'soft-btn adhan-ext-row-main'}
                onClick={() => {
                  setSelectedExternalSlot(item.slot);
                  try { localStorage.setItem(EXTERNAL_SLOT_KEY, item.slot); } catch { /* ignore */ }
                  toggle(item.url);
                }}
              >
                <Play size={14}/> <span>{item.name}</span>
              </button>
              <button type="button" className="soft-btn" onClick={() => void removeExternal(item.slot)} aria-label={`حذف ${item.name}`}>
                <Trash2 size={15}/> حذف
              </button>
            </div>
          ))}
          <label className="adhan-file-label">
            {externals.length > 0 ? 'إضافة ملف أذان آخر (MP3/OGG/WAV)' : 'اختر ملف صوتي (MP3/OGG/WAV)'}
            <input
              ref={pickerRef}
              type="file"
              accept="audio/*"
              onChange={event => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                void onFile(file);
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}
