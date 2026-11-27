import {describe,expect,it} from 'vitest';
import {suggestionsEnabled} from './types';
import {parseStoredState} from '../state-schema';

describe('suggestions master switch and migration',()=>{
  it('is on when nothing was ever stored',()=>{expect(suggestionsEnabled(undefined)).toBe(true)});
  it('is on for settings that were never touched (no enabledAt)',()=>{expect(suggestionsEnabled({globalEnabled:false})).toBe(true)});
  it('legacy opt-in stays on',()=>{expect(suggestionsEnabled({globalEnabled:true,enabledAt:'2026-11-01'})).toBe(true)});
  it('legacy explicit opt-out stays off',()=>{expect(suggestionsEnabled({globalEnabled:false,enabledAt:'2026-11-01'})).toBe(false)});
  it('explicit mute wins over legacy values',()=>{
    expect(suggestionsEnabled({globalEnabled:true,enabledAt:'2026-11-01',suggestionsMuted:true})).toBe(false);
    expect(suggestionsEnabled({globalEnabled:false,enabledAt:'2026-11-01',suggestionsMuted:false})).toBe(true);
  });
});

describe('suggestionsMuted survives stored-state parsing',()=>{
  it('keeps the flag instead of dropping it',()=>{
    const raw=JSON.stringify({tasks:[],goals:[],wirds:[],reflections:[],lessonStep:0,prayers:{},coachSettings:{globalEnabled:false,suggestionsMuted:true}});
    expect(parseStoredState(raw).coachSettings?.suggestionsMuted).toBe(true);
  });
});

import {migrateSuggestionsDefault,setSuggestionsEnabled} from './types';
describe('default-on migration and switch',()=>{
  it('turns never-touched settings on from today',()=>{
    expect(migrateSuggestionsDefault(undefined,'2026-11-27')).toEqual({globalEnabled:true,enabledAt:'2026-11-27',suggestionsMuted:false});
  });
  it('does not change a legacy opt-out or an explicit choice',()=>{
    const legacy={globalEnabled:false,enabledAt:'2026-11-01'};
    expect(migrateSuggestionsDefault(legacy,'2026-11-27')).toBe(legacy);
    const muted={globalEnabled:false,suggestionsMuted:true};
    expect(migrateSuggestionsDefault(muted,'2026-11-27')).toBe(muted);
  });
  it('keeps unrelated settings when switching',()=>{
    const s=setSuggestionsEnabled({globalEnabled:true,enabledAt:'2026-11-01',dismissedWeekly:['w1'],preferredCapacity:5},false,'2026-11-27');
    expect(s).toMatchObject({globalEnabled:false,suggestionsMuted:true,enabledAt:'2026-11-01',dismissedWeekly:['w1'],preferredCapacity:5});
    expect(suggestionsEnabled(s)).toBe(false);
    expect(suggestionsEnabled(setSuggestionsEnabled(s,true,'2026-11-27'))).toBe(true);
  });
});
