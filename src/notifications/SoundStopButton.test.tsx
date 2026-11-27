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
  it('renders nothing when no sound is playing', () => {
    expect(renderToStaticMarkup(<SoundStopButton/>)).toBe('');
  });
});
