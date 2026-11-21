// مشغّل HLS.js لرابط بث رسمي. يُستورد hls.js كسولًا (chunk مستقل)
// عند أي خطأ قاتل نبلّغ المكوّن الأعلى ليعود إلى الصفحة الرسمية داخل إطار.

import {useEffect, useRef, useState} from 'react';
import {Loader2} from 'lucide-react';

type Props = {
  src: string;
  /** عند تشغيل الصوت عبر مشغّل الخلفية نكتم صوت الفيديو لتفادي الازدواج. */
  forceMuted?: boolean;
  /** يُستدعى عند تغيير حالة الصوت/التشغيل لمزامنة التمرير للخلفية تلقائيًا عند مغادرة الصفحة. */
  onAudibleChange?: (audible: boolean) => void;
  /** خطأ قاتل (تعذر الشبكة/الرابط منتهي) — يعود العرض إلى الصفحة الرسمية */
  onFatalError: () => void;
};

export default function HaramainHls({src, forceMuted = false, onAudibleChange, onFatalError}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const failedRef = useRef(false);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const onAudibleRef = useRef(onAudibleChange);
  onAudibleRef.current = onAudibleChange;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (forceMuted) {
      video.muted = true;
    }
  }, [forceMuted]);

  useEffect(() => {
    failedRef.current = false;
    setState('loading');
    const video = videoRef.current;
    if (!video) return;
    let destroy: (() => void) | undefined;
    let disposed = false;

    const notifyAudible = () => {
      const audible = !video.paused && !video.muted && !forceMuted;
      onAudibleRef.current?.(audible);
    };

    void import('hls.js').then(({default: Hls}) => {
      if (disposed || !videoRef.current) return;
      if (!Hls.isSupported()) {
        video.src = src;
      } else {
        const hls = new Hls({enableWorker: true, lowLatencyMode: false, backBufferLength: 90});
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || failedRef.current) return;
          failedRef.current = true;
          setState('error');
          onFatalErrorRef.current();
        });
        destroy = () => {hls.destroy()};
      }
      video.addEventListener('playing', onPlaying);
      video.addEventListener('pause', notifyAudible);
      video.addEventListener('volumechange', notifyAudible);
    }).catch(() => {
      if (!failedRef.current) {
        failedRef.current = true;
        setState('error');
        onFatalErrorRef.current();
      }
    });

    function onPlaying() {
      setState('playing');
      notifyAudible();
    }

    return () => {
      disposed = true;
      videoRef.current?.removeEventListener('playing', onPlaying);
      videoRef.current?.removeEventListener('pause', notifyAudible);
      videoRef.current?.removeEventListener('volumechange', notifyAudible);
      destroy?.();
    };
  }, [src, forceMuted]);

  if (state === 'error') return null;

  return <div className="haramain-hls">
    <video ref={videoRef} className="haramain-video" autoPlay playsInline controls muted/>
    {state === 'loading' && <div className="haramain-loading" role="status"><Loader2 size={22} className="spin"/>جارٍ تحميل البث…</div>}
  </div>;
}
