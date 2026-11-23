import {it,expect,vi,afterEach} from 'vitest';
import {loadPrefs,loadReminders} from './prefs-store';
afterEach(()=>vi.unstubAllGlobals());
it('drops malformed recurrence config instead of crashing the scheduler',async()=>{
 vi.stubGlobal('window',{localStorage:{getItem:()=>JSON.stringify([{id:'bad',title:'Bad',scheduled_at:'2026-11-23',recurrence:'weekdays',recurrence_config:{days_of_week:'Monday'}}])}});
 expect((await loadReminders()).reminders).toEqual([]);
});
it('falls back for malformed preference branches',async()=>{
 vi.stubGlobal('window',{localStorage:{getItem:()=>JSON.stringify({prayer_settings:{'الفجر':null},quiet_hours:{start:42}})}});
 const {prefs}=await loadPrefs();expect(prefs.prayer_settings['الفجر'].enabled).toBe(true);
});
it('fills missing per-prayer fields in a partial legacy preference',async()=>{
 vi.stubGlobal('window',{localStorage:{getItem:()=>JSON.stringify({prayer_settings:{'الفجر':{enabled:false}}})}});
 const {prefs}=await loadPrefs();expect(prefs.prayer_settings['الفجر'].enabled).toBe(false);expect(prefs.prayer_settings['الفجر'].adhan_type).toBeTruthy();
});
