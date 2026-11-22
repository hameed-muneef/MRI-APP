// AudioDiagnostics — الشاشة التشخيصية للصوت (سأرسل أخطاءها إليك).
import {useEffect, useState} from 'react';
import {ChevronsRight, Play, Settings, Signal} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {backgroundAudio} from '../audio/background-player';
import {isNativeBackgroundAudioSupported, getNativeBackgroundAudioPlugin} from '../audio/native-bridge';
import {playBuiltInTone} from '../notifications/builtin-sounds';
import type {AudioTrack, AudioCategory} from '../audio/types';

interface DiagInfo {
  status: string; category: string | null; currentTrack: AudioTrack | null;
  currentTime: number; duration: number; error: string | null; queueLength: number;
  volumeL?: number; volumeR?: number; hasFocus?: boolean; prepared?: boolean;
  audioVolumeMusic?: number; audioVolumeMaxMusic?: number;
  audioVolumeWeb?: number;
}

interface Item {
  id: string; label: string; url: string; category: AudioCategory;
  note?: string;
}

export default function AudioDiagnostics() {
  const [diag, setDiag] = useState<DiagInfo | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const items: Item[] = [
    {id: 'quran', label: 'قراءة قرآن (صوت مذاقرشم)', url: 'https://api.quran.com/api/v4/chapter_recitations/1/1', category: 'quran'},
    {id: 'adhan', label: 'أذان (الملا)', url: '/sounds/adhan/adhan_almulla.ogg', category: 'quran'},
    {id: 'azkar', label: 'أذكار', url: 'builtin:chime', category: 'azkar', note: 'نغمة مدمجة (Web Audio API)'},
    {id: 'hls', label: 'بث مباشر الحرمين (HLS)', url: 'https://aloula.sba.sa/live/quran?embed=true', category: 'haramain'},
  ];

  const refresh = () => {
    const plugin = getNativeBackgroundAudioPlugin();
    if (plugin) void plugin.diagnosticInfo().then(setDiag).catch(() => {});
    else {
      const audio = document.querySelector<HTMLAudioElement>('audio');
      const vol = audio && Number.isFinite(audio.volume) ? audio.volume : -1;
      const err = audio?.error ? `MediaError code=${audio.error.code}` : null;
      setDiag({status: 'web', category: null, currentTrack: audio ? {id: audio.src || '-', title: 'HTMLAudioElement', url: audio.src, category: 'quran', isLive: false} : null, currentTime: audio?.currentTime ?? 0, duration: audio?.duration ?? 0, error: err, queueLength: 0, volumeL: vol, volumeR: vol, prepared: Boolean(audio), hasFocus: false, audioVolumeWeb: vol});
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { const t = setInterval(refresh, 1500); return () => clearInterval(t); }, []);

  const playTest = async (item: Item) => {
    setPlaying(item.id);
    setNote('');
    try {
      if (item.url.startsWith('builtin:')) {
        const ok = playBuiltInTone(item.url);
        setNote(ok ? 'جارٍ النغمة المدمجة (Web Audio API).' : 'لا يوجد AudioContext على هذا الجهاز.');
      } else {
        const track: AudioTrack = {id: item.id, title: item.label, url: item.url, category: item.category, isLive: item.category === 'haramain'};
        const plugin = getNativeBackgroundAudioPlugin();
        if (plugin) await plugin.playSingle(track);
        else await backgroundAudio.playSingle(track);
        setTimeout(refresh, 4000);
      }
    } catch (e) {
      setNote(`Play test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setPlaying(null), 12000);
    }
  };

  const openChannelSettings = async () => {
    const plugin = getNativeBackgroundAudioPlugin();
    if (plugin) { try { await plugin.openAdhanChannelSettings(); } catch {} }
    setNote('تم فتح إعدادات قناة الأذان (إذا كان الجهاز يدعمها).');
  };

  const statusColor = (s: string | undefined) => !s ? '·' : s === 'playing' || s === 'loading' ? '<b style="color:#16A34A">جارٍ</b>' : s === 'paused' ? '<b style="color:#D97706">متوقف</b>' : s === 'error' ? '<b style="color:#DC2626">خطأ</b>' : '<b style="color:#64748B">خامل</b>';

  return (
    <div className="panel">
      <div className="page-intro">
        <span className="eyebrow">أصلح الصوت</span>
        <h1>شاشة تشخيص الصوت (Audio Diagnostics)</h1>
        <p style={{color:'var(--color-ink)'}}>
          عند الانتهاء، أرسل لي لقطة شاشة على الجهاز — يجب أن تُظهر:
          <br/>• <strong>Engine status / status</strong>: الحالة (Playing / Paused / Error / Idle)
          <br/>• <strong>Volume</strong>: المستوى المستخدم (MediaPlayer.setVolume) + "صوت AudioManager (STREAM_MUSIC)"
          <br/>• <strong>error</strong>: رسالة الخطأ (إن وُجدت)
          <br/>• <strong>LATENC/READY</strong>: <code>currentTime/duration</code> لو المشغل الحقيقي يملأه
          <br/>• <strong>Play test</strong>: زر "اختبار" لكل صندوق — انقره على جهازك
          <br/>• <strong>URL/path</strong>: الرابط أو المسار الحقيقي لكل صندوق
        </p>
      </div>

      <h2 style={{marginTop: 8}}>🔊 محرّك التشغيل والمستوى</h2>
      <p>المحرّك: <strong>{isNativeBackgroundAudioSupported() ? 'Native (Android — MediaPlayer + AudioManager)' : 'Web (HTMLAudioElement)'}</strong></p>
      {diag && (
        <table style={{width:'100%', borderCollapse:'collapse', marginTop: 10}}>
          <tbody>
            <tr><td style={{padding:'4px 8px', fontWeight:500}}>الحالة (Native status)</td><td>{statusColor(diag.status)}</td></tr>
            <tr><td style={{padding:'4px 8px', fontWeight:500}}>المستوى المستخدم (MediaPlayer.setVolume)</td><td>{diag.volumeL !== undefined ? `${diag.volumeL.toFixed(2)}/${diag.volumeR?.toFixed(2) ?? '?'}` : 'N/A'}</td></tr>
            <tr><td style={{padding:'4px 8px', fontWeight:500}}>صوت AudioManager (STREAM_MUSIC)</td><td>{diag.audioVolumeMusic ?? 'N/A'}/{diag.audioVolumeMaxMusic ?? '?'}</td></tr>
            <tr><td style={{padding:'4px 8px', fontWeight:500}}>audio focus</td><td>{diag.hasFocus ? 'مسموح ✓' : 'قيد ❌'}</td></tr>
            <tr><td style={{padding:'4px 8px', fontWeight:500}}>الخطأ الحالي (error)</td><td>{diag.error ?? '-'}</td></tr>
          </tbody>
        </table>
      )}
      <p style={{marginTop: 10}}><button type="button" className="soft-btn" onClick={refresh}>↻ تحديث</button></p>

      <h2 style={{marginTop: 16}}>🎧 صناديق الصوت (Play test)</h2>
      {items.map(item => (
        <div key={item.id} style={{marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.08)'}}>
          <p><strong>{item.label}</strong>{item.note ? ` — ${item.note}` : ''}</p>
          <p className="muted" style={{wordBreak:'break-all'}}>{item.url}</p>
          <button type="button" className="primary" disabled={playing === item.id} onClick={() => void playTest(item)}>
            {playing === item.id ? <><ChevronsRight size={15}/> جارٍ...</> : <><Play size={15}/> اختبار</>}
          </button>
          {playing === item.id && diag?.currentTrack?.url && <p className="muted small">URL الحالي: {diag.currentTrack.url}</p>}
        </div>
      ))}

      <h2 style={{marginTop: 18}}>🔔 تجربة إشعار الأذان</h2>
      <button type="button" className="primary" onClick={() => { const p = getNativeBackgroundAudioPlugin(); if (p) void p.testAdhanNotification().catch(() => {}); setNote('أرسلنا إشعار تجريبي — تحقق في status.'); }}>
        <Signal size={16}/> تجربة الأذان بعد 10 ثوانٍ
      </button>
      <p style={{marginTop: 8}}><button type="button" className="soft-btn" onClick={() => void openChannelSettings()}><Settings size={14}/> فتح إعدادات قناة الأذان</button></p>

      {note && <p style={{color:'#D97706', marginTop: 10}}>{note}</p>}
      <div style={{height: 24}} />
      <p className="small muted"><strong>محتاج إصدار?</strong> {Capacitor.isNativePlatform() ? 'Native — إذا كانت الشاشة فارغة خارج التطبيق، أخبرني.' : 'Browser mode.'}</p>
    </div>
  );
}
