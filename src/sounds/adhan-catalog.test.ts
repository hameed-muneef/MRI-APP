import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BUNDLED_ADHAN_SOUNDS,
  DEFAULT_ADHAN_ID,
  EID_TAKBEERAT_SOUND,
  findOrdinaryAdhan,
  resolvePrayerAdhan,
} from './adhan-catalog';

const sha256 = (filePath: string) =>
  createHash('sha256').update(readFileSync(filePath)).digest('hex');

describe('adhan-catalog', () => {
  it('contains the 12 official ordinary Adhan recordings with Arabic labels and Android raw filenames', () => {
    expect(BUNDLED_ADHAN_SOUNDS).toHaveLength(12);
    expect(BUNDLED_ADHAN_SOUNDS.map((s) => s.rawName)).toEqual([
      'adhan_almulla',
      'adhan_ahmad',
      'adhan_madinah',
      'adhan_madinah2',
      'adhan_mohammed',
      'adhan_hamad',
      'adhan_alafasy',
      'adhan_qatami',
      'adhan_hamathani',
      'adhan_hadrawi',
      'adhan_zubaidi',
      'adhan_aqsa',
    ]);
    for (const entry of BUNDLED_ADHAN_SOUNDS) {
      expect(entry.isEidTakbeer).toBe(false);
      expect(entry.fileName).toBe(`${entry.rawName}.ogg`);
      expect(entry.url).toBe(`/sounds/adhan/${entry.fileName}`);
      expect(entry.name.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(BUNDLED_ADHAN_SOUNDS.map((s) => s.fileName)).size).toBe(12);
    expect(new Set(BUNDLED_ADHAN_SOUNDS.map((s) => s.url)).size).toBe(12);
  });

  it('has 12 unique on-disk OGG files matching between public/sounds/adhan and android res/raw', () => {
    const publicHashes = new Set<string>();
    const rawHashes = new Set<string>();

    for (const entry of BUNDLED_ADHAN_SOUNDS) {
      const publicPath = resolve(process.cwd(), 'public/sounds/adhan', entry.fileName);
      const rawPath = resolve(process.cwd(), 'android/app/src/main/res/raw', entry.fileName);
      expect(existsSync(publicPath)).toBe(true);
      expect(existsSync(rawPath)).toBe(true);

      const pHash = sha256(publicPath);
      const rHash = sha256(rawPath);
      expect(rHash).toBe(pHash);
      publicHashes.add(pHash);
      rawHashes.add(rHash);
    }

    expect(publicHashes.size).toBe(12);
    expect(rawHashes.size).toBe(12);

    const eidPublicPath = resolve(process.cwd(), 'public/sounds/adhan', EID_TAKBEERAT_SOUND.fileName);
    const eidRawPath = resolve(process.cwd(), 'android/app/src/main/res/raw', EID_TAKBEERAT_SOUND.fileName);
    expect(existsSync(eidPublicPath)).toBe(true);
    expect(existsSync(eidRawPath)).toBe(false);
  });

  it('keeps Eid Takbeerat separated and never resolves it as an ordinary prayer Adhan', () => {
    expect(EID_TAKBEERAT_SOUND.isEidTakbeer).toBe(true);
    expect(EID_TAKBEERAT_SOUND.rawName).toBe('takbeerat_eid');
    expect(EID_TAKBEERAT_SOUND.name).toBe('تكبيرات العيد');

    expect(findOrdinaryAdhan('eid')).toBeUndefined();
    expect(findOrdinaryAdhan('takbeer:eid')).toBeUndefined();
    expect(findOrdinaryAdhan('takbeerat_eid')).toBeUndefined();

    const resolvedFromEid = resolvePrayerAdhan('takbeer:eid', DEFAULT_ADHAN_ID);
    expect(resolvedFromEid.id).toBe('almulla');
    expect(resolvedFromEid.rawName).toBe('adhan_almulla');
  });

  it('resolves ordinary Adhans by id, soundId, or rawName', () => {
    expect(findOrdinaryAdhan('madinah')?.name).toBe('أذان الحرم المدني');
    expect(findOrdinaryAdhan('adhan:madinah2')?.rawName).toBe('adhan_madinah2');
    expect(findOrdinaryAdhan('adhan_hamad')?.id).toBe('hamad');
    expect(findOrdinaryAdhan('adhan:alafasy')?.rawName).toBe('adhan_alafasy');
    expect(findOrdinaryAdhan('qatami')?.name).toBe('ناصر القطامي');
    expect(findOrdinaryAdhan('adhan:hadrawi')?.rawName).toBe('adhan_hadrawi');
    expect(findOrdinaryAdhan('adhan_aqsa')?.id).toBe('aqsa');

    expect(resolvePrayerAdhan('adhan:ahmad', 'almulla').rawName).toBe('adhan_ahmad');
    expect(resolvePrayerAdhan('builtin:chime', 'mohammed').rawName).toBe('adhan_mohammed');
    expect(resolvePrayerAdhan('builtin:chime', 'alafasy').rawName).toBe('adhan_alafasy');
  });
});
