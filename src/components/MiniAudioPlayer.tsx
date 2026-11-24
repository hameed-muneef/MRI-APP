import { useEffect } from 'react';
import { BookOpen, Flower2, Loader2, Pause, Play, Radio, SkipBack, SkipForward, X } from 'lucide-react';
import { backgroundAudio, formatAudioClock } from '../audio/background-player';
import { useBackgroundAudio } from '../audio/useBackgroundAudio';
import type { AudioCategory } from '../audio/types';

interface MiniAudioPlayerProps {
  onOpenCategory: (category: AudioCategory) => void;
}

function CategoryIcon({ category }: { category: AudioCategory }) {
  if (category === 'azkar') return <Flower2 size={18} aria-hidden="true" />;
  if (category === 'haramain') return <Radio size={18} aria-hidden="true" />;
  return <BookOpen size={18} aria-hidden="true" />;
}

export default function MiniAudioPlayer({ onOpenCategory }: MiniAudioPlayerProps) {
  const { status, category, queue, currentIndex, currentTrack, currentTime, duration, error } = useBackgroundAudio();
  const visible = status !== 'idle' && Boolean(currentTrack);

  useEffect(() => {
    document.body.classList.toggle('has-mini-player', visible);
    return () => {
      document.body.classList.remove('has-mini-player');
    };
  }, [visible]);

  if (!visible || !currentTrack) return null;

  const isLive = Boolean(currentTrack.isLive);
  const hasPrev = !isLive && currentIndex > 0;
  const hasNext = !isLive && currentIndex >= 0 && currentIndex + 1 < queue.length;
  const isPlayingOrLoading = status === 'playing' || status === 'loading';
  const progressPct = !isLive && duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <aside className="mini-audio-player" dir="rtl" aria-label="مشغّل الصوت في الخلفية">
      {!isLive && duration > 0 && (
        <div className="mini-audio-progress" aria-hidden="true">
          <span style={{ width: `${progressPct}%` }} />
        </div>
      )}
      <div className="mini-audio-row">
        <button
          type="button"
          className="mini-audio-meta"
          onClick={() => category && onOpenCategory(category)}
          title="الانتقال إلى القسم"
        >
          <span className={`mini-audio-badge ${currentTrack.category}`}>
            <CategoryIcon category={currentTrack.category} />
          </span>
          <span className="mini-audio-text">
            <strong>{currentTrack.title}</strong>
            <small>
              {status === 'error' && error
                ? error
                : status === 'loading'
                  ? 'جارٍ التحميل…'
                  : isLive
                    ? `بث مباشر • ${currentTrack.subtitle ?? ''}`
                    : (
                      <>
                        {currentTrack.subtitle ?? ''}
                        {duration > 0 && (
                          <>
                            {' • '}
                            <span className="mini-audio-clock" dir="ltr">{formatAudioClock(Math.min(currentTime, duration))} / {formatAudioClock(duration)}</span>
                          </>
                        )}
                      </>
                    )}
            </small>
          </span>
        </button>

        <div className="mini-audio-controls">
          {!isLive && queue.length > 1 && (
            <button
              type="button"
              className="mini-audio-btn"
              onClick={() => void backgroundAudio.previous()}
              disabled={!hasPrev}
              aria-label="المقطع السابق"
              title="السابق"
            >
              <SkipForward size={16} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            className="mini-audio-btn primary"
            onClick={() => void backgroundAudio.togglePlayPause()}
            aria-label={isPlayingOrLoading ? 'إيقاف مؤقت' : 'تشغيل'}
            title={isPlayingOrLoading ? 'إيقاف مؤقت' : 'تشغيل'}
          >
            {status === 'loading'
              ? <Loader2 size={17} className="mini-audio-spin" aria-hidden="true" />
              : status === 'playing'
                ? <Pause size={17} aria-hidden="true" />
                : <Play size={17} aria-hidden="true" />}
          </button>

          {!isLive && queue.length > 1 && (
            <button
              type="button"
              className="mini-audio-btn"
              onClick={() => void backgroundAudio.next()}
              disabled={!hasNext}
              aria-label="المقطع التالي"
              title="التالي"
            >
              <SkipBack size={16} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            className="mini-audio-btn close"
            onClick={() => void backgroundAudio.stop()}
            aria-label="إيقاف وإغلاق المشغّل"
            title="إغلاق"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
