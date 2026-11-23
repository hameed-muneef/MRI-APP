// محوّل الصوت الموحّد (Phase 3): مالك تشغيل واحد فوق مشغّل الخلفية الموجود.
// - خريطة قدرات لكل مصدر.
// - إلغاء الطلبات القديمة عند تغيير القارئ أو إيقاف الجلسة.
// - آية مفقودة الصوت = خطأ صريح، ولا تُتجاوز أبدًا ولا يُستبدل مصدرها.
// - الرواية: يُقبل فقط قراء حفص المعتمدون للنص المعروض؛ غيرهم مرفوض لا مستبدَل.
import { backgroundAudio } from '../audio/background-player';
import type { AudioPlayerState, AudioTrack } from '../audio/types';
import { fetchAyahAudioUrl, QURAN_COM_RECITERS } from './ayah-audio';

export type AudioSourceKind = 'qurancom-ayah' | 'everyayah-folder' | 'qurancom-chapter' | 'live-stream';

export type SourceCapability = {
  perAyah: boolean;
  chapter: boolean;
  live: boolean;
  /** هل يمكن معرفة رابط الآية دون شبكة؟ */
  offlineResolution: 'deterministic' | 'api' ;
  notes: string;
};

export const SOURCE_CAPABILITIES: Record<AudioSourceKind, SourceCapability> = {
  'qurancom-ayah': { perAyah: true, chapter: false, live: false, offlineResolution: 'api', notes: 'Quran.com v4 per-ayah; needs network unless cached by the browser store.' },
  'everyayah-folder': { perAyah: true, chapter: false, live: false, offlineResolution: 'deterministic', notes: 'Fixed URL pattern per verse; Hafs compatibility must be verified per folder.' },
  'qurancom-chapter': { perAyah: false, chapter: true, live: false, offlineResolution: 'api', notes: 'Whole-surah mp3; cannot drive per-verse indication.' },
  'live-stream': { perAyah: false, chapter: false, live: true, offlineResolution: 'api', notes: 'Live radio; no verse mapping at all.' },
};

/** قراء Quran.com المعتمدون كلهم على رواية حفص (القائمة المصدرية في ayah-audio.ts). */
const HAFS_QURANCOM_IDS = new Set(QURAN_COM_RECITERS.map((r) => r.id));

export function isHafsQuranComReciter(recitationId: number): boolean {
  return HAFS_QURANCOM_IDS.has(recitationId);
}

export type VersePlayResult = 'ended' | 'cancelled' | 'preempted' | 'error' | 'missing' | 'rejected-narration';

/** أصغر واجهة يحتاجها المحوّل؛ قابلة للحقن في الاختبارات. */
export interface PlaybackOwner {
  getState(): AudioPlayerState;
  subscribe(listener: (s: AudioPlayerState) => void): () => void;
  playQueue(tracks: AudioTrack[], startIndex?: number, category?: AudioTrack['category']): Promise<void>;
  stop(): Promise<void>;
  pause?():Promise<void>;
  resume?():Promise<void>;
  setPlaybackRate?(rate:number):boolean;
  supportsPlaybackRate?():boolean;
}

export const SESSION_AUDIO_OWNER = 'mastery-session';

type PlayVerseArgs = { reciterId: number; surah: number; ayah: number; title: string;playbackRate?:number };

export class SessionAudioAdapter {
  private token = 0;
  private paused=false;
  private releasePause:(()=>void)|null=null;
  supportsPlaybackRate(){return this.player.supportsPlaybackRate?.()??false;}
  setPlaybackRate(rate:number){if(!Number.isFinite(rate)||rate<.5||rate>2)return false;if(!this.owns(this.player.getState()))return true;return this.player.setPlaybackRate?.(rate)??false;}
  async pause(){this.paused=true;if(this.owns(this.player.getState()))await this.player.pause?.();}
  async resume(){this.paused=false;this.releasePause?.();this.releasePause=null;if(this.owns(this.player.getState()))await this.player.resume?.();}
  private controller: AbortController | null = null;
  private settle: ((result: VersePlayResult) => void) | null = null;

  constructor(private readonly player: PlaybackOwner = backgroundAudio) {}

  capabilities(): Record<AudioSourceKind, SourceCapability> {
    return SOURCE_CAPABILITIES;
  }

  private owns(state: AudioPlayerState): boolean {
    return state.currentTrack?.meta?.owner === SESSION_AUDIO_OWNER;
  }

  /** إلغاء أي طلب جارٍ وإيقاف تشغيل نملكه فقط؛ لا نوقف صوت القارئ الذي لا نملكه. */
  cancel(): void {
    this.token += 1;
    this.paused=false;this.releasePause?.();this.releasePause=null;
    this.controller?.abort();
    this.settle?.('cancelled');
    this.settle = null;
    if (this.owns(this.player.getState())) void this.player.stop();
  }

  /**
   * تشغيل آية واحدة عبر المشغّل الموحّد.
   * لا يتجاوز الآية عند فقدان الصوت، ولا يستبدل القارئ، ويكشف الاستباق من مصدر آخر.
   */
  async playVerse({ reciterId, surah, ayah, title,playbackRate=1 }: PlayVerseArgs): Promise<VersePlayResult> {
    if (!isHafsQuranComReciter(reciterId)) return 'rejected-narration';
    this.cancel();
    const my = ++this.token;
    this.controller = new AbortController();
    const url = await fetchAyahAudioUrl(reciterId, surah, ayah, this.controller.signal);
    if (my !== this.token) return 'cancelled';
    if (!url) return 'missing';
    if(this.paused)await new Promise<void>(resolve=>{this.releasePause=resolve;});
    if(my!==this.token)return 'cancelled';
    const track: AudioTrack = {
      id: `quran:${SESSION_AUDIO_OWNER}:${surah}:${ayah}:${my}`,
      title,
      subtitle: 'جلسة حفظ ومراجعة',
      url,
      category: 'quran',
      meta: { owner: SESSION_AUDIO_OWNER, surah, ayah, reciterId,playbackRate },
    };
    return new Promise<VersePlayResult>((resolve) => {
      let seenPlaying = false;
      let settled = false;
      const finish = (result: VersePlayResult) => {
        if (settled) return;
        settled = true;
        unsub();
        this.settle = null;
        resolve(result);
      };
      const unsub = this.player.subscribe((state) => {
        if (my !== this.token) return finish('cancelled');
        const current = state.currentTrack;
        if (current?.id === track.id) {
          if (state.status === 'playing') seenPlaying = true;
          if (state.status === 'error') return finish('error');
          return;
        }
        // اختفى مقطعنا: إما انتهى (توقف المشغّل بعد نهايته) أو سبقه مالك آخر.
        if (seenPlaying && state.status === 'idle' && state.completedTrackId === track.id) return finish('ended');
        return finish('preempted');
      });
      this.settle = finish;
      this.player.playQueue([track], 0, 'quran').then(()=>{if(this.paused&&my===this.token)void this.player.pause?.();}).catch(() => finish('error'));
    });
  }
}

export const sessionAudio = new SessionAudioAdapter();

export type SequentialQueue = { tracks: AudioTrack[]; firstMissingAyah: number | null };

/**
 * بناء قائمة تشغيل متتابعة دون تجاوز صامت:
 * تتوقف القائمة عند أول آية بلا صوت ويُبلَّغ عنها صراحة.
 */
export function buildSequentialQueue(args: {
  surah: number;
  surahName: string;
  ayahs: number[];
  urlFor: (ayah: number) => string | undefined;
  owner: string;
  titleFor: (ayah: number) => string;
}): SequentialQueue {
  const tracks: AudioTrack[] = [];
  let firstMissingAyah: number | null = null;
  for (const ayah of args.ayahs) {
    const url = args.urlFor(ayah);
    if (!url) {
      firstMissingAyah = ayah;
      break;
    }
    tracks.push({
      id: `quran:${args.owner}:${args.surah}:${ayah}`,
      title: args.titleFor(ayah),
      subtitle: 'تلاوة متتابعة',
      url,
      category: 'quran',
      meta: { owner: args.owner, mode: args.owner, surah: args.surah, ayah },
    });
  }
  return { tracks, firstMissingAyah };
}
