// زر إيقاف الصوت داخل التطبيق: يظهر فقط أثناء تشغيل تنبيه أو أذان، ويوقفه بضغطة واحدة.
import {useEffect, useState} from 'react';
import {Square} from 'lucide-react';
import {getAudioElement, stopAudio} from './audio';

type AudioLike = Pick<HTMLAudioElement, 'paused' | 'ended' | 'currentSrc'>;

/** هل الصوت الجاري تنبيه حقيقي يمكن إيقافه؟ (لا الملف الصامت ولا المتوقف) */
export function isStoppableAudio(el: AudioLike): boolean {
  if (el.paused || el.ended) return false;
  return Boolean(el.currentSrc) && !el.currentSrc.startsWith('data:audio/wav');
}

export default function SoundStopButton() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = getAudioElement();
    const sync = () => setActive(isStoppableAudio(el));
    const events = ['playing', 'pause', 'ended', 'emptied', 'error'] as const;
    for (const ev of events) el.addEventListener(ev, sync);
    sync();
    return () => { for (const ev of events) el.removeEventListener(ev, sync); };
  }, []);
  if (!active) return null;
  return (
    <button type="button" className="live-sound-stop" onClick={() => { stopAudio(); setActive(false); }}>
      <Square size={16} aria-hidden="true"/> إيقاف الصوت
    </button>
  );
}
