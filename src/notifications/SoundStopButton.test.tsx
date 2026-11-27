import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import SoundStopButton, {isStoppableAudio} from './SoundStopButton';

describe('SoundStopButton', () => {
  it('is stoppable only while a real alert sound is playing', () => {
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: 'https://x/adhan.mp3'})).toBe(true);
    expect(isStoppableAudio({paused: true, ended: false, currentSrc: 'https://x/adhan.mp3'})).toBe(false);
    expect(isStoppableAudio({paused: false, ended: true, currentSrc: 'https://x/adhan.mp3'})).toBe(false);
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: ''})).toBe(false);
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: 'data:audio/wav;base64,AAAA'})).toBe(false);
  });
  it('stays available for every way an adhan or alarm actually plays', () => {
    // ملف الأذان من أصول التطبيق على المتصفح
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: 'http://localhost:3000/sounds/adhan/adhan_hadrawi.ogg'})).toBe(true);
    // نفس الملف داخل WebView أندرويد يُحمَّل عبر blob:
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: 'blob:http://localhost/0d1f'})).toBe(true);
    // تسجيل من مكتبة السحابة
    expect(isStoppableAudio({paused: false, ended: false, currentSrc: 'https://cdn.example/adhan.mp3'})).toBe(true);
  });

  it('hides once the sound stopped or finished on its own', () => {
    expect(isStoppableAudio({paused: true, ended: false, currentSrc: 'https://cdn.example/adhan.mp3'})).toBe(false);
    expect(isStoppableAudio({paused: true, ended: true, currentSrc: 'https://cdn.example/adhan.mp3'})).toBe(false);
  });

  it('renders nothing when no sound is playing', () => {
    expect(renderToStaticMarkup(<SoundStopButton/>)).toBe('');
  });
});
