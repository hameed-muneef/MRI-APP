import {describe, expect, it} from 'vitest';
import {withSnoozeMinutes} from '../lib/settings-opener';

// سيناريو: المستخدم يضبط «مدة الغفوة» على ٢٥ دقيقة، فيجب أن تحملها حمولة المنبّه الأصلي
// كي يكتب زر «تأجيل» الرقم نفسه ويؤجّل به فعلًا.
describe('native queue snooze minutes', () => {
  it('adds the configured delay to every queued alert', () => {
    const rows = withSnoozeMinutes([
      {id: 1, at: 10, title: 't', body: 'b', channelId: 'c'},
      {id: 2, at: 20, title: 't2', body: 'b2', channelId: 'c'},
    ], 25);
    expect(rows.map(r => r.snoozeMinutes)).toEqual([25, 25]);
    expect(rows[0]).toMatchObject({id: 1, title: 't', body: 'b', channelId: 'c'});
  });

  it('keeps the delay inside the range the settings screen allows', () => {
    expect(withSnoozeMinutes([{id: 1}], 0)[0].snoozeMinutes).toBe(1);
    expect(withSnoozeMinutes([{id: 1}], 500)[0].snoozeMinutes).toBe(120);
    expect(withSnoozeMinutes([{id: 1}], Number.NaN)[0].snoozeMinutes).toBe(10);
  });
});
