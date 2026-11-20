// يولّد أيقونات وشاشات الإقلاع لتطبيق الأندرويد (Capacitor) مباشرة باستخدام sharp:
//   - assets/logo.png (1024×1024) و assets/splash.png (2732×2732)
//   - android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground,_background}.png
//   - android/app/src/main/res/drawable{,-port-*,-land-*}/splash.png
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const GREEN = '#173F35';
const RES_DIR = path.join('android', 'app', 'src', 'main', 'res');
const source = await readFile('public/icons/app-icon.svg', 'utf8');

// خلفية خضراء ممتدة بلا زوايا دائرية + الشعار مصغّر داخل المنطقة الآمنة
const fullBleedSvg = source
  .replace('<rect width="512" height="512" rx="96" fill="#173F35"/>', '<rect width="512" height="512" fill="#173F35"/>')
  .replace(/(<path d="M256 150)/, '<g transform="translate(256 256) scale(0.62) translate(-256 -256)">$1')
  .replace(/(<\/svg>)/, '</g>$1');

// طبقة أمامية شفافة للأيقونة التكيّفية (داخل المنطقة الآمنة ~62% من لوحة 108dp)
const foregroundOnlySvg = source
  .replace('<rect width="512" height="512" rx="96" fill="#173F35"/>', '')
  .replace(/(<path d="M256 150)/, '<g transform="translate(256 256) scale(0.62) translate(-256 -256)">$1')
  .replace(/(<\/svg>)/, '</g>$1');

// أيقونة قديمة (API 24–25) بزوايا دائرية ناعمة على خلفية شفافة
const legacySquareSvg = source
  .replace(/(<path d="M256 150)/, '<g transform="translate(256 256) scale(0.84) translate(-256 -256)">$1')
  .replace(/(<\/svg>)/, '</g>$1');

await mkdir('assets', {recursive: true});

await sharp(Buffer.from(fullBleedSvg), {density: 96 * 2})
  .resize(1024, 1024)
  .png()
  .toFile('assets/logo.png');

const splashLogoPng = await sharp(Buffer.from(foregroundOnlySvg), {density: 96 * 2})
  .resize(960, 960)
  .png()
  .toBuffer();
await sharp({
  create: {width: 2732, height: 2732, channels: 4, background: GREEN},
})
  .composite([{input: splashLogoPng, gravity: 'centre'}])
  .png()
  .toFile('assets/splash.png');

const MIPMAP_DENSITIES = [
  {dir: 'mipmap-mdpi', launcher: 48, adaptive: 108},
  {dir: 'mipmap-hdpi', launcher: 72, adaptive: 162},
  {dir: 'mipmap-xhdpi', launcher: 96, adaptive: 216},
  {dir: 'mipmap-xxhdpi', launcher: 144, adaptive: 324},
  {dir: 'mipmap-xxxhdpi', launcher: 192, adaptive: 432},
];

for (const {dir, launcher, adaptive} of MIPMAP_DENSITIES) {
  const outDir = path.join(RES_DIR, dir);
  await mkdir(outDir, {recursive: true});

  await sharp(Buffer.from(legacySquareSvg), {density: 192})
    .resize(launcher, launcher)
    .png()
    .toFile(path.join(outDir, 'ic_launcher.png'));

  const roundMask = Buffer.from(
    `<svg width="${launcher}" height="${launcher}" viewBox="0 0 ${launcher} ${launcher}"><circle cx="${launcher / 2}" cy="${launcher / 2}" r="${launcher / 2}" fill="#fff"/></svg>`,
  );
  await sharp(Buffer.from(fullBleedSvg), {density: 192})
    .resize(launcher, launcher)
    .composite([{input: roundMask, blend: 'dest-in'}])
    .png()
    .toFile(path.join(outDir, 'ic_launcher_round.png'));

  await sharp(Buffer.from(foregroundOnlySvg), {density: 288})
    .resize(adaptive, adaptive)
    .png()
    .toFile(path.join(outDir, 'ic_launcher_foreground.png'));

  await sharp({
    create: {width: adaptive, height: adaptive, channels: 4, background: GREEN},
  })
    .png()
    .toFile(path.join(outDir, 'ic_launcher_background.png'));
}

const SPLASH_TARGETS = [
  {dir: 'drawable', width: 1280, height: 1280},
  {dir: 'drawable-port-mdpi', width: 320, height: 480},
  {dir: 'drawable-port-hdpi', width: 480, height: 800},
  {dir: 'drawable-port-xhdpi', width: 720, height: 1280},
  {dir: 'drawable-port-xxhdpi', width: 960, height: 1600},
  {dir: 'drawable-port-xxxhdpi', width: 1280, height: 1920},
  {dir: 'drawable-land-mdpi', width: 480, height: 320},
  {dir: 'drawable-land-hdpi', width: 800, height: 480},
  {dir: 'drawable-land-xhdpi', width: 1280, height: 720},
  {dir: 'drawable-land-xxhdpi', width: 1600, height: 960},
  {dir: 'drawable-land-xxxhdpi', width: 1920, height: 1280},
];

for (const {dir, width, height} of SPLASH_TARGETS) {
  const outDir = path.join(RES_DIR, dir);
  await mkdir(outDir, {recursive: true});
  const markSize = Math.round(Math.min(width, height) * 0.42);
  const markBuf = await sharp(Buffer.from(foregroundOnlySvg), {density: 288})
    .resize(markSize, markSize)
    .png()
    .toBuffer();

  await sharp({
    create: {width, height, channels: 4, background: GREEN},
  })
    .composite([{input: markBuf, gravity: 'centre'}])
    .png()
    .toFile(path.join(outDir, 'splash.png'));
}

console.log(`generated Capacitor Android assets: ${MIPMAP_DENSITIES.length} mipmap densities & ${SPLASH_TARGETS.length} splash screens.`);
