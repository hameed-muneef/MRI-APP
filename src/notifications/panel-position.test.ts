import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// حماية من علة ظهرت فعلًا: `inset-inline: auto` داخل قاعدة لوح الإشعارات يصفّر
// `left` في RTL، فيُثبَّت اللوح خارج الشاشة ولا يرى المستخدم شيئًا عند الضغط على الجرس.
// الاختبار يقرأ ملفات CSS نفسها لأن العلة لا تظهر في أي اختبار وظيفي.
const FILES = ['../notifications.css', '../ui-hardening.css', '../premium-theme.css', '../theme-engine.css'];

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** يعيد كل قاعدة تحتوي على محدد .notif-panel كنص واحد */
const panelRules = (css: string): string[] =>
  stripComments(css)
    .split('}')
    .map(part => part.trim())
    .filter(part => part.includes('.notif-panel'));

describe('notification panel positioning', () => {
  it('لا تصفّر أي قاعدة للوح الإشعارات أطرافًا منطقية', () => {
    const offenders: string[] = [];
    for (const relative of FILES) {
      const css = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
      for (const rule of panelRules(css)) {
        if (/inset-inline\s*:\s*auto/.test(rule)) offenders.push(`${relative}: ${rule.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('توسّط اللوح بأطراف فيزيائية صريحة', () => {
    const css = readFileSync(fileURLToPath(new URL('../ui-hardening.css', import.meta.url)), 'utf8');
    const rule = panelRules(css).find(part => part.includes('position: fixed'));
    expect(rule).toBeTruthy();
    expect(rule).toContain('left: 50%');
    expect(rule).toContain('translateX(-50%)');
  });
});
