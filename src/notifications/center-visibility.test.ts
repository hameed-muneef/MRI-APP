import {describe,expect,it} from 'vitest';
import {notificationCenterVisibility} from './center-visibility';

describe('notification center visibility',()=>{
  it('keeps the bell visible when notifications are switched off',()=>{
    expect(notificationCenterVisibility({enabled:false})).toEqual({bell:true,panel:'preferences-off'});
  });
  it('shows the normal panel when the preference is on, missing or not a boolean',()=>{
    expect(notificationCenterVisibility({enabled:true}).panel).toBe('ready');
    expect(notificationCenterVisibility({}).panel).toBe('ready');
    expect(notificationCenterVisibility(null).panel).toBe('ready');
    expect(notificationCenterVisibility(undefined).panel).toBe('ready');
    expect(notificationCenterVisibility({enabled:'false'}).panel).toBe('ready');
  });
  it('never hides the bell, so the center stays reachable',()=>{
    for(const prefs of [{enabled:false},{enabled:true},{},null,undefined]) {
      expect(notificationCenterVisibility(prefs as Record<string,unknown>|null|undefined).bell).toBe(true);
    }
  });
});
