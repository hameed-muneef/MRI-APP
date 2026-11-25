import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {isSupportedAudioFile, resolveSoundCategory} from '../../sounds/custom-store';
import {clearCustomSoundUrls, planSound, setCustomSoundUrl} from '../../notifications/sound-selection';
import SoundPanel, {SoundSelectField} from './SoundPanel';

describe('custom sound classification & import validation', () => {
  afterEach(() => {
    clearCustomSoundUrls();
  });

  it('accepts standard audio MIME types and audio extensions even when MIME type is empty', () => {
    expect(isSupportedAudioFile({name: 'adhan.mp3', type: 'audio/mpeg'})).toBe(true);
    expect(isSupportedAudioFile({name: 'tone.m4a', type: 'audio/x-m4a'})).toBe(true);
    expect(isSupportedAudioFile({name: 'takbeer.ogg', type: 'application/ogg'})).toBe(true);
    expect(isSupportedAudioFile({name: 'custom-tone.m4a', type: ''})).toBe(true);
    expect(isSupportedAudioFile({name: 'voice.wav', type: ''})).toBe(true);
    expect(isSupportedAudioFile({name: 'notes.txt', type: 'text/plain'})).toBe(false);
    expect(isSupportedAudioFile({name: 'image.png', type: 'image/png'})).toBe(false);
  });

  it('resolves explicit categories and backward-compatible legacy slots', () => {
    expect(resolveSoundCategory({slot: 'library:item:1', category: 'adhan'})).toBe('adhan');
    expect(resolveSoundCategory({slot: 'library:item:2', category: 'takbeer'})).toBe('takbeer');
    expect(resolveSoundCategory({slot: 'library:item:3', category: 'general'})).toBe('general');
    expect(resolveSoundCategory({slot: 'adhan:item:legacy'})).toBe('adhan');
    expect(resolveSoundCategory({slot: 'adhan'})).toBe('adhan');
    expect(resolveSoundCategory({slot: 'alarm'})).toBe('general');
  });

  it('plans playback for registered imported sounds and Eid Takbeerat', () => {
    setCustomSoundUrl('library:item:custom-1', 'blob:https://example.test/abc');
    expect(planSound('library:item:custom-1', [], 'builtin:chime')).toEqual({
      mode: 'file',
      id: 'library:item:custom-1',
      url: 'blob:https://example.test/abc',
    });
    expect(planSound('takbeer:eid', [], 'builtin:chime')).toEqual({
      mode: 'file',
      id: 'takbeer:eid',
      url: '/sounds/adhan/takbeerat_eid.ogg',
    });
  });

  it('renders SoundPanel with classification tabs, Eid Takbeerat, bundled Adhan, general tones, and import controls', () => {
    const html = renderToStaticMarkup(<SoundPanel notify={vi.fn()}/>);
    expect(html).toContain('الكل');
    expect(html).toContain('أذان');
    expect(html).toContain('تكبيرات');
    expect(html).toContain('نغمات عامة');
    expect(html).toContain('تكبيرات العيد');
    expect(html).toContain('أذان الحرم المدني');
    expect(html).toContain('نغمة جرس هادئة');
    expect(html).toContain('تصنيف الصوت عند الاستيراد');
    expect(html).toContain('استيراد نغمة أو صوت');
  });

  it('renders grouped sound options in SoundSelectField', () => {
    const html = renderToStaticMarkup(<SoundSelectField value="" onChange={vi.fn()}/>);
    expect(html).toContain('<optgroup label="أذان">');
    expect(html).toContain('<optgroup label="تكبيرات">');
    expect(html).toContain('<optgroup label="نغمات عامة">');
    expect(html).toContain('تكبيرات العيد');
  });
});
