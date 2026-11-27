import {describe, expect, it} from 'vitest';
import {ACTION_SNOOZE, ACTION_STOP, ALERT_ACTION_TYPE_ID, alertActionType, planAlertAction} from './alert-actions';

// سيناريو: تنبيه فوري على أندرويد، والمستخدم يضغط «إيقاف» أو «تأجيل» من الإشعار.
describe('alert action buttons', () => {
  it('offers stop and a snooze button labelled with the configured delay', () => {
    const type = alertActionType(15);
    expect(type.id).toBe(ALERT_ACTION_TYPE_ID);
    expect(type.actions.map(a => a.id)).toEqual([ACTION_STOP, ACTION_SNOOZE]);
    expect(type.actions[0].title).toBe('إيقاف');
    expect(type.actions[1].title).toBe('تأجيل 15 د');
  });

  it('keeps a nonsense delay inside the range the settings screen allows', () => {
    expect(alertActionType(0).actions[1].title).toBe('تأجيل 1 د');
    expect(alertActionType(999).actions[1].title).toBe('تأجيل 120 د');
    expect(alertActionType(Number.NaN).actions[1].title).toBe('تأجيل 10 د');
  });

  it('stop cancels the notification and silences the sound', () => {
    expect(planAlertAction(ACTION_STOP, 77, 1_000, 10)).toEqual({cancelId: 77, stopSound: true});
  });

  it('snooze cancels it and brings the same alert back after the delay', () => {
    expect(planAlertAction(ACTION_SNOOZE, 77, 1_000, 10)).toEqual({cancelId: 77, rescheduleAt: 1_000 + 10 * 60_000, stopSound: true});
    expect(planAlertAction(ACTION_SNOOZE, 5, 0, 120)?.rescheduleAt).toBe(120 * 60_000);
  });

  it('ignores a tap that is not one of our buttons', () => {
    expect(planAlertAction(undefined, 77, 0, 10)).toBeNull();
    expect(planAlertAction('open', 77, 0, 10)).toBeNull();
  });
});
